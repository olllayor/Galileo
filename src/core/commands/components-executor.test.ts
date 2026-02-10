import { applyCommand } from './executor';
import type { Command } from './types';
import type { ComponentDefinition, ComponentSet, Document, Node } from '../doc/types';
import { buildMaterializedNodeId } from '../doc/components';

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
	if (!condition) failures.push(label);
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
		root: makeNode('root', { type: 'frame', size: { width: 1440, height: 900 }, children: [] }),
	},
	assets: {},
	components: { definitions: {}, sets: {} },
});

const makeDefinition = (id: string, setId: string, text: string, variant: Record<string, string>): ComponentDefinition => ({
	id,
	name: 'Button',
	setId,
	variant,
	templateRootId: 'tmpl_root',
	templateNodes: {
		tmpl_root: makeNode('tmpl_root', {
			type: 'frame',
			size: { width: 220, height: 56 },
			children: ['title'],
		}),
		title: makeNode('title', {
			type: 'text',
			position: { x: 16, y: 16 },
			size: { width: 140, height: 24 },
			text,
		}),
	},
});

const makeSet = (setId: string, defaultDefinitionId: string, definitionIds: string[]): ComponentSet => ({
	id: setId,
	name: 'Button',
	defaultDefinitionId,
	definitionIds,
	properties: {
		state: ['default', 'pressed'],
	},
});

const makeBaseCommand = (type: Command['type']): Pick<Command, 'id' | 'timestamp' | 'source' | 'type'> => ({
	id: `cmd_${type}_${Date.now()}`,
	timestamp: Date.now(),
	source: 'user',
	type,
});

export const runComponentExecutorUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const setId = 'set_button';
	const defDefault = makeDefinition('def_default', setId, 'Default', { state: 'default' });
	const defPressed = makeDefinition('def_pressed', setId, 'Pressed', { state: 'pressed' });
	const set = makeSet(setId, defDefault.id, [defDefault.id, defPressed.id]);

	let doc = makeDoc();
	doc = applyCommand(doc, {
		...makeBaseCommand('createComponentDefinition'),
		type: 'createComponentDefinition',
		payload: { definition: defDefault },
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('createComponentDefinition'),
		type: 'createComponentDefinition',
		payload: { definition: defPressed },
	});
	doc = applyCommand(doc, {
		...makeBaseCommand('createOrUpdateComponentSet'),
		type: 'createOrUpdateComponentSet',
		payload: { set },
	});

	const instanceId = 'inst_1';
	doc = applyCommand(doc, {
		...makeBaseCommand('insertComponentInstance'),
		type: 'insertComponentInstance',
		payload: {
			id: instanceId,
			parentId: doc.rootId,
			componentId: setId,
			variant: { state: 'default' },
			position: { x: 120, y: 140 },
		},
	});

	assertEqual(failures, 'instance inserted on canvas', doc.nodes[instanceId]?.type, 'componentInstance');
	const runtimeTitleId = buildMaterializedNodeId(instanceId, 'title');
	assertEqual(failures, 'materialized title exists', doc.nodes[runtimeTitleId]?.type, 'text');
	assertEqual(failures, 'default variant text applied', doc.nodes[runtimeTitleId]?.text, 'Default');

	doc = applyCommand(doc, {
		...makeBaseCommand('setComponentInstanceOverride'),
		type: 'setComponentInstanceOverride',
		payload: {
			id: instanceId,
			sourceNodeId: 'title',
			patch: { text: 'Custom Copy' },
		},
	});
	assertEqual(failures, 'override patch updates runtime child', doc.nodes[runtimeTitleId]?.text, 'Custom Copy');

	doc = applyCommand(doc, {
		...makeBaseCommand('setComponentInstanceVariant'),
		type: 'setComponentInstanceVariant',
		payload: {
			id: instanceId,
			variant: { state: 'pressed' },
		},
	});
	assertEqual(failures, 'variant switch rematerializes with override replay', doc.nodes[runtimeTitleId]?.text, 'Custom Copy');

	doc = applyCommand(doc, {
		...makeBaseCommand('detachComponentInstance'),
		type: 'detachComponentInstance',
		payload: { id: instanceId },
	});
	assertEqual(failures, 'detach converts node to frame', doc.nodes[instanceId]?.type, 'frame');
	assertEqual(failures, 'detach clears component id', doc.nodes[instanceId]?.componentId, undefined);
	assertEqual(
		failures,
		'detach clears source metadata on children',
		doc.nodes[doc.nodes[instanceId]?.children?.[0] ?? '']?.componentSourceNodeId,
		undefined,
	);

	const previewInstanceId = 'inst_preview';
	doc = applyCommand(doc, {
		...makeBaseCommand('insertComponentInstance'),
		type: 'insertComponentInstance',
		payload: {
			id: previewInstanceId,
			parentId: doc.rootId,
			componentId: setId,
			variant: { state: 'default' },
			position: { x: 20, y: 20 },
			isMainPreview: true,
		},
	});
	assertEqual(failures, 'main preview instance is flagged read-only', doc.nodes[previewInstanceId]?.isComponentMainPreview, true);
	assertEqual(failures, 'main preview instance is locked', doc.nodes[previewInstanceId]?.locked, true);
	const previewRootChildId = doc.nodes[previewInstanceId]?.children?.[0];
	assert(failures, 'main preview child exists', Boolean(previewRootChildId && doc.nodes[previewRootChildId]));
	if (previewRootChildId) {
		assertEqual(failures, 'main preview child locked', doc.nodes[previewRootChildId]?.locked, true);
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
