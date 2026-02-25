import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const upsertPresence = mutation({
	args: {
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
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const current = await ctx.db
			.query('roomPresence')
			.withIndex('by_room_actor', (q) => q.eq('roomId', args.roomId).eq('actorId', args.actorId))
			.first();
		if (current) {
			await ctx.db.patch(current._id, {
				displayName: args.displayName,
				color: args.color,
				cursor: args.cursor,
				selectionIds: args.selectionIds,
				viewport: args.viewport,
				activeTool: args.activeTool,
				editingTextNodeId: args.editingTextNodeId,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert('roomPresence', {
				roomId: args.roomId,
				actorId: args.actorId,
				displayName: args.displayName,
				color: args.color,
				cursor: args.cursor,
				selectionIds: args.selectionIds,
				viewport: args.viewport,
				activeTool: args.activeTool,
				editingTextNodeId: args.editingTextNodeId,
				updatedAt: now,
			});
		}
		return null;
	},
});

export const listPresence = query({
	args: {
		roomId: v.id('rooms'),
	},
	handler: async (ctx, args) => {
		const list = await ctx.db
			.query('roomPresence')
			.withIndex('by_room', (q) => q.eq('roomId', args.roomId))
			.collect();
		return list;
	},
});

export const acquireTextEditLock = mutation({
	args: {
		roomId: v.id('rooms'),
		nodeId: v.string(),
		actorId: v.string(),
		leaseMs: v.number(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const leaseExpiresAt = now + Math.max(args.leaseMs, 1500);
		const existing = await ctx.db
			.query('textLocks')
			.withIndex('by_room_node', (q) => q.eq('roomId', args.roomId).eq('nodeId', args.nodeId))
			.first();
		if (existing && existing.actorId !== args.actorId && existing.leaseExpiresAt > now) {
			return {
				ok: false,
				holderActorId: existing.actorId,
				leaseExpiresAt: existing.leaseExpiresAt,
			};
		}
		if (existing) {
			await ctx.db.patch(existing._id, {
				actorId: args.actorId,
				leaseExpiresAt,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert('textLocks', {
				roomId: args.roomId,
				nodeId: args.nodeId,
				actorId: args.actorId,
				leaseExpiresAt,
				updatedAt: now,
			});
		}
		return { ok: true, leaseExpiresAt };
	},
});

export const releaseTextEditLock = mutation({
	args: {
		roomId: v.id('rooms'),
		nodeId: v.string(),
		actorId: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('textLocks')
			.withIndex('by_room_node', (q) => q.eq('roomId', args.roomId).eq('nodeId', args.nodeId))
			.first();
		if (existing && existing.actorId === args.actorId) {
			await ctx.db.delete(existing._id);
		}
		return null;
	},
});
