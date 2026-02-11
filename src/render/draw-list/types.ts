import type { LayerBlendMode, RenderableShadowEffect } from '../../core/doc/types';

export interface PatternPaint {
  type: 'pattern';
  pattern: 'grid' | 'dots' | 'stripes' | 'noise';
  fg: string;
  bg: string;
  scale: number;
  rotation: number;
  opacity?: number;
}

export interface ImagePaintResolved {
  type: 'image';
  src: string;
  fit: 'fill' | 'fit' | 'tile';
  opacity?: number;
  tileScale?: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
  rotation?: number;
}

export type Paint = string | GradientPaint | PatternPaint | ImagePaintResolved;

export interface FillLayerPaint {
  paint: Paint;
  opacity?: number;
  visible?: boolean;
  blendMode?: LayerBlendMode;
}

export interface StrokeLayerPaint extends FillLayerPaint {
  width: number;
  align?: 'inside' | 'center' | 'outside';
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  miterLimit?: number;
  dashPattern?: number[];
  dashOffset?: number;
}

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

export interface ImageOutlineStyle {
  color: string;
  width: number;
  blur: number;
}

export type DrawCommand =
  | DrawRectCommand
  | DrawTextCommand
  | DrawTextOverflowIndicatorCommand
  | DrawEllipseCommand
  | DrawImageCommand
  | DrawPathCommand
  | ClipCommand
  | RestoreCommand
  | TransformCommand;

export interface DrawRectCommand {
  type: 'rect';
  nodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  fills?: FillLayerPaint[];
  strokes?: StrokeLayerPaint[];
  blendMode?: LayerBlendMode;
  cornerRadius?: number;
  opacity?: number;
  effects?: RenderableShadowEffect[];
}

export interface DrawTextCommand {
  type: 'text';
  nodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  font: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  lineHeightPx?: number;
  letterSpacingPx: number;
  textResizeMode: 'auto-width' | 'auto-height' | 'fixed';
  fill?: string;
  blendMode?: LayerBlendMode;
  opacity?: number;
  effects?: RenderableShadowEffect[];
}

export interface DrawTextOverflowIndicatorCommand {
  type: 'textOverflowIndicator';
  nodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

export interface DrawEllipseCommand {
  type: 'ellipse';
  nodeId?: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  fills?: FillLayerPaint[];
  strokes?: StrokeLayerPaint[];
  blendMode?: LayerBlendMode;
  opacity?: number;
  effects?: RenderableShadowEffect[];
}

export interface DrawImageCommand {
  type: 'image';
  nodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  maskSrc?: string;
  mask?: { sourceNodeId?: string; mode: 'alpha' | 'luminance'; enabled: boolean };
  blendMode?: LayerBlendMode;
  outline?: ImageOutlineStyle;
  opacity?: number;
  effects?: RenderableShadowEffect[];
}

export interface DrawPathCommand {
  type: 'path';
  nodeId?: string;
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  fills?: FillLayerPaint[];
  strokes?: StrokeLayerPaint[];
  blendMode?: LayerBlendMode;
  opacity?: number;
  fillRule?: 'nonzero' | 'evenodd';
  effects?: RenderableShadowEffect[];
}

export interface ClipCommand {
  type: 'clip';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
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
