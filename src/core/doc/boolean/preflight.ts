import type { BooleanErrorCode } from '../types';

export interface PolygonPoint {
	x: number;
	y: number;
}

export type PolygonRing = PolygonPoint[];

export interface RawBooleanOperand {
	id: string;
	polygons: PolygonRing[];
}

export interface PreparedBooleanOperand {
	id: string;
	polygons: PolygonRing[];
}

export interface BooleanPreflightError {
	code: BooleanErrorCode;
	message: string;
	affectedOperandId?: string;
}

export type BooleanPreflightResult =
	| {
		ok: true;
		operands: PreparedBooleanOperand[];
		tolerance: number;
	}
	| {
		ok: false;
		error: BooleanPreflightError;
	};

const DEFAULT_TOLERANCE = 0.001;

export const preflightBooleanOperands = (
	rawOperands: RawBooleanOperand[],
	rawTolerance?: number,
): BooleanPreflightResult => {
	const tolerance =
		typeof rawTolerance === 'number' && Number.isFinite(rawTolerance) && rawTolerance > 0
			? rawTolerance
			: DEFAULT_TOLERANCE;

	const operands: PreparedBooleanOperand[] = [];
	for (const rawOperand of rawOperands) {
		const normalizedPolygons = rawOperand.polygons
			.map((ring) => normalizeRing(ring, tolerance))
			.filter((ring): ring is PolygonRing => Boolean(ring));

		if (normalizedPolygons.length === 0) {
			return {
				ok: false,
				error: {
					code: 'degenerate',
					message: 'Operand has no valid polygon after normalization.',
					affectedOperandId: rawOperand.id,
				},
			};
		}

		for (const polygon of normalizedPolygons) {
			if (hasSelfIntersection(polygon, tolerance)) {
				return {
					ok: false,
					error: {
						code: 'self_intersection',
						message: 'Operand has self-intersections that cannot be repaired safely.',
						affectedOperandId: rawOperand.id,
					},
				};
			}
		}

		operands.push({
			id: rawOperand.id,
			polygons: normalizedPolygons,
		});
	}

	if (operands.length < 2) {
		return {
			ok: false,
			error: {
				code: 'degenerate',
				message: 'Boolean operations require at least two valid operands.',
			},
		};
	}

	return {
		ok: true,
		operands,
		tolerance,
	};
};

const normalizeRing = (ring: PolygonRing, tolerance: number): PolygonRing | null => {
	if (!Array.isArray(ring) || ring.length < 3) {
		return null;
	}

	const snapped = ring
		.map((point) => ({
			x: snap(point.x, tolerance),
			y: snap(point.y, tolerance),
		}))
		.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

	if (snapped.length < 3) {
		return null;
	}

	const deduped: PolygonRing = [];
	for (const point of snapped) {
		const previous = deduped[deduped.length - 1];
		if (!previous || distance(previous, point) > tolerance) {
			deduped.push(point);
		}
	}

	if (deduped.length > 2 && distance(deduped[0], deduped[deduped.length - 1]) <= tolerance) {
		deduped.pop();
	}

	if (deduped.length < 3) {
		return null;
	}

	const area = signedArea(deduped);
	if (Math.abs(area) < tolerance * tolerance) {
		return null;
	}

	if (area < 0) {
		deduped.reverse();
	}

	return deduped;
};

const snap = (value: number, tolerance: number): number => {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value / tolerance) * tolerance;
};

const distance = (a: PolygonPoint, b: PolygonPoint): number => {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
};

const signedArea = (ring: PolygonRing): number => {
	let area = 0;
	for (let i = 0; i < ring.length; i++) {
		const current = ring[i];
		const next = ring[(i + 1) % ring.length];
		area += current.x * next.y - next.x * current.y;
	}
	return area / 2;
};

const hasSelfIntersection = (ring: PolygonRing, tolerance: number): boolean => {
	for (let i = 0; i < ring.length; i++) {
		const a1 = ring[i];
		const a2 = ring[(i + 1) % ring.length];
		for (let j = i + 1; j < ring.length; j++) {
			if (Math.abs(i - j) <= 1) continue;
			if (i === 0 && j === ring.length - 1) continue;
			const b1 = ring[j];
			const b2 = ring[(j + 1) % ring.length];
			if (segmentsIntersect(a1, a2, b1, b2, tolerance)) {
				return true;
			}
		}
	}
	return false;
};

const segmentsIntersect = (
	a1: PolygonPoint,
	a2: PolygonPoint,
	b1: PolygonPoint,
	b2: PolygonPoint,
	epsilon: number,
): boolean => {
	const orient = (p: PolygonPoint, q: PolygonPoint, r: PolygonPoint): number => {
		const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
		if (Math.abs(value) <= epsilon) return 0;
		return value > 0 ? 1 : 2;
	};

	const onSegment = (p: PolygonPoint, q: PolygonPoint, r: PolygonPoint): boolean => {
		return (
			q.x <= Math.max(p.x, r.x) + epsilon &&
			q.x >= Math.min(p.x, r.x) - epsilon &&
			q.y <= Math.max(p.y, r.y) + epsilon &&
			q.y >= Math.min(p.y, r.y) - epsilon
		);
	};

	const o1 = orient(a1, a2, b1);
	const o2 = orient(a1, a2, b2);
	const o3 = orient(b1, b2, a1);
	const o4 = orient(b1, b2, a2);

	if (o1 !== o2 && o3 !== o4) return true;
	if (o1 === 0 && onSegment(a1, b1, a2)) return true;
	if (o2 === 0 && onSegment(a1, b2, a2)) return true;
	if (o3 === 0 && onSegment(b1, a1, b2)) return true;
	if (o4 === 0 && onSegment(b1, a2, b2)) return true;

	return false;
};
