import type { DrawCommand, GradientPaint, Paint } from '../draw-list';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private imageCache: Map<string, HTMLImageElement>;
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
    this.onInvalidate = onInvalidate;
  }

  public render(
    drawCommands: DrawCommand[],
    view?: { pan: { x: number; y: number }; zoom: number }
  ): void {
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
      const offscreen = document.createElement('canvas');
      const pixelW = Math.max(1, Math.round(width));
      const pixelH = Math.max(1, Math.round(height));
      offscreen.width = pixelW;
      offscreen.height = pixelH;
      const octx = offscreen.getContext('2d');
      if (!octx) {
        return;
      }
      octx.clearRect(0, 0, pixelW, pixelH);
      octx.drawImage(img, 0, 0, pixelW, pixelH);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(mask, 0, 0, pixelW, pixelH);
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
    const { x, y, width, height } = command;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, width, height);
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
  }

  private resolvePaint(
    paint: Paint | undefined,
    bounds: { x: number; y: number; width: number; height: number }
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
    const gradient =
      kind === 'radial'
        ? this.createRadialGradient(paint, bounds)
        : this.createLinearGradient(paint, bounds);
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
    bounds: { x: number; y: number; width: number; height: number }
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
    bounds: { x: number; y: number; width: number; height: number }
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
    bounds: { x: number; y: number; width: number; height: number }
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

  private resolveLength(
    value: number | undefined,
    size: number,
    fallback: number
  ): number {
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
