import type { Document, Node } from './types';

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type WorldPositionMap = Record<string, { x: number; y: number }>;
export type WorldBoundsMap = Record<string, Bounds>;
export type BoundsOverrideMap = Record<string, Partial<Bounds>>;
export type ParentMap = Record<string, string | null>;

export const computeGroupLocalBounds = (children: Node[]): Bounds => {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const child of children) {
		if (child.visible === false) continue;
		const left = child.position.x;
		const top = child.position.y;
		const right = child.position.x + child.size.width;
		const bottom = child.position.y + child.size.height;
		minX = Math.min(minX, left);
		minY = Math.min(minY, top);
		maxX = Math.max(maxX, right);
		maxY = Math.max(maxY, bottom);
	}

	if (!Number.isFinite(minX)) {
		return { x: 0, y: 0, width: 0, height: 0 };
	}

	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const getNodeLocalBounds = (node: Node, children: Node[]): Bounds => {
	if (node.type === 'group') {
		return computeGroupLocalBounds(children);
	}

	return { x: 0, y: 0, width: node.size.width, height: node.size.height };
};

/**
 * Compute layout positions for children of a node with auto-layout enabled.
 * Returns a map of childId -> computed local position within the parent.
 */
export const computeAutoLayoutPositions = (
	parent: Node,
	children: Node[],
): Record<string, { x: number; y: number; width: number; height: number }> => {
	const positions: Record<string, { x: number; y: number; width: number; height: number }> = {};
	const layout = parent.layout;

	if (!layout || layout.type !== 'auto') {
		// No auto-layout, use stored positions/sizes
		for (const child of children) {
			positions[child.id] = {
				x: child.position.x,
				y: child.position.y,
				width: child.size.width,
				height: child.size.height,
			};
		}
		return positions;
	}

	const { direction, gap, padding, alignment } = layout;
	const crossAlignment = layout.crossAlignment ?? 'center';
	const isRow = direction === 'row';

	const availableMainSize = isRow
		? parent.size.width - padding.left - padding.right
		: parent.size.height - padding.top - padding.bottom;
	const availableCrossSize = isRow
		? parent.size.height - padding.top - padding.bottom
		: parent.size.width - padding.left - padding.right;

	const visibleChildren = children.filter((c) => c.visible !== false);

	const resolvedSizes = visibleChildren.map((child) => {
		const sizing = child.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
		const mainSizing = isRow ? sizing.horizontal : sizing.vertical;
		const crossSizing = isRow ? sizing.vertical : sizing.horizontal;
		const mainSize = isRow ? child.size.width : child.size.height;
		const crossSize = isRow ? child.size.height : child.size.width;
		return { child, mainSizing, crossSizing, mainSize, crossSize };
	});

	const nonFillMain = resolvedSizes.filter((entry) => entry.mainSizing !== 'fill');
	const fillMain = resolvedSizes.filter((entry) => entry.mainSizing === 'fill');
	let totalMainSize = nonFillMain.reduce((acc, entry) => acc + entry.mainSize, 0);
	if (visibleChildren.length > 1) {
		totalMainSize += gap * (visibleChildren.length - 1);
	}

	const remaining = Math.max(0, availableMainSize - totalMainSize);
	const fillSize = fillMain.length > 0 ? remaining / fillMain.length : 0;

	const finalMainSizes = new Map<string, number>();
	for (const entry of resolvedSizes) {
		if (entry.mainSizing === 'fill') {
			finalMainSizes.set(entry.child.id, Math.max(1, fillSize));
		} else {
			finalMainSizes.set(entry.child.id, entry.mainSize);
		}
	}

	const totalFinalMain =
		Array.from(finalMainSizes.values()).reduce((acc, value) => acc + value, 0) +
		(visibleChildren.length > 1 ? gap * (visibleChildren.length - 1) : 0);

	let mainOffset: number;
	if (alignment === 'center') {
		mainOffset = (isRow ? padding.left : padding.top) + (availableMainSize - totalFinalMain) / 2;
	} else if (alignment === 'end') {
		mainOffset = (isRow ? padding.left : padding.top) + (availableMainSize - totalFinalMain);
	} else {
		mainOffset = isRow ? padding.left : padding.top;
	}
	mainOffset = Math.max(mainOffset, isRow ? padding.left : padding.top);

	for (const child of children) {
		if (child.visible === false) {
			positions[child.id] = {
				x: child.position.x,
				y: child.position.y,
				width: child.size.width,
				height: child.size.height,
			};
			continue;
		}

		const sizing = child.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
		const mainSize = finalMainSizes.get(child.id) ?? (isRow ? child.size.width : child.size.height);
		let crossSize = isRow ? child.size.height : child.size.width;
		const crossSizing = isRow ? sizing.vertical : sizing.horizontal;
		const shouldStretch = crossAlignment === 'stretch' && crossSizing !== 'fixed';
		if (crossSizing === 'fill' || shouldStretch) {
			crossSize = Math.max(1, availableCrossSize);
		}

		let crossOffset = 0;
		if (crossAlignment === 'start') {
			crossOffset = isRow ? padding.top : padding.left;
		} else if (crossAlignment === 'end') {
			crossOffset = (isRow ? padding.top : padding.left) + (availableCrossSize - crossSize);
		} else if (crossAlignment === 'stretch') {
			crossOffset = isRow ? padding.top : padding.left;
		} else {
			crossOffset = (isRow ? padding.top : padding.left) + (availableCrossSize - crossSize) / 2;
		}

		if (isRow) {
			positions[child.id] = {
				x: mainOffset,
				y: Math.max(padding.top, crossOffset),
				width: mainSize,
				height: crossSize,
			};
		} else {
			positions[child.id] = {
				x: Math.max(padding.left, crossOffset),
				y: mainOffset,
				width: crossSize,
				height: mainSize,
			};
		}

		mainOffset += mainSize + gap;
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
	const layoutOverrides: Record<string, Partial<Bounds>> = {};
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

		const layoutOverride = layoutOverrides[node.id];
		const override = layoutOverride ? { ...layoutOverride, ...(overrides?.[node.id] ?? {}) } : overrides?.[node.id];
		const worldX = override?.x ?? current.x;
		const worldY = override?.y ?? current.y;
		const childNodes = node.children
			? node.children.map((childId) => doc.nodes[childId]).filter((child): child is Node => child !== undefined)
			: [];
		const localBounds = getNodeLocalBounds(node, childNodes);
		const boundsX = override?.x ?? worldX + localBounds.x;
		const boundsY = override?.y ?? worldY + localBounds.y;
		const width = override?.width ?? localBounds.width;
		const height = override?.height ?? localBounds.height;

		boundsMap[node.id] = { x: boundsX, y: boundsY, width, height };

		if (!node.children || node.children.length === 0) continue;

		// Compute auto-layout positions if parent has layout
		const layoutPositions = computeAutoLayoutPositions(node, childNodes);

		for (const child of childNodes) {
			const layoutPos = layoutPositions[child.id];
			const childLocalX = layoutPos?.x ?? child.position.x;
			const childLocalY = layoutPos?.y ?? child.position.y;
			if (layoutPos) {
				layoutOverrides[child.id] = {
					width: layoutPos.width,
					height: layoutPos.height,
				};
			}

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
