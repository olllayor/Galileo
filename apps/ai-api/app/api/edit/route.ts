import { Output, generateText } from 'ai';
import { NextResponse, type NextRequest } from 'next/server';
import {
	AI_CONTRACT_VERSION,
	aiModelResponseSchema,
	editRequestSchema,
	editResponseSchema,
} from '../../../src/contracts';
import { buildEditPrompt, EDIT_SYSTEM_PROMPT } from '../../../src/prompt';
import {
	MAX_REQUEST_BYTES,
	ensureClientKey,
	parseAllowedOrigins,
	pickCorsOrigin,
	readJsonBodyWithLimit,
	validateDraftGuardrails,
} from '../../../src/guardrails';
import { ModelResolverError, loadModelConfig, resolveTextModel } from '../../../src/models';

export const runtime = 'nodejs';

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
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

export const OPTIONS = async (request: NextRequest): Promise<NextResponse> => {
	const origin = pickCorsOrigin(request.headers.get('origin'), allowedOrigins);
	return new NextResponse(null, {
		status: 204,
		headers: buildCorsHeaders(origin),
	});
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
	const origin = pickCorsOrigin(request.headers.get('origin'), allowedOrigins);
	if (allowedOrigins.size > 0 && !origin && !allowedOrigins.has('*')) {
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

	const parsedRequest = editRequestSchema.safeParse(rawBody);
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
		const resolvedModel = resolveTextModel(modelConfig, parsedRequest.data.modelId);
		const result = await generateText({
			model: resolvedModel.modelId,
			system: EDIT_SYSTEM_PROMPT,
			prompt: buildEditPrompt(parsedRequest.data),
			experimental_output: Output.object({ schema: aiModelResponseSchema }),
		});

		const modelOutput = result.experimental_output;
		const selectedNodeIds = parsedRequest.data.context.selectedNodes.map((node) => node.id);
		const draftIssues = validateDraftGuardrails(modelOutput.commandDrafts, selectedNodeIds);
		if (draftIssues.length > 0) {
			return json(
				{
					error: 'command_guardrails_failed',
					details: draftIssues,
				},
				422,
				origin,
			);
		}

		const responseBody = {
			contractVersion: AI_CONTRACT_VERSION,
			requestId: parsedRequest.data.requestId,
			modelId: resolvedModel.modelId,
			summary: modelOutput.summary,
			commandDrafts: modelOutput.commandDrafts,
			warnings: [...resolvedModel.warnings, ...modelOutput.warnings],
		};
		const parsedResponse = editResponseSchema.safeParse(responseBody);
		if (!parsedResponse.success) {
			console.error('ai_api_invalid_response_schema', {
				endpoint: '/api/edit',
				requestId: parsedRequest.data.requestId,
				modelId: resolvedModel.modelId,
			});
			return json({ error: 'invalid_response_schema' }, 500, origin);
		}

		console.info('ai_api_edit_success', {
			endpoint: '/api/edit',
			requestId: parsedRequest.data.requestId,
			modelId: resolvedModel.modelId,
		});
		return json(parsedResponse.data, 200, origin);
	} catch (error) {
		if (error instanceof ModelResolverError) {
			console.warn('ai_api_model_resolution_error', {
				endpoint: '/api/edit',
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
		console.error('ai_api_edit_generation_failed', {
			endpoint: '/api/edit',
			requestId: parsedRequest.data.requestId,
			message,
		});
		return json({ error: 'ai_generation_failed', message }, 502, origin);
	}
};
