/**
 * Geometry Cache with dirty-flag subtree invalidation
 *
 * Instead of recomputing all world bounds on every frame,
 * this cache tracks which subtrees are dirty and only recomputes those.
 *
 * Typical speedup: 5-20x for large documents where only 1-2 nodes change per frame.
 */

import type { Document, Node } from './types';
import type { WorldBoundsMap, ParentMap, BoundsOverrideMap } from './geometry';
import { computeAutoLayoutPositions } from './geometry';

export interface GeometryCacheStats {
	totalNodes: number;
	dirtyNodes: number;
	cacheHits: number;
	cacheMisses: number;
	lastComputeMs: number;
}

export class GeometryCache {
	private boundsMap: WorldBoundsMap = {};
	private parentMap: ParentMap = {};
	private dirtyNodes: Set<string> = new Set();
	private documentVersion = 0;
	private stats: GeometryCacheStats = {
		totalNodes: 0,
		dirtyNodes: 0,
		cacheHits: 0,
		cacheMisses: 0,
		lastComputeMs: 0,
	};

	/**
	 * Get cached world bounds, recomputing only dirty subtrees.
	 * Pass document version to detect full invalidation needs.
	 */
	getBounds(doc: Document, overrides?: BoundsOverrideMap): WorldBoundsMap {
		const startTime = performance.now();

		// Full rebuild if document structure changed significantly
		if (doc.version !== this.documentVersion || Object.keys(this.boundsMap).length === 0) {
			this.fullRebuild(doc, overrides);
			this.documentVersion = doc.version;
			this.stats.lastComputeMs = performance.now() - startTime;
			return this.boundsMap;
		}

		// Incremental update for dirty nodes
		if (this.dirtyNodes.size > 0) {
			this.updateDirtySubtrees(doc, overrides);
		}

		// Apply overrides (live drag preview)
		if (overrides && Object.keys(overrides).length > 0) {
			return this.applyOverrides(overrides);
		}

		this.stats.lastComputeMs = performance.now() - startTime;
		return this.boundsMap;
	}

	/**
	 * Mark a node and its descendants as needing recomputation.
	 * Call this when a node's position, size, or children change.
	 */
	invalidateNode(nodeId: string): void {
		this.dirtyNodes.add(nodeId);
	}

	/**
	 * Mark a subtree (node + all descendants) as dirty.
	 */
	invalidateSubtree(doc: Document, nodeId: string): void {
		this.dirtyNodes.add(nodeId);
		const node = doc.nodes[nodeId];
		if (node?.children) {
			for (const childId of node.children) {
				this.invalidateSubtree(doc, childId);
			}
		}
	}

	/**
	 * Mark entire cache as invalid (e.g., after undo/redo).
	 */
	invalidateAll(): void {
		this.documentVersion = -1;
	}

	/**
	 * Get the parent map (built during bounds computation).
	 */
	getParentMap(): ParentMap {
		return this.parentMap;
	}

	/**
	 * Get cache performance stats.
	 */
	getStats(): GeometryCacheStats {
		return { ...this.stats };
	}

	/**
	 * Clear the cache entirely.
	 */
	clear(): void {
		this.boundsMap = {};
		this.parentMap = {};
		this.dirtyNodes.clear();
		this.documentVersion = 0;
	}

