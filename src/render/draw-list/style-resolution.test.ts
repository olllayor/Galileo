import { createDocument } from '../../core/doc/types';
import type { Document } from '../../core/doc/types';
import { buildDrawList } from './builder';
import type { DrawCommand } from './types';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const getRectCommand = (commands: DrawCommand[], nodeId: string): Extract<DrawCommand, { type: 'rect' }> | null => {
	for (const command of commands) {
		if (command.type === 'rect' && command.nodeId === nodeId) {
			return command;
		}
	}
	return null;
};

const getTextCommand = (commands: DrawCommand[], nodeId: string): Extract<DrawCommand, { type: 'text' }> | null => {
	for (const command of commands) {
		if (command.type === 'text' && command.nodeId === nodeId) {
			return command;
		}
	}
	return null;
};

const makeDoc = (): Document => {
	const doc = createDocument();
	doc.nodes.root = { ...doc.nodes.root, children: ['rect_style', 'text_style', 'rect_fallback'] };

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
			light: '#fafafa',
			dark: '#161616',
		},
	};
	doc.variables.tokens.textColor = {
		id: 'textColor',
		name: 'Text',
		collectionId: 'theme',
		type: 'color',
		valuesByMode: {
			light: '#222222',
			dark: '#f8f8f8',
		},
	};
	doc.variables.tokens.textSize = {
		id: 'textSize',
		name: 'Text Size',
		collectionId: 'theme',
		type: 'number',
		valuesByMode: {
			light: 16,
			dark: 20,
		},
	};

	doc.styles.paint.paint_surface = {
		id: 'paint_surface',
		name: 'Surface Paint',
		paint: { type: 'solid', value: '#000000' },
		bindings: { solidValueTokenId: 'surface' },
	};
	doc.styles.text.text_body = {
		id: 'text_body',
		name: 'Body Text',
		fill: { type: 'solid', value: '#333333' },
		fontSize: 14,
		fontFamily: 'Inter',
		textAlign: 'left',
		bindings: {
			fillTokenId: 'textColor',
			fontSizeTokenId: 'textSize',
		},
	};
	doc.styles.effect.effect_soft = {
		id: 'effect_soft',
		name: 'Soft',
		effects: [
			{
				type: 'drop',
				x: 0,
				y: 2,
				blur: 6,
				spread: 0,
				color: '#000000',
				opacity: 0.2,
			},
		],
	};

	doc.nodes.rect_style = {
		id: 'rect_style',
		type: 'rectangle',
		position: { x: 40, y: 40 },
		size: { width: 120, height: 80 },
		fillStyleId: 'paint_surface',
		effectStyleId: 'effect_soft',
		visible: true,
	};
	doc.nodes.text_style = {
		id: 'text_style',
		type: 'text',
		position: { x: 50, y: 150 },
		size: { width: 220, height: 40 },
		text: 'Token Text',
		textStyleId: 'text_body',
		visible: true,
	};
	doc.nodes.rect_fallback = {
		id: 'rect_fallback',
		type: 'rectangle',
		position: { x: 200, y: 40 },
		size: { width: 100, height: 80 },
		fillStyleId: 'missing_paint',
		fill: { type: 'solid', value: '#0f0f0f' },
		visible: true,
	};

	return doc;
};

export const runDrawListStyleResolutionUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const doc = makeDoc();

	let commands = buildDrawList(doc);
	const styledRectLight = getRectCommand(commands, 'rect_style');
	const styledTextLight = getTextCommand(commands, 'text_style');
	const fallbackRect = getRectCommand(commands, 'rect_fallback');

	assertEqual(failures, 'styled rectangle fill resolves from paint style token in light mode', styledRectLight?.fill, '#fafafa');
	assertEqual(failures, 'styled rectangle resolves linked effects', styledRectLight?.effects?.length ?? 0, 1);
	assertEqual(failures, 'styled text fill resolves from text style token in light mode', styledTextLight?.fill, '#222222');
	assertEqual(failures, 'styled text font size resolves from number token in light mode', styledTextLight?.fontSize, 16);
	assertEqual(failures, 'missing style falls back to local fill', fallbackRect?.fill, '#0f0f0f');

	doc.variables.activeModeByCollection.theme = 'dark';
	commands = buildDrawList(doc);
	const styledRectDark = getRectCommand(commands, 'rect_style');
	const styledTextDark = getTextCommand(commands, 'text_style');

	assertEqual(failures, 'styled rectangle fill updates after mode switch', styledRectDark?.fill, '#161616');
	assertEqual(failures, 'styled text fill updates after mode switch', styledTextDark?.fill, '#f8f8f8');
	assertEqual(failures, 'styled text font size updates after mode switch', styledTextDark?.fontSize, 20);

	return {
		passed: failures.length === 0,
		failures,
	};
};
