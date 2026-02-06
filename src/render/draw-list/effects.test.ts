import { ENABLE_AUTO_SHADOWS_V2 } from '../../core/feature-flags';
import { createDocument } from '../../core/doc/types';
import type { Document, Node } from '../../core/doc/types';
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

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

const getRectCommand = (commands: DrawCommand[]): Extract<DrawCommand, { type: 'rect' }> | null => {
	for (const command of commands) {
		if (command.type === 'rect' && command.nodeId === 'shape') {
			return command;
		}
	}
	return null;
};

const makeDoc = (): Document => {
	const doc = createDocument();
	const shape: Node = {
		id: 'shape',
		type: 'rectangle',
		position: { x: 100, y: 100 },
		size: { width: 200, height: 120 },
		fill: { type: 'solid', value: '#ffffff' },
		visible: true,
		effects: [
			{
				type: 'drop',
				x: 1,
				y: 2,
				blur: 8,
				spread: 1,
				color: '#000000',
				opacity: 0.2,
				blendMode: 'normal',
			},
			{
				type: 'auto',
				elevation: 8,
				angle: 90,
				distance: 20,
				softness: 50,
				color: '#000000',
				opacity: 0.3,
				blendMode: 'normal',
			},
			{
				type: 'inner',
				x: 0,
				y: 1,
				blur: 6,
				spread: 0,
				color: '#000000',
				opacity: 0.2,
				blendMode: 'normal',
			},
		],
	};
	doc.nodes[shape.id] = shape;
	doc.nodes[doc.rootId] = { ...doc.nodes[doc.rootId], children: [shape.id] };
	return doc;
};

export const runDrawListEffectsUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const commands = buildDrawList(makeDoc());
	const rect = getRectCommand(commands);
	assert(failures, 'rect command exists for effect test fixture', Boolean(rect));

	const effectTypes = rect?.effects?.map((effect) => effect.type) ?? [];

	if (ENABLE_AUTO_SHADOWS_V2) {
		assertEqual(failures, 'auto expands to two drop effects in draw list', effectTypes.length, 4);
		assertEqual(failures, 'draw-list effect order 0', effectTypes[0], 'drop');
		assertEqual(failures, 'draw-list effect order 1', effectTypes[1], 'drop');
		assertEqual(failures, 'draw-list effect order 2', effectTypes[2], 'drop');
		assertEqual(failures, 'draw-list effect order 3', effectTypes[3], 'inner');
	} else {
		assertEqual(failures, 'auto is ignored while v2 flag is disabled', effectTypes.length, 2);
		assertEqual(failures, 'draw-list effect order 0 when v2 disabled', effectTypes[0], 'drop');
		assertEqual(failures, 'draw-list effect order 1 when v2 disabled', effectTypes[1], 'inner');
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
