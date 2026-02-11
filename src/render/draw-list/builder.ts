import {
	ENABLE_AUTO_SHADOWS_V2,
	ENABLE_SHADOWS_V1,
	buildWorldBoundsMap,
	compileShadowEffects,
	normalizeShadowEffects,
	resolveNodeStyleProps,
	resolveShadowOverflow,
	type WorldBoundsMap,
} from '../../core/doc';
import { getNodePathData } from '../../core/doc/vector';
import type { Color, Document, Node, RenderableShadowEffect, ShadowEffect } from '../../core/doc/types';
import type {
	DrawCommand,
	FillLayerPaint,
	GradientPaint,
	GradientStop,
	ImagePaintResolved,
	ImageOutlineStyle,
	Paint,
	PatternPaint,
	StrokeLayerPaint,
} from './types';

type BuildDrawListOptions = {
	includeFrameFill?: boolean;
	clipToBounds?: boolean;
	textOverflowIndicatorNodeIds?: string[];
	hiddenNodeIds?: string[];
};

export const buildDrawList = (doc: Document, boundsMap?: WorldBoundsMap, options: BuildDrawListOptions = {}): DrawCommand[] => {
	const rootNode = doc.nodes[doc.rootId];
	if (!rootNode) {
		return [];
	}

	const map = boundsMap ?? buildWorldBoundsMap(doc);
	const overflowIndicatorIds =
		options.textOverflowIndicatorNodeIds && options.textOverflowIndicatorNodeIds.length > 0
			? new Set(options.textOverflowIndicatorNodeIds)
			: null;
	const hiddenNodeIds =
		options.hiddenNodeIds && options.hiddenNodeIds.length > 0 ? new Set(options.hiddenNodeIds) : null;
	const commands: DrawCommand[] = [];
	buildNodeCommandsFromBounds(doc, rootNode, commands, map, { x: 0, y: 0 }, doc.rootId, true, overflowIndicatorIds, hiddenNodeIds);

	return commands;
};

export const buildDrawListForNode = (
	doc: Document,
	nodeId: string,
	options: BuildDrawListOptions = {},
	boundsMap?: WorldBoundsMap,
): DrawCommand[] => {
	const node = doc.nodes[nodeId];
	if (!node) {
		return [];
	}

	const map = boundsMap ?? buildWorldBoundsMap(doc);
	const base = map[nodeId];
	if (!base) {
		return [];
	}

	const includeFrameFill = options.includeFrameFill !== false;
	const clipToBounds = options.clipToBounds === true;
	const commands: DrawCommand[] = [];
	if (clipToBounds) {
		commands.push({
			type: 'clip',
			x: 0,
			y: 0,
			width: base.width,
			height: base.height,
			cornerRadius: node.type === 'frame' ? node.cornerRadius : undefined,
		});
	}
	buildNodeCommandsFromBounds(doc, node, commands, map, base, nodeId, includeFrameFill, null, null);
	return commands;
};

