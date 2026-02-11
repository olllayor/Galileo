import {
	ENABLE_SHADOWS_V1,
	mapShadowBlendModeToComposite,
	recordShadowCacheHit,
	recordShadowCacheMiss,
	recordShadowRenderDuration,
} from '../../core/doc';
import { layoutText } from '../../core/text/layout';
import type { LayerBlendMode, RenderableShadowEffect } from '../../core/doc/types';
import type { DrawCommand, FillLayerPaint, GradientPaint, ImagePaintResolved, Paint, PatternPaint, StrokeLayerPaint } from '../draw-list';

type DrawableCommand = Extract<DrawCommand, { type: 'rect' | 'text' | 'ellipse' | 'image' | 'path' }>;

type ShadowRaster = {
	canvas: HTMLCanvasElement;
	offsetX: number;
	offsetY: number;
	blendMode: GlobalCompositeOperation;
};

type OutlineRaster = {
	canvas: HTMLCanvasElement;
};

const SHADOW_CACHE_LIMIT = 120;
const OUTLINE_CACHE_LIMIT = 120;

const mapLayerBlendModeToComposite = (blendMode: LayerBlendMode | undefined): GlobalCompositeOperation => {
	switch (blendMode) {
		case 'multiply':
		case 'screen':
		case 'overlay':
		case 'darken':
		case 'lighten':
		case 'color-dodge':
		case 'color-burn':
		case 'hard-light':
		case 'soft-light':
		case 'difference':
		case 'exclusion':
		case 'hue':
		case 'saturation':
		case 'color':
		case 'luminosity':
			return blendMode;
		case 'normal':
		default:
			return 'source-over';
	}
};

export class CanvasRenderer {
	private ctx: CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private imageCache: Map<string, HTMLImageElement>;
	private patternTileCache: Map<string, HTMLCanvasElement>;
	private shadowRasterCache: Map<string, ShadowRaster>;
	private outlineRasterCache: Map<string, OutlineRaster>;
	private onInvalidate?: () => void;

