const CURATED_TEXT_MODELS = [
	'openai/gpt-5',
	'openai/gpt-5-chat-latest',
	'openai/gpt-4.1',
	'openai/gpt-4.1-mini',
	'anthropic/claude-4.5-sonnet',
	'anthropic/claude-sonnet-4',
	'google/gemini-2.5-pro',
	'google/gemini-2.5-flash',
] as const;

const CURATED_IMAGE_MODELS = [
	'google/imagen-4.0-generate-001',
	'google/imagen-4.0-fast-generate-001',
	'google/gemini-2.5-flash-image-preview',
	'black-forest-labs/flux-kontext-max',
] as const;

const CURATED_TEXT_SET = new Set<string>(CURATED_TEXT_MODELS);
const CURATED_IMAGE_SET = new Set<string>(CURATED_IMAGE_MODELS);

type ModelModality = 'text' | 'image';

export type ModelResolverErrorCode =
	| 'unsupported_model'
	| 'modality_mismatch'
	| 'model_not_allowed'
	| 'server_not_configured';

export class ModelResolverError extends Error {
	readonly code: ModelResolverErrorCode;
	readonly status: number;

	constructor(code: ModelResolverErrorCode, message: string, status = 422) {
		super(message);
		this.name = 'ModelResolverError';
		this.code = code;
		this.status = status;
	}
}

type ModelConfig = {
	allowedTextModels: Set<string>;
	allowedImageModels: Set<string>;
	defaultTextModel: string;
	defaultImageModel: string;
	startupWarnings: string[];
};

const parseModelList = (value: string | undefined): Set<string> => {
	if (!value) return new Set();
	return new Set(
		value
			.split(',')
			.map((item) => item.trim())
			.filter((item) => item.length > 0),
	);
};

const assertConfigured = (condition: boolean, message: string): void => {
	if (!condition) {
		throw new ModelResolverError('server_not_configured', message, 500);
	}
};

const isProductionRuntime = (): boolean => {
	return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
};

const assertAllowlistWithinCuratedSet = (
	allowlist: Set<string>,
	curatedSet: Set<string>,
	variableName: string,
): void => {
	const disallowed = Array.from(allowlist).filter((modelId) => !curatedSet.has(modelId));
	assertConfigured(
		disallowed.length === 0,
		`${variableName} contains unsupported model IDs: ${disallowed.join(', ')}`,
	);
};

const resolveDefaultModel = (
	defaultModel: string | undefined,
	legacyAiModel: string | undefined,
	modality: ModelModality,
	startupWarnings: string[],
): string => {
	const candidate = defaultModel?.trim();
	if (candidate) return candidate;
	if (modality === 'text' && legacyAiModel?.trim()) {
		startupWarnings.push('DEFAULT_TEXT_MODEL missing; using deprecated AI_MODEL fallback.');
		return legacyAiModel.trim();
	}
	assertConfigured(false, `DEFAULT_${modality.toUpperCase()}_MODEL is required.`);
	return '';
};

export const loadModelConfig = (): ModelConfig => {
	const startupWarnings: string[] = [];
	const allowedTextModels = parseModelList(process.env.ALLOWED_TEXT_MODELS);
	const allowedImageModels = parseModelList(process.env.ALLOWED_IMAGE_MODELS);

	assertConfigured(allowedTextModels.size > 0, 'ALLOWED_TEXT_MODELS is required.');
	assertConfigured(allowedImageModels.size > 0, 'ALLOWED_IMAGE_MODELS is required.');
	if (isProductionRuntime()) {
		assertAllowlistWithinCuratedSet(allowedTextModels, CURATED_TEXT_SET, 'ALLOWED_TEXT_MODELS');
		assertAllowlistWithinCuratedSet(allowedImageModels, CURATED_IMAGE_SET, 'ALLOWED_IMAGE_MODELS');
	}

	const defaultTextModel = resolveDefaultModel(
		process.env.DEFAULT_TEXT_MODEL,
		process.env.AI_MODEL,
		'text',
		startupWarnings,
	);
	const defaultImageModel = resolveDefaultModel(
		process.env.DEFAULT_IMAGE_MODEL,
		undefined,
		'image',
		startupWarnings,
	);

	assertConfigured(allowedTextModels.has(defaultTextModel), 'DEFAULT_TEXT_MODEL must be in ALLOWED_TEXT_MODELS.');
	assertConfigured(allowedImageModels.has(defaultImageModel), 'DEFAULT_IMAGE_MODEL must be in ALLOWED_IMAGE_MODELS.');

	return {
		allowedTextModels,
		allowedImageModels,
		defaultTextModel,
		defaultImageModel,
		startupWarnings,
	};
};

const ensureModelAllowed = (requested: string, modality: ModelModality, config: ModelConfig): void => {
	const trimmed = requested.trim();
	if (trimmed.length === 0) {
		throw new ModelResolverError('unsupported_model', 'modelId must not be empty.');
	}

	const allowlist = modality === 'text' ? config.allowedTextModels : config.allowedImageModels;
	const oppositeAllowlist = modality === 'text' ? config.allowedImageModels : config.allowedTextModels;
	const curatedSet = modality === 'text' ? CURATED_TEXT_SET : CURATED_IMAGE_SET;
	const oppositeCuratedSet = modality === 'text' ? CURATED_IMAGE_SET : CURATED_TEXT_SET;

	if (allowlist.has(trimmed)) return;
	if (oppositeAllowlist.has(trimmed) || oppositeCuratedSet.has(trimmed)) {
		throw new ModelResolverError('modality_mismatch', `${trimmed} cannot be used for ${modality} requests.`);
	}
	if (curatedSet.has(trimmed)) {
		throw new ModelResolverError('model_not_allowed', `${trimmed} is not enabled for this deployment.`);
	}
	throw new ModelResolverError('unsupported_model', `${trimmed} is not a supported model.`);
};

export const resolveTextModel = (
	config: ModelConfig,
	requestedModelId: string | undefined,
): { modelId: string; warnings: string[] } => {
	const warnings = [...config.startupWarnings];
	if (!requestedModelId) {
		return { modelId: config.defaultTextModel, warnings };
	}
	ensureModelAllowed(requestedModelId, 'text', config);
	return { modelId: requestedModelId.trim(), warnings };
};

export const resolveImageModel = (
	config: ModelConfig,
	requestedModelId: string | undefined,
): { modelId: string; warnings: string[] } => {
	const warnings = [...config.startupWarnings];
	if (!requestedModelId) {
		return { modelId: config.defaultImageModel, warnings };
	}
	ensureModelAllowed(requestedModelId, 'image', config);
	return { modelId: requestedModelId.trim(), warnings };
};
