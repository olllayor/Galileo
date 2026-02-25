import * as Y from 'yjs';

export type YContainer = Y.Map<unknown> | Y.Array<unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (!value || typeof value !== 'object') return false;
	if (Array.isArray(value)) return false;
	return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

export const toYValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		const arr = new Y.Array<unknown>();
		arr.insert(0, value.map((entry) => toYValue(entry)));
		return arr;
	}
	if (isPlainObject(value)) {
		const map = new Y.Map<unknown>();
		for (const [key, entry] of Object.entries(value)) {
			if (entry === undefined) continue;
			map.set(key, toYValue(entry));
		}
		return map;
	}
	if (value === undefined) {
		return null;
	}
	return value;
};

export const fromYValue = (value: unknown): unknown => {
	if (value instanceof Y.Array) {
		return value.toArray().map((entry) => fromYValue(entry));
	}
	if (value instanceof Y.Map) {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of value.entries()) {
			out[key] = fromYValue(entry);
		}
		return out;
	}
	return value;
};
