import { generateText } from 'ai';
import { NextResponse, type NextRequest } from 'next/server';
import {
	AI_CONTRACT_VERSION,
	imageEditRequestSchema,
	imageEditResponseSchema,
	type ImageEditRequest,
} from '../../../../src/contracts';
import {
	buildImageEditPlannerPrompt,
	buildImageEditPrompt,
	IMAGE_EDIT_PLANNER_SYSTEM_PROMPT,
} from '../../../../src/prompt';
import {
	ensureClientKey,
	getProductionSecurityIssue,
	MAX_IMAGE_EDIT_REQUEST_BYTES,
	MAX_IMAGE_EDIT_SOURCE_BYTES,
	parseAllowedOrigins,
	pickCorsOrigin,
	readJsonBodyWithLimit,
} from '../../../../src/guardrails';
import {
	ModelResolverError,
	loadModelConfig,
	resolveImageEditModel,
	resolveTextModel,
} from '../../../../src/models';

export const runtime = 'nodejs';

const OPEN_RESPONSES_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/responses';

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const securityConfigIssue = getProductionSecurityIssue(allowedOrigins, process.env.GALILEO_CLIENT_KEY);
if (securityConfigIssue) {
	console.error('ai_api_security_config_issue', {
		endpoint: '/api/image/edit',
		issue: securityConfigIssue,
	});
}

const getModelConfig = () => {
	try {
		return loadModelConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : 'model_config_error';
		throw new ModelResolverError('server_not_configured', message, 500);
	}
};

const buildCorsHeaders = (origin: string | null): HeadersInit => {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Galileo-Client-Key',
	};
	if (origin) {
		headers['Access-Control-Allow-Origin'] = origin;
	}
	return headers;
};

const json = (body: unknown, status: number, origin: string | null): NextResponse => {
	return NextResponse.json(body, {
		status,
		headers: buildCorsHeaders(origin),
	});
};

const isOriginBlocked = (origin: string | null): boolean => {
	return allowedOrigins.size > 0 && !origin && !allowedOrigins.has('*');
};

const parseDataUrl = (value: string): { mimeType: string; base64: string } | null => {
	const match = value.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	return {
		mimeType: match[1] ?? 'image/png',
		base64: match[2] ?? '',
	};
};

const looksLikeBase64 = (value: string): boolean => {
	return /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s+/g, '').length > 40;
};

const extractImageFromResponse = (
	value: unknown,
	defaultMimeType: string,
	depth = 0,
): { mimeType: string; base64: string } | null => {
	if (depth > 6 || value == null) return null;
	if (typeof value === 'string') {
		const dataUrl = parseDataUrl(value);
		if (dataUrl && dataUrl.base64.length > 0) {
			return dataUrl;
		}
		if (looksLikeBase64(value)) {
			return { mimeType: defaultMimeType, base64: value.replace(/\s+/g, '') };
		}
		return null;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const candidate = extractImageFromResponse(entry, defaultMimeType, depth + 1);
			if (candidate) return candidate;
		}
		return null;
	}
	if (typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	const mimeType =
		(typeof record.mimeType === 'string' && record.mimeType) ||
		(typeof record.mime_type === 'string' && record.mime_type) ||
		(typeof record.mediaType === 'string' && record.mediaType) ||
		(typeof record.media_type === 'string' && record.media_type) ||
		defaultMimeType;

	const directKeys = ['base64', 'b64_json', 'image_base64', 'imageBase64', 'result', 'data'];
	for (const key of directKeys) {
		const candidate = extractImageFromResponse(record[key], mimeType, depth + 1);
		if (candidate) return candidate;
	}

	const nestedKeys = ['output', 'images', 'content', 'response', 'message', 'tool_outputs'];
	for (const key of nestedKeys) {
		const candidate = extractImageFromResponse(record[key], mimeType, depth + 1);
		if (candidate) return candidate;
	}
	return null;
};

