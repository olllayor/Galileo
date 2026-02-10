import {
	getVariableCollectionActiveModeId,
	resolveNodeStyleProps,
	resolvePaintStyleFill,
	resolveTextStyleProps,
	resolveVariableTokenValue,
} from './styles';
import { createDocument } from './types';
import type { Document } from './types';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const makeDoc = (): Document => {
	const doc = createDocument();
	doc.variables.collections.theme = {
		id: 'theme',
		name: 'Theme',
		modes: [
			{ id: 'light', name: 'Light' },
			{ id: 'dark', name: 'Dark' },
		],
		defaultModeId: 'light',
	};
	doc.variables.activeModeByCollection.theme = 'light';
	doc.variables.tokens.surface = {
		id: 'surface',
		name: 'Surface',
		collectionId: 'theme',
		type: 'color',
		valuesByMode: {
			light: '#ffffff',
			dark: '#111111',
		},
	};
	doc.variables.tokens.bodyText = {
		id: 'bodyText',
		name: 'Body Text',
		collectionId: 'theme',
		type: 'color',
		valuesByMode: {
			light: '#222222',
			dark: '#f1f1f1',
		},
	};
	doc.variables.tokens.bodySize = {
		id: 'bodySize',
		name: 'Body Size',
		collectionId: 'theme',
		type: 'number',
		valuesByMode: {
			light: 16,
			dark: 18,
		},
	};

	doc.styles.paint.paint_surface = {
		id: 'paint_surface',
		name: 'Surface / Fill',
		paint: { type: 'solid', value: '#000000' },
		bindings: {
			solidValueTokenId: 'surface',
		},
	};
	doc.styles.text.text_body = {
		id: 'text_body',
		name: 'Body / Text',
		fill: { type: 'solid', value: '#000000' },
		fontSize: 14,
		fontFamily: 'Inter',
		bindings: {
			fillTokenId: 'bodyText',
			fontSizeTokenId: 'bodySize',
		},
	};
	doc.styles.effect.effect_card = {
		id: 'effect_card',
		name: 'Card Shadow',
		effects: [
			{
				type: 'drop',
				x: 0,
				y: 3,
				blur: 8,
				spread: 0,
				color: '#000000',
				opacity: 0.2,
			},
		],
	};
	doc.styles.grid.grid_base = {
		id: 'grid_base',
		name: 'Base Grid',
		layoutGuides: { type: 'grid', visible: true, grid: { size: 8 } },
	};

	doc.nodes.rect_1 = {
		id: 'rect_1',
		type: 'rectangle',
		position: { x: 0, y: 0 },
		size: { width: 100, height: 100 },
		fillStyleId: 'paint_surface',
		effectStyleId: 'effect_card',
		visible: true,
	};
	doc.nodes.text_1 = {
		id: 'text_1',
		type: 'text',
		position: { x: 20, y: 20 },
		size: { width: 120, height: 28 },
		text: 'Hello',
		textStyleId: 'text_body',
		visible: true,
	};
	doc.nodes.frame_1 = {
		id: 'frame_1',
		type: 'frame',
		position: { x: 10, y: 10 },
		size: { width: 400, height: 300 },
		children: [],
		gridStyleId: 'grid_base',
		visible: true,
	};

	return doc;
};

export const runStylesUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const doc = makeDoc();

	assertEqual(failures, 'active mode resolves from active map', getVariableCollectionActiveModeId(doc, 'theme'), 'light');
	assertEqual(failures, 'token resolves for active mode', resolveVariableTokenValue(doc, 'surface'), '#ffffff');

	const resolvedPaint = resolvePaintStyleFill(doc, 'paint_surface');
	assertEqual(failures, 'paint style resolves color token in light mode', resolvedPaint?.type === 'solid' ? resolvedPaint.value : null, '#ffffff');

	const resolvedText = resolveTextStyleProps(doc, 'text_body');
	assertEqual(
		failures,
		'text style resolves fill token in light mode',
		resolvedText.fill && resolvedText.fill.type === 'solid' ? resolvedText.fill.value : null,
		'#222222',
	);
	assertEqual(failures, 'text style resolves number token in light mode', resolvedText.fontSize, 16);

	const rectStyle = resolveNodeStyleProps(doc, doc.nodes.rect_1);
	assertEqual(failures, 'node style resolves fill from linked paint style', rectStyle.fill?.type === 'solid' ? rectStyle.fill.value : null, '#ffffff');
	assertEqual(failures, 'node style resolves linked effect style', rectStyle.effects?.length ?? 0, 1);

	const frameStyle = resolveNodeStyleProps(doc, doc.nodes.frame_1);
	assertEqual(failures, 'node style resolves linked grid style', frameStyle.layoutGuides?.type, 'grid');
	assertEqual(failures, 'node style resolves linked grid style size', frameStyle.layoutGuides?.grid?.size, 8);

	doc.variables.activeModeByCollection.theme = 'dark';
	assertEqual(failures, 'token resolves after mode switch', resolveVariableTokenValue(doc, 'surface'), '#111111');

	const darkText = resolveNodeStyleProps(doc, doc.nodes.text_1);
	assertEqual(
		failures,
		'text node fill updates after mode switch',
		darkText.fill?.type === 'solid' ? darkText.fill.value : null,
		'#f1f1f1',
	);
	assertEqual(failures, 'text node font size updates after mode switch', darkText.fontSize, 18);

	doc.variables.activeModeByCollection.theme = 'unknown';
	assertEqual(failures, 'invalid active mode falls back to collection default mode', getVariableCollectionActiveModeId(doc, 'theme'), 'light');

	assert(
		failures,
		'missing style resolves to empty text props',
		Object.keys(resolveTextStyleProps(doc, 'missing_style')).length === 0,
	);

	return {
		passed: failures.length === 0,
		failures,
	};
};
