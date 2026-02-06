import {
	ENABLE_SHADOWS_V1,
	mapShadowBlendModeToComposite,
	recordShadowCacheHit,
	recordShadowCacheMiss,
	recordShadowRenderDuration,
} from '../../core/doc';
import type { RenderableShadowEffect } from '../../core/doc/types';
import type { DrawCommand, GradientPaint, Paint } from '../draw-list';

type DrawableCommand = Extract<DrawCommand, { type: 'rect' | 'text' | 'ellipse' | 'image' | 'path' }>;

type ShadowRaster = {
	canvas: HTMLCanvasElement;
	offsetX: number;
	offsetY: number;
	blendMode: GlobalCompositeOperation;
};

const SHADOW_CACHE_LIMIT = 120;

export class CanvasRenderer {
	private ctx: CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private imageCache: Map<string, HTMLImageElement>;
	private shadowRasterCache: Map<string, ShadowRaster>;
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
		this.shadowRasterCache = new Map();
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

			ctx.beginPath();
			if (command.cornerRadius && command.cornerRadius > 0) {
				const radius = Math.max(0, Math.min(command.cornerRadius - inset, width / 2, height / 2));
				ctx.roundRect(x, y, width, height, radius);
			} else {
				ctx.rect(x, y, width, height);
			}

