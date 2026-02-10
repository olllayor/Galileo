import type { Asset, Color, Node, Stroke } from '../../core/doc/types';
import type { ClipboardPayloadV2 } from '../clipboard/types';
import type { FigmaImportResult, FigmaImportWarning } from '../types';

type FigmaBounds = { x: number; y: number; width: number; height: number };

type FigmaMapOptions = {
	generateId: () => string;
	imagesByRef?: Record<string, string>;
	name?: string;
};

export type FigmaMapOutput = {
	payload: ClipboardPayloadV2 | null;
	result: FigmaImportResult;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const getNumber = (value: unknown, fallback = 0): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return fallback;
};

const toColor = (paint: Record<string, unknown> | undefined): Color | undefined => {
	if (!paint) return undefined;
	if ((paint.visible as boolean | undefined) === false) return undefined;
	if (paint.type !== 'SOLID') return undefined;
	const color = paint.color;
	if (!isRecord(color)) return undefined;
	const r = Math.round(getNumber(color.r, 0) * 255);
	const g = Math.round(getNumber(color.g, 0) * 255);
	const b = Math.round(getNumber(color.b, 0) * 255);
	const a = getNumber(paint.opacity, 1);
	if (a < 1) {
		return { type: 'solid', value: `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})` };
	}
	return { type: 'solid', value: `rgb(${r}, ${g}, ${b})` };
};

const toStroke = (paint: Record<string, unknown> | undefined, width: number): Stroke | undefined => {
	const color = toColor(paint);
	if (!color) return undefined;
	return {
		color,
		width: Math.max(0, width),
		style: 'solid',
	};
};

const readBounds = (node: Record<string, unknown>): FigmaBounds | null => {
	const box = node.absoluteBoundingBox;
	if (!isRecord(box)) return null;
	return {
		x: getNumber(box.x),
		y: getNumber(box.y),
		width: Math.max(1, getNumber(box.width, 1)),
		height: Math.max(1, getNumber(box.height, 1)),
	};
};

const readChildren = (node: Record<string, unknown>): Record<string, unknown>[] => {
	const raw = node.children;
	if (!Array.isArray(raw)) return [];
	return raw.filter(isRecord);
};

const readName = (node: Record<string, unknown>, fallback: string): string => {
	const name = node.name;
	return typeof name === 'string' && name.trim().length > 0 ? name : fallback;
};

const readPathData = (node: Record<string, unknown>): string | null => {
	const fillGeometry = node.fillGeometry;
	if (Array.isArray(fillGeometry)) {
		for (const entry of fillGeometry) {
			if (!isRecord(entry)) continue;
			if (typeof entry.path === 'string' && entry.path.trim().length > 0) {
				return entry.path;
			}
		}
	}
	const strokeGeometry = node.strokeGeometry;
	if (Array.isArray(strokeGeometry)) {
		for (const entry of strokeGeometry) {
			if (!isRecord(entry)) continue;
			if (typeof entry.path === 'string' && entry.path.trim().length > 0) {
				return entry.path;
			}
		}
	}
	return null;
};

const readFills = (node: Record<string, unknown>): Record<string, unknown>[] => {
	const fills = node.fills;
	if (!Array.isArray(fills)) return [];
	return fills.filter(isRecord);
};

const readFirstSolidFill = (node: Record<string, unknown>): Color | undefined => {
	for (const fill of readFills(node)) {
		const parsed = toColor(fill);
		if (parsed) return parsed;
	}
	return undefined;
};

const readImageRef = (node: Record<string, unknown>): string | null => {
	for (const fill of readFills(node)) {
		if (fill.type !== 'IMAGE') continue;
		const imageRef = fill.imageRef;
		if (typeof imageRef === 'string' && imageRef.length > 0) {
			return imageRef;
		}
	}
	return null;
};

const readStrokes = (node: Record<string, unknown>): Record<string, unknown>[] => {
	const strokes = node.strokes;
	if (!Array.isArray(strokes)) return [];
	return strokes.filter(isRecord);
};

const readStrokeWeight = (node: Record<string, unknown>): number => {
	if (typeof node.strokeWeight === 'number' && Number.isFinite(node.strokeWeight)) {
		return node.strokeWeight;
	}
	if (typeof node.individualStrokeWeights === 'object' && isRecord(node.individualStrokeWeights)) {
		const top = getNumber(node.individualStrokeWeights.top, 0);
		const right = getNumber(node.individualStrokeWeights.right, 0);
		const bottom = getNumber(node.individualStrokeWeights.bottom, 0);
		const left = getNumber(node.individualStrokeWeights.left, 0);
		return Math.max(top, right, bottom, left);
	}
	return 0;
};

