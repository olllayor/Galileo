import type { Bounds } from '../geometry';
import { getBooleanGeometryCacheEntry, setBooleanGeometryCacheEntry } from '../geometry-cache';
import type { BooleanErrorCode, Document, Node, VectorData, VectorPoint } from '../types';
import { solveWithBooleanEngine, type BooleanEngineKind } from './engine';
import {
	preflightBooleanOperands,
	type PolygonRing,
	type PolygonPoint,
	type RawBooleanOperand,
} from './preflight';

export type BooleanResolvedResult =
	| {
		status: 'ok';
		d: string;
		fillRule: 'nonzero' | 'evenodd';
		bounds: Bounds;
		engine: BooleanEngineKind;
	}
	| {
		status: 'invalid';
		errorCode: BooleanErrorCode;
		message: string;
		affectedOperandId?: string;
		engine?: BooleanEngineKind;
	};

const DEFAULT_TOLERANCE = 0.001;
const ELLIPSE_SEGMENTS = 48;

export const resolveBooleanNodePath = (doc: Document, node: Node): BooleanResolvedResult => {
	if (node.type !== 'boolean' || !node.booleanData) {
		return {
			status: 'invalid',
			errorCode: 'engine_error',
			message: 'Node is not a valid boolean node.',
		};
	}

	const tolerance =
		typeof node.booleanData.tolerance === 'number' && node.booleanData.tolerance > 0
			? node.booleanData.tolerance
			: DEFAULT_TOLERANCE;
	const operandIds = node.booleanData.operandIds.length > 0 ? node.booleanData.operandIds : (node.children ?? []);
	if (operandIds.length < 2) {
		return {
			status: 'invalid',
			errorCode: 'degenerate',
			message: 'Boolean node requires at least two operands.',
		};
	}

	const rawOperands: RawBooleanOperand[] = [];
	for (const operandId of operandIds) {
		const operand = doc.nodes[operandId];
		if (!operand) {
			return {
				status: 'invalid',
				errorCode: 'engine_error',
				message: `Missing operand node: ${operandId}`,
				affectedOperandId: operandId,
			};
		}

		const polygons = extractOperandPolygons(operand);
		if (polygons.length === 0) {
			return {
				status: 'invalid',
				errorCode: 'degenerate',
				message: 'Operand has unsupported or empty geometry.',
				affectedOperandId: operand.id,
			};
		}

		rawOperands.push({ id: operand.id, polygons });
	}

	const signature = buildBooleanSignature(node, rawOperands, tolerance);
	const cached = getBooleanGeometryCacheEntry<BooleanResolvedResult>(node.id, signature);
	if (cached) {
		return cached;
	}

	const preflight = preflightBooleanOperands(rawOperands, tolerance);
	if (!preflight.ok) {
		const invalid: BooleanResolvedResult = {
			status: 'invalid',
			errorCode: preflight.error.code,
			message: preflight.error.message,
			affectedOperandId: preflight.error.affectedOperandId,
		};
		setBooleanGeometryCacheEntry(node.id, signature, invalid);
		return invalid;
	}

	const engineResult = solveWithBooleanEngine({
		op: node.booleanData.op,
		operands: preflight.operands,
	});
	if (!engineResult.ok) {
		const invalid: BooleanResolvedResult = {
			status: 'invalid',
			errorCode: engineResult.error.code,
			message: engineResult.error.message,
			engine: engineResult.engine,
		};
		setBooleanGeometryCacheEntry(node.id, signature, invalid);
		return invalid;
	}

	const bounds = getPolygonsBounds(engineResult.polygons);
	if (!bounds) {
		const invalid: BooleanResolvedResult = {
			status: 'invalid',
			errorCode: 'empty_result',
			message: 'Boolean operation produced empty output.',
			engine: engineResult.engine,
		};
		setBooleanGeometryCacheEntry(node.id, signature, invalid);
		return invalid;
	}

	const d = polygonsToPathData(engineResult.polygons);
	if (!d) {
		const invalid: BooleanResolvedResult = {
			status: 'invalid',
			errorCode: 'empty_result',
			message: 'Boolean operation produced an empty path.',
			engine: engineResult.engine,
		};
		setBooleanGeometryCacheEntry(node.id, signature, invalid);
		return invalid;
	}

	const solved: BooleanResolvedResult = {
		status: 'ok',
		d,
		fillRule: engineResult.fillRule,
		bounds,
		engine: engineResult.engine,
	};
	setBooleanGeometryCacheEntry(node.id, signature, solved);
	return solved;
};

const buildBooleanSignature = (node: Node, operands: RawBooleanOperand[], tolerance: number): string => {
	const operandSignature = operands.map((operand) => ({
		id: operand.id,
		polygons: operand.polygons.map((polygon) => polygon.map((point) => [round(point.x), round(point.y)])),
	}));
	return JSON.stringify({
		op: node.booleanData?.op,
		tolerance: round(tolerance),
		operandSignature,
	});
};

const extractOperandPolygons = (operand: Node): PolygonRing[] => {
	if (operand.type === 'rectangle') {
		const x = operand.position.x;
		const y = operand.position.y;
		const width = operand.size.width;
		const height = operand.size.height;
		if (width <= 0 || height <= 0) return [];
		return [
			[
				{ x, y },
				{ x: x + width, y },
				{ x: x + width, y: y + height },
				{ x, y: y + height },
			],
		];
	}

	if (operand.type === 'ellipse') {
		const cx = operand.position.x + operand.size.width / 2;
		const cy = operand.position.y + operand.size.height / 2;
		const rx = operand.size.width / 2;
		const ry = operand.size.height / 2;
		if (rx <= 0 || ry <= 0) return [];
		const ring: PolygonRing = [];
		for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
			const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
			ring.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
		}
		return [ring];
	}

	if (operand.type === 'path') {
		if (operand.vector) {
			const ring = vectorToRing(operand.vector, operand.position);
			return ring.length >= 3 ? [ring] : [];
		}
		return [];
	}

	return [];
};

