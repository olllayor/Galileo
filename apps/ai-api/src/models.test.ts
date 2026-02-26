import { ModelResolverError, loadModelConfig, resolveImageModel, resolveTextModel } from './models';

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

	const mutableEnv = process.env as Record<string, string | undefined>;
	const previousEnv = {
		NODE_ENV: mutableEnv.NODE_ENV,
		VERCEL_ENV: mutableEnv.VERCEL_ENV,
		ALLOWED_TEXT_MODELS: mutableEnv.ALLOWED_TEXT_MODELS,
		ALLOWED_IMAGE_MODELS: mutableEnv.ALLOWED_IMAGE_MODELS,
		DEFAULT_TEXT_MODEL: mutableEnv.DEFAULT_TEXT_MODEL,
		DEFAULT_IMAGE_MODEL: mutableEnv.DEFAULT_IMAGE_MODEL,
		AI_MODEL: mutableEnv.AI_MODEL,
	};
	try {
		mutableEnv.NODE_ENV = 'production';
		mutableEnv.VERCEL_ENV = 'production';
		mutableEnv.ALLOWED_TEXT_MODELS = 'openai/gpt-5,example/unknown-model';
		mutableEnv.ALLOWED_IMAGE_MODELS = 'google/imagen-4.0-fast-generate-001';
		mutableEnv.DEFAULT_TEXT_MODEL = 'openai/gpt-5';
		mutableEnv.DEFAULT_IMAGE_MODEL = 'google/imagen-4.0-fast-generate-001';
		mutableEnv.AI_MODEL = '';

		let productionAllowlistRejected = false;
		try {
			loadModelConfig();
		} catch (error) {
			productionAllowlistRejected = error instanceof ModelResolverError && error.code === 'server_not_configured';
		}
		assert(failures, 'production rejects non-curated allowlisted model IDs', productionAllowlistRejected);
	} finally {
		mutableEnv.NODE_ENV = previousEnv.NODE_ENV;
		mutableEnv.VERCEL_ENV = previousEnv.VERCEL_ENV;
		mutableEnv.ALLOWED_TEXT_MODELS = previousEnv.ALLOWED_TEXT_MODELS;
		mutableEnv.ALLOWED_IMAGE_MODELS = previousEnv.ALLOWED_IMAGE_MODELS;
		mutableEnv.DEFAULT_TEXT_MODEL = previousEnv.DEFAULT_TEXT_MODEL;
		mutableEnv.DEFAULT_IMAGE_MODEL = previousEnv.DEFAULT_IMAGE_MODEL;
		mutableEnv.AI_MODEL = previousEnv.AI_MODEL;
	}

	return {
		passed: failures.length === 0,
		failures,
	};
};
