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
		version: 9,
		rootId: 'root',
		pages: [pageOne, pageTwo],
		activePageId: 'page_1',
		nodes: {
			root: makeNode('root', { type: 'frame', children: [] }),
			root_2: makeNode('root_2', { type: 'frame', children: ['shape_2'] }),
			shape_2: makeNode('shape_2', { type: 'rectangle' }),
		},
		assets: {},
		components: { definitions: {}, sets: {} },
		styles: { paint: {}, text: {}, effect: {}, grid: {} },
		variables: { collections: {}, tokens: {}, activeModeByCollection: {} },
	};
};

const makeBaseCommand = (type: Command['type']): Pick<Command, 'id' | 'timestamp' | 'source' | 'type'> => ({
	id: `cmd_${type}_${Date.now()}`,
	timestamp: Date.now(),
	source: 'user',
	type,
});

export const runPagesExecutorUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	let doc = makeDoc();
	doc = applyCommand(doc, {
		...makeBaseCommand('createPage'),
		type: 'createPage',
		payload: {
			pageId: 'page_3',
			name: 'Page 3',
			rootId: 'root_3',
			activate: true,
		},
	});
	assertEqual(failures, 'createPage adds page', doc.pages.length, 3);
	assertEqual(failures, 'createPage inserts root node', doc.nodes.root_3?.type, 'frame');
	assertEqual(failures, 'createPage activates when requested', doc.activePageId, 'page_3');

	doc = applyCommand(doc, {
		...makeBaseCommand('renamePage'),
		type: 'renamePage',
		payload: { pageId: 'page_3', name: 'Cover' },
	});
	assertEqual(
		failures,
		'renamePage updates name',
		doc.pages.find((page) => page.id === 'page_3')?.name,
		'Cover',
	);

	doc = applyCommand(doc, {
		...makeBaseCommand('reorderPage'),
		type: 'reorderPage',
		payload: { fromIndex: 2, toIndex: 0 },
	});
	assertEqual(failures, 'reorderPage reorders pages', doc.pages[0]?.id, 'page_3');

	doc = applyCommand(doc, {
		...makeBaseCommand('deletePage'),
		type: 'deletePage',
		payload: { pageId: 'page_2', fallbackPageId: 'page_1' },
	});
	assertEqual(failures, 'deletePage removes page metadata', doc.pages.some((page) => page.id === 'page_2'), false);
	assertEqual(failures, 'deletePage removes page subtree root', Boolean(doc.nodes.root_2), false);
	assertEqual(failures, 'deletePage removes descendant nodes', Boolean(doc.nodes.shape_2), false);

	let deleteRootBlocked = false;
	try {
		applyCommand(doc, {
			...makeBaseCommand('deleteNode'),
			type: 'deleteNode',
			payload: { id: doc.pages[0].rootId },
		});
	} catch {
		deleteRootBlocked = true;
	}
	assert(failures, 'deleteNode blocks deleting page roots', deleteRootBlocked);

	let deleteLastBlocked = false;
	try {
		let singlePageDoc: Document = {
			...doc,
			pages: [doc.pages[0]],
			activePageId: doc.pages[0].id,
		};
		singlePageDoc = applyCommand(singlePageDoc, {
			...makeBaseCommand('deletePage'),
			type: 'deletePage',
			payload: { pageId: singlePageDoc.pages[0].id },
		});
		void singlePageDoc;
	} catch {
		deleteLastBlocked = true;
	}
	assert(failures, 'deletePage blocks deleting the last page', deleteLastBlocked);

	return {
		passed: failures.length === 0,
		failures,
	};
};