const buildNodeCommandsFromBounds = (
	doc: Document,
	node: Node,
	commands: DrawCommand[],
	boundsMap: WorldBoundsMap,
	base: { x: number; y: number },
	rootId: string,
	includeRootFrameFill: boolean,
	overflowIndicatorIds: Set<string> | null,
	hiddenNodeIds: Set<string> | null,
): void => {
	const bounds = boundsMap[node.id];
	if (!bounds) {
		return;
	}

	const x = bounds.x - base.x;
	const y = bounds.y - base.y;
	const width = bounds.width;
	const height = bounds.height;
	const resolvedStyle = resolveNodeStyleProps(doc, node);

	if (node.visible === false) {
		return;
	}
	if (node.id !== rootId && hiddenNodeIds?.has(node.id)) {
		return;
	}

	if (node.type === 'frame') {
		const overflowMode = ENABLE_SHADOWS_V1
			? resolveShadowOverflow(node)
			: node.clipContent
				? 'clip-content-only'
				: 'visible';
		const clipFrame = ENABLE_SHADOWS_V1 && overflowMode === 'clipped';
		const clipChildrenOnly = overflowMode === 'clip-content-only';
		const shouldIncludeFill = node.id !== rootId || includeRootFrameFill;

		if (clipFrame) {
			commands.push({
				type: 'clip',
				x,
				y,
				width,
				height,
				cornerRadius: node.cornerRadius,
			});
		}

		if (resolvedStyle.fill && shouldIncludeFill) {
			commands.push({
				type: 'rect',
				nodeId: node.id,
				x,
				y,
				width,
				height,
				fill: colorToPaint(resolvedStyle.fill, doc),
				cornerRadius: node.cornerRadius,
				opacity: node.opacity,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}

		if (node.children && node.children.length > 0) {
			if (!clipFrame && clipChildrenOnly) {
				commands.push({
					type: 'clip',
					x,
					y,
					width,
					height,
					cornerRadius: node.cornerRadius,
				});
			}

			for (const childId of node.children) {
				const child = doc.nodes[childId];
				if (child) {
					buildNodeCommandsFromBounds(
						doc,
						child,
						commands,
						boundsMap,
						base,
						rootId,
						includeRootFrameFill,
						overflowIndicatorIds,
						hiddenNodeIds,
					);
				}
			}

			if (!clipFrame && clipChildrenOnly) {
				commands.push({ type: 'restore' });
			}
		}

		if (clipFrame) {
			commands.push({ type: 'restore' });
		}
	} else if (node.type === 'group') {
		// Groups are transparent containers - they don't render themselves,
		// only their children. This is Figma-style pure groups.
		if (node.children && node.children.length > 0) {
			for (const childId of node.children) {
				const child = doc.nodes[childId];
				if (child) {
					buildNodeCommandsFromBounds(
						doc,
						child,
						commands,
						boundsMap,
						base,
						rootId,
						includeRootFrameFill,
						overflowIndicatorIds,
						hiddenNodeIds,
					);
				}
			}
		}
	} else if (node.type === 'rectangle') {
		const fillLayers = resolveFillLayers(node, resolvedStyle.fill, true, doc);
		const strokeLayers = resolveStrokeLayers(node, undefined, doc);
		if (fillLayers.length > 0 || strokeLayers.length > 0) {
			commands.push({
				type: 'rect',
				nodeId: node.id,
				x,
				y,
				width,
				height,
				fill: fillLayers[0]?.paint,
				stroke: strokeLayers[0]?.paint,
				strokeWidth: strokeLayers[0]?.width,
				fills: fillLayers,
				strokes: strokeLayers,
				blendMode: node.blendMode,
				cornerRadius: node.cornerRadius,
				opacity: node.opacity,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}
	} else if (node.type === 'ellipse') {
		const fillLayers = resolveFillLayers(node, resolvedStyle.fill, true, doc);
		const strokeLayers = resolveStrokeLayers(node, undefined, doc);
		if (fillLayers.length > 0 || strokeLayers.length > 0) {
			commands.push({
				type: 'ellipse',
				nodeId: node.id,
				x: x + width / 2,
				y: y + height / 2,
				radiusX: width / 2,
				radiusY: height / 2,
				fill: fillLayers[0]?.paint,
				stroke: strokeLayers[0]?.paint,
				strokeWidth: strokeLayers[0]?.width,
				fills: fillLayers,
				strokes: strokeLayers,
				blendMode: node.blendMode,
				opacity: node.opacity,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}
	} else if (node.type === 'text') {
		commands.push({
			type: 'text',
			nodeId: node.id,
			x,
			y,
			width,
			height,
			text: node.text || '',
			font: `${resolvedStyle.fontWeight || 'normal'} ${resolvedStyle.fontSize || 14}px ${resolvedStyle.fontFamily || 'sans-serif'}`,
			fontSize: resolvedStyle.fontSize || 14,
			textAlign: resolvedStyle.textAlign ?? 'left',
			lineHeightPx: resolvedStyle.lineHeightPx,
			letterSpacingPx: resolvedStyle.letterSpacingPx ?? 0,
			textResizeMode: resolvedStyle.textResizeMode ?? 'auto-width',
			fill: colorToText(resolvedStyle.fill, doc),
			blendMode: node.blendMode,
			opacity: node.opacity,
			effects: getRenderableEffects(node, doc, resolvedStyle.effects),
		});
		if (overflowIndicatorIds?.has(node.id) && (resolvedStyle.textResizeMode ?? 'auto-width') === 'fixed') {
			commands.push({
				type: 'textOverflowIndicator',
				nodeId: node.id,
				x,
				y,
				width,
				height,
				opacity: node.opacity,
			});
		}
	} else if (node.type === 'image') {
		const src = resolveImageSource(doc, node);
		const maskSrc = resolveImageMaskSource(doc, node);
		const outline = resolveImageOutlineStyle(doc, node);
		if (src) {
			commands.push({
				type: 'image',
				nodeId: node.id,
				x,
				y,
				width,
				height,
				src,
				maskSrc,
				mask: node.mask,
				blendMode: node.blendMode,
				outline,
				opacity: node.opacity,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}
	} else if (node.type === 'boolean') {
		const isolationOperandId = node.booleanData?.isolationOperandId;
		if (isolationOperandId) {
			const isolatedChild = doc.nodes[isolationOperandId];
			if (isolatedChild) {
				buildNodeCommandsFromBounds(
					doc,
					isolatedChild,
					commands,
					boundsMap,
					base,
					rootId,
					includeRootFrameFill,
					overflowIndicatorIds,
					hiddenNodeIds,
				);
			}
			return;
		}

		const pathData = getNodePathData(node, doc);
		const fallbackOperandId = node.children?.[0];
		const fallbackOperand = fallbackOperandId ? doc.nodes[fallbackOperandId] : null;
		const fillLayers = resolveFillLayers(node, resolvedStyle.fill ?? fallbackOperand?.fill, true, doc);
		const strokeLayers = resolveStrokeLayers(node, node.stroke ?? fallbackOperand?.stroke, doc);
		if (pathData && (fillLayers.length > 0 || strokeLayers.length > 0)) {
			commands.push({
				type: 'path',
				nodeId: node.id,
				d: pathData.d,
				x,
				y,
				width,
				height,
				fill: fillLayers[0]?.paint,
				stroke: strokeLayers[0]?.paint,
				strokeWidth: strokeLayers[0]?.width,
				fills: fillLayers,
				strokes: strokeLayers,
				blendMode: node.blendMode,
				opacity: node.opacity,
				fillRule: pathData.fillRule,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}
	} else if (node.type === 'path') {
		const pathData = getNodePathData(node, doc);
		const allowFill = node.vector ? node.vector.closed : true;
		const fillLayers = resolveFillLayers(node, resolvedStyle.fill, allowFill, doc);
		const strokeLayers = resolveStrokeLayers(node, undefined, doc);
		if (pathData && (fillLayers.length > 0 || strokeLayers.length > 0)) {
			commands.push({
				type: 'path',
				nodeId: node.id,
				d: pathData.d,
				x,
				y,
				width,
				height,
				fill: fillLayers[0]?.paint,
				stroke: strokeLayers[0]?.paint,
				strokeWidth: strokeLayers[0]?.width,
				fills: fillLayers,
				strokes: strokeLayers,
				blendMode: node.blendMode,
				opacity: node.opacity,
				fillRule: pathData.fillRule,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		} else if (fillLayers.length > 0) {
			const color = fillLayers[0]?.paint;
			commands.push({
				type: 'rect',
				nodeId: node.id,
				x,
				y,
				width,
				height,
				fill: color,
				fills: fillLayers,
				blendMode: node.blendMode,
				opacity: node.opacity,
				effects: getRenderableEffects(node, doc, resolvedStyle.effects),
			});
		}
	} else if (node.type === 'componentInstance') {
		if (node.children && node.children.length > 0) {
			for (const childId of node.children) {
				const child = doc.nodes[childId];
				if (child) {
					buildNodeCommandsFromBounds(
						doc,
						child,
						commands,
						boundsMap,
						base,
						rootId,
						includeRootFrameFill,
						overflowIndicatorIds,
						hiddenNodeIds,
					);
				}
			}
		}
	}
};

const getRenderableEffects = (node: Node, doc: Document, resolvedEffects?: ShadowEffect[]): RenderableShadowEffect[] | undefined => {
	if (!ENABLE_SHADOWS_V1) return undefined;
	const effectNode = resolvedEffects ? { ...node, effects: resolvedEffects } : node;
	const effects = ENABLE_AUTO_SHADOWS_V2 ? compileShadowEffects(effectNode, doc) : normalizeShadowEffects(effectNode.effects);
	return effects.length > 0 ? effects : undefined;
};

const DEFAULT_FALLBACK_COLOR = '#000000';
const DEFAULT_IMAGE_OUTLINE_COLOR = '#ffffff';
const DEFAULT_IMAGE_OUTLINE_WIDTH = 12;
const DEFAULT_IMAGE_OUTLINE_BLUR = 0;

const resolveFillLayers = (node: Node, fallbackFill: Color | undefined, allowFill: boolean, doc: Document): FillLayerPaint[] => {
	if (!allowFill) return [];
	const explicitLayers =
		node.fills?.flatMap((layer): FillLayerPaint[] => {
			if (layer.visible === false) return [];
			const paint = colorToPaint(layer.paint, doc);
			if (!paint) return [];
			const next: FillLayerPaint = { paint };
			if (typeof layer.opacity === 'number') next.opacity = layer.opacity;
			if (typeof layer.visible === 'boolean') next.visible = layer.visible;
			if (typeof layer.blendMode === 'string') next.blendMode = layer.blendMode;
			return [next];
		}) ?? [];
	if (explicitLayers && explicitLayers.length > 0) {
		return explicitLayers;
	}
	const legacyFill = fallbackFill ?? node.fill;
	const paint = colorToPaint(legacyFill, doc);
	if (!paint) return [];
	return [{ paint, opacity: 1, visible: true, blendMode: 'normal' } satisfies FillLayerPaint];
};

const resolveLegacyDashPattern = (stroke: Node['stroke']): number[] | undefined => {
	if (!stroke) return undefined;
	if (Array.isArray(stroke.dashPattern) && stroke.dashPattern.length > 0) {
		return stroke.dashPattern.filter((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0);
	}
	if (stroke.style === 'dashed') {
		return [Math.max(1, stroke.width * 2), Math.max(1, stroke.width * 1.5)];
	}
	if (stroke.style === 'dotted') {
		return [1, Math.max(1, stroke.width)];
	}
	return undefined;
};

const resolveStrokeLayers = (node: Node, fallbackStroke: Node['stroke'] | undefined, doc: Document): StrokeLayerPaint[] => {
	const explicitLayers =
		node.strokes?.flatMap((layer): StrokeLayerPaint[] => {
			if (layer.visible === false || layer.width <= 0) return [];
			const paint = colorToPaint(layer.paint, doc);
			if (!paint) return [];
			const next: StrokeLayerPaint = {
				paint,
				width: layer.width,
			};
			if (layer.align) next.align = layer.align;
			if (layer.cap) next.cap = layer.cap;
			if (layer.join) next.join = layer.join;
			if (typeof layer.miterLimit === 'number') next.miterLimit = layer.miterLimit;
			if (Array.isArray(layer.dashPattern)) next.dashPattern = [...layer.dashPattern];
			if (typeof layer.dashOffset === 'number') next.dashOffset = layer.dashOffset;
			if (typeof layer.opacity === 'number') next.opacity = layer.opacity;
			if (typeof layer.visible === 'boolean') next.visible = layer.visible;
			if (typeof layer.blendMode === 'string') next.blendMode = layer.blendMode;
			return [next];
		}) ?? [];
	if (explicitLayers && explicitLayers.length > 0) {
		return explicitLayers;
	}
	const legacyStroke = node.stroke ?? fallbackStroke;
	if (!legacyStroke || legacyStroke.width <= 0) return [];
	const paint = colorToPaint(legacyStroke.color, doc);
	if (!paint) return [];
	return [
		{
			paint,
			width: legacyStroke.width,
			align: legacyStroke.align,
			cap: legacyStroke.cap,
			join: legacyStroke.join,
			miterLimit: legacyStroke.miterLimit,
			dashPattern: resolveLegacyDashPattern(legacyStroke),
			dashOffset: legacyStroke.dashOffset,
			opacity: legacyStroke.opacity,
			visible: legacyStroke.visible,
			blendMode: legacyStroke.blendMode,
		},
	];
};

const buildPatternPaint = (color: Extract<Color, { type: 'pattern' }>): PatternPaint => ({
	type: 'pattern',
	pattern: color.pattern,
	fg: color.fg,
	bg: color.bg,
	scale: Number.isFinite(color.scale) ? Math.max(0.1, color.scale) : 1,
	rotation: Number.isFinite(color.rotation) ? color.rotation : 0,
	opacity: typeof color.opacity === 'number' ? clamp01(color.opacity) : undefined,
});

const buildImagePaint = (doc: Document, color: Extract<Color, { type: 'image' }>): ImagePaintResolved | null => {
	const asset = doc.assets[color.assetId];
	if (!asset || asset.type !== 'image' || !asset.dataBase64 || !asset.mime) {
		return null;
	}
	return {
		type: 'image',
		src: `data:${asset.mime};base64,${asset.dataBase64}`,
		fit: color.fit,
		opacity: typeof color.opacity === 'number' ? clamp01(color.opacity) : undefined,
		tileScale: typeof color.tileScale === 'number' ? Math.max(0.01, color.tileScale) : undefined,
		tileOffsetX: typeof color.tileOffsetX === 'number' ? color.tileOffsetX : undefined,
		tileOffsetY: typeof color.tileOffsetY === 'number' ? color.tileOffsetY : undefined,
		rotation: typeof color.rotation === 'number' ? color.rotation : undefined,
	};
};

const colorToPaint = (color: Color | string | undefined, doc: Document): Paint | undefined => {
	if (!color) {
		return undefined;
	}
	if (typeof color === 'string') {
		return color;
	}
	if (color.type === 'solid' && typeof color.value === 'string') {
		return color.value;
	}
	if (color.type === 'gradient') {
		const gradient = buildGradientPaint(color);
		return gradient ?? DEFAULT_FALLBACK_COLOR;
	}
	if (color.type === 'pattern') {
		return buildPatternPaint(color);
	}
	if (color.type === 'image') {
		return buildImagePaint(doc, color) ?? DEFAULT_FALLBACK_COLOR;
	}
	return DEFAULT_FALLBACK_COLOR;
};

const colorToText = (color: Color | string | undefined, doc: Document): string => {
	const paint = colorToPaint(color, doc);
	if (!paint) {
		return DEFAULT_FALLBACK_COLOR;
	}
	if (typeof paint === 'string') {
		return paint;
	}
	if (paint.type === 'gradient') {
		return paint.stops[0]?.color ?? DEFAULT_FALLBACK_COLOR;
	}
	if (paint.type === 'pattern') {
		return paint.fg;
	}
	return DEFAULT_FALLBACK_COLOR;
};

const buildGradientPaint = (
	color: Extract<Color, { type: 'gradient' }> & Record<string, unknown>,
): GradientPaint | null => {
	const stops = normalizeGradientStops(color.stops);
	if (stops.length === 0) {
		return null;
	}

	const kind = normalizeGradientKind(color);
	const gradient: GradientPaint = {
		type: 'gradient',
		stops,
		...(kind ? { kind } : {}),
	};

	const from = readPoint(color.from ?? color.start ?? color.p0 ?? color.handleStart);
	const to = readPoint(color.to ?? color.end ?? color.p1 ?? color.handleEnd);
	const center = readPoint(color.center ?? color.mid);
	if (from) gradient.from = from;
	if (to) gradient.to = to;
	if (center) gradient.center = center;

	const angle = typeof color.angle === 'number' ? color.angle : undefined;
	const radius = typeof color.radius === 'number' ? color.radius : undefined;
	const innerRadius = typeof color.innerRadius === 'number' ? color.innerRadius : undefined;
	if (typeof angle === 'number') gradient.angle = angle;
	if (typeof radius === 'number') gradient.radius = radius;
	if (typeof innerRadius === 'number') gradient.innerRadius = innerRadius;

	return gradient;
};

const normalizeGradientKind = (
	color: Extract<Color, { type: 'gradient' }> & Record<string, unknown>,
): 'linear' | 'radial' | undefined => {
	const raw = color.kind ?? color.gradientType ?? color.mode ?? color.style;
	if (typeof raw !== 'string') {
		return undefined;
	}
	const normalized = raw.toLowerCase();
	if (normalized === 'linear') return 'linear';
	if (normalized === 'radial') return 'radial';
	return undefined;
};

const normalizeGradientStops = (rawStops: unknown): GradientStop[] => {
	if (!Array.isArray(rawStops) || rawStops.length === 0) {
		return [];
	}

	const total = rawStops.length;
	const normalized: GradientStop[] = [];

	rawStops.forEach((stop, index) => {
		const offset = clamp01(resolveStopOffset(stop, index, total));
		const color = resolveStopColor(stop);
		if (!color) {
			return;
		}
		normalized.push({ offset, color });
	});

	if (normalized.length === 0) {
		return [];
	}

	normalized.sort((a, b) => a.offset - b.offset);
	if (normalized.length === 1) {
		const single = normalized[0];
		normalized.push({ offset: 1, color: single.color });
	}
	return normalized;
};

const resolveStopOffset = (stop: unknown, index: number, total: number): number => {
	if (typeof stop === 'number') {
		return normalizeOffset(stop);
	}
	if (stop && typeof stop === 'object') {
		const obj = stop as Record<string, unknown>;
		const raw =
			(typeof obj.position === 'number' ? obj.position : undefined) ??
			(typeof obj.offset === 'number' ? obj.offset : undefined) ??
			(typeof obj.t === 'number' ? obj.t : undefined) ??
			(typeof obj.stop === 'number' ? obj.stop : undefined) ??
			(typeof obj.at === 'number' ? obj.at : undefined);
		if (typeof raw === 'number') {
			return normalizeOffset(raw);
		}
	}
	if (total <= 1) {
		return 0;
	}
	return index / (total - 1);
};

const normalizeOffset = (value: number): number => {
	if (!Number.isFinite(value)) {
		return 0;
	}
	if (value > 1 && value <= 100) {
		return value / 100;
	}
	return value;
};

const resolveStopColor = (stop: unknown): string | null => {
	if (typeof stop === 'string') {
		return stop;
	}
	if (stop && typeof stop === 'object') {
		const obj = stop as Record<string, unknown>;
		if (typeof obj.color === 'string') {
			return obj.color;
		}
		if (typeof obj.value === 'string') {
			return obj.value;
		}
		if (typeof obj.hex === 'string') {
			return obj.hex;
		}
		if (obj.color && typeof obj.color === 'object') {
			const nested = resolveStopColor(obj.color);
			if (nested) return nested;
		}
		if (obj.fill && typeof obj.fill === 'object') {
			const nested = resolveStopColor(obj.fill);
			if (nested) return nested;
		}
		if (typeof obj.r === 'number' && typeof obj.g === 'number' && typeof obj.b === 'number') {
			const a = typeof obj.a === 'number' ? obj.a : undefined;
			return rgbaFromComponents({ r: obj.r, g: obj.g, b: obj.b, a });
		}
		if (typeof obj.red === 'number' && typeof obj.green === 'number' && typeof obj.blue === 'number') {
			const aVal = typeof obj.alpha === 'number' ? obj.alpha : obj.opacity;
			const a = typeof aVal === 'number' ? aVal : undefined;
			return rgbaFromComponents({
				r: obj.red,
				g: obj.green,
				b: obj.blue,
				a,
			});
		}
	}
	return null;
};

const rgbaFromComponents = (input: { r: number; g: number; b: number; a?: number }): string => {
	const toByte = (value: number): number => {
		if (!Number.isFinite(value)) return 0;
		const scaled = value <= 1 ? value * 255 : value;
		return Math.max(0, Math.min(255, Math.round(scaled)));
	};
	const r = toByte(input.r);
	const g = toByte(input.g);
	const b = toByte(input.b);
	const alpha = typeof input.a === 'number' && Number.isFinite(input.a) ? Math.max(0, Math.min(1, input.a)) : 1;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const readPoint = (value: unknown): { x: number; y: number } | undefined => {
	if (!value) {
		return undefined;
	}
	if (Array.isArray(value)) {
		if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
			return { x: value[0], y: value[1] };
		}
		return undefined;
	}
	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (typeof obj.x === 'number' && typeof obj.y === 'number') {
			return { x: obj.x, y: obj.y };
		}
	}
	return undefined;
};

const clamp01 = (value: number): number => {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(1, value));
};

const resolveImageSource = (doc: Document, node: Node): string | null => {
	const assetId = node.image?.assetId;
	if (assetId) {
		const asset = doc.assets?.[assetId];
		if (asset && asset.type === 'image' && asset.dataBase64 && asset.mime) {
			return `data:${asset.mime};base64,${asset.dataBase64}`;
		}
	}
	return node.image?.src || null;
};

const resolveImageMaskSource = (doc: Document, node: Node, visited: Set<string> = new Set()): string | undefined => {
	if (visited.has(node.id)) return undefined;
	visited.add(node.id);

	const maskAssetId = node.image?.maskAssetId;
	if (maskAssetId) {
		const asset = doc.assets?.[maskAssetId];
		if (asset && asset.type === 'image' && asset.dataBase64 && asset.mime) {
			return `data:${asset.mime};base64,${asset.dataBase64}`;
		}
	}

	if (node.mask?.enabled && node.mask.sourceNodeId) {
		const maskSourceNode = doc.nodes[node.mask.sourceNodeId];
		if (maskSourceNode?.type === 'image') {
			const sourceMask = resolveImageMaskSource(doc, maskSourceNode, visited);
			if (sourceMask) return sourceMask;
			const sourceImage = resolveImageSource(doc, maskSourceNode);
			if (sourceImage) return sourceImage;
		}
	}

	return undefined;
};

const resolveImageOutlineStyle = (doc: Document, node: Node): ImageOutlineStyle | undefined => {
	const outline = node.image?.outline;
	if (!outline || outline.enabled !== true) {
		return undefined;
	}

	if (!resolveImageMaskSource(doc, node)) {
		return undefined;
	}

	return {
		color:
			typeof outline.color === 'string' && outline.color.trim().length > 0
				? outline.color
				: DEFAULT_IMAGE_OUTLINE_COLOR,
		width: typeof outline.width === 'number' && Number.isFinite(outline.width) ? Math.max(0, outline.width) : DEFAULT_IMAGE_OUTLINE_WIDTH,
		blur: typeof outline.blur === 'number' && Number.isFinite(outline.blur) ? Math.max(0, outline.blur) : DEFAULT_IMAGE_OUTLINE_BLUR,
	};
};

export const colorToRGBA = (color: string): { r: number; g: number; b: number; a: number } => {
	const hex = color.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
	return { r, g, b, a };
};
