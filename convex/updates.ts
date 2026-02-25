import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { splitSnapshotBase64 } from './lib/snapshots';

export const appendRoomUpdates = mutation({
	args: {
		roomId: v.id('rooms'),
		actorId: v.string(),
		baseSeq: v.number(),
		updates: v.array(
			v.object({
				clientUpdateId: v.string(),
				updateBase64: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const room = await ctx.db.get(args.roomId);
		if (!room) {
			throw new Error('room_not_found');
		}
		let nextSeq = room.latestSeq;
		const acceptedClientUpdateIds: string[] = [];
		const dedupedClientUpdateIds: string[] = [];
		const now = Date.now();

		for (const update of args.updates) {
			const existing = await ctx.db
				.query('roomUpdates')
				.withIndex('by_room_client_update_id', (q) =>
					q.eq('roomId', args.roomId).eq('clientUpdateId', update.clientUpdateId),
				)
				.first();
			if (existing) {
				dedupedClientUpdateIds.push(update.clientUpdateId);
				continue;
			}
			nextSeq += 1;
			await ctx.db.insert('roomUpdates', {
				roomId: args.roomId,
				seq: nextSeq,
				baseSeq: Math.max(args.baseSeq, 0),
				actorId: args.actorId,
				clientUpdateId: update.clientUpdateId,
				updateBase64: update.updateBase64,
				createdAt: now,
			});
			acceptedClientUpdateIds.push(update.clientUpdateId);
		}

		if (nextSeq !== room.latestSeq) {
			await ctx.db.patch(room._id, { latestSeq: nextSeq });
		}

		return {
			lastSeq: nextSeq,
			acceptedClientUpdateIds,
			dedupedClientUpdateIds,
		};
	},
});

export const listRoomUpdatesSince = query({
	args: {
		roomId: v.id('rooms'),
		afterSeq: v.number(),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		const limit = Math.max(1, Math.min(500, Math.floor(args.limit)));
		const updates = await ctx.db
			.query('roomUpdates')
			.withIndex('by_room_seq', (q) => q.eq('roomId', args.roomId).gt('seq', Math.max(args.afterSeq, 0)))
			.order('asc')
			.take(limit);
		return updates;
	},
});

export const saveRoomSnapshot = mutation({
	args: {
		roomId: v.id('rooms'),
		seq: v.number(),
		snapshotBase64: v.string(),
		checksum: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const snapshotChunks = splitSnapshotBase64(args.snapshotBase64);
		await ctx.db.insert('roomSnapshots', {
			roomId: args.roomId,
			seq: args.seq,
			snapshotBase64: snapshotChunks.length === 1 ? snapshotChunks[0] : '',
			chunkCount: snapshotChunks.length > 1 ? snapshotChunks.length : undefined,
			checksum: args.checksum,
			createdAt: now,
		});
		if (snapshotChunks.length > 1) {
			for (let chunkIndex = 0; chunkIndex < snapshotChunks.length; chunkIndex += 1) {
				await ctx.db.insert('roomSnapshotChunks', {
					roomId: args.roomId,
					seq: args.seq,
					chunkIndex,
					chunkBase64: snapshotChunks[chunkIndex],
					createdAt: now,
				});
			}
		}

		const snapshots = await ctx.db
			.query('roomSnapshots')
			.withIndex('by_room_seq', (q) => q.eq('roomId', args.roomId))
			.order('desc')
			.take(25);
		for (const stale of snapshots.slice(10)) {
			const staleChunks = await ctx.db
				.query('roomSnapshotChunks')
				.withIndex('by_room_seq_chunk', (q) => q.eq('roomId', args.roomId).eq('seq', stale.seq))
				.collect();
			for (const chunk of staleChunks) {
				await ctx.db.delete(chunk._id);
			}
			await ctx.db.delete(stale._id);
		}
		return null;
	},
});
