const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export default {
	providers: [
		{
			domain: env.CONVEX_SITE_URL,
			applicationID: 'convex',
		},
	],
};
