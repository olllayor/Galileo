import {
	createEmptyPrototypeGraph,
	createEmptyPrototypePageGraph,
	documentSchema,
	effectStyleSchema,
	gridStyleSchema,
	paintStyleSchema,
	prototypeTransitionSchema,
	textStyleSchema,
	type ComponentDefinition,
	type ComponentSet,
	type Document,
	type Node,
	type PrototypeGraph,
	type PrototypeInteraction,
	type PrototypePageGraph,
	type StyleLibrary,
	type StyleVariableCollection,
	type StyleVariableLibrary,
	type StyleVariableToken,
} from './types';
import { normalizeNodeAppearance } from './appearance';

export const CURRENT_DOCUMENT_VERSION = 12;

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
		) as Record<string, Node>;
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
			appearance: normalizeDocumentAppearance((raw as { appearance?: unknown }).appearance),
		} as Document;
		} else {
			const rawObject = raw as Record<string, unknown>;
			const rawNodes = (rawObject.nodes ?? {}) as Record<string, unknown>;
			const migratedNodes = Object.fromEntries(
				Object.entries(rawNodes).map(([id, node]) => [id, migrateNode(node, version)]),
			) as Record<string, Node>;
			migrated = {
				...(raw as Document),
				nodes: migratedNodes,
				styles: normalizeStyleLibrary((raw as { styles?: unknown }).styles),
				variables: normalizeVariableLibrary((raw as { variables?: unknown }).variables, warnings),
				appearance: normalizeDocumentAppearance((raw as { appearance?: unknown }).appearance),
			};
		}

	migrated = normalizePages(migrated, warnings);
	migrated = normalizePrototypeGraph(migrated, warnings);

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

const normalizeSwatchList = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => normalizeColorString(entry))
		.filter((entry): entry is string => typeof entry === 'string')
		.slice(0, 64);
};

