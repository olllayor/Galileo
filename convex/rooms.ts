import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { splitSnapshotBase64 } from './lib/snapshots';

const randomToken = (): string => {
	const segment = () => Math.random().toString(36).slice(2, 10);
	return `${segment()}${segment()}`;
};

export const createRoomFromDocument = mutation({
	args: {
		name: v.string(),
		initialSnapshotBase64: v.string(),
		inviteExpiryMs: v.number(),
		actorId: v.string(),
		displayName: v.string(),
		deviceId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const roomId = await ctx.db.insert('rooms', {
			name: args.name,
			createdAt: now,
			createdByActorId: args.actorId,
			latestSeq: 0,
		});

		const inviteToken = randomToken();
		await ctx.db.insert('roomInvites', {
			roomId,
			token: inviteToken,
			createdAt: now,
			expiresAt: now + Math.max(args.inviteExpiryMs, 60_000),
			createdByActorId: args.actorId,
		});

		await ctx.db.insert('roomMembers', {
			roomId,
			actorId: args.actorId,
			displayName: args.displayName,
			deviceId: args.deviceId,
			joinedAt: now,
			lastSeenAt: now,
		});

		const snapshotChunks = splitSnapshotBase64(args.initialSnapshotBase64);
		await ctx.db.insert('roomSnapshots', {
			roomId,
			seq: 0,
			snapshotBase64: snapshotChunks.length === 1 ? snapshotChunks[0] : '',
			chunkCount: snapshotChunks.length > 1 ? snapshotChunks.length : undefined,
			checksum: 'initial',
			createdAt: now,
		});
		if (snapshotChunks.length > 1) {
			for (let chunkIndex = 0; chunkIndex < snapshotChunks.length; chunkIndex += 1) {
				await ctx.db.insert('roomSnapshotChunks', {
					roomId,
					seq: 0,
					chunkIndex,
					chunkBase64: snapshotChunks[chunkIndex],
					createdAt: now,
				});
			}
		}

		return {
			roomId,
			inviteToken,
			shareLink: `galileo://collab/${inviteToken}`,
		};
	},
});
