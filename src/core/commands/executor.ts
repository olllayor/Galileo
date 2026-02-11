import { produce, enablePatches, Patch } from 'immer';
import type { Command } from './types';
import type {
	Asset,
	ComponentsLibrary,
	Document,
	Node,
	Page,
	StyleLibrary,
	StyleVariableLibrary,
	DocumentAppearance,
	VectorData,
	VectorPoint,
	VectorSegment,
} from '../doc/types';
import { buildVectorPathData } from '../doc/vector';
import { resolveBooleanNodePath } from '../doc/boolean/solve';
import { invalidateBooleanGeometryCache } from '../doc/geometry-cache';
import { validateBooleanOperandSet } from '../doc/geometry';
import {
	materializeComponentInstance,
	mergeComponentOverridePatch,
	normalizeComponentVariant,
	resolveComponentDefinition,
} from '../doc/components';
import { normalizeNodeAppearance } from '../doc/appearance';

type DraftDocument = {
	version: number;
	rootId: string;
	pages: Page[];
	activePageId: string;
	nodes: Record<string, Node>;
	assets: Record<string, Asset>;
	components: ComponentsLibrary;
	styles: StyleLibrary;
	variables: StyleVariableLibrary;
	appearance?: DocumentAppearance;
	prototype: Document['prototype'];
};

enablePatches();

export const applyCommand = (doc: Document, cmd: Command): Document => {
	const next = produce(doc, (draft) => {
		applyCommandToDraft(draft as DraftDocument, cmd);
	});
	invalidateBooleanGeometryCache();
	return next;
};

