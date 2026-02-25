import type { Patch } from 'immer';
import * as Y from 'yjs';
import { toYValue, type YContainer } from './yValue';

type PathSegment = string | number;

const asIndex = (value: PathSegment): number => {
	if (typeof value === 'number') return value;
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : 0;
};

const toMapKey = (value: PathSegment): string => String(value);

const setChild = (container: YContainer, segment: PathSegment, value: unknown): void => {
	if (container instanceof Y.Map) {
		if (value === undefined) {
			container.delete(toMapKey(segment));
			return;
		}
		container.set(toMapKey(segment), toYValue(value));
		return;
	}
	const index = asIndex(segment);
	if (index < 0) return;
	if (index < container.length) {
		container.delete(index, 1);
		container.insert(index, [toYValue(value)]);
		return;
	}
	if (index === container.length) {
		container.insert(index, [toYValue(value)]);
	}
};

const getChild = (container: YContainer, segment: PathSegment): unknown => {
	if (container instanceof Y.Map) {
		return container.get(toMapKey(segment));
	}
	const index = asIndex(segment);
	if (index < 0 || index >= container.length) return undefined;
	return container.get(index);
};

const ensureContainer = (container: YContainer, segment: PathSegment, nextSegment: PathSegment): YContainer => {
	const existing = getChild(container, segment);
	if (existing instanceof Y.Map || existing instanceof Y.Array) {
		return existing;
	}
	const nextContainer: YContainer = typeof nextSegment === 'number' ? new Y.Array<unknown>() : new Y.Map<unknown>();
	setChild(container, segment, nextContainer);
	const resolved = getChild(container, segment);
	if (resolved instanceof Y.Map || resolved instanceof Y.Array) {
		return resolved;
	}
	return nextContainer;
};

const resolveParent = (root: Y.Map<unknown>, path: PathSegment[]): { parent: YContainer; key: PathSegment } | null => {
	if (path.length === 0) return null;
	let current: YContainer = root;
	for (let i = 0; i < path.length - 1; i += 1) {
		current = ensureContainer(current, path[i], path[i + 1]);
	}
	return { parent: current, key: path[path.length - 1] };
};

const removeAtPath = (root: Y.Map<unknown>, path: PathSegment[]): void => {
	const resolved = resolveParent(root, path);
	if (!resolved) return;
	const { parent, key } = resolved;
	if (parent instanceof Y.Map) {
		parent.delete(toMapKey(key));
		return;
	}
	const index = asIndex(key);
	if (index >= 0 && index < parent.length) {
		parent.delete(index, 1);
	}
};

const addAtPath = (root: Y.Map<unknown>, path: PathSegment[], value: unknown): void => {
	const resolved = resolveParent(root, path);
	if (!resolved) return;
	const { parent, key } = resolved;
	if (parent instanceof Y.Map) {
		if (value === undefined) {
			parent.delete(toMapKey(key));
			return;
		}
		parent.set(toMapKey(key), toYValue(value));
		return;
	}
	const index = asIndex(key);
	if (index < 0) return;
	const yValue = toYValue(value);
	if (index <= parent.length) {
		parent.insert(index, [yValue]);
	}
};

const replaceAtPath = (root: Y.Map<unknown>, path: PathSegment[], value: unknown): void => {
	const resolved = resolveParent(root, path);
	if (!resolved) return;
	const { parent, key } = resolved;
	if (parent instanceof Y.Map) {
		if (value === undefined) {
			parent.delete(toMapKey(key));
			return;
		}
		parent.set(toMapKey(key), toYValue(value));
		return;
	}
	const index = asIndex(key);
	if (index < 0 || index > parent.length) return;
	if (index === parent.length) {
		parent.insert(index, [toYValue(value)]);
		return;
	}
	parent.delete(index, 1);
	parent.insert(index, [toYValue(value)]);
};

export const applyImmerPatchToYDoc = (root: Y.Map<unknown>, patch: Patch): void => {
	const path = patch.path as PathSegment[];
	if (patch.op === 'remove') {
		removeAtPath(root, path);
		return;
	}
	if (patch.op === 'add') {
		addAtPath(root, path, patch.value);
		return;
	}
	replaceAtPath(root, path, patch.value);
};

export const applyImmerPatchesToYDoc = (root: Y.Map<unknown>, patches: Patch[]): void => {
	for (const patch of patches) {
		applyImmerPatchToYDoc(root, patch);
	}
};
