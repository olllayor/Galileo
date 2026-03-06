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
	'openai/gpt-image-1.5',
	'openai/gpt-image-1-mini',
	'google/imagen-4.0-generate-001',
	'google/imagen-4.0-fast-generate-001',
	'google/imagen-4.0-ultra-generate-001',
	'google/gemini-3-pro-image',
	'bfl/flux-kontext-max',
] as const;

const MODEL_ID_ALIASES: Record<string, string> = {
	'google/gemini-2.5-flash-image-preview': 'google/gemini-3-pro-image',
	'google/gemini-3-pro-image-preview': 'google/gemini-3-pro-image',
	'google/imagen-4.0-generate': 'google/imagen-4.0-generate-001',
	'black-forest-labs/flux-kontext-max': 'bfl/flux-kontext-max',
};

const IMAGE_EDIT_MODEL_PREFERENCE = [
	'openai/gpt-image-1.5',
	'openai/gpt-image-1-mini',
	'bfl/flux-kontext-max',
	'google/imagen-4.0-fast-generate-001',
	'google/imagen-4.0-generate-001',
	'google/imagen-4.0-ultra-generate-001',
	'google/gemini-3-pro-image',
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

export type ModelConfig = {
	allowedTextModels: Set<string>;
	allowedImageModels: Set<string>;
	defaultTextModel: string;
	defaultImageModel: string;
	startupWarnings: string[];
};

export const normalizeModelId = (modelId: string): string => {
	const trimmed = modelId.trim();
	return MODEL_ID_ALIASES[trimmed] ?? trimmed;
};

const parseModelList = (value: string | undefined): Set<string> => {
	if (!value) return new Set();
	return new Set(
		value
			.split(',')
			.map((item) => normalizeModelId(item))
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
	if (candidate) return normalizeModelId(candidate);
	if (modality === 'text' && legacyAiModel?.trim()) {
		startupWarnings.push('DEFAULT_TEXT_MODEL missing; using deprecated AI_MODEL fallback.');
		return normalizeModelId(legacyAiModel.trim());
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

const ensureModelAllowed = (requested: string, modality: ModelModality, config: ModelConfig): string => {
	const trimmed = requested.trim();
	if (trimmed.length === 0) {
		throw new ModelResolverError('unsupported_model', 'modelId must not be empty.');
	}
	const normalized = normalizeModelId(trimmed);

	const allowlist = modality === 'text' ? config.allowedTextModels : config.allowedImageModels;
	const oppositeAllowlist = modality === 'text' ? config.allowedImageModels : config.allowedTextModels;
	const curatedSet = modality === 'text' ? CURATED_TEXT_SET : CURATED_IMAGE_SET;
	const oppositeCuratedSet = modality === 'text' ? CURATED_IMAGE_SET : CURATED_TEXT_SET;

	if (allowlist.has(normalized)) return normalized;
	if (oppositeAllowlist.has(normalized) || oppositeCuratedSet.has(normalized)) {
		throw new ModelResolverError('modality_mismatch', `${trimmed} cannot be used for ${modality} requests.`);
	}
	if (curatedSet.has(normalized)) {
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
	return { modelId: ensureModelAllowed(requestedModelId, 'text', config), warnings };
};

export const resolveImageModel = (
	config: ModelConfig,
	requestedModelId: string | undefined,
): { modelId: string; warnings: string[] } => {
	const warnings = [...config.startupWarnings];
	if (!requestedModelId) {
		return { modelId: config.defaultImageModel, warnings };
	}
	return { modelId: ensureModelAllowed(requestedModelId, 'image', config), warnings };
};

export const resolveImageEditModel = (
	config: ModelConfig,
	requestedModelId: string | undefined,
): { modelId: string; warnings: string[] } => {
	if (requestedModelId) {
		return resolveImageModel(config, requestedModelId);
	}

	const warnings = [...config.startupWarnings];
	for (const candidate of IMAGE_EDIT_MODEL_PREFERENCE) {
		if (config.allowedImageModels.has(candidate)) {
			if (candidate !== config.defaultImageModel) {
				warnings.push(`Using preferred image edit model: ${candidate}.`);
			}
			return { modelId: candidate, warnings };
		}
	}

	return { modelId: config.defaultImageModel, warnings };
};
