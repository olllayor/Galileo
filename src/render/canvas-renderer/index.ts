import type { DrawCommand } from '../draw-list';

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

    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }

    if (stroke && strokeWidth && strokeWidth > 0) {
      this.ctx.strokeStyle = stroke;
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

    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }

    if (stroke && strokeWidth && strokeWidth > 0) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.stroke();
    }
  }

  private drawImage(command: Extract<DrawCommand, { type: 'image' }>): void {
    const { x, y, width, height, src } = command;
    const img = this.getImage(src);
    if (!img.complete || img.naturalWidth === 0) {
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
    const { d, fill, stroke, strokeWidth } = command;

    const path = new Path2D(d);

    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill(path);
    }

    if (stroke && strokeWidth && strokeWidth > 0) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.stroke(path);
    }
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
}
