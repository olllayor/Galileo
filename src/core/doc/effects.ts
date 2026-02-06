import type { Node, ShadowBlendMode, ShadowEffect } from './types';

export type ShadowOverflow = 'visible' | 'clipped' | 'clip-content-only';

const DEFAULT_BLEND_MODE: ShadowBlendMode = 'normal';

const isShadowOverflow = (value: unknown): value is ShadowOverflow => {
	return value === 'visible' || value === 'clipped' || value === 'clip-content-only';
};

export const resolveShadowOverflow = (node: Node): ShadowOverflow => {
	if (isShadowOverflow(node.shadowOverflow)) {
		return node.shadowOverflow;
	}
	if (node.type === 'frame' && node.clipContent) {
		return 'clipped';
	}
	return 'visible';
};

export const shouldClipFrameContent = (node: Node): boolean => {
	if (node.type !== 'frame') return false;
	const mode = resolveShadowOverflow(node);
	return mode === 'clipped' || mode === 'clip-content-only';
};

export const shouldClipFrameOwnEffects = (node: Node): boolean => {
	if (node.type !== 'frame') return false;
	return resolveShadowOverflow(node) === 'clipped';
};

export const normalizeShadowEffect = (effect: ShadowEffect): ShadowEffect => {
	const blur = Number.isFinite(effect.blur) ? Math.max(0, effect.blur) : 0;
	const spread = Number.isFinite(effect.spread) ? effect.spread : 0;
	const opacity = Number.isFinite(effect.opacity) ? Math.max(0, Math.min(1, effect.opacity)) : 1;
	const blendMode = effect.blendMode ?? DEFAULT_BLEND_MODE;

	return {
		...effect,
		blur,
		spread,
		opacity,
		blendMode,
		enabled: effect.enabled !== false,
	};
};

export const normalizeShadowEffects = (effects: ShadowEffect[] | undefined): ShadowEffect[] => {
	if (!effects || effects.length === 0) return [];
	return effects.map(normalizeShadowEffect);
};

export const mapShadowBlendModeToComposite = (blendMode: ShadowBlendMode | undefined): GlobalCompositeOperation => {
	switch (blendMode) {
		case 'multiply':
			return 'multiply';
		case 'screen':
			return 'screen';
		case 'overlay':
			return 'overlay';
		case 'normal':
		default:
			return 'source-over';
	}
};

