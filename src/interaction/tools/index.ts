import type { Document, Node } from '../../core/doc/types';
import { createNode, findParentNode } from '../../core/doc';
import type { WorldBoundsMap } from '../../core/doc';

export interface Tool {
	type: 'select' | 'rectangle' | 'text' | 'frame';
	handleMouseDown: (doc: Document, x: number, y: number, selectedIds: string[]) => Document | null;
	handleMouseMove?: (doc: Document, x: number, y: number, selectedIds: string[]) => Document | null;
	handleMouseUp?: (doc: Document, x: number, y: number, selectedIds: string[]) => Document | null;
}

export const createRectangleTool = (parentId?: string): Tool => ({
	type: 'rectangle',
	handleMouseDown: (doc, x, y) => {
		const newNode: Partial<Node> & { type: Node['type'] } = {
			type: 'rectangle',
			position: { x, y },
			size: { width: 100, height: 100 },
			fill: { type: 'solid', value: '#888888' },
			visible: true,
		};

		return createNode(doc, parentId ?? doc.rootId, newNode);
	},
});

export const createTextTool = (parentId?: string): Tool => ({
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

		return createNode(doc, parentId ?? doc.rootId, newNode);
	},
});

export const createFrameTool = (parentId?: string): Tool => ({
	type: 'frame',
	handleMouseDown: (doc, x, y) => {
		const newNode: Partial<Node> & { type: Node['type'] } = {
			type: 'frame',
			name: 'Frame',
			position: { x, y },
			size: { width: 300, height: 200 },
			fill: { type: 'solid', value: '#ffffff' },
			clipContent: false,
			visible: true,
		};

		return createNode(doc, parentId ?? doc.rootId, newNode);
	},
});

export type HitKind = 'edge' | 'fill';

export interface HitResult {
	node: Node;
	kind: HitKind;
	locked: boolean;
}

export interface HitTestOptions {
	hitSlopPx?: number;
	edgeMinPx?: number;
	boundsMap?: WorldBoundsMap;
}

type WorldPoint = { x: number; y: number };
type WorldTransform = { x: number; y: number; scaleX: number; scaleY: number };
type HitTestContext = { zoom: number; hitSlopPx: number; edgeMinPx: number };

const IDENTITY_TRANSFORM: WorldTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

export const hitTestNodeAtPosition = (
	doc: Document,
	worldX: number,
	worldY: number,
	zoom: number,
	options: HitTestOptions = {},
): HitResult | null => {
	if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
		return null;
	}

	const rootNode = doc.nodes[doc.rootId];
	if (!rootNode) {
		return null;
	}

	const zoomSafe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
	const hitSlopPx =
		typeof options.hitSlopPx === 'number' && Number.isFinite(options.hitSlopPx) ? Math.max(0, options.hitSlopPx) : 0;
	const edgeMinPx =
		typeof options.edgeMinPx === 'number' && Number.isFinite(options.edgeMinPx)
			? Math.max(0, options.edgeMinPx)
			: hitSlopPx;
	const context: HitTestContext = {
		zoom: zoomSafe,
		hitSlopPx,
		edgeMinPx,
	};

	return hitTestNodeRecursive(doc, rootNode, { x: worldX, y: worldY }, IDENTITY_TRANSFORM, context, options.boundsMap);
};

export const hitTestNodeStackAtPosition = (
	doc: Document,
	worldX: number,
	worldY: number,
	zoom: number,
	options: HitTestOptions = {},
): HitResult[] => {
	if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
		return [];
	}

	const rootNode = doc.nodes[doc.rootId];
	if (!rootNode) {
		return [];
	}

	const zoomSafe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
	const hitSlopPx =
		typeof options.hitSlopPx === 'number' && Number.isFinite(options.hitSlopPx) ? Math.max(0, options.hitSlopPx) : 0;
	const edgeMinPx =
		typeof options.edgeMinPx === 'number' && Number.isFinite(options.edgeMinPx)
			? Math.max(0, options.edgeMinPx)
			: hitSlopPx;
	const context: HitTestContext = {
		zoom: zoomSafe,
		hitSlopPx,
		edgeMinPx,
	};

	const results: HitResult[] = [];
	hitTestNodeRecursiveStack(doc, rootNode, { x: worldX, y: worldY }, IDENTITY_TRANSFORM, context, results, options.boundsMap);
	return results;
};

export const findNodeAtPosition = (doc: Document, x: number, y: number, hitSlop = 0): Node | null => {
	const hit = hitTestNodeAtPosition(doc, x, y, 1, { hitSlopPx: hitSlop });
	return hit?.node ?? null;
};

