import { parseDocumentText } from './serialization';
import {
	buildComponentSetFromDefinition,
	buildMaterializedNodeId,
	extractComponentDefinitionFromSelection,
	materializeComponentInstance,
	normalizeComponentVariant,
	resolveComponentDefinition,
} from './components';
import type { ComponentDefinition, Document, Node } from './types';

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

const makeNode = (id: string, overrides: Partial<Node>): Node => ({
	id,
	type: 'rectangle',
	position: { x: 0, y: 0 },
	size: { width: 100, height: 100 },
	children: [],
	visible: true,
	...overrides,
});

const makeDoc = (): Document => ({
	version: 8,
	rootId: 'root',
	pages: [{ id: 'page_1', name: 'Page 1', rootId: 'root' }],
	activePageId: 'page_1',
	nodes: {
		root: makeNode('root', { type: 'frame', size: { width: 1200, height: 800 }, children: [] }),
	},
	assets: {},
	components: {
		definitions: {},
		sets: {},
	},
});

const makeVariantDefinition = (id: string, setId: string, text: string, variant: Record<string, string>): ComponentDefinition => ({
	id,
	name: 'Button',
	setId,
	variant,
	templateRootId: 'rootTemplate',
	templateNodes: {
		rootTemplate: makeNode('rootTemplate', {
			type: 'frame',
			size: { width: 240, height: 64 },
			children: ['title'],
		}),
		title: makeNode('title', {
			type: 'text',
			text,
			size: { width: 160, height: 24 },
			position: { x: 20, y: 20 },
		}),
	},
});

export const runComponentsUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const doc = makeDoc();
	doc.nodes.one = makeNode('one', { type: 'rectangle', position: { x: 100, y: 120 }, size: { width: 180, height: 80 } });
	doc.nodes.root.children = ['one'];
	const singleDefinition = extractComponentDefinitionFromSelection(doc, ['one'], {
		definitionId: 'def_1',
		setId: 'set_1',
		name: 'Card',
		variant: {},
	});
	assert(failures, 'extract single selection returns definition', Boolean(singleDefinition));
	assertEqual(
		failures,
		'single selection root localizes to 0',
		singleDefinition?.templateNodes[singleDefinition.templateRootId]?.position.x,
		0,
	);
	assertEqual(
		failures,
		'single selection preserves size',
		singleDefinition?.templateNodes[singleDefinition.templateRootId]?.size.width,
		180,
	);

	const multiDoc = makeDoc();
	multiDoc.nodes.a = makeNode('a', { type: 'rectangle', position: { x: 10, y: 20 }, size: { width: 100, height: 40 } });
	multiDoc.nodes.b = makeNode('b', { type: 'rectangle', position: { x: 220, y: 30 }, size: { width: 80, height: 50 } });
	multiDoc.nodes.root.children = ['a', 'b'];
	const multiDefinition = extractComponentDefinitionFromSelection(multiDoc, ['a', 'b'], {
		definitionId: 'def_multi',
		setId: 'set_multi',
		name: 'Row',
		variant: {},
	});
	assert(failures, 'extract multi selection returns definition', Boolean(multiDefinition));
	assertEqual(failures, 'multi selection root width fits bounds', multiDefinition?.templateNodes['def_multi__root']?.size.width, 290);
	assertEqual(failures, 'multi selection root keeps children order', multiDefinition?.templateNodes['def_multi__root']?.children?.[0], 'a');

	const setId = 'set_button';
	const defDefault = makeVariantDefinition('def_default', setId, 'Default', { state: 'default' });
	const defPressed = makeVariantDefinition('def_pressed', setId, 'Pressed', { state: 'pressed' });
	const set = buildComponentSetFromDefinition(setId, 'Button', defDefault);
	set.definitionIds.push(defPressed.id);
	set.properties.state = ['default', 'pressed'];
	const library = {
		definitions: {
			[defDefault.id]: defDefault,
			[defPressed.id]: defPressed,
		},
		sets: {
			[set.id]: set,
		},
	};

	const resolvedPressed = resolveComponentDefinition(library, setId, { state: 'pressed' });
	assertEqual(failures, 'variant resolution picks matching definition', resolvedPressed?.id, 'def_pressed');
	assertEqual(
		failures,
		'variant normalizer sorts/strips keys',
		JSON.stringify(normalizeComponentVariant({ ' state ': ' pressed ', size: 'md' })),
		JSON.stringify({ size: 'md', state: 'pressed' }),
	);

	const materialized = materializeComponentInstance(defPressed, 'inst_1', {
		title: { text: 'Custom Label' },
	});
	assertEqual(
		failures,
		'materialized text id is deterministic',
		Object.prototype.hasOwnProperty.call(materialized.nodes, buildMaterializedNodeId('inst_1', 'title')),
		true,
	);
	assertEqual(
		failures,
		'override patch is applied to materialized node',
		materialized.nodes[buildMaterializedNodeId('inst_1', 'title')]?.text,
		'Custom Label',
	);

	const legacyDoc = {
		version: 6,
		rootId: 'root',
		nodes: {
			root: {
				id: 'root',
				type: 'frame',
				position: { x: 0, y: 0 },
				size: { width: 1000, height: 800 },
				children: ['inst1'],
				visible: true,
			},
			inst1: {
				id: 'inst1',
				type: 'componentInstance',
				componentId: 'legacy_set',
				variant: { state: 'default' },
				position: { x: 50, y: 50 },
				size: { width: 200, height: 60 },
				children: ['title'],
				visible: true,
			},
			title: {
				id: 'title',
				type: 'text',
				position: { x: 12, y: 16 },
				size: { width: 120, height: 20 },
				text: 'Legacy',
				visible: true,
			},
		},
		assets: {},
	};
	const parsedLegacy = parseDocumentText(JSON.stringify(legacyDoc));
	assert(failures, 'v6 migration succeeds', parsedLegacy.ok);
	if (parsedLegacy.ok) {
		assertEqual(failures, 'migrates to version 8', parsedLegacy.doc.version, 8);
		assert(failures, 'synthesizes component set', Boolean(parsedLegacy.doc.components.sets.legacy_set));
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
