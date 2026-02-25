import {
	AI_CONTRACT_VERSION,
	aiEditRequestSchema,
	aiEditResponseSchema,
	aiImageGenerateRequestSchema,
	aiImageGenerateResponseSchema,
	type AIEditResponse,
	type AIImageGenerateResponse,
	type AIImageSize,
	type SelectedNodeContext,
} from './contracts';

const DEFAULT_TIMEOUT_MS = 25_000;

export class AIClientError extends Error {
	readonly statusCode?: number;
	readonly details?: unknown;

	constructor(message: string, statusCode?: number, details?: unknown) {
		super(message);
		this.name = 'AIClientError';
		this.statusCode = statusCode;
		this.details = details;
	}
}

type RequestAIEditArgs = {
	requestId: string;
	prompt: string;
	modelId?: string;
	context: {
		activePageId: string;
		selectionSummary: string;
		selectedNodes: SelectedNodeContext[];
		canvas: { width: number; height: number };
	};
	signal?: AbortSignal;
	timeoutMs?: number;
};

type RequestAIImageGenerateArgs = {
	requestId: string;
	prompt: string;
	modelId?: string;
	context: {
		activePageId: string;
		selectionSummary: string;
		canvas: { width: number; height: number };
	};
	image: {
		size: AIImageSize;
		count: number;
	};
	signal?: AbortSignal;
	timeoutMs?: number;
};

const combineSignals = (signals: Array<AbortSignal | undefined>): AbortSignal => {
	const controller = new AbortController();
	for (const signal of signals) {
		if (!signal) continue;
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
	}
	return controller.signal;
};

const resolveApiBaseUrl = (): string => {
	const baseUrl = import.meta.env.VITE_GALILEO_AI_API_BASE_URL;
	if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
		throw new AIClientError('VITE_GALILEO_AI_API_BASE_URL is missing.');
	}
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const resolveApiUrl = (path: string): string => {
	return `${resolveApiBaseUrl()}${path}`;
};

export const requestAIEdit = async (args: RequestAIEditArgs): Promise<AIEditResponse> => {
	const timeoutMs = Math.max(1000, Math.floor(args.timeoutMs ?? DEFAULT_TIMEOUT_MS));
	const timeoutController = new AbortController();
	const timeoutId = window.setTimeout(() => {
		timeoutController.abort(new Error('AI request timed out'));
	}, timeoutMs);

	try {
		const requestBody = {
			contractVersion: AI_CONTRACT_VERSION,
			requestId: args.requestId,
			prompt: args.prompt,
			modelId: args.modelId,
			context: args.context,
		};
		const parsedRequest = aiEditRequestSchema.safeParse(requestBody);
		if (!parsedRequest.success) {
			throw new AIClientError('Invalid AI request payload.', 400, parsedRequest.error.flatten());
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		const clientKey = import.meta.env.VITE_GALILEO_AI_CLIENT_KEY;
		if (typeof clientKey === 'string' && clientKey.trim().length > 0) {
			headers['X-Galileo-Client-Key'] = clientKey;
		}

		const response = await fetch(resolveApiUrl('/api/edit'), {
			method: 'POST',
			headers,
			body: JSON.stringify(parsedRequest.data),
			signal: combineSignals([args.signal, timeoutController.signal]),
		});

		const responseText = await response.text();
		const parsedJson = responseText.length > 0 ? (JSON.parse(responseText) as unknown) : null;
		if (!response.ok) {
			const message =
				typeof parsedJson === 'object' && parsedJson !== null && 'error' in parsedJson
					? String((parsedJson as { error: unknown }).error)
					: `AI API request failed (${response.status})`;
			throw new AIClientError(message, response.status, parsedJson);
		}

		const parsedResponse = aiEditResponseSchema.safeParse(parsedJson);
		if (!parsedResponse.success) {
			throw new AIClientError('Invalid AI response schema.', response.status, parsedResponse.error.flatten());
		}

		return parsedResponse.data;
	} catch (error) {
		if (error instanceof AIClientError) {
			throw error;
		}
		if (timeoutController.signal.aborted && !args.signal?.aborted) {
			throw new AIClientError('AI request timed out.', 408);
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new AIClientError('AI request canceled.', 499);
		}
		throw new AIClientError(error instanceof Error ? error.message : 'Unknown AI request error');
	} finally {
		window.clearTimeout(timeoutId);
	}
};

export const requestAIImageGenerate = async (args: RequestAIImageGenerateArgs): Promise<AIImageGenerateResponse> => {
	const timeoutMs = Math.max(1000, Math.floor(args.timeoutMs ?? DEFAULT_TIMEOUT_MS));
	const timeoutController = new AbortController();
	const timeoutId = window.setTimeout(() => {
		timeoutController.abort(new Error('AI image request timed out'));
	}, timeoutMs);

	try {
		const requestBody = {
			contractVersion: AI_CONTRACT_VERSION,
			requestId: args.requestId,
			prompt: args.prompt,
			modelId: args.modelId,
			context: args.context,
			image: args.image,
		};
		const parsedRequest = aiImageGenerateRequestSchema.safeParse(requestBody);
		if (!parsedRequest.success) {
			throw new AIClientError('Invalid AI image request payload.', 400, parsedRequest.error.flatten());
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		const clientKey = import.meta.env.VITE_GALILEO_AI_CLIENT_KEY;
		if (typeof clientKey === 'string' && clientKey.trim().length > 0) {
			headers['X-Galileo-Client-Key'] = clientKey;
		}

		const response = await fetch(resolveApiUrl('/api/image/generate'), {
			method: 'POST',
			headers,
			body: JSON.stringify(parsedRequest.data),
			signal: combineSignals([args.signal, timeoutController.signal]),
		});

		const responseText = await response.text();
		const parsedJson = responseText.length > 0 ? (JSON.parse(responseText) as unknown) : null;
		if (!response.ok) {
			const message =
				typeof parsedJson === 'object' && parsedJson !== null && 'error' in parsedJson
					? String((parsedJson as { error: unknown }).error)
					: `AI image API request failed (${response.status})`;
			throw new AIClientError(message, response.status, parsedJson);
		}

		const parsedResponse = aiImageGenerateResponseSchema.safeParse(parsedJson);
		if (!parsedResponse.success) {
			throw new AIClientError('Invalid AI image response schema.', response.status, parsedResponse.error.flatten());
		}

		return parsedResponse.data;
	} catch (error) {
		if (error instanceof AIClientError) {
			throw error;
		}
		if (timeoutController.signal.aborted && !args.signal?.aborted) {
			throw new AIClientError('AI image request timed out.', 408);
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new AIClientError('AI image request canceled.', 499);
		}
		throw new AIClientError(error instanceof Error ? error.message : 'Unknown AI image request error');
	} finally {
		window.clearTimeout(timeoutId);
	}
};