const readFirstSolidStroke = (node: Record<string, unknown>): Stroke | undefined => {
	const width = readStrokeWeight(node);
	for (const stroke of readStrokes(node)) {
		const parsed = toStroke(stroke, width);
		if (parsed) return parsed;
	}
	return undefined;
};

const readCornerRadius = (node: Record<string, unknown>): number | undefined => {
	if (typeof node.cornerRadius === 'number' && Number.isFinite(node.cornerRadius)) {
		return Math.max(0, node.cornerRadius);
	}
	if (Array.isArray(node.rectangleCornerRadii)) {
		const values = node.rectangleCornerRadii
			.map((value) => getNumber(value, 0))
			.filter((value) => Number.isFinite(value));
		if (values.length > 0) {
			return Math.max(0, ...values);
		}
	}
	return undefined;
};

const normalizeFontWeight = (value: unknown): 'normal' | '500' | '600' | 'bold' => {
	const numeric = typeof value === 'number' ? value : Number.NaN;
	if (Number.isFinite(numeric)) {
		if (numeric >= 700) return 'bold';
		if (numeric >= 600) return '600';
		if (numeric >= 500) return '500';
	}
	return 'normal';
};

const extractRootsFromPayload = (
	payload: unknown,
): { roots: Record<string, unknown>[]; pageName?: string; warnings: FigmaImportWarning[] } => {
	const warnings: FigmaImportWarning[] = [];
	if (!isRecord(payload)) {
		return { roots: [], warnings: [{ code: 'invalid_payload', message: 'Figma payload is not an object.' }] };
	}

	if (Array.isArray(payload.selection)) {
		return {
			roots: payload.selection.filter(isRecord),
			warnings,
		};
	}

	if (isRecord(payload.document)) {
		const document = payload.document;
		const canvases = readChildren(document).filter((node) => node.type === 'CANVAS');
		if (canvases.length > 0) {
			const canvas = canvases[0];
			return {
				roots: readChildren(canvas),
				pageName: readName(canvas, 'Figma Import'),
				warnings,
			};
		}
		return {
			roots: readChildren(document),
			pageName: readName(document, 'Figma Import'),
			warnings,
		};
	}

	if (isRecord(payload.nodes)) {
		const roots: Record<string, unknown>[] = [];
		for (const value of Object.values(payload.nodes)) {
			if (!isRecord(value)) continue;
			if (isRecord(value.document)) {
				roots.push(value.document);
			}
		}
		return { roots, warnings };
	}

	warnings.push({ code: 'invalid_payload', message: 'Could not find importable nodes in Figma payload.' });
	return { roots: [], warnings };
};