const hitTestNodeRecursive = (
	doc: Document,
	node: Node,
	worldPoint: WorldPoint,
	parentTransform: WorldTransform,
	context: HitTestContext,
	boundsMap?: WorldBoundsMap,
): HitResult | null => {
	if (node.visible === false) {
		return null;
	}

	const nodeTransform = composeTransform(parentTransform, node, boundsMap);

	if (node.children && node.children.length > 0) {
		for (let i = node.children.length - 1; i >= 0; i--) {
			const childId = node.children[i];
			const child = doc.nodes[childId];
			if (child) {
				const childHit = hitTestNodeRecursive(doc, child, worldPoint, nodeTransform, context, boundsMap);
				if (childHit) {
					return childHit;
				}
			}
		}
	}

	const localPoint = toLocalPoint(worldPoint, nodeTransform);
	if (!localPoint) {
		return null;
	}

	const bounds = boundsMap?.[node.id];
	const sizeOverride = bounds ? { width: bounds.width, height: bounds.height } : undefined;
	const kind = hitTestNodeShape(node, localPoint, nodeTransform, context, sizeOverride);
	if (!kind) {
		return null;
	}

	return {
		node,
		kind,
		locked: node.locked === true,
	};
};

const hitTestNodeRecursiveStack = (
	doc: Document,
	node: Node,
	worldPoint: WorldPoint,
	parentTransform: WorldTransform,
	context: HitTestContext,
	results: HitResult[],
	boundsMap?: WorldBoundsMap,
): void => {
	if (node.visible === false) {
		return;
	}

	const nodeTransform = composeTransform(parentTransform, node, boundsMap);

	if (node.children && node.children.length > 0) {
		for (let i = node.children.length - 1; i >= 0; i--) {
			const childId = node.children[i];
			const child = doc.nodes[childId];
			if (child) {
				hitTestNodeRecursiveStack(doc, child, worldPoint, nodeTransform, context, results, boundsMap);
			}
		}
	}

	const localPoint = toLocalPoint(worldPoint, nodeTransform);
	if (!localPoint) {
		return;
	}

	const bounds = boundsMap?.[node.id];
	const sizeOverride = bounds ? { width: bounds.width, height: bounds.height } : undefined;
	const kind = hitTestNodeShape(node, localPoint, nodeTransform, context, sizeOverride);
	if (!kind) {
		return;
	}

	results.push({
		node,
		kind,
		locked: node.locked === true,
	});
};

const composeTransform = (parent: WorldTransform, node: Node, boundsMap?: WorldBoundsMap): WorldTransform => {
	const scale = getNodeScale(node);
	const override = boundsMap?.[node.id];
	return {
		x: override ? override.x : parent.x + node.position.x * parent.scaleX,
		y: override ? override.y : parent.y + node.position.y * parent.scaleY,
		scaleX: parent.scaleX * scale.x,
		scaleY: parent.scaleY * scale.y,
	};
};

const getNodeScale = (node: Node): { x: number; y: number } => {
	const nodeAny = node as Node & {
		scaleX?: number;
		scaleY?: number;
		scale?: { x?: number; y?: number };
	};
	const rawX =
		typeof nodeAny.scaleX === 'number' ? nodeAny.scaleX : typeof nodeAny.scale?.x === 'number' ? nodeAny.scale.x : 1;
	const rawY =
		typeof nodeAny.scaleY === 'number' ? nodeAny.scaleY : typeof nodeAny.scale?.y === 'number' ? nodeAny.scale.y : 1;
	return {
		x: Number.isFinite(rawX) && rawX !== 0 ? rawX : 1,
		y: Number.isFinite(rawY) && rawY !== 0 ? rawY : 1,
	};
};

const toLocalPoint = (worldPoint: WorldPoint, transform: WorldTransform): WorldPoint | null => {
	const invScaleX = transform.scaleX !== 0 ? 1 / transform.scaleX : 0;
	const invScaleY = transform.scaleY !== 0 ? 1 / transform.scaleY : 0;
	const x = (worldPoint.x - transform.x) * invScaleX;
	const y = (worldPoint.y - transform.y) * invScaleY;
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	return { x, y };
};

const hitTestNodeShape = (
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	switch (node.type) {
		case 'frame':
			return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
		case 'image':
		case 'componentInstance':
			return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
		case 'rectangle':
			return hitTestRect(node, localPoint, transform, context, Boolean(node.fill), sizeOverride);
		case 'ellipse':
			return hitTestEllipse(node, localPoint, transform, context, Boolean(node.fill), sizeOverride);
		case 'path':
			return hitTestPath(node, localPoint, transform, context, Boolean(node.fill), sizeOverride);
		case 'text':
			return hitTestText(node, localPoint, transform, context, sizeOverride);
		default:
			return null;
	}
};