const normalizeDocumentAppearance = (rawAppearance: unknown): Document['appearance'] => {
	const fallbackSamples = ['#ffffff', '#d9d9d9', '#000000', '#ff5e5b', '#00a884', '#3a7bff'];
	if (!rawAppearance || typeof rawAppearance !== 'object') {
		return {
			recentSwatches: [],
			sampleSwatches: fallbackSamples,
		};
	}
	const appearance = rawAppearance as Record<string, unknown>;
	const recentSwatches = normalizeSwatchList(appearance.recentSwatches);
	const sampleSwatches = normalizeSwatchList(appearance.sampleSwatches);
	return {
		recentSwatches,
		sampleSwatches: sampleSwatches.length > 0 ? sampleSwatches : fallbackSamples,
	};
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

const normalizePrototypeInteraction = (
	value: unknown,
	pageFrameIds: Set<string>,
): PrototypeInteraction | null => {
	if (!value || typeof value !== 'object') return null;
	const entry = value as Record<string, unknown>;
	if (typeof entry.targetFrameId !== 'string') return null;
	if (!pageFrameIds.has(entry.targetFrameId)) return null;
	const transitionParse = prototypeTransitionSchema.safeParse(entry.transition);
	if (!transitionParse.success) return null;
	return {
		targetFrameId: entry.targetFrameId,
		transition: transitionParse.data,
	};
};

const normalizePrototypePageGraph = (
	value: unknown,
	pageRootId: string,
	pageFrameIds: Set<string>,
): PrototypePageGraph => {
	const fallback = createEmptyPrototypePageGraph();
	if (!value || typeof value !== 'object') return fallback;
	const raw = value as Record<string, unknown>;
	const startFrameId = typeof raw.startFrameId === 'string' && pageFrameIds.has(raw.startFrameId) ? raw.startFrameId : undefined;
	const rawInteractions =
		raw.interactionsBySource && typeof raw.interactionsBySource === 'object'
			? (raw.interactionsBySource as Record<string, unknown>)
			: {};
	const interactionsBySource: PrototypePageGraph['interactionsBySource'] = {};

	for (const [sourceFrameId, sourceValue] of Object.entries(rawInteractions)) {
		if (!pageFrameIds.has(sourceFrameId) || sourceFrameId === pageRootId) continue;
		if (!sourceValue || typeof sourceValue !== 'object') continue;
		const source = sourceValue as Record<string, unknown>;
		const click = normalizePrototypeInteraction(source.click, pageFrameIds);
		const hover = normalizePrototypeInteraction(source.hover, pageFrameIds);
		if (!click && !hover) continue;
		interactionsBySource[sourceFrameId] = {
			...(click ? { click } : {}),
			...(hover ? { hover } : {}),
		};
	}

	return {
		...(startFrameId ? { startFrameId } : {}),
		interactionsBySource,
	};
};

const normalizePrototypeGraph = (doc: Document, warnings: string[]): Document => {
	const pageIds = doc.pages.map((page) => page.id);
	const fallback = createEmptyPrototypeGraph(pageIds);
	const rawPrototype = (doc as { prototype?: unknown }).prototype;
	if (!rawPrototype || typeof rawPrototype !== 'object') {
		warnings.push('Prototype graph was missing and has been initialized');
		return {
			...doc,
			prototype: fallback,
		};
	}

	const rawPages =
		(rawPrototype as { pages?: unknown }).pages && typeof (rawPrototype as { pages?: unknown }).pages === 'object'
			? ((rawPrototype as { pages: Record<string, unknown> }).pages ?? {})
			: {};

	const normalizedPages: PrototypeGraph['pages'] = {};
	for (const page of doc.pages) {
		const pageFrameIds = new Set<string>();
		const queue = [page.rootId];
		while (queue.length > 0) {
			const nextId = queue.shift();
			if (!nextId || pageFrameIds.has(nextId)) continue;
			const node = doc.nodes[nextId];
			if (!node) continue;
			if (node.type === 'frame') {
				pageFrameIds.add(nextId);
			}
			for (const childId of node.children ?? []) {
				queue.push(childId);
			}
		}

		normalizedPages[page.id] = normalizePrototypePageGraph(rawPages[page.id], page.rootId, pageFrameIds);
	}

	return {
		...doc,
		prototype: {
			pages: normalizedPages,
		},
	};
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeColorString = (value: unknown): string | undefined => {
	if (typeof value === 'string' && value.trim().length > 0) {
		return value;
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (record.type === 'solid' && typeof record.value === 'string' && record.value.trim().length > 0) {
			return record.value;
		}
		if (
			typeof record.r === 'number' &&
			typeof record.g === 'number' &&
			typeof record.b === 'number' &&
			Number.isFinite(record.r) &&
			Number.isFinite(record.g) &&
			Number.isFinite(record.b)
		) {
			const r = Math.round(clamp01(record.r) * 255);
			const g = Math.round(clamp01(record.g) * 255);
			const b = Math.round(clamp01(record.b) * 255);
			return `rgb(${r}, ${g}, ${b})`;
		}
	}
	return undefined;
};

const normalizePoint = (value: unknown): { x: number; y: number } | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const point = value as Record<string, unknown>;
	if (typeof point.x !== 'number' || typeof point.y !== 'number') return undefined;
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
	return { x: point.x, y: point.y };
};

const normalizeGradientStops = (rawStops: unknown): Array<{ offset: number; color: string }> => {
	if (!Array.isArray(rawStops) || rawStops.length === 0) {
		return [];
	}

	const total = rawStops.length;
	const normalized = rawStops
		.map((stop, index) => {
			if (typeof stop === 'string' && stop.trim().length > 0) {
				return {
					offset: total > 1 ? index / (total - 1) : 0,
					color: stop,
				};
			}
			if (!stop || typeof stop !== 'object') {
				return null;
			}
			const entry = stop as Record<string, unknown>;
			const rawOffset =
				(typeof entry.offset === 'number' ? entry.offset : undefined) ??
				(typeof entry.position === 'number' ? entry.position : undefined) ??
				(typeof entry.t === 'number' ? entry.t : undefined) ??
				(total > 1 ? index / (total - 1) : 0);
			const normalizedOffset = rawOffset > 1 && rawOffset <= 100 ? rawOffset / 100 : rawOffset;
			const color =
				normalizeColorString(entry.color) ??
				normalizeColorString(entry.value) ??
				normalizeColorString(entry.paint) ??
				normalizeColorString(entry.fill);
			if (!color) return null;
			return {
				offset: clamp01(Number.isFinite(normalizedOffset) ? normalizedOffset : 0),
				color,
			};
		})
		.filter((stop): stop is { offset: number; color: string } => Boolean(stop));

	if (normalized.length === 0) {
		return [];
	}
	normalized.sort((a, b) => a.offset - b.offset);
	if (normalized.length === 1) {
		normalized.push({ offset: 1, color: normalized[0].color });
	}
	return normalized;
};

const normalizeColorLike = (rawColor: unknown): Record<string, unknown> | undefined => {
	if (!rawColor) return undefined;
	if (typeof rawColor === 'string') {
		return { type: 'solid', value: rawColor };
	}
	if (typeof rawColor !== 'object') return undefined;
	const color = rawColor as Record<string, unknown>;
	const type = typeof color.type === 'string' ? color.type.toLowerCase() : '';
	if (type === 'solid') {
		const value = normalizeColorString(color.value);
		return value ? { type: 'solid', value } : undefined;
	}
	if (type === 'pattern') {
		const pattern =
			color.pattern === 'grid' || color.pattern === 'dots' || color.pattern === 'stripes' || color.pattern === 'noise'
				? color.pattern
				: 'grid';
		const fg = normalizeColorString(color.fg) ?? '#ffffff';
		const bg = normalizeColorString(color.bg) ?? '#1f1f1f';
		const scale = typeof color.scale === 'number' && Number.isFinite(color.scale) ? Math.max(0.1, color.scale) : 1;
		const rotation =
			typeof color.rotation === 'number' && Number.isFinite(color.rotation)
				? color.rotation
				: typeof color.angle === 'number' && Number.isFinite(color.angle)
					? color.angle
					: 0;
		const next: Record<string, unknown> = {
			type: 'pattern',
			pattern,
			fg,
			bg,
			scale,
			rotation,
		};
		if (typeof color.opacity === 'number' && Number.isFinite(color.opacity)) {
			next.opacity = clamp01(color.opacity);
		}
		return next;
	}
	if (type === 'image') {
		const assetId = typeof color.assetId === 'string' && color.assetId.trim().length > 0 ? color.assetId : undefined;
		if (!assetId) return undefined;
		const fit = color.fit === 'fit' || color.fit === 'tile' ? color.fit : 'fill';
		const next: Record<string, unknown> = {
			type: 'image',
			assetId,
			fit,
		};
		if (typeof color.opacity === 'number' && Number.isFinite(color.opacity)) next.opacity = clamp01(color.opacity);
		if (typeof color.tileScale === 'number' && Number.isFinite(color.tileScale)) next.tileScale = Math.max(0.01, color.tileScale);
		if (typeof color.tileOffsetX === 'number' && Number.isFinite(color.tileOffsetX)) next.tileOffsetX = color.tileOffsetX;
		if (typeof color.tileOffsetY === 'number' && Number.isFinite(color.tileOffsetY)) next.tileOffsetY = color.tileOffsetY;
		if (typeof color.rotation === 'number' && Number.isFinite(color.rotation)) next.rotation = color.rotation;
		return next;
	}
	const stops = normalizeGradientStops(color.stops);
	if (type === 'gradient' || stops.length > 0) {
		const rawKind = color.kind ?? color.gradientType ?? color.mode ?? color.style;
		const kind = rawKind === 'radial' ? 'radial' : 'linear';
		const next: Record<string, unknown> = {
			type: 'gradient',
			kind,
			stops: stops.length > 0 ? stops : [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }],
		};
		const from = normalizePoint(color.from ?? color.start ?? color.p0 ?? color.handleStart);
		const to = normalizePoint(color.to ?? color.end ?? color.p1 ?? color.handleEnd);
		const center = normalizePoint(color.center ?? color.mid);
		if (from) next.from = from;
		if (to) next.to = to;
		if (center) next.center = center;
		if (typeof color.radius === 'number' && Number.isFinite(color.radius)) next.radius = color.radius;
		if (typeof color.innerRadius === 'number' && Number.isFinite(color.innerRadius)) next.innerRadius = color.innerRadius;
		if (typeof color.angle === 'number' && Number.isFinite(color.angle)) next.angle = color.angle;
		return next;
	}
	return undefined;
};

