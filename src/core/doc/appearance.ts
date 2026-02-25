import type { Color, LayerBlendMode, Node, PaintLayer, Stroke, StrokeLayer } from './types';

const DEFAULT_LAYER_BLEND_MODE: LayerBlendMode = 'normal';
const DEFAULT_STROKE_ALIGN: StrokeLayer['align'] = 'center';
const DEFAULT_STROKE_CAP: StrokeLayer['cap'] = 'butt';
const DEFAULT_STROKE_JOIN: StrokeLayer['join'] = 'miter';
const LEGACY_FALLBACK_SOLID = '#808080';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const inferLegacyStrokeStyle = (stroke: Pick<StrokeLayer, 'dashPattern'>): Stroke['style'] => {
	if (!stroke.dashPattern || stroke.dashPattern.length === 0) return 'solid';
	if (stroke.dashPattern.length >= 2) {
		const [first, second] = stroke.dashPattern;
		if (first <= 1.5 && second >= 1) {
			return 'dotted';
		}
	}
	return 'dashed';
};

const normalizeColor = (color: Color): Color => {
	if (color.type === 'solid') {
		return { type: 'solid', value: color.value };
	}
	if (color.type === 'pattern') {
		return {
			type: 'pattern',
			pattern: color.pattern,
			fg: color.fg,
			bg: color.bg,
			scale: Math.max(0.1, isFiniteNumber(color.scale) ? color.scale : 1),
			rotation: isFiniteNumber(color.rotation) ? color.rotation : 0,
			opacity: isFiniteNumber(color.opacity) ? clamp01(color.opacity) : undefined,
		};
	}
	if (color.type === 'image') {
		return {
			type: 'image',
			assetId: color.assetId,
			fit: color.fit,
			opacity: isFiniteNumber(color.opacity) ? clamp01(color.opacity) : undefined,
			tileScale: isFiniteNumber(color.tileScale) ? Math.max(0.01, color.tileScale) : undefined,
			tileOffsetX: isFiniteNumber(color.tileOffsetX) ? color.tileOffsetX : undefined,
			tileOffsetY: isFiniteNumber(color.tileOffsetY) ? color.tileOffsetY : undefined,
			rotation: isFiniteNumber(color.rotation) ? color.rotation : undefined,
		};
	}

	const rawStops = Array.isArray(color.stops) ? color.stops : [];
	const normalizedStops = rawStops
		.filter((stop): stop is { offset: number; color: string } => isFiniteNumber(stop?.offset) && typeof stop?.color === 'string')
		.map((stop) => ({ offset: clamp01(stop.offset), color: stop.color }));
	const stops = normalizedStops.length > 0 ? normalizedStops : [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }];
	return {
		...color,
		kind: color.kind === 'radial' ? 'radial' : 'linear',
		stops,
	};
};

const toLegacyCompatibleColor = (paint: Color): Color => {
	if (paint.type === 'solid' || paint.type === 'gradient') {
		return paint;
	}
	return {
		type: 'solid',
		value: LEGACY_FALLBACK_SOLID,
	};
};

const normalizePaintLayer = (layer: PaintLayer, fallbackId: string): PaintLayer => ({
	id: layer.id || fallbackId,
	visible: layer.visible ?? true,
	opacity: clamp01(isFiniteNumber(layer.opacity) ? layer.opacity : 1),
	blendMode: layer.blendMode ?? DEFAULT_LAYER_BLEND_MODE,
	paint: normalizeColor(layer.paint),
});

const normalizeStrokeLayer = (layer: StrokeLayer, fallbackId: string): StrokeLayer => {
	const dashPattern = Array.isArray(layer.dashPattern)
		? layer.dashPattern.filter((value): value is number => isFiniteNumber(value) && value >= 0)
		: undefined;
	return {
		id: layer.id || fallbackId,
		visible: layer.visible ?? true,
		opacity: clamp01(isFiniteNumber(layer.opacity) ? layer.opacity : 1),
		blendMode: layer.blendMode ?? DEFAULT_LAYER_BLEND_MODE,
		paint: normalizeColor(layer.paint),
		width: Math.max(0, isFiniteNumber(layer.width) ? layer.width : 0),
		align: layer.align ?? DEFAULT_STROKE_ALIGN,
		cap: layer.cap ?? DEFAULT_STROKE_CAP,
		join: layer.join ?? DEFAULT_STROKE_JOIN,
		miterLimit: isFiniteNumber(layer.miterLimit) ? Math.max(0, layer.miterLimit) : undefined,
		dashPattern: dashPattern && dashPattern.length > 0 ? dashPattern : undefined,
		dashOffset: isFiniteNumber(layer.dashOffset) ? layer.dashOffset : undefined,
	};
};

