import type { Bounds } from '../core/doc';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

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
