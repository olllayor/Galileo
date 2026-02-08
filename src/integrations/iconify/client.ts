import { LruCache, getPersistedCollectionCacheEntry, setPersistedCollectionCacheEntry } from './cache';
import {
	ICONIFY_API_HOSTS,
	IconifyClientError,
	type IconifyCollectionResponse,
	type IconifyCollectionsOptions,
	type IconifyCollectionsResponse,
	type IconifyCustomizations,
	type IconifyIconDataResponse,
	type IconifyKeywordsOptions,
	type IconifyKeywordsResponse,
	type IconifyLastModifiedResponse,
	type IconifyRenderSvgResult,
	type IconifySearchOptions,
	type IconifySearchResponse,
} from './types';

const REQUEST_TIMEOUT_MS = 750;
const COLLECTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const searchCache = new LruCache<string, IconifySearchResponse>(80);
const collectionsCache = new LruCache<string, IconifyCollectionsResponse>(40);
const svgCache = new LruCache<string, IconifyRenderSvgResult>(200);

let stickyHost: string | null = null;

const normalizePrefix = (value: string): string => value.trim().toLowerCase();
const normalizeIconName = (value: string): string => value.trim().toLowerCase();

const encodeCsv = (values: string[]): string => values.join(',');

const isTimeoutError = (error: unknown): boolean => {
	return error instanceof DOMException && error.name === 'AbortError';
};

const sortedUnique = (values: string[]): string[] => {
	return Array.from(
		new Set(
			values
				.map((value) => value.trim())
				.filter(Boolean)
				.map((value) => value.toLowerCase()),
		),
	).sort();
};

const assertPrefix = (value: string): string => {
	const normalized = normalizePrefix(value);
	if (!PREFIX_PATTERN.test(normalized)) {
		throw new IconifyClientError('iconify_invalid_params', `Invalid icon set prefix: ${value}`);
	}
	return normalized;
};

const assertIconName = (value: string): string => {
	const normalized = normalizeIconName(value);
	if (!ICON_NAME_PATTERN.test(normalized)) {
		throw new IconifyClientError('iconify_invalid_params', `Invalid icon name: ${value}`);
	}
	return normalized;
};

const assertSearchQuery = (value: string): string => {
	const normalized = value.trim();
	if (!normalized) {
		throw new IconifyClientError('iconify_invalid_params', 'Search query is required');
	}
	return normalized;
};

const mapHttpError = (status: number): IconifyClientError => {
	if (status === 400) {
		return new IconifyClientError('iconify_invalid_params', 'Invalid Iconify request parameters');
	}
	if (status === 404) {
		return new IconifyClientError('iconify_not_found', 'Iconify resource was not found');
	}
	return new IconifyClientError('iconify_unavailable', `Iconify API request failed (${status})`);
};

const stableStringify = (value: unknown): string => {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
};

const createUrl = (host: string, path: string, params: URLSearchParams): string => {
	const query = params.toString();
	return `${host}${path}${query ? `?${query}` : ''}`;
};

const getHostOrder = (): string[] => {
	if (!stickyHost || !ICONIFY_API_HOSTS.includes(stickyHost as (typeof ICONIFY_API_HOSTS)[number])) {
		return [...ICONIFY_API_HOSTS];
	}
	const rest = ICONIFY_API_HOSTS.filter((host) => host !== stickyHost);
	return [stickyHost, ...rest];
};

const fetchWithTimeout = async (
	url: string,
	options: RequestInit & { responseType: 'json' | 'text' },
): Promise<unknown> => {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
		});
		if (!response.ok) {
			throw mapHttpError(response.status);
		}
		if (options.responseType === 'text') {
			return response.text();
		}
		return response.json();
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new IconifyClientError('iconify_timeout', 'Iconify request timed out');
		}
		if (error instanceof IconifyClientError) {
			throw error;
		}
		throw new IconifyClientError('iconify_unavailable', 'Iconify API is unavailable');
	} finally {
		window.clearTimeout(timer);
	}
};

