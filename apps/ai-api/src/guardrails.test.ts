import { commandDraftSchema, countDraftCommands } from './contracts';
import { validateDraftGuardrails } from './guardrails';

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

	return {
		passed: failures.length === 0,
		failures,
	};
};
