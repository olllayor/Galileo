/**
 * Benchmark utilities for comparing Rust vs Canvas image encoding
 * Usage: Call `runExportBenchmark(doc, nodeId)` from browser console
 */

import { exportNodeSnapshot, type SnapshotOptions } from './export';
import type { Document } from '../core/doc/types';

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

// Expose to window for easy testing from console
if (typeof window !== 'undefined') {
	(window as unknown as Record<string, unknown>).runExportBenchmark = runExportBenchmark;
}
