import { buildWorldBoundsMap, type WorldBoundsMap } from '../../core/doc';
import type { Color, Document, Node } from '../../core/doc/types';
import type { DrawCommand, GradientPaint, GradientStop, Paint } from './types';

type BuildDrawListOptions = {
  includeFrameFill?: boolean;
  clipToBounds?: boolean;
};

export const buildDrawList = (doc: Document, boundsMap?: WorldBoundsMap): DrawCommand[] => {
  const rootNode = doc.nodes[doc.rootId];
  if (!rootNode) {
    return [];
  }

  const map = boundsMap ?? buildWorldBoundsMap(doc);
  const commands: DrawCommand[] = [];
  buildNodeCommandsFromBounds(doc, rootNode, commands, map, { x: 0, y: 0 }, doc.rootId, true);

  return commands;
};

export const buildDrawListForNode = (
  doc: Document,
  nodeId: string,
  options: BuildDrawListOptions = {},
  boundsMap?: WorldBoundsMap
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
    });
  }
  buildNodeCommandsFromBounds(doc, node, commands, map, base, nodeId, includeFrameFill);
  return commands;
};

const buildNodeCommandsFromBounds = (
  doc: Document,
  node: Node,
  commands: DrawCommand[],
  boundsMap: WorldBoundsMap,
  base: { x: number; y: number },
  rootId: string,
  includeRootFrameFill: boolean
): void => {
  const bounds = boundsMap[node.id];
  if (!bounds) {
    return;
  }

  const x = bounds.x - base.x;
  const y = bounds.y - base.y;
  const width = bounds.width;
  const height = bounds.height;

  if (node.visible === false) {
    return;
  }

  if (node.type === 'frame') {
    const shouldIncludeFill = node.id !== rootId || includeRootFrameFill;
    if (node.fill && shouldIncludeFill) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: colorToPaint(node.fill),
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }

    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommandsFromBounds(doc, child, commands, boundsMap, base, rootId, includeRootFrameFill);
        }
      }
    }
  } else if (node.type === 'rectangle') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: node.fill ? colorToPaint(node.fill) : undefined,
        stroke: node.stroke ? colorToPaint(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'ellipse') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'ellipse',
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        fill: node.fill ? colorToPaint(node.fill) : undefined,
        stroke: node.stroke ? colorToPaint(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'text') {
    commands.push({
      type: 'text',
      x,
      y,
      text: node.text || '',
      font: `${node.fontWeight || 'normal'} ${node.fontSize || 14}px ${node.fontFamily || 'sans-serif'}`,
      fontSize: node.fontSize || 14,
      fill: colorToText(node.fill),
      opacity: node.opacity,
    });
  } else if (node.type === 'image') {
    const src = resolveImageSource(doc, node);
    if (src) {
      commands.push({
        type: 'image',
        x,
        y,
        width,
        height,
        src,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'path') {
    const pathData = getNodePathData(node);
    if (pathData && (node.fill || node.stroke)) {
      commands.push({
        type: 'path',
        d: pathData.d,
        x,
        y,
        width,
        height,
        fill: node.fill ? colorToPaint(node.fill) : undefined,
        stroke: node.stroke ? colorToPaint(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        opacity: node.opacity,
        fillRule: pathData.fillRule,
      });
    } else if (node.fill) {
      const color = colorToPaint(node.fill);
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: color,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'componentInstance') {
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommandsFromBounds(doc, child, commands, boundsMap, base, rootId, includeRootFrameFill);
        }
      }
    }
  }
};

const DEFAULT_FALLBACK_COLOR = '#000000';

const colorToPaint = (color?: Color | string): Paint | undefined => {
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
  return DEFAULT_FALLBACK_COLOR;
};

const colorToText = (color?: Color | string): string => {
  const paint = colorToPaint(color);
  if (!paint) {
    return DEFAULT_FALLBACK_COLOR;
  }
  if (typeof paint === 'string') {
    return paint;
  }
  return paint.stops[0]?.color ?? DEFAULT_FALLBACK_COLOR;
};

const buildGradientPaint = (
  color: Extract<Color, { type: 'gradient' }> & Record<string, unknown>
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
  color: Extract<Color, { type: 'gradient' }> & Record<string, unknown>
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
    if (
      typeof obj.r === 'number' &&
      typeof obj.g === 'number' &&
      typeof obj.b === 'number'
    ) {
      const a = typeof obj.a === 'number' ? obj.a : undefined;
      return rgbaFromComponents({ r: obj.r, g: obj.g, b: obj.b, a });
    }
    if (
      typeof obj.red === 'number' &&
      typeof obj.green === 'number' &&
      typeof obj.blue === 'number'
    ) {
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

const rgbaFromComponents = (input: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): string => {
  const toByte = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    const scaled = value <= 1 ? value * 255 : value;
    return Math.max(0, Math.min(255, Math.round(scaled)));
  };
  const r = toByte(input.r);
  const g = toByte(input.g);
  const b = toByte(input.b);
  const alpha =
    typeof input.a === 'number' && Number.isFinite(input.a)
      ? Math.max(0, Math.min(1, input.a))
      : 1;
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

const getNodePathData = (
  node: Node
): { d: string; fillRule?: 'nonzero' | 'evenodd' } | null => {
  const n = node as Node & {
    path?: unknown;
    pathData?: unknown;
    d?: unknown;
  };
  if (typeof n.path === 'string') {
    return { d: n.path };
  }
  if (n.path && typeof n.path === 'object') {
    const obj = n.path as Record<string, unknown>;
    const d =
      (typeof obj.d === 'string' && obj.d) ||
      (typeof obj.path === 'string' && obj.path) ||
      (typeof obj.data === 'string' && obj.data);
    if (d) {
      const fillRule =
        obj.fillRule === 'evenodd' || obj.fillRule === 'nonzero'
          ? (obj.fillRule as 'evenodd' | 'nonzero')
          : undefined;
      return { d, fillRule };
    }
  }
  if (typeof n.pathData === 'string') {
    return { d: n.pathData };
  }
  if (typeof n.d === 'string') {
    return { d: n.d };
  }
  return null;
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

export const colorToRGBA = (color: string): { r: number; g: number; b: number; a: number } => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
};