const runWithFailover = async <T>(
	path: string,
	params: URLSearchParams,
	responseType: 'json' | 'text',
): Promise<{ data: T; host: string; url: string }> => {
	const hosts = getHostOrder();
	let lastError: IconifyClientError | null = null;

	for (const host of hosts) {
		const url = createUrl(host, path, params);
		try {
			const data = (await fetchWithTimeout(url, { responseType })) as T;
			stickyHost = host;
			return { data, host, url };
		} catch (error) {
			if (error instanceof IconifyClientError) {
				lastError = error;
				const shouldRetry = error.code === 'iconify_timeout' || error.code === 'iconify_unavailable';
				if (shouldRetry) continue;
				throw error;
			}
			lastError = new IconifyClientError('iconify_unavailable', 'Iconify API is unavailable');
		}
	}

	throw lastError ?? new IconifyClientError('iconify_unavailable', 'Iconify API is unavailable');
};

const buildCacheKey = (path: string, params: URLSearchParams): string => createUrl('cache://iconify', path, params);

const parseFullIconName = (icon: string): { prefix: string; name: string } => {
	const [prefixRaw, nameRaw] = icon.split(':');
	if (!prefixRaw || !nameRaw) {
		throw new IconifyClientError('iconify_invalid_params', `Invalid icon id: ${icon}`);
	}
	return {
		prefix: assertPrefix(prefixRaw),
		name: assertIconName(nameRaw),
	};
};

const collectionCacheSignature = (lastModified: IconifyLastModifiedResponse): string => stableStringify(lastModified);

const getCollectionCacheKey = (options: IconifyCollectionsOptions): string => {
	const params = new URLSearchParams();
	if (options.prefix) params.set('prefix', assertPrefix(options.prefix));
	if (options.prefixes?.length) params.set('prefixes', encodeCsv(sortedUnique(options.prefixes.map(assertPrefix))));
	return buildCacheKey('/collections', params);
};

const extractRequestedPrefixes = (options: IconifyCollectionsOptions): string[] => {
	const values: string[] = [];
	if (options.prefix) values.push(assertPrefix(options.prefix));
	if (options.prefixes?.length) {
		values.push(...options.prefixes.map(assertPrefix));
	}
	return sortedUnique(values);
};

const maybeReadPersistedCollections = (
	key: string,
	lastModifiedSignature: string | null,
): IconifyCollectionsResponse | null => {
	const persisted = getPersistedCollectionCacheEntry<IconifyCollectionsResponse>(key);
	if (!persisted) return null;
	if (Date.now() - persisted.updatedAt > COLLECTION_CACHE_TTL_MS) return null;
	if (lastModifiedSignature && persisted.lastModifiedSignature !== lastModifiedSignature) return null;
	return persisted.value;
};

const persistCollections = (
	key: string,
	value: IconifyCollectionsResponse,
	lastModifiedSignature: string | null,
): void => {
	setPersistedCollectionCacheEntry(key, {
		value,
		updatedAt: Date.now(),
		lastModifiedSignature: lastModifiedSignature ?? undefined,
	});
};

