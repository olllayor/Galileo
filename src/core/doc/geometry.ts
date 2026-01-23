import type { Document } from './types';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WorldPositionMap = Record<string, { x: number; y: number }>;
export type ParentMap = Record<string, string | null>;

export const buildParentMap = (doc: Document): ParentMap => {
  const parentMap: ParentMap = {};
  const root = doc.nodes[doc.rootId];
  if (!root) {
    return parentMap;
  }

  parentMap[doc.rootId] = null;
  const stack = [doc.rootId];

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    const node = doc.nodes[nodeId];
    if (!node?.children) continue;

    for (const childId of node.children) {
      parentMap[childId] = nodeId;
      stack.push(childId);
    }
  }

  return parentMap;
};

export const buildWorldPositionMap = (doc: Document): WorldPositionMap => {
  const worldMap: WorldPositionMap = {};
  const root = doc.nodes[doc.rootId];
  if (!root) {
    return worldMap;
  }

  const stack: Array<{ id: string; x: number; y: number }> = [
    { id: doc.rootId, x: root.position.x, y: root.position.y },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    worldMap[current.id] = { x: current.x, y: current.y };

    const node = doc.nodes[current.id];
    if (!node?.children) continue;

    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (!child) continue;
      stack.push({
        id: childId,
        x: current.x + child.position.x,
        y: current.y + child.position.y,
      });
    }
  }

  return worldMap;
};

export const getNodeWorldPosition = (
  doc: Document,
  nodeId: string,
  worldMap?: WorldPositionMap
): { x: number; y: number } | null => {
  const map = worldMap ?? buildWorldPositionMap(doc);
  return map[nodeId] || null;
};

export const getNodeWorldBounds = (
  doc: Document,
  nodeId: string,
  worldMap?: WorldPositionMap
): Bounds | null => {
  const node = doc.nodes[nodeId];
  if (!node) return null;

  const position = getNodeWorldPosition(doc, nodeId, worldMap);
  if (!position) return null;

  return {
    x: position.x,
    y: position.y,
    width: node.size.width,
    height: node.size.height,
  };
};

export const getSelectionBounds = (
  doc: Document,
  nodeIds: string[],
  worldMap?: WorldPositionMap
): Bounds | null => {
  if (nodeIds.length === 0) return null;

  const map = worldMap ?? buildWorldPositionMap(doc);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const id of nodeIds) {
    const node = doc.nodes[id];
    const pos = map[id];
    if (!node || !pos) continue;

    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + node.size.width);
    maxY = Math.max(maxY, pos.y + node.size.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};