export const buildPaintLayerFromLegacyFill = (fill: Color, id = 'fill_1'): PaintLayer =>
	normalizePaintLayer(
		{
			id,
			visible: true,
			opacity: 1,
			blendMode: DEFAULT_LAYER_BLEND_MODE,
			paint: fill,
		},
		id,
	);

export const buildStrokeLayerFromLegacyStroke = (stroke: Stroke, id = 'stroke_1'): StrokeLayer => {
	const dashPattern =
		stroke.dashPattern && stroke.dashPattern.length > 0
			? stroke.dashPattern
			: stroke.style === 'dotted'
				? [1, Math.max(1, stroke.width)]
				: stroke.style === 'dashed'
					? [Math.max(1, stroke.width * 2), Math.max(1, stroke.width * 1.5)]
					: undefined;
	return normalizeStrokeLayer(
		{
			id,
			visible: stroke.visible ?? true,
			opacity: isFiniteNumber(stroke.opacity) ? stroke.opacity : 1,
			blendMode: stroke.blendMode ?? DEFAULT_LAYER_BLEND_MODE,
			paint: stroke.color,
			width: stroke.width,
			align: stroke.align,
			cap: stroke.cap,
			join: stroke.join,
			miterLimit: stroke.miterLimit,
			dashPattern,
			dashOffset: stroke.dashOffset,
		},
		id,
	);
};

export const buildLegacyFillFromPaintLayers = (fills: PaintLayer[] | undefined): Color | undefined => {
	const firstVisible = fills?.find((layer) => layer.visible !== false);
	return firstVisible ? toLegacyCompatibleColor(firstVisible.paint) : undefined;
};

export const buildLegacyStrokeFromStrokeLayers = (strokes: StrokeLayer[] | undefined): Stroke | undefined => {
	const firstVisible = strokes?.find((layer) => layer.visible !== false);
	if (!firstVisible) return undefined;
	return {
		color: toLegacyCompatibleColor(firstVisible.paint),
		width: firstVisible.width,
		style: inferLegacyStrokeStyle(firstVisible),
		align: firstVisible.align,
		cap: firstVisible.cap,
		join: firstVisible.join,
		miterLimit: firstVisible.miterLimit,
		dashPattern: firstVisible.dashPattern,
		dashOffset: firstVisible.dashOffset,
		opacity: firstVisible.opacity,
		blendMode: firstVisible.blendMode,
		visible: firstVisible.visible,
	};
};

export const normalizeNodeAppearance = (node: Node): Node => {
	const nextFills =
		node.fills && node.fills.length > 0
			? node.fills.map((layer, index) => normalizePaintLayer(layer, `fill_${index + 1}`))
			: node.fill
				? [buildPaintLayerFromLegacyFill(node.fill)]
				: undefined;

	const nextStrokes =
		node.strokes && node.strokes.length > 0
			? node.strokes.map((layer, index) => normalizeStrokeLayer(layer, `stroke_${index + 1}`))
			: node.stroke
				? [buildStrokeLayerFromLegacyStroke(node.stroke)]
				: undefined;

	return {
		...node,
		fills: nextFills,
		strokes: nextStrokes,
		fill: buildLegacyFillFromPaintLayers(nextFills),
		stroke: buildLegacyStrokeFromStrokeLayers(nextStrokes),
		blendMode: node.blendMode ?? DEFAULT_LAYER_BLEND_MODE,
	};
};

export const getNodeStrokeWidthsForHitTesting = (node: Node): number[] => {
	const widths: number[] = [];
	if (node.stroke && isFiniteNumber(node.stroke.width)) {
		const factor = node.stroke.align === 'outside' ? 2 : 1;
		widths.push(Math.max(0, node.stroke.width * factor));
	}
	for (const layer of node.strokes ?? []) {
		if (!isFiniteNumber(layer.width) || layer.visible === false) continue;
		const factor = layer.align === 'outside' ? 2 : 1;
		widths.push(Math.max(0, layer.width * factor));
	}
	return widths;
};

export const DEFAULT_LAYER_BLEND: LayerBlendMode = DEFAULT_LAYER_BLEND_MODE;
