export type Paint = string | GradientPaint;

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientPaint {
  type: 'gradient';
  kind?: 'linear' | 'radial';
  stops: GradientStop[];
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: number;
  innerRadius?: number;
  angle?: number;
}

export type DrawCommand =
  | DrawRectCommand
  | DrawTextCommand
  | DrawEllipseCommand
  | DrawImageCommand
  | DrawPathCommand
  | ClipCommand
  | RestoreCommand
  | TransformCommand;

export interface DrawRectCommand {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
}

export interface DrawTextCommand {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font: string;
  fontSize: number;
  fill?: string;
  opacity?: number;
}

export interface DrawEllipseCommand {
  type: 'ellipse';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  opacity?: number;
}

export interface DrawImageCommand {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  maskSrc?: string;
  opacity?: number;
}

export interface DrawPathCommand {
  type: 'path';
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  opacity?: number;
  fillRule?: 'nonzero' | 'evenodd';
}

export interface ClipCommand {
  type: 'clip';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RestoreCommand {
  type: 'restore';
}

export interface TransformCommand {
  type: 'transform';
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

export const isDrawCommand = (value: unknown): value is DrawCommand => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const cmd = value as DrawCommand;
  return typeof cmd.type === 'string';
};
