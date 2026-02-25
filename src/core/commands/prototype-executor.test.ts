import { applyCommand } from './executor';
import type { Command } from './types';
import type { Document, Node, Page } from '../doc/types';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) failures.push(label);
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const makeNode = (id: string, overrides: Partial<Node>): Node => ({
	id,
	type: 'rectangle',
	position: { x: 0, y: 0 },
	size: { width: 100, height: 100 },
	children: [],
	visible: true,
	...overrides,
});

const makeDoc = (): Document => {
	const pageOne: Page = { id: 'page_1', name: 'Page 1', rootId: 'root' };
	const pageTwo: Page = { id: 'page_2', name: 'Page 2', rootId: 'root_2' };
	return {
		version: 10,
		rootId: 'root',
		pages: [pageOne, pageTwo],
		activePageId: 'page_1',
		nodes: {
			root: makeNode('root', { type: 'frame', children: ['frame_a', 'frame_b'] }),
			frame_a: makeNode('frame_a', { type: 'frame', position: { x: 40, y: 40 }, size: { width: 320, height: 220 } }),
			frame_b: makeNode('frame_b', { type: 'frame', position: { x: 420, y: 40 }, size: { width: 320, height: 220 } }),
			root_2: makeNode('root_2', { type: 'frame', children: ['frame_c', 'frame_d'] }),
			frame_c: makeNode('frame_c', { type: 'frame', position: { x: 40, y: 320 }, size: { width: 320, height: 220 } }),
			frame_d: makeNode('frame_d', { type: 'frame', position: { x: 420, y: 320 }, size: { width: 320, height: 220 } }),
		},
		assets: {},
		components: { definitions: {}, sets: {} },
		styles: { paint: {}, text: {}, effect: {}, grid: {} },
		variables: { collections: {}, tokens: {}, activeModeByCollection: {} },
		prototype: {
			pages: {
				page_1: { interactionsBySource: {} },
				page_2: { interactionsBySource: {} },
			},
		},
	};
};

const makeBaseCommand = (type: Command['type']): Pick<Command, 'id' | 'timestamp' | 'source' | 'type'> => ({
	id: `cmd_${type}_${Date.now()}`,
	timestamp: Date.now(),
	source: 'user',
	type,
});

export const runPrototypeExecutorUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	let doc = makeDoc();

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'click',
			interaction: { targetFrameId: 'frame_b', transition: 'instant' },
		},
	});
	assertEqual(
		failures,
		'set click interaction stores link',
		doc.prototype.pages.page_1?.interactionsBySource?.frame_a?.click?.targetFrameId,
		'frame_b',
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'click',
			interaction: { targetFrameId: 'frame_b', transition: 'dissolve' },
		},
	});
	assertEqual(
		failures,
		'click interaction replaces trigger link',
		doc.prototype.pages.page_1?.interactionsBySource?.frame_a?.click?.transition,
		'dissolve',
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'hover',
			interaction: { targetFrameId: 'frame_b', transition: 'slide-left' },
		},
	});
	assertEqual(
		failures,
		'set hover interaction stores link',
		doc.prototype.pages.page_1?.interactionsBySource?.frame_a?.hover?.transition,
		'slide-left',
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'click',
			interaction: undefined,
		},
	});
	assertEqual(
		failures,
		'removing click preserves hover',
		doc.prototype.pages.page_1?.interactionsBySource?.frame_a?.hover?.targetFrameId,
		'frame_b',
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'hover',
			interaction: undefined,
		},
	});
	assertEqual(
		failures,
		'removing final trigger prunes source interaction entry',
		Boolean(doc.prototype.pages.page_1?.interactionsBySource?.frame_a),
		false,
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeStartFrame'),
		type: 'setPrototypeStartFrame',
		payload: {
			pageId: 'page_1',
			frameId: 'frame_a',
		},
	});
	assertEqual(failures, 'set start frame stores frame id', doc.prototype.pages.page_1?.startFrameId, 'frame_a');

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeStartFrame'),
		type: 'setPrototypeStartFrame',
		payload: {
			pageId: 'page_1',
			frameId: undefined,
		},
	});
	assertEqual(failures, 'clear start frame removes id', doc.prototype.pages.page_1?.startFrameId, undefined);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_a',
			trigger: 'click',
			interaction: { targetFrameId: 'frame_b', transition: 'instant' },
		},
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('deleteNode'),
		type: 'deleteNode',
		payload: { id: 'frame_a' },
	});
	assertEqual(
		failures,
		'delete source frame prunes outgoing interactions',
		Boolean(doc.prototype.pages.page_1?.interactionsBySource?.frame_a),
		false,
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_1',
			sourceFrameId: 'frame_b',
			trigger: 'click',
			interaction: { targetFrameId: 'frame_b', transition: 'instant' },
		},
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeStartFrame'),
		type: 'setPrototypeStartFrame',
		payload: {
			pageId: 'page_1',
			frameId: 'frame_b',
		},
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('deleteNode'),
		type: 'deleteNode',
		payload: { id: 'frame_b' },
	});
	assertEqual(
		failures,
		'delete target frame prunes interactions',
		Boolean(doc.prototype.pages.page_1?.interactionsBySource?.frame_b),
		false,
	);
	assertEqual(failures, 'delete target frame clears start frame', doc.prototype.pages.page_1?.startFrameId, undefined);

	doc = applyCommand(doc, {
		...makeBaseCommand('setPrototypeInteraction'),
		type: 'setPrototypeInteraction',
		payload: {
			pageId: 'page_2',
			sourceFrameId: 'frame_c',
			trigger: 'click',
			interaction: { targetFrameId: 'frame_d', transition: 'slide-right' },
		},
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('deletePage'),
		type: 'deletePage',
		payload: {
			pageId: 'page_2',
			fallbackPageId: 'page_1',
		},
	});
	assertEqual(failures, 'delete page prunes prototype page graph', Boolean(doc.prototype.pages.page_2), false);
	assert(
		failures,
		'delete page keeps remaining page graph',
		Boolean(doc.prototype.pages.page_1 && typeof doc.prototype.pages.page_1.interactionsBySource === 'object'),
	);

	return {
		passed: failures.length === 0,
		failures,
	};
};
