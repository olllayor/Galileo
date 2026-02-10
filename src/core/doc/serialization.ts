import {
	documentSchema,
	effectStyleSchema,
	gridStyleSchema,
	paintStyleSchema,
	textStyleSchema,
	type ComponentDefinition,
	type ComponentSet,
	type Document,
	type Node,
	type StyleLibrary,
	type StyleVariableCollection,
	type StyleVariableLibrary,
	type StyleVariableToken,
} from './types';

export const CURRENT_DOCUMENT_VERSION = 9;

export type DocumentParseResult =
  | { ok: true; doc: Document; warnings: string[] }
  | { ok: false; error: string; details?: string[] };

const validateDocumentIntegrity = (doc: Document): string[] => {
  const errors: string[] = [];
  if (!doc.nodes[doc.rootId]) {
    errors.push('rootId does not exist in nodes');
  }
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    errors.push('document must contain at least one page');
    return errors;
  }

  const pageIdSet = new Set<string>();
  const pageRootIdSet = new Set<string>();
  for (const page of doc.pages) {
    if (pageIdSet.has(page.id)) {
      errors.push(`duplicate page id: ${page.id}`);
    }
    pageIdSet.add(page.id);
    if (pageRootIdSet.has(page.rootId)) {
      errors.push(`duplicate page rootId: ${page.rootId}`);
    }
    pageRootIdSet.add(page.rootId);
    if (!doc.nodes[page.rootId]) {
      errors.push(`page rootId does not exist in nodes: ${page.rootId}`);
    }
  }
  if (!pageIdSet.has(doc.activePageId)) {
    errors.push(`activePageId does not exist in pages: ${doc.activePageId}`);
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
		const styles = normalizeStyleLibrary((raw as { styles?: unknown }).styles);
		const variables = normalizeVariableLibrary((raw as { variables?: unknown }).variables, warnings);
		const migratedVariables = migrateLegacyEffectVariablesToVariableLibrary(migratedNodes, variables, warnings);

		migrated = {
			...rawObject,
			version: CURRENT_DOCUMENT_VERSION,
			assets: (raw as { assets?: unknown }).assets ?? {},
			nodes: migratedNodes,
			components:
				version < 7
					? migrateLegacyComponents(migratedNodes)
					: normalizeComponents((raw as { components?: unknown }).components),
			styles,
			variables: migratedVariables,
		} as Document;
	} else {
		migrated = {
			...(raw as Document),
			styles: normalizeStyleLibrary((raw as { styles?: unknown }).styles),
			variables: normalizeVariableLibrary((raw as { variables?: unknown }).variables, warnings),
		};
	}

	migrated = normalizePages(migrated, warnings);

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

const normalizePages = (doc: Document, warnings: string[]): Document => {
	const rawPages = Array.isArray((doc as { pages?: unknown }).pages) ? ((doc as { pages?: unknown }).pages as unknown[]) : [];
	const pages = rawPages
		.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
		.map((page, index) => {
			const id = typeof page.id === 'string' && page.id.trim().length > 0 ? page.id : `page_${index + 1}`;
			const rootId = typeof page.rootId === 'string' && page.rootId.trim().length > 0 ? page.rootId : null;
			const name = typeof page.name === 'string' && page.name.trim().length > 0 ? page.name : `Page ${index + 1}`;
			return {
				id,
				name,
				rootId,
			};
		})
		.filter((page): page is { id: string; name: string; rootId: string } => typeof page.rootId === 'string');

	const legacyRootId =
		typeof (doc as { rootId?: unknown }).rootId === 'string' && (doc as { rootId?: string }).rootId
			? (doc as { rootId: string }).rootId
			: null;

	let normalizedPages = pages.filter((page, index, list) => list.findIndex((candidate) => candidate.id === page.id) === index);
	if (normalizedPages.length !== pages.length) {
		warnings.push('Duplicate page IDs detected; removed duplicates during normalization');
	}

	if (normalizedPages.length === 0) {
		const fallbackRootId = legacyRootId && doc.nodes[legacyRootId] ? legacyRootId : Object.keys(doc.nodes)[0] ?? 'root';
		normalizedPages = [{ id: 'page_1', name: 'Page 1', rootId: fallbackRootId }];
		warnings.push('Document missing pages; synthesized default page');
	}

	const firstValidPage = normalizedPages.find((page) => Boolean(doc.nodes[page.rootId])) ?? normalizedPages[0];
	const filteredPages = normalizedPages.filter((page) => Boolean(doc.nodes[page.rootId]));
	if (filteredPages.length !== normalizedPages.length) {
		warnings.push('Some pages referenced missing roots; removed invalid pages');
	}
	const safePages = filteredPages.length > 0 ? filteredPages : [firstValidPage];

	const candidateActivePageId =
		typeof (doc as { activePageId?: unknown }).activePageId === 'string'
			? (doc as { activePageId: string }).activePageId
			: safePages[0].id;
	const activePageId = safePages.some((page) => page.id === candidateActivePageId) ? candidateActivePageId : safePages[0].id;
	if (activePageId !== candidateActivePageId) {
		warnings.push('activePageId was invalid and has been normalized');
	}

	const normalizedRootId = legacyRootId && doc.nodes[legacyRootId] ? legacyRootId : safePages[0].rootId;

	return {
		...doc,
		rootId: normalizedRootId,
		pages: safePages,
		activePageId,
	};
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

	if (version < 6 && node.type === 'text') {
		if (node.textAlign === undefined) {
			node.textAlign = 'left';
		}
		if (node.letterSpacingPx === undefined) {
			node.letterSpacingPx = 0;
		}
		if (node.textResizeMode === undefined) {
			node.textResizeMode = 'auto-width';
		}
	}

	if (version < 7) {
		node.variant = normalizeVariantMap(node.variant);
	}

	return node;
};

