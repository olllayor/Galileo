import type { Node, ShadowEffect } from './types';
import { mapShadowBlendModeToComposite, normalizeShadowEffects, resolveShadowOverflow } from './effects';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const makeFrameNode = (overrides: Partial<Node> = {}): Node => ({
	id: 'frame',
	type: 'frame',
	position: { x: 0, y: 0 },
	size: { width: 100, height: 100 },
	children: [],
	visible: true,
	...overrides,
});

export const runEffectsUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const legacyClipped = resolveShadowOverflow(makeFrameNode({ clipContent: true }));
	assertEqual(failures, 'legacy clipContent true maps to clipped', legacyClipped, 'clipped');

	const explicitClipContentOnly = resolveShadowOverflow(makeFrameNode({ shadowOverflow: 'clip-content-only' }));
	assertEqual(failures, 'explicit clip-content-only retained', explicitClipContentOnly, 'clip-content-only');

	const rawEffects: ShadowEffect[] = [
		{
			type: 'drop',
			x: 0,
			y: 8,
			blur: -4,
			spread: 0,
			color: '#000000',
			opacity: 2,
		},
	];
	const normalized = normalizeShadowEffects(rawEffects);
	assertEqual(failures, 'normalized blur is clamped to >=0', normalized[0]?.blur, 0);
	assertEqual(failures, 'normalized opacity is clamped to <=1', normalized[0]?.opacity, 1);
	assertEqual(failures, 'normalized default blend mode', normalized[0]?.blendMode, 'normal');

	assertEqual(failures, 'blend mode normal mapping', mapShadowBlendModeToComposite('normal'), 'source-over');
	assertEqual(failures, 'blend mode multiply mapping', mapShadowBlendModeToComposite('multiply'), 'multiply');
	assertEqual(failures, 'blend mode screen mapping', mapShadowBlendModeToComposite('screen'), 'screen');
	assertEqual(failures, 'blend mode overlay mapping', mapShadowBlendModeToComposite('overlay'), 'overlay');

	return {
		passed: failures.length === 0,
		failures,
	};
};

