import { recordAutoShadowCompileDuration } from './performance';
import type { Node, RenderableShadowEffect, ShadowBlendMode, ShadowEffect } from './types';

export type ShadowOverflow = 'visible' | 'clipped' | 'clip-content-only';

const DEFAULT_BLEND_MODE: ShadowBlendMode = 'normal';
const DEFAULT_AUTO_COLOR = '#000000';

type AutoShadowResolvedValues = {
	elevation: number;
	angle: number;
	distance: number;
	softness: number;
	color: string;
	opacity: number;
	blendMode: ShadowBlendMode;
};

const isShadowOverflow = (value: unknown): value is ShadowOverflow => {
	return value === 'visible' || value === 'clipped' || value === 'clip-content-only';
};

const isShadowBlendMode = (value: unknown): value is ShadowBlendMode => {
	return value === 'normal' || value === 'multiply' || value === 'screen' || value === 'overlay';
};

const isRenderableShadowEffect = (effect: ShadowEffect): effect is RenderableShadowEffect => {
	return effect.type === 'drop' || effect.type === 'inner';
};

const clamp = (value: number, min: number, max: number): number => {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
};

const round1 = (value: number): number => {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 10) / 10;
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

export const normalizeShadowEffect = (effect: RenderableShadowEffect): RenderableShadowEffect => {
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

export const normalizeShadowEffects = (effects: ShadowEffect[] | undefined): RenderableShadowEffect[] => {
	if (!effects || effects.length === 0) return [];
	return effects.filter(isRenderableShadowEffect).map(normalizeShadowEffect);
};

const readBoundValue = (node: Node, key: string | undefined): string | number | undefined => {
	if (!key || !node.effectVariables) return undefined;
	return node.effectVariables[key];
};

const readBoundNumber = (
	node: Node,
	key: string | undefined,
	fallback: number,
	min: number,
	max: number,
): number => {
	const raw = readBoundValue(node, key);
	if (typeof raw === 'number') {
		return clamp(raw, min, max);
	}
	if (typeof raw === 'string') {
		const parsed = Number(raw.trim());
		if (Number.isFinite(parsed)) {
			return clamp(parsed, min, max);
		}
	}
	return clamp(fallback, min, max);
};

const readBoundColor = (node: Node, key: string | undefined, fallback: string): string => {
	const raw = readBoundValue(node, key);
	if (typeof raw === 'string' && raw.trim()) {
		return raw;
	}
	return fallback || DEFAULT_AUTO_COLOR;
};

const readBoundBlendMode = (node: Node, key: string | undefined, fallback: ShadowBlendMode): ShadowBlendMode => {
	const raw = readBoundValue(node, key);
	if (typeof raw === 'string' && isShadowBlendMode(raw)) {
		return raw;
	}
	return fallback;
};

export const resolveEffectVariables = (
	node: Node,
	effect: Extract<ShadowEffect, { type: 'auto' }>,
): AutoShadowResolvedValues => {
	const bindings = effect.bindings ?? {};
	return {
		elevation: readBoundNumber(node, bindings.elevation, effect.elevation, 0, 24),
		angle: readBoundNumber(node, bindings.angle, effect.angle, -360, 360),
		distance: readBoundNumber(node, bindings.distance, effect.distance, 0, 80),
		softness: readBoundNumber(node, bindings.softness, effect.softness, 0, 100),
		color: readBoundColor(node, bindings.color, effect.color),
		opacity: readBoundNumber(node, bindings.opacity, effect.opacity, 0, 1),
		blendMode: readBoundBlendMode(node, bindings.blendMode, effect.blendMode ?? DEFAULT_BLEND_MODE),
	};
};

export const compileAutoShadow = (
	effect: Extract<ShadowEffect, { type: 'auto' }>,
	resolved?: AutoShadowResolvedValues,
): RenderableShadowEffect[] => {
	const values = resolved ?? {
		elevation: clamp(effect.elevation, 0, 24),
		angle: clamp(effect.angle, -360, 360),
		distance: clamp(effect.distance, 0, 80),
		softness: clamp(effect.softness, 0, 100),
		color: effect.color || DEFAULT_AUTO_COLOR,
		opacity: clamp(effect.opacity, 0, 1),
		blendMode: effect.blendMode ?? DEFAULT_BLEND_MODE,
	};

	const e = clamp(values.elevation, 0, 24);
	const n = e / 24;
	const s = clamp(values.softness, 0, 100) / 100;
	const theta = (values.angle * Math.PI) / 180;
	const d = clamp(values.distance, 0, 80);

	const keyX = round1(Math.cos(theta) * d * (0.45 + 0.55 * n));
	const keyY = round1(Math.sin(theta) * d * (0.45 + 0.55 * n));
	const keyBlur = round1((2 + 22 * n) * (0.5 + 1.5 * s));
	const keySpread = round1((0.25 - s) * 6);

	const ambientX = round1(keyX * 0.18);
	const ambientY = round1(Math.max(0, keyY * 0.35 + 1.5 * n));
	const ambientBlur = round1(keyBlur * 1.45);
	const ambientSpread = round1((0.5 - s) * 2);

	const keyOpacity = clamp(values.opacity * 0.68, 0, 1);
	const ambientOpacity = clamp(values.opacity * 0.34, 0, 1);

	const base = {
		color: values.color || DEFAULT_AUTO_COLOR,
		blendMode: values.blendMode,
		enabled: effect.enabled !== false,
	};
	const ambient: RenderableShadowEffect = {
		type: 'drop',
		x: ambientX,
		y: ambientY,
		blur: ambientBlur,
		spread: ambientSpread,
		opacity: ambientOpacity,
		...base,
	};
	const key: RenderableShadowEffect = {
		type: 'drop',
		x: keyX,
		y: keyY,
		blur: keyBlur,
		spread: keySpread,
		opacity: keyOpacity,
		...base,
	};

	return [normalizeShadowEffect(ambient), normalizeShadowEffect(key)];
};

export const compileShadowEffects = (node: Node): RenderableShadowEffect[] => {
	const effects = node.effects ?? [];
	if (effects.length === 0) return [];

	const compiled: RenderableShadowEffect[] = [];
	let autoCompileMs = 0;

	for (const effect of effects) {
		if (effect.type === 'auto') {
			const started = performance.now();
			const resolved = resolveEffectVariables(node, effect);
			compiled.push(...compileAutoShadow(effect, resolved));
			autoCompileMs += performance.now() - started;
			continue;
		}
		compiled.push(normalizeShadowEffect(effect));
	}

	if (autoCompileMs > 0) {
		recordAutoShadowCompileDuration(autoCompileMs);
	}

	return compiled;
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