const normalizeLegacyStroke = (rawStroke: unknown): Record<string, unknown> | undefined => {
	if (!rawStroke || typeof rawStroke !== 'object') return undefined;
	const stroke = rawStroke as Record<string, unknown>;
	const color = normalizeColorLike(stroke.color);
	if (!color) return undefined;
	const width = typeof stroke.width === 'number' && Number.isFinite(stroke.width) ? Math.max(0, stroke.width) : 0;
	const style =
		stroke.style === 'dashed' || stroke.style === 'dotted' || stroke.style === 'solid' ? stroke.style : 'solid';
	const next: Record<string, unknown> = { color, width, style };
	if (stroke.align === 'inside' || stroke.align === 'center' || stroke.align === 'outside') next.align = stroke.align;
	if (stroke.cap === 'butt' || stroke.cap === 'round' || stroke.cap === 'square') next.cap = stroke.cap;
	if (stroke.join === 'miter' || stroke.join === 'round' || stroke.join === 'bevel') next.join = stroke.join;
	if (typeof stroke.miterLimit === 'number' && Number.isFinite(stroke.miterLimit)) next.miterLimit = stroke.miterLimit;
	if (Array.isArray(stroke.dashPattern)) {
		next.dashPattern = stroke.dashPattern.filter((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0);
	}
	if (typeof stroke.dashOffset === 'number' && Number.isFinite(stroke.dashOffset)) next.dashOffset = stroke.dashOffset;
	if (typeof stroke.opacity === 'number' && Number.isFinite(stroke.opacity)) next.opacity = clamp01(stroke.opacity);
	if (typeof stroke.visible === 'boolean') next.visible = stroke.visible;
	return next;
};

const normalizePaintLayerLike = (rawLayer: unknown, index: number): Record<string, unknown> | undefined => {
	if (!rawLayer || typeof rawLayer !== 'object') {
		const paint = normalizeColorLike(rawLayer);
		if (!paint) return undefined;
		return { id: `fill_${index + 1}`, paint, visible: true, opacity: 1, blendMode: 'normal' };
	}
	const layer = rawLayer as Record<string, unknown>;
	const paint = normalizeColorLike(layer.paint ?? layer.color ?? layer.fill);
	if (!paint) return undefined;
	const next: Record<string, unknown> = {
		id: typeof layer.id === 'string' && layer.id.trim().length > 0 ? layer.id : `fill_${index + 1}`,
		paint,
		visible: typeof layer.visible === 'boolean' ? layer.visible : true,
		opacity: typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? clamp01(layer.opacity) : 1,
		blendMode: typeof layer.blendMode === 'string' ? layer.blendMode : 'normal',
	};
	return next;
};

const normalizeStrokeLayerLike = (rawLayer: unknown, index: number): Record<string, unknown> | undefined => {
	if (!rawLayer || typeof rawLayer !== 'object') return undefined;
	const layer = rawLayer as Record<string, unknown>;
	const paint = normalizeColorLike(layer.paint ?? layer.color);
	if (!paint) return undefined;
	const width =
		typeof layer.width === 'number' && Number.isFinite(layer.width)
			? Math.max(0, layer.width)
			: typeof layer.strokeWeight === 'number' && Number.isFinite(layer.strokeWeight)
				? Math.max(0, layer.strokeWeight)
				: 0;
	const next: Record<string, unknown> = {
		id: typeof layer.id === 'string' && layer.id.trim().length > 0 ? layer.id : `stroke_${index + 1}`,
		paint,
		width,
		visible: typeof layer.visible === 'boolean' ? layer.visible : true,
		opacity: typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? clamp01(layer.opacity) : 1,
		blendMode: typeof layer.blendMode === 'string' ? layer.blendMode : 'normal',
	};
	if (layer.align === 'inside' || layer.align === 'center' || layer.align === 'outside') next.align = layer.align;
	if (layer.cap === 'butt' || layer.cap === 'round' || layer.cap === 'square') next.cap = layer.cap;
	if (layer.join === 'miter' || layer.join === 'round' || layer.join === 'bevel') next.join = layer.join;
	if (typeof layer.miterLimit === 'number' && Number.isFinite(layer.miterLimit)) next.miterLimit = layer.miterLimit;
	if (Array.isArray(layer.dashPattern)) {
		next.dashPattern = layer.dashPattern.filter((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0);
	}
	if (typeof layer.dashOffset === 'number' && Number.isFinite(layer.dashOffset)) next.dashOffset = layer.dashOffset;
	return next;
};

const normalizeMaskSettings = (rawMask: unknown): Record<string, unknown> | undefined => {
	if (!rawMask || typeof rawMask !== 'object') return undefined;
	const mask = rawMask as Record<string, unknown>;
	const mode = mask.mode === 'luminance' ? 'luminance' : 'alpha';
	const enabled = mask.enabled !== false;
	const next: Record<string, unknown> = { mode, enabled };
	if (typeof mask.sourceNodeId === 'string' && mask.sourceNodeId.trim().length > 0) {
		next.sourceNodeId = mask.sourceNodeId;
	}
	return next;
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

	if (node.fill !== undefined) {
		node.fill = normalizeColorLike(node.fill);
	}
	if (node.stroke !== undefined) {
		node.stroke = normalizeLegacyStroke(node.stroke);
	}
	if (Array.isArray(node.fills)) {
		node.fills = node.fills
			.map((layer, index) => normalizePaintLayerLike(layer, index))
			.filter((layer): layer is Record<string, unknown> => Boolean(layer));
	}
	if (Array.isArray(node.strokes)) {
		node.strokes = node.strokes
			.map((layer, index) => normalizeStrokeLayerLike(layer, index))
			.filter((layer): layer is Record<string, unknown> => Boolean(layer));
	}
	if (version < 11) {
		if (!Array.isArray(node.fills) || node.fills.length === 0) {
			const normalizedFill = normalizeColorLike(node.fill);
			if (normalizedFill) {
				node.fills = [{ id: 'fill_1', visible: true, opacity: 1, blendMode: 'normal', paint: normalizedFill }];
			}
		}
		if (!Array.isArray(node.strokes) || node.strokes.length === 0) {
			const normalizedStroke = normalizeLegacyStroke(node.stroke);
			if (normalizedStroke && normalizedStroke.color && typeof normalizedStroke.width === 'number') {
				node.strokes = [
					{
						id: 'stroke_1',
						visible: true,
						opacity: normalizedStroke.opacity ?? 1,
						blendMode: normalizedStroke.blendMode ?? 'normal',
						paint: normalizedStroke.color,
						width: normalizedStroke.width,
						align: normalizedStroke.align ?? 'center',
						cap: normalizedStroke.cap ?? 'butt',
						join: normalizedStroke.join ?? 'miter',
						miterLimit: normalizedStroke.miterLimit,
						dashPattern: normalizedStroke.dashPattern,
						dashOffset: normalizedStroke.dashOffset,
					},
				];
			}
		}
	}
	if (node.mask !== undefined) {
		node.mask = normalizeMaskSettings(node.mask);
	}

	return normalizeNodeAppearance(node as Node);
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
