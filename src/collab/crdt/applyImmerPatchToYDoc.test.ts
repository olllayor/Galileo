import { enablePatches, produceWithPatches } from 'immer';
import { createDocument } from '../../core/doc/types';
import { DocumentYDocAdapter } from './documentYDocAdapter';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) failures.push(label);
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
};

export const runCollabCrdtPatchUnitTests = (): UnitTestResult => {
	enablePatches();
	const failures: string[] = [];
	const base = createDocument();
	const [next, patches] = produceWithPatches(base, (draft) => {
		draft.nodes.root.name = 'Collaborative Canvas';
		draft.nodes.root.children = ['node_a'];
		draft.nodes.node_a = {
			id: 'node_a',
			type: 'rectangle',
			name: 'A',
			position: { x: 120, y: 90 },
			size: { width: 180, height: 80 },
			children: [],
			visible: true,
		};
	});

	const adapter = new DocumentYDocAdapter(base);
	adapter.applyPatches(patches, 'local');
	const projected = adapter.getDocument();

	assertEqual(failures, 'root name patch applied', projected.nodes.root.name, 'Collaborative Canvas');
	assertEqual(failures, 'child inserted', projected.nodes.root.children?.[0], 'node_a');
	assertEqual(failures, 'new node persisted', projected.nodes.node_a?.type, 'rectangle');
	assertEqual(failures, 'projected matches produced doc version', projected.version, next.version);
	assert(failures, 'no empty child list regression', Array.isArray(projected.nodes.node_a?.children));

	adapter.destroy();
	return { passed: failures.length === 0, failures };
};
