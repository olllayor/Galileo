import type { AIImageSize } from './contracts';

export type TextModelOption = {
	id: string;
	label: string;
};

export type ImageModelOption = {
	id: string;
	label: string;
};

export const TEXT_MODEL_OPTIONS: TextModelOption[] = [
	{ id: 'openai/gpt-5', label: 'OpenAI GPT-5' },
	{ id: 'openai/gpt-5-chat-latest', label: 'OpenAI GPT-5 Chat' },
	{ id: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1' },
	{ id: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
	{ id: 'anthropic/claude-4.5-sonnet', label: 'Anthropic Claude 4.5 Sonnet' },
	{ id: 'anthropic/claude-sonnet-4', label: 'Anthropic Claude Sonnet 4' },
	{ id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
	{ id: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
];

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
	{ id: 'google/imagen-4.0-generate-001', label: 'Imagen 4 (Quality)' },
	{ id: 'google/imagen-4.0-fast-generate-001', label: 'Imagen 4 (Fast)' },
	{ id: 'google/gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image' },
	{ id: 'black-forest-labs/flux-kontext-max', label: 'FLUX Kontext Max' },
];

export const DEFAULT_TEXT_MODEL_ID = 'openai/gpt-5';
export const DEFAULT_IMAGE_MODEL_ID = 'google/imagen-4.0-fast-generate-001';
export const DEFAULT_IMAGE_SIZE: AIImageSize = '1024x1024';

