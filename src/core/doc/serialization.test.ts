import { parseDocumentText } from './serialization';
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

const makeV8Doc = (): Document => ({
	version: 8,
	rootId: 'root',
	pages: [{ id: 'page_1', name: 'Page 1', rootId: 'root' }],
	activePageId: 'page_1',
	nodes: {
		root: {
			id: 'root',
			type: 'frame',
			name: 'Canvas',
			position: { x: 0, y: 0 },
			size: { width: 1280, height: 800 },
			children: [],
			visible: true,
		},
	},
	assets: {},
	components: {
		definitions: {},
		sets: {},
	},
});

export const runSerializationUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const legacyV7 = {
		version: 7,
		rootId: 'root',
		nodes: {
			root: {
				id: 'root',
				type: 'frame',
				position: { x: 0, y: 0 },
				size: { width: 1280, height: 800 },
				children: [],
				visible: true,
			},
		},
		assets: {},
		components: {
			definitions: {},
			sets: {},
		},
	};
	const migrated = parseDocumentText(JSON.stringify(legacyV7));
	assert(failures, 'v7 migrates successfully', migrated.ok);
	if (migrated.ok) {
		assertEqual(failures, 'v7 migration bumps to v8', migrated.doc.version, 8);
		assertEqual(failures, 'v7 migration creates one page', migrated.doc.pages.length, 1);
		assertEqual(failures, 'v7 migration keeps root as page root', migrated.doc.pages[0]?.rootId, 'root');
		assertEqual(failures, 'v7 migration sets active page', migrated.doc.activePageId, migrated.doc.pages[0]?.id);
	}

	const invalidPageRoot = makeV8Doc();
	invalidPageRoot.pages = [{ id: 'page_1', name: 'Page 1', rootId: 'missing' }];
	invalidPageRoot.activePageId = 'page_1';
	const invalidResult = parseDocumentText(JSON.stringify(invalidPageRoot));
	assert(failures, 'invalid page root fails validation', !invalidResult.ok);

	const badActive = makeV8Doc();
	badActive.activePageId = 'page_x';
	const normalized = parseDocumentText(JSON.stringify(badActive));
	assert(failures, 'invalid activePageId still parses', normalized.ok);
	if (normalized.ok) {
		assertEqual(failures, 'invalid activePageId normalized to first page', normalized.doc.activePageId, normalized.doc.pages[0]?.id);
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