			const hasFill = Boolean(command.fill);
			const hasStroke = Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0);
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#ffffff';
			if (hasFill || !hasStroke) {
				ctx.fill();
			}
			if (hasStroke) {
				ctx.lineWidth = command.strokeWidth ?? 1;
				ctx.stroke();
			}
			return true;
		}

		if (command.type === 'ellipse') {
			const inset = Math.max(0, insetPx);
			const radiusX = Math.max(0, command.radiusX - inset);
			const radiusY = Math.max(0, command.radiusY - inset);
			if (radiusX <= 0 || radiusY <= 0) return false;
			const x = command.x - originX;
			const y = command.y - originY;

			ctx.beginPath();
			ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);

			const hasFill = Boolean(command.fill);
			const hasStroke = Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0);
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#ffffff';
			if (hasFill || !hasStroke) {
				ctx.fill();
			}
			if (hasStroke) {
				ctx.lineWidth = command.strokeWidth ?? 1;
				ctx.stroke();
			}
			return true;
		}

		if (command.type === 'path') {
			const path = new Path2D(command.d);
			ctx.save();
			ctx.translate(command.x - originX, command.y - originY);
			const hasFill = Boolean(command.fill);
			const hasStroke = Boolean(command.stroke && command.strokeWidth && command.strokeWidth > 0);
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#ffffff';
			if (hasFill || !hasStroke) {
				ctx.fill(path, command.fillRule ?? 'nonzero');
			}
			if (hasStroke) {
				ctx.lineWidth = command.strokeWidth ?? 1;
				ctx.stroke(path);
			}
			ctx.restore();
			return true;
		}

		if (command.type === 'text') {
			ctx.save();
			ctx.font = command.font;
			ctx.fillStyle = '#ffffff';
			ctx.textBaseline = 'top';
			const lines = command.text.split('\n');
			const lineHeight = Math.max(1, (command.fontSize || 14) * 1.2);
			for (let i = 0; i < lines.length; i += 1) {
				ctx.fillText(lines[i], command.x - originX, command.y - originY + i * lineHeight);
			}
			ctx.restore();
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

		octx.clearRect(0, 0, offscreen.width, offscreen.height);
		octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
		octx.globalCompositeOperation = 'destination-in';
		octx.drawImage(mask, 0, 0, offscreen.width, offscreen.height);
		octx.globalCompositeOperation = 'source-over';
		ctx.drawImage(offscreen, x, y, width, height);
		return true;
	}

	private getCommandBounds(command: DrawableCommand): { x: number; y: number; width: number; height: number } | null {
		if (command.type === 'rect' || command.type === 'image' || command.type === 'path') {
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
		if (command.type === 'text') {
			const metrics = this.measureTextBounds(command);
			return { x: command.x, y: command.y, width: metrics.width, height: metrics.height };
		}
		return null;
	}

	private measureTextBounds(command: Extract<DrawCommand, { type: 'text' }>): { width: number; height: number } {
		this.ctx.save();
		this.ctx.font = command.font;
		const lines = command.text.split('\n');
		const lineHeight = Math.max(1, (command.fontSize || 14) * 1.2);
		let width = 0;
		for (const line of lines) {
			width = Math.max(width, this.ctx.measureText(line).width);
		}
		this.ctx.restore();
		return {
			width: Math.max(1, width),
			height: Math.max(1, lineHeight * Math.max(lines.length, 1)),
		};
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
		const { x, y, width, height, fill, stroke, strokeWidth, cornerRadius } = command;

		this.ctx.beginPath();

		if (cornerRadius && cornerRadius > 0) {
			const r = Math.min(cornerRadius, width / 2, height / 2);
			this.ctx.roundRect(x, y, width, height, r);
		} else {
			this.ctx.rect(x, y, width, height);
		}

		const fillStyle = this.resolvePaint(fill, { x, y, width, height });
		if (fillStyle) {
			this.ctx.fillStyle = fillStyle;
			this.ctx.fill();
		}

		const strokeStyle = this.resolvePaint(stroke, { x, y, width, height });
		if (strokeStyle && strokeWidth && strokeWidth > 0) {
			this.ctx.strokeStyle = strokeStyle;
			this.ctx.lineWidth = strokeWidth;
			this.ctx.stroke();
		}
	}

	private drawText(command: Extract<DrawCommand, { type: 'text' }>): void {
		const { x, y, text, font, fill } = command;

		this.ctx.font = font;
		this.ctx.fillStyle = fill || '#000000';
		this.ctx.textBaseline = 'top';
		const lines = text.split('\n');
		const fontSize = command.fontSize || 14;
		const lineHeight = Math.max(1, fontSize * 1.2);
		lines.forEach((line, index) => {
			this.ctx.fillText(line, x, y + index * lineHeight);
		});
	}

	private drawEllipse(command: Extract<DrawCommand, { type: 'ellipse' }>): void {
		const { x, y, radiusX, radiusY, fill, stroke, strokeWidth } = command;

		this.ctx.beginPath();
		this.ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);

		const fillStyle = this.resolvePaint(fill, {
			x: x - radiusX,
			y: y - radiusY,
			width: radiusX * 2,
			height: radiusY * 2,
		});
		if (fillStyle) {
			this.ctx.fillStyle = fillStyle;
			this.ctx.fill();
		}

		const strokeStyle = this.resolvePaint(stroke, {
			x: x - radiusX,
			y: y - radiusY,
			width: radiusX * 2,
			height: radiusY * 2,
		});
		if (strokeStyle && strokeWidth && strokeWidth > 0) {
			this.ctx.strokeStyle = strokeStyle;
			this.ctx.lineWidth = strokeWidth;
			this.ctx.stroke();
		}
	}

	private drawImage(command: Extract<DrawCommand, { type: 'image' }>): void {
		const { x, y, width, height, src, maskSrc } = command;
		const img = this.getImage(src);
		if (!img.complete || img.naturalWidth === 0) {
			return;
		}

		if (maskSrc) {
			const mask = this.getImage(maskSrc);
			if (!mask.complete || mask.naturalWidth === 0) {
				return;
			}
			const offscreen = this.createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
			const octx = offscreen.getContext('2d');
			if (!octx) {
				return;
			}
			octx.clearRect(0, 0, offscreen.width, offscreen.height);
			octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
			octx.globalCompositeOperation = 'destination-in';
			octx.drawImage(mask, 0, 0, offscreen.width, offscreen.height);
			octx.globalCompositeOperation = 'source-over';
			this.ctx.drawImage(offscreen, x, y, width, height);
			return;
		}

		this.ctx.drawImage(img, x, y, width, height);
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
		};
		img.src = src;
		this.imageCache.set(src, img);
		return img;
	}

	private drawPath(command: Extract<DrawCommand, { type: 'path' }>): void {
		const { d, x, y, width, height, fill, stroke, strokeWidth, fillRule } = command;

		const path = new Path2D(d);
		this.ctx.save();
		this.ctx.translate(x, y);
		const bounds = { x: 0, y: 0, width, height };

		const fillStyle = this.resolvePaint(fill, bounds);
		if (fillStyle) {
			this.ctx.fillStyle = fillStyle;
			this.ctx.fill(path, fillRule ?? 'nonzero');
		}

		const strokeStyle = this.resolvePaint(stroke, bounds);
		if (strokeStyle && strokeWidth && strokeWidth > 0) {
			this.ctx.strokeStyle = strokeStyle;
			this.ctx.lineWidth = strokeWidth;
			this.ctx.stroke(path);
		}
		this.ctx.restore();
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
		this.shadowRasterCache.clear();
	}

	private resolvePaint(
		paint: Paint | undefined,
		bounds: { x: number; y: number; width: number; height: number },
	): string | CanvasGradient | undefined {
		if (!paint) {
			return undefined;
		}
		if (typeof paint === 'string') {
			return paint;
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
