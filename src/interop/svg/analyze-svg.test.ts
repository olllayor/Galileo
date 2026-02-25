import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('./parse-svg', () => ({
	parseSvgDocument: (svgText: string) => {
		if (svgText === '__parse_error__') return null;
		if (svgText === '__complex__') {
			return {
				document: {} as Document,
				svgElement: {} as SVGSVGElement,
				hasUnsupportedFeatures: true,
				warnings: [],
				stats: {
					nodeCount: 240,
					clipPathCount: 20,
					clipPathRefCount: 44,
					maskRefCount: 2,
					filterRefCount: 3,
					nonTranslationTransformCount: 12,
					useCount: 2,
					gradientCount: 4,
					patternCount: 1,
					maxDepth: 14,
				},
			};
		}
		return {
			document: {} as Document,
			svgElement: {} as SVGSVGElement,
			hasUnsupportedFeatures: false,
			warnings: [],
			stats: {
				nodeCount: 10,
				clipPathCount: 0,
				clipPathRefCount: 0,
				maskRefCount: 0,
				filterRefCount: 0,
				nonTranslationTransformCount: 0,
				useCount: 0,
				gradientCount: 0,
				patternCount: 0,
				maxDepth: 3,
			},
		};
	},
}));

const { analyzeSvgComplexity } = await import('./analyze-svg');

afterAll(() => {
	mock.restore();
});

describe('svg complexity analysis', () => {
	test('marks simple SVG as not complex', () => {
		const report = analyzeSvgComplexity('__simple__');
		expect(report.isComplex).toBe(false);
		expect(report.score).toBe(0);
	});

	test('marks figma-like heavy SVG as complex', () => {
		const report = analyzeSvgComplexity('__complex__');
		expect(report.isComplex).toBe(true);
		expect(report.score).toBeGreaterThan(5);
		expect(report.reasons.length).toBeGreaterThan(0);
	});

	test('treats parse failures as complex fallback candidates', () => {
		const report = analyzeSvgComplexity('__parse_error__');
		expect(report.isComplex).toBe(true);
		expect(report.score).toBeGreaterThan(0);
	});
});
