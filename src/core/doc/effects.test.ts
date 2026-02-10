import { createDocument } from './types';
import type { Node, ShadowEffect } from './types';
import {
	compileAutoShadow,
	compileShadowEffects,
	mapShadowBlendModeToComposite,
	normalizeShadowEffects,
	resolveEffectVariables,
	resolveShadowOverflow,
} from './effects';

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

	const deterministicAuto: Extract<ShadowEffect, { type: 'auto' }> = {
		type: 'auto',
		elevation: 12,
		angle: 90,
		distance: 20,
		softness: 50,
		color: '#000000',
		opacity: 0.4,
		blendMode: 'normal',
		enabled: true,
	};
	const deterministicCompiled = compileAutoShadow(deterministicAuto);
	assertEqual(failures, 'auto compiles to two effects', deterministicCompiled.length, 2);
	assertEqual(failures, 'auto first generated effect is ambient drop', deterministicCompiled[0]?.type, 'drop');
	assertEqual(failures, 'auto ambient y deterministic', deterministicCompiled[0]?.y, 5.8);
	assertEqual(failures, 'auto key y deterministic', deterministicCompiled[1]?.y, 14.5);
	assertEqual(failures, 'auto key blur deterministic', deterministicCompiled[1]?.blur, 16.3);
	assertEqual(failures, 'auto key spread deterministic', deterministicCompiled[1]?.spread, -1.5);

	const bindingNode = makeFrameNode({
		effectVariables: {
			autoElev: 18,
			autoAngle: '180',
			autoDist: '40',
			autoSoft: '20',
			autoColor: '#112233',
			autoOpacity: '0.5',
			autoBlend: 'multiply',
		},
	});
	const boundAuto: Extract<ShadowEffect, { type: 'auto' }> = {
		type: 'auto',
		elevation: 4,
		angle: 45,
		distance: 8,
		softness: 70,
		color: '#000000',
		opacity: 0.2,
		blendMode: 'normal',
		bindings: {
			elevation: 'autoElev',
			angle: 'autoAngle',
			distance: 'autoDist',
			softness: 'autoSoft',
			color: 'autoColor',
			opacity: 'autoOpacity',
			blendMode: 'autoBlend',
		},
	};
	const resolved = resolveEffectVariables(bindingNode, boundAuto);
	assertEqual(failures, 'auto bound elevation overrides local', resolved.elevation, 18);
	assertEqual(failures, 'auto bound color overrides local', resolved.color, '#112233');
	assertEqual(failures, 'auto bound blend overrides local', resolved.blendMode, 'multiply');

	const invalidBindingNode = makeFrameNode({
		effectVariables: {
			badNum: 'abc',
			badBlend: 'hard-light',
		},
	});
	const invalidBoundAuto: Extract<ShadowEffect, { type: 'auto' }> = {
		...boundAuto,
		elevation: 7,
		blendMode: 'screen',
		bindings: {
			elevation: 'badNum',
			blendMode: 'badBlend',
		},
	};
	const invalidResolved = resolveEffectVariables(invalidBindingNode, invalidBoundAuto);
	assertEqual(failures, 'invalid number binding falls back to local', invalidResolved.elevation, 7);
	assertEqual(failures, 'invalid blend binding falls back to local', invalidResolved.blendMode, 'screen');

	const tokenDoc = createDocument();
	tokenDoc.variables.collections.theme = {
		id: 'theme',
		name: 'Theme',
		modes: [{ id: 'default', name: 'Default' }],
		defaultModeId: 'default',
	};
	tokenDoc.variables.activeModeByCollection.theme = 'default';
	tokenDoc.variables.tokens.autoElev = {
		id: 'autoElev',
		name: 'Auto Elevation',
		collectionId: 'theme',
		type: 'number',
		valuesByMode: {
			default: 22,
		},
	};
	const tokenFallbackNode = makeFrameNode({
		effectVariables: {
			autoElev: 3,
		},
	});
	const tokenBoundAuto: Extract<ShadowEffect, { type: 'auto' }> = {
		...boundAuto,
		elevation: 9,
		bindings: {
			elevation: 'autoElev',
		},
	};
	const tokenResolved = resolveEffectVariables(tokenFallbackNode, tokenBoundAuto, tokenDoc);
	assertEqual(failures, 'token binding resolves before legacy fallback', tokenResolved.elevation, 22);
	const fallbackResolved = resolveEffectVariables(tokenFallbackNode, tokenBoundAuto);
	assertEqual(failures, 'legacy fallback still resolves without document token library', fallbackResolved.elevation, 3);

	const mixedNode = makeFrameNode({
		effects: [
			{
				type: 'drop',
				x: 1,
				y: 1,
				blur: 2,
				spread: 0,
				color: '#000000',
				opacity: 0.3,
				blendMode: 'normal',
			},
			boundAuto,
			{
				type: 'inner',
				x: 0,
				y: 1,
				blur: 2,
				spread: 0,
				color: '#000000',
				opacity: 0.2,
				blendMode: 'normal',
			},
		],
	});
	const compiledMixed = compileShadowEffects(mixedNode);
	assertEqual(failures, 'mixed compile expands auto in-place', compiledMixed.length, 4);
	assertEqual(failures, 'mixed compile starts with original drop', compiledMixed[0]?.type, 'drop');
	assertEqual(failures, 'mixed compile keeps trailing inner', compiledMixed[3]?.type, 'inner');

	return {
		passed: failures.length === 0,
		failures,
	};
};
