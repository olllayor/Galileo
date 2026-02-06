import { documentSchema, type Document } from './types';

export const CURRENT_DOCUMENT_VERSION = 3;

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

	return node;
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
