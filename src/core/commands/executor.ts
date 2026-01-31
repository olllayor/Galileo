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

		case 'reorderChild': {
			const { parentId, fromIndex, toIndex } = cmd.payload;
			const parent = draft.nodes[parentId];
			if (!parent?.children || parent.children.length === 0) {
				break;
			}
			if (fromIndex < 0 || fromIndex >= parent.children.length) {
				break;
			}
			const [moved] = parent.children.splice(fromIndex, 1);
			const clamped = Math.max(0, Math.min(toIndex, parent.children.length));
			parent.children.splice(clamped, 0, moved);
			break;
		}

		case 'createAsset': {
			const { id, asset } = cmd.payload;
			draft.assets[id] = asset;
			break;
		}

		case 'groupNodes': {
			const { groupId, nodeIds, parentId, insertIndex } = cmd.payload;
			const parent = draft.nodes[parentId];
			if (!parent?.children) break;

			// Calculate bounding box of all nodes to be grouped
			let minX = Infinity,
				minY = Infinity;
			let maxX = -Infinity,
				maxY = -Infinity;

			for (const nodeId of nodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				minX = Math.min(minX, node.position.x);
				minY = Math.min(minY, node.position.y);
				maxX = Math.max(maxX, node.position.x + node.size.width);
				maxY = Math.max(maxY, node.position.y + node.size.height);
			}

			// Create group node at the bounding box position
			const groupNode: Node = {
				id: groupId,
				type: 'group',
				name: 'Group',
				position: { x: minX, y: minY },
				size: { width: maxX - minX, height: maxY - minY },
				children: [],
				visible: true,
			};
			draft.nodes[groupId] = groupNode;

			// Remove nodes from parent and add to group, adjusting positions to be relative to group
			const nodeIdSet = new Set(nodeIds);
			parent.children = parent.children.filter((id: string) => !nodeIdSet.has(id));

			// Sort nodeIds by their original order in parent to preserve z-order
			const orderedNodeIds = nodeIds.slice();

			for (const nodeId of orderedNodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				// Make position relative to group
				node.position = {
					x: node.position.x - minX,
					y: node.position.y - minY,
				};
				groupNode.children!.push(nodeId);
			}

			// Insert group at specified index
			parent.children.splice(insertIndex, 0, groupId);
			break;
		}

		case 'ungroupNodes': {
			const { groupId } = cmd.payload;
			const group = draft.nodes[groupId];
			if (!group || group.type !== 'group') break;

			const parent = findParent(draft, groupId);
			if (!parent?.children) break;

			const groupIndex = parent.children.indexOf(groupId);
			if (groupIndex === -1) break;

			// Move children back to parent, restoring world positions
			const childIds = group.children || [];
			for (const childId of childIds) {
				const child = draft.nodes[childId];
				if (!child) continue;
				// Restore world position
				child.position = {
					x: child.position.x + group.position.x,
					y: child.position.y + group.position.y,
				};
			}

			// Remove group from parent and insert children at group's position
			parent.children.splice(groupIndex, 1, ...childIds);

			// Delete group node
			delete draft.nodes[groupId];
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

export const getCommandPatches = (doc: Document, cmd: Command): { patches: Patch[]; inversePatches: Patch[] } => {
	let patches: Patch[] = [];
	let inversePatches: Patch[] = [];

	produce(
		doc,
		(draft) => {
			applyCommandToDraft(draft, cmd);
		},
		(p, ip) => {
			patches = p;
			inversePatches = ip;
		},
	);

	return { patches, inversePatches };
};
