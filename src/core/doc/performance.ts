/**
 * Performance Monitor for Galileo
 *
 * Tracks and reports performance metrics for geometry, hit-testing, and snapping.
 * Use this to measure the impact of optimizations.
 */

import { getGeometryCache } from './geometry-cache';
import { getSpatialIndex } from './spatial-index';
import type { Document } from './types';
import type { WorldBoundsMap } from './geometry';

export interface PerformanceMetrics {
	geometry: {
		lastComputeMs: number;
		cacheHitRate: number;
		totalNodes: number;
		dirtyNodes: number;
	};
	spatialIndex: {
		lastBuildMs: number;
		cellCount: number;
		avgNodesPerCell: number;
	};
	shadows: {
		cacheHitRate: number;
		lastRenderMs: number;
		avgRenderMs: number;
	};
	lastFrameMs: number;
	framesPerSecond: number;
}

class PerformanceMonitor {
	private frameStartTime = 0;
	private frameTimes: number[] = [];
	private maxFrameSamples = 60;

	/**
	 * Call at the start of each frame/interaction.
	 */
	frameStart(): void {
		this.frameStartTime = performance.now();
	}

	/**
	 * Call at the end of each frame/interaction.
	 */
	frameEnd(): void {
		const frameTime = performance.now() - this.frameStartTime;
		this.frameTimes.push(frameTime);
		if (this.frameTimes.length > this.maxFrameSamples) {
			this.frameTimes.shift();
		}
	}

	/**
	 * Get current performance metrics.
	 */
	getMetrics(): PerformanceMetrics {
		const geoCache = getGeometryCache();
		const spatialIndex = getSpatialIndex();
		const geoStats = geoCache.getStats();
		const spatialStats = spatialIndex.getStats();

		const avgFrameTime =
			this.frameTimes.length > 0 ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0;

		const cacheHitRate =
			geoStats.cacheHits + geoStats.cacheMisses > 0
				? geoStats.cacheHits / (geoStats.cacheHits + geoStats.cacheMisses)
				: 0;
		const shadowHitRate =
			shadowMetrics.cacheHits + shadowMetrics.cacheMisses > 0
				? shadowMetrics.cacheHits / (shadowMetrics.cacheHits + shadowMetrics.cacheMisses)
				: 0;
		const shadowAvgMs =
			shadowMetrics.sampleCount > 0 ? shadowMetrics.totalRenderMs / shadowMetrics.sampleCount : 0;

		return {
			geometry: {
				lastComputeMs: geoStats.lastComputeMs,
				cacheHitRate,
				totalNodes: geoStats.totalNodes,
				dirtyNodes: geoStats.dirtyNodes,
			},
			spatialIndex: {
				lastBuildMs: spatialStats.lastBuildMs,
				cellCount: spatialStats.cellCount,
				avgNodesPerCell: spatialStats.avgNodesPerCell,
			},
			shadows: {
				cacheHitRate: shadowHitRate,
				lastRenderMs: shadowMetrics.lastRenderMs,
				avgRenderMs: shadowAvgMs,
			},
			lastFrameMs: this.frameTimes[this.frameTimes.length - 1] ?? 0,
			framesPerSecond: avgFrameTime > 0 ? 1000 / avgFrameTime : 0,
		};
	}

	/**
	 * Log a summary to the console.
	 */
	logSummary(): void {
		const m = this.getMetrics();
		console.log('📊 Galileo Performance Metrics:');
		console.log(`   Frame: ${m.lastFrameMs.toFixed(2)}ms (${m.framesPerSecond.toFixed(1)} FPS)`);
		console.log(
			`   Geometry: ${m.geometry.lastComputeMs.toFixed(2)}ms, ${(m.geometry.cacheHitRate * 100).toFixed(0)}% cache hit, ${m.geometry.totalNodes} nodes`,
		);
		console.log(`   Spatial: ${m.spatialIndex.lastBuildMs.toFixed(2)}ms, ${m.spatialIndex.cellCount} cells`);
		console.log(
			`   Shadows: ${m.shadows.lastRenderMs.toFixed(2)}ms last, ${(m.shadows.cacheHitRate * 100).toFixed(0)}% cache hit`,
		);
	}

	/**
	 * Reset frame timing data.
	 */
	reset(): void {
		this.frameTimes = [];
	}
}

// Singleton
let monitor: PerformanceMonitor | null = null;

