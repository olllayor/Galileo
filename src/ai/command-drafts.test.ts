import { createDocument } from '../core/doc/types';
import type { AICommandDraft } from './contracts';
import { hydrateAICommandDrafts } from './command-drafts';
import { applyAICommandPreview } from './preview';

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

export const runAICommandDraftUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const doc = createDocument();
	doc.nodes.node_text = {
		id: 'node_text',
		type: 'text',
		name: 'Heading',
		position: { x: 120, y: 100 },
		size: { width: 240, height: 42 },
		children: [],
		text: 'Hello',
		fontSize: 24,
		fontWeight: 'normal',
		visible: true,
	};
	doc.nodes.root.children = ['node_text'];

	const validDrafts: AICommandDraft[] = [
		{
			type: 'setProps',
			id: 'node_text',
			props: {
				text: 'Hello world',
				fontWeight: 'bold',
			},
		},
	];

	const hydrated = hydrateAICommandDrafts({
		document: doc,
		drafts: validDrafts,
		selectedIds: ['node_text'],
		activePageRootId: 'root',
		activePageNodeIds: new Set(['root', 'node_text']),
		fallbackPosition: { x: 0, y: 0 },
	});

	assertEqual(failures, 'hydrated command count', hydrated.commands.length, 1);
	assertEqual(failures, 'hydrated command source', hydrated.commands[0]?.source, 'ai');
	assert(failures, 'hydrated command has id', typeof hydrated.commands[0]?.id === 'string');
	assert(failures, 'hydrated command has timestamp', typeof hydrated.commands[0]?.timestamp === 'number');

	const invalidTargetHydrated = hydrateAICommandDrafts({
		document: doc,
		drafts: [
			{
				type: 'setProps',
				id: 'node_other',
				props: { text: 'Nope' },
			},
		],
		selectedIds: ['node_text'],
		activePageRootId: 'root',
		activePageNodeIds: new Set(['root', 'node_text']),
		fallbackPosition: { x: 0, y: 0 },
	});
	assertEqual(failures, 'invalid target drafts skipped', invalidTargetHydrated.commands.length, 0);
	assert(failures, 'invalid target warning emitted', invalidTargetHydrated.warnings.length > 0);

	const previewDoc = applyAICommandPreview(doc, hydrated.commands);
	assertEqual(failures, 'preview modifies text', previewDoc.nodes.node_text?.text, 'Hello world');
	assertEqual(failures, 'preview keeps original immutable', doc.nodes.node_text?.text, 'Hello');

	return {
		passed: failures.length === 0,
		failures,
	};
};