const extractSummary = (payload: unknown): string => {
	if (!payload || typeof payload !== 'object') return 'Edited selected image.';
	const record = payload as Record<string, unknown>;
	const outputText = record.output_text;
	if (typeof outputText === 'string' && outputText.trim().length > 0) {
		return outputText.trim().slice(0, 2000);
	}
	const output = record.output;
	if (Array.isArray(output)) {
		for (const part of output) {
			if (!part || typeof part !== 'object') continue;
			const content = (part as Record<string, unknown>).content;
			if (!Array.isArray(content)) continue;
			for (const chunk of content) {
				if (!chunk || typeof chunk !== 'object') continue;
				const text = (chunk as Record<string, unknown>).text;
				if (typeof text === 'string' && text.trim().length > 0) {
					return text.trim().slice(0, 2000);
				}
			}
		}
	}
	return 'Edited selected image.';
};

const normalizePrompt = async (
	request: ImageEditRequest,
	plannerModelId: string,
): Promise<{ prompt: string; warnings: string[] }> => {
	const warnings: string[] = [];
	try {
		const planner = await generateText({
			model: plannerModelId,
			system: IMAGE_EDIT_PLANNER_SYSTEM_PROMPT,
			prompt: buildImageEditPlannerPrompt(request),
		});
		const text = planner.text.trim();
		if (text.length > 0) {
			return { prompt: text, warnings };
		}
		warnings.push('Prompt normalization returned empty text; using original prompt.');
		return { prompt: request.prompt, warnings };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'prompt_planner_failed';
		console.warn('ai_api_image_edit_prompt_normalization_failed', {
			endpoint: '/api/image/edit',
			requestId: request.requestId,
			modelId: plannerModelId,
			message,
		});
		warnings.push('Prompt normalization failed; using original prompt.');
		return { prompt: request.prompt, warnings };
	}
};

const buildResponsesInput = (request: ImageEditRequest, normalizedPrompt: string): unknown[] => {
	const input: Array<Record<string, unknown>> = [];
	for (const message of request.thread?.messages ?? []) {
		input.push({
			role: message.role,
			content: [{ type: 'input_text', text: message.text }],
		});
	}

	input.push({
		role: 'user',
		content: [
			{
				type: 'input_text',
				text: buildImageEditPrompt(request, normalizedPrompt),
			},
			{
				type: 'input_image',
				image_url: `data:${request.sourceImage.mimeType};base64,${request.sourceImage.base64}`,
			},
		],
	});
	return input;
};

