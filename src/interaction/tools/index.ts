import type { Document, Node } from '../../core/doc/types';
import { createNode } from '../../core/doc';

export interface Tool {
  type: 'select' | 'rectangle' | 'text';
  handleMouseDown: (
    doc: Document,
    x: number,
    y: number,
    selectedIds: string[]
  ) => Document | null;
  handleMouseMove?: (
    doc: Document,
    x: number,
    y: number,
    selectedIds: string[]
  ) => Document | null;
  handleMouseUp?: (
    doc: Document,
    x: number,
    y: number,
    selectedIds: string[]
  ) => Document | null;
}

export const createRectangleTool = (): Tool => ({
  type: 'rectangle',
  handleMouseDown: (doc, x, y) => {
    const newNode: Partial<Node> & { type: Node['type'] } = {
      type: 'rectangle',
      position: { x, y },
      size: { width: 100, height: 100 },
      fill: { type: 'solid', value: '#888888' },
      visible: true,
    };

    return createNode(doc, doc.rootId, newNode);
  },
});

export const createTextTool = (): Tool => ({
  type: 'text',
  handleMouseDown: (doc, x, y) => {
    const newNode: Partial<Node> & { type: Node['type'] } = {
      type: 'text',
      name: 'Text',
      position: { x, y },
      size: { width: 200, height: 30 },
      text: 'Text',
      fontSize: 16,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'normal',
      fill: { type: 'solid', value: '#000000' },
      visible: true,
    };

    return createNode(doc, doc.rootId, newNode);
  },
});

export type HitKind = 'edge' | 'fill';

export interface HitResult {
  node: Node;
  kind: HitKind;
  locked: boolean;
}

export interface HitTestOptions {
  hitSlopPx?: number;
  edgeMinPx?: number;
}

type WorldPoint = { x: number; y: number };
type WorldTransform = { x: number; y: number; scaleX: number; scaleY: number };
type HitTestContext = { zoom: number; hitSlopPx: number; edgeMinPx: number };

const IDENTITY_TRANSFORM: WorldTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

export const hitTestNodeAtPosition = (
  doc: Document,
  worldX: number,
  worldY: number,
  zoom: number,
  options: HitTestOptions = {}
): HitResult | null => {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return null;
  }

  const rootNode = doc.nodes[doc.rootId];
  if (!rootNode) {
    return null;
  }

  const zoomSafe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const hitSlopPx = Number.isFinite(options.hitSlopPx)
    ? Math.max(0, options.hitSlopPx)
    : 0;
  const edgeMinPx = Number.isFinite(options.edgeMinPx)
    ? Math.max(0, options.edgeMinPx)
    : hitSlopPx;
  const context: HitTestContext = {
    zoom: zoomSafe,
    hitSlopPx,
    edgeMinPx,
  };

  return hitTestNodeRecursive(
    doc,
    rootNode,
    { x: worldX, y: worldY },
    IDENTITY_TRANSFORM,
    context
  );
};

export const findNodeAtPosition = (
  doc: Document,
  x: number,
  y: number,
  hitSlop = 0
): Node | null => {
  const hit = hitTestNodeAtPosition(doc, x, y, 1, { hitSlopPx: hitSlop });
  return hit?.node ?? null;
};

const hitTestNodeRecursive = (
  doc: Document,
  node: Node,
  worldPoint: WorldPoint,
  parentTransform: WorldTransform,
  context: HitTestContext
): HitResult | null => {
  if (node.visible === false) {
    return null;
  }

  const nodeTransform = composeTransform(parentTransform, node);

  if (node.children && node.children.length > 0) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const childId = node.children[i];
      const child = doc.nodes[childId];
      if (child) {
        const childHit = hitTestNodeRecursive(doc, child, worldPoint, nodeTransform, context);
        if (childHit) {
          return childHit;
        }
      }
    }
  }

  const localPoint = toLocalPoint(worldPoint, nodeTransform);
  if (!localPoint) {
    return null;
  }

  const kind = hitTestNodeShape(node, localPoint, nodeTransform, context);
  if (!kind) {
    return null;
  }

  return {
    node,
    kind,
    locked: node.locked === true,
  };
};

