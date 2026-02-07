import { produce, enablePatches, Patch } from 'immer';
import type { Command } from './types';
import type { Asset, Document, Node, VectorData, VectorPoint, VectorSegment } from '../doc/types';
import { buildVectorPathData } from '../doc/vector';
import { resolveBooleanNodePath } from '../doc/boolean/solve';
import { invalidateBooleanGeometryCache } from '../doc/geometry-cache';
import { validateBooleanOperandSet } from '../doc/geometry';

type DraftDocument = {
	rootId: string;
	nodes: Record<string, Node>;
	assets: Record<string, Asset>;
};

enablePatches();

export const applyCommand = (doc: Document, cmd: Command): Document => {
	const next = produce(doc, (draft) => {
		applyCommandToDraft(draft as DraftDocument, cmd);
	});
	invalidateBooleanGeometryCache();
	return next;
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
				if (node.type === 'boolean') {
					refreshBooleanNodeMetadata(draft, id);
				}
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

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;

			for (const nodeId of nodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				minX = Math.min(minX, node.position.x);
				minY = Math.min(minY, node.position.y);
				maxX = Math.max(maxX, node.position.x + node.size.width);
				maxY = Math.max(maxY, node.position.y + node.size.height);
			}

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

			const nodeIdSet = new Set(nodeIds);
			parent.children = parent.children.filter((id: string) => !nodeIdSet.has(id));

			const orderedNodeIds = nodeIds.slice();

			for (const nodeId of orderedNodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				node.position = {
					x: node.position.x - minX,
					y: node.position.y - minY,
				};
				groupNode.children!.push(nodeId);
			}

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

			const childIds = group.children || [];
			for (const childId of childIds) {
				const child = draft.nodes[childId];
				if (!child) continue;
				child.position = {
					x: child.position.x + group.position.x,
					y: child.position.y + group.position.y,
				};
			}

			parent.children.splice(groupIndex, 1, ...childIds);
			delete draft.nodes[groupId];
			break;
		}

		case 'createBooleanNode': {
			const { id, parentId, operandIds, op, index, tolerance } = cmd.payload;
			if (draft.nodes[id]) break;

			const validation = validateBooleanOperandSet(asDocument(draft), parentId, operandIds);
			if (!validation.ok) {
				break;
			}

			const parent = draft.nodes[parentId];
			if (!parent?.children) break;

			const orderedOperandIds = parent.children.filter((childId) => operandIds.includes(childId));
			if (orderedOperandIds.length < 2) break;

			let minX = Number.POSITIVE_INFINITY;
			let minY = Number.POSITIVE_INFINITY;
			let maxX = Number.NEGATIVE_INFINITY;
			let maxY = Number.NEGATIVE_INFINITY;

			for (const operandId of orderedOperandIds) {
				const operand = draft.nodes[operandId];
				if (!operand) continue;
				minX = Math.min(minX, operand.position.x);
				minY = Math.min(minY, operand.position.y);
				maxX = Math.max(maxX, operand.position.x + operand.size.width);
				maxY = Math.max(maxY, operand.position.y + operand.size.height);
			}

			if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
				break;
			}

			const firstOperand = draft.nodes[orderedOperandIds[0]];
			const insertIndex =
				typeof index === 'number' ? index : Math.max(0, parent.children.indexOf(orderedOperandIds[0]));

			const booleanNode: Node = {
				id,
				type: 'boolean',
				name: 'Boolean',
				position: { x: minX, y: minY },
				size: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
				children: orderedOperandIds,
				visible: true,
				fill: firstOperand?.fill,
				stroke: firstOperand?.stroke,
				opacity: firstOperand?.opacity,
				booleanData: {
					op,
					operandIds: orderedOperandIds,
					status: 'ok',
					tolerance:
						typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.001,
				},
			};
			draft.nodes[id] = booleanNode;

			for (const operandId of orderedOperandIds) {
				const operand = draft.nodes[operandId];
				if (!operand) continue;
				operand.position = {
					x: operand.position.x - minX,
					y: operand.position.y - minY,
				};
			}

			const operandIdSet = new Set(orderedOperandIds);
			parent.children = parent.children.filter((childId) => !operandIdSet.has(childId));
			parent.children.splice(Math.max(0, Math.min(insertIndex, parent.children.length)), 0, id);

			refreshBooleanNodeMetadata(draft, id);
			break;
		}

		case 'setBooleanOp': {
			const { id, op } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean' || !node.booleanData) break;
			node.booleanData.op = op;
			refreshBooleanNodeMetadata(draft, id);
			break;
		}

		case 'setBooleanIsolation': {
			const { id, isolationOperandId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean' || !node.booleanData) break;
			node.booleanData.isolationOperandId = isolationOperandId;
			break;
		}

		case 'flattenBooleanNode': {
			const { id } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean') break;

			const resolved = resolveBooleanNodePath(asDocument(draft), node);
			if (resolved.status !== 'ok') {
				if (node.booleanData) {
					node.booleanData.status = 'invalid';
					node.booleanData.lastErrorCode = resolved.errorCode;
				}
				break;
			}

			const operandIds = [...(node.children ?? [])];
			for (const operandId of operandIds) {
				const toDelete = collectNodes(draft, operandId);
				for (const deleteId of toDelete) {
					delete draft.nodes[deleteId];
				}
			}

			node.type = 'path';
			node.children = [];
			node.vector = undefined;
			node.path = {
				d: resolved.d,
				fillRule: resolved.fillRule,
			};
			node.size = {
				width: Math.max(1, resolved.bounds.width),
				height: Math.max(1, resolved.bounds.height),
			};
			node.booleanData = undefined;
			break;
		}

		case 'addVectorPoint': {
			const { id, point, afterPointId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;

			const vector = ensureVectorData(node.vector);
			const pointId = point.id ?? `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
			if (vector.points.some((existing) => existing.id === pointId)) break;

			const insertIndex =
				typeof afterPointId === 'string'
					? Math.max(0, vector.points.findIndex((existing) => existing.id === afterPointId) + 1)
					: vector.points.length;

			const nextPoint: VectorPoint = {
				id: pointId,
				x: point.x,
				y: point.y,
				cornerMode: point.cornerMode ?? 'sharp',
			};
			vector.points.splice(insertIndex, 0, nextPoint);
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
			break;
		}

		case 'moveVectorPoint': {
			const { id, pointId, x, y } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			const target = vector.points.find((point) => point.id === pointId);
			if (!target) break;
			target.x = x;
			target.y = y;
			applyVectorToNode(node, vector);
			break;
		}

		case 'deleteVectorPoint': {
			const { id, pointId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			vector.points = vector.points.filter((point) => point.id !== pointId);
			vector.closed = vector.closed && vector.points.length > 2;
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
			break;
		}

		case 'setVectorHandle': {
			const { id, pointId, handle, value } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			const target = vector.points.find((point) => point.id === pointId);
			if (!target) break;
			if (handle === 'in') {
				target.inHandle = value ? { ...value } : undefined;
			} else {
				target.outHandle = value ? { ...value } : undefined;
			}
			applyVectorToNode(node, vector);
			break;
		}

		case 'toggleVectorClosed': {
			const { id, closed } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			vector.closed = closed && vector.points.length > 2;
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
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

const asDocument = (draft: DraftDocument): Document => ({
	version: 5,
	rootId: draft.rootId,
	nodes: draft.nodes,
	assets: draft.assets,
});

const refreshBooleanNodeMetadata = (draft: DraftDocument, nodeId: string): void => {
	const node = draft.nodes[nodeId];
	if (!node || node.type !== 'boolean' || !node.booleanData) return;

	const resolved = resolveBooleanNodePath(asDocument(draft), node);
	if (resolved.status === 'ok') {
		node.booleanData.status = 'ok';
		node.booleanData.lastErrorCode = undefined;
		node.size = {
			width: Math.max(1, Math.max(node.size.width, resolved.bounds.width)),
			height: Math.max(1, Math.max(node.size.height, resolved.bounds.height)),
		};
		return;
	}

	node.booleanData.status = 'invalid';
	node.booleanData.lastErrorCode = resolved.errorCode;
};

const ensureVectorData = (vector: VectorData | undefined): VectorData => {
	if (!vector || !Array.isArray(vector.points)) {
		return {
			points: [],
			segments: [],
			closed: false,
		};
	}

	const points: VectorPoint[] = vector.points.map((point, index) => ({
		id: point.id || `pt_${index}`,
		x: point.x,
		y: point.y,
		cornerMode: point.cornerMode ?? 'sharp',
		...(point.inHandle ? { inHandle: { ...point.inHandle } } : {}),
		...(point.outHandle ? { outHandle: { ...point.outHandle } } : {}),
	}));

	const closed = vector.closed === true;
	const segments =
		vector.segments && vector.segments.length > 0
			? vector.segments.map((segment, index) => ({
				id: segment.id || `seg_${index}`,
				fromId: segment.fromId,
				toId: segment.toId,
			}))
			: rebuildSequentialSegments(points, closed);

	return { points, segments, closed };
};

const rebuildSequentialSegments = (points: VectorPoint[], closed: boolean): VectorSegment[] => {
	if (points.length < 2) {
		return [];
	}
	const segments: VectorSegment[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		segments.push({
			id: `seg_${i}`,
			fromId: points[i].id,
			toId: points[i + 1].id,
		});
	}
	if (closed && points.length > 2) {
		segments.push({
			id: `seg_${segments.length}`,
			fromId: points[points.length - 1].id,
			toId: points[0].id,
		});
	}
	return segments;
};

const applyVectorToNode = (node: Node, vector: VectorData): void => {
	const normalized = normalizeVectorData(vector);
	node.position = {
		x: node.position.x + normalized.offset.x,
		y: node.position.y + normalized.offset.y,
	};
	node.size = {
		width: normalized.bounds.width,
		height: normalized.bounds.height,
	};
	node.vector = {
		points: normalized.vector.points,
		segments: normalized.vector.segments,
		closed: normalized.vector.closed,
	};
	node.path = buildVectorPathData(node.vector);
};

const normalizeVectorData = (
	vector: VectorData,
): {
	vector: VectorData;
	offset: { x: number; y: number };
	bounds: { width: number; height: number };
} => {
	if (!vector.points.length) {
		return {
			vector: { ...vector, points: [], segments: [] },
			offset: { x: 0, y: 0 },
			bounds: { width: 1, height: 1 },
		};
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	const includePoint = (x: number, y: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};

	for (const point of vector.points) {
		includePoint(point.x, point.y);
		if (point.inHandle) includePoint(point.inHandle.x, point.inHandle.y);
		if (point.outHandle) includePoint(point.outHandle.x, point.outHandle.y);
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		return {
			vector: { ...vector, segments: rebuildSequentialSegments(vector.points, vector.closed) },
			offset: { x: 0, y: 0 },
			bounds: { width: 1, height: 1 },
		};
	}

	const offset = { x: minX, y: minY };
	const normalizedPoints = vector.points.map((point) => ({
		...point,
		x: point.x - minX,
		y: point.y - minY,
		...(point.inHandle ? { inHandle: { x: point.inHandle.x - minX, y: point.inHandle.y - minY } } : {}),
		...(point.outHandle ? { outHandle: { x: point.outHandle.x - minX, y: point.outHandle.y - minY } } : {}),
	}));

	return {
		vector: {
			points: normalizedPoints,
			segments: rebuildSequentialSegments(normalizedPoints, vector.closed),
			closed: vector.closed,
		},
		offset,
		bounds: {
			width: Math.max(1, maxX - minX),
			height: Math.max(1, maxY - minY),
		},
	};
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
			applyCommandToDraft(draft as DraftDocument, cmd);
		},
		(p, ip) => {
			patches = p;
			inversePatches = ip;
		},
	);

	return { patches, inversePatches };
};
