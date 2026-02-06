import { mapShadowBlendModeToComposite } from '../core/doc';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

export const runShadowBlendUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	assertEqual(failures, 'normal maps to source-over', mapShadowBlendModeToComposite('normal'), 'source-over');
	assertEqual(failures, 'multiply maps to multiply', mapShadowBlendModeToComposite('multiply'), 'multiply');
	assertEqual(failures, 'screen maps to screen', mapShadowBlendModeToComposite('screen'), 'screen');
	assertEqual(failures, 'overlay maps to overlay', mapShadowBlendModeToComposite('overlay'), 'overlay');
	assertEqual(failures, 'undefined maps to source-over', mapShadowBlendModeToComposite(undefined), 'source-over');

	return {
		passed: failures.length === 0,
		failures,
	};
};