export const iconifyClient = {
	async searchIcons(query: string, options: IconifySearchOptions = {}): Promise<IconifySearchResponse> {
		const normalizedQuery = assertSearchQuery(query);
		const params = new URLSearchParams();
		params.set('query', normalizedQuery);
		params.set('limit', String(Math.min(200, Math.max(1, options.limit ?? 48))));
		if (typeof options.start === 'number' && options.start >= 0) {
			params.set('start', String(Math.floor(options.start)));
		}
		if (options.prefix) {
			params.set('prefix', assertPrefix(options.prefix));
		}
		if (options.prefixes?.length) {
			params.set('prefixes', encodeCsv(sortedUnique(options.prefixes.map(assertPrefix))));
		}
		if (options.category?.trim()) {
			params.set('category', options.category.trim());
		}

		const cacheKey = buildCacheKey('/search', params);
		const cached = searchCache.get(cacheKey);
		if (cached) return cached;

		const { data } = await runWithFailover<IconifySearchResponse>('/search', params, 'json');
		searchCache.set(cacheKey, data);
		return data;
	},

	async listCollections(options: IconifyCollectionsOptions = {}): Promise<IconifyCollectionsResponse> {
		const params = new URLSearchParams();
		if (options.prefix) {
			params.set('prefix', assertPrefix(options.prefix));
		}
		if (options.prefixes?.length) {
			params.set('prefixes', encodeCsv(sortedUnique(options.prefixes.map(assertPrefix))));
		}

		const cacheKey = getCollectionCacheKey(options);
		const cached = collectionsCache.get(cacheKey);
		if (cached) return cached;

		const persistedCandidate = getPersistedCollectionCacheEntry<IconifyCollectionsResponse>(cacheKey);
		let requestedPrefixes = extractRequestedPrefixes(options);
		if (requestedPrefixes.length === 0 && persistedCandidate?.value) {
			requestedPrefixes = sortedUnique(Object.keys(persistedCandidate.value)).slice(0, 512);
		}
		let lastModifiedSignature: string | null = null;
		if (requestedPrefixes.length > 0) {
			const lastModified = await this.getLastModified(requestedPrefixes);
			lastModifiedSignature = collectionCacheSignature(lastModified);
		}

		const persisted = maybeReadPersistedCollections(cacheKey, lastModifiedSignature);
		if (persisted) {
			collectionsCache.set(cacheKey, persisted);
			return persisted;
		}

		const { data } = await runWithFailover<IconifyCollectionsResponse>('/collections', params, 'json');
		collectionsCache.set(cacheKey, data);
		persistCollections(cacheKey, data, lastModifiedSignature);
		return data;
	},

	async getCollection(prefix: string, options: { info?: boolean; chars?: boolean } = {}): Promise<IconifyCollectionResponse> {
		const normalizedPrefix = assertPrefix(prefix);
		const params = new URLSearchParams();
		params.set('prefix', normalizedPrefix);
		if (options.info) params.set('info', '1');
		if (options.chars) params.set('chars', '1');
		const { data } = await runWithFailover<IconifyCollectionResponse>('/collection', params, 'json');
		return data;
	},

	async getIconData(prefix: string, icons: string[]): Promise<IconifyIconDataResponse> {
		const normalizedPrefix = assertPrefix(prefix);
		const normalizedIcons = sortedUnique(icons.map(assertIconName));
		if (normalizedIcons.length === 0) {
			throw new IconifyClientError('iconify_invalid_params', 'At least one icon name is required');
		}
		const params = new URLSearchParams();
		params.set('icons', encodeCsv(normalizedIcons));
		const path = `/${normalizedPrefix}.json`;
		const { data } = await runWithFailover<IconifyIconDataResponse>(path, params, 'json');
		return data;
	},

	async renderSvg(prefix: string, name: string, customizations: IconifyCustomizations = {}): Promise<IconifyRenderSvgResult> {
		const normalizedPrefix = assertPrefix(prefix);
		const normalizedName = assertIconName(name);
		const params = new URLSearchParams();
		if (customizations.color) params.set('color', customizations.color);
		if (customizations.width !== undefined) params.set('width', String(customizations.width));
		if (customizations.height !== undefined) params.set('height', String(customizations.height));
		if (customizations.rotate !== undefined) params.set('rotate', String(customizations.rotate));
		if (customizations.flip) params.set('flip', customizations.flip);
		if (customizations.box !== undefined) params.set('box', customizations.box ? '1' : '0');

		const path = `/${normalizedPrefix}/${normalizedName}.svg`;
		const cacheKey = buildCacheKey(path, params);
		const cached = svgCache.get(cacheKey);
		if (cached) return cached;

		const { data, host, url } = await runWithFailover<string>(path, params, 'text');
		const result: IconifyRenderSvgResult = { svg: data, host, url };
		svgCache.set(cacheKey, result);
		return result;
	},

	async getKeywords(options: IconifyKeywordsOptions = {}): Promise<IconifyKeywordsResponse> {
		const params = new URLSearchParams();
		if (options.prefix) {
			params.set('prefix', assertPrefix(options.prefix));
		}
		if (options.keyword?.trim()) {
			params.set('keyword', options.keyword.trim());
		}
		const { data } = await runWithFailover<IconifyKeywordsResponse>('/keywords', params, 'json');
		return data;
	},

	async getLastModified(prefixes: string[]): Promise<IconifyLastModifiedResponse> {
		const normalizedPrefixes = sortedUnique(prefixes.map(assertPrefix));
		if (normalizedPrefixes.length === 0) {
			return {};
		}
		const params = new URLSearchParams();
		params.set('prefixes', encodeCsv(normalizedPrefixes));
		const { data } = await runWithFailover<IconifyLastModifiedResponse>('/last-modified', params, 'json');
		return data;
	},

	parseIconName: parseFullIconName,
};

export type IconifyClient = typeof iconifyClient;
