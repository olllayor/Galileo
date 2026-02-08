type PersistedCollectionCacheEntry<T> = {
	value: T;
	updatedAt: number;
	lastModifiedSignature?: string;
};

const COLLECTION_CACHE_STORAGE_KEY = 'galileo.iconify.collection-cache.v1';

export class LruCache<K, V> {
	private readonly max: number;
	private readonly map = new Map<K, V>();

	constructor(max = 100) {
		this.max = Math.max(1, max);
	}

	get(key: K): V | undefined {
		const value = this.map.get(key);
		if (value === undefined) return undefined;
		this.map.delete(key);
		this.map.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		}
		this.map.set(key, value);
		if (this.map.size <= this.max) return;
		const oldestKey = this.map.keys().next().value;
		if (oldestKey !== undefined) {
			this.map.delete(oldestKey);
		}
	}

	clear(): void {
		this.map.clear();
	}
}

const canUseLocalStorage = (): boolean => {
	try {
		return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
	} catch {
		return false;
	}
};

const readCollectionCacheStore = <T>(): Record<string, PersistedCollectionCacheEntry<T>> => {
	if (!canUseLocalStorage()) return {};
	try {
		const raw = window.localStorage.getItem(COLLECTION_CACHE_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, PersistedCollectionCacheEntry<T>>;
		return typeof parsed === 'object' && parsed ? parsed : {};
	} catch {
		return {};
	}
};

const writeCollectionCacheStore = <T>(store: Record<string, PersistedCollectionCacheEntry<T>>): void => {
	if (!canUseLocalStorage()) return;
	try {
		window.localStorage.setItem(COLLECTION_CACHE_STORAGE_KEY, JSON.stringify(store));
	} catch {
		// Ignore quota or serialization errors.
	}
};

export const getPersistedCollectionCacheEntry = <T>(key: string): PersistedCollectionCacheEntry<T> | null => {
	const store = readCollectionCacheStore<T>();
	return store[key] ?? null;
};

export const setPersistedCollectionCacheEntry = <T>(
	key: string,
	entry: PersistedCollectionCacheEntry<T>,
): void => {
	const store = readCollectionCacheStore<T>();
	store[key] = entry;
	writeCollectionCacheStore(store);
};