export const OPTIONS = async (request: NextRequest): Promise<NextResponse> => {
	const origin = pickCorsOrigin(request.headers.get('origin'), allowedOrigins);
	if (securityConfigIssue) {
		return json({ error: 'server_not_configured' }, 500, origin);
	}
	if (isOriginBlocked(origin)) {
		return new NextResponse(null, {
			status: 403,
			headers: buildCorsHeaders(null),
		});
	}
	return new NextResponse(null, {
		status: 204,
		headers: buildCorsHeaders(origin),
	});
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
	const origin = pickCorsOrigin(request.headers.get('origin'), allowedOrigins);
	if (securityConfigIssue) {
		return json({ error: 'server_not_configured' }, 500, origin);
	}
	if (isOriginBlocked(origin)) {
		return json({ error: 'origin_not_allowed' }, 403, null);
	}

	const clientKeyError = ensureClientKey(request, process.env.GALILEO_CLIENT_KEY);
	if (clientKeyError) {
		return json({ error: clientKeyError }, 401, origin);
	}

	const apiKey = process.env.AI_GATEWAY_API_KEY;
	if (!apiKey) {
		return json({ error: 'server_not_configured' }, 500, origin);
	}

	let rawBody: unknown;
	try {
		rawBody = await readJsonBodyWithLimit(request, MAX_IMAGE_EDIT_REQUEST_BYTES);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid_request_body';
		const status = message === 'payload_too_large' ? 413 : 400;
		return json({ error: message }, status, origin);
	}

	const parsedRequest = imageEditRequestSchema.safeParse(rawBody);
	if (!parsedRequest.success) {
		return json(
			{
				error: 'invalid_request_schema',
				details: parsedRequest.error.flatten(),
			},
			422,
			origin,
		);
	}

	const sourceImageBytes = Math.floor((parsedRequest.data.sourceImage.base64.length * 3) / 4);
	if (sourceImageBytes > MAX_IMAGE_EDIT_SOURCE_BYTES) {
		return json({ error: 'source_image_too_large' }, 413, origin);
	}

	try {
		const modelConfig = getModelConfig();
		const resolvedImageModel = resolveImageEditModel(modelConfig, parsedRequest.data.modelId);
		const resolvedTextModel = resolveTextModel(modelConfig, undefined);
		const normalizedPrompt = await normalizePrompt(parsedRequest.data, resolvedTextModel.modelId);
		const responsesPayload = {
			model: resolvedImageModel.modelId,
			input: buildResponsesInput(parsedRequest.data, normalizedPrompt.prompt),
			tools: [
				{
					type: 'image_generation',
					size: parsedRequest.data.image.size,
				},
			],
		};
		const endpoint = process.env.AI_GATEWAY_RESPONSES_URL?.trim() || OPEN_RESPONSES_ENDPOINT;
		const upstream = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(responsesPayload),
		});
		const upstreamText = await upstream.text();
		const upstreamPayload = upstreamText.length > 0 ? (JSON.parse(upstreamText) as unknown) : null;
		if (!upstream.ok) {
			const message =
				typeof upstreamPayload === 'object' && upstreamPayload !== null && 'error' in upstreamPayload
					? JSON.stringify((upstreamPayload as { error: unknown }).error)
					: `responses_upstream_failed_${upstream.status}`;
			console.error('ai_api_image_edit_upstream_failed', {
				endpoint: '/api/image/edit',
				requestId: parsedRequest.data.requestId,
				modelId: resolvedImageModel.modelId,
				status: upstream.status,
				message,
			});
			return json({ error: 'ai_generation_failed', message }, 502, origin);
		}

		const editedImage = extractImageFromResponse(upstreamPayload, parsedRequest.data.sourceImage.mimeType);
		if (!editedImage) {
			console.error('ai_api_image_edit_no_image_in_response', {
				endpoint: '/api/image/edit',
				requestId: parsedRequest.data.requestId,
				modelId: resolvedImageModel.modelId,
			});
			return json({ error: 'ai_generation_failed', message: 'No edited image returned by provider.' }, 502, origin);
		}

		const responseBody = {
			contractVersion: AI_CONTRACT_VERSION,
			requestId: parsedRequest.data.requestId,
			modelId: resolvedImageModel.modelId,
			summary: extractSummary(upstreamPayload),
			images: [editedImage],
			warnings: [...resolvedImageModel.warnings, ...normalizedPrompt.warnings],
		};
		const parsedResponse = imageEditResponseSchema.safeParse(responseBody);
		if (!parsedResponse.success) {
			console.error('ai_api_invalid_image_edit_response_schema', {
				endpoint: '/api/image/edit',
				requestId: parsedRequest.data.requestId,
				modelId: resolvedImageModel.modelId,
			});
			return json({ error: 'invalid_response_schema' }, 500, origin);
		}

		console.info('ai_api_image_edit_success', {
			endpoint: '/api/image/edit',
			requestId: parsedRequest.data.requestId,
			modelId: resolvedImageModel.modelId,
		});
		return json(parsedResponse.data, 200, origin);
	} catch (error) {
		if (error instanceof ModelResolverError) {
			console.warn('ai_api_image_edit_model_resolution_error', {
				endpoint: '/api/image/edit',
				requestId: parsedRequest.data.requestId,
				code: error.code,
				message: error.message,
			});
			return json(
				{
					error: error.code,
					message: error.message,
				},
				error.status,
				origin,
			);
		}
		const message = error instanceof Error ? error.message : 'ai_generation_failed';
		console.error('ai_api_image_edit_failed', {
			endpoint: '/api/image/edit',
			requestId: parsedRequest.data.requestId,
			message,
		});
		return json({ error: 'ai_generation_failed', message }, 502, origin);
	}
};
