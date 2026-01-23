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

export const findNodeAtPosition = (
  doc: Document,
  x: number,
  y: number,
  hitSlop = 0
): Node | null => {
  const rootNode = doc.nodes[doc.rootId];
  if (!rootNode) {
    return null;
  }

  return findNodeRecursive(doc, rootNode, x, y, 0, 0, hitSlop);
};

const findNodeRecursive = (
  doc: Document,
  node: Node,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  hitSlop: number
): Node | null => {
  if (node.visible === false) {
    return null;
  }

  const worldX = offsetX + node.position.x;
  const worldY = offsetY + node.position.y;

  if (node.children && node.children.length > 0) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const childId = node.children[i];
      const child = doc.nodes[childId];
      if (child) {
        const childHit = findNodeRecursive(doc, child, x, y, worldX, worldY, hitSlop);
        if (childHit) {
          return childHit;
        }
      }
    }
  }

  const isHit = isPointInNode(node, x, y, worldX, worldY, hitSlop);
  return isHit ? node : null;
};

const isPointInNode = (
  node: Node,
  x: number,
  y: number,
  worldX: number,
  worldY: number,
  hitSlop: number
): boolean => {
  const { size } = node;
  return (
    x >= worldX - hitSlop &&
    x <= worldX + size.width + hitSlop &&
    y >= worldY - hitSlop &&
    y <= worldY + size.height + hitSlop
  );
};
