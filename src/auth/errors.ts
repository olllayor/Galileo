import type { AuthErrorCode } from './types';

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
	auth_cancelled: 'Sign-in was cancelled before completion.',
	auth_network_error: 'Could not reach the auth service. Check your network and try again.',
	auth_invalid_callback: 'The sign-in callback was invalid or missing. Ensure the app opens galileo://auth/callback.',
	auth_session_failed: 'Could not establish an authenticated session. Please retry.',
};

const normalizeErrorMessage = (error: unknown): string => {
	if (!error) return '';
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return '';
};

export const mapAuthErrorCode = (error: unknown): AuthErrorCode => {
	const message = normalizeErrorMessage(error).toLowerCase();

	if (
		message.includes('access_denied') ||
		message.includes('cancel') ||
		message.includes('denied') ||
		message.includes('auth_cancelled')
	) {
		return 'auth_cancelled';
	}
	if (
		message.includes('network') ||
		message.includes('fetch') ||
		message.includes('timed out') ||
		message.includes('offline')
	) {
		return 'auth_network_error';
	}
	if (
		message.includes('invalid callback') ||
		message.includes('missing code') ||
		message.includes('invalid code') ||
		message.includes('oauth')
	) {
		return 'auth_invalid_callback';
	}
	return 'auth_session_failed';
};

export const getAuthErrorMessage = (code: AuthErrorCode, fallbackError?: unknown): string => {
	const fallback = normalizeErrorMessage(fallbackError).trim();
	if (fallback) return fallback;
	return AUTH_ERROR_MESSAGES[code];
};
