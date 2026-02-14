import { invoke } from '@tauri-apps/api/core';

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const hasTauriRuntime = (): boolean => {
	if (typeof window === 'undefined') return false;
	return isRecord((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
};

const localFallbackStorage = {
	getItem: (key: string): string | null => {
		if (typeof window === 'undefined') return null;
		return window.localStorage.getItem(key);
	},
	setItem: (key: string, value: string) => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(key, value);
	},
	removeItem: (key: string) => {
		if (typeof window === 'undefined') return;
		window.localStorage.removeItem(key);
	},
};

const secureGet = async (key: string): Promise<string | null> => {
	if (!hasTauriRuntime()) {
		return localFallbackStorage.getItem(key);
	}
	try {
		return await invoke<string | null>('auth_secret_get', { args: { key } });
	} catch {
		return localFallbackStorage.getItem(key);
	}
};

const secureSet = async (key: string, value: string): Promise<void> => {
	if (!hasTauriRuntime()) {
		localFallbackStorage.setItem(key, value);
		return;
	}
	try {
		await invoke('auth_secret_set', { args: { key, value } });
	} catch {
		localFallbackStorage.setItem(key, value);
	}
};

const secureRemove = async (key: string): Promise<void> => {
	if (!hasTauriRuntime()) {
		localFallbackStorage.removeItem(key);
		return;
	}
	try {
		await invoke('auth_secret_remove', { args: { key } });
	} catch {
		localFallbackStorage.removeItem(key);
	}
};

export const convexTokenStorage = {
	getItem: async (key: string): Promise<string | null> => secureGet(key),
	setItem: async (key: string, value: string): Promise<void> => secureSet(key, value),
	removeItem: async (key: string): Promise<void> => secureRemove(key),
};

const escapeNamespace = (namespace: string) => namespace.replace(/[^a-zA-Z0-9]/g, '');

export const getNamespacedAuthStorageKey = (key: string, namespace: string): string => {
	return `${key}_${escapeNamespace(namespace)}`;
};