const composeTransform = (parent: WorldTransform, node: Node): WorldTransform => {
  const scale = getNodeScale(node);
  return {
    x: parent.x + node.position.x * parent.scaleX,
    y: parent.y + node.position.y * parent.scaleY,
    scaleX: parent.scaleX * scale.x,
    scaleY: parent.scaleY * scale.y,
  };
};

const getNodeScale = (node: Node): { x: number; y: number } => {
  const nodeAny = node as Node & {
    scaleX?: number;
    scaleY?: number;
    scale?: { x?: number; y?: number };
  };
  const rawX = typeof nodeAny.scaleX === 'number'
    ? nodeAny.scaleX
    : typeof nodeAny.scale?.x === 'number'
      ? nodeAny.scale.x
      : 1;
  const rawY = typeof nodeAny.scaleY === 'number'
    ? nodeAny.scaleY
    : typeof nodeAny.scale?.y === 'number'
      ? nodeAny.scale.y
      : 1;
  return {
    x: Number.isFinite(rawX) && rawX !== 0 ? rawX : 1,
    y: Number.isFinite(rawY) && rawY !== 0 ? rawY : 1,
  };
};

const toLocalPoint = (worldPoint: WorldPoint, transform: WorldTransform): WorldPoint | null => {
  const invScaleX = transform.scaleX !== 0 ? 1 / transform.scaleX : 0;
  const invScaleY = transform.scaleY !== 0 ? 1 / transform.scaleY : 0;
  const x = (worldPoint.x - transform.x) * invScaleX;
  const y = (worldPoint.y - transform.y) * invScaleY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
};

const hitTestNodeShape = (
  node: Node,
  localPoint: WorldPoint,
  transform: WorldTransform,
  context: HitTestContext
): HitKind | null => {
  switch (node.type) {
    case 'frame':
      return hitTestRect(node, localPoint, transform, context, true);
    case 'image':
    case 'componentInstance':
      return hitTestRect(node, localPoint, transform, context, true);
    case 'rectangle':
      return hitTestRect(node, localPoint, transform, context, Boolean(node.fill));
    case 'ellipse':
      return hitTestEllipse(node, localPoint, transform, context, Boolean(node.fill));
    case 'path':
      return hitTestPath(node, localPoint, transform, context, Boolean(node.fill));
    case 'text':
      return hitTestText(node, localPoint, transform, context);
    default:
      return null;
  }
};

const hitTestRect = (
  node: Node,
  localPoint: WorldPoint,
  transform: WorldTransform,
  context: HitTestContext,
  allowFill: boolean
): HitKind | null => {
  const { width, height } = node.size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
    return null;
  }

  const edge = getEdgeThickness(node, context, transform);
  const expandedLeft = -edge;
  const expandedTop = -edge;
  const expandedRight = width + edge;
  const expandedBottom = height + edge;

  if (
    localPoint.x < expandedLeft ||
    localPoint.x > expandedRight ||
    localPoint.y < expandedTop ||
    localPoint.y > expandedBottom
  ) {
    return null;
  }

  const inside =
    localPoint.x >= 0 &&
    localPoint.x <= width &&
    localPoint.y >= 0 &&
    localPoint.y <= height;

  if (!inside) {
    return 'edge';
  }

  const distanceToEdge = Math.min(
    localPoint.x,
    localPoint.y,
    width - localPoint.x,
    height - localPoint.y
  );

  if (distanceToEdge <= edge) {
    return 'edge';
  }

  return allowFill ? 'fill' : null;
};

const hitTestEllipse = (
  node: Node,
  localPoint: WorldPoint,
  transform: WorldTransform,
  context: HitTestContext,
  allowFill: boolean
): HitKind | null => {
  const { width, height } = node.size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const edge = getEdgeThickness(node, context, transform);
  if (
    localPoint.x < -edge ||
    localPoint.x > width + edge ||
    localPoint.y < -edge ||
    localPoint.y > height + edge
  ) {
    return null;
  }

  const ctx = getHitTestContext();
  if (!ctx || typeof Path2D !== 'function') {
    return hitTestRect(node, localPoint, transform, context, true);
  }

  const path = new Path2D();
  path.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = Math.max(edge * 2, 0.0001);
  const inStroke =
    typeof ctx.isPointInStroke === 'function' && ctx.isPointInStroke(path, localPoint.x, localPoint.y);
  const inFill = allowFill && ctx.isPointInPath(path, localPoint.x, localPoint.y);
  ctx.restore();

  if (inStroke) {
    return 'edge';
  }
  if (inFill) {
    return 'fill';
  }
  return null;
};