const normalizeVariantMap = (value: unknown): Record<string, string> | undefined => {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.map(([key, raw]) => [key, typeof raw === 'string' ? raw : String(raw)] as const)
		.filter(([key, raw]) => key.trim().length > 0 && raw.trim().length > 0);
	if (entries.length === 0) {
		return undefined;
	}
	return Object.fromEntries(entries);
};

const normalizeNodeForComponentTemplate = (node: Record<string, unknown>): Record<string, unknown> => {
	return {
		...node,
		componentId: undefined,
		componentOverrides: undefined,
		componentSourceNodeId: undefined,
		isComponentMainPreview: undefined,
		variant: normalizeVariantMap(node.variant),
	};
};

type ComponentsLibraryLike = {
	definitions: Record<string, ComponentDefinition>;
	sets: Record<string, ComponentSet>;
};

type VariableCollectionLike = StyleVariableCollection;
type VariableTokenLike = StyleVariableToken;
type VariableLibraryLike = StyleVariableLibrary;

const normalizeStyleRecord = <T>(
	raw: unknown,
	parse: (value: unknown) => T | undefined,
): Record<string, T> => {
	if (!raw || typeof raw !== 'object') {
		return {};
	}
	const source = raw as Record<string, unknown>;
	const next: Record<string, T> = {};
	for (const [id, entry] of Object.entries(source)) {
		const parsed = parse(entry);
		if (!parsed) continue;
		next[id] = parsed;
	}
	return next;
};

const normalizeStyleLibrary = (raw: unknown): StyleLibrary => {
	if (!raw || typeof raw !== 'object') {
		return { paint: {}, text: {}, effect: {}, grid: {} };
	}
	const value = raw as Record<string, unknown>;
	const paint = normalizeStyleRecord(value.paint, (entry) => {
		const parsed = paintStyleSchema.safeParse(entry);
		return parsed.success ? parsed.data : undefined;
	});
	const text = normalizeStyleRecord(value.text, (entry) => {
		const parsed = textStyleSchema.safeParse(entry);
		return parsed.success ? parsed.data : undefined;
	});
	const effect = normalizeStyleRecord(value.effect, (entry) => {
		const parsed = effectStyleSchema.safeParse(entry);
		return parsed.success ? parsed.data : undefined;
	});
	const grid = normalizeStyleRecord(value.grid, (entry) => {
		const parsed = gridStyleSchema.safeParse(entry);
		return parsed.success ? parsed.data : undefined;
	});
	return { paint, text, effect, grid };
};

