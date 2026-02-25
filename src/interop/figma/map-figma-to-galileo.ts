import type { Asset, Color, LayerBlendMode, Node, PaintLayer, Stroke, StrokeLayer } from '../../core/doc/types';
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

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const toCssColor = (r: number, g: number, b: number, a = 1): string => {
	const rr = Math.round(clamp01(r) * 255);
	const gg = Math.round(clamp01(g) * 255);
	const bb = Math.round(clamp01(b) * 255);
	const aa = clamp01(a);
	if (aa < 0.999) {
		return `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
	}
	return `rgb(${rr}, ${gg}, ${bb})`;
};

const toLayerBlendMode = (value: unknown): LayerBlendMode | undefined => {
	if (typeof value !== 'string') return undefined;
	switch (value.trim().toUpperCase()) {
		case 'NORMAL':
		case 'PASS_THROUGH':
			return 'normal';
		case 'MULTIPLY':
			return 'multiply';
		case 'SCREEN':
			return 'screen';
		case 'OVERLAY':
			return 'overlay';
		case 'DARKEN':
			return 'darken';
		case 'LIGHTEN':
			return 'lighten';
		case 'COLOR_DODGE':
			return 'color-dodge';
		case 'COLOR_BURN':
			return 'color-burn';
		case 'HARD_LIGHT':
			return 'hard-light';
		case 'SOFT_LIGHT':
			return 'soft-light';
		case 'DIFFERENCE':
			return 'difference';
		case 'EXCLUSION':
			return 'exclusion';
		case 'HUE':
			return 'hue';
		case 'SATURATION':
			return 'saturation';
		case 'COLOR':
			return 'color';
		case 'LUMINOSITY':
			return 'luminosity';
		default:
			return undefined;
	}
};

const isGradientType = (type: unknown): type is 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' =>
	typeof type === 'string' && /^GRADIENT_/.test(type);

const toPoint = (value: unknown): { x: number; y: number } | undefined => {
	if (!isRecord(value)) return undefined;
	const x = getNumber(value.x, Number.NaN);
	const y = getNumber(value.y, Number.NaN);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return { x, y };
};

const parseSolidColor = (paint: Record<string, unknown>): Color | undefined => {
	if (paint.type !== 'SOLID') return undefined;
	const color = paint.color;
	if (!isRecord(color)) return undefined;
	const alpha = clamp01(getNumber(color.a, 1) * getNumber(paint.opacity, 1));
	return {
		type: 'solid',
		value: toCssColor(getNumber(color.r, 0), getNumber(color.g, 0), getNumber(color.b, 0), alpha),
	};
};

const parseGradientColor = (paint: Record<string, unknown>): Color | undefined => {
	if (!isGradientType(paint.type)) return undefined;
	const stopsRaw = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
	const opacity = getNumber(paint.opacity, 1);
	const stops = stopsRaw
		.filter(isRecord)
		.map((stop) => {
			if (!isRecord(stop.color)) return null;
			return {
				offset: clamp01(getNumber(stop.position, 0)),
				color: toCssColor(
					getNumber(stop.color.r, 0),
					getNumber(stop.color.g, 0),
					getNumber(stop.color.b, 0),
					clamp01(getNumber(stop.color.a, 1) * opacity),
				),
			};
		})
		.filter((stop): stop is { offset: number; color: string } => Boolean(stop));
	if (stops.length === 0) return undefined;

	const handles = Array.isArray(paint.gradientHandlePositions) ? paint.gradientHandlePositions.map(toPoint).filter(Boolean) : [];
	const start = handles[0];
	const end = handles[1];
	const center = handles[0];
	const radius = start && end ? Math.hypot(end.x - start.x, end.y - start.y) : undefined;

	return {
		type: 'gradient',
		kind: paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear',
		stops,
		...(start ? { from: start } : {}),
		...(end ? { to: end } : {}),
		...(center ? { center } : {}),
		...(typeof radius === 'number' && Number.isFinite(radius) ? { radius } : {}),
	};
};

const toColor = (paint: Record<string, unknown> | undefined): Color | undefined => {
	if (!paint) return undefined;
	if ((paint.visible as boolean | undefined) === false) return undefined;
	return parseSolidColor(paint) ?? parseGradientColor(paint);
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

const readStrokeAlign = (node: Record<string, unknown>): StrokeLayer['align'] | undefined => {
	if (typeof node.strokeAlign !== 'string') return undefined;
	switch (node.strokeAlign.toUpperCase()) {
		case 'INSIDE':
			return 'inside';
		case 'OUTSIDE':
			return 'outside';
		case 'CENTER':
			return 'center';
		default:
			return undefined;
	}
};

const readStrokeCap = (node: Record<string, unknown>): StrokeLayer['cap'] | undefined => {
	if (typeof node.strokeCap !== 'string') return undefined;
	switch (node.strokeCap.toUpperCase()) {
		case 'ROUND':
			return 'round';
		case 'SQUARE':
			return 'square';
		case 'NONE':
		case 'LINE_ARROW':
		case 'TRIANGLE_ARROW':
			return 'butt';
		default:
			return undefined;
	}
};

const readStrokeJoin = (node: Record<string, unknown>): StrokeLayer['join'] | undefined => {
	if (typeof node.strokeJoin !== 'string') return undefined;
	switch (node.strokeJoin.toUpperCase()) {
		case 'ROUND':
			return 'round';
		case 'BEVEL':
			return 'bevel';
		case 'MITER':
			return 'miter';
		default:
			return undefined;
	}
};

const readStrokeDashPattern = (node: Record<string, unknown>): number[] | undefined => {
	const source = Array.isArray(node.strokeDashes)
		? node.strokeDashes
		: Array.isArray(node.dashPattern)
			? node.dashPattern
			: null;
	if (!source) return undefined;
	const values = source
		.map((entry) => getNumber(entry, Number.NaN))
		.filter((entry) => Number.isFinite(entry) && entry >= 0);
	return values.length > 0 ? values : undefined;
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

const readFillLayers = (node: Record<string, unknown>, generateId: () => string): PaintLayer[] => {
	const layers: PaintLayer[] = [];
	for (const fill of readFills(node)) {
		const paint = toColor(fill);
		if (!paint) continue;
		layers.push({
			id: generateId(),
			visible: fill.visible === false ? false : true,
			opacity: clamp01(getNumber(fill.opacity, 1)),
			blendMode: toLayerBlendMode(fill.blendMode) ?? 'normal',
			paint,
		});
	}
	return layers;
};

const readStrokeLayers = (node: Record<string, unknown>, generateId: () => string): StrokeLayer[] => {
	const width = Math.max(0, readStrokeWeight(node));
	const align = readStrokeAlign(node) ?? 'center';
	const cap = readStrokeCap(node) ?? 'butt';
	const join = readStrokeJoin(node) ?? 'miter';
	const dashPattern = readStrokeDashPattern(node);
	const dashOffset = getNumber(node.strokeDashOffset, Number.NaN);
	const miterLimit = getNumber(node.strokeMiterAngle, Number.NaN);

	const layers: StrokeLayer[] = [];
	for (const stroke of readStrokes(node)) {
		const paint = toColor(stroke);
		if (!paint || width <= 0) continue;
		layers.push({
			id: generateId(),
			visible: stroke.visible === false ? false : true,
			opacity: clamp01(getNumber(stroke.opacity, 1)),
			blendMode: toLayerBlendMode(stroke.blendMode) ?? 'normal',
			paint,
			width,
			align,
			cap,
			join,
			...(dashPattern ? { dashPattern } : {}),
			...(Number.isFinite(dashOffset) ? { dashOffset } : {}),
			...(Number.isFinite(miterLimit) ? { miterLimit } : {}),
		});
	}
	return layers;
};

const inferStrokeStyle = (dashPattern: number[] | undefined): Stroke['style'] => {
	if (!dashPattern || dashPattern.length === 0) return 'solid';
	if (dashPattern.length >= 2 && dashPattern[0] <= 1.5) return 'dotted';
	return 'dashed';
};

const strokeLayerToLegacyStroke = (layer: StrokeLayer): Stroke => ({
	color: layer.paint,
	width: layer.width,
	style: inferStrokeStyle(layer.dashPattern),
	align: layer.align,
	cap: layer.cap,
	join: layer.join,
	miterLimit: layer.miterLimit,
	dashPattern: layer.dashPattern,
	dashOffset: layer.dashOffset,
	opacity: layer.opacity,
	blendMode: layer.blendMode,
	visible: layer.visible,
});

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
		const fillLayers = readFillLayers(node, options.generateId);
		const strokeLayers = readStrokeLayers(node, options.generateId);
		const legacyFill = fillLayers[0]?.paint ?? readFirstSolidFill(node);
		const legacyStroke = strokeLayers[0] ? strokeLayerToLegacyStroke(strokeLayers[0]) : readFirstSolidStroke(node);
		const nodeBlendMode = toLayerBlendMode(node.blendMode);
		const nodeMask =
			node.isMask === true
				? ({
						enabled: true,
						mode: typeof node.maskType === 'string' && node.maskType.toUpperCase() === 'LUMINANCE' ? 'luminance' : 'alpha',
					} satisfies NonNullable<Node['mask']>)
				: undefined;

		let mapped: Node | null = null;
		if (type === 'FRAME' || type === 'GROUP' || type === 'SECTION' || type === 'CANVAS') {
			mapped = {
				...base,
				type: type === 'FRAME' || type === 'CANVAS' ? 'frame' : 'group',
				children: [],
				fill: legacyFill,
				fills: fillLayers.length > 0 ? fillLayers : undefined,
				stroke: legacyStroke,
				strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
				blendMode: nodeBlendMode,
				mask: nodeMask,
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
						blendMode: nodeBlendMode,
						mask: nodeMask,
						aspectRatioLocked: true,
					};
				} else {
					mapped = {
						...base,
						type: 'rectangle',
						fill: legacyFill,
						fills: fillLayers.length > 0 ? fillLayers : undefined,
						stroke: legacyStroke,
						strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
						blendMode: nodeBlendMode,
						mask: nodeMask,
						cornerRadius: readCornerRadius(node),
					};
				}
			} else if (type === 'ELLIPSE') {
				mapped = {
					...base,
					type: 'ellipse',
					fill: legacyFill,
					fills: fillLayers.length > 0 ? fillLayers : undefined,
					stroke: legacyStroke,
					strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
					blendMode: nodeBlendMode,
					mask: nodeMask,
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
					fill: legacyFill,
					fills: fillLayers.length > 0 ? fillLayers : undefined,
					stroke: legacyStroke,
					strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
					blendMode: nodeBlendMode,
					mask: nodeMask,
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
					fill: legacyFill,
					fills: fillLayers.length > 0 ? fillLayers : undefined,
					stroke: legacyStroke,
					strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
					blendMode: nodeBlendMode,
					mask: nodeMask,
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
						blendMode: nodeBlendMode,
						mask: nodeMask,
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
						fill: legacyFill,
						fills: fillLayers.length > 0 ? fillLayers : undefined,
						stroke: legacyStroke,
						strokes: strokeLayers.length > 0 ? strokeLayers : undefined,
						blendMode: nodeBlendMode,
						mask: nodeMask,
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
