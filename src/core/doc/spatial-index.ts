/**
 * Spatial Index for fast hit-testing and snapping candidate lookup.
 *
 * Uses a simple grid-based spatial hash for O(1) cell lookup instead of O(n) brute force.
 * For typical design documents (100-10k nodes), this gives 5-50x speedup over full traversal.
 *
 * The grid cell size is tuned for typical node sizes (50-500px).
 */

import type { Bounds, WorldBoundsMap } from './geometry';

export interface SpatialIndexStats {
	totalNodes: number;
	cellCount: number;
	avgNodesPerCell: number;
	maxNodesPerCell: number;
	lastBuildMs: number;
}

export interface SpatialQueryResult {
	nodeId: string;
	bounds: Bounds;
}

const DEFAULT_CELL_SIZE = 200; // pixels

export class SpatialIndex {
	private cellSize: number;
	private cells: Map<string, Set<string>> = new Map();
	private nodeBounds: WorldBoundsMap = {};
	private stats: SpatialIndexStats = {
		totalNodes: 0,
		cellCount: 0,
		avgNodesPerCell: 0,
		maxNodesPerCell: 0,
		lastBuildMs: 0,
	};

	constructor(cellSize: number = DEFAULT_CELL_SIZE) {
		this.cellSize = cellSize;
	}

	/**
	 * Build the spatial index from a bounds map.
	 * Call this after bounds are computed/updated.
	 */
	build(boundsMap: WorldBoundsMap, excludeIds?: Set<string>): void {
		const startTime = performance.now();

		this.cells.clear();
		this.nodeBounds = boundsMap;
		this.stats.totalNodes = 0;

		for (const [nodeId, bounds] of Object.entries(boundsMap)) {
			if (excludeIds?.has(nodeId)) continue;
			this.insertNode(nodeId, bounds);
			this.stats.totalNodes++;
		}

		// Update stats
		this.stats.cellCount = this.cells.size;
		let totalInCells = 0;
		let maxInCell = 0;
		for (const cell of this.cells.values()) {
			totalInCells += cell.size;
			maxInCell = Math.max(maxInCell, cell.size);
		}
		this.stats.avgNodesPerCell = this.stats.cellCount > 0 ? totalInCells / this.stats.cellCount : 0;
		this.stats.maxNodesPerCell = maxInCell;
		this.stats.lastBuildMs = performance.now() - startTime;
	}

	/**
	 * Query all nodes that might intersect a point (with tolerance).
	 * Returns candidates - caller should do precise hit-testing.
	 */
	queryPoint(x: number, y: number, tolerance: number = 0): SpatialQueryResult[] {
		const results: SpatialQueryResult[] = [];
		const seen = new Set<string>();

		// Query cells that the tolerance region touches
		const minCellX = Math.floor((x - tolerance) / this.cellSize);
		const maxCellX = Math.floor((x + tolerance) / this.cellSize);
		const minCellY = Math.floor((y - tolerance) / this.cellSize);
		const maxCellY = Math.floor((y + tolerance) / this.cellSize);

		for (let cx = minCellX; cx <= maxCellX; cx++) {
			for (let cy = minCellY; cy <= maxCellY; cy++) {
				const key = `${cx},${cy}`;
				const cell = this.cells.get(key);
				if (!cell) continue;

				for (const nodeId of cell) {
					if (seen.has(nodeId)) continue;
					seen.add(nodeId);

					const bounds = this.nodeBounds[nodeId];
					if (!bounds) continue;

					// Quick AABB check with tolerance
					if (
						x >= bounds.x - tolerance &&
						x <= bounds.x + bounds.width + tolerance &&
						y >= bounds.y - tolerance &&
						y <= bounds.y + bounds.height + tolerance
					) {
						results.push({ nodeId, bounds });
					}
				}
			}
		}

		return results;
	}

