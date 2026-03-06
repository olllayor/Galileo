import { experimental_generateImage as generateImage } from 'ai';
import { NextResponse, type NextRequest } from 'next/server';
import {
	AI_CONTRACT_VERSION,
	imageGenerateRequestSchema,
	imageGenerateResponseSchema,
} from '../../../../src/contracts';
import { buildImageGeneratePrompt } from '../../../../src/prompt';
import {
	MAX_REQUEST_BYTES,
	ensureClientKey,
	getProductionSecurityIssue,
	parseAllowedOrigins,
	pickCorsOrigin,
	readJsonBodyWithLimit,
} from '../../../../src/guardrails';
import { ModelResolverError, loadModelConfig, resolveImageModel } from '../../../../src/models';

export const runtime = 'nodejs';

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const securityConfigIssue = getProductionSecurityIssue(allowedOrigins, process.env.GALILEO_CLIENT_KEY);
if (securityConfigIssue) {
	console.error('ai_api_security_config_issue', {
		endpoint: '/api/image/generate',
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
		rawBody = await readJsonBodyWithLimit(request, MAX_REQUEST_BYTES);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid_request_body';
		const status = message === 'payload_too_large' ? 413 : 400;
		return json({ error: message }, status, origin);
	}

	const parsedRequest = imageGenerateRequestSchema.safeParse(rawBody);
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

	try {
		const modelConfig = getModelConfig();
		const resolvedModel = resolveImageModel(modelConfig, parsedRequest.data.modelId);
		const result = await generateImage({
			model: resolvedModel.modelId,
			prompt: buildImageGeneratePrompt(parsedRequest.data),
			n: parsedRequest.data.image.count,
			size: parsedRequest.data.image.size,
		});
		const providerWarnings =
			result.warnings?.map((warning) => warning.type ?? 'provider_warning').slice(0, 10) ?? [];
		const images = result.images.slice(0, 2).map((image) => ({
			mimeType: image.mediaType,
			base64: image.base64,
		}));
		const responseBody = {
			contractVersion: AI_CONTRACT_VERSION,
			requestId: parsedRequest.data.requestId,
			modelId: resolvedModel.modelId,
			summary: `Generated ${images.length} image${images.length === 1 ? '' : 's'}.`,
			images,
			warnings: [...resolvedModel.warnings, ...providerWarnings],
		};
		const parsedResponse = imageGenerateResponseSchema.safeParse(responseBody);
		if (!parsedResponse.success) {
			console.error('ai_api_invalid_image_response_schema', {
				endpoint: '/api/image/generate',
				requestId: parsedRequest.data.requestId,
				modelId: resolvedModel.modelId,
			});
			return json({ error: 'invalid_response_schema' }, 500, origin);
		}
		console.info('ai_api_image_success', {
			endpoint: '/api/image/generate',
			requestId: parsedRequest.data.requestId,
			modelId: resolvedModel.modelId,
		});
		return json(parsedResponse.data, 200, origin);
	} catch (error) {
		if (error instanceof ModelResolverError) {
			console.warn('ai_api_image_model_resolution_error', {
				endpoint: '/api/image/generate',
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
		console.error('ai_api_image_generation_failed', {
			endpoint: '/api/image/generate',
			requestId: parsedRequest.data.requestId,
			message,
		});
		return json({ error: 'ai_generation_failed', message }, 502, origin);
	}
};