const vectorToRing = (vector: VectorData, offset: { x: number; y: number }): PolygonRing => {
	if (!vector.closed || !Array.isArray(vector.points) || vector.points.length < 3) {
		return [];
	}

	const pointById = new Map(vector.points.map((point) => [point.id, point]));
	const segments =
		vector.segments && vector.segments.length > 0
			? vector.segments
			: buildSequentialSegments(vector.points.map((point) => point.id), vector.closed);

	if (segments.length === 0) {
		return [];
	}

	const outgoingById = new Map<string, typeof segments>();
	for (const segment of segments) {
		const list = outgoingById.get(segment.fromId) ?? [];
		list.push(segment);
		outgoingById.set(segment.fromId, list);
	}

	const visited = new Set<string>();
	const ring: PolygonRing = [];
	let currentSegment = segments[0];
	let guard = 0;
	while (currentSegment && guard < segments.length * 2) {
		guard++;
		if (visited.has(currentSegment.id)) break;
		visited.add(currentSegment.id);

		const from = pointById.get(currentSegment.fromId);
		const to = pointById.get(currentSegment.toId);
		if (!from || !to) break;

		if (ring.length === 0) {
			ring.push(applyOffset(from, offset));
		}

		const sampled = sampleSegment(from, to, offset);
		for (const point of sampled) {
			ring.push(point);
		}

		const nextCandidates = outgoingById.get(currentSegment.toId) ?? [];
		const next = nextCandidates.find((candidate) => !visited.has(candidate.id));
		if (!next) {
			break;
		}
		currentSegment = next;
	}

	if (ring.length >= 2) {
		const first = ring[0];
		const last = ring[ring.length - 1];
		if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001) {
			ring.pop();
		}
	}

	return ring;
};

const buildSequentialSegments = (pointIds: string[], closed: boolean): Array<{ id: string; fromId: string; toId: string }> => {
	if (pointIds.length < 2) return [];
	const segments: Array<{ id: string; fromId: string; toId: string }> = [];
	for (let i = 0; i < pointIds.length - 1; i++) {
		segments.push({ id: `seg_${i}`, fromId: pointIds[i], toId: pointIds[i + 1] });
	}
	if (closed) {
		segments.push({ id: `seg_${segments.length}`, fromId: pointIds[pointIds.length - 1], toId: pointIds[0] });
	}
	return segments;
};

const sampleSegment = (from: VectorPoint, to: VectorPoint, offset: { x: number; y: number }): PolygonRing => {
	const p0 = applyOffset(from, offset);
	const p3 = applyOffset(to, offset);
	const c1 = from.outHandle ? applyOffset(from.outHandle, offset) : p0;
	const c2 = to.inHandle ? applyOffset(to.inHandle, offset) : p3;

	const hasCurve = !pointsEqual(p0, c1) || !pointsEqual(p3, c2);
	if (!hasCurve) {
		return [p3];
	}

	const distance =
		Math.hypot(p3.x - p0.x, p3.y - p0.y) +
		Math.hypot(c1.x - p0.x, c1.y - p0.y) +
		Math.hypot(p3.x - c2.x, p3.y - c2.y);
	const steps = Math.max(8, Math.min(96, Math.ceil(distance / 10)));
	const points: PolygonRing = [];
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		points.push(cubicBezier(p0, c1, c2, p3, t));
	}
	return points;
};

const cubicBezier = (
	p0: PolygonPoint,
	p1: PolygonPoint,
	p2: PolygonPoint,
	p3: PolygonPoint,
	t: number,
): PolygonPoint => {
	const mt = 1 - t;
	const mt2 = mt * mt;
	const t2 = t * t;
	return {
		x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
		y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
	};
};

const applyOffset = (point: { x: number; y: number }, offset: { x: number; y: number }): PolygonPoint => ({
	x: point.x + offset.x,
	y: point.y + offset.y,
});

const pointsEqual = (a: PolygonPoint, b: PolygonPoint): boolean => {
	return Math.abs(a.x - b.x) <= 0.0001 && Math.abs(a.y - b.y) <= 0.0001;
};

const getPolygonsBounds = (polygons: PolygonRing[]): Bounds | null => {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const polygon of polygons) {
		for (const point of polygon) {
			minX = Math.min(minX, point.x);
			minY = Math.min(minY, point.y);
			maxX = Math.max(maxX, point.x);
			maxY = Math.max(maxY, point.y);
		}
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		return null;
	}

	return {
		x: minX,
		y: minY,
		width: Math.max(0, maxX - minX),
		height: Math.max(0, maxY - minY),
	};
};

const polygonsToPathData = (polygons: PolygonRing[]): string => {
	const commands: string[] = [];
	for (const polygon of polygons) {
		if (polygon.length < 3) continue;
		const [first, ...rest] = polygon;
		commands.push(`M ${fmt(first.x)} ${fmt(first.y)}`);
		for (const point of rest) {
			commands.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
		}
		commands.push('Z');
	}
	return commands.join(' ');
};

const fmt = (value: number): string => {
	return Number.isFinite(value) ? String(round(value)) : '0';
};

const round = (value: number): number => {
	return Math.round(value * 1000) / 1000;
};
