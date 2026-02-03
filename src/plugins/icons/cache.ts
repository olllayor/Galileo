import type { IconRenderParams, IconRenderResult } from './types';

const renderCache = new Map<string, IconRenderResult>();
const inFlight = new Map<string, Promise<IconRenderResult>>();

export const buildRenderCacheKey = (params: IconRenderParams): string => {
	return [params.provider, params.iconId, params.style, params.angle, params.size].join(':');
};

export const getCachedRender = async (
	params: IconRenderParams,
	fetcher: () => Promise<IconRenderResult>,
): Promise<IconRenderResult> => {
	const key = buildRenderCacheKey(params);
	const cached = renderCache.get(key);
	if (cached) return cached;

	const pending = inFlight.get(key);
	if (pending) return pending;

	const promise = fetcher()
		.then((result) => {
			renderCache.set(key, result);
			inFlight.delete(key);
			return result;
		})
		.catch((error) => {
			inFlight.delete(key);
			throw error;
		});

	inFlight.set(key, promise);
	return promise;
};

export const clearRenderCache = (): void => {
	renderCache.clear();
	inFlight.clear();
};