export const mapFigmaPayloadToClipboardPayload = (input: unknown, options: FigmaMapOptions): FigmaMapOutput => {
	const extracted = extractRootsFromPayload(input);
	const warnings: FigmaImportWarning[] = [...extracted.warnings];
	if (extracted.roots.length === 0) {
		return {
			payload: null,
			result: {
				importedLayerCount: 0,
				warnings,
				pageName: extracted.pageName,
			},
		};
	}

	const nodes: Record<string, Node> = {};
	const assets: Record<string, Asset> = {};
	const rootId = options.generateId();
	nodes[rootId] = {
		id: rootId,
		type: 'frame',
		name: options.name ?? extracted.pageName ?? 'Figma Import',
		position: { x: 0, y: 0 },
		size: { width: 1280, height: 800 },
		children: [],
		visible: true,
	};

	let importedLayerCount = 0;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	const mapNode = (
		node: Record<string, unknown>,
		parentId: string,
		parentAbs: { x: number; y: number },
	): string | null => {
		const type = typeof node.type === 'string' ? node.type : 'UNKNOWN';
		const bounds = readBounds(node) ?? { x: parentAbs.x, y: parentAbs.y, width: 1, height: 1 };
		const localPosition = {
			x: bounds.x - parentAbs.x,
			y: bounds.y - parentAbs.y,
		};

		const base: Pick<Node, 'id' | 'name' | 'position' | 'size' | 'visible' | 'opacity'> = {
			id: options.generateId(),
			name: readName(node, type),
			position: localPosition,
			size: { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) },
			visible: node.visible === false ? false : true,
			opacity: typeof node.opacity === 'number' ? node.opacity : undefined,
		};

		let mapped: Node | null = null;
		if (type === 'FRAME' || type === 'GROUP' || type === 'SECTION' || type === 'CANVAS') {
			mapped = {
				...base,
				type: type === 'FRAME' || type === 'CANVAS' ? 'frame' : 'group',
				children: [],
				fill: readFirstSolidFill(node),
				stroke: readFirstSolidStroke(node),
				cornerRadius: readCornerRadius(node),
				clipContent: type === 'FRAME' && node.clipsContent === true ? true : undefined,
			};
		} else if (type === 'RECTANGLE') {
			const imageRef = readImageRef(node);
			if (imageRef && options.imagesByRef?.[imageRef]) {
				mapped = {
					...base,
					type: 'image',
					image: {
						src: options.imagesByRef[imageRef],
					},
					aspectRatioLocked: true,
				};
			} else {
				mapped = {
					...base,
					type: 'rectangle',
					fill: readFirstSolidFill(node),
					stroke: readFirstSolidStroke(node),
					cornerRadius: readCornerRadius(node),
				};
			}
		} else if (type === 'ELLIPSE') {
			mapped = {
				...base,
				type: 'ellipse',
				fill: readFirstSolidFill(node),
				stroke: readFirstSolidStroke(node),
			};
		} else if (
			type === 'VECTOR' ||
			type === 'LINE' ||
			type === 'POLYGON' ||
			type === 'STAR' ||
			type === 'BOOLEAN_OPERATION'
		) {
			const path = readPathData(node);
			mapped = {
				...base,
				type: 'path',
				path: path ?? undefined,
				fill: readFirstSolidFill(node),
				stroke: readFirstSolidStroke(node),
			};
			if (!path) {
				warnings.push({
					code: 'unsupported_feature',
					message: `Vector node ${readName(node, type)} had no path geometry.`,
					nodeId: typeof node.id === 'string' ? node.id : undefined,
				});
			}
		} else if (type === 'TEXT') {
			const textStyle = isRecord(node.style) ? node.style : {};
			mapped = {
				...base,
				type: 'text',
				text: typeof node.characters === 'string' ? node.characters : '',
				fontFamily: typeof textStyle.fontFamily === 'string' ? textStyle.fontFamily : undefined,
				fontSize: typeof textStyle.fontSize === 'number' ? textStyle.fontSize : undefined,
				fontWeight: normalizeFontWeight(textStyle.fontWeight),
				textAlign:
					typeof textStyle.textAlignHorizontal === 'string'
						? textStyle.textAlignHorizontal.toLowerCase() === 'center'
							? 'center'
							: textStyle.textAlignHorizontal.toLowerCase() === 'right'
								? 'right'
								: 'left'
						: 'left',
				lineHeightPx: typeof textStyle.lineHeightPx === 'number' ? textStyle.lineHeightPx : undefined,
				letterSpacingPx:
					typeof textStyle.letterSpacing === 'number'
						? textStyle.letterSpacing
						: typeof textStyle.letterSpacingPx === 'number'
							? textStyle.letterSpacingPx
							: undefined,
				fill: readFirstSolidFill(node),
			};
		} else if (type === 'IMAGE') {
			const imageRef = readImageRef(node);
			if (imageRef && options.imagesByRef?.[imageRef]) {
				mapped = {
					...base,
					type: 'image',
					image: {
						src: options.imagesByRef[imageRef],
					},
					aspectRatioLocked: true,
				};
			}
		}

		if (!mapped) {
			if (readChildren(node).length > 0) {
				mapped = {
					...base,
					type: 'group',
					children: [],
				};
			} else {
				warnings.push({
					code: 'unsupported_node',
					message: `Unsupported Figma node type ${type} was skipped.`,
					nodeId: typeof node.id === 'string' ? node.id : undefined,
				});
				return null;
			}
		}

		nodes[mapped.id] = mapped;
		nodes[parentId]?.children?.push(mapped.id);
		importedLayerCount += 1;

		minX = Math.min(minX, bounds.x);
		minY = Math.min(minY, bounds.y);
		maxX = Math.max(maxX, bounds.x + bounds.width);
		maxY = Math.max(maxY, bounds.y + bounds.height);

		for (const child of readChildren(node)) {
			mapNode(child, mapped.id, { x: bounds.x, y: bounds.y });
		}

		return mapped.id;
	};

	for (const root of extracted.roots) {
		mapNode(root, rootId, { x: 0, y: 0 });
	}

	if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
		nodes[rootId].size = {
			width: Math.max(1, maxX - minX),
			height: Math.max(1, maxY - minY),
		};
	}

	const payload: ClipboardPayloadV2 = {
		version: 2,
		rootIds: [rootId],
		nodes,
		bounds: {
			x: 0,
			y: 0,
			width: nodes[rootId].size.width,
			height: nodes[rootId].size.height,
		},
		rootWorldPositions: {
			[rootId]: { x: 0, y: 0 },
		},
		parentId: null,
		assets,
		source: 'figma-rest',
	};

	return {
		payload,
		result: {
			importedLayerCount,
			warnings,
			pageName: extracted.pageName,
		},
	};
};
