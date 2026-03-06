import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';

const MAX_CONTEXT_MESSAGES = 12;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const threadArgs = {
	actorId: v.string(),
	projectKey: v.string(),
	roomId: v.optional(v.string()),
	pageId: v.string(),
	mode: v.string(),
	selectionKey: v.string(),
};

const findThreadByContext = async (
	ctx: any,
	args: {
		actorId: string;
		projectKey: string;
		roomId?: string;
		pageId: string;
		mode: string;
		selectionKey: string;
	},
) => {
	const db = ctx.db as any;
	return await db
		.query('aiThreads')
		.withIndex('by_actor_project_room_page_mode_selection', (q: any) =>
			q
				.eq('actorId', args.actorId)
				.eq('projectKey', args.projectKey)
				.eq('roomId', args.roomId)
				.eq('pageId', args.pageId)
				.eq('mode', args.mode)
				.eq('selectionKey', args.selectionKey),
		)
		.first();
};

const getOrCreateThread = async (
	ctx: any,
	args: {
		actorId: string;
		projectKey: string;
		roomId?: string;
		pageId: string;
		mode: string;
		selectionKey: string;
	},
	now: number,
) => {
	const db = ctx.db as any;
	const existing = await findThreadByContext(ctx as any, args);
	const expiresAt = now + RETENTION_MS;
	if (existing) {
		await db.patch(existing._id, {
			roomId: args.roomId,
			updatedAt: now,
			expiresAt,
		});
		return existing._id as string;
	}

	return (await db.insert('aiThreads', {
		actorId: args.actorId,
		projectKey: args.projectKey,
		roomId: args.roomId,
		pageId: args.pageId,
		mode: args.mode,
		selectionKey: args.selectionKey,
		updatedAt: now,
		createdAt: now,
		expiresAt,
	})) as string;
};

const capThreadMessages = async (ctx: any, threadId: string) => {
	const db = ctx.db as any;
	const messages = await db
		.query('aiMessages')
		.withIndex('by_thread_created', (q: any) => q.eq('threadId', threadId))
		.order('desc')
		.take(40);
	for (const stale of messages.slice(MAX_CONTEXT_MESSAGES * 2)) {
		await db.delete(stale._id);
	}
};

export const resolveContext = query({
	args: {
		...threadArgs,
	},
	handler: async (ctx, args) => {
		const thread = await findThreadByContext(ctx as any, args);
		if (!thread) {
			return {
				threadId: undefined,
				messages: [] as Array<{ role: 'user' | 'assistant'; text: string }>,
			};
		}

		const db = ctx.db as any;
		const now = Date.now();
		if (typeof thread.expiresAt === 'number' && thread.expiresAt < now) {
			return {
				threadId: undefined,
				messages: [] as Array<{ role: 'user' | 'assistant'; text: string }>,
			};
		}

		const recent = await db
			.query('aiMessages')
			.withIndex('by_thread_created', (q: any) => q.eq('threadId', thread._id))
			.order('desc')
			.take(MAX_CONTEXT_MESSAGES);

		return {
			threadId: thread._id,
			messages: recent
				.reverse()
				.map((message: { role: 'user' | 'assistant'; text: string }) => ({ role: message.role, text: message.text })),
		};
	},
});

export const appendInteraction = mutation({
	args: {
		...threadArgs,
		requestId: v.string(),
		prompt: v.string(),
		assistantText: v.string(),
		modelId: v.string(),
		warnings: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + RETENTION_MS;
		const threadId = await getOrCreateThread(ctx, args, now);
		const db = ctx.db as any;

		await db.insert('aiMessages', {
			threadId,
			role: 'user',
			text: args.prompt,
			requestId: args.requestId,
			status: 'success',
			warnings: [],
			createdAt: now,
			expiresAt,
		});
		await db.insert('aiMessages', {
			threadId,
			role: 'assistant',
			text: args.assistantText,
			modelId: args.modelId,
			requestId: args.requestId,
			status: 'success',
			warnings: args.warnings ?? [],
			createdAt: now + 1,
			expiresAt,
		});
		await capThreadMessages(ctx, threadId);

		return { threadId };
	},
});

export const appendFailure = mutation({
	args: {
		...threadArgs,
		requestId: v.string(),
		prompt: v.string(),
		errorText: v.string(),
		modelId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + RETENTION_MS;
		const threadId = await getOrCreateThread(ctx, args, now);
		const db = ctx.db as any;

		await db.insert('aiMessages', {
			threadId,
			role: 'user',
			text: args.prompt,
			requestId: args.requestId,
			status: 'error',
			warnings: [],
			createdAt: now,
			expiresAt,
		});
		await db.insert('aiMessages', {
			threadId,
			role: 'assistant',
			text: args.errorText,
			modelId: args.modelId,
			requestId: args.requestId,
			status: 'error',
			warnings: [],
			createdAt: now + 1,
			expiresAt,
		});
		await capThreadMessages(ctx, threadId);

		return { threadId };
	},
});

export const pruneExpired = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const db = ctx.db as any;
		const expiredThreads = await db
			.query('aiThreads')
			.withIndex('by_expires_at', (q: any) => q.lt('expiresAt', now))
			.take(200);

		let deletedThreads = 0;
		let deletedMessages = 0;

		for (const thread of expiredThreads) {
			const messages = await db
				.query('aiMessages')
				.withIndex('by_thread_created', (q: any) => q.eq('threadId', thread._id))
				.collect();
			for (const message of messages) {
				await db.delete(message._id);
				deletedMessages += 1;
			}
			await db.delete(thread._id);
			deletedThreads += 1;
		}

		const expiredMessages = await db
			.query('aiMessages')
			.withIndex('by_expires_at', (q: any) => q.lt('expiresAt', now))
			.take(400);
		for (const stale of expiredMessages) {
			await db.delete(stale._id);
			deletedMessages += 1;
		}

		return { deletedThreads, deletedMessages };
	},
});