const normalizeVariableLibrary = (raw: unknown, warnings: string[]): VariableLibraryLike => {
	const fallback: VariableLibraryLike = {
		collections: {},
		tokens: {},
		activeModeByCollection: {},
	};
	if (!raw || typeof raw !== 'object') {
		return fallback;
	}
	const value = raw as Record<string, unknown>;
	const rawCollections =
		value.collections && typeof value.collections === 'object'
			? (value.collections as Record<string, Record<string, unknown>>)
			: {};
	const rawTokens =
		value.tokens && typeof value.tokens === 'object' ? (value.tokens as Record<string, Record<string, unknown>>) : {};
	const rawActiveModes =
		value.activeModeByCollection && typeof value.activeModeByCollection === 'object'
			? (value.activeModeByCollection as Record<string, unknown>)
			: {};

	const collections: Record<string, VariableCollectionLike> = {};
	for (const [id, collection] of Object.entries(rawCollections)) {
		if (!collection || typeof collection !== 'object') continue;
		const modesRaw = Array.isArray(collection.modes) ? collection.modes : [];
		const modes = modesRaw
			.map((mode, index) => {
				if (!mode || typeof mode !== 'object') return null;
				const entry = mode as Record<string, unknown>;
				const modeId = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id : `mode_${index + 1}`;
				const modeName = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name : `Mode ${index + 1}`;
				return { id: modeId, name: modeName };
			})
			.filter((mode): mode is { id: string; name: string } => Boolean(mode));
		if (modes.length === 0) {
			modes.push({ id: 'mode_default', name: 'Default' });
		}
		const defaultModeIdRaw = typeof collection.defaultModeId === 'string' ? collection.defaultModeId : undefined;
		const defaultModeId = modes.some((mode) => mode.id === defaultModeIdRaw) ? defaultModeIdRaw : modes[0].id;
		collections[id] = {
			id,
			name: typeof collection.name === 'string' && collection.name.trim().length > 0 ? collection.name : id,
			modes,
			defaultModeId,
		};
	}

	const tokens: Record<string, VariableTokenLike> = {};
	for (const [id, token] of Object.entries(rawTokens)) {
		if (!token || typeof token !== 'object') continue;
		const tokenType = token.type === 'color' || token.type === 'number' || token.type === 'string' ? token.type : 'string';
		const valuesByModeRaw =
			token.valuesByMode && typeof token.valuesByMode === 'object'
				? (token.valuesByMode as Record<string, unknown>)
				: {};
		const valuesByMode = Object.fromEntries(
			Object.entries(valuesByModeRaw)
				.filter(([, value]) => typeof value === 'string' || typeof value === 'number')
				.map(([modeId, value]) => [modeId, value as string | number]),
		);
		const collectionId = typeof token.collectionId === 'string' ? token.collectionId : '';
		if (!collectionId) continue;
		tokens[id] = {
			id,
			name: typeof token.name === 'string' && token.name.trim().length > 0 ? token.name : id,
			collectionId,
			type: tokenType,
			valuesByMode,
		};
	}

	const activeModeByCollection: Record<string, string> = {};
	for (const [collectionId, collection] of Object.entries(collections)) {
		const requested =
			typeof rawActiveModes[collectionId] === 'string' ? (rawActiveModes[collectionId] as string) : collection.defaultModeId;
		const fallbackModeId = collection.defaultModeId ?? collection.modes[0]?.id ?? 'mode_default';
		const modeId = requested && collection.modes.some((mode) => mode.id === requested) ? requested : fallbackModeId;
		activeModeByCollection[collectionId] = modeId;
	}

	if (Object.keys(collections).length > 0 && Object.keys(activeModeByCollection).length === 0) {
		warnings.push('Variable active modes were missing and have been normalized');
	}

	return { collections, tokens, activeModeByCollection };
};

const inferVariableType = (value: string | number): 'color' | 'number' | 'string' => {
	if (typeof value === 'number') return 'number';
	const trimmed = value.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return 'color';
	const parsed = Number(trimmed);
	if (Number.isFinite(parsed)) return 'number';
	return 'string';
};

