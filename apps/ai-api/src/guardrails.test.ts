import { commandDraftSchema, countDraftCommands } from './contracts';
import {
	getProductionSecurityIssue,
	parseAllowedOrigins,
	pickCorsOrigin,
	validateDraftGuardrails,
} from './guardrails';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

export const runAIGuardrailUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const valid = {
		type: 'batch',
		commands: [
			{ type: 'setProps', id: 'n1', props: { text: 'Title', fontWeight: 'bold' } },
			{ type: 'moveNode', id: 'n1', position: { x: 10, y: 20 } },
		],
	};
	const validParsed = commandDraftSchema.safeParse(valid);
	assert(failures, 'valid draft schema parse', validParsed.success);
	if (validParsed.success) {
		assert(failures, 'counts nested batch commands', countDraftCommands([validParsed.data]) === 3);
		const issues = validateDraftGuardrails([validParsed.data], ['n1']);
		assert(failures, 'valid draft has no guardrail issues', issues.length === 0);
	}

	const forbidden = {
		type: 'setProps',
		id: 'n1',
		props: {
			children: ['x'],
		},
	};
	const forbiddenParsed = commandDraftSchema.safeParse(forbidden);
	assert(failures, 'forbidden draft schema parse', forbiddenParsed.success);
	if (forbiddenParsed.success) {
		const issues = validateDraftGuardrails([forbiddenParsed.data], ['n1']);
		assert(failures, 'forbidden setProps key blocked', issues.some((issue) => issue.includes('forbidden')));
	}

	const outOfScope = {
		type: 'deleteNode',
		id: 'n2',
	};
	const outOfScopeParsed = commandDraftSchema.safeParse(outOfScope);
	assert(failures, 'out-of-scope draft schema parse', outOfScopeParsed.success);
	if (outOfScopeParsed.success) {
		const issues = validateDraftGuardrails([outOfScopeParsed.data], ['n1']);
		assert(failures, 'out-of-scope node blocked', issues.some((issue) => issue.includes('must be selected')));
	}

	const allowlist = parseAllowedOrigins('https://app.example.com/, https://galileo.dev:3010, javascript:alert(1)');
	assert(failures, 'normalizes allowed origins', allowlist.has('https://app.example.com'));
	assert(failures, 'drops invalid origins', !allowlist.has('javascript:alert(1)'));
	assert(
		failures,
		'picks matching normalized origin',
		pickCorsOrigin('https://app.example.com/', allowlist) === 'https://app.example.com',
	);
	assert(
		failures,
		'blocks unknown origin',
		pickCorsOrigin('https://evil.example.com', allowlist) === null,
	);

	assert(
		failures,
		'requires allowlist in production',
		getProductionSecurityIssue(new Set(), 'secret', 'production', 'production')
			=== 'allowed_origins_required_in_production',
	);
	assert(
		failures,
		'blocks wildcard in production',
		getProductionSecurityIssue(new Set(['*']), 'secret', 'production', 'production')
			=== 'wildcard_origin_not_allowed_in_production',
	);
	assert(
		failures,
		'requires client key in production',
		getProductionSecurityIssue(new Set(['https://app.example.com']), '', 'production', 'production')
			=== 'client_key_required_in_production',
	);

	return {
		passed: failures.length === 0,
		failures,
	};
};