const hitTestRect = (
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	allowFill: boolean,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	const { width, height } = sizeOverride ?? node.size;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}
	if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
		return null;
	}

	const edge = getEdgeThickness(node, context, transform);
	const expandedLeft = -edge;
	const expandedTop = -edge;
	const expandedRight = width + edge;
	const expandedBottom = height + edge;

	if (
		localPoint.x < expandedLeft ||
		localPoint.x > expandedRight ||
		localPoint.y < expandedTop ||
		localPoint.y > expandedBottom
	) {
		return null;
	}

	const inside = localPoint.x >= 0 && localPoint.x <= width && localPoint.y >= 0 && localPoint.y <= height;

	if (!inside) {
		return 'edge';
	}

	const distanceToEdge = Math.min(localPoint.x, localPoint.y, width - localPoint.x, height - localPoint.y);

	if (distanceToEdge <= edge) {
		return 'edge';
	}

	return allowFill ? 'fill' : null;
};

const hitTestEllipse = (
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	allowFill: boolean,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	const { width, height } = sizeOverride ?? node.size;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}

	const edge = getEdgeThickness(node, context, transform);
	if (localPoint.x < -edge || localPoint.x > width + edge || localPoint.y < -edge || localPoint.y > height + edge) {
		return null;
	}

	const ctx = getHitTestContext();
	if (!ctx || typeof Path2D !== 'function') {
		return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
	}

	const path = new Path2D();
	path.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.lineWidth = Math.max(edge * 2, 0.0001);
	const inStroke = typeof ctx.isPointInStroke === 'function' && ctx.isPointInStroke(path, localPoint.x, localPoint.y);
	const inFill = allowFill && ctx.isPointInPath(path, localPoint.x, localPoint.y);
	ctx.restore();

	if (inStroke) {
		return 'edge';
	}
	if (inFill) {
		return 'fill';
	}
	return null;
};

const hitTestPath = (
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	allowFill: boolean,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	const { width, height } = sizeOverride ?? node.size;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}

	const edge = getEdgeThickness(node, context, transform);
	if (localPoint.x < -edge || localPoint.x > width + edge || localPoint.y < -edge || localPoint.y > height + edge) {
		return null;
	}

	const pathData = getNodePathData(node);
	const ctx = getHitTestContext();
	if (!pathData || !ctx || typeof Path2D !== 'function') {
		return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
	}

	const path = new Path2D(pathData.d);
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.lineWidth = Math.max(edge * 2, 0.0001);
	const fillRule = pathData.fillRule ?? 'nonzero';
	const inStroke = typeof ctx.isPointInStroke === 'function' && ctx.isPointInStroke(path, localPoint.x, localPoint.y);
	const inFill = allowFill && ctx.isPointInPath(path, localPoint.x, localPoint.y, fillRule);
	ctx.restore();

	if (inStroke) {
		return 'edge';
	}
	if (inFill) {
		return 'fill';
	}
	return null;
};

const hitTestText = (
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	const { width, height } = sizeOverride ?? node.size;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}
	if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
		return null;
	}

	const hitSlop = getHitSlopLocal(context, transform);
	if (
		localPoint.x >= -hitSlop &&
		localPoint.x <= width + hitSlop &&
		localPoint.y >= -hitSlop &&
		localPoint.y <= height + hitSlop
	) {
		return 'fill';
	}
	return null;
};

const getEdgeThickness = (node: Node, context: HitTestContext, transform: WorldTransform): number => {
	const zoomSafe = context.zoom > 0 ? context.zoom : 1;
	const strokeWidth = Number.isFinite(node.stroke?.width) ? node.stroke!.width : 0;
	const edgeMinWorld = context.edgeMinPx / zoomSafe;
	const hitSlopWorld = context.hitSlopPx / zoomSafe;
	const edgeWorld = Math.max(strokeWidth / 2, edgeMinWorld) + hitSlopWorld;
	const scale = getScaleFactor(transform);
	return edgeWorld / scale;
};

const getHitSlopLocal = (context: HitTestContext, transform: WorldTransform): number => {
	const zoomSafe = context.zoom > 0 ? context.zoom : 1;
	const hitSlopWorld = context.hitSlopPx / zoomSafe;
	return hitSlopWorld / getScaleFactor(transform);
};

