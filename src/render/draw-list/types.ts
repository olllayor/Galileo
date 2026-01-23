export type DrawCommand =
  | DrawRectCommand
  | DrawTextCommand
  | DrawEllipseCommand
  | DrawImageCommand
  | DrawPathCommand
  | ClipCommand
  | TransformCommand;

export interface DrawRectCommand {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
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
  fill?: string;
  stroke?: string;
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
  opacity?: number;
}

export interface DrawPathCommand {
  type: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface ClipCommand {
  type: 'clip';
  x: number;
  y: number;
  width: number;
  height: number;
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
