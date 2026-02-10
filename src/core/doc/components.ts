import type {
	ComponentDefinition,
	ComponentOverridePatch,
	ComponentSet,
	ComponentVariantMap,
	ComponentsLibrary,
	Document,
	Node,
} from './types';

export const COMPONENT_OVERRIDEABLE_FIELDS = [
	'text',
	'fill',
	'fillStyleId',
	'stroke',
	'image',
	'opacity',
	'visible',
	'textStyleId',
	'effectStyleId',
	'gridStyleId',
] as const;
type ComponentOverrideableField = (typeof COMPONENT_OVERRIDEABLE_FIELDS)[number];

const deepClone = <T>(value: T): T => {
	if (typeof structuredClone === 'function') {
		try {
			return structuredClone(value);
		} catch {
			// Immer draft/proxy values can throw DataCloneError.
		}
	}
	return JSON.parse(JSON.stringify(value)) as T;
};

const sanitizeSourceId = (sourceId: string): string => sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');

export const buildMaterializedNodeId = (instanceId: string, sourceId: string): string =>
	`${instanceId}__src_${sanitizeSourceId(sourceId)}`;

export const normalizeComponentVariant = (variant?: ComponentVariantMap | null): ComponentVariantMap => {
	if (!variant) return {};
	const next = Object.entries(variant)
		.map(([key, value]) => [key.trim(), value.trim()] as const)
		.filter(([key, value]) => key.length > 0 && value.length > 0)
		.sort(([a], [b]) => a.localeCompare(b));
	return Object.fromEntries(next);
};

const getTopLevelSelectionIds = (doc: Document, selectionIds: string[]): string[] => {
	if (selectionIds.length === 0) return [];
	const selectedSet = new Set(selectionIds);
	const parentMap: Record<string, string | null> = {};
	for (const node of Object.values(doc.nodes)) {
		if (!node.children) continue;
		for (const childId of node.children) {
			parentMap[childId] = node.id;
		}
	}
	return selectionIds.filter((id) => {
		let parentId = parentMap[id];
		while (parentId) {
			if (selectedSet.has(parentId)) {
				return false;
			}
			parentId = parentMap[parentId] ?? null;
		}
		return true;
	});
};

const cloneNodeForTemplate = (node: Node): Node => {
	const cloned = deepClone(node);
	return {
		...cloned,
		componentId: undefined,
		componentOverrides: undefined,
		componentSourceNodeId: undefined,
		isComponentMainPreview: undefined,
		variant: normalizeComponentVariant(cloned.variant),
	};
};

const collectSubtree = (
	doc: Document,
	rootId: string,
	offset: { x: number; y: number },
): { nodes: Record<string, Node>; rootId: string } => {
	const nodes: Record<string, Node> = {};
	const queue = [rootId];
	while (queue.length > 0) {
		const id = queue.shift()!;
		const node = doc.nodes[id];
		if (!node) continue;
		const cloned = cloneNodeForTemplate(node);
		if (id === rootId) {
			cloned.position = {
				x: cloned.position.x - offset.x,
				y: cloned.position.y - offset.y,
			};
		}
		nodes[id] = cloned;
		for (const childId of cloned.children ?? []) {
			queue.push(childId);
		}
	}
	return { nodes, rootId };
};

const findSelectionLocalBounds = (doc: Document, ids: string[]): { x: number; y: number; width: number; height: number } => {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const id of ids) {
		const node = doc.nodes[id];
		if (!node) continue;
		minX = Math.min(minX, node.position.x);
		minY = Math.min(minY, node.position.y);
		maxX = Math.max(maxX, node.position.x + node.size.width);
		maxY = Math.max(maxY, node.position.y + node.size.height);
	}
	if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
		return { x: 0, y: 0, width: 1, height: 1 };
	}
	return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

export type ExtractComponentDefinitionOptions = {
	definitionId: string;
	setId: string;
	name: string;
	variant?: ComponentVariantMap;
};

export const extractComponentDefinitionFromSelection = (
	doc: Document,
	selectionIds: string[],
	options: ExtractComponentDefinitionOptions,
): ComponentDefinition | null => {
	const topLevel = getTopLevelSelectionIds(doc, selectionIds).filter((id) => Boolean(doc.nodes[id]));
	if (topLevel.length === 0) return null;
	const normalizedVariant = normalizeComponentVariant(options.variant);

	if (topLevel.length === 1) {
		const selectedNode = doc.nodes[topLevel[0]];
		if (!selectedNode) return null;
		const extracted = collectSubtree(doc, selectedNode.id, selectedNode.position);
		const root = extracted.nodes[extracted.rootId];
		if (!root) return null;
		root.position = { x: 0, y: 0 };
		return {
			id: options.definitionId,
			name: options.name,
			setId: options.setId,
			variant: normalizedVariant,
			templateRootId: extracted.rootId,
			templateNodes: extracted.nodes,
		};
	}

	const bounds = findSelectionLocalBounds(doc, topLevel);
	const templateRootId = `${options.definitionId}__root`;
	const templateNodes: Record<string, Node> = {};
	for (const id of topLevel) {
		const subtree = collectSubtree(doc, id, { x: bounds.x, y: bounds.y });
		for (const [nodeId, node] of Object.entries(subtree.nodes)) {
			templateNodes[nodeId] = node;
		}
	}
	templateNodes[templateRootId] = {
		id: templateRootId,
		type: 'frame',
		name: options.name,
		position: { x: 0, y: 0 },
		size: { width: bounds.width, height: bounds.height },
		children: topLevel,
		visible: true,
		clipContent: false,
	};

	return {
		id: options.definitionId,
		name: options.name,
		setId: options.setId,
		variant: normalizedVariant,
		templateRootId,
		templateNodes,
	};
};

