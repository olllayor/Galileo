import { afterAll, describe, expect, mock, test } from 'bun:test';

class FakeElement {
	tagName: string;
	children: FakeElement[];
	textContent: string | null;
	private attributes: Record<string, string>;

	constructor(tagName: string, attributes: Record<string, string> = {}, children: FakeElement[] = [], textContent?: string) {
		this.tagName = tagName;
		this.attributes = attributes;
		this.children = children;
		this.textContent = textContent ?? null;
	}

	getAttribute(name: string): string | null {
		return this.attributes[name] ?? null;
	}

	getAttributeNS(_namespace: string, name: string): string | null {
		return this.getAttribute(name);
	}

	querySelectorAll(selector: string): FakeElement[] {
		void selector;
		return [];
	}
}

const makeSupportedParsedSvg = () => {
	const rect = new FakeElement('rect', { x: '10', y: '20', width: '80', height: '40', fill: '#ff0000' });
	const svg = new FakeElement('svg', { width: '200', height: '120' }, [rect]);
	return {
		document: {} as Document,
		svgElement: svg as unknown as SVGSVGElement,
		hasUnsupportedFeatures: false,
		warnings: [],
	};
};

const makeUnsupportedParsedSvg = () => ({
	document: {} as Document,
	svgElement: new FakeElement('svg', { width: '100', height: '100' }) as unknown as SVGSVGElement,
	hasUnsupportedFeatures: true,
	warnings: [{ code: 'unsupported_feature', message: 'SVG uses filters.' }],
});

mock.module('./parse-svg', () => ({
	parseSvgDocument: (svgText: string) => {
		if (svgText === '__parse_error__') return null;
		if (svgText === '__unsupported__') return makeUnsupportedParsedSvg();
		return makeSupportedParsedSvg();
	},
}));

const { mapSvgToClipboardPayload } = await import('./map-svg-to-galileo');

afterAll(() => {
	mock.restore();
});

describe('svg to galileo mapper', () => {
	test('maps parsed SVG payload to clipboard payload', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const mapped = mapSvgToClipboardPayload('__supported__', { generateId: nextId });
		expect(mapped.payload).toBeTruthy();
		expect(mapped.importedLayerCount).toBeGreaterThan(0);
		expect(mapped.fallbackRasterize).toBe(false);
	});

	test('falls back to rasterization when parsed SVG is marked unsupported', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const mapped = mapSvgToClipboardPayload('__unsupported__', { generateId: nextId });
		expect(mapped.payload).toBeNull();
		expect(mapped.fallbackRasterize).toBe(true);
		expect(mapped.warnings.some((warning) => warning.code === 'rasterized_fallback')).toBe(true);
	});

	test('returns parse warning on parser failure', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const mapped = mapSvgToClipboardPayload('__parse_error__', { generateId: nextId });
		expect(mapped.payload).toBeNull();
		expect(mapped.fallbackRasterize).toBe(false);
		expect(mapped.warnings.some((warning) => warning.code === 'parse_error')).toBe(true);
	});
});