type ShadowMetrics = {
	cacheHits: number;
	cacheMisses: number;
	lastRenderMs: number;
	totalRenderMs: number;
	sampleCount: number;
};

const shadowMetrics: ShadowMetrics = {
	cacheHits: 0,
	cacheMisses: 0,
	lastRenderMs: 0,
	totalRenderMs: 0,
	sampleCount: 0,
};

export const recordShadowCacheHit = (): void => {
	shadowMetrics.cacheHits += 1;
};

export const recordShadowCacheMiss = (): void => {
	shadowMetrics.cacheMisses += 1;
};

export const recordShadowRenderDuration = (durationMs: number): void => {
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		return;
	}
	shadowMetrics.lastRenderMs = durationMs;
	shadowMetrics.totalRenderMs += durationMs;
	shadowMetrics.sampleCount += 1;
};

export const getPerformanceMonitor = (): PerformanceMonitor => {
	if (!monitor) {
		monitor = new PerformanceMonitor();
	}
	return monitor;
};

/**
 * Convenience function to update geometry cache and spatial index together.
 * Call this when the document changes or before operations that need fresh data.
 */
export const updateGeometryAndIndex = (doc: Document, excludeFromIndex?: string[]): WorldBoundsMap => {
	const cache = getGeometryCache();
	const spatialIndex = getSpatialIndex();

	// Get cached bounds (will recompute dirty subtrees only)
	const boundsMap = cache.getBounds(doc);

	// Rebuild spatial index (fast for typical documents)
	const excludeSet = excludeFromIndex ? new Set(excludeFromIndex) : undefined;
	spatialIndex.build(boundsMap, excludeSet);

	return boundsMap;
};

/**
 * Mark nodes as dirty after a document change.
 * Call this when nodes are moved, resized, or their hierarchy changes.
 */
export const invalidateNodes = (doc: Document, nodeIds: string[]): void => {
	const cache = getGeometryCache();
	for (const nodeId of nodeIds) {
		cache.invalidateSubtree(doc, nodeId);
	}
};

/**
 * Run a benchmark comparing optimized vs brute-force geometry computation.
 */
export const runGeometryBenchmark = async (doc: Document, iterations: number = 100): Promise<void> => {
	const { buildWorldBoundsMap } = await import('./geometry');
	const cache = getGeometryCache();

	console.log(`🚀 Running geometry benchmark (${iterations} iterations)...`);
	console.log(`   Document has ${Object.keys(doc.nodes).length} nodes`);

	// Benchmark brute force
	const bruteStart = performance.now();
	for (let i = 0; i < iterations; i++) {
		buildWorldBoundsMap(doc);
	}
	const bruteTime = performance.now() - bruteStart;

	// Benchmark cached (warm cache)
	cache.invalidateAll();
	cache.getBounds(doc); // Warm up cache

	const cachedStart = performance.now();
	for (let i = 0; i < iterations; i++) {
		cache.getBounds(doc);
	}
	const cachedTime = performance.now() - cachedStart;

	// Benchmark cached with 1% dirty nodes
	const nodeIds = Object.keys(doc.nodes);
	const dirtyCount = Math.max(1, Math.floor(nodeIds.length * 0.01));
	const dirtyStart = performance.now();
	for (let i = 0; i < iterations; i++) {
		// Mark random nodes as dirty
		for (let j = 0; j < dirtyCount; j++) {
			const randomId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
			cache.invalidateNode(randomId);
		}
		cache.getBounds(doc);
	}
	const dirtyTime = performance.now() - dirtyStart;

	console.log('📈 Results:');
	console.log(`   Brute force: ${(bruteTime / iterations).toFixed(3)}ms per call`);
	console.log(
		`   Cached (warm): ${(cachedTime / iterations).toFixed(3)}ms per call (${(bruteTime / cachedTime).toFixed(1)}x faster)`,
	);
	console.log(
		`   Cached (1% dirty): ${(dirtyTime / iterations).toFixed(3)}ms per call (${(bruteTime / dirtyTime).toFixed(1)}x faster)`,
	);
};

// Expose to window for console debugging
if (typeof window !== 'undefined') {
	const w = window as unknown as Record<string, unknown>;
	w.galileoPerf = {
		getMetrics: () => getPerformanceMonitor().getMetrics(),
		logSummary: () => getPerformanceMonitor().logSummary(),
		runBenchmark: runGeometryBenchmark,
	};
}