	private fullRebuild(doc: Document, overrides?: BoundsOverrideMap): void {
		this.boundsMap = {};
		this.parentMap = {};
		this.dirtyNodes.clear();

		const root = doc.nodes[doc.rootId];
		if (!root) return;

		this.parentMap[doc.rootId] = null;
		this.stats.totalNodes = 0;
		this.stats.cacheMisses = Object.keys(doc.nodes).length;
		this.stats.cacheHits = 0;

		const rootOverride = overrides?.[doc.rootId];
		const rootX = rootOverride?.x ?? root.position.x;
		const rootY = rootOverride?.y ?? root.position.y;

		const stack: Array<{ id: string; x: number; y: number }> = [{ id: doc.rootId, x: rootX, y: rootY }];

		while (stack.length > 0) {
			const current = stack.pop()!;
			const node = doc.nodes[current.id];
			if (!node) continue;

			this.stats.totalNodes++;

			const override = overrides?.[node.id];
			const worldX = override?.x ?? current.x;
			const worldY = override?.y ?? current.y;
			const width = override?.width ?? node.size.width;
			const height = override?.height ?? node.size.height;

			this.boundsMap[node.id] = { x: worldX, y: worldY, width, height };

			if (!node.children || node.children.length === 0) continue;

			// Get child nodes
			const childNodes = node.children
				.map((childId) => doc.nodes[childId])
				.filter((child): child is Node => child !== undefined);

			// Compute auto-layout positions if parent has layout
			const layoutPositions = computeAutoLayoutPositions(node, childNodes);

			for (const child of childNodes) {
				this.parentMap[child.id] = node.id;
				const layoutPos = layoutPositions[child.id];
				const childLocalX = layoutPos?.x ?? child.position.x;
				const childLocalY = layoutPos?.y ?? child.position.y;

				stack.push({
					id: child.id,
					x: worldX + childLocalX,
					y: worldY + childLocalY,
				});
			}
		}

		this.stats.dirtyNodes = 0;
	}

	private updateDirtySubtrees(doc: Document, overrides?: BoundsOverrideMap): void {
		const toUpdate = new Set<string>();

		// For each dirty node, we need to recompute it and all its descendants
		for (const dirtyId of this.dirtyNodes) {
			this.collectSubtree(doc, dirtyId, toUpdate);
		}

		this.stats.dirtyNodes = toUpdate.size;
		this.stats.cacheMisses += toUpdate.size;
		this.stats.cacheHits += this.stats.totalNodes - toUpdate.size;

		// Recompute only the dirty subtrees
		for (const nodeId of toUpdate) {
			const node = doc.nodes[nodeId];
			if (!node) continue;

			const parentId = this.parentMap[nodeId];
			const parentBounds = parentId ? this.boundsMap[parentId] : null;

			// Compute this node's world position
			let worldX: number;
			let worldY: number;

			if (parentId && parentBounds) {
				const parent = doc.nodes[parentId];
				if (parent) {
					const childNodes = (parent.children || [])
						.map((id) => doc.nodes[id])
						.filter((n): n is Node => n !== undefined);
					const layoutPositions = computeAutoLayoutPositions(parent, childNodes);
					const layoutPos = layoutPositions[nodeId];
					const localX = layoutPos?.x ?? node.position.x;
					const localY = layoutPos?.y ?? node.position.y;
					worldX = parentBounds.x + localX;
					worldY = parentBounds.y + localY;
				} else {
					worldX = node.position.x;
					worldY = node.position.y;
				}
			} else {
				worldX = node.position.x;
				worldY = node.position.y;
			}

			const override = overrides?.[nodeId];
			this.boundsMap[nodeId] = {
				x: override?.x ?? worldX,
				y: override?.y ?? worldY,
				width: override?.width ?? node.size.width,
				height: override?.height ?? node.size.height,
			};
		}

		this.dirtyNodes.clear();
	}

	private collectSubtree(doc: Document, nodeId: string, result: Set<string>): void {
		result.add(nodeId);
		const node = doc.nodes[nodeId];
		if (node?.children) {
			for (const childId of node.children) {
				this.collectSubtree(doc, childId, result);
			}
		}
	}

	private applyOverrides(overrides: BoundsOverrideMap): WorldBoundsMap {
		// Create a shallow copy with overrides applied
		const result: WorldBoundsMap = { ...this.boundsMap };
		for (const [nodeId, override] of Object.entries(overrides)) {
			const existing = result[nodeId];
			if (existing) {
				result[nodeId] = {
					x: override.x ?? existing.x,
					y: override.y ?? existing.y,
					width: override.width ?? existing.width,
					height: override.height ?? existing.height,
				};
			} else {
				result[nodeId] = override;
			}
		}
		return result;
	}
}

// Singleton instance for app-wide use
let globalCache: GeometryCache | null = null;

export const getGeometryCache = (): GeometryCache => {
	if (!globalCache) {
		globalCache = new GeometryCache();
	}
	return globalCache;
};

export const resetGeometryCache = (): void => {
	globalCache = null;
};
