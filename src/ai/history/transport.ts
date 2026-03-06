import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { getConvexUrlFromEnv } from '../../collab/transport/convexTransport';
import type { AIHistoryContext, AIHistoryFailure, AIHistoryInteraction, AIHistoryScope, AIHistoryTransport } from './types';

const resolveContextRef = makeFunctionReference<'query'>('aiHistory:resolveContext');
const appendInteractionRef = makeFunctionReference<'mutation'>('aiHistory:appendInteraction');
const appendFailureRef = makeFunctionReference<'mutation'>('aiHistory:appendFailure');

const normalizeContext = (value: unknown): AIHistoryContext => {
	if (!value || typeof value !== 'object') {
		return { messages: [] };
	}
	const record = value as Record<string, unknown>;
	const messages = Array.isArray(record.messages)
		? record.messages
				.map((item) => {
					if (!item || typeof item !== 'object') return null;
					const entry = item as Record<string, unknown>;
					const role = entry.role;
					const text = entry.text;
					if ((role === 'user' || role === 'assistant') && typeof text === 'string' && text.trim().length > 0) {
						return { role, text };
					}
					return null;
				})
				.filter((item): item is { role: 'user' | 'assistant'; text: string } => Boolean(item))
		: [];
	return {
		threadId: typeof record.threadId === 'string' && record.threadId.trim().length > 0 ? record.threadId : undefined,
		messages,
	};
};

const normalizeThreadId = (value: unknown): { threadId: string } => {
	if (!value || typeof value !== 'object') {
		return { threadId: '' };
	}
	const record = value as Record<string, unknown>;
	return { threadId: typeof record.threadId === 'string' ? record.threadId : '' };
};

class ConvexAIHistoryTransport implements AIHistoryTransport {
	private readonly client: ConvexHttpClient;

	constructor(url: string) {
		this.client = new ConvexHttpClient(url);
	}

	resolveContext(scope: AIHistoryScope): Promise<AIHistoryContext> {
		return this.client.query(resolveContextRef, scope).then((result) => normalizeContext(result));
	}

	appendInteraction(interaction: AIHistoryInteraction): Promise<{ threadId: string }> {
		return this.client.mutation(appendInteractionRef, interaction).then((result) => normalizeThreadId(result));
	}

	appendFailure(failure: AIHistoryFailure): Promise<{ threadId: string }> {
		return this.client.mutation(appendFailureRef, failure).then((result) => normalizeThreadId(result));
	}
}

export const createAIHistoryTransport = (): AIHistoryTransport | null => {
	const url = getConvexUrlFromEnv();
	if (!url) return null;
	return new ConvexAIHistoryTransport(url);
};