const applyCommandToDraft = (draft: DraftDocument, cmd: Command): void => {
	ensurePagesMetadata(draft);
	ensureStyleVariableLibraries(draft);
	ensureDocumentAppearance(draft);
	ensurePrototypeGraph(draft);

	switch (cmd.type) {
			case 'createNode': {
				const { id, parentId, node, index } = cmd.payload;
				const newNode = normalizeNodeAppearance({
					...node,
					id,
					children: [],
				} as Node);
				draft.nodes[id] = newNode;

			const parent = draft.nodes[parentId];
			if (parent) {
				if (!parent.children) {
					parent.children = [];
				}
				if (index !== undefined) {
					parent.children.splice(index, 0, id);
				} else {
					parent.children.push(id);
				}
			}
			break;
		}

		case 'deleteNode': {
			const { id } = cmd.payload;
			if (id === draft.rootId) {
				throw new Error('Cannot delete root node');
			}
			if (isPageRootNode(draft, id)) {
				throw new Error('Cannot delete page root node');
			}

			const toDelete = collectNodes(draft, id);
			for (const nodeId of toDelete) {
				delete draft.nodes[nodeId];
			}

			const parent = findParent(draft, id);
			if (parent && parent.children) {
				parent.children = parent.children.filter((childId: string) => childId !== id);
			}
			prunePrototypeGraph(draft);
			break;
		}

		case 'moveNode': {
			const { id, position } = cmd.payload;
			const node = draft.nodes[id];
			if (node) {
				node.position = { ...position };
			}
			break;
		}

		case 'resizeNode': {
			const { id, size } = cmd.payload;
			const node = draft.nodes[id];
			if (node) {
				node.size = { ...size };
			}
			break;
		}

			case 'setProps': {
				const { id, props } = cmd.payload;
				const node = draft.nodes[id];
				if (node) {
					Object.assign(node, props);
					const normalized = normalizeNodeAppearance(node);
					Object.assign(node, normalized);
					if (node.type === 'boolean') {
						refreshBooleanNodeMetadata(draft, id);
					}
				}
				break;
		}

		case 'reorderChild': {
			const { parentId, fromIndex, toIndex } = cmd.payload;
			const parent = draft.nodes[parentId];
			if (!parent?.children || parent.children.length === 0) {
				break;
			}
			if (fromIndex < 0 || fromIndex >= parent.children.length) {
				break;
			}
			const [moved] = parent.children.splice(fromIndex, 1);
			const clamped = Math.max(0, Math.min(toIndex, parent.children.length));
			parent.children.splice(clamped, 0, moved);
			break;
		}

		case 'createAsset': {
			const { id, asset } = cmd.payload;
			draft.assets[id] = asset;
			break;
		}

		case 'groupNodes': {
			const { groupId, nodeIds, parentId, insertIndex } = cmd.payload;
			const parent = draft.nodes[parentId];
			if (!parent?.children) break;

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;

			for (const nodeId of nodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				minX = Math.min(minX, node.position.x);
				minY = Math.min(minY, node.position.y);
				maxX = Math.max(maxX, node.position.x + node.size.width);
				maxY = Math.max(maxY, node.position.y + node.size.height);
			}

			const groupNode: Node = {
				id: groupId,
				type: 'group',
				name: 'Group',
				position: { x: minX, y: minY },
				size: { width: maxX - minX, height: maxY - minY },
				children: [],
				visible: true,
			};
			draft.nodes[groupId] = groupNode;

			const nodeIdSet = new Set(nodeIds);
			parent.children = parent.children.filter((id: string) => !nodeIdSet.has(id));

			const orderedNodeIds = nodeIds.slice();

			for (const nodeId of orderedNodeIds) {
				const node = draft.nodes[nodeId];
				if (!node) continue;
				node.position = {
					x: node.position.x - minX,
					y: node.position.y - minY,
				};
				groupNode.children!.push(nodeId);
			}

			parent.children.splice(insertIndex, 0, groupId);
			break;
		}

		case 'ungroupNodes': {
			const { groupId } = cmd.payload;
			const group = draft.nodes[groupId];
			if (!group || group.type !== 'group') break;

			const parent = findParent(draft, groupId);
			if (!parent?.children) break;

			const groupIndex = parent.children.indexOf(groupId);
			if (groupIndex === -1) break;

			const childIds = group.children || [];
			for (const childId of childIds) {
				const child = draft.nodes[childId];
				if (!child) continue;
				child.position = {
					x: child.position.x + group.position.x,
					y: child.position.y + group.position.y,
				};
			}

			parent.children.splice(groupIndex, 1, ...childIds);
			delete draft.nodes[groupId];
			break;
		}

		case 'createBooleanNode': {
			const { id, parentId, operandIds, op, index, tolerance } = cmd.payload;
			if (draft.nodes[id]) break;

			const validation = validateBooleanOperandSet(asDocument(draft), parentId, operandIds);
			if (!validation.ok) {
				break;
			}

			const parent = draft.nodes[parentId];
			if (!parent?.children) break;

			const orderedOperandIds = parent.children.filter((childId) => operandIds.includes(childId));
			if (orderedOperandIds.length < 2) break;

			let minX = Number.POSITIVE_INFINITY;
			let minY = Number.POSITIVE_INFINITY;
			let maxX = Number.NEGATIVE_INFINITY;
			let maxY = Number.NEGATIVE_INFINITY;

			for (const operandId of orderedOperandIds) {
				const operand = draft.nodes[operandId];
				if (!operand) continue;
				minX = Math.min(minX, operand.position.x);
				minY = Math.min(minY, operand.position.y);
				maxX = Math.max(maxX, operand.position.x + operand.size.width);
				maxY = Math.max(maxY, operand.position.y + operand.size.height);
			}

			if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
				break;
			}

			const firstOperand = draft.nodes[orderedOperandIds[0]];
			const insertIndex =
				typeof index === 'number' ? index : Math.max(0, parent.children.indexOf(orderedOperandIds[0]));

				const booleanNode: Node = normalizeNodeAppearance({
					id,
					type: 'boolean',
					name: 'Boolean',
					position: { x: minX, y: minY },
				size: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
				children: orderedOperandIds,
				visible: true,
				fill: firstOperand?.fill,
				stroke: firstOperand?.stroke,
				opacity: firstOperand?.opacity,
					booleanData: {
						op,
						operandIds: orderedOperandIds,
						status: 'ok',
						tolerance:
							typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.001,
					},
				});
				draft.nodes[id] = booleanNode;

			for (const operandId of orderedOperandIds) {
				const operand = draft.nodes[operandId];
				if (!operand) continue;
				operand.position = {
					x: operand.position.x - minX,
					y: operand.position.y - minY,
				};
			}

			const operandIdSet = new Set(orderedOperandIds);
			parent.children = parent.children.filter((childId) => !operandIdSet.has(childId));
			parent.children.splice(Math.max(0, Math.min(insertIndex, parent.children.length)), 0, id);

			refreshBooleanNodeMetadata(draft, id);
			break;
		}

		case 'setBooleanOp': {
			const { id, op } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean' || !node.booleanData) break;
			node.booleanData.op = op;
			refreshBooleanNodeMetadata(draft, id);
			break;
		}

		case 'setBooleanIsolation': {
			const { id, isolationOperandId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean' || !node.booleanData) break;
			node.booleanData.isolationOperandId = isolationOperandId;
			break;
		}

		case 'flattenBooleanNode': {
			const { id } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'boolean') break;

			const resolved = resolveBooleanNodePath(asDocument(draft), node);
			if (resolved.status !== 'ok') {
				if (node.booleanData) {
					node.booleanData.status = 'invalid';
					node.booleanData.lastErrorCode = resolved.errorCode;
				}
				break;
			}

			const operandIds = [...(node.children ?? [])];
			for (const operandId of operandIds) {
				const toDelete = collectNodes(draft, operandId);
				for (const deleteId of toDelete) {
					delete draft.nodes[deleteId];
				}
			}

			node.type = 'path';
			node.children = [];
			node.vector = undefined;
			node.path = {
				d: resolved.d,
				fillRule: resolved.fillRule,
			};
			node.size = {
				width: Math.max(1, resolved.bounds.width),
				height: Math.max(1, resolved.bounds.height),
			};
			node.booleanData = undefined;
			break;
		}

		case 'addVectorPoint': {
			const { id, point, afterPointId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;

			const vector = ensureVectorData(node.vector);
			const pointId = point.id ?? `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
			if (vector.points.some((existing) => existing.id === pointId)) break;

			const insertIndex =
				typeof afterPointId === 'string'
					? Math.max(0, vector.points.findIndex((existing) => existing.id === afterPointId) + 1)
					: vector.points.length;

			const nextPoint: VectorPoint = {
				id: pointId,
				x: point.x,
				y: point.y,
				cornerMode: point.cornerMode ?? 'sharp',
			};
			vector.points.splice(insertIndex, 0, nextPoint);
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
			break;
		}

		case 'moveVectorPoint': {
			const { id, pointId, x, y } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			const target = vector.points.find((point) => point.id === pointId);
			if (!target) break;
			target.x = x;
			target.y = y;
			applyVectorToNode(node, vector);
			break;
		}

		case 'deleteVectorPoint': {
			const { id, pointId } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			vector.points = vector.points.filter((point) => point.id !== pointId);
			vector.closed = vector.closed && vector.points.length > 2;
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
			break;
		}

		case 'setVectorHandle': {
			const { id, pointId, handle, value } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			const target = vector.points.find((point) => point.id === pointId);
			if (!target) break;
			if (handle === 'in') {
				target.inHandle = value ? { ...value } : undefined;
			} else {
				target.outHandle = value ? { ...value } : undefined;
			}
			applyVectorToNode(node, vector);
			break;
		}

		case 'toggleVectorClosed': {
			const { id, closed } = cmd.payload;
			const node = draft.nodes[id];
			if (!node || node.type !== 'path') break;
			const vector = ensureVectorData(node.vector);
			vector.closed = closed && vector.points.length > 2;
			vector.segments = rebuildSequentialSegments(vector.points, vector.closed);
			applyVectorToNode(node, vector);
			break;
		}

		case 'batch': {
			for (const subCmd of cmd.payload.commands) {
				applyCommandToDraft(draft, subCmd);
			}
			break;
		}

		case 'createPage': {
			const { pageId, name, rootId, index, activate, rootNode } = cmd.payload;
			if (draft.pages.some((page) => page.id === pageId)) break;
			if (draft.nodes[rootId]) break;

			const nextRootNode: Node = {
				id: rootId,
				type: 'frame',
				name: 'Canvas',
				position: { x: 0, y: 0 },
				size: { width: 1280, height: 800 },
				children: [],
				visible: true,
				...(rootNode ?? {}),
			};
			nextRootNode.children = Array.isArray(rootNode?.children) ? [...rootNode.children] : [];
			draft.nodes[rootId] = nextRootNode;

			const page: Page = {
				id: pageId,
				name: name.trim().length > 0 ? name.trim() : `Page ${draft.pages.length + 1}`,
				rootId,
			};
			const insertIndex =
				typeof index === 'number' ? Math.max(0, Math.min(index, draft.pages.length)) : draft.pages.length;
			draft.pages.splice(insertIndex, 0, page);
			ensurePrototypePageGraph(draft, pageId);
			if (activate) {
				draft.activePageId = pageId;
			}
			break;
		}

		case 'renamePage': {
			const { pageId, name } = cmd.payload;
			const page = draft.pages.find((entry) => entry.id === pageId);
			if (!page) break;
			const nextName = name.trim();
			page.name = nextName.length > 0 ? nextName : page.name;
			break;
		}

		case 'reorderPage': {
			const { fromIndex, toIndex } = cmd.payload;
			if (fromIndex < 0 || fromIndex >= draft.pages.length) {
				break;
			}
			const [moved] = draft.pages.splice(fromIndex, 1);
			if (!moved) break;
			const clamped = Math.max(0, Math.min(toIndex, draft.pages.length));
			draft.pages.splice(clamped, 0, moved);
			break;
		}

		case 'deletePage': {
			const { pageId, fallbackPageId } = cmd.payload;
			if (draft.pages.length <= 1) {
				throw new Error('Cannot delete last page');
			}
			const pageIndex = draft.pages.findIndex((entry) => entry.id === pageId);
			if (pageIndex === -1) break;

			const [removedPage] = draft.pages.splice(pageIndex, 1);
			if (!removedPage) break;

			const fallback =
				(fallbackPageId && draft.pages.find((entry) => entry.id === fallbackPageId)?.id) ??
				draft.pages[Math.min(pageIndex, draft.pages.length - 1)]?.id ??
				draft.pages[0]?.id;
			if (removedPage.id === draft.activePageId && fallback) {
				draft.activePageId = fallback;
			}
			if (removedPage.rootId === draft.rootId && draft.pages[0]) {
				draft.rootId = draft.pages[0].rootId;
			}
			deleteNodeSubtree(draft, removedPage.rootId);
			delete draft.prototype.pages[removedPage.id];
			prunePrototypeGraph(draft);
			break;
		}

		case 'setPrototypeStartFrame': {
			const { pageId, frameId } = cmd.payload;
			const page = draft.pages.find((entry) => entry.id === pageId);
			if (!page) break;
			const pagePrototype = ensurePrototypePageGraph(draft, pageId);
			if (!frameId) {
				pagePrototype.startFrameId = undefined;
				break;
			}
			if (!isFrameInPage(draft, page.rootId, frameId)) break;
			pagePrototype.startFrameId = frameId;
			break;
		}

		case 'setPrototypeInteraction': {
			const { pageId, sourceFrameId, trigger, interaction } = cmd.payload;
			const page = draft.pages.find((entry) => entry.id === pageId);
			if (!page) break;
			if (!isFrameInPage(draft, page.rootId, sourceFrameId)) break;
			const pagePrototype = ensurePrototypePageGraph(draft, pageId);
			const current = pagePrototype.interactionsBySource[sourceFrameId] ?? {};

			if (!interaction) {
				const next = { ...current, [trigger]: undefined };
				if (!next.click && !next.hover) {
					delete pagePrototype.interactionsBySource[sourceFrameId];
				} else {
					pagePrototype.interactionsBySource[sourceFrameId] = next;
				}
				break;
			}

			if (!isFrameInPage(draft, page.rootId, interaction.targetFrameId)) break;
			pagePrototype.interactionsBySource[sourceFrameId] = {
				...current,
				[trigger]: {
					targetFrameId: interaction.targetFrameId,
					transition: interaction.transition,
				},
			};
			break;
		}

		case 'setVariableCollectionMode': {
			const { collectionId, modeId } = cmd.payload;
			const collection = draft.variables.collections[collectionId];
			if (!collection) break;
			if (!collection.modes.some((mode) => mode.id === modeId)) break;
			draft.variables.activeModeByCollection[collectionId] = modeId;
			break;
		}

		case 'upsertVariableCollection': {
			const { collection } = cmd.payload;
			draft.variables.collections[collection.id] = collection;
			const fallbackModeId = collection.defaultModeId ?? collection.modes[0]?.id;
			if (fallbackModeId && !draft.variables.activeModeByCollection[collection.id]) {
				draft.variables.activeModeByCollection[collection.id] = fallbackModeId;
			}
			break;
		}

		case 'removeVariableCollection': {
			const { collectionId } = cmd.payload;
			delete draft.variables.collections[collectionId];
			delete draft.variables.activeModeByCollection[collectionId];
			for (const [tokenId, token] of Object.entries(draft.variables.tokens)) {
				if (token.collectionId === collectionId) {
					delete draft.variables.tokens[tokenId];
				}
			}
			break;
		}

		case 'upsertVariableToken': {
			const { token } = cmd.payload;
			draft.variables.tokens[token.id] = token;
			break;
		}

		case 'removeVariableToken': {
			const { tokenId } = cmd.payload;
			delete draft.variables.tokens[tokenId];
			break;
		}

		case 'createComponentDefinition': {
			const { definition } = cmd.payload;
			ensureComponentsLibrary(draft);
			draft.components.definitions[definition.id] = { ...definition };
			const existingSet = draft.components.sets[definition.setId];
			if (existingSet) {
				if (!existingSet.definitionIds.includes(definition.id)) {
					existingSet.definitionIds.push(definition.id);
				}
				for (const [key, value] of Object.entries(definition.variant ?? {})) {
					const current = existingSet.properties[key] ?? [];
					if (!current.includes(value)) {
						current.push(value);
					}
					existingSet.properties[key] = current;
				}
			}
			break;
		}

		case 'updateComponentDefinition': {
			const { id, updates } = cmd.payload;
			ensureComponentsLibrary(draft);
			const existing = draft.components.definitions[id];
			if (!existing) break;
			const merged = { ...existing, ...updates };
			draft.components.definitions[id] = merged;
			rematerializeInstancesForSet(draft, merged.setId);
			break;
		}

		case 'createOrUpdateComponentSet': {
			const { set } = cmd.payload;
			ensureComponentsLibrary(draft);
			draft.components.sets[set.id] = { ...set };
			break;
		}

		case 'insertComponentInstance': {
			const { id, parentId, componentId, name, variant, position, index, isMainPreview } = cmd.payload;
			const parent = draft.nodes[parentId];
			if (!parent) break;
			ensureComponentsLibrary(draft);
			const normalizedVariant = normalizeComponentVariant(variant);
			const definition = resolveComponentDefinition(draft.components, componentId, normalizedVariant);
			if (!definition) break;
			const templateRoot = definition.templateNodes[definition.templateRootId];
				const materialized = materializeComponentInstance(definition, id, {});
				for (const [runtimeId, runtimeNode] of Object.entries(materialized.nodes)) {
					if (isMainPreview) {
						runtimeNode.locked = true;
					}
					draft.nodes[runtimeId] = normalizeNodeAppearance(runtimeNode);
				}
			draft.nodes[id] = {
				id,
				type: 'componentInstance',
				name: name ?? definition.name,
				position: position ? { ...position } : { x: 0, y: 0 },
				size: templateRoot?.size ? { ...templateRoot.size } : { width: 100, height: 100 },
				children: [...materialized.rootChildIds],
				visible: true,
				componentId,
				variant: normalizedVariant,
				componentOverrides: {},
				isComponentMainPreview: Boolean(isMainPreview),
				locked: Boolean(isMainPreview),
			};
			if (!parent.children) {
				parent.children = [];
			}
			if (typeof index === 'number') {
				parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, id);
			} else {
				parent.children.push(id);
			}
			break;
		}

		case 'setComponentInstanceVariant': {
			const { id, variant } = cmd.payload;
			const instance = draft.nodes[id];
			if (!instance || instance.type !== 'componentInstance' || !instance.componentId) break;
			instance.variant = normalizeComponentVariant(variant);
			rematerializeComponentInstanceDraft(draft, id);
			break;
		}

		case 'setComponentInstanceOverride': {
			const { id, sourceNodeId, patch, reset } = cmd.payload;
			const instance = draft.nodes[id];
			if (!instance || instance.type !== 'componentInstance') break;
			const existingOverrides = instance.componentOverrides ?? {};
			if (reset) {
				const next = { ...existingOverrides };
				delete next[sourceNodeId];
				instance.componentOverrides = Object.keys(next).length > 0 ? next : undefined;
			} else {
				const merged = mergeComponentOverridePatch(existingOverrides[sourceNodeId], patch ?? {});
				const next = { ...existingOverrides };
				if (merged) {
					next[sourceNodeId] = merged;
				} else {
					delete next[sourceNodeId];
				}
				instance.componentOverrides = Object.keys(next).length > 0 ? next : undefined;
			}
			rematerializeComponentInstanceDraft(draft, id);
			break;
		}

		case 'detachComponentInstance': {
			const { id } = cmd.payload;
			const instance = draft.nodes[id];
			if (!instance || instance.type !== 'componentInstance') break;
			instance.type = 'frame';
			instance.componentId = undefined;
			instance.variant = undefined;
			instance.componentOverrides = undefined;
			instance.clipContent = instance.clipContent ?? false;
			const descendants = collectNodes(draft, id).filter((nodeId) => nodeId !== id);
			for (const descendantId of descendants) {
				const node = draft.nodes[descendantId];
				if (!node) continue;
				node.componentSourceNodeId = undefined;
			}
			break;
		}

		case 'upsertSharedStyle': {
			const { kind, style } = cmd.payload;
			if (kind === 'paint') {
				draft.styles.paint[style.id] = style;
			} else if (kind === 'text') {
				draft.styles.text[style.id] = style;
			} else if (kind === 'effect') {
				draft.styles.effect[style.id] = style;
			} else if (kind === 'grid') {
				draft.styles.grid[style.id] = style;
			}
			break;
		}

		case 'removeSharedStyle': {
			const { kind, id } = cmd.payload;
			if (kind === 'paint') {
				delete draft.styles.paint[id];
			} else if (kind === 'text') {
				delete draft.styles.text[id];
			} else if (kind === 'effect') {
				delete draft.styles.effect[id];
			} else if (kind === 'grid') {
				delete draft.styles.grid[id];
			}
			break;
		}

		case 'setDocumentAppearance': {
			draft.appearance = {
				recentSwatches: cmd.payload.appearance.recentSwatches.slice(0, 64),
				sampleSwatches: cmd.payload.appearance.sampleSwatches.slice(0, 64),
			};
			break;
		}

	}
};

const asDocument = (draft: DraftDocument): Document => ({
	version: draft.version,
	rootId: draft.rootId,
	pages: draft.pages,
	activePageId: draft.activePageId,
	nodes: draft.nodes,
	assets: draft.assets,
	components: draft.components,
	styles: draft.styles,
	variables: draft.variables,
	appearance: draft.appearance,
	prototype: draft.prototype,
});

const ensurePagesMetadata = (draft: DraftDocument): void => {
	if (!Array.isArray(draft.pages) || draft.pages.length === 0) {
		draft.pages = [{ id: 'page_1', name: 'Page 1', rootId: draft.rootId }];
	}
	if (!draft.activePageId || !draft.pages.some((page) => page.id === draft.activePageId)) {
		draft.activePageId = draft.pages[0].id;
	}
};

const isPageRootNode = (draft: DraftDocument, nodeId: string): boolean => {
	return draft.pages.some((page) => page.rootId === nodeId);
};

const ensureComponentsLibrary = (draft: DraftDocument): void => {
	if (!draft.components) {
		draft.components = { definitions: {}, sets: {} };
	}
	if (!draft.components.definitions) {
		draft.components.definitions = {};
	}
	if (!draft.components.sets) {
		draft.components.sets = {};
	}
};

const ensureStyleVariableLibraries = (draft: DraftDocument): void => {
	if (!draft.styles) {
		draft.styles = { paint: {}, text: {}, effect: {}, grid: {} };
	}
	if (!draft.styles.paint) draft.styles.paint = {};
	if (!draft.styles.text) draft.styles.text = {};
	if (!draft.styles.effect) draft.styles.effect = {};
	if (!draft.styles.grid) draft.styles.grid = {};

	if (!draft.variables) {
		draft.variables = { collections: {}, tokens: {}, activeModeByCollection: {} };
	}
	if (!draft.variables.collections) draft.variables.collections = {};
	if (!draft.variables.tokens) draft.variables.tokens = {};
	if (!draft.variables.activeModeByCollection) draft.variables.activeModeByCollection = {};
};

const ensurePrototypeGraph = (draft: DraftDocument): void => {
	if (!draft.prototype || typeof draft.prototype !== 'object') {
		draft.prototype = { pages: {} };
	}
	if (!draft.prototype.pages || typeof draft.prototype.pages !== 'object') {
		draft.prototype.pages = {};
	}
	for (const page of draft.pages) {
		ensurePrototypePageGraph(draft, page.id);
	}
};

const ensureDocumentAppearance = (draft: DraftDocument): void => {
	if (!draft.appearance) {
		draft.appearance = {
			recentSwatches: [],
			sampleSwatches: ['#ffffff', '#d9d9d9', '#000000', '#ff5e5b', '#00a884', '#3a7bff'],
		};
		return;
	}
	draft.appearance.recentSwatches = Array.isArray(draft.appearance.recentSwatches)
		? draft.appearance.recentSwatches.slice(0, 64)
		: [];
	draft.appearance.sampleSwatches = Array.isArray(draft.appearance.sampleSwatches)
		? draft.appearance.sampleSwatches.slice(0, 64)
		: ['#ffffff', '#d9d9d9', '#000000', '#ff5e5b', '#00a884', '#3a7bff'];
};

const ensurePrototypePageGraph = (draft: DraftDocument, pageId: string): Document['prototype']['pages'][string] => {
	if (!draft.prototype.pages[pageId]) {
		draft.prototype.pages[pageId] = {
			interactionsBySource: {},
		};
	}
	if (!draft.prototype.pages[pageId].interactionsBySource) {
		draft.prototype.pages[pageId].interactionsBySource = {};
	}
	return draft.prototype.pages[pageId];
};

const collectPageNodeIds = (draft: DraftDocument, pageRootId: string): Set<string> => {
	const ids = new Set<string>();
	const queue = [pageRootId];
	while (queue.length > 0) {
		const nodeId = queue.shift();
		if (!nodeId || ids.has(nodeId)) continue;
		const node = draft.nodes[nodeId];
		if (!node) continue;
		ids.add(nodeId);
		for (const childId of node.children ?? []) {
			queue.push(childId);
		}
	}
	return ids;
};

const isFrameInPage = (draft: DraftDocument, pageRootId: string, frameId: string): boolean => {
	if (frameId === pageRootId) return false;
	const node = draft.nodes[frameId];
	if (!node || node.type !== 'frame') return false;
	return collectPageNodeIds(draft, pageRootId).has(frameId);
};

const prunePrototypeGraph = (draft: DraftDocument): void => {
	ensurePrototypeGraph(draft);
	const validPageIds = new Set(draft.pages.map((page) => page.id));
	for (const pageId of Object.keys(draft.prototype.pages)) {
		if (!validPageIds.has(pageId)) {
			delete draft.prototype.pages[pageId];
		}
	}

	for (const page of draft.pages) {
		const pagePrototype = ensurePrototypePageGraph(draft, page.id);
		const pageNodeIds = collectPageNodeIds(draft, page.rootId);
		const validFrames = new Set<string>();
		for (const nodeId of pageNodeIds) {
			const node = draft.nodes[nodeId];
			if (!node || node.type !== 'frame' || nodeId === page.rootId) continue;
			validFrames.add(nodeId);
		}

		if (!pagePrototype.startFrameId || !validFrames.has(pagePrototype.startFrameId)) {
			pagePrototype.startFrameId = undefined;
		}

		for (const [sourceFrameId, sourceInteractions] of Object.entries(pagePrototype.interactionsBySource ?? {})) {
			if (!validFrames.has(sourceFrameId)) {
				delete pagePrototype.interactionsBySource[sourceFrameId];
				continue;
			}

			const click =
				sourceInteractions.click && validFrames.has(sourceInteractions.click.targetFrameId)
					? sourceInteractions.click
					: undefined;
			const hover =
				sourceInteractions.hover && validFrames.has(sourceInteractions.hover.targetFrameId)
					? sourceInteractions.hover
					: undefined;

			if (!click && !hover) {
				delete pagePrototype.interactionsBySource[sourceFrameId];
				continue;
			}

			pagePrototype.interactionsBySource[sourceFrameId] = {
				...(click ? { click } : {}),
				...(hover ? { hover } : {}),
			};
		}
	}
};

const deleteNodeSubtree = (draft: DraftDocument, nodeId: string): void => {
	const ids = collectNodes(draft, nodeId);
	for (const id of ids) {
		delete draft.nodes[id];
	}
};

const rematerializeComponentInstanceDraft = (draft: DraftDocument, instanceId: string): void => {
	const instance = draft.nodes[instanceId];
	if (!instance || instance.type !== 'componentInstance' || !instance.componentId) return;
	ensureComponentsLibrary(draft);
	const definition = resolveComponentDefinition(draft.components, instance.componentId, instance.variant);
	if (!definition) return;

	for (const childId of instance.children ?? []) {
		deleteNodeSubtree(draft, childId);
	}

	const materialized = materializeComponentInstance(definition, instanceId, instance.componentOverrides ?? {});
	for (const [runtimeId, runtimeNode] of Object.entries(materialized.nodes)) {
		draft.nodes[runtimeId] = normalizeNodeAppearance(runtimeNode);
	}
	instance.children = [...materialized.rootChildIds];
	const templateRoot = definition.templateNodes[definition.templateRootId];
	if (templateRoot) {
		instance.size = { ...templateRoot.size };
	}
};

const rematerializeInstancesForSet = (draft: DraftDocument, setId: string): void => {
	for (const node of Object.values(draft.nodes)) {
		if (node.type !== 'componentInstance') continue;
		if (node.componentId !== setId) continue;
		rematerializeComponentInstanceDraft(draft, node.id);
	}
};

const refreshBooleanNodeMetadata = (draft: DraftDocument, nodeId: string): void => {
	const node = draft.nodes[nodeId];
	if (!node || node.type !== 'boolean' || !node.booleanData) return;

	const resolved = resolveBooleanNodePath(asDocument(draft), node);
	if (resolved.status === 'ok') {
		node.booleanData.status = 'ok';
		node.booleanData.lastErrorCode = undefined;
		node.size = {
			width: Math.max(1, Math.max(node.size.width, resolved.bounds.width)),
			height: Math.max(1, Math.max(node.size.height, resolved.bounds.height)),
		};
		return;
	}

	node.booleanData.status = 'invalid';
	node.booleanData.lastErrorCode = resolved.errorCode;
};

const ensureVectorData = (vector: VectorData | undefined): VectorData => {
	if (!vector || !Array.isArray(vector.points)) {
		return {
			points: [],
			segments: [],
			closed: false,
		};
	}

	const points: VectorPoint[] = vector.points.map((point, index) => ({
		id: point.id || `pt_${index}`,
		x: point.x,
		y: point.y,
		cornerMode: point.cornerMode ?? 'sharp',
		...(point.inHandle ? { inHandle: { ...point.inHandle } } : {}),
		...(point.outHandle ? { outHandle: { ...point.outHandle } } : {}),
	}));

	const closed = vector.closed === true;
	const segments =
		vector.segments && vector.segments.length > 0
			? vector.segments.map((segment, index) => ({
				id: segment.id || `seg_${index}`,
				fromId: segment.fromId,
				toId: segment.toId,
			}))
			: rebuildSequentialSegments(points, closed);

	return { points, segments, closed };
};

const rebuildSequentialSegments = (points: VectorPoint[], closed: boolean): VectorSegment[] => {
	if (points.length < 2) {
		return [];
	}
	const segments: VectorSegment[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		segments.push({
			id: `seg_${i}`,
			fromId: points[i].id,
			toId: points[i + 1].id,
		});
	}
	if (closed && points.length > 2) {
		segments.push({
			id: `seg_${segments.length}`,
			fromId: points[points.length - 1].id,
			toId: points[0].id,
		});
	}
	return segments;
};

const applyVectorToNode = (node: Node, vector: VectorData): void => {
	const normalized = normalizeVectorData(vector);
	node.position = {
		x: node.position.x + normalized.offset.x,
		y: node.position.y + normalized.offset.y,
	};
	node.size = {
		width: normalized.bounds.width,
		height: normalized.bounds.height,
	};
	node.vector = {
		points: normalized.vector.points,
		segments: normalized.vector.segments,
		closed: normalized.vector.closed,
	};
	node.path = buildVectorPathData(node.vector);
};

const normalizeVectorData = (
	vector: VectorData,
): {
	vector: VectorData;
	offset: { x: number; y: number };
	bounds: { width: number; height: number };
} => {
	if (!vector.points.length) {
		return {
			vector: { ...vector, points: [], segments: [] },
			offset: { x: 0, y: 0 },
			bounds: { width: 1, height: 1 },
		};
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	const includePoint = (x: number, y: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};

	for (const point of vector.points) {
		includePoint(point.x, point.y);
		if (point.inHandle) includePoint(point.inHandle.x, point.inHandle.y);
		if (point.outHandle) includePoint(point.outHandle.x, point.outHandle.y);
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		return {
			vector: { ...vector, segments: rebuildSequentialSegments(vector.points, vector.closed) },
			offset: { x: 0, y: 0 },
			bounds: { width: 1, height: 1 },
		};
	}

	const offset = { x: minX, y: minY };
	const normalizedPoints = vector.points.map((point) => ({
		...point,
		x: point.x - minX,
		y: point.y - minY,
		...(point.inHandle ? { inHandle: { x: point.inHandle.x - minX, y: point.inHandle.y - minY } } : {}),
		...(point.outHandle ? { outHandle: { x: point.outHandle.x - minX, y: point.outHandle.y - minY } } : {}),
	}));

	return {
		vector: {
			points: normalizedPoints,
			segments: rebuildSequentialSegments(normalizedPoints, vector.closed),
			closed: vector.closed,
		},
		offset,
		bounds: {
			width: Math.max(1, maxX - minX),
			height: Math.max(1, maxY - minY),
		},
	};
};

const collectNodes = (draft: DraftDocument, nodeId: string): string[] => {
	const toDelete: string[] = [nodeId];
	const queue = [nodeId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const node = draft.nodes[current];
		if (node?.children) {
			for (const childId of node.children) {
				toDelete.push(childId);
				queue.push(childId);
			}
		}
	}

	return toDelete;
};

const findParent = (draft: DraftDocument, nodeId: string): Node | null => {
	for (const node of Object.values(draft.nodes)) {
		if (node.children?.includes(nodeId)) {
			return node;
		}
	}
	return null;
};

export const getCommandPatches = (doc: Document, cmd: Command): { patches: Patch[]; inversePatches: Patch[] } => {
	let patches: Patch[] = [];
	let inversePatches: Patch[] = [];

	produce(
		doc,
		(draft) => {
			applyCommandToDraft(draft as DraftDocument, cmd);
		},
		(p, ip) => {
			patches = p;
			inversePatches = ip;
		},
	);

	return { patches, inversePatches };
};
