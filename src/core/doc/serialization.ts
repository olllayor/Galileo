import { documentSchema, type Document } from './types';

export const CURRENT_DOCUMENT_VERSION = 5;

export type DocumentParseResult =
  | { ok: true; doc: Document; warnings: string[] }
  | { ok: false; error: string; details?: string[] };

const validateDocumentIntegrity = (doc: Document): string[] => {
  const errors: string[] = [];
  if (!doc.nodes[doc.rootId]) {
    errors.push('rootId does not exist in nodes');
  }

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.id !== id) {
      errors.push(`node id mismatch: key=${id} node.id=${node.id}`);
    }

    if (node.children) {
      for (const childId of node.children) {
        if (!doc.nodes[childId]) {
          errors.push(`missing child node: ${childId} referenced by ${id}`);
        }
      }
    }
  }

  return errors;
};

const migrateDocument = (raw: unknown): DocumentParseResult => {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Document must be an object' };
  }

  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number') {
    return { ok: false, error: 'Document missing version' };
  }

  if (version > CURRENT_DOCUMENT_VERSION) {
    return { ok: false, error: `Unsupported document version ${version}` };
  }

	const warnings: string[] = [];
	let migrated = raw as Document;

	if (version < CURRENT_DOCUMENT_VERSION) {
		warnings.push(`Document version ${version} < ${CURRENT_DOCUMENT_VERSION}; migrated to ${CURRENT_DOCUMENT_VERSION}`);
		const rawObject = raw as Record<string, unknown>;
		const rawNodes = (rawObject.nodes ?? {}) as Record<string, unknown>;
		const migratedNodes = Object.fromEntries(
			Object.entries(rawNodes).map(([id, node]) => [id, migrateNode(node, version)]),
		);

		migrated = {
			...rawObject,
			version: CURRENT_DOCUMENT_VERSION,
			assets: (raw as { assets?: unknown }).assets ?? {},
			nodes: migratedNodes,
		} as Document;
	}

  const parsed = documentSchema.safeParse(migrated);
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => issue.message);
    return { ok: false, error: 'Document schema validation failed', details };
  }

  const integrityErrors = validateDocumentIntegrity(parsed.data);
  if (integrityErrors.length > 0) {
    return { ok: false, error: 'Document integrity validation failed', details: integrityErrors };
  }

  return { ok: true, doc: parsed.data, warnings };
};

const migrateNode = (rawNode: unknown, version: number): unknown => {
	if (!rawNode || typeof rawNode !== 'object') {
		return rawNode;
	}

	const node = { ...(rawNode as Record<string, unknown>) };

	if (version < 3 && node.type === 'frame' && node.shadowOverflow === undefined) {
		node.shadowOverflow = node.clipContent === true ? 'clipped' : 'visible';
	}

	if (version < 5 && node.vector && typeof node.vector === 'object') {
		node.vector = migrateLegacyVectorData(node.vector);
	}

	return node;
};

const migrateLegacyVectorData = (rawVector: unknown): unknown => {
	if (!rawVector || typeof rawVector !== 'object') {
		return rawVector;
	}

	const vector = { ...(rawVector as Record<string, unknown>) };
	const rawPoints = Array.isArray(vector.points) ? vector.points : [];
	const points = rawPoints
		.map((point, index) => normalizeVectorPoint(point, index))
		.filter((value): value is Record<string, unknown> => Boolean(value));
	const pointIdSet = new Set(points.map((point) => point.id as string));
	const closed = vector.closed === true;
	const segments = normalizeVectorSegments(vector.segments, points, pointIdSet, closed);

	return {
		...vector,
		points,
		segments,
		closed,
	};
};

const normalizeVectorPoint = (rawPoint: unknown, index: number): Record<string, unknown> | null => {
	if (!rawPoint || typeof rawPoint !== 'object') {
		return null;
	}
	const point = rawPoint as Record<string, unknown>;
	const x = typeof point.x === 'number' ? point.x : null;
	const y = typeof point.y === 'number' ? point.y : null;
	if (x === null || y === null) {
		return null;
	}

	const normalizeHandle = (value: unknown): Record<string, number> | undefined => {
		if (!value || typeof value !== 'object') return undefined;
		const handle = value as Record<string, unknown>;
		if (typeof handle.x !== 'number' || typeof handle.y !== 'number') return undefined;
		return { x: handle.x, y: handle.y };
	};

	const cornerMode =
		point.cornerMode === 'sharp' ||
		point.cornerMode === 'mirrored' ||
		point.cornerMode === 'asymmetric' ||
		point.cornerMode === 'disconnected'
			? point.cornerMode
			: 'sharp';

	return {
		id: typeof point.id === 'string' && point.id.length > 0 ? point.id : `pt_${index}`,
		x,
		y,
		cornerMode,
		...(normalizeHandle(point.inHandle) ? { inHandle: normalizeHandle(point.inHandle) } : {}),
		...(normalizeHandle(point.outHandle) ? { outHandle: normalizeHandle(point.outHandle) } : {}),
	};
};

const normalizeVectorSegments = (
	rawSegments: unknown,
	points: Record<string, unknown>[],
	pointIdSet: Set<string>,
	closed: boolean,
): Array<{ id: string; fromId: string; toId: string }> => {
	const fallback = (): Array<{ id: string; fromId: string; toId: string }> => {
		if (points.length < 2) return [];
		const generated: Array<{ id: string; fromId: string; toId: string }> = [];
		for (let i = 0; i < points.length - 1; i++) {
			const fromId = points[i].id as string;
			const toId = points[i + 1].id as string;
			generated.push({ id: `seg_${i}`, fromId, toId });
		}
		if (closed) {
			generated.push({
				id: `seg_${generated.length}`,
				fromId: points[points.length - 1].id as string,
				toId: points[0].id as string,
			});
		}
		return generated;
	};

	if (!Array.isArray(rawSegments)) {
		return fallback();
	}

	const normalized = rawSegments
		.map((raw, index) => {
			if (!raw || typeof raw !== 'object') return null;
			const segment = raw as Record<string, unknown>;
			const fromId = typeof segment.fromId === 'string' ? segment.fromId : null;
			const toId = typeof segment.toId === 'string' ? segment.toId : null;
			if (!fromId || !toId || !pointIdSet.has(fromId) || !pointIdSet.has(toId)) return null;
			return {
				id: typeof segment.id === 'string' && segment.id.length > 0 ? segment.id : `seg_${index}`,
				fromId,
				toId,
			};
		})
		.filter((value): value is { id: string; fromId: string; toId: string } => Boolean(value));

	return normalized.length > 0 ? normalized : fallback();
};

export const parseDocumentText = (content: string): DocumentParseResult => {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch (error) {
    return { ok: false, error: 'Invalid JSON document' };
  }

  return migrateDocument(parsedJson);
};

export const serializeDocument = (doc: Document): string => {
  const normalized: Document = {
    ...doc,
    version: CURRENT_DOCUMENT_VERSION,
  };
  return JSON.stringify(normalized, null, 2);
};
