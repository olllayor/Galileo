import { produce, enablePatches, Patch } from 'immer';
import type { Command } from './types';
import type { Asset, Document, Node } from '../doc/types';

type DraftDocument = {
  rootId: string;
  nodes: Record<string, Node>;
  assets: Record<string, Asset>;
};

enablePatches();

export const applyCommand = (doc: Document, cmd: Command): Document => {
  return produce(doc, (draft) => {
    applyCommandToDraft(draft as DraftDocument, cmd);
  });
};

const applyCommandToDraft = (draft: DraftDocument, cmd: Command): void => {
  switch (cmd.type) {
    case 'createNode': {
      const { id, parentId, node, index } = cmd.payload;
      const newNode = {
        ...node,
        id,
        children: [],
      };
      draft.nodes[id] = newNode;

      const parent = draft.nodes[parentId];
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        if (index !== undefined) {
          parent.children.splice(index, 0, id);
        } else {
          parent.children.push(id);
        }
      }
      break;
    }

    case 'deleteNode': {
      const { id } = cmd.payload;
      if (id === draft.rootId) {
        throw new Error('Cannot delete root node');
      }

      const toDelete = collectNodes(draft, id);
      for (const nodeId of toDelete) {
        delete draft.nodes[nodeId];
      }

      const parent = findParent(draft, id);
      if (parent && parent.children) {
        parent.children = parent.children.filter((childId: string) => childId !== id);
      }
      break;
    }

    case 'moveNode': {
      const { id, position } = cmd.payload;
      const node = draft.nodes[id];
      if (node) {
        node.position = { ...position };
      }
      break;
    }

    case 'resizeNode': {
      const { id, size } = cmd.payload;
      const node = draft.nodes[id];
      if (node) {
        node.size = { ...size };
      }
      break;
    }

    case 'setProps': {
      const { id, props } = cmd.payload;
      const node = draft.nodes[id];
      if (node) {
        Object.assign(node, props);
      }
      break;
    }

    case 'createAsset': {
      const { id, asset } = cmd.payload;
      draft.assets[id] = asset;
      break;
    }

    case 'batch': {
      for (const subCmd of cmd.payload.commands) {
        applyCommandToDraft(draft, subCmd);
      }
      break;
    }
  }
};

const collectNodes = (draft: DraftDocument, nodeId: string): string[] => {
  const toDelete: string[] = [nodeId];
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = draft.nodes[current];
    if (node?.children) {
      for (const childId of node.children) {
        toDelete.push(childId);
        queue.push(childId);
      }
    }
  }

  return toDelete;
};

const findParent = (draft: DraftDocument, nodeId: string): Node | null => {
  for (const node of Object.values(draft.nodes)) {
    if (node.children?.includes(nodeId)) {
      return node;
    }
  }
  return null;
};

export const getCommandPatches = (
  doc: Document,
  cmd: Command
): { patches: Patch[]; inversePatches: Patch[] } => {
  let patches: Patch[] = [];
  let inversePatches: Patch[] = [];

  produce(doc, (draft) => {
    applyCommandToDraft(draft, cmd);
  }, (p, ip) => {
    patches = p;
    inversePatches = ip;
  });

  return { patches, inversePatches };
};
