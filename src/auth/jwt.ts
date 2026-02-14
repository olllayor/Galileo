export type JwtClaims = {
	sub?: string;
	email?: string;
	name?: string;
	picture?: string;
	iat?: number;
	exp?: number;
};

const decodeBase64Url = (value: string): string | null => {
	if (!value) return null;
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const withPadding = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	if (typeof window === 'undefined' || typeof window.atob !== 'function') {
		return null;
	}
	try {
		return window.atob(withPadding);
	} catch {
		return null;
	}
};

export const parseJwtClaims = (token: string | null): JwtClaims | null => {
	if (!token) return null;
	const parts = token.split('.');
	if (parts.length < 2) return null;
	const payload = decodeBase64Url(parts[1]);
	if (!payload) return null;
	try {
		const parsed = JSON.parse(payload) as JwtClaims;
		return parsed;
	} catch {
		return null;
	}
};
