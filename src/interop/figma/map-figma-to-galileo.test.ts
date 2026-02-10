import { describe, expect, test } from 'bun:test';
import { mapFigmaPayloadToClipboardPayload } from './map-figma-to-galileo';

describe('figma to galileo mapper', () => {
	test('maps a basic figma payload to editable nodes', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const payload = {
			document: {
				type: 'DOCUMENT',
				children: [
					{
						type: 'CANVAS',
						name: 'Page 1',
						children: [
							{
								type: 'RECTANGLE',
								name: 'Card',
								absoluteBoundingBox: { x: 10, y: 20, width: 160, height: 80 },
								fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
							},
						],
					},
				],
			},
		};

		const mapped = mapFigmaPayloadToClipboardPayload(payload, { generateId: nextId });
		expect(mapped.payload).toBeTruthy();
		expect(mapped.result.importedLayerCount).toBeGreaterThan(0);
		expect(mapped.result.warnings.length).toBe(0);
	});

	test('returns warnings for invalid figma payload', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const mapped = mapFigmaPayloadToClipboardPayload({}, { generateId: nextId });
		expect(mapped.payload).toBeNull();
		expect(mapped.result.warnings.length).toBeGreaterThan(0);
	});

	test('maps rectangle image fills to image nodes when image refs are resolved', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const payload = {
			document: {
				type: 'DOCUMENT',
				children: [
					{
						type: 'CANVAS',
						children: [
							{
								type: 'RECTANGLE',
								name: 'Hero',
								absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
								fills: [{ type: 'IMAGE', imageRef: 'img_ref_1' }],
							},
						],
					},
				],
			},
		};

		const mapped = mapFigmaPayloadToClipboardPayload(payload, {
			generateId: nextId,
			imagesByRef: { img_ref_1: 'https://example.com/image.png' },
		});
		expect(mapped.payload).toBeTruthy();
		if (!mapped.payload) return;

		const importedNodes = Object.values(mapped.payload.nodes).filter((node) => node.type === 'image');
		expect(importedNodes.length).toBeGreaterThan(0);
	});

	test('maps frame clipping and text style fidelity fields', () => {
		let id = 0;
		const nextId = () => `id_${++id}`;

		const payload = {
			document: {
				type: 'DOCUMENT',
				children: [
					{
						type: 'CANVAS',
						children: [
							{
								type: 'FRAME',
								name: 'Container',
								clipsContent: true,
								absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 160 },
								children: [
									{
										type: 'TEXT',
										characters: 'Hello',
										absoluteBoundingBox: { x: 24, y: 24, width: 120, height: 24 },
										style: {
											fontFamily: 'Inter',
											fontSize: 18,
											fontWeight: 600,
											lineHeightPx: 24,
											letterSpacing: 0.2,
											textAlignHorizontal: 'CENTER',
										},
									},
								],
							},
						],
					},
				],
			},
		};

		const mapped = mapFigmaPayloadToClipboardPayload(payload, { generateId: nextId });
		expect(mapped.payload).toBeTruthy();
		if (!mapped.payload) return;

		const frameNode = Object.values(mapped.payload.nodes).find((node) => node.name === 'Container');
		expect(frameNode?.type).toBe('frame');
		expect(frameNode?.clipContent === true).toBe(true);

		const textNode = Object.values(mapped.payload.nodes).find((node) => node.type === 'text');
		expect(textNode?.fontWeight).toBe('600');
		expect(textNode?.textAlign).toBe('center');
	});
});