export const buildComponentSetFromDefinition = (
	setId: string,
	name: string,
	definition: ComponentDefinition,
): ComponentSet => {
	const properties: Record<string, string[]> = {};
	for (const [key, value] of Object.entries(definition.variant ?? {})) {
		properties[key] = [value];
	}
	return {
		id: setId,
		name,
		defaultDefinitionId: definition.id,
		definitionIds: [definition.id],
		properties,
	};
};

const matchesVariant = (
	definition: ComponentDefinition,
	variant: ComponentVariantMap,
	propertyKeys: string[],
): boolean => {
	const defVariant = definition.variant ?? {};
	return propertyKeys.every((key) => (defVariant[key] ?? '') === (variant[key] ?? ''));
};

export const resolveComponentDefinition = (
	components: ComponentsLibrary,
	componentId: string,
	variant?: ComponentVariantMap,
): ComponentDefinition | null => {
	const normalized = normalizeComponentVariant(variant);
	const set = components.sets[componentId];
	if (!set) {
		return components.definitions[componentId] ?? null;
	}
	const defaultDefinition = components.definitions[set.defaultDefinitionId];
	if (!defaultDefinition) {
		return null;
	}
	const propertyKeys = Object.keys(set.properties);
	const resolvedVariant: ComponentVariantMap = { ...(defaultDefinition.variant ?? {}), ...normalized };
	for (const definitionId of set.definitionIds) {
		const definition = components.definitions[definitionId];
		if (!definition) continue;
		if (matchesVariant(definition, resolvedVariant, propertyKeys)) {
			return definition;
		}
	}
	return defaultDefinition;
};

const pickOverridePatchFields = (patch: Partial<ComponentOverridePatch>): ComponentOverridePatch => {
	const picked: Partial<ComponentOverridePatch> = {};
	for (const field of COMPONENT_OVERRIDEABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(patch, field)) {
			(picked as Record<ComponentOverrideableField, unknown>)[field] = patch[field];
		}
	}
	return picked as ComponentOverridePatch;
};

export const mergeComponentOverridePatch = (
	existing: ComponentOverridePatch | undefined,
	patch: Partial<ComponentOverridePatch>,
): ComponentOverridePatch | undefined => {
	const picked = pickOverridePatchFields(patch);
	const merged = {
		...(existing ?? {}),
		...picked,
	} as ComponentOverridePatch;
	for (const field of COMPONENT_OVERRIDEABLE_FIELDS) {
		if (merged[field] === undefined) {
			delete (merged as Partial<ComponentOverridePatch>)[field];
		}
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
};

const applyOverridePatch = (node: Node, patch?: ComponentOverridePatch): Node => {
	if (!patch) return node;
	return {
		...node,
		...(patch.text !== undefined ? { text: patch.text } : {}),
		...(patch.fill !== undefined ? { fill: deepClone(patch.fill) } : {}),
		...(patch.fillStyleId !== undefined ? { fillStyleId: patch.fillStyleId } : {}),
		...(patch.stroke !== undefined ? { stroke: deepClone(patch.stroke) } : {}),
		...(patch.image !== undefined ? { image: deepClone(patch.image) } : {}),
		...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
		...(patch.visible !== undefined ? { visible: patch.visible } : {}),
		...(patch.textStyleId !== undefined ? { textStyleId: patch.textStyleId } : {}),
		...(patch.effectStyleId !== undefined ? { effectStyleId: patch.effectStyleId } : {}),
		...(patch.gridStyleId !== undefined ? { gridStyleId: patch.gridStyleId } : {}),
	};
};

export type MaterializedComponentInstance = {
	nodes: Record<string, Node>;
	rootChildIds: string[];
	sourceToRuntimeId: Record<string, string>;
};

export const materializeComponentInstance = (
	definition: ComponentDefinition,
	instanceId: string,
	overrides?: Record<string, ComponentOverridePatch>,
): MaterializedComponentInstance => {
	const nodes: Record<string, Node> = {};
	const sourceToRuntimeId: Record<string, string> = {};
	const queue = [definition.templateRootId];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const sourceId = queue.shift()!;
		if (visited.has(sourceId)) continue;
		visited.add(sourceId);
		const sourceNode = definition.templateNodes[sourceId];
		if (!sourceNode) continue;
		const runtimeId = buildMaterializedNodeId(instanceId, sourceId);
		sourceToRuntimeId[sourceId] = runtimeId;

		const cloned = cloneNodeForTemplate(sourceNode);
		const remappedChildren = (cloned.children ?? []).map((childId) => buildMaterializedNodeId(instanceId, childId));
		let runtimeNode: Node = {
			...cloned,
			id: runtimeId,
			children: remappedChildren,
			componentSourceNodeId: sourceId,
		};
		runtimeNode = applyOverridePatch(runtimeNode, overrides?.[sourceId]);
		nodes[runtimeId] = runtimeNode;

		for (const childId of cloned.children ?? []) {
			queue.push(childId);
		}
	}

	return {
		nodes,
		rootChildIds: [buildMaterializedNodeId(instanceId, definition.templateRootId)],
		sourceToRuntimeId,
	};
};

export const remapRuntimeToSourceOverrides = (
	runtimeOverrides: Record<string, ComponentOverridePatch> | undefined,
	runtimeToSourceId: Record<string, string>,
): Record<string, ComponentOverridePatch> => {
	if (!runtimeOverrides) return {};
	const mapped: Record<string, ComponentOverridePatch> = {};
	for (const [runtimeId, patch] of Object.entries(runtimeOverrides)) {
		const sourceId = runtimeToSourceId[runtimeId];
		if (!sourceId) continue;
		mapped[sourceId] = patch;
	}
	return mapped;
};
