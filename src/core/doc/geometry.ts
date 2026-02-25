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

export const BOOLEAN_ELIGIBLE_NODE_TYPES = ['rectangle', 'ellipse', 'path'] as const;

export const isBooleanOperandEligible = (node: Node | null | undefined): node is Node => {
	if (!node) return false;
	return BOOLEAN_ELIGIBLE_NODE_TYPES.includes(node.type as (typeof BOOLEAN_ELIGIBLE_NODE_TYPES)[number]);
};

export const validateBooleanOperandSet = (
	doc: Document,
	parentId: string,
	operandIds: string[],
): { ok: true; operands: Node[] } | { ok: false; reason: string } => {
	if (operandIds.length < 2) {
		return { ok: false, reason: 'at_least_two_operands_required' };
	}

	const parent = doc.nodes[parentId];
	if (!parent?.children) {
		return { ok: false, reason: 'parent_not_found' };
	}

	const uniqueOperandIds = Array.from(new Set(operandIds));
	const parentChildren = new Set(parent.children);
	const operands: Node[] = [];
	for (const id of uniqueOperandIds) {
		if (!parentChildren.has(id)) {
			return { ok: false, reason: 'operands_must_share_parent' };
		}
		const node = doc.nodes[id];
		if (!isBooleanOperandEligible(node)) {
			return { ok: false, reason: 'invalid_operand_type' };
		}
		operands.push(node);
	}

	return { ok: true, operands };
};