const hitTestPath = (
  node: Node,
  localPoint: WorldPoint,
  transform: WorldTransform,
  context: HitTestContext,
  allowFill: boolean
): HitKind | null => {
  const { width, height } = node.size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const edge = getEdgeThickness(node, context, transform);
  if (
    localPoint.x < -edge ||
    localPoint.x > width + edge ||
    localPoint.y < -edge ||
    localPoint.y > height + edge
  ) {
    return null;
  }

  const pathData = getNodePathData(node);
  const ctx = getHitTestContext();
  if (!pathData || !ctx || typeof Path2D !== 'function') {
    return hitTestRect(node, localPoint, transform, context, true);
  }

  const path = new Path2D(pathData.d);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = Math.max(edge * 2, 0.0001);
  const fillRule = pathData.fillRule ?? 'nonzero';
  const inStroke =
    typeof ctx.isPointInStroke === 'function' && ctx.isPointInStroke(path, localPoint.x, localPoint.y);
  const inFill = allowFill && ctx.isPointInPath(path, localPoint.x, localPoint.y, fillRule);
  ctx.restore();

  if (inStroke) {
    return 'edge';
  }
  if (inFill) {
    return 'fill';
  }
  return null;
};

const hitTestText = (
  node: Node,
  localPoint: WorldPoint,
  transform: WorldTransform,
  context: HitTestContext
): HitKind | null => {
  const { width, height } = node.size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
    return null;
  }

  const hitSlop = getHitSlopLocal(context, transform);
  if (
    localPoint.x >= -hitSlop &&
    localPoint.x <= width + hitSlop &&
    localPoint.y >= -hitSlop &&
    localPoint.y <= height + hitSlop
  ) {
    return 'fill';
  }
  return null;
};

const getEdgeThickness = (
  node: Node,
  context: HitTestContext,
  transform: WorldTransform
): number => {
  const zoomSafe = context.zoom > 0 ? context.zoom : 1;
  const strokeWidth = Number.isFinite(node.stroke?.width) ? node.stroke!.width : 0;
  const edgeMinWorld = context.edgeMinPx / zoomSafe;
  const hitSlopWorld = context.hitSlopPx / zoomSafe;
  const edgeWorld = Math.max(strokeWidth / 2, edgeMinWorld) + hitSlopWorld;
  const scale = getScaleFactor(transform);
  return edgeWorld / scale;
};

const getHitSlopLocal = (context: HitTestContext, transform: WorldTransform): number => {
  const zoomSafe = context.zoom > 0 ? context.zoom : 1;
  const hitSlopWorld = context.hitSlopPx / zoomSafe;
  return hitSlopWorld / getScaleFactor(transform);
};

const getScaleFactor = (transform: WorldTransform): number => {
  const scale = Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY));
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return scale;
};

let cachedHitTestCtx: CanvasRenderingContext2D | null = null;

const getHitTestContext = (): CanvasRenderingContext2D | null => {
  if (cachedHitTestCtx) {
    return cachedHitTestCtx;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  cachedHitTestCtx = canvas.getContext('2d');
  return cachedHitTestCtx;
};

const getNodePathData = (
  node: Node
): { d: string; fillRule?: 'nonzero' | 'evenodd' } | null => {
  if (typeof node.path === 'string') {
    return { d: node.path };
  }
  if (node.path && typeof node.path === 'object') {
    const obj = node.path as Record<string, unknown>;
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
  const nodeAny = node as Node & { pathData?: unknown; d?: unknown };
  if (typeof nodeAny.pathData === 'string') {
    return { d: nodeAny.pathData };
  }
  if (typeof nodeAny.d === 'string') {
    return { d: nodeAny.d };
  }
  return null;
};