const getScaleFactor = (transform: WorldTransform): number => {
	const scale = Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY));
	if (!Number.isFinite(scale) || scale <= 0) {
		return 1;
	}
	return scale;
};

let cachedHitTestCtx: CanvasRenderingContext2D | null = null;

const getHitTestContext = (): CanvasRenderingContext2D | null => {
	if (cachedHitTestCtx) {
		return cachedHitTestCtx;
	}
	if (typeof document === 'undefined') {
		return null;
	}
	const canvas = document.createElement('canvas');
	cachedHitTestCtx = canvas.getContext('2d');
	return cachedHitTestCtx;
};

const getNodePathData = (node: Node): { d: string; fillRule?: 'nonzero' | 'evenodd' } | null => {
	if (typeof node.path === 'string') {
		return { d: node.path };
	}
	if (node.path && typeof node.path === 'object') {
		const obj = node.path as Record<string, unknown>;
		const d =
			(typeof obj.d === 'string' && obj.d) ||
			(typeof obj.path === 'string' && obj.path) ||
			(typeof obj.data === 'string' && obj.data);
		if (d) {
			const fillRule =
				obj.fillRule === 'evenodd' || obj.fillRule === 'nonzero' ? (obj.fillRule as 'evenodd' | 'nonzero') : undefined;
			return { d, fillRule };
		}
	}
	const nodeAny = node as Node & { pathData?: unknown; d?: unknown };
	if (typeof nodeAny.pathData === 'string') {
		return { d: nodeAny.pathData };
	}
	if (typeof nodeAny.d === 'string') {
		return { d: nodeAny.d };
	}
	return null;
};

/**
 * Find the selectable ancestor for a node, respecting group boundaries.
 * In Figma-style selection:
 * - If a node is inside a group, the group is selected (not the node directly)
 * - Cmd+Click bypasses this and selects the deepest node
 *
 * @param doc - The document
 * @param nodeId - The deepest hit node ID
 * @param deepSelect - If true, return the node itself (Cmd+Click behavior)
 * @returns The ID of the node that should be selected
 */
export const findSelectableNode = (doc: Document, nodeId: string, deepSelect: boolean = false): string => {
	if (deepSelect) {
		return nodeId;
	}

	// Build path from root to this node
	const path: string[] = [];
	let currentId: string | null = nodeId;

	while (currentId && currentId !== doc.rootId) {
		path.unshift(currentId);
		// Find parent
		for (const node of Object.values(doc.nodes)) {
			if (node.children?.includes(currentId)) {
				currentId = node.id;
				break;
			}
		}
		if (path[0] === currentId) {
			// No parent found, stop
			break;
		}
	}

	// Find the first group in the path from root
	// Return the topmost group, or the node itself if no groups
	for (const id of path) {
		const node = doc.nodes[id];
		if (node?.type === 'group') {
			return id;
		}
	}

	return nodeId;
};

export const pickHitCycle = (ids: string[], cycleIndex: number): string | null => {
	if (!ids.length) return null;
	const index = ((cycleIndex % ids.length) + ids.length) % ids.length;
	return ids[index] ?? null;
};

export const getHitStackInContainer = (doc: Document, hitIds: string[], containerId: string | null): string[] => {
	if (!containerId) return hitIds;
	return hitIds.filter((id) => isDescendantOf(doc, id, containerId));
};

const isDescendantOf = (doc: Document, nodeId: string, ancestorId: string): boolean => {
	let current = nodeId;
	while (true) {
		const parent = findParentNode(doc, current);
		if (!parent) return false;
		if (parent.id === ancestorId) return true;
		current = parent.id;
	}
};

/**
 * Check if a node is inside a group (directly or nested)
 */
export const isInsideGroup = (doc: Document, nodeId: string): boolean => {
	let currentId: string | null = nodeId;

	while (currentId && currentId !== doc.rootId) {
		// Find parent
		for (const node of Object.values(doc.nodes)) {
			if (node.children?.includes(currentId)) {
				if (node.type === 'group') {
					return true;
				}
				currentId = node.id;
				break;
			}
		}
	}

	return false;
};

/**
 * Get all nodes inside a group (recursively)
 */
export const getGroupChildren = (doc: Document, groupId: string): string[] => {
	const group = doc.nodes[groupId];
	if (!group || group.type !== 'group') {
		return [];
	}

	const children: string[] = [];
	const stack = [...(group.children || [])];

	while (stack.length > 0) {
		const id = stack.pop()!;
		children.push(id);
		const node = doc.nodes[id];
		if (node?.children) {
			stack.push(...node.children);
		}
	}

	return children;
};