	constructor(canvas: HTMLCanvasElement, onInvalidate?: () => void) {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Could not get canvas 2D context');
		}
		this.ctx = ctx;
		this.width = canvas.width;
		this.height = canvas.height;
		this.imageCache = new Map();
		this.patternTileCache = new Map();
		this.shadowRasterCache = new Map();
		this.outlineRasterCache = new Map();
		this.onInvalidate = onInvalidate;
	}

	public render(drawCommands: DrawCommand[], view?: { pan: { x: number; y: number }; zoom: number }): void {
		this.clear();

		const zoom = view?.zoom ?? 1;
		const pan = view?.pan ?? { x: 0, y: 0 };
		this.ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);

		for (const command of drawCommands) {
			this.executeCommand(command);
		}
	}

	private clear(): void {
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.width, this.height);
	}

	private executeCommand(command: DrawCommand): void {
		const commandBlendMode =
			'blendMode' in command && typeof command.blendMode === 'string'
				? mapLayerBlendModeToComposite(command.blendMode as LayerBlendMode)
				: null;
		if (commandBlendMode) {
			this.ctx.save();
			this.ctx.globalCompositeOperation = commandBlendMode;
		}

		const opacity = 'opacity' in command ? command.opacity : undefined;
		if (typeof opacity === 'number') {
			this.ctx.save();
			this.ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
		}

		switch (command.type) {
			case 'rect':
			case 'text':
			case 'ellipse':
			case 'image':
			case 'path':
				this.drawCommandWithEffects(command);
				break;
			case 'textOverflowIndicator':
				this.drawTextOverflowIndicator(command);
				break;
			case 'clip':
				this.applyClip(command);
				break;
			case 'restore':
				this.ctx.restore();
				break;
			case 'transform':
				this.applyTransform(command);
				break;
		}

		if (typeof opacity === 'number') {
			this.ctx.restore();
		}
		if (commandBlendMode) {
			this.ctx.restore();
		}
	}

	private drawCommandWithEffects(command: DrawableCommand): void {
		if (!ENABLE_SHADOWS_V1) {
			this.drawCommandBase(command);
			return;
		}
		const effects = this.getEnabledEffects(command.effects);
		if (effects.length === 0) {
			this.drawCommandBase(command);
			return;
		}

		const dropEffects = effects.filter((effect) => effect.type === 'drop');
		const innerEffects = effects.filter((effect) => effect.type === 'inner');

		for (const effect of dropEffects) {
			this.drawDropShadow(command, effect);
		}

		this.drawCommandBase(command);

		for (const effect of innerEffects) {
			this.drawInnerShadow(command, effect);
		}
	}

	private drawDropShadow(command: DrawableCommand, effect: RenderableShadowEffect): void {
		if (this.canUseNativeDropShadow(command, effect)) {
			this.drawNativeDropShadow(command, effect);
			return;
		}
		this.drawRasterShadow(command, effect, 'drop');
	}

	private drawInnerShadow(command: DrawableCommand, effect: RenderableShadowEffect): void {
		this.drawRasterShadow(command, effect, 'inner');
	}

	private drawRasterShadow(command: DrawableCommand, effect: RenderableShadowEffect, kind: 'drop' | 'inner'): void {
		const startedAt = performance.now();
		const bounds = this.getCommandBounds(command);
		if (!bounds) {
			return;
		}
		const raster = this.getShadowRaster(command, effect, kind);
		if (!raster) {
			return;
		}

		this.ctx.save();
		this.ctx.globalCompositeOperation = raster.blendMode;
		this.ctx.drawImage(raster.canvas, bounds.x + raster.offsetX, bounds.y + raster.offsetY);
		this.ctx.restore();
		recordShadowRenderDuration(performance.now() - startedAt);
	}

	private canUseNativeDropShadow(command: DrawableCommand, effect: RenderableShadowEffect): boolean {
		if (effect.type !== 'drop') return false;
		if (Math.abs(effect.spread) > 0.001) return false;
		if ((effect.blendMode ?? 'normal') !== 'normal') return false;
		return command.type === 'rect' || command.type === 'ellipse';
	}

	private drawNativeDropShadow(command: DrawableCommand, effect: RenderableShadowEffect): void {
		this.ctx.save();
		this.ctx.globalCompositeOperation = 'source-over';
		this.ctx.globalAlpha *= Math.max(0, Math.min(1, effect.opacity));
		this.ctx.shadowColor = effect.color;
		this.ctx.shadowBlur = Math.max(0, effect.blur);
		this.ctx.shadowOffsetX = effect.x;
		this.ctx.shadowOffsetY = effect.y;
		this.drawCommandSilhouette(command, 'rgba(0,0,0,0)');
		this.ctx.restore();
	}

	private drawCommandSilhouette(command: DrawableCommand, color: string): void {
		if (command.type === 'rect') {
			this.ctx.beginPath();
			if (command.cornerRadius && command.cornerRadius > 0) {
				const r = Math.min(command.cornerRadius, command.width / 2, command.height / 2);
				this.ctx.roundRect(command.x, command.y, command.width, command.height, r);
			} else {
				this.ctx.rect(command.x, command.y, command.width, command.height);
			}
			this.ctx.fillStyle = color;
			this.ctx.fill();
			return;
		}
		if (command.type === 'ellipse') {
			this.ctx.beginPath();
			this.ctx.ellipse(command.x, command.y, command.radiusX, command.radiusY, 0, 0, Math.PI * 2);
			this.ctx.fillStyle = color;
			this.ctx.fill();
		}
	}

	private getShadowRaster(
		command: DrawableCommand,
		effect: RenderableShadowEffect,
		kind: 'drop' | 'inner',
	): ShadowRaster | null {
		const bounds = this.getCommandBounds(command);
		if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
			return null;
		}

		const padding = this.computeShadowPadding(effect);
		const originX = -padding;
		const originY = -padding;
		const width = Math.max(1, Math.ceil(bounds.width + padding * 2));
		const height = Math.max(1, Math.ceil(bounds.height + padding * 2));

		const key = this.buildShadowCacheKey(command, effect, kind, {
			width,
			height,
		});
		const cached = this.getCachedShadowRaster(key);
		if (cached) {
			return cached;
		}

		const baseMask = this.createCanvas(width, height);
		const baseCtx = baseMask.getContext('2d');
		if (!baseCtx) return null;

		const inset = effect.spread < 0 ? Math.abs(effect.spread) : 0;
		const drew = this.drawCommandAlphaMask(baseCtx, command, bounds.x + originX, bounds.y + originY, inset);
		if (!drew) {
			return null;
		}

		let shadowMask = baseMask;
		if (effect.spread > 0) {
			shadowMask = this.applyPositiveSpread(baseMask, effect.spread);
		}

		const blurred = this.applyBlur(shadowMask, effect.blur);
		let outputMask: HTMLCanvasElement;
		let offsetX = originX;
		let offsetY = originY;

		if (kind === 'inner') {
			outputMask = this.buildInnerShadowMask(blurred, baseMask, effect.x, effect.y);
		} else {
			outputMask = blurred;
			offsetX += effect.x;
			offsetY += effect.y;
		}

		const tinted = this.tintMask(outputMask, effect.color, effect.opacity);
		const raster: ShadowRaster = {
			canvas: tinted,
			offsetX,
			offsetY,
			blendMode: mapShadowBlendModeToComposite(effect.blendMode),
		};
		this.setCachedShadowRaster(key, raster);
		return raster;
	}

	private buildInnerShadowMask(
		blurred: HTMLCanvasElement,
		baseMask: HTMLCanvasElement,
		offsetX: number,
		offsetY: number,
	): HTMLCanvasElement {
		const edgeMask = this.cloneCanvas(blurred);
		const edgeCtx = edgeMask.getContext('2d');
		if (!edgeCtx) return blurred;

		edgeCtx.globalCompositeOperation = 'destination-out';
		edgeCtx.drawImage(baseMask, 0, 0);
		edgeCtx.globalCompositeOperation = 'source-over';

		const innerMask = this.createCanvas(blurred.width, blurred.height);
		const innerCtx = innerMask.getContext('2d');
		if (!innerCtx) return blurred;

		innerCtx.drawImage(edgeMask, offsetX, offsetY);
		innerCtx.globalCompositeOperation = 'destination-in';
		innerCtx.drawImage(baseMask, 0, 0);
		innerCtx.globalCompositeOperation = 'source-over';
		return innerMask;
	}

	private applyPositiveSpread(mask: HTMLCanvasElement, spread: number): HTMLCanvasElement {
		const radius = Math.max(0, Math.min(24, Math.round(spread)));
		if (radius <= 0) return mask;

		const source = this.cloneCanvas(mask);
		const spreadCanvas = this.createCanvas(mask.width, mask.height);
		const spreadCtx = spreadCanvas.getContext('2d');
		if (!spreadCtx) return mask;

		const step = radius > 8 ? 2 : 1;
		for (let dy = -radius; dy <= radius; dy += step) {
			for (let dx = -radius; dx <= radius; dx += step) {
				if (dx * dx + dy * dy > radius * radius) continue;
				spreadCtx.drawImage(source, dx, dy);
			}
		}

		return spreadCanvas;
	}

	private applyBlur(mask: HTMLCanvasElement, blur: number): HTMLCanvasElement {
		if (!Number.isFinite(blur) || blur <= 0.001) {
			return mask;
		}

		const blurred = this.createCanvas(mask.width, mask.height);
		const blurredCtx = blurred.getContext('2d');
		if (!blurredCtx) return mask;

		blurredCtx.filter = `blur(${Math.max(0, blur)}px)`;
		blurredCtx.drawImage(mask, 0, 0);
		blurredCtx.filter = 'none';
		return blurred;
	}

	private tintMask(mask: HTMLCanvasElement, color: string, opacity: number): HTMLCanvasElement {
		const tinted = this.createCanvas(mask.width, mask.height);
		const tintedCtx = tinted.getContext('2d');
		if (!tintedCtx) return mask;

		tintedCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
		tintedCtx.fillStyle = color;
		tintedCtx.fillRect(0, 0, mask.width, mask.height);
		tintedCtx.globalCompositeOperation = 'destination-in';
		tintedCtx.drawImage(mask, 0, 0);
		tintedCtx.globalCompositeOperation = 'source-over';
		tintedCtx.globalAlpha = 1;

		return tinted;
	}

	private hasMaskFill(command: Extract<DrawableCommand, { type: 'rect' | 'ellipse' | 'path' }>): boolean {
		if (Array.isArray(command.fills) && command.fills.some((layer) => layer.visible !== false)) {
			return true;
		}
		return Boolean(command.fill);
	}

	private getMaskStrokeLayers(command: Extract<DrawableCommand, { type: 'rect' | 'ellipse' | 'path' }>): StrokeLayerPaint[] {
		if (Array.isArray(command.strokes) && command.strokes.length > 0) {
			return command.strokes.filter((layer) => layer.visible !== false && layer.width > 0);
		}
		if (command.stroke && command.strokeWidth && command.strokeWidth > 0) {
			return [
				{
					paint: command.stroke,
					width: command.strokeWidth,
					align: 'center',
					opacity: 1,
					visible: true,
					blendMode: 'normal',
				},
			];
		}
		return [];
	}

	private applyMaskStrokeStyle(
		ctx: CanvasRenderingContext2D,
		layer: Pick<StrokeLayerPaint, 'width' | 'align' | 'cap' | 'join' | 'miterLimit' | 'dashPattern' | 'dashOffset'>,
	): void {
		const baseWidth = Math.max(0, layer.width);
		const widthMultiplier = layer.align === 'inside' || layer.align === 'outside' ? 2 : 1;
		ctx.lineWidth = Math.max(0.0001, baseWidth * widthMultiplier);
		ctx.lineCap = layer.cap ?? 'butt';
		ctx.lineJoin = layer.join ?? 'miter';
		ctx.miterLimit = typeof layer.miterLimit === 'number' ? Math.max(0, layer.miterLimit) : 10;
		const dash = Array.isArray(layer.dashPattern)
			? layer.dashPattern.filter((value) => Number.isFinite(value) && value >= 0)
			: [];
		ctx.setLineDash(dash);
		ctx.lineDashOffset = typeof layer.dashOffset === 'number' ? layer.dashOffset : 0;
	}

	private drawShapeAlphaMask(
		ctx: CanvasRenderingContext2D,
		path: Path2D,
		fillRule: CanvasFillRule,
		hasFill: boolean,
		strokeLayers: StrokeLayerPaint[],
	): void {
		const hasStroke = strokeLayers.length > 0;
		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = '#ffffff';
		if (hasFill || !hasStroke) {
			ctx.fill(path, fillRule);
		}
		for (const layer of strokeLayers) {
			if (!layer.width || layer.width <= 0) continue;
			this.applyMaskStrokeStyle(ctx, layer);
			ctx.stroke(path);
		}
	}

	private drawCommandAlphaMask(
		ctx: CanvasRenderingContext2D,
		command: DrawableCommand,
		originX: number,
		originY: number,
		insetPx: number,
	): boolean {
		if (command.type === 'rect') {
			const inset = Math.max(0, insetPx);
			const width = Math.max(0, command.width - inset * 2);
			const height = Math.max(0, command.height - inset * 2);
			if (width <= 0 || height <= 0) return false;
			const x = command.x - originX + inset;
			const y = command.y - originY + inset;

			const path = new Path2D();
			if (command.cornerRadius && command.cornerRadius > 0) {
				const radius = Math.max(0, Math.min(command.cornerRadius - inset, width / 2, height / 2));
				path.roundRect(x, y, width, height, radius);
			} else {
				path.rect(x, y, width, height);
			}
			const hasFill = this.hasMaskFill(command);
			const strokeLayers = this.getMaskStrokeLayers(command);
			this.drawShapeAlphaMask(ctx, path, 'nonzero', hasFill, strokeLayers);
			return true;
		}

		if (command.type === 'ellipse') {
			const inset = Math.max(0, insetPx);
			const radiusX = Math.max(0, command.radiusX - inset);
			const radiusY = Math.max(0, command.radiusY - inset);
			if (radiusX <= 0 || radiusY <= 0) return false;
			const x = command.x - originX;
			const y = command.y - originY;

			const path = new Path2D();
			path.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
			const hasFill = this.hasMaskFill(command);
			const strokeLayers = this.getMaskStrokeLayers(command);
			this.drawShapeAlphaMask(ctx, path, 'nonzero', hasFill, strokeLayers);
			return true;
		}

		if (command.type === 'path') {
			const rawPath = new Path2D(command.d);
			const translatedPath = new Path2D();
			translatedPath.addPath(rawPath, new DOMMatrix().translate(command.x - originX, command.y - originY));
			const hasFill = this.hasMaskFill(command);
			const strokeLayers = this.getMaskStrokeLayers(command);
			this.drawShapeAlphaMask(ctx, translatedPath, command.fillRule ?? 'nonzero', hasFill, strokeLayers);
			return true;
		}

		if (command.type === 'text') {
			this.drawTextWithLayout(ctx, command, command.x - originX, command.y - originY, '#ffffff', true);
			return true;
		}

		if (command.type === 'image') {
			return this.drawImageMask(ctx, command, originX, originY, insetPx);
		}

		return false;
	}

	private drawImageMask(
		ctx: CanvasRenderingContext2D,
		command: Extract<DrawCommand, { type: 'image' }>,
		originX: number,
		originY: number,
		insetPx: number,
	): boolean {
		const img = this.getImage(command.src);
		if (!img.complete || img.naturalWidth === 0) {
			return false;
		}

		const inset = Math.max(0, insetPx);
		const width = Math.max(0, command.width - inset * 2);
		const height = Math.max(0, command.height - inset * 2);
		if (width <= 0 || height <= 0) return false;
		const x = command.x - originX + inset;
		const y = command.y - originY + inset;

		if (!command.maskSrc) {
			ctx.drawImage(img, x, y, width, height);
			return true;
		}

		const mask = this.getImage(command.maskSrc);
		if (!mask.complete || mask.naturalWidth === 0) {
			return false;
		}

			const offscreen = this.createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
			const octx = offscreen.getContext('2d');
			if (!octx) {
				return false;
			}
			const maskMode = command.mask?.mode === 'luminance' ? 'luminance' : 'alpha';

			octx.clearRect(0, 0, offscreen.width, offscreen.height);
			octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
			octx.globalCompositeOperation = 'destination-in';
			if (maskMode === 'luminance') {
				const luminanceMask = this.createLuminanceMaskCanvas(mask, offscreen.width, offscreen.height);
				if (!luminanceMask) return false;
				octx.drawImage(luminanceMask, 0, 0, offscreen.width, offscreen.height);
			} else {
				octx.drawImage(mask, 0, 0, offscreen.width, offscreen.height);
			}
			octx.globalCompositeOperation = 'source-over';
			ctx.drawImage(offscreen, x, y, width, height);
			return true;
		}

	private getCommandBounds(command: DrawableCommand): { x: number; y: number; width: number; height: number } | null {
		if (command.type === 'rect' || command.type === 'image' || command.type === 'path' || command.type === 'text') {
			return {
				x: command.x,
				y: command.y,
				width: command.width,
				height: command.height,
			};
		}
		if (command.type === 'ellipse') {
			return {
				x: command.x - command.radiusX,
				y: command.y - command.radiusY,
				width: command.radiusX * 2,
				height: command.radiusY * 2,
			};
		}
		return null;
	}

	private buildShadowCacheKey(
		command: DrawableCommand,
		effect: RenderableShadowEffect,
		kind: 'drop' | 'inner',
		raster: { width: number; height: number },
	): string {
		return JSON.stringify({
			kind,
			raster,
			effect,
			command: this.commandCachePayload(command),
		});
	}

	private commandCachePayload(command: DrawableCommand): Record<string, unknown> {
		if (command.type === 'rect') {
			return {
				type: command.type,
				nodeId: command.nodeId,
				width: command.width,
				height: command.height,
				cornerRadius: command.cornerRadius,
				hasFill: Boolean(command.fill),
				hasStroke: Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0),
				strokeWidth: command.strokeWidth,
			};
		}
		if (command.type === 'ellipse') {
			return {
				type: command.type,
				nodeId: command.nodeId,
				radiusX: command.radiusX,
				radiusY: command.radiusY,
				hasFill: Boolean(command.fill),
				hasStroke: Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0),
				strokeWidth: command.strokeWidth,
			};
		}
		if (command.type === 'path') {
			return {
				type: command.type,
				nodeId: command.nodeId,
				d: command.d,
				width: command.width,
				height: command.height,
				hasFill: Boolean(command.fill),
				hasStroke: Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0),
				strokeWidth: command.strokeWidth,
				fillRule: command.fillRule,
			};
		}
		if (command.type === 'text') {
			return {
				type: command.type,
				nodeId: command.nodeId,
				text: command.text,
				font: command.font,
				fontSize: command.fontSize,
				width: command.width,
				height: command.height,
				textAlign: command.textAlign,
				lineHeightPx: command.lineHeightPx,
				letterSpacingPx: command.letterSpacingPx,
				textResizeMode: command.textResizeMode,
			};
		}
		const sourceKey = command.src.length > 80 ? `${command.src.slice(0, 24)}:${command.src.length}` : command.src;
		const maskKey = command.maskSrc
			? command.maskSrc.length > 80
				? `${command.maskSrc.slice(0, 24)}:${command.maskSrc.length}`
				: command.maskSrc
			: undefined;
		return {
			type: command.type,
			nodeId: command.nodeId,
			src: sourceKey,
			maskSrc: maskKey,
			width: command.width,
			height: command.height,
		};
	}

	private getCachedShadowRaster(key: string): ShadowRaster | null {
		const cached = this.shadowRasterCache.get(key);
		if (!cached) {
			recordShadowCacheMiss();
			return null;
		}
		this.shadowRasterCache.delete(key);
		this.shadowRasterCache.set(key, cached);
		recordShadowCacheHit();
		return cached;
	}

	private setCachedShadowRaster(key: string, raster: ShadowRaster): void {
		this.shadowRasterCache.set(key, raster);
		while (this.shadowRasterCache.size > SHADOW_CACHE_LIMIT) {
			const firstKey = this.shadowRasterCache.keys().next().value;
			if (typeof firstKey !== 'string') break;
			this.shadowRasterCache.delete(firstKey);
		}
	}

	private getCachedOutlineRaster(key: string): OutlineRaster | null {
		const cached = this.outlineRasterCache.get(key);
		if (!cached) {
			return null;
		}
		this.outlineRasterCache.delete(key);
		this.outlineRasterCache.set(key, cached);
		return cached;
	}

	private setCachedOutlineRaster(key: string, raster: OutlineRaster): void {
		this.outlineRasterCache.set(key, raster);
		while (this.outlineRasterCache.size > OUTLINE_CACHE_LIMIT) {
			const firstKey = this.outlineRasterCache.keys().next().value;
			if (typeof firstKey !== 'string') break;
			this.outlineRasterCache.delete(firstKey);
		}
	}

	private computeShadowPadding(effect: RenderableShadowEffect): number {
		const blur = Math.max(0, effect.blur);
		const spread = Math.abs(effect.spread);
		return Math.ceil(Math.abs(effect.x) + Math.abs(effect.y) + blur * 3 + spread * 2 + 8);
	}

	private cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
		const canvas = this.createCanvas(source.width, source.height);
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.drawImage(source, 0, 0);
		}
		return canvas;
	}

	private createCanvas(width: number, height: number): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.ceil(width));
		canvas.height = Math.max(1, Math.ceil(height));
		return canvas;
	}

	private getEnabledEffects(effects: RenderableShadowEffect[] | undefined): RenderableShadowEffect[] {
		if (!effects || effects.length === 0) {
			return [];
		}
		return effects.filter((effect) => effect.enabled !== false);
	}

	private drawCommandBase(command: DrawableCommand): void {
		switch (command.type) {
			case 'rect':
				this.drawRect(command);
				break;
			case 'text':
				this.drawText(command);
				break;
			case 'ellipse':
				this.drawEllipse(command);
				break;
			case 'image':
				this.drawImage(command);
				break;
			case 'path':
				this.drawPath(command);
				break;
		}
	}

	private drawRect(command: Extract<DrawCommand, { type: 'rect' }>): void {
		const { x, y, width, height, fill, stroke, strokeWidth, cornerRadius, fills, strokes } = command;
		const path = new Path2D();
		if (cornerRadius && cornerRadius > 0) {
			const r = Math.min(cornerRadius, width / 2, height / 2);
			path.roundRect(x, y, width, height, r);
		} else {
			path.rect(x, y, width, height);
		}
		const bounds = { x, y, width, height };
		this.drawFillLayers(path, bounds, fill, fills);
		this.drawStrokeLayers(path, bounds, stroke, strokeWidth, strokes);
	}

	private drawFillLayers(
		path: Path2D,
		bounds: { x: number; y: number; width: number; height: number },
		legacyFill: Paint | undefined,
		layers: FillLayerPaint[] | undefined,
		fillRule: CanvasFillRule = 'nonzero',
	): void {
		const fillLayers =
			layers && layers.length > 0
				? layers.filter((layer) => layer.visible !== false)
				: legacyFill
					? [{ paint: legacyFill, opacity: 1, visible: true, blendMode: 'normal' } satisfies FillLayerPaint]
					: [];
		for (const layer of fillLayers) {
			const fillStyle = this.resolvePaint(layer.paint, bounds);
			if (!fillStyle) continue;
			this.ctx.save();
			this.ctx.globalCompositeOperation = mapLayerBlendModeToComposite(layer.blendMode);
			if (typeof layer.opacity === 'number') {
				this.ctx.globalAlpha *= Math.max(0, Math.min(1, layer.opacity));
			}
			const intrinsicOpacity = this.getPaintOpacity(layer.paint);
			if (typeof intrinsicOpacity === 'number') {
				this.ctx.globalAlpha *= intrinsicOpacity;
			}
			this.ctx.fillStyle = fillStyle;
			this.ctx.fill(path, fillRule);
			this.ctx.restore();
		}
	}

	private drawStrokeLayers(
		path: Path2D,
		bounds: { x: number; y: number; width: number; height: number },
		legacyStroke: Paint | undefined,
		legacyStrokeWidth: number | undefined,
		layers: StrokeLayerPaint[] | undefined,
		fillRule: CanvasFillRule = 'nonzero',
	): void {
		const strokeLayers =
			layers && layers.length > 0
				? layers.filter((layer) => layer.visible !== false && layer.width > 0)
				: legacyStroke && legacyStrokeWidth && legacyStrokeWidth > 0
					? [
							{
								paint: legacyStroke,
								width: legacyStrokeWidth,
								align: 'center',
								opacity: 1,
								visible: true,
								blendMode: 'normal',
							} satisfies StrokeLayerPaint,
						]
					: [];

		for (const layer of strokeLayers) {
			const strokeStyle = this.resolvePaint(layer.paint, bounds);
			if (!strokeStyle || !layer.width || layer.width <= 0) continue;
			this.ctx.save();
			this.ctx.globalCompositeOperation = mapLayerBlendModeToComposite(layer.blendMode);
			if (typeof layer.opacity === 'number') {
				this.ctx.globalAlpha *= Math.max(0, Math.min(1, layer.opacity));
			}
			const intrinsicOpacity = this.getPaintOpacity(layer.paint);
			if (typeof intrinsicOpacity === 'number') {
				this.ctx.globalAlpha *= intrinsicOpacity;
			}
			const align = layer.align ?? 'center';
			if (align === 'outside') {
				this.ctx.restore();
				this.drawOutsideAlignedStroke(path, bounds, layer, fillRule);
				continue;
			}
			this.applyStrokeStyle(this.ctx, strokeStyle, layer);
			if (align === 'inside') {
				this.ctx.save();
				this.ctx.clip(path, fillRule);
				this.ctx.lineWidth = Math.max(0, layer.width * 2);
				this.ctx.stroke(path);
				this.ctx.restore();
			} else {
				this.ctx.stroke(path);
			}
			this.ctx.restore();
		}
	}

	private applyStrokeStyle(
		ctx: CanvasRenderingContext2D,
		strokeStyle: string | CanvasGradient | CanvasPattern,
		layer: Pick<StrokeLayerPaint, 'width' | 'cap' | 'join' | 'miterLimit' | 'dashPattern' | 'dashOffset'>,
	): void {
		ctx.strokeStyle = strokeStyle;
		ctx.lineWidth = Math.max(0, layer.width);
		ctx.lineCap = layer.cap ?? 'butt';
		ctx.lineJoin = layer.join ?? 'miter';
		ctx.miterLimit = typeof layer.miterLimit === 'number' ? Math.max(0, layer.miterLimit) : 10;
		const dash = Array.isArray(layer.dashPattern)
			? layer.dashPattern.filter((value) => Number.isFinite(value) && value >= 0)
			: [];
		ctx.setLineDash(dash);
		ctx.lineDashOffset = typeof layer.dashOffset === 'number' ? layer.dashOffset : 0;
	}

	private drawOutsideAlignedStroke(
		path: Path2D,
		bounds: { x: number; y: number; width: number; height: number },
		layer: StrokeLayerPaint,
		fillRule: CanvasFillRule,
	): void {
		const pad = Math.max(2, layer.width * 2 + 2);
		const offscreen = this.createCanvas(bounds.width + pad * 2, bounds.height + pad * 2);
		const octx = offscreen.getContext('2d');
		if (!octx) {
			return;
		}
		const shiftedPath = new Path2D();
		shiftedPath.addPath(path, new DOMMatrix().translate(-bounds.x + pad, -bounds.y + pad));
		const localBounds = { x: pad, y: pad, width: bounds.width, height: bounds.height };
		const strokeStyle = this.resolvePaint(layer.paint, localBounds);
		if (!strokeStyle) {
			return;
		}
		this.applyStrokeStyle(octx, strokeStyle, { ...layer, width: layer.width * 2 });
		octx.stroke(shiftedPath);
		octx.globalCompositeOperation = 'destination-out';
		octx.fill(shiftedPath, fillRule);
		octx.globalCompositeOperation = 'source-over';

		this.ctx.save();
		this.ctx.globalCompositeOperation = mapLayerBlendModeToComposite(layer.blendMode);
		if (typeof layer.opacity === 'number') {
			this.ctx.globalAlpha *= Math.max(0, Math.min(1, layer.opacity));
		}
		const intrinsicOpacity = this.getPaintOpacity(layer.paint);
		if (typeof intrinsicOpacity === 'number') {
			this.ctx.globalAlpha *= intrinsicOpacity;
		}
		this.ctx.drawImage(offscreen, bounds.x - pad, bounds.y - pad);
		this.ctx.restore();
	}

	private measureTextWithSpacing(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number {
		if (!text) return 0;
		const base = Math.max(0, ctx.measureText(text).width);
		if (!Number.isFinite(letterSpacingPx) || letterSpacingPx === 0) {
			return base;
		}
		const glyphCount = Array.from(text).length;
		if (glyphCount <= 1) return base;
		return base + (glyphCount - 1) * letterSpacingPx;
	}

	private buildTextLayout(ctx: CanvasRenderingContext2D, command: Extract<DrawCommand, { type: 'text' }>) {
		ctx.save();
		ctx.font = command.font;
		const layout = layoutText(
			{
				text: command.text,
				width: command.width,
				height: command.height,
				fontSize: command.fontSize,
				textAlign: command.textAlign,
				lineHeightPx: command.lineHeightPx,
				letterSpacingPx: command.letterSpacingPx,
				textResizeMode: command.textResizeMode,
			},
			(value) => this.measureTextWithSpacing(ctx, value, command.letterSpacingPx),
		);
		ctx.restore();
		return layout;
	}

	private drawTextLine(
		ctx: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		letterSpacingPx: number,
	): void {
		if (!text) return;
		if (!Number.isFinite(letterSpacingPx) || Math.abs(letterSpacingPx) < 0.001) {
			ctx.fillText(text, x, y);
			return;
		}

		let cursor = x;
		const glyphs = Array.from(text);
		for (let i = 0; i < glyphs.length; i += 1) {
			const glyph = glyphs[i];
			ctx.fillText(glyph, cursor, y);
			if (i < glyphs.length - 1) {
				cursor += ctx.measureText(glyph).width + letterSpacingPx;
			}
		}
	}

	private drawTextWithLayout(
		ctx: CanvasRenderingContext2D,
		command: Extract<DrawCommand, { type: 'text' }>,
		x: number,
		y: number,
		fillStyle: string,
		clipToFixedBounds: boolean,
	): void {
		const layout = this.buildTextLayout(ctx, command);

		ctx.save();
		ctx.font = command.font;
		ctx.fillStyle = fillStyle;
		ctx.textBaseline = 'top';

		if (clipToFixedBounds && command.textResizeMode === 'fixed') {
			ctx.beginPath();
			ctx.rect(x, y, command.width, command.height);
			ctx.clip();
		}

		for (const line of layout.lines) {
			this.drawTextLine(ctx, line.text, x + line.x, y + line.y, command.letterSpacingPx);
		}

		ctx.restore();
	}

	private drawText(command: Extract<DrawCommand, { type: 'text' }>): void {
		this.drawTextWithLayout(this.ctx, command, command.x, command.y, command.fill || '#000000', true);
	}

	private drawTextOverflowIndicator(command: Extract<DrawCommand, { type: 'textOverflowIndicator' }>): void {
		const available = Math.max(8, Math.min(command.width, command.height));
		const size = Math.max(8, Math.min(14, available * 0.28));
		const inset = 2;
		const x = command.x + Math.max(0, command.width - size - inset);
		const y = command.y + Math.max(0, command.height - size - inset);

		this.ctx.save();
		this.ctx.beginPath();
		this.ctx.roundRect(x, y, size, size, 3);
		this.ctx.fillStyle = 'rgba(255, 159, 10, 0.16)';
		this.ctx.strokeStyle = 'rgba(255, 159, 10, 0.92)';
		this.ctx.lineWidth = 1;
		this.ctx.fill();
		this.ctx.stroke();

		const dotRadius = Math.max(0.85, size * 0.08);
		const spacing = Math.max(2, size * 0.22);
		const centerY = y + size * 0.5;
		const startX = x + size * 0.5 - spacing;
		this.ctx.fillStyle = 'rgba(255, 110, 0, 0.95)';
		for (let i = 0; i < 3; i += 1) {
			this.ctx.beginPath();
			this.ctx.arc(startX + i * spacing, centerY, dotRadius, 0, Math.PI * 2);
			this.ctx.fill();
		}
		this.ctx.restore();
	}

	private drawEllipse(command: Extract<DrawCommand, { type: 'ellipse' }>): void {
		const { x, y, radiusX, radiusY, fill, stroke, strokeWidth, fills, strokes } = command;
		const path = new Path2D();
		path.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
		const bounds = {
			x: x - radiusX,
			y: y - radiusY,
			width: radiusX * 2,
			height: radiusY * 2,
		};
		this.drawFillLayers(path, bounds, fill, fills);
		this.drawStrokeLayers(path, bounds, stroke, strokeWidth, strokes);
	}

	private drawImage(command: Extract<DrawCommand, { type: 'image' }>): void {
		const { x, y, width, height, src, maskSrc, outline, mask: maskConfig } = command;
		const img = this.getImage(src);
		if (!img.complete || img.naturalWidth === 0) {
			return;
		}

		if (maskSrc) {
			const maskImage = this.getImage(maskSrc);
			if (!maskImage.complete || maskImage.naturalWidth === 0) {
				return;
			}
			const rasterWidth = Math.max(1, Math.round(width));
			const rasterHeight = Math.max(1, Math.round(height));
			const maskedSubject = this.createMaskedImageCanvas(
				img,
				maskImage,
				rasterWidth,
				rasterHeight,
				maskConfig?.mode === 'luminance' ? 'luminance' : 'alpha',
			);
			if (!maskedSubject) {
				return;
			}

				if (outline) {
					const outlineRaster = this.getOutlineRaster(maskSrc, maskImage, rasterWidth, rasterHeight, outline);
				if (outlineRaster) {
					this.ctx.drawImage(outlineRaster.canvas, x, y, width, height);
				}
			}

			this.ctx.drawImage(maskedSubject, x, y, width, height);
			return;
		}

		this.ctx.drawImage(img, x, y, width, height);
	}

	private createMaskedImageCanvas(
		img: HTMLImageElement,
		mask: HTMLImageElement,
		width: number,
		height: number,
		maskMode: 'alpha' | 'luminance' = 'alpha',
	): HTMLCanvasElement | null {
		const offscreen = this.createCanvas(width, height);
		const octx = offscreen.getContext('2d');
		if (!octx) {
			return null;
		}
		octx.clearRect(0, 0, offscreen.width, offscreen.height);
		octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
		octx.globalCompositeOperation = 'destination-in';
		if (maskMode === 'luminance') {
			const luminanceMask = this.createLuminanceMaskCanvas(mask, offscreen.width, offscreen.height);
			if (!luminanceMask) return null;
			octx.drawImage(luminanceMask, 0, 0, offscreen.width, offscreen.height);
		} else {
			octx.drawImage(mask, 0, 0, offscreen.width, offscreen.height);
		}
		octx.globalCompositeOperation = 'source-over';
		return offscreen;
	}

	private createLuminanceMaskCanvas(mask: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
		const luminanceCanvas = this.createCanvas(width, height);
		const lctx = luminanceCanvas.getContext('2d');
		if (!lctx) return null;
		lctx.clearRect(0, 0, width, height);
		lctx.drawImage(mask, 0, 0, width, height);
		const imageData = lctx.getImageData(0, 0, width, height);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
			const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
			data[i] = 255;
			data[i + 1] = 255;
			data[i + 2] = 255;
			data[i + 3] = Math.round(data[i + 3] * luminance);
		}
		lctx.putImageData(imageData, 0, 0);
		return luminanceCanvas;
	}

	private getOutlineRaster(
		maskSrc: string,
		mask: HTMLImageElement,
		width: number,
		height: number,
		outline: { color: string; width: number; blur: number },
	): OutlineRaster | null {
		const outlineWidth = Math.max(
			0,
			typeof outline.width === 'number' && Number.isFinite(outline.width) ? outline.width : 0,
		);
		const outlineBlur = Math.max(
			0,
			typeof outline.blur === 'number' && Number.isFinite(outline.blur) ? outline.blur : 0,
		);
		if (outlineWidth <= 0 && outlineBlur <= 0) {
			return null;
		}

		const key = this.buildOutlineCacheKey(maskSrc, width, height, {
			color: outline.color,
			width: outlineWidth,
			blur: outlineBlur,
		});
		const cached = this.getCachedOutlineRaster(key);
		if (cached) {
			return cached;
		}

		const baseMask = this.createCanvas(width, height);
		const baseCtx = baseMask.getContext('2d');
		if (!baseCtx) {
			return null;
		}
		baseCtx.clearRect(0, 0, width, height);
		baseCtx.drawImage(mask, 0, 0, width, height);

		const dilatedMask = this.applyPositiveSpread(baseMask, outlineWidth);
		const ringMask = this.cloneCanvas(dilatedMask);
		const ringCtx = ringMask.getContext('2d');
		if (!ringCtx) {
			return null;
		}
		ringCtx.globalCompositeOperation = 'destination-out';
		ringCtx.drawImage(baseMask, 0, 0);
		ringCtx.globalCompositeOperation = 'source-over';

		const blurred = this.applyBlur(ringMask, outlineBlur);
		const tinted = this.tintMask(blurred, outline.color, 1);
		const raster: OutlineRaster = { canvas: tinted };
		this.setCachedOutlineRaster(key, raster);
		return raster;
	}

	private buildOutlineCacheKey(
		maskSrc: string,
		width: number,
		height: number,
		outline: { color: string; width: number; blur: number },
	): string {
		return JSON.stringify({
			maskSrc: this.compactSourceKey(maskSrc),
			width,
			height,
			outline,
		});
	}

	private compactSourceKey(src: string): string {
		return src.length > 120 ? `${src.slice(0, 36)}:${src.length}:${src.slice(-12)}` : src;
	}

	private getImage(src: string): HTMLImageElement {
		const cached = this.imageCache.get(src);
		if (cached) {
			return cached;
		}

		const img = new Image();
		img.decoding = 'async';
		img.onload = () => {
			this.onInvalidate?.();
		};
		img.onerror = () => {
			this.imageCache.delete(src);
			this.outlineRasterCache.clear();
		};
		img.src = src;
		this.imageCache.set(src, img);
		return img;
	}

	private drawPath(command: Extract<DrawCommand, { type: 'path' }>): void {
		const { d, x, y, width, height, fill, stroke, strokeWidth, fillRule, fills, strokes } = command;
		const rawPath = new Path2D(d);
		const path = new Path2D();
		path.addPath(rawPath, new DOMMatrix().translate(x, y));
		const bounds = { x, y, width, height };
		const rule = fillRule ?? 'nonzero';
		this.drawFillLayers(path, bounds, fill, fills, rule);
		this.drawStrokeLayers(path, bounds, stroke, strokeWidth, strokes, rule);
	}

	private applyClip(command: Extract<DrawCommand, { type: 'clip' }>): void {
		const { x, y, width, height, cornerRadius } = command;

		this.ctx.save();
		this.ctx.beginPath();
		if (cornerRadius && cornerRadius > 0) {
			const r = Math.min(cornerRadius, width / 2, height / 2);
			this.ctx.roundRect(x, y, width, height, r);
		} else {
			this.ctx.rect(x, y, width, height);
		}
		this.ctx.clip();
	}

	private applyTransform(command: Extract<DrawCommand, { type: 'transform' }>): void {
		const { translateX, translateY, scaleX, scaleY } = command;

		this.ctx.save();
		this.ctx.translate(translateX, translateY);
		this.ctx.scale(scaleX, scaleY);
	}

	public resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		const canvas = this.ctx.canvas;
		canvas.width = width;
		canvas.height = height;
		this.patternTileCache.clear();
		this.shadowRasterCache.clear();
		this.outlineRasterCache.clear();
	}

	private resolvePaint(
		paint: Paint | undefined,
		bounds: { x: number; y: number; width: number; height: number },
	): string | CanvasGradient | CanvasPattern | undefined {
		if (!paint) {
			return undefined;
		}
		if (typeof paint === 'string') {
			return paint;
		}
		if (paint.type === 'pattern') {
			return this.createPatternPaint(paint, bounds);
		}
		if (paint.type === 'image') {
			return this.createImagePaint(paint, bounds);
		}
		if (!paint.stops || paint.stops.length === 0) {
			return undefined;
		}

		const kind = paint.kind === 'radial' ? 'radial' : 'linear';
		const gradient = kind === 'radial' ? this.createRadialGradient(paint, bounds) : this.createLinearGradient(paint, bounds);
		if (!gradient) {
			return paint.stops[0]?.color;
		}

		for (const stop of paint.stops) {
			gradient.addColorStop(this.clamp01(stop.offset), stop.color);
		}
		return gradient;
	}

	private getPaintOpacity(paint: Paint): number | undefined {
		if (typeof paint === 'string' || paint.type === 'gradient') {
			return undefined;
		}
		if (typeof paint.opacity === 'number') {
			return this.clamp01(paint.opacity);
		}
		return undefined;
	}

	private createPatternPaint(
		paint: PatternPaint,
		bounds: { x: number; y: number; width: number; height: number },
	): CanvasPattern | undefined {
		const key = JSON.stringify({
			pattern: paint.pattern,
			fg: paint.fg,
			bg: paint.bg,
			scale: paint.scale,
			rotation: paint.rotation,
		});
		let tile = this.patternTileCache.get(key);
		if (!tile) {
			tile = this.buildPatternTile(paint);
			this.patternTileCache.set(key, tile);
			while (this.patternTileCache.size > 80) {
				const firstKey = this.patternTileCache.keys().next().value;
				if (typeof firstKey !== 'string') break;
				this.patternTileCache.delete(firstKey);
			}
		}
		const pattern = this.ctx.createPattern(tile, 'repeat');
		if (!pattern) {
			return undefined;
		}
		const matrix = new DOMMatrix();
		matrix.translateSelf(bounds.x, bounds.y);
		const angle = this.normalizeAngle(paint.rotation ?? 0);
		if (Math.abs(angle) > 0.0001) {
			matrix.translateSelf(bounds.width * 0.5, bounds.height * 0.5);
			matrix.rotateSelf((angle * 180) / Math.PI);
			matrix.translateSelf(-bounds.width * 0.5, -bounds.height * 0.5);
		}
		pattern.setTransform(matrix);
		return pattern;
	}

	private buildPatternTile(paint: PatternPaint): HTMLCanvasElement {
		const scale = Math.max(0.2, Math.min(8, Number.isFinite(paint.scale) ? paint.scale : 1));
		const size = Math.max(8, Math.round(20 * scale));
		const tile = this.createCanvas(size, size);
		const ctx = tile.getContext('2d');
		if (!ctx) {
			return tile;
		}
		ctx.fillStyle = paint.bg;
		ctx.fillRect(0, 0, size, size);
		ctx.fillStyle = paint.fg;
		ctx.strokeStyle = paint.fg;
		ctx.lineWidth = Math.max(1, size * 0.08);
		switch (paint.pattern) {
			case 'grid':
				ctx.beginPath();
				ctx.moveTo(size * 0.5, 0);
				ctx.lineTo(size * 0.5, size);
				ctx.moveTo(0, size * 0.5);
				ctx.lineTo(size, size * 0.5);
				ctx.stroke();
				break;
			case 'dots': {
				const r = Math.max(1, size * 0.12);
				ctx.beginPath();
				ctx.arc(size * 0.25, size * 0.25, r, 0, Math.PI * 2);
				ctx.arc(size * 0.75, size * 0.75, r, 0, Math.PI * 2);
				ctx.fill();
				break;
			}
			case 'stripes':
				ctx.beginPath();
				ctx.moveTo(-size * 0.25, size * 0.9);
				ctx.lineTo(size * 0.9, -size * 0.25);
				ctx.moveTo(size * 0.1, size * 1.2);
				ctx.lineTo(size * 1.2, size * 0.1);
				ctx.stroke();
				break;
			case 'noise': {
				const imageData = ctx.getImageData(0, 0, size, size);
				const data = imageData.data;
				for (let y = 0; y < size; y += 1) {
					for (let x = 0; x < size; x += 1) {
						const index = (y * size + x) * 4;
						const n = (Math.sin((x + 17) * 12.9898 + (y + 23) * 78.233) * 43758.5453) % 1;
						const alpha = Math.floor(Math.max(0, Math.min(1, Math.abs(n))) * 255);
						const color = paint.fg.startsWith('#') ? paint.fg : '#ffffff';
						const normalized = /^#([0-9a-f]{6})$/i.test(color)
							? color
							: /^#([0-9a-f]{3})$/i.test(color)
								? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
								: '#ffffff';
						data[index] = Number.parseInt(normalized.slice(1, 3), 16);
						data[index + 1] = Number.parseInt(normalized.slice(3, 5), 16);
						data[index + 2] = Number.parseInt(normalized.slice(5, 7), 16);
						data[index + 3] = alpha;
					}
				}
				ctx.putImageData(imageData, 0, 0);
				break;
			}
		}
		return tile;
	}

	private createImagePaint(
		paint: ImagePaintResolved,
		bounds: { x: number; y: number; width: number; height: number },
	): CanvasPattern | undefined {
		const img = this.getImage(paint.src);
		if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
			return undefined;
		}
		const repetition = paint.fit === 'tile' ? 'repeat' : 'no-repeat';
		const pattern = this.ctx.createPattern(img, repetition);
		if (!pattern) {
			return undefined;
		}
		const matrix = new DOMMatrix();
		const imageWidth = img.naturalWidth;
		const imageHeight = img.naturalHeight;
		if (paint.fit === 'tile') {
			const tileScale = Math.max(0.05, paint.tileScale ?? 1);
			matrix.translateSelf(bounds.x + (paint.tileOffsetX ?? 0), bounds.y + (paint.tileOffsetY ?? 0));
			matrix.scaleSelf(tileScale, tileScale);
		} else {
			const scaleX = bounds.width / imageWidth;
			const scaleY = bounds.height / imageHeight;
			const scale = paint.fit === 'fit' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
			const drawWidth = imageWidth * scale;
			const drawHeight = imageHeight * scale;
			const tx = bounds.x + (bounds.width - drawWidth) * 0.5;
			const ty = bounds.y + (bounds.height - drawHeight) * 0.5;
			matrix.translateSelf(tx, ty);
			matrix.scaleSelf(scale, scale);
		}
		const angle = this.normalizeAngle(paint.rotation ?? 0);
		if (Math.abs(angle) > 0.0001) {
			matrix.translateSelf(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
			matrix.rotateSelf((angle * 180) / Math.PI);
			matrix.translateSelf(-(bounds.x + bounds.width * 0.5), -(bounds.y + bounds.height * 0.5));
		}
		pattern.setTransform(matrix);
		return pattern;
	}

	private createLinearGradient(
		paint: GradientPaint,
		bounds: { x: number; y: number; width: number; height: number },
	): CanvasGradient | null {
		const { x, y, width, height } = bounds;
		if (width === 0 && height === 0) {
			return null;
		}

		let start = paint.from ? this.resolvePoint(paint.from, bounds) : undefined;
		let end = paint.to ? this.resolvePoint(paint.to, bounds) : undefined;

		if (!start || !end) {
			if (typeof paint.angle === 'number') {
				const angle = this.normalizeAngle(paint.angle);
				const cx = x + width / 2;
				const cy = y + height / 2;
				const half = Math.max(width, height) * 0.5;
				const dx = Math.cos(angle) * half;
				const dy = Math.sin(angle) * half;
				start = { x: cx - dx, y: cy - dy };
				end = { x: cx + dx, y: cy + dy };
			} else {
				start = { x, y: y + height / 2 };
				end = { x: x + width, y: y + height / 2 };
			}
		}

		if (start.x === end.x && start.y === end.y) {
			end = { x: end.x + 0.0001, y: end.y + 0.0001 };
		}

		return this.ctx.createLinearGradient(start.x, start.y, end.x, end.y);
	}

	private createRadialGradient(
		paint: GradientPaint,
		bounds: { x: number; y: number; width: number; height: number },
	): CanvasGradient | null {
		const { x, y, width, height } = bounds;
		if (width === 0 && height === 0) {
			return null;
		}

		const center = paint.center ?? { x: 0.5, y: 0.5 };
		const cx = x + this.resolveCoord(center.x, width);
		const cy = y + this.resolveCoord(center.y, height);
		const baseRadius = Math.min(width, height) * 0.5;
		const outer = this.resolveLength(paint.radius, baseRadius, baseRadius);
		const inner = this.resolveLength(paint.innerRadius, outer, 0);
		const safeOuter = Math.max(outer, 0.0001);
		const safeInner = Math.max(0, Math.min(inner, safeOuter));

		return this.ctx.createRadialGradient(cx, cy, safeInner, cx, cy, safeOuter);
	}

	private resolvePoint(
		point: { x: number; y: number },
		bounds: { x: number; y: number; width: number; height: number },
	): { x: number; y: number } {
		return {
			x: bounds.x + this.resolveCoord(point.x, bounds.width),
			y: bounds.y + this.resolveCoord(point.y, bounds.height),
		};
	}

	private resolveCoord(value: number, size: number): number {
		if (value >= 0 && value <= 1) {
			return value * size;
		}
		return value;
	}

	private resolveLength(value: number | undefined, size: number, fallback: number): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return fallback;
		}
		return value >= 0 && value <= 1 ? value * size : value;
	}

	private normalizeAngle(value: number): number {
		if (!Number.isFinite(value)) {
			return 0;
		}
		if (Math.abs(value) > Math.PI * 2) {
			return (value * Math.PI) / 180;
		}
		return value;
	}

	private clamp01(value: number): number {
		if (!Number.isFinite(value)) {
			return 0;
		}
		return Math.max(0, Math.min(1, value));
	}
}
