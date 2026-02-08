import type { Document, Node } from '../core/doc/types';

export interface SelectionContext {
  selectedNodes: Node[];
  contextSummary: string;
}

export const buildSelectionContext = (
  doc: Document,
  selectedIds: string[]
): SelectionContext => {
  const selectedNodes = selectedIds
    .map(id => doc.nodes[id])
    .filter((node): node is Node => node !== undefined);

  const contextSummary = summarizeSelection(selectedNodes);

  return {
    selectedNodes,
    contextSummary,
  };
};

const summarizeSelection = (nodes: Node[]): string => {
  if (nodes.length === 0) {
    return 'No selection';
  }

  const types = nodes.map(n => n.type);
  const typeCounts = types.reduce((acc: Record<string, number>, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  return `Selected: ${summary}`;
};

export const nodesToJSON = (nodes: Node[]): string => {
  return JSON.stringify(
    nodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      position: node.position,
      size: node.size,
      fill: node.fill,
      stroke: node.stroke,
      text: node.text,
      fontSize: node.fontSize,
      fontFamily: node.fontFamily,
      fontWeight: node.fontWeight,
      textAlign: node.textAlign,
      lineHeightPx: node.lineHeightPx,
      letterSpacingPx: node.letterSpacingPx,
      textResizeMode: node.textResizeMode,
      componentId: node.componentId,
      variant: node.variant,
    })),
    null,
    2
  );
};

export const nodeToJSON = (node: Node): string => {
  return JSON.stringify(
    {
      id: node.id,
      type: node.type,
      name: node.name,
      position: node.position,
      size: node.size,
      fill: node.fill,
      stroke: node.stroke,
      text: node.text,
      fontSize: node.fontSize,
      fontFamily: node.fontFamily,
      fontWeight: node.fontWeight,
      textAlign: node.textAlign,
      lineHeightPx: node.lineHeightPx,
      letterSpacingPx: node.letterSpacingPx,
      textResizeMode: node.textResizeMode,
      layout: node.layout,
      componentId: node.componentId,
      variant: node.variant,
    },
    null,
    2
  );
};

export const getChildrenForAI = (doc: Document, nodeId: string): Node[] => {
  const node = doc.nodes[nodeId];
  if (!node || !node.children) {
    return [];
  }

  return node.children
    .map(id => doc.nodes[id])
    .filter((n): n is Node => n !== undefined);
};
