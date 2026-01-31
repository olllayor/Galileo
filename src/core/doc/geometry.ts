import type { Document, Node } from './types';

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

/**
 * Compute layout positions for children of a node with auto-layout enabled.
 * Returns a map of childId -> computed local position within the parent.
 */
export const computeAutoLayoutPositions = (
	parent: Node,
	children: Node[],
): Record<string, { x: number; y: number }> => {
	const positions: Record<string, { x: number; y: number }> = {};
	const layout = parent.layout;

	if (!layout || layout.type !== 'auto') {
		// No auto-layout, use stored positions
		for (const child of children) {
			positions[child.id] = { x: child.position.x, y: child.position.y };
		}
		return positions;
	}

	const { direction, gap, padding, alignment } = layout;
	const isRow = direction === 'row';

	// Calculate total content size for alignment
	let totalMainSize = 0;
	let maxCrossSize = 0;

	for (const child of children) {
		if (child.visible === false) continue;
		const mainSize = isRow ? child.size.width : child.size.height;
		const crossSize = isRow ? child.size.height : child.size.width;
		totalMainSize += mainSize;
		maxCrossSize = Math.max(maxCrossSize, crossSize);
	}

	// Add gaps between visible children
	const visibleChildren = children.filter((c) => c.visible !== false);
	if (visibleChildren.length > 1) {
		totalMainSize += gap * (visibleChildren.length - 1);
	}

	// Available space
	const availableMainSize = isRow
		? parent.size.width - padding.left - padding.right
		: parent.size.height - padding.top - padding.bottom;
	const availableCrossSize = isRow
		? parent.size.height - padding.top - padding.bottom
		: parent.size.width - padding.left - padding.right;

	// Starting position based on alignment
	let mainOffset: number;
	if (alignment === 'center') {
		mainOffset = (isRow ? padding.left : padding.top) + (availableMainSize - totalMainSize) / 2;
	} else if (alignment === 'end') {
		mainOffset = (isRow ? padding.left : padding.top) + (availableMainSize - totalMainSize);
	} else {
		// 'start' is default
		mainOffset = isRow ? padding.left : padding.top;
	}

	// Ensure mainOffset is at least the padding
	mainOffset = Math.max(mainOffset, isRow ? padding.left : padding.top);

	// Position each child
	for (const child of children) {
		if (child.visible === false) {
			// Hidden children keep their stored position
			positions[child.id] = { x: child.position.x, y: child.position.y };
			continue;
		}

		const childMainSize = isRow ? child.size.width : child.size.height;
		const childCrossSize = isRow ? child.size.height : child.size.width;

		// Cross-axis centering (perpendicular to main direction)
		const crossOffset = (isRow ? padding.top : padding.left) + (availableCrossSize - childCrossSize) / 2;

		if (isRow) {
			positions[child.id] = {
				x: mainOffset,
				y: Math.max(padding.top, crossOffset),
			};
		} else {
			positions[child.id] = {
				x: Math.max(padding.left, crossOffset),
				y: mainOffset,
			};
		}

		mainOffset += childMainSize + gap;
	}

	return positions;
};

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

		if (!node.children || node.children.length === 0) continue;

		// Get child nodes
		const childNodes = node.children
			.map((childId) => doc.nodes[childId])
			.filter((child): child is Node => child !== undefined);

		// Compute auto-layout positions if parent has layout
		const layoutPositions = computeAutoLayoutPositions(node, childNodes);

		for (const child of childNodes) {
			const layoutPos = layoutPositions[child.id];
			const childLocalX = layoutPos?.x ?? child.position.x;
			const childLocalY = layoutPos?.y ?? child.position.y;

			stack.push({
				id: child.id,
				x: worldX + childLocalX,
				y: worldY + childLocalY,
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
