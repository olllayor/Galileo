import type { SvgComplexityReport } from '../types';
import { parseSvgDocument, type ParsedSvgDocument } from './parse-svg';

const PUSH_SCORE = (reasons: string[], scoreRef: { value: number }, delta: number, reason: string): void => {
	scoreRef.value += delta;
	reasons.push(reason);
};

export const analyzeSvgComplexity = (
	svgText: string,
	parsedInput?: ParsedSvgDocument | null,
): SvgComplexityReport => {
	const parsed = parsedInput === undefined ? parseSvgDocument(svgText) : parsedInput;
	if (!parsed) {
		return {
			isComplex: true,
			score: 10,
			reasons: ['SVG parse failed'],
		};
	}

	const { stats } = parsed;
	const reasons: string[] = [];
	const scoreRef = { value: 0 };

	if (stats.maskRefCount > 0) {
		PUSH_SCORE(reasons, scoreRef, 4, 'Uses mask references');
	}
	if (stats.filterRefCount > 0) {
		PUSH_SCORE(reasons, scoreRef, 4, 'Uses filter references');
	}
	if (stats.clipPathRefCount >= 8 || (stats.nodeCount > 0 && stats.clipPathRefCount / stats.nodeCount > 0.18)) {
		PUSH_SCORE(reasons, scoreRef, 3, 'Heavy clip-path usage');
	}
	if (stats.nonTranslationTransformCount > 0) {
		PUSH_SCORE(reasons, scoreRef, 3, 'Contains non-translation transforms');
	}
	if (stats.useCount > 0) {
		PUSH_SCORE(reasons, scoreRef, 2, 'Contains symbol/use references');
	}
	if (stats.gradientCount + stats.patternCount > 0) {
		PUSH_SCORE(reasons, scoreRef, 2, 'Contains gradients or patterns');
	}
	if (stats.maxDepth >= 9) {
		PUSH_SCORE(reasons, scoreRef, 2, `Deep node nesting (${stats.maxDepth})`);
	}
	if (stats.nodeCount >= 180) {
		PUSH_SCORE(reasons, scoreRef, 3, `High SVG node count (${stats.nodeCount})`);
	} else if (stats.nodeCount >= 90) {
		PUSH_SCORE(reasons, scoreRef, 1, `Moderate SVG node count (${stats.nodeCount})`);
	}

	const isComplex = scoreRef.value >= 6;
	return {
		isComplex,
		score: scoreRef.value,
		reasons,
	};
};
