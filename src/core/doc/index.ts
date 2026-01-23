import type { Document, Node } from './types';
import { generateId } from './id';
export * from './geometry';
export * from './serialization';

export const createNode = (
  doc: Document,
  parentId: string,
  node: Partial<Node> & { type: Node['type'] },
  index?: number
): Document => {
  const id = (node as { id?: string }).id || generateId();

  const newNode: Node = {
    id,
    type: node.type,
    position: node.position || { x: 0, y: 0 },
    size: node.size || { width: 100, height: 100 },
    children: [],
    ...(node as Record<string, unknown>),
  };

  const parent = doc.nodes[parentId];
  if (!parent) {
    throw new Error(`Parent node ${parentId} not found`);
  }

  const newChildren = [...(parent.children || [])];
  if (index !== undefined) {
    newChildren.splice(index, 0, id);
  } else {
    newChildren.push(id);
  }

  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [id]: newNode,
      [parentId]: {
        ...parent,
        children: newChildren,
      },
    },
  };
};

export const deleteNode = (doc: Document, nodeId: string): Document => {
  const node = doc.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  if (nodeId === doc.rootId) {
    throw new Error('Cannot delete root node');
  }

  const nodesToDelete = collectNodesToDelete(doc, nodeId);
  const newNodes = { ...doc.nodes };

  for (const id of nodesToDelete) {
    delete newNodes[id];
  }

  const parent = findParentNode(doc, nodeId);
  if (parent) {
    newNodes[parent.id] = {
      ...parent,
      children: parent.children?.filter(id => id !== nodeId) || [],
    };
  }

  return {
    ...doc,
    nodes: newNodes,
  };
};

const collectNodesToDelete = (doc: Document, nodeId: string): string[] => {
  const toDelete: string[] = [nodeId];
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = doc.nodes[current];
    if (node?.children) {
      for (const childId of node.children) {
        toDelete.push(childId);
        queue.push(childId);
      }
    }
  }

  return toDelete;
};

export const findParentNode = (
  doc: Document,
  nodeId: string
): Node | null => {
  for (const node of Object.values(doc.nodes)) {
    if (node.children?.includes(nodeId)) {
      return node;
    }
  }
  return null;
};

export const getNodeById = (doc: Document, nodeId: string): Node | null => {
  return doc.nodes[nodeId] || null;
};

export const updateNode = (
  doc: Document,
  nodeId: string,
  updates: Partial<Node>
): Document => {
  const node = doc.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [nodeId]: {
        ...node,
        ...updates,
      },
    },
  };
};

export const moveNode = (
  doc: Document,
  nodeId: string,
  newParentId: string,
  newIndex?: number
): Document => {
  const node = doc.nodes[nodeId];
  const newParent = doc.nodes[newParentId];

  if (!node || !newParent) {
    throw new Error('Node or parent not found');
  }

  const oldParent = findParentNode(doc, nodeId);
  if (!oldParent) {
    throw new Error('Node has no parent');
  }

  if (oldParent.id === newParentId) {
    return doc;
  }

  const newNodes = { ...doc.nodes };

  newNodes[oldParent.id] = {
    ...oldParent,
    children: oldParent.children?.filter(id => id !== nodeId) || [],
  };

  const newParentChildren = [...(newParent.children || [])];
  if (newIndex !== undefined) {
    newParentChildren.splice(newIndex, 0, nodeId);
  } else {
    newParentChildren.push(nodeId);
  }

  newNodes[newParentId] = {
    ...newParent,
    children: newParentChildren,
  };

  return {
    ...doc,
    nodes: newNodes,
  };
};

export const getAllNodes = (doc: Document): Node[] => {
  return Object.values(doc.nodes);
};

export const getNodesByType = (doc: Document, type: Node['type']): Node[] => {
  return Object.values(doc.nodes).filter(node => node.type === type);
};