export const isBooleanNodeTreeValid = (doc: Document, nodeId: string): boolean => {
	const node = doc.nodes[nodeId];
	if (!node || node.type !== 'boolean') {
		return false;
	}
	if (!node.booleanData || !Array.isArray(node.children)) {
		return false;
	}
	if (node.booleanData.operandIds.length !== node.children.length) {
		return false;
	}
	const operandSet = new Set(node.children);
	return node.booleanData.operandIds.every((operandId) => operandSet.has(operandId));
};

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
	const wrapMode = layout.wrap ?? 'nowrap';
	const isWrap = wrapMode === 'wrap';
	const isRow = direction === 'row';

	const availableMainSize = Math.max(
		0,
		isRow ? parent.size.width - padding.left - padding.right : parent.size.height - padding.top - padding.bottom,
	);
	const availableCrossSize = Math.max(
		0,
		isRow ? parent.size.height - padding.top - padding.bottom : parent.size.width - padding.left - padding.right,
	);
	const mainPaddingStart = isRow ? padding.left : padding.top;
	const crossPaddingStart = isRow ? padding.top : padding.left;

	const visibleChildren = children.filter((c) => c.visible !== false);
	const flowChildren = visibleChildren.filter((child) => child.layoutAbsolute !== true);

	const clampBySizing = (
		value: number,
		axis: 'horizontal' | 'vertical',
		sizing?: {
			minWidth?: number;
			maxWidth?: number;
			minHeight?: number;
			maxHeight?: number;
		},
	): number => {
		let next = Number.isFinite(value) ? value : 0;
		const min = axis === 'horizontal' ? sizing?.minWidth : sizing?.minHeight;
		const max = axis === 'horizontal' ? sizing?.maxWidth : sizing?.maxHeight;
		if (typeof min === 'number' && Number.isFinite(min)) {
			next = Math.max(next, min);
		}
		if (typeof max === 'number' && Number.isFinite(max)) {
			next = Math.min(next, max);
		}
		return Math.max(1, next);
	};

	const resolvedSizes = flowChildren.map((child) => {
		const sizing = child.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
		const mainSizing = isRow ? sizing.horizontal : sizing.vertical;
		const crossSizing = isRow ? sizing.vertical : sizing.horizontal;
		const childWidth = clampBySizing(child.size.width, 'horizontal', sizing);
		const childHeight = clampBySizing(child.size.height, 'vertical', sizing);
		const mainSize = isRow ? childWidth : childHeight;
		const crossSize = isRow ? childHeight : childWidth;
		return { child, mainSizing, crossSizing, mainSize, crossSize };
	});

	for (const child of children) {
		const sizing = child.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
		positions[child.id] = {
			x: child.position.x,
			y: child.position.y,
			width: clampBySizing(child.size.width, 'horizontal', sizing),
			height: clampBySizing(child.size.height, 'vertical', sizing),
		};
	}

	if (resolvedSizes.length === 0) {
		return positions;
	}

	type LayoutEntry = (typeof resolvedSizes)[number];
	type LayoutLine = { entries: LayoutEntry[]; baseCrossSize: number };
	const lines: LayoutLine[] = [];

	if (isWrap) {
		let currentEntries: LayoutEntry[] = [];
		let currentMain = 0;
		let currentCross = 0;

		for (const entry of resolvedSizes) {
			const nextMain = currentEntries.length === 0 ? entry.mainSize : currentMain + gap + entry.mainSize;
			if (currentEntries.length > 0 && nextMain > availableMainSize) {
				lines.push({ entries: currentEntries, baseCrossSize: currentCross });
				currentEntries = [entry];
				currentMain = entry.mainSize;
				currentCross = entry.crossSize;
			} else {
				currentEntries.push(entry);
				currentMain = nextMain;
				currentCross = Math.max(currentCross, entry.crossSize);
			}
		}
		if (currentEntries.length > 0) {
			lines.push({ entries: currentEntries, baseCrossSize: currentCross });
		}
	} else {
		const lineCross = resolvedSizes.reduce((acc, entry) => Math.max(acc, entry.crossSize), 0);
		lines.push({ entries: resolvedSizes, baseCrossSize: lineCross });
	}

	const resolveLineSizes = (
		line: LayoutLine,
	): {
		mainSizeById: Map<string, number>;
		mainTotal: number;
		crossSize: number;
	} => {
		const nonFillMain = line.entries.filter((entry) => entry.mainSizing !== 'fill');
		const fillMain = line.entries.filter((entry) => entry.mainSizing === 'fill');
		const fixedMain = nonFillMain.reduce((acc, entry) => acc + entry.mainSize, 0);
		const lineGap = line.entries.length > 1 ? gap * (line.entries.length - 1) : 0;
		const remaining = Math.max(0, availableMainSize - fixedMain - lineGap);
		const fillSize = fillMain.length > 0 ? remaining / fillMain.length : 0;
		const mainSizeById = new Map<string, number>();
		for (const entry of line.entries) {
			const raw = entry.mainSizing === 'fill' ? fillSize : entry.mainSize;
			const sized = isRow
				? clampBySizing(raw, 'horizontal', entry.child.layoutSizing)
				: clampBySizing(raw, 'vertical', entry.child.layoutSizing);
			mainSizeById.set(entry.child.id, sized);
		}
		const mainTotal =
			Array.from(mainSizeById.values()).reduce((acc, value) => acc + value, 0) +
			(line.entries.length > 1 ? gap * (line.entries.length - 1) : 0);
		return {
			mainSizeById,
			mainTotal,
			crossSize: isWrap ? line.baseCrossSize : availableCrossSize,
		};
	};

	let crossCursor = crossPaddingStart;

	for (const line of lines) {
		const { mainSizeById, mainTotal, crossSize } = resolveLineSizes(line);

		let spacingValue = gap;
		let mainCursor = mainPaddingStart;

		if (alignment === 'center') {
			mainCursor = mainPaddingStart + (availableMainSize - mainTotal) / 2;
		} else if (alignment === 'end') {
			mainCursor = mainPaddingStart + (availableMainSize - mainTotal);
		} else if (alignment === 'space-between' && line.entries.length > 1) {
			const contentOnly = Array.from(mainSizeById.values()).reduce((acc, value) => acc + value, 0);
			const distributed = (availableMainSize - contentOnly) / (line.entries.length - 1);
			spacingValue = Number.isFinite(distributed) && distributed > 0 ? distributed : gap;
		}
		mainCursor = Math.max(mainCursor, mainPaddingStart);

		for (const entry of line.entries) {
			const child = entry.child;
			const sizing = child.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
			const mainSize = mainSizeById.get(child.id) ?? entry.mainSize;
			const align = child.layoutAlign && child.layoutAlign !== 'auto' ? child.layoutAlign : crossAlignment;

			let resolvedCross = entry.crossSize;
			const shouldStretch = align === 'stretch' && entry.crossSizing !== 'fixed';
			if (entry.crossSizing === 'fill' || shouldStretch) {
				resolvedCross = Math.max(1, crossSize);
			}
			resolvedCross = isRow
				? clampBySizing(resolvedCross, 'vertical', sizing)
				: clampBySizing(resolvedCross, 'horizontal', sizing);

			let crossOffset = 0;
			if (align === 'start' || align === 'stretch') {
				crossOffset = 0;
			} else if (align === 'end') {
				crossOffset = crossSize - resolvedCross;
			} else {
				crossOffset = (crossSize - resolvedCross) / 2;
			}
			crossOffset = Math.max(0, crossOffset);

			if (isRow) {
				positions[child.id] = {
					x: mainCursor,
					y: crossCursor + crossOffset,
					width: mainSize,
					height: resolvedCross,
				};
			} else {
				positions[child.id] = {
					x: crossCursor + crossOffset,
					y: mainCursor,
					width: resolvedCross,
					height: mainSize,
				};
			}

			mainCursor += mainSize + spacingValue;
		}

		if (isWrap) {
			crossCursor += crossSize + gap;
		}
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
