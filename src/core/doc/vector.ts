import type { Bounds } from './geometry';
import { resolveBooleanNodePath } from './boolean/solve';
import type { Document, Node, VectorData, VectorPoint, VectorSegment } from './types';

export const buildVectorPathData = (vector: VectorData): string => {
	if (!vector.points || vector.points.length === 0) {
		return '';
	}

	const pointById = new Map(vector.points.map((point) => [point.id, point]));
	const segments =
		vector.segments && vector.segments.length > 0
			? vector.segments
			: buildSequentialSegments(vector.points.map((point) => point.id), vector.closed);
	if (segments.length === 0) {
		return '';
	}

	const outgoingById = new Map<string, VectorSegment[]>();
	for (const segment of segments) {
		const list = outgoingById.get(segment.fromId) ?? [];
		list.push(segment);
		outgoingById.set(segment.fromId, list);
	}

	const parts: string[] = [];
	const visited = new Set<string>();
	let currentSegment = segments[0];
	let guard = 0;
	while (currentSegment && guard < segments.length * 2) {
		guard++;
		if (visited.has(currentSegment.id)) break;
		visited.add(currentSegment.id);

		const from = pointById.get(currentSegment.fromId);
		const to = pointById.get(currentSegment.toId);
		if (!from || !to) break;

		if (parts.length === 0) {
			parts.push(`M ${from.x} ${from.y}`);
		}

		const hasCurve = Boolean(from.outHandle || to.inHandle);
		if (hasCurve) {
			const c1 = from.outHandle ?? { x: from.x, y: from.y };
			const c2 = to.inHandle ?? { x: to.x, y: to.y };
			parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`);
		} else {
			parts.push(`L ${to.x} ${to.y}`);
		}

		const nextCandidates = outgoingById.get(currentSegment.toId) ?? [];
		const next = nextCandidates.find((candidate) => !visited.has(candidate.id));
		if (!next) {
			break;
		}
		currentSegment = next;
	}

	if (vector.closed) {
		parts.push('Z');
	}
	return parts.join(' ');
};

export const getNodePathData = (
	node: Node,
	doc?: Document,
): { d: string; fillRule?: 'nonzero' | 'evenodd' } | null => {
	if (node.type === 'boolean') {
		if (!doc) return null;
		const resolved = resolveBooleanNodePath(doc, node);
		if (resolved.status !== 'ok') {
			return null;
		}
		return {
			d: resolved.d,
			fillRule: resolved.fillRule,
		};
	}
	if (node.vector && node.vector.points.length > 0) {
		const d = buildVectorPathData(node.vector);
		return d ? { d } : null;
	}
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

export const normalizeVectorPoints = (points: VectorPoint[]): { points: VectorPoint[]; bounds: Bounds } => {
	if (!points || points.length === 0) {
		return { points: [], bounds: { x: 0, y: 0, width: 1, height: 1 } };
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const point of points) {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	}

	const width = Math.max(1, maxX - minX);
	const height = Math.max(1, maxY - minY);
	const normalizedPoints = points.map((point) => ({
		...point,
		x: point.x - minX,
		y: point.y - minY,
		...(point.inHandle ? { inHandle: { x: point.inHandle.x - minX, y: point.inHandle.y - minY } } : {}),
		...(point.outHandle ? { outHandle: { x: point.outHandle.x - minX, y: point.outHandle.y - minY } } : {}),
	}));

	return {
		points: normalizedPoints,
		bounds: { x: minX, y: minY, width, height },
	};
};

const buildSequentialSegments = (pointIds: string[], closed: boolean): VectorSegment[] => {
	if (pointIds.length < 2) return [];
	const segments: VectorSegment[] = [];
	for (let i = 0; i < pointIds.length - 1; i++) {
		segments.push({ id: `seg_${i}`, fromId: pointIds[i], toId: pointIds[i + 1] });
	}
	if (closed) {
		segments.push({ id: `seg_${segments.length}`, fromId: pointIds[pointIds.length - 1], toId: pointIds[0] });
	}
	return segments;
};
