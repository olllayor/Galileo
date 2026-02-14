import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			clientId: env.AUTH_GOOGLE_ID,
			clientSecret: env.AUTH_GOOGLE_SECRET,
		}),
	],
	callbacks: {
		async redirect({ redirectTo }) {
			const siteUrl = env.SITE_URL;
			if (redirectTo.startsWith('galileo://auth/callback')) return redirectTo;
			if (redirectTo.startsWith('/')) return redirectTo;
			if (!siteUrl) return redirectTo;
			try {
				const siteOrigin = new URL(siteUrl).origin;
				const redirectOrigin = new URL(redirectTo).origin;
				if (redirectOrigin === siteOrigin) return redirectTo;
			} catch {
				// Ignore parse failures and fall back to SITE_URL below.
			}
			return siteUrl;
		},
	},
});
