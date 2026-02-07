import type { Bounds } from '../core/doc';
import type { VectorPoint } from '../core/doc/types';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type VectorBezierHandleKind = 'in' | 'out';

export interface VectorAnchorHandle {
	id: string;
	pointId: string;
	x: number;
	y: number;
	isFirst: boolean;
	isSelected: boolean;
	isHovered: boolean;
}

export interface VectorBezierHandle {
	id: string;
	pointId: string;
	kind: VectorBezierHandleKind;
	x: number;
	y: number;
	anchorX: number;
	anchorY: number;
	isHovered: boolean;
}

export interface VectorSegmentPreview {
	x: number;
	y: number;
}

export interface HandleRect {
  x: number;
  y: number;
  size: number;
}

export const getHandleWorldPoints = (bounds: Bounds): Record<ResizeHandle, { x: number; y: number }> => {
  const midX = bounds.x + bounds.width / 2;
  const midY = bounds.y + bounds.height / 2;
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;

  return {
    nw: { x: bounds.x, y: bounds.y },
    n: { x: midX, y: bounds.y },
    ne: { x: maxX, y: bounds.y },
    e: { x: maxX, y: midY },
    se: { x: maxX, y: maxY },
    s: { x: midX, y: maxY },
    sw: { x: bounds.x, y: maxY },
    w: { x: bounds.x, y: midY },
  };
};

export const getHandleScreenRects = (
  bounds: Bounds,
  view: { pan: { x: number; y: number }; zoom: number },
  size: number
): Record<ResizeHandle, HandleRect> => {
  const handles = getHandleWorldPoints(bounds);
  const rects: Record<ResizeHandle, HandleRect> = {
    nw: { x: 0, y: 0, size },
    n: { x: 0, y: 0, size },
    ne: { x: 0, y: 0, size },
    e: { x: 0, y: 0, size },
    se: { x: 0, y: 0, size },
    s: { x: 0, y: 0, size },
    sw: { x: 0, y: 0, size },
    w: { x: 0, y: 0, size },
  };

  for (const [key, point] of Object.entries(handles) as Array<[ResizeHandle, { x: number; y: number }]>) {
    const screenX = point.x * view.zoom + view.pan.x;
    const screenY = point.y * view.zoom + view.pan.y;
    rects[key] = {
      x: screenX - size / 2,
      y: screenY - size / 2,
      size,
    };
  }

  return rects;
};

export const hitTestHandle = (
  screenX: number,
  screenY: number,
  bounds: Bounds,
  view: { pan: { x: number; y: number }; zoom: number },
  hitSize: number
): ResizeHandle | null => {
  const rects = getHandleScreenRects(bounds, view, hitSize);
  for (const [handle, rect] of Object.entries(rects) as Array<[ResizeHandle, HandleRect]>) {
    if (
      screenX >= rect.x &&
      screenX <= rect.x + rect.size &&
      screenY >= rect.y &&
      screenY <= rect.y + rect.size
    ) {
      return handle;
    }
  }
  return null;
};

export const getHandleCursor = (handle: ResizeHandle): string => {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
  }
};

export const toScreenPoint = (
	point: { x: number; y: number },
	view: { pan: { x: number; y: number }; zoom: number },
): { x: number; y: number } => ({
	x: point.x * view.zoom + view.pan.x,
	y: point.y * view.zoom + view.pan.y,
});

export const toWorldPoint = (
	point: { x: number; y: number },
	view: { pan: { x: number; y: number }; zoom: number },
): { x: number; y: number } => ({
	x: (point.x - view.pan.x) / (view.zoom || 1),
	y: (point.y - view.pan.y) / (view.zoom || 1),
});

export const getVectorAnchorHandles = ({
	points,
	nodeWorld,
	selectedPointId,
	hoveredPointId,
}: {
	points: VectorPoint[];
	nodeWorld: { x: number; y: number };
	selectedPointId?: string | null;
	hoveredPointId?: string | null;
}): VectorAnchorHandle[] => {
	return points.map((point, index) => ({
		id: `anchor:${point.id}`,
		pointId: point.id,
		x: nodeWorld.x + point.x,
		y: nodeWorld.y + point.y,
		isFirst: index === 0,
		isSelected: selectedPointId === point.id,
		isHovered: hoveredPointId === point.id,
	}));
};

export const getVectorBezierHandles = ({
	points,
	nodeWorld,
	hovered,
}: {
	points: VectorPoint[];
	nodeWorld: { x: number; y: number };
	hovered?: { pointId: string; kind: VectorBezierHandleKind } | null;
}): VectorBezierHandle[] => {
	const handles: VectorBezierHandle[] = [];
	for (const point of points) {
		const anchorX = nodeWorld.x + point.x;
		const anchorY = nodeWorld.y + point.y;
		if (point.inHandle) {
			handles.push({
				id: `handle:${point.id}:in`,
				pointId: point.id,
				kind: 'in',
				x: nodeWorld.x + point.inHandle.x,
				y: nodeWorld.y + point.inHandle.y,
				anchorX,
				anchorY,
				isHovered: hovered?.pointId === point.id && hovered.kind === 'in',
			});
		}
		if (point.outHandle) {
			handles.push({
				id: `handle:${point.id}:out`,
				pointId: point.id,
				kind: 'out',
				x: nodeWorld.x + point.outHandle.x,
				y: nodeWorld.y + point.outHandle.y,
				anchorX,
				anchorY,
				isHovered: hovered?.pointId === point.id && hovered.kind === 'out',
			});
		}
	}
	return handles;
};

export const hitTestVectorAnchor = (
	screenX: number,
	screenY: number,
	anchors: VectorAnchorHandle[],
	view: { pan: { x: number; y: number }; zoom: number },
	hitRadiusPx = 8,
): VectorAnchorHandle | null => {
	const radiusSq = hitRadiusPx * hitRadiusPx;
	let best: VectorAnchorHandle | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const anchor of anchors) {
		const screen = toScreenPoint(anchor, view);
		const dx = screenX - screen.x;
		const dy = screenY - screen.y;
		const distanceSq = dx * dx + dy * dy;
		if (distanceSq <= radiusSq && distanceSq < bestDistance) {
			bestDistance = distanceSq;
			best = anchor;
		}
	}
	return best;
};

export const hitTestVectorBezierHandle = (
	screenX: number,
	screenY: number,
	handles: VectorBezierHandle[],
	view: { pan: { x: number; y: number }; zoom: number },
	hitRadiusPx = 7,
): VectorBezierHandle | null => {
	const radiusSq = hitRadiusPx * hitRadiusPx;
	let best: VectorBezierHandle | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const handle of handles) {
		const screen = toScreenPoint(handle, view);
		const dx = screenX - screen.x;
		const dy = screenY - screen.y;
		const distanceSq = dx * dx + dy * dy;
		if (distanceSq <= radiusSq && distanceSq < bestDistance) {
			bestDistance = distanceSq;
			best = handle;
		}
	}
	return best;
};
