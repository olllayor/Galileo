import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
	...authTables,
	userProfiles: defineTable({
		authUserId: v.id('users'),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
		provider: v.literal('google'),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index('by_auth_user_id', ['authUserId']),
});
