import type { Document, Node } from '../../core/doc/types';
import { createNode, findParentNode, getNodeStrokeWidthsForHitTesting } from '../../core/doc';
import type { WorldBoundsMap } from '../../core/doc';
import { getNodePathData } from '../../core/doc/vector';
import type { VectorPoint } from '../../core/doc/types';

export interface Tool {
	type: 'select' | 'rectangle' | 'text' | 'frame' | 'pen';
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
			text: '',
			fontSize: 16,
			fontFamily: 'Inter, sans-serif',
			fontWeight: 'normal',
			textAlign: 'left',
			letterSpacingPx: 0,
			textResizeMode: 'auto-width',
			fill: { type: 'solid', value: '#f5f5f5' },
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
			shadowOverflow: 'visible',
			visible: true,
		};

		return createNode(doc, parentId ?? doc.rootId, newNode);
	},
});

export const createPenTool = (parentId?: string): Tool => ({
	type: 'pen',
	handleMouseDown: (doc, x, y) => {
		const pointId = `pt_${Date.now().toString(36)}`;
		const newNode: Partial<Node> & { type: Node['type'] } = {
			type: 'path',
			name: 'Path',
			position: { x, y },
			size: { width: 1, height: 1 },
			stroke: {
				color: { type: 'solid', value: '#6ee7ff' },
				width: 1.5,
				style: 'solid',
			},
			vector: {
				points: [{ id: pointId, x: 0, y: 0, cornerMode: 'sharp' }],
				segments: [],
				closed: false,
			},
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

export type VectorSegmentHit = {
	fromPointId: string;
	toPointId: string;
	x: number;
	y: number;
	t: number;
	distancePx: number;
};

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

	const childrenToTraverse =
		node.type === 'boolean' && node.booleanData?.isolationOperandId
			? [node.booleanData.isolationOperandId]
			: node.type === 'boolean'
				? []
				: (node.children ?? []);

	if (childrenToTraverse.length > 0) {
		for (let i = childrenToTraverse.length - 1; i >= 0; i--) {
			const childId = childrenToTraverse[i];
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
	const kind = hitTestNodeShape(doc, node, localPoint, nodeTransform, context, sizeOverride);
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

	const childrenToTraverse =
		node.type === 'boolean' && node.booleanData?.isolationOperandId
			? [node.booleanData.isolationOperandId]
			: node.type === 'boolean'
				? []
				: (node.children ?? []);

	if (childrenToTraverse.length > 0) {
		for (let i = childrenToTraverse.length - 1; i >= 0; i--) {
			const childId = childrenToTraverse[i];
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
	const kind = hitTestNodeShape(doc, node, localPoint, nodeTransform, context, sizeOverride);
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
	doc: Document,
	node: Node,
	localPoint: WorldPoint,
	transform: WorldTransform,
	context: HitTestContext,
	sizeOverride?: { width: number; height: number },
): HitKind | null => {
	const allowFill = hasVisibleFill(node);
	switch (node.type) {
		case 'frame':
			return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
		case 'image':
		case 'componentInstance':
			return hitTestRect(node, localPoint, transform, context, true, sizeOverride);
		case 'rectangle':
			return hitTestRect(node, localPoint, transform, context, allowFill, sizeOverride);
		case 'ellipse':
			return hitTestEllipse(node, localPoint, transform, context, allowFill, sizeOverride);
		case 'path':
			return hitTestPath(
				doc,
				node,
				localPoint,
				transform,
				context,
				allowFill && (node.vector ? node.vector.closed : true),
				sizeOverride,
			);
		case 'boolean':
			return hitTestPath(doc, node, localPoint, transform, context, allowFill, sizeOverride);
		case 'text':
			return hitTestText(node, localPoint, transform, context, sizeOverride);
		default:
			return null;
	}
};

const hasVisibleFill = (node: Node): boolean => {
	if (node.fills?.some((layer) => layer.visible !== false)) return true;
	return Boolean(node.fill);
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
	doc: Document,
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

	const pathData = getNodePathData(node, doc);
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
	const strokeWidths = getNodeStrokeWidthsForHitTesting(node);
	const strokeWidth = strokeWidths.length > 0 ? Math.max(...strokeWidths) : 0;
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

	// Find the first selection boundary in the path from root.
	// Groups and component instances are treated as default boundaries.
	for (const id of path) {
		const node = doc.nodes[id];
		if (node?.type === 'group' || node?.type === 'componentInstance') {
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
	let current: string | null = nodeId;
	while (current && current !== doc.rootId) {
		const parent = findParentNode(doc, current);
		if (!parent) return false;
		if (parent.id === ancestorId) return true;
		current = parent.id;
	}
	if (current === ancestorId) return true;
	return false;
};

const cubicPointAt = (
	p0: { x: number; y: number },
	p1: { x: number; y: number },
	p2: { x: number; y: number },
	p3: { x: number; y: number },
	t: number,
): { x: number; y: number } => {
	const mt = 1 - t;
	const mt2 = mt * mt;
	const t2 = t * t;
	const a = mt2 * mt;
	const b = 3 * mt2 * t;
	const c = 3 * mt * t2;
	const d = t * t2;
	return {
		x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
		y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
	};
};

const projectPointToLineSegment = (
	point: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number; t: number; distanceSq: number } => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq <= 0.000001) {
		const ddx = point.x - a.x;
		const ddy = point.y - a.y;
		return { x: a.x, y: a.y, t: 0, distanceSq: ddx * ddx + ddy * ddy };
	}
	const rawT = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
	const t = Math.max(0, Math.min(1, rawT));
	const x = a.x + dx * t;
	const y = a.y + dy * t;
	const ddx = point.x - x;
	const ddy = point.y - y;
	return { x, y, t, distanceSq: ddx * ddx + ddy * ddy };
};

export const hitTestVectorSegment = (
	screenX: number,
	screenY: number,
	points: VectorPoint[],
	closed: boolean,
	nodeWorld: { x: number; y: number },
	view: { pan: { x: number; y: number }; zoom: number },
	hitThresholdPx = 8,
): VectorSegmentHit | null => {
	if (points.length < 2) return null;

	const worldPoints = points.map((point) => ({
		...point,
		x: nodeWorld.x + point.x,
		y: nodeWorld.y + point.y,
		inHandle: point.inHandle
			? { x: nodeWorld.x + point.inHandle.x, y: nodeWorld.y + point.inHandle.y }
			: undefined,
		outHandle: point.outHandle
			? { x: nodeWorld.x + point.outHandle.x, y: nodeWorld.y + point.outHandle.y }
			: undefined,
	}));
	const screenTarget = {
		x: screenX,
		y: screenY,
	};

	const edgeCount = closed ? worldPoints.length : worldPoints.length - 1;
	const maxDistSq = hitThresholdPx * hitThresholdPx;
	let best: VectorSegmentHit | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	const toScreen = (worldPoint: { x: number; y: number }) => ({
		x: worldPoint.x * view.zoom + view.pan.x,
		y: worldPoint.y * view.zoom + view.pan.y,
	});

	for (let index = 0; index < edgeCount; index += 1) {
		const from = worldPoints[index];
		const to = worldPoints[(index + 1) % worldPoints.length];
		if (!from || !to) continue;

		const fromOut = from.outHandle ?? { x: from.x, y: from.y };
		const toIn = to.inHandle ?? { x: to.x, y: to.y };
		const curved = Boolean(from.outHandle || to.inHandle);

		if (!curved) {
			const projection = projectPointToLineSegment(screenTarget, toScreen(from), toScreen(to));
			if (projection.distanceSq <= maxDistSq && projection.distanceSq < bestDistance) {
				const localT = projection.t;
				bestDistance = projection.distanceSq;
				best = {
					fromPointId: from.id,
					toPointId: to.id,
					x: from.x + (to.x - from.x) * localT,
					y: from.y + (to.y - from.y) * localT,
					t: localT,
					distancePx: Math.sqrt(projection.distanceSq),
				};
			}
			continue;
		}

		const curveSamples = 24;
		let last = toScreen(from);
		let traveledT = 0;
		for (let step = 1; step <= curveSamples; step += 1) {
			const t = step / curveSamples;
			const curvePoint = cubicPointAt(from, fromOut, toIn, to, t);
			const screenPoint = toScreen(curvePoint);
			const projection = projectPointToLineSegment(screenTarget, last, screenPoint);
			if (projection.distanceSq <= maxDistSq && projection.distanceSq < bestDistance) {
				const segmentT = projection.t;
				const resolvedT = traveledT + (t - traveledT) * segmentT;
				const worldPoint = cubicPointAt(from, fromOut, toIn, to, resolvedT);
				bestDistance = projection.distanceSq;
				best = {
					fromPointId: from.id,
					toPointId: to.id,
					x: worldPoint.x,
					y: worldPoint.y,
					t: resolvedT,
					distancePx: Math.sqrt(projection.distanceSq),
				};
			}
			last = screenPoint;
			traveledT = t;
		}
	}

	return best;
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