const normalizeTokenValue = (value: string | number, type: 'color' | 'number' | 'string'): string | number => {
	if (type === 'number') {
		if (typeof value === 'number') return value;
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return typeof value === 'string' ? value : String(value);
};

const sanitizeIdSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');

const migrateLegacyEffectVariablesToVariableLibrary = (
	nodes: Record<string, unknown>,
	library: VariableLibraryLike,
	warnings: string[],
): VariableLibraryLike => {
	const migratedCollectionId = 'legacy_effect_variables';
	const migratedModeId = 'mode_default';
	const migratedCollectionName = 'Legacy Effect Variables';

	const next: VariableLibraryLike = {
		collections: { ...library.collections },
		tokens: { ...library.tokens },
		activeModeByCollection: { ...library.activeModeByCollection },
	};

	let migratedCount = 0;
	for (const rawNode of Object.values(nodes)) {
		if (!rawNode || typeof rawNode !== 'object') continue;
		const node = rawNode as Record<string, unknown>;
		const effectVariablesRaw =
			node.effectVariables && typeof node.effectVariables === 'object'
				? (node.effectVariables as Record<string, unknown>)
				: null;
		if (!effectVariablesRaw) continue;

		for (const [key, value] of Object.entries(effectVariablesRaw)) {
			if (typeof value !== 'string' && typeof value !== 'number') continue;
			if (!next.collections[migratedCollectionId]) {
				next.collections[migratedCollectionId] = {
					id: migratedCollectionId,
					name: migratedCollectionName,
					modes: [{ id: migratedModeId, name: 'Default' }],
					defaultModeId: migratedModeId,
				};
				next.activeModeByCollection[migratedCollectionId] = migratedModeId;
			}
			let tokenId = `legacy/${sanitizeIdSegment(key)}`;
			if (!tokenId || tokenId === 'legacy/') {
				tokenId = `legacy/token_${Object.keys(next.tokens).length + 1}`;
			}
			if (next.tokens[tokenId]) {
				continue;
			}
			const tokenType = inferVariableType(value);
			next.tokens[tokenId] = {
				id: tokenId,
				name: key,
				collectionId: migratedCollectionId,
				type: tokenType,
				valuesByMode: {
					[migratedModeId]: normalizeTokenValue(value, tokenType),
				},
			};
			migratedCount += 1;
		}
	}

	if (migratedCount > 0) {
		warnings.push(`Migrated ${migratedCount} legacy effect variable(s) into the default variables library`);
	}

	return next;
};

const normalizeComponents = (raw: unknown): ComponentsLibraryLike => {
	if (!raw || typeof raw !== 'object') {
		return { definitions: {}, sets: {} };
	}
	const lib = raw as Record<string, unknown>;
	const definitions =
		lib.definitions && typeof lib.definitions === 'object' ? (lib.definitions as Record<string, ComponentDefinition>) : {};
	const sets = lib.sets && typeof lib.sets === 'object' ? (lib.sets as Record<string, ComponentSet>) : {};
	return { definitions, sets };
};

const migrateLegacyComponents = (nodes: Record<string, unknown>): ComponentsLibraryLike => {
	const components: ComponentsLibraryLike = { definitions: {}, sets: {} };

	const collectSubtree = (
		nodeMap: Record<string, unknown>,
		rootIds: string[],
	): { rootChildIds: string[]; templateNodes: Record<string, Node> } => {
		const result: Record<string, Node> = {};
		const queue = [...rootIds];
		while (queue.length > 0) {
			const id = queue.shift()!;
			const raw = nodeMap[id];
			if (!raw || typeof raw !== 'object') continue;
			const normalized = normalizeNodeForComponentTemplate(raw as Record<string, unknown>) as Node;
			result[id] = normalized;
			const children = Array.isArray(normalized.children) ? normalized.children : [];
			for (const childId of children) {
				queue.push(childId);
			}
		}
		return { rootChildIds: rootIds, templateNodes: result };
	};

	for (const rawNode of Object.values(nodes)) {
		if (!rawNode || typeof rawNode !== 'object') continue;
		const node = rawNode as Record<string, unknown>;
		if (node.type !== 'componentInstance') continue;
		const componentId = typeof node.componentId === 'string' ? node.componentId : null;
		if (!componentId || components.sets[componentId]) continue;
		const children = Array.isArray(node.children) ? (node.children as string[]) : [];
		if (children.length === 0) continue;

		const extracted = collectSubtree(nodes, children);
		const definitionId = `${componentId}__default`;
		const rootTemplateId = `${componentId}__template_root`;
		const variant = normalizeVariantMap(node.variant);
		const templateRoot: Node = {
			id: rootTemplateId,
			type: 'frame',
			name: typeof node.name === 'string' ? node.name : 'Component',
			position: { x: 0, y: 0 },
			size:
				node.size && typeof node.size === 'object'
					? (node.size as Node['size'])
					: { width: 100, height: 100 },
			children: extracted.rootChildIds,
			visible: true,
		};
		extracted.templateNodes[rootTemplateId] = templateRoot;

		const definition: ComponentDefinition = {
			id: definitionId,
			name: typeof node.name === 'string' ? node.name : 'Component',
			setId: componentId,
			variant,
			templateRootId: rootTemplateId,
			templateNodes: extracted.templateNodes,
		};
		components.definitions[definitionId] = definition;

		const properties: Record<string, string[]> = {};
		for (const [key, value] of Object.entries(variant ?? {})) {
			properties[key] = [value];
		}
		components.sets[componentId] = {
			id: componentId,
			name: definition.name,
			defaultDefinitionId: definitionId,
			definitionIds: [definitionId],
			properties,
		};
	}

	return components;
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

export const serializeDocument = (doc: Document, options?: { activePageId?: string }): string => {
  const activePageId =
    typeof options?.activePageId === 'string' && doc.pages.some((page) => page.id === options.activePageId)
      ? options.activePageId
      : doc.activePageId;
  const normalized: Document = {
    ...doc,
    version: CURRENT_DOCUMENT_VERSION,
    activePageId,
  };
  return JSON.stringify(normalized, null, 2);
};
