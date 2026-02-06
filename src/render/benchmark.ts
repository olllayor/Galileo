/**
 * Benchmark utilities for comparing Rust vs Canvas image encoding
 * Usage: Call `runExportBenchmark(doc, nodeId)` from browser console
 */

import { exportNodeSnapshot, type SnapshotOptions } from './export';
import { createDocument } from '../core/doc/types';
import type { Document, Node } from '../core/doc/types';

export type BenchmarkResult = {
	label: string;
	format: 'png' | 'webp';
	encoder: 'rust' | 'canvas';
	width: number;
	height: number;
	scale: number;
	encodeTimeMs: number;
	totalTimeMs: number;
	fileSizeKb: number;
};

export type BenchmarkSummary = {
	results: BenchmarkResult[];
	comparison: {
		pngSpeedup: number; // Rust vs Canvas speedup ratio
		webpSpeedup: number;
		pngSizeRatio: number; // Rust vs Canvas file size ratio
		webpSizeRatio: number;
	};
};

type ShadowGoldenFixtureId =
	| 'spread-positive'
	| 'spread-negative-rounded'
	| 'overflow-visible'
	| 'overflow-clipped'
	| 'overflow-clip-content-only'
	| 'consistency-shape'
	| 'consistency-frame'
	| 'consistency-auto-layout-frame';

export type ShadowGoldenResult = {
	fixture: ShadowGoldenFixtureId;
	nodeId: string;
	hash: string;
	expectedHash?: string;
	matchesExpected: boolean;
};

export type ShadowGoldenHarnessResult = {
	results: ShadowGoldenResult[];
	consistency: {
		shapeVsFrame: boolean;
		shapeVsAutoLayoutFrame: boolean;
	};
};

/**
 * Run a single export and measure timing
 */
const runSingleBenchmark = async (
	doc: Document,
	nodeId: string,
	options: SnapshotOptions,
	label: string,
): Promise<BenchmarkResult> => {
	const startTime = performance.now();
	const result = await exportNodeSnapshot(doc, nodeId, options);
	const totalTimeMs = performance.now() - startTime;

	const fileSizeKb = (result.dataBase64.length * 0.75) / 1024; // base64 to bytes

	return {
		label,
		format: options.format ?? 'png',
		encoder: options.useNativeEncoder ? 'rust' : 'canvas',
		width: result.width,
		height: result.height,
		scale: options.scale ?? 1,
		encodeTimeMs: result.encodeTimeMs ?? 0,
		totalTimeMs,
		fileSizeKb,
	};
};

/**
 * Run comprehensive benchmark comparing Rust vs Canvas encoding
 */
export const runExportBenchmark = async (
	doc: Document,
	nodeId: string,
	scales: number[] = [1, 2, 4],
): Promise<BenchmarkSummary> => {
	const results: BenchmarkResult[] = [];

	console.log('🚀 Starting export benchmark...');
	console.log(`   Node: ${nodeId}`);
	console.log(`   Scales: ${scales.join(', ')}x`);
	console.log('');

	for (const scale of scales) {
		// PNG - Rust
		const pngRust = await runSingleBenchmark(
			doc,
			nodeId,
			{
				scale,
				format: 'png',
				useNativeEncoder: true,
				allowUpscale: true,
			},
			`PNG @${scale}x (Rust)`,
		);
		results.push(pngRust);

		// PNG - Canvas
		const pngCanvas = await runSingleBenchmark(
			doc,
			nodeId,
			{
				scale,
				format: 'png',
				useNativeEncoder: false,
				allowUpscale: true,
			},
			`PNG @${scale}x (Canvas)`,
		);
		results.push(pngCanvas);

		// WebP - Rust
		const webpRust = await runSingleBenchmark(
			doc,
			nodeId,
			{
				scale,
				format: 'webp',
				useNativeEncoder: true,
				webpQuality: 90,
				allowUpscale: true,
			},
			`WebP @${scale}x (Rust)`,
		);
		results.push(webpRust);

		// WebP - Canvas
		const webpCanvas = await runSingleBenchmark(
			doc,
			nodeId,
			{
				scale,
				format: 'webp',
				useNativeEncoder: false,
				webpQuality: 90,
				allowUpscale: true,
			},
			`WebP @${scale}x (Canvas)`,
		);
		results.push(webpCanvas);

		// Log progress
		console.log(`📊 Scale ${scale}x (${pngRust.width}×${pngRust.height}):`);
		console.log(
			`   PNG:  Rust ${pngRust.encodeTimeMs.toFixed(1)}ms vs Canvas ${pngCanvas.encodeTimeMs.toFixed(1)}ms (${(pngCanvas.encodeTimeMs / pngRust.encodeTimeMs).toFixed(1)}x faster)`,
		);
		console.log(
			`   WebP: Rust ${webpRust.encodeTimeMs.toFixed(1)}ms vs Canvas ${webpCanvas.encodeTimeMs.toFixed(1)}ms (${(webpCanvas.encodeTimeMs / webpRust.encodeTimeMs).toFixed(1)}x faster)`,
		);
		console.log(`   Size: PNG ${pngRust.fileSizeKb.toFixed(1)}KB, WebP ${webpRust.fileSizeKb.toFixed(1)}KB`);
		console.log('');
	}

	// Calculate averages
	const pngRustResults = results.filter((r) => r.format === 'png' && r.encoder === 'rust');
	const pngCanvasResults = results.filter((r) => r.format === 'png' && r.encoder === 'canvas');
	const webpRustResults = results.filter((r) => r.format === 'webp' && r.encoder === 'rust');
	const webpCanvasResults = results.filter((r) => r.format === 'webp' && r.encoder === 'canvas');

	const avgTime = (arr: BenchmarkResult[]) => arr.reduce((sum, r) => sum + r.encodeTimeMs, 0) / arr.length;
	const avgSize = (arr: BenchmarkResult[]) => arr.reduce((sum, r) => sum + r.fileSizeKb, 0) / arr.length;

	const comparison = {
		pngSpeedup: avgTime(pngCanvasResults) / avgTime(pngRustResults),
		webpSpeedup: avgTime(webpCanvasResults) / avgTime(webpRustResults),
		pngSizeRatio: avgSize(pngRustResults) / avgSize(pngCanvasResults),
		webpSizeRatio: avgSize(webpRustResults) / avgSize(webpCanvasResults),
	};

	console.log('📈 Summary:');
	console.log(`   PNG encoding: Rust is ${comparison.pngSpeedup.toFixed(1)}x faster`);
	console.log(`   WebP encoding: Rust is ${comparison.webpSpeedup.toFixed(1)}x faster`);
	console.log('');

	return { results, comparison };
};

