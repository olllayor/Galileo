import type { Document } from './types';

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type WorldPositionMap = Record<string, { x: number; y: number }>;
export type WorldBoundsMap = Record<string, Bounds>;
export type BoundsOverrideMap = Record<string, Bounds>;
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

export const buildWorldBoundsMap = (doc: Document, overrides?: BoundsOverrideMap): WorldBoundsMap => {
	const boundsMap: WorldBoundsMap = {};
	const root = doc.nodes[doc.rootId];
	if (!root) {
		return boundsMap;
	}

	const rootOverride = overrides?.[doc.rootId];
	const rootX = rootOverride?.x ?? root.position.x;
	const rootY = rootOverride?.y ?? root.position.y;

	const stack: Array<{ id: string; x: number; y: number }> = [{ id: doc.rootId, x: rootX, y: rootY }];

	while (stack.length > 0) {
		const current = stack.pop()!;
		const node = doc.nodes[current.id];
		if (!node) continue;

		const override = overrides?.[node.id];
		const worldX = override?.x ?? current.x;
		const worldY = override?.y ?? current.y;
		const width = override?.width ?? node.size.width;
		const height = override?.height ?? node.size.height;

		boundsMap[node.id] = { x: worldX, y: worldY, width, height };

		if (!node.children) continue;
		for (const childId of node.children) {
			const child = doc.nodes[childId];
			if (!child) continue;
			stack.push({
				id: childId,
				x: worldX + child.position.x,
				y: worldY + child.position.y,
			});
		}
	}

	return boundsMap;
};

export const getNodeWorldPosition = (
	doc: Document,
	nodeId: string,
	worldMap?: WorldPositionMap,
): { x: number; y: number } | null => {
	const map = worldMap ?? buildWorldPositionMap(doc);
	return map[nodeId] || null;
};

export const getNodeWorldBounds = (doc: Document, nodeId: string, boundsMap?: WorldBoundsMap): Bounds | null => {
	const map = boundsMap ?? buildWorldBoundsMap(doc);
	return map[nodeId] || null;
};

export const getSelectionBounds = (doc: Document, nodeIds: string[], boundsMap?: WorldBoundsMap): Bounds | null => {
	if (nodeIds.length === 0) return null;

	const map = boundsMap ?? buildWorldBoundsMap(doc);
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const id of nodeIds) {
		const bounds = map[id];
		if (!bounds) continue;

		minX = Math.min(minX, bounds.x);
		minY = Math.min(minY, bounds.y);
		maxX = Math.max(maxX, bounds.x + bounds.width);
		maxY = Math.max(maxY, bounds.y + bounds.height);
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

/**
 * Calculate the bounding box of a group's children in local coordinates.
 * Used to auto-size groups to fit their contents.
 */
export const calculateGroupBoundsFromChildren = (doc: Document, groupId: string): Bounds | null => {
	const group = doc.nodes[groupId];
	if (!group || !group.children || group.children.length === 0) {
		return null;
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	const collectBounds = (nodeId: string, offsetX: number, offsetY: number) => {
		const node = doc.nodes[nodeId];
		if (!node) return;

		const worldX = offsetX + node.position.x;
		const worldY = offsetY + node.position.y;

		minX = Math.min(minX, worldX);
		minY = Math.min(minY, worldY);
		maxX = Math.max(maxX, worldX + node.size.width);
		maxY = Math.max(maxY, worldY + node.size.height);

		// Recursively collect children bounds
		if (node.children) {
			for (const childId of node.children) {
				collectBounds(childId, worldX, worldY);
			}
		}
	};

	for (const childId of group.children) {
		collectBounds(childId, 0, 0);
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
