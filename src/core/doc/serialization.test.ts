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

const makeV10Doc = (): Document => ({
	version: 10,
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
	styles: { paint: {}, text: {}, effect: {}, grid: {} },
	variables: { collections: {}, tokens: {}, activeModeByCollection: {} },
	prototype: { pages: { page_1: { interactionsBySource: {} } } },
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
		assertEqual(failures, 'v7 migration bumps to v12', migrated.doc.version, 12);
		assertEqual(failures, 'v7 migration creates one page', migrated.doc.pages.length, 1);
		assertEqual(failures, 'v7 migration keeps root as page root', migrated.doc.pages[0]?.rootId, 'root');
		assertEqual(failures, 'v7 migration sets active page', migrated.doc.activePageId, migrated.doc.pages[0]?.id);
		assertEqual(
			failures,
			'v7 migration initializes prototype graph',
			typeof migrated.doc.prototype.pages[migrated.doc.pages[0]?.id ?? ''] === 'object',
			true,
		);
	}

		const invalidPageRoot = makeV10Doc();
	invalidPageRoot.pages = [{ id: 'page_1', name: 'Page 1', rootId: 'missing' }];
	invalidPageRoot.activePageId = 'page_1';
	const invalidResult = parseDocumentText(JSON.stringify(invalidPageRoot));
	assert(failures, 'invalid page root fails validation', !invalidResult.ok);

		const badActive = makeV10Doc();
	badActive.activePageId = 'page_x';
	const normalized = parseDocumentText(JSON.stringify(badActive));
	assert(failures, 'invalid activePageId still parses', normalized.ok);
	if (normalized.ok) {
		assertEqual(failures, 'invalid activePageId normalized to first page', normalized.doc.activePageId, normalized.doc.pages[0]?.id);
	}

	const legacyEffectVariables = {
		version: 8,
		rootId: 'root',
		pages: [{ id: 'page_1', name: 'Page 1', rootId: 'root' }],
		activePageId: 'page_1',
		nodes: {
			root: {
				id: 'root',
				type: 'frame',
				position: { x: 0, y: 0 },
				size: { width: 1280, height: 800 },
				children: ['shape'],
				visible: true,
			},
			shape: {
				id: 'shape',
				type: 'rectangle',
				position: { x: 40, y: 40 },
				size: { width: 200, height: 100 },
				visible: true,
				effectVariables: { elevation: 8, tint: '#111111' },
			},
		},
		assets: {},
		components: { definitions: {}, sets: {} },
	};
	const migratedLegacyEffects = parseDocumentText(JSON.stringify(legacyEffectVariables));
	assert(failures, 'legacy effect variables parse successfully', migratedLegacyEffects.ok);
	if (migratedLegacyEffects.ok) {
		assertEqual(failures, 'legacy effect variables doc version migrated', migratedLegacyEffects.doc.version, 12);
		const tokens = Object.values(migratedLegacyEffects.doc.variables.tokens);
		assert(failures, 'legacy effect variables produce tokens', tokens.length >= 1);
	}

	const legacyAppearanceDoc = makeV10Doc();
	legacyAppearanceDoc.nodes = {
		...legacyAppearanceDoc.nodes,
		shape: {
			id: 'shape',
			type: 'rectangle',
			position: { x: 20, y: 20 },
			size: { width: 120, height: 80 },
			visible: true,
			fill: { type: 'solid', value: '#ff0000' },
			stroke: {
				color: { type: 'solid', value: '#001122' },
				width: 2,
				style: 'dashed',
			},
		},
	};
	legacyAppearanceDoc.nodes.root.children = ['shape'];
	const migratedAppearance = parseDocumentText(JSON.stringify(legacyAppearanceDoc));
	assert(failures, 'legacy fill/stroke doc parses', migratedAppearance.ok);
	if (migratedAppearance.ok) {
		assertEqual(failures, 'legacy appearance migration bumps to v12', migratedAppearance.doc.version, 12);
		const shape = migratedAppearance.doc.nodes.shape;
		assert(failures, 'migrated node has fills array', Array.isArray(shape.fills) && shape.fills.length === 1);
		assert(failures, 'migrated node has strokes array', Array.isArray(shape.strokes) && shape.strokes.length === 1);
		assertEqual(failures, 'legacy fill remains mirrored', shape.fill?.type, 'solid');
		assertEqual(failures, 'legacy stroke width remains mirrored', shape.stroke?.width, 2);
	}

	const v11AppearanceV2 = {
		...makeV10Doc(),
		version: 11,
		appearance: {
			recentSwatches: ['#00ffaa', 'rgb(1, 2, 3)'],
			sampleSwatches: ['#111111', '#eeeeee'],
		},
		assets: {
			asset_image: {
				type: 'image',
				mime: 'image/png',
				dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
				width: 1,
				height: 1,
			},
		},
		nodes: {
			root: {
				id: 'root',
				type: 'frame',
				name: 'Canvas',
				position: { x: 0, y: 0 },
				size: { width: 1280, height: 800 },
				children: ['shape'],
				visible: true,
			},
			shape: {
				id: 'shape',
				type: 'rectangle',
				position: { x: 12, y: 16 },
				size: { width: 120, height: 80 },
				visible: true,
				fills: [
					{
						id: 'fill_pattern',
						paint: {
							type: 'pattern',
							pattern: 'dots',
							fg: '#ff00aa',
							bg: '#110011',
							scale: 1,
							rotation: 0,
						},
					},
				],
				strokes: [
					{
						id: 'stroke_image',
						paint: {
							type: 'image',
							assetId: 'asset_image',
							fit: 'tile',
							tileScale: 1.2,
						},
						width: 3,
					},
				],
			},
		},
	};
	const parsedV11AppearanceV2 = parseDocumentText(JSON.stringify(v11AppearanceV2));
	assert(failures, 'v11 appearance v2 parses', parsedV11AppearanceV2.ok);
	if (parsedV11AppearanceV2.ok) {
		assertEqual(failures, 'v11 appearance v2 migrates to v12', parsedV11AppearanceV2.doc.version, 12);
		const shape = parsedV11AppearanceV2.doc.nodes.shape;
		assertEqual(failures, 'pattern fill survives migration', shape.fills?.[0]?.paint.type, 'pattern');
		assertEqual(failures, 'image stroke survives migration', shape.strokes?.[0]?.paint.type, 'image');
		assert(failures, 'document appearance swatches survive migration', (parsedV11AppearanceV2.doc.appearance?.sampleSwatches.length ?? 0) > 0);
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
