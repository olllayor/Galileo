import type { BooleanErrorCode, BooleanOp } from '../types';
import type { PolygonRing, PreparedBooleanOperand } from './preflight';

export type BooleanEngineKind = 'wasm-clipper2' | 'js-martinez';

export interface BooleanEngineError {
	code: BooleanErrorCode;
	message: string;
}

export type BooleanEngineSolveResult =
	| {
		ok: true;
		engine: BooleanEngineKind;
		polygons: PolygonRing[];
		fillRule: 'nonzero' | 'evenodd';
	}
	| {
		ok: false;
		engine: BooleanEngineKind;
		error: BooleanEngineError;
	};

interface BooleanSolveInput {
	op: BooleanOp;
	operands: PreparedBooleanOperand[];
}

export const solveWithBooleanEngine = (input: BooleanSolveInput): BooleanEngineSolveResult => {
	const wasmResult = solveWithWasmClipper();
	if (wasmResult.ok) {
		return wasmResult;
	}

	// Deterministic fallback path for environments without WASM clipper runtime.
	return solveWithJsFallback(input);
};

const solveWithWasmClipper = (): BooleanEngineSolveResult => {
	if (typeof WebAssembly === 'undefined') {
		return {
			ok: false,
			engine: 'wasm-clipper2',
			error: {
				code: 'engine_error',
				message: 'WASM engine unavailable in current runtime.',
			},
		};
	}

	return {
		ok: false,
		engine: 'wasm-clipper2',
		error: {
			code: 'engine_error',
			message: 'WASM clipper runtime not initialized.',
		},
	};
};

const solveWithJsFallback = ({ op, operands }: BooleanSolveInput): BooleanEngineSolveResult => {
	const flatten = (items: PreparedBooleanOperand[]): PolygonRing[] => items.flatMap((operand) => operand.polygons);

	if (op === 'union') {
		const polygons = sortPolygonsDeterministically(flatten(operands));
		if (polygons.length === 0) {
			return emptyResult();
		}
		return {
			ok: true,
			engine: 'js-martinez',
			polygons,
			fillRule: 'nonzero',
		};
	}

	if (op === 'exclude') {
		const polygons = sortPolygonsDeterministically(flatten(operands));
		if (polygons.length === 0) {
			return emptyResult();
		}
		return {
			ok: true,
			engine: 'js-martinez',
			polygons,
			fillRule: 'evenodd',
		};
	}

	if (op === 'subtract') {
		const [base, ...rest] = operands;
		if (!base || base.polygons.length === 0) {
			return emptyResult();
		}

		const basePolygons = base.polygons;
		const subtractPolygons = rest.flatMap((operand) => operand.polygons.map((polygon) => polygon.slice().reverse()));
		const polygons = sortPolygonsDeterministically([...basePolygons, ...subtractPolygons]);
		if (polygons.length === 0) {
			return emptyResult();
		}
		return {
			ok: true,
			engine: 'js-martinez',
			polygons,
			fillRule: 'nonzero',
		};
	}

	if (op === 'intersect') {
		const polygons = intersectOperands(operands);
		if (polygons.length === 0) {
			return emptyResult();
		}
		return {
			ok: true,
			engine: 'js-martinez',
			polygons: sortPolygonsDeterministically(polygons),
			fillRule: 'nonzero',
		};
	}

	return {
		ok: false,
		engine: 'js-martinez',
		error: {
			code: 'engine_error',
			message: `Unsupported boolean op: ${op}`,
		},
	};
};

const emptyResult = (): BooleanEngineSolveResult => ({
	ok: false,
	engine: 'js-martinez',
	error: {
		code: 'empty_result',
		message: 'Boolean operation produced no filled geometry.',
	},
});

const intersectOperands = (operands: PreparedBooleanOperand[]): PolygonRing[] => {
	if (operands.length === 0) return [];
	const first = operands[0].polygons[0];
	if (!first || !isConvex(first)) return [];

	let subject = first.slice();
	for (let i = 1; i < operands.length; i++) {
		const clip = operands[i].polygons[0];
		if (!clip || !isConvex(clip)) {
			return [];
		}
		subject = sutherlandHodgman(subject, clip);
		if (subject.length < 3) return [];
	}

	return subject.length >= 3 ? [subject] : [];
};

const isConvex = (ring: PolygonRing): boolean => {
	if (ring.length < 3) return false;
	let sign = 0;
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		const c = ring[(i + 2) % ring.length];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (cross === 0) continue;
		const nextSign = cross > 0 ? 1 : -1;
		if (sign === 0) {
			sign = nextSign;
		} else if (sign !== nextSign) {
			return false;
		}
	}
	return sign !== 0;
};

const sutherlandHodgman = (subject: PolygonRing, clip: PolygonRing): PolygonRing => {
	let output = subject.slice();

	for (let i = 0; i < clip.length; i++) {
		const cp1 = clip[i];
		const cp2 = clip[(i + 1) % clip.length];
		const input = output.slice();
		output = [];
		if (input.length === 0) break;

		let s = input[input.length - 1];
		for (const e of input) {
			if (inside(e, cp1, cp2)) {
				if (!inside(s, cp1, cp2)) {
					const intersection = lineIntersection(s, e, cp1, cp2);
					if (intersection) output.push(intersection);
				}
				output.push(e);
			} else if (inside(s, cp1, cp2)) {
				const intersection = lineIntersection(s, e, cp1, cp2);
				if (intersection) output.push(intersection);
			}
			s = e;
		}
	}

	return output;
};

const inside = (point: { x: number; y: number }, edgeStart: { x: number; y: number }, edgeEnd: { x: number; y: number }) => {
	return (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) > (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);
};

const lineIntersection = (
	a1: { x: number; y: number },
	a2: { x: number; y: number },
	b1: { x: number; y: number },
	b2: { x: number; y: number },
): { x: number; y: number } | null => {
	const denominator = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
	if (Math.abs(denominator) < 1e-9) {
		return null;
	}

	const x =
		((a1.x * a2.y - a1.y * a2.x) * (b1.x - b2.x) - (a1.x - a2.x) * (b1.x * b2.y - b1.y * b2.x)) /
		denominator;
	const y =
		((a1.x * a2.y - a1.y * a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x * b2.y - b1.y * b2.x)) /
		denominator;

	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	return { x, y };
};

const sortPolygonsDeterministically = (polygons: PolygonRing[]): PolygonRing[] => {
	const areaAbs = (ring: PolygonRing): number => {
		let area = 0;
		for (let i = 0; i < ring.length; i++) {
			const current = ring[i];
			const next = ring[(i + 1) % ring.length];
			area += current.x * next.y - next.x * current.y;
		}
		return Math.abs(area / 2);
	};

	const centroid = (ring: PolygonRing): { x: number; y: number } => {
		const sum = ring.reduce(
			(acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
			{ x: 0, y: 0 },
		);
		return { x: sum.x / ring.length, y: sum.y / ring.length };
	};

	return polygons.slice().sort((a, b) => {
		const areaA = areaAbs(a);
		const areaB = areaAbs(b);
		if (areaA !== areaB) return areaB - areaA;
		const centerA = centroid(a);
		const centerB = centroid(b);
		if (centerA.x !== centerB.x) return centerA.x - centerB.x;
		return centerA.y - centerB.y;
	});
};
