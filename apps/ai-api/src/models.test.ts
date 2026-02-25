import { ModelResolverError, resolveImageModel, resolveTextModel } from './models';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

export const runModelResolverUnitTests = (): UnitTestResult => {
	const failures: string[] = [];
	const config = {
		allowedTextModels: new Set(['openai/gpt-5']),
		allowedImageModels: new Set(['google/imagen-4.0-fast-generate-001']),
		defaultTextModel: 'openai/gpt-5',
		defaultImageModel: 'google/imagen-4.0-fast-generate-001',
		startupWarnings: [],
	};

	const textResolved = resolveTextModel(config, undefined);
	assert(failures, 'default text model resolves', textResolved.modelId === 'openai/gpt-5');

	const imageResolved = resolveImageModel(config, undefined);
	assert(
		failures,
		'default image model resolves',
		imageResolved.modelId === 'google/imagen-4.0-fast-generate-001',
	);

	let modalityMismatch = false;
	try {
		resolveTextModel(config, 'google/imagen-4.0-generate-001');
	} catch (error) {
		modalityMismatch = error instanceof ModelResolverError && error.code === 'modality_mismatch';
	}
	assert(failures, 'image model rejected for text endpoint', modalityMismatch);

	return {
		passed: failures.length === 0,
		failures,
	};
};

