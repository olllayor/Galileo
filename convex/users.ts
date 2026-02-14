import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

const sessionShape = {
	userId: v.string(),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	provider: v.literal('google'),
	issuedAt: v.number(),
	expiresAt: v.optional(v.number()),
};

export const upsertCurrentUser = mutation({
	args: {},
	returns: v.object(sessionShape),
	handler: async (ctx) => {
		const authUserId = await getAuthUserId(ctx);
		if (!authUserId) {
			throw new ConvexError({
				code: 'UNAUTHENTICATED',
				message: 'Sign in is required.',
			});
		}

		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({
				code: 'UNAUTHENTICATED',
				message: 'Missing auth identity.',
			});
		}

		const now = Date.now();
		const existing = await ctx.db
			.query('userProfiles')
			.withIndex('by_auth_user_id', (q) => q.eq('authUserId', authUserId))
			.unique();

		const patch = {
			email: identity.email ?? undefined,
			name: identity.name ?? undefined,
			avatarUrl: identity.pictureUrl ?? undefined,
			provider: 'google' as const,
			updatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
		} else {
			await ctx.db.insert('userProfiles', {
				authUserId,
				...patch,
				createdAt: now,
			});
		}

		return {
			userId: String(authUserId),
			email: patch.email,
			name: patch.name,
			avatarUrl: patch.avatarUrl,
			provider: 'google' as const,
			issuedAt: typeof identity.iat === 'number' ? identity.iat * 1000 : now,
			...(typeof identity.exp === 'number' ? { expiresAt: identity.exp * 1000 } : {}),
		};
	},
});

export const currentSession = query({
	args: {},
	returns: v.union(v.null(), v.object(sessionShape)),
	handler: async (ctx) => {
		const authUserId = await getAuthUserId(ctx);
		if (!authUserId) return null;

		const identity = await ctx.auth.getUserIdentity();
		const existing = await ctx.db
			.query('userProfiles')
			.withIndex('by_auth_user_id', (q) => q.eq('authUserId', authUserId))
			.unique();
		const now = Date.now();

		return {
			userId: String(authUserId),
			email: existing?.email ?? identity?.email ?? undefined,
			name: existing?.name ?? identity?.name ?? undefined,
			avatarUrl: existing?.avatarUrl ?? identity?.pictureUrl ?? undefined,
			provider: 'google' as const,
			issuedAt: typeof identity?.iat === 'number' ? identity.iat * 1000 : now,
			...(typeof identity?.exp === 'number' ? { expiresAt: identity.exp * 1000 } : {}),
		};
	},
});