	/**
	 * Query all nodes that might intersect a rectangle.
	 * Returns candidates for further filtering.
	 */
	queryRect(rect: Bounds): SpatialQueryResult[] {
		const results: SpatialQueryResult[] = [];
		const seen = new Set<string>();

		const minCellX = Math.floor(rect.x / this.cellSize);
		const maxCellX = Math.floor((rect.x + rect.width) / this.cellSize);
		const minCellY = Math.floor(rect.y / this.cellSize);
		const maxCellY = Math.floor((rect.y + rect.height) / this.cellSize);

		for (let cx = minCellX; cx <= maxCellX; cx++) {
			for (let cy = minCellY; cy <= maxCellY; cy++) {
				const key = `${cx},${cy}`;
				const cell = this.cells.get(key);
				if (!cell) continue;

				for (const nodeId of cell) {
					if (seen.has(nodeId)) continue;
					seen.add(nodeId);

					const bounds = this.nodeBounds[nodeId];
					if (!bounds) continue;

					// AABB intersection test
					if (
						rect.x < bounds.x + bounds.width &&
						rect.x + rect.width > bounds.x &&
						rect.y < bounds.y + bounds.height &&
						rect.y + rect.height > bounds.y
					) {
						results.push({ nodeId, bounds });
					}
				}
			}
		}

		return results;
	}

	/**
	 * Get nodes near a given node (for snapping).
	 * Expands the node's bounds by searchRadius.
	 */
	queryNearby(nodeId: string, searchRadius: number): SpatialQueryResult[] {
		const bounds = this.nodeBounds[nodeId];
		if (!bounds) return [];

		const expandedRect: Bounds = {
			x: bounds.x - searchRadius,
			y: bounds.y - searchRadius,
			width: bounds.width + searchRadius * 2,
			height: bounds.height + searchRadius * 2,
		};

		return this.queryRect(expandedRect).filter((r) => r.nodeId !== nodeId);
	}

	/**
	 * Get all snap target edges from nearby nodes.
	 * Optimized version that only looks at spatially relevant nodes.
	 */
	getSnapTargetsNear(
		bounds: Bounds,
		excludeIds: Set<string>,
		searchRadius: number = 100,
	): { x: number[]; y: number[] } {
		const targets = { x: [] as number[], y: [] as number[] };

		const expandedRect: Bounds = {
			x: bounds.x - searchRadius,
			y: bounds.y - searchRadius,
			width: bounds.width + searchRadius * 2,
			height: bounds.height + searchRadius * 2,
		};

		const candidates = this.queryRect(expandedRect);

		for (const { nodeId, bounds: nodeBounds } of candidates) {
			if (excludeIds.has(nodeId)) continue;

			// Collect edges
			const left = nodeBounds.x;
			const right = nodeBounds.x + nodeBounds.width;
			const centerX = nodeBounds.x + nodeBounds.width / 2;
			targets.x.push(left, centerX, right);

			const top = nodeBounds.y;
			const bottom = nodeBounds.y + nodeBounds.height;
			const centerY = nodeBounds.y + nodeBounds.height / 2;
			targets.y.push(top, centerY, bottom);
		}

		return targets;
	}

	/**
	 * Get index stats for debugging/profiling.
	 */
	getStats(): SpatialIndexStats {
		return { ...this.stats };
	}

	/**
	 * Clear the index.
	 */
	clear(): void {
		this.cells.clear();
		this.nodeBounds = {};
	}

	private insertNode(nodeId: string, bounds: Bounds): void {
		// Find all cells this node overlaps
		const minCellX = Math.floor(bounds.x / this.cellSize);
		const maxCellX = Math.floor((bounds.x + bounds.width) / this.cellSize);
		const minCellY = Math.floor(bounds.y / this.cellSize);
		const maxCellY = Math.floor((bounds.y + bounds.height) / this.cellSize);

		for (let cx = minCellX; cx <= maxCellX; cx++) {
			for (let cy = minCellY; cy <= maxCellY; cy++) {
				const key = `${cx},${cy}`;
				let cell = this.cells.get(key);
				if (!cell) {
					cell = new Set();
					this.cells.set(key, cell);
				}
				cell.add(nodeId);
			}
		}
	}
}

// Singleton instance
let globalSpatialIndex: SpatialIndex | null = null;

export const getSpatialIndex = (): SpatialIndex => {
	if (!globalSpatialIndex) {
		globalSpatialIndex = new SpatialIndex();
	}
	return globalSpatialIndex;
};

export const resetSpatialIndex = (): void => {
	globalSpatialIndex = null;
};
