import type { Bounds } from './geometry';
import type { Node, VectorData, VectorPoint } from './types';

export const buildVectorPathData = (vector: VectorData): string => {
	if (!vector.points || vector.points.length === 0) {
		return '';
	}
	const parts: string[] = [];
	const [first, ...rest] = vector.points;
	parts.push(`M ${first.x} ${first.y}`);
	for (const point of rest) {
		parts.push(`L ${point.x} ${point.y}`);
	}
	if (vector.closed) {
		parts.push('Z');
	}
	return parts.join(' ');
};

export const getNodePathData = (node: Node): { d: string; fillRule?: 'nonzero' | 'evenodd' } | null => {
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
	const normalizedPoints = points.map((point) => ({ x: point.x - minX, y: point.y - minY }));

	return {
		points: normalizedPoints,
		bounds: { x: minX, y: minY, width, height },
	};
};
