import { describe, expect, test } from 'bun:test';
import { parseClipboardByPriority, parseGalileoClipboardPayload } from './parse';
import {
	GALILEO_CLIPBOARD_PREFIX_V1,
	GALILEO_CLIPBOARD_PREFIX_V2,
	GALILEO_FIGMA_REST_PREFIX_V1,
	GALILEO_FIGMA_REST_PREFIX_V2,
	type ClipboardPayloadV1,
} from './types';

const buildClipboardData = (values: Record<string, string>): DataTransfer =>
	({
		getData: (type: string) => values[type] ?? '',
		files: [] as unknown as FileList,
		items: [] as unknown as DataTransferItemList,
	}) as DataTransfer;

describe('interop clipboard parser', () => {
	const v1Payload: ClipboardPayloadV1 = {
		version: 1,
		rootIds: ['a'],
		nodes: {} as ClipboardPayloadV1['nodes'],
		bounds: { x: 0, y: 0, width: 10, height: 10 },
		rootWorldPositions: { a: { x: 0, y: 0 } },
		parentId: null,
	};

	test('parses Galileo V1 payload', () => {
		const raw = `${GALILEO_CLIPBOARD_PREFIX_V1}${JSON.stringify(v1Payload)}`;
		const parsed = parseGalileoClipboardPayload(raw);
		expect(parsed).toBeTruthy();
		expect(parsed?.version).toBe(1);
	});

	test('parses Galileo V2 payload', () => {
		const raw = `${GALILEO_CLIPBOARD_PREFIX_V2}${JSON.stringify({ ...v1Payload, version: 2, assets: {} })}`;
		const parsed = parseGalileoClipboardPayload(raw);
		expect(parsed).toBeTruthy();
		expect(parsed?.version).toBe(2);
	});

	test('detects SVG from plain text clipboard fallback', () => {
		const clipboardData = buildClipboardData({
			'text/plain': '<svg><rect x="0" y="0" width="10" height="10"/></svg>',
		});
		const parsed = parseClipboardByPriority(clipboardData);
		expect(parsed?.kind).toBe('svg');
	});

	test('parses Figma plugin clipboard V1 payload', () => {
		const rawPayload = {
			version: 1,
			source: 'figma-plugin',
			payload: { selection: [] },
		};
		const clipboardData = buildClipboardData({
			'text/plain': `${GALILEO_FIGMA_REST_PREFIX_V1}${JSON.stringify(rawPayload)}`,
		});
		const parsed = parseClipboardByPriority(clipboardData);
		expect(parsed?.kind).toBe('figma');
		if (!parsed || parsed.kind !== 'figma') return;
		expect(parsed.payload.version).toBe(1);
	});

	test('parses Figma plugin clipboard V2 payload', () => {
		const rawPayload = {
			version: 2,
			source: 'figma-plugin',
			exportVersion: 'JSON_REST_V1',
			selection: [],
			metadata: { pageName: 'Page 1' },
		};
		const clipboardData = buildClipboardData({
			'text/plain': `${GALILEO_FIGMA_REST_PREFIX_V2}${JSON.stringify(rawPayload)}`,
		});
		const parsed = parseClipboardByPriority(clipboardData);
		expect(parsed?.kind).toBe('figma');
		if (!parsed || parsed.kind !== 'figma') return;
		expect(parsed.payload.version).toBe(2);
	});
});
