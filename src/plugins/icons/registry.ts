import type { IconProvider, IconRenderParams, IconRenderResult } from './types';
import { getCachedRender } from './cache';
import { create3dIconsProvider } from './providers/3dicons';

const providers = new Map<string, IconProvider>();

const registerProvider = (provider: IconProvider): void => {
	providers.set(provider.id, provider);
};

registerProvider(create3dIconsProvider());

export const listProviders = (): IconProvider[] => {
	return Array.from(providers.values());
};

export const getProvider = (id: string): IconProvider | null => {
	return providers.get(id) ?? null;
};

export const resolveProvider = (id?: string): IconProvider | null => {
	if (id && providers.has(id)) return providers.get(id) ?? null;
	return providers.get('3dicons') ?? null;
};

export const searchIcons = async (query?: string, providerId?: string) => {
	const provider = resolveProvider(providerId);
	if (!provider) {
		return [];
	}
	return provider.search(query);
};

export const getIconVariants = async (iconId: string, providerId?: string) => {
	const provider = resolveProvider(providerId);
	if (!provider) {
		return [];
	}
	return provider.getVariants(iconId);
};

export const renderIcon = async (params: IconRenderParams): Promise<IconRenderResult> => {
	const provider = resolveProvider(params.provider);
	if (!provider) {
		throw new Error(`Unknown provider ${params.provider}`);
	}

	return getCachedRender(params, () => provider.render(params));
};