const hashBase64 = (value: string): string => {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};

const withRootChild = (node: Node): { doc: Document; nodeId: string } => {
	const doc = createDocument();
	doc.nodes[node.id] = node;
	const root = doc.nodes[doc.rootId];
	doc.nodes[doc.rootId] = { ...root, children: [node.id] };
	return { doc, nodeId: node.id };
};

const buildShadowFixture = (fixture: ShadowGoldenFixtureId): { doc: Document; nodeId: string } => {
	switch (fixture) {
		case 'spread-positive':
			return withRootChild({
				id: 'spread-positive',
				type: 'rectangle',
				position: { x: 200, y: 160 },
				size: { width: 320, height: 180 },
				cornerRadius: 20,
				fill: { type: 'solid', value: '#ffffff' },
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 12,
						blur: 28,
						spread: 10,
						color: '#000000',
						opacity: 0.25,
						blendMode: 'normal',
						enabled: true,
					},
				],
				visible: true,
			});
		case 'spread-negative-rounded':
			return withRootChild({
				id: 'spread-negative-rounded',
				type: 'rectangle',
				position: { x: 200, y: 160 },
				size: { width: 320, height: 180 },
				cornerRadius: 28,
				fill: { type: 'solid', value: '#ffffff' },
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 10,
						blur: 24,
						spread: -6,
						color: '#000000',
						opacity: 0.2,
						blendMode: 'normal',
						enabled: true,
					},
				],
				visible: true,
			});
		case 'overflow-visible':
			return withRootChild({
				id: 'overflow-visible',
				type: 'frame',
				position: { x: 180, y: 120 },
				size: { width: 420, height: 260 },
				fill: { type: 'solid', value: '#ffffff' },
				clipContent: false,
				shadowOverflow: 'visible',
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 16,
						blur: 30,
						spread: 6,
						color: '#000000',
						opacity: 0.24,
						blendMode: 'normal',
						enabled: true,
					},
				],
				children: ['overflow-visible-child'],
				visible: true,
			} as Node & { children: string[] });
		case 'overflow-clipped':
			return withRootChild({
				id: 'overflow-clipped',
				type: 'frame',
				position: { x: 180, y: 120 },
				size: { width: 420, height: 260 },
				fill: { type: 'solid', value: '#ffffff' },
				clipContent: true,
				shadowOverflow: 'clipped',
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 16,
						blur: 30,
						spread: 6,
						color: '#000000',
						opacity: 0.24,
						blendMode: 'normal',
						enabled: true,
					},
				],
				children: ['overflow-clipped-child'],
				visible: true,
			} as Node & { children: string[] });
		case 'overflow-clip-content-only':
			return withRootChild({
				id: 'overflow-clip-content-only',
				type: 'frame',
				position: { x: 180, y: 120 },
				size: { width: 420, height: 260 },
				fill: { type: 'solid', value: '#ffffff' },
				clipContent: true,
				shadowOverflow: 'clip-content-only',
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 16,
						blur: 30,
						spread: 6,
						color: '#000000',
						opacity: 0.24,
						blendMode: 'normal',
						enabled: true,
					},
				],
				children: ['overflow-clip-content-only-child'],
				visible: true,
			} as Node & { children: string[] });
		case 'consistency-shape':
			return withRootChild({
				id: 'consistency-shape',
				type: 'rectangle',
				position: { x: 200, y: 160 },
				size: { width: 280, height: 180 },
				fill: { type: 'solid', value: '#ffffff' },
				cornerRadius: 16,
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 10,
						blur: 24,
						spread: 4,
						color: '#000000',
						opacity: 0.22,
						blendMode: 'normal',
						enabled: true,
					},
				],
				visible: true,
			});
		case 'consistency-frame':
			return withRootChild({
				id: 'consistency-frame',
				type: 'frame',
				position: { x: 200, y: 160 },
				size: { width: 280, height: 180 },
				fill: { type: 'solid', value: '#ffffff' },
				cornerRadius: 16,
				shadowOverflow: 'visible',
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 10,
						blur: 24,
						spread: 4,
						color: '#000000',
						opacity: 0.22,
						blendMode: 'normal',
						enabled: true,
					},
				],
				children: [],
				visible: true,
			});
		case 'consistency-auto-layout-frame':
		default:
			return withRootChild({
				id: 'consistency-auto-layout-frame',
				type: 'frame',
				position: { x: 200, y: 160 },
				size: { width: 280, height: 180 },
				fill: { type: 'solid', value: '#ffffff' },
				cornerRadius: 16,
				shadowOverflow: 'visible',
				layout: {
					type: 'auto',
					direction: 'row',
					gap: 8,
					padding: { top: 8, right: 8, bottom: 8, left: 8 },
					alignment: 'start',
					crossAlignment: 'center',
				},
				effects: [
					{
						type: 'drop',
						x: 0,
						y: 10,
						blur: 24,
						spread: 4,
						color: '#000000',
						opacity: 0.22,
						blendMode: 'normal',
						enabled: true,
					},
				],
				children: [],
				visible: true,
			});
	}
};

