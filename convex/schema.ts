import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	rooms: defineTable({
		name: v.string(),
		createdAt: v.number(),
		createdByActorId: v.string(),
		latestSeq: v.number(),
	})
		.index('by_created_at', ['createdAt']),

	roomInvites: defineTable({
		roomId: v.id('rooms'),
		token: v.string(),
		createdAt: v.number(),
		expiresAt: v.number(),
		createdByActorId: v.string(),
		revokedAt: v.optional(v.number()),
	})
		.index('by_token', ['token'])
		.index('by_room', ['roomId']),

	roomMembers: defineTable({
		roomId: v.id('rooms'),
		actorId: v.string(),
		displayName: v.string(),
		deviceId: v.string(),
		joinedAt: v.number(),
		lastSeenAt: v.number(),
	})
		.index('by_room_actor', ['roomId', 'actorId'])
		.index('by_room', ['roomId']),

	roomUpdates: defineTable({
		roomId: v.id('rooms'),
		seq: v.number(),
		baseSeq: v.number(),
		actorId: v.string(),
		clientUpdateId: v.string(),
		updateBase64: v.string(),
		createdAt: v.number(),
	})
		.index('by_room_seq', ['roomId', 'seq'])
		.index('by_room_client_update_id', ['roomId', 'clientUpdateId']),

	roomSnapshots: defineTable({
		roomId: v.id('rooms'),
		seq: v.number(),
		snapshotBase64: v.string(),
		chunkCount: v.optional(v.number()),
		checksum: v.string(),
		createdAt: v.number(),
	})
		.index('by_room_seq', ['roomId', 'seq']),

	roomSnapshotChunks: defineTable({
		roomId: v.id('rooms'),
		seq: v.number(),
		chunkIndex: v.number(),
		chunkBase64: v.string(),
		createdAt: v.number(),
	})
		.index('by_room_seq_chunk', ['roomId', 'seq', 'chunkIndex']),

	roomPresence: defineTable({
		roomId: v.id('rooms'),
		actorId: v.string(),
		displayName: v.string(),
		color: v.string(),
		cursor: v.optional(v.object({ x: v.number(), y: v.number() })),
		selectionIds: v.array(v.string()),
		viewport: v.optional(
			v.object({
				panX: v.number(),
				panY: v.number(),
				zoom: v.number(),
			}),
		),
		activeTool: v.optional(v.string()),
		editingTextNodeId: v.optional(v.string()),
		updatedAt: v.number(),
	})
		.index('by_room_actor', ['roomId', 'actorId'])
		.index('by_room', ['roomId']),

	textLocks: defineTable({
		roomId: v.id('rooms'),
		nodeId: v.string(),
		actorId: v.string(),
		leaseExpiresAt: v.number(),
		updatedAt: v.number(),
	})
		.index('by_room_node', ['roomId', 'nodeId'])
		.index('by_room_actor', ['roomId', 'actorId']),

	aiThreads: defineTable({
		actorId: v.string(),
		projectKey: v.string(),
		roomId: v.optional(v.string()),
		pageId: v.string(),
		mode: v.string(),
		selectionKey: v.string(),
		updatedAt: v.number(),
		createdAt: v.number(),
		expiresAt: v.number(),
	})
		.index('by_actor_project_room_page_mode_selection', [
			'actorId',
			'projectKey',
			'roomId',
			'pageId',
			'mode',
			'selectionKey',
		])
		.index('by_expires_at', ['expiresAt']),

	aiMessages: defineTable({
		threadId: v.id('aiThreads'),
		role: v.union(v.literal('user'), v.literal('assistant')),
		text: v.string(),
		modelId: v.optional(v.string()),
		requestId: v.optional(v.string()),
		status: v.union(v.literal('success'), v.literal('error')),
		warnings: v.array(v.string()),
		createdAt: v.number(),
		expiresAt: v.number(),
	})
		.index('by_thread_created', ['threadId', 'createdAt'])
		.index('by_expires_at', ['expiresAt']),
});
