import type { Document } from '../core/doc/types';
import type { Bounds, ParentMap, WorldPositionMap } from '../core/doc';

export interface SnapGuide {
  orientation: 'vertical' | 'horizontal';
  value: number;
}

export interface SnapTargets {
  x: number[];
  y: number[];
}

export const buildSiblingSnapTargets = (
  doc: Document,
  nodeId: string,
  parentMap: ParentMap,
  worldMap: WorldPositionMap
): SnapTargets => {
  const parentId = parentMap[nodeId];
  if (!parentId) {
    return { x: [], y: [] };
  }

  const parent = doc.nodes[parentId];
  if (!parent?.children) {
    return { x: [], y: [] };
  }

  const targets: SnapTargets = { x: [], y: [] };

  for (const siblingId of parent.children) {
    if (siblingId === nodeId) continue;
    const sibling = doc.nodes[siblingId];
    const pos = worldMap[siblingId];
    if (!sibling || !pos) continue;

    const left = pos.x;
    const right = pos.x + sibling.size.width;
    const centerX = pos.x + sibling.size.width / 2;
    targets.x.push(left, centerX, right);

    const top = pos.y;
    const bottom = pos.y + sibling.size.height;
    const centerY = pos.y + sibling.size.height / 2;
    targets.y.push(top, centerY, bottom);
  }

  return targets;
};

const getEdges = (bounds: Bounds) => ({
  left: bounds.x,
  centerX: bounds.x + bounds.width / 2,
  right: bounds.x + bounds.width,
  top: bounds.y,
  centerY: bounds.y + bounds.height / 2,
  bottom: bounds.y + bounds.height,
});

export const applySnapping = (
  bounds: Bounds,
  deltaX: number,
  deltaY: number,
  targets: SnapTargets,
  zoom: number,
  gridSize = 10,
  thresholdPx = 6
): { deltaX: number; deltaY: number; guides: SnapGuide[] } => {
  const threshold = thresholdPx / (zoom || 1);
  const edges = getEdges(bounds);
  const guides: SnapGuide[] = [];

  const moveEdgesX = [
    { name: 'left', value: edges.left },
    { name: 'centerX', value: edges.centerX },
    { name: 'right', value: edges.right },
  ];

  const moveEdgesY = [
    { name: 'top', value: edges.top },
    { name: 'centerY', value: edges.centerY },
    { name: 'bottom', value: edges.bottom },
  ];

  let bestX: { diff: number; target: number } | null = null;
  for (const edge of moveEdgesX) {
    const moved = edge.value + deltaX;
    const gridTarget = Math.round(moved / gridSize) * gridSize;
    const gridDiff = gridTarget - moved;
    if (Math.abs(gridDiff) <= threshold) {
      bestX = !bestX || Math.abs(gridDiff) < Math.abs(bestX.diff)
        ? { diff: gridDiff, target: gridTarget }
        : bestX;
    }

    for (const target of targets.x) {
      const diff = target - moved;
      if (Math.abs(diff) <= threshold) {
        bestX = !bestX || Math.abs(diff) < Math.abs(bestX.diff)
          ? { diff, target }
          : bestX;
      }
    }
  }

  let bestY: { diff: number; target: number } | null = null;
  for (const edge of moveEdgesY) {
    const moved = edge.value + deltaY;
    const gridTarget = Math.round(moved / gridSize) * gridSize;
    const gridDiff = gridTarget - moved;
    if (Math.abs(gridDiff) <= threshold) {
      bestY = !bestY || Math.abs(gridDiff) < Math.abs(bestY.diff)
        ? { diff: gridDiff, target: gridTarget }
        : bestY;
    }

    for (const target of targets.y) {
      const diff = target - moved;
      if (Math.abs(diff) <= threshold) {
        bestY = !bestY || Math.abs(diff) < Math.abs(bestY.diff)
          ? { diff, target }
          : bestY;
      }
    }
  }

  let snappedX = deltaX;
  if (bestX) {
    snappedX = deltaX + bestX.diff;
    guides.push({ orientation: 'vertical', value: bestX.target });
  }

  let snappedY = deltaY;
  if (bestY) {
    snappedY = deltaY + bestY.diff;
    guides.push({ orientation: 'horizontal', value: bestY.target });
  }

  return { deltaX: snappedX, deltaY: snappedY, guides };
};

const snapValue = (
  value: number,
  targets: number[],
  gridSize: number,
  threshold: number
): { diff: number; target: number } | null => {
  let best: { diff: number; target: number } | null = null;
  const gridTarget = Math.round(value / gridSize) * gridSize;
  const gridDiff = gridTarget - value;
  if (Math.abs(gridDiff) <= threshold) {
    best = { diff: gridDiff, target: gridTarget };
  }

  for (const target of targets) {
    const diff = target - value;
    if (Math.abs(diff) <= threshold) {
      if (!best || Math.abs(diff) < Math.abs(best.diff)) {
        best = { diff, target };
      }
    }
  }

  return best;
};

export const applyResizeSnapping = (
  startBounds: Bounds,
  nextBounds: Bounds,
  targets: SnapTargets,
  zoom: number,
  gridSize = 10,
  thresholdPx = 6
): { bounds: Bounds; guides: SnapGuide[] } => {
  const threshold = thresholdPx / (zoom || 1);
  const guides: SnapGuide[] = [];
  const snapped = { ...nextBounds };

  const edges = {
    left: nextBounds.x,
    centerX: nextBounds.x + nextBounds.width / 2,
    right: nextBounds.x + nextBounds.width,
    top: nextBounds.y,
    centerY: nextBounds.y + nextBounds.height / 2,
    bottom: nextBounds.y + nextBounds.height,
  };

  const movedLeft = Math.abs(nextBounds.x - startBounds.x) > 0.001;
  const movedRight = Math.abs(nextBounds.width - startBounds.width) > 0.001;
  const movedTop = Math.abs(nextBounds.y - startBounds.y) > 0.001;
  const movedBottom = Math.abs(nextBounds.height - startBounds.height) > 0.001;

  if (movedLeft) {
    const snap = snapValue(edges.left, targets.x, gridSize, threshold);
    if (snap) {
      snapped.x += snap.diff;
      snapped.width = Math.max(1, startBounds.x + startBounds.width - snapped.x);
      guides.push({ orientation: 'vertical', value: snap.target });
    }
  } else if (movedRight) {
    const snap = snapValue(edges.right, targets.x, gridSize, threshold);
    if (snap) {
      snapped.width = Math.max(1, edges.right + snap.diff - startBounds.x);
      guides.push({ orientation: 'vertical', value: snap.target });
    }
  }

  if (movedTop) {
    const snap = snapValue(edges.top, targets.y, gridSize, threshold);
    if (snap) {
      snapped.y += snap.diff;
      snapped.height = Math.max(1, startBounds.y + startBounds.height - snapped.y);
      guides.push({ orientation: 'horizontal', value: snap.target });
    }
  } else if (movedBottom) {
    const snap = snapValue(edges.bottom, targets.y, gridSize, threshold);
    if (snap) {
      snapped.height = Math.max(1, edges.bottom + snap.diff - startBounds.y);
      guides.push({ orientation: 'horizontal', value: snap.target });
    }
  }

  return { bounds: snapped, guides };
};