const withOverflowChild = (doc: Document, parentId: string): Document => {
	const childId = `${parentId}-child`;
	const parent = doc.nodes[parentId];
	if (!parent || parent.type !== 'frame') return doc;
	const child: Node = {
		id: childId,
		type: 'rectangle',
		position: { x: 280, y: 170 },
		size: { width: 220, height: 140 },
		fill: { type: 'solid', value: '#0a84ff' },
		visible: true,
	};
	doc.nodes[childId] = child;
	doc.nodes[parentId] = {
		...parent,
		children: [childId],
	};
	return doc;
};

export const runShadowGoldenHarness = async (
	expectedHashes: Partial<Record<ShadowGoldenFixtureId, string>> = {},
): Promise<ShadowGoldenHarnessResult> => {
	const fixtures: ShadowGoldenFixtureId[] = [
		'spread-positive',
		'spread-negative-rounded',
		'overflow-visible',
		'overflow-clipped',
		'overflow-clip-content-only',
		'consistency-shape',
		'consistency-frame',
		'consistency-auto-layout-frame',
	];

	const results: ShadowGoldenResult[] = [];

	for (const fixture of fixtures) {
		const fixtureData = buildShadowFixture(fixture);
		const { nodeId } = fixtureData;
		let { doc } = fixtureData;
		if (fixture.startsWith('overflow-')) {
			doc = withOverflowChild(doc, nodeId);
		}
		const snapshot = await exportNodeSnapshot(doc, nodeId, {
			scale: 1,
			format: 'png',
			includeFrameFill: true,
			clipToBounds: false,
		});
		const hash = hashBase64(snapshot.dataBase64);
		const expectedHash = expectedHashes[fixture];
		results.push({
			fixture,
			nodeId,
			hash,
			expectedHash,
			matchesExpected: expectedHash ? expectedHash === hash : true,
		});
	}

	const byFixture = new Map(results.map((result) => [result.fixture, result.hash]));
	const shapeHash = byFixture.get('consistency-shape');
	const frameHash = byFixture.get('consistency-frame');
	const autoLayoutHash = byFixture.get('consistency-auto-layout-frame');

	return {
		results,
		consistency: {
			shapeVsFrame: Boolean(shapeHash && frameHash && shapeHash === frameHash),
			shapeVsAutoLayoutFrame: Boolean(shapeHash && autoLayoutHash && shapeHash === autoLayoutHash),
		},
	};
};

// Expose to window for easy testing from console
if (typeof window !== 'undefined') {
	(window as unknown as Record<string, unknown>).runExportBenchmark = runExportBenchmark;
	(window as unknown as Record<string, unknown>).runShadowGoldenHarness = runShadowGoldenHarness;
}
