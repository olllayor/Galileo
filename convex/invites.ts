import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const joinRoomByInvite = mutation({
	args: {
		inviteToken: v.string(),
		displayName: v.string(),
		deviceId: v.string(),
		actorId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const invite = await ctx.db
			.query('roomInvites')
			.withIndex('by_token', (q) => q.eq('token', args.inviteToken))
			.first();
		if (!invite) {
			throw new Error('invite_not_found');
		}
		if (invite.revokedAt) {
			throw new Error('invite_revoked');
		}
		if (invite.expiresAt < now) {
			throw new Error('invite_expired');
		}

		const room = await ctx.db.get(invite.roomId);
		if (!room) {
			throw new Error('room_not_found');
		}

		const existingMember = await ctx.db
			.query('roomMembers')
			.withIndex('by_room_actor', (q) => q.eq('roomId', invite.roomId).eq('actorId', args.actorId))
			.first();
		if (existingMember) {
			await ctx.db.patch(existingMember._id, {
				displayName: args.displayName,
				deviceId: args.deviceId,
				lastSeenAt: now,
			});
		} else {
			await ctx.db.insert('roomMembers', {
				roomId: invite.roomId,
				actorId: args.actorId,
				displayName: args.displayName,
				deviceId: args.deviceId,
				joinedAt: now,
				lastSeenAt: now,
			});
		}

		const latestSnapshot = await ctx.db
			.query('roomSnapshots')
			.withIndex('by_room_seq', (q) => q.eq('roomId', invite.roomId))
			.order('desc')
			.first();
		if (!latestSnapshot) {
			throw new Error('snapshot_missing');
		}
		let snapshotBase64 = latestSnapshot.snapshotBase64;
			if ((latestSnapshot.chunkCount ?? 0) > 0) {
				const chunks = await ctx.db
					.query('roomSnapshotChunks')
					.withIndex('by_room_seq_chunk', (q) => q.eq('roomId', invite.roomId).eq('seq', latestSnapshot.seq))
					.order('asc')
					.collect();
			if (chunks.length !== latestSnapshot.chunkCount) {
				throw new Error('snapshot_chunks_missing');
			}
			snapshotBase64 = chunks.map((chunk) => chunk.chunkBase64).join('');
		}

		return {
			roomId: invite.roomId,
			shareLink: `galileo://collab/${args.inviteToken}`,
			snapshotBase64,
			snapshotSeq: latestSnapshot.seq,
			latestSeq: room.latestSeq,
		};
	},
});
