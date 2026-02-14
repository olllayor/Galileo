import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { useConvex, useConvexAuth } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { open as openExternalUrl } from '@tauri-apps/plugin-shell';
import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { mapAuthErrorCode, getAuthErrorMessage } from './errors';
import { parseJwtClaims } from './jwt';
import { convexTokenStorage, getNamespacedAuthStorageKey } from './secure-token-storage';
import type {
	AuthErrorCode,
	AuthService,
	AuthSession,
	AuthStateListener,
	AuthStateSnapshot,
	AuthStatus,
	Unsubscribe,
} from './types';

const CONVEX_OAUTH_VERIFIER_KEY = '__convexAuthOAuthVerifier';
const AUTH_REDIRECT_URI = 'galileo://auth/callback';
const AUTH_CALLBACK_TIMEOUT_MS = 120000;
const AUTH_DEEP_LINK_EVENT = 'galileo-auth://deep-link';

const authSignInAction = makeFunctionReference<
	'action',
	{
		provider?: string;
		params?: Record<string, unknown>;
		verifier?: string;
	},
	unknown
>('auth:signIn');

const upsertCurrentUserMutation = makeFunctionReference<'mutation', Record<string, never>, ServerSessionPayload>(
	'users:upsertCurrentUser',
);
const currentSessionQuery = makeFunctionReference<'query', Record<string, never>, ServerSessionPayload | null>(
	'users:currentSession',
);

type ServerSessionPayload = {
	userId: string;
	email?: string;
	name?: string;
	avatarUrl?: string;
	provider?: 'google';
	issuedAt?: number;
	expiresAt?: number;
};

type AuthContextValue = AuthStateSnapshot & {
	service: AuthService;
};

const defaultAuthState: AuthStateSnapshot = {
	status: 'signed-out',
	session: null,
	errorCode: null,
	errorMessage: null,
};

const noopAsync = async () => {
	return;
};

const defaultAuthService: AuthService = {
	signInWithGoogle: noopAsync,
	signOut: noopAsync,
	completeSignInFromCallback: noopAsync,
	getSession: () => null,
	onAuthStateChange: () => () => {
		return;
	},
};

const AuthContext = createContext<AuthContextValue>({
	...defaultAuthState,
	service: defaultAuthService,
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const getString = (value: unknown): string | undefined => {
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const getNumber = (value: unknown): number | undefined => {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const toServerSession = (value: unknown): ServerSessionPayload | null => {
	if (!isRecord(value)) return null;
	const userId = getString(value.userId);
	if (!userId) return null;
	const providerRaw = getString(value.provider);
	return {
		userId,
		email: getString(value.email),
		name: getString(value.name),
		avatarUrl: getString(value.avatarUrl),
		provider: providerRaw === 'google' ? 'google' : undefined,
		issuedAt: getNumber(value.issuedAt),
		expiresAt: getNumber(value.expiresAt),
	};
};

const buildSessionFromToken = (token: string | null): AuthSession | null => {
	const claims = parseJwtClaims(token);
	if (!claims?.sub) return null;
	const issuedAt = typeof claims.iat === 'number' ? claims.iat * 1000 : Date.now();
	const expiresAt = typeof claims.exp === 'number' ? claims.exp * 1000 : undefined;
	return {
		userId: claims.sub,
		email: claims.email,
		name: claims.name,
		avatarUrl: claims.picture,
		provider: 'google',
		issuedAt,
		...(expiresAt ? { expiresAt } : {}),
	};
};

const parseOAuthStartResult = (value: unknown): { redirect?: string; verifier?: string; signingIn?: boolean } => {
	if (!isRecord(value)) return {};
	return {
		redirect: getString(value.redirect),
		verifier: getString(value.verifier),
		signingIn: typeof value.signingIn === 'boolean' ? value.signingIn : undefined,
	};
};

const parseCodeFromSearchAndHash = (url: URL): { code?: string; error?: string } => {
	const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
	const hashParams = new URLSearchParams(hash);
	const code = getString(url.searchParams.get('code')) ?? getString(hashParams.get('code'));
	const error = getString(url.searchParams.get('error')) ?? getString(hashParams.get('error'));
	return { code, error };
};

const parseCodeFromAuthInput = (input: string): { code?: string; error?: string } => {
	const trimmed = input.trim();
	if (!trimmed) return {};
	try {
		const parsed = new URL(trimmed);
		return parseCodeFromSearchAndHash(parsed);
	} catch {
		// If it's not a URL, assume user pasted the code directly.
		if (trimmed.toLowerCase().startsWith('error=')) {
			return { error: trimmed.slice('error='.length) };
		}
		return { code: trimmed };
	}
};

const toStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const parseGalileoAuthCallback = (value: string): { url: URL; code?: string; error?: string } | null => {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'galileo:') return null;
	const { code, error } = parseCodeFromSearchAndHash(parsed);
	return { url: parsed, code, error };
};

const openExternal = async (url: string): Promise<void> => {
	try {
		await openExternalUrl(url);
		return;
	} catch {
		if (typeof window !== 'undefined') {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	}
};

const DisabledAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [state, setState] = useState<AuthStateSnapshot>(defaultAuthState);
	const listenersRef = useRef(new Set<AuthStateListener>());
	const stateRef = useRef<AuthStateSnapshot>(state);

	useEffect(() => {
		stateRef.current = state;
		for (const listener of listenersRef.current) {
			listener(state);
		}
	}, [state]);

	const service = useMemo<AuthService>(() => {
		return {
			signInWithGoogle: async () => {
				const code: AuthErrorCode = 'auth_session_failed';
				setState({
					status: 'error',
					session: null,
					errorCode: code,
					errorMessage: 'Auth is disabled. Set VITE_CONVEX_URL to enable sign-in.',
				});
			},
			signOut: async () => {
				setState(defaultAuthState);
			},
			completeSignInFromCallback: async () => {
				const code: AuthErrorCode = 'auth_session_failed';
				setState({
					status: 'error',
					session: null,
					errorCode: code,
					errorMessage: 'Auth is disabled. Set VITE_CONVEX_URL to enable sign-in.',
				});
			},
			getSession: () => stateRef.current.session,
			onAuthStateChange: (listener) => {
				listenersRef.current.add(listener);
				listener(stateRef.current);
				return () => {
					listenersRef.current.delete(listener);
				};
			},
		};
	}, []);

	return <AuthContext.Provider value={{ ...state, service }}>{children}</AuthContext.Provider>;
};

const EnabledAuthProvider: React.FC<{ children: React.ReactNode; convexUrl: string }> = ({ children, convexUrl }) => {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const { signIn, signOut } = useAuthActions();
	const signInWithOptionalProvider = signIn as unknown as (
		provider?: string,
		params?: Record<string, unknown>,
	) => Promise<{ signingIn: boolean; redirect?: URL }>;
	const token = useAuthToken();
	const convex = useConvex();
	const [status, setStatus] = useState<AuthStatus>('signed-out');
	const [session, setSession] = useState<AuthSession | null>(null);
	const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [oauthInFlight, setOAuthInFlight] = useState(false);
	const oauthInFlightRef = useRef(oauthInFlight);
	const handledCodesRef = useRef(new Set<string>());
	const invalidCallbackWarningRef = useRef(new Set<string>());
	const authTimeoutRef = useRef<number | null>(null);
	const listenersRef = useRef(new Set<AuthStateListener>());
	const snapshotRef = useRef<AuthStateSnapshot>({ status, session, errorCode, errorMessage });
	const verifierKey = useMemo(() => getNamespacedAuthStorageKey(CONVEX_OAUTH_VERIFIER_KEY, convexUrl), [convexUrl]);

	useEffect(() => {
		oauthInFlightRef.current = oauthInFlight;
	}, [oauthInFlight]);

	const setAuthError = useCallback((error: unknown, fallbackCode?: AuthErrorCode) => {
		const code = fallbackCode ?? mapAuthErrorCode(error);
		setErrorCode(code);
		setErrorMessage(getAuthErrorMessage(code, error));
		setStatus('error');
	}, []);

	const clearAuthError = useCallback(() => {
		setErrorCode(null);
		setErrorMessage(null);
	}, []);

	const clearAuthTimeout = useCallback(() => {
		if (authTimeoutRef.current !== null) {
			window.clearTimeout(authTimeoutRef.current);
			authTimeoutRef.current = null;
		}
	}, []);

	const armAuthTimeout = useCallback(() => {
		clearAuthTimeout();
		authTimeoutRef.current = window.setTimeout(() => {
			setOAuthInFlight(false);
			setAuthError(new Error('auth_cancelled: timed out waiting for callback'), 'auth_cancelled');
		}, AUTH_CALLBACK_TIMEOUT_MS);
	}, [clearAuthTimeout, setAuthError]);

	const syncSessionFromBackend = useCallback(async (): Promise<AuthSession | null> => {
		const tokenSession = buildSessionFromToken(token);
		if (!isAuthenticated) {
			setSession(null);
			return null;
		}
		if (!tokenSession) {
			throw new Error('auth_session_failed: missing token subject');
		}

		let remoteSession = toServerSession(await convex.query(currentSessionQuery, {}));
		if (!remoteSession) {
			await convex.mutation(upsertCurrentUserMutation, {});
			remoteSession = toServerSession(await convex.query(currentSessionQuery, {}));
		}

		if (!remoteSession) {
			setSession(tokenSession);
			return tokenSession;
		}

		const nextSession: AuthSession = {
			userId: remoteSession.userId,
			email: remoteSession.email ?? tokenSession.email,
			name: remoteSession.name ?? tokenSession.name,
			avatarUrl: remoteSession.avatarUrl ?? tokenSession.avatarUrl,
			provider: remoteSession.provider ?? 'google',
			issuedAt: remoteSession.issuedAt ?? tokenSession.issuedAt,
			...(remoteSession.expiresAt ? { expiresAt: remoteSession.expiresAt } : tokenSession.expiresAt ? { expiresAt: tokenSession.expiresAt } : {}),
		};
		setSession(nextSession);
		return nextSession;
	}, [convex, isAuthenticated, token]);

	const processAuthCallback = useCallback(
		async (url: URL) => {
			clearAuthTimeout();
			const { code, error: authError } = parseCodeFromSearchAndHash(url);
			if (authError) {
				setOAuthInFlight(false);
				setAuthError(authError, authError === 'access_denied' ? 'auth_cancelled' : 'auth_invalid_callback');
				return;
			}

			if (!code) {
				setOAuthInFlight(false);
				setAuthError(new Error('auth_invalid_callback: missing code'), 'auth_invalid_callback');
				return;
			}
			if (handledCodesRef.current.has(code)) return;
			handledCodesRef.current.add(code);

			setStatus('signing-in');
			clearAuthError();
			try {
				await signInWithOptionalProvider(undefined, { code });
				await syncSessionFromBackend();
				setOAuthInFlight(false);
				setStatus('signed-in');
			} catch (error) {
				setOAuthInFlight(false);
				setAuthError(error, 'auth_session_failed');
			}
		},
		[clearAuthError, clearAuthTimeout, setAuthError, signInWithOptionalProvider, syncSessionFromBackend],
	);

	const fetchNativeDeepLinkQueue = useCallback(async (): Promise<string[]> => {
		try {
			return toStringArray(await invoke<unknown>('auth_last_deep_link_get'));
		} catch {
			return [];
		}
	}, []);

	const ingestAuthUrl = useCallback(
		async (value: string, source: string) => {
			const parsed = parseGalileoAuthCallback(value);
			if (!parsed) return;
			if (parsed.code || parsed.error) {
				await processAuthCallback(parsed.url);
				return;
			}

			// The app received a galileo:// deep link without an exchangeable auth payload.
			// Keep the flow active, but show a concrete recovery hint.
			if (!oauthInFlightRef.current) return;
			const warningKey = `${source}:${value}`;
			if (invalidCallbackWarningRef.current.has(warningKey)) return;
			invalidCallbackWarningRef.current.add(warningKey);
			setErrorCode('auth_invalid_callback');
			setErrorMessage(
				'Received an auth callback without a code. Paste the full galileo:// callback URL (or just code) below to finish sign-in.',
			);
		},
		[processAuthCallback],
	);

	useEffect(() => {
		let disposed = false;
		let unlistenOpenUrl: (() => void) | null = null;
		let unlistenNativeEvent: (() => void) | null = null;

		const ingestUrls = async (values: string[], source: string) => {
			if (disposed) return;
			for (const value of values) {
				if (disposed) return;
				await ingestAuthUrl(value, source);
			}
		};

		void (async () => {
			const startupNativeLinks = await fetchNativeDeepLinkQueue();
			if (startupNativeLinks.length > 0) {
				await ingestUrls(startupNativeLinks, 'native-command:start');
			}

			try {
				const current = await getCurrent();
				if (Array.isArray(current)) {
					await ingestUrls(current, 'deep-link:getCurrent');
				}

				unlistenOpenUrl = await onOpenUrl((urls) => {
					void ingestUrls(urls, 'deep-link:onOpenUrl');
				});
			} catch {
				// No-op: deep link plugin can be unavailable in browser-only runs.
			}

			try {
				unlistenNativeEvent = await listen<{ urls?: unknown; url?: unknown }>(AUTH_DEEP_LINK_EVENT, (event) => {
					const urls = [
						...toStringArray(event.payload?.urls),
						...(typeof event.payload?.url === 'string' ? [event.payload.url] : []),
					];
					if (urls.length === 0) return;
					void ingestUrls(urls, 'native-event');
				});
			} catch {
				// No-op: event API can be unavailable in browser-only runs.
			}
		})();

		return () => {
			disposed = true;
			clearAuthTimeout();
			if (unlistenOpenUrl) {
				unlistenOpenUrl();
			}
			if (unlistenNativeEvent) {
				unlistenNativeEvent();
			}
		};
	}, [clearAuthTimeout, fetchNativeDeepLinkQueue, ingestAuthUrl]);

	useEffect(() => {
		if (!oauthInFlight) return;
		let disposed = false;
		const interval = window.setInterval(() => {
			void (async () => {
				if (disposed) return;
				try {
					const [current, nativeQueuedLinks] = await Promise.all([
						getCurrent().catch(() => [] as string[]),
						fetchNativeDeepLinkQueue(),
					]);
					if (Array.isArray(current)) {
						for (const value of current) {
							await ingestAuthUrl(value, 'deep-link:poll');
						}
					}
					for (const value of nativeQueuedLinks) {
						await ingestAuthUrl(value, 'native-command:poll');
					}
				} catch {
					// Ignore polling errors.
				}
			})();
		}, 1500);

		return () => {
			disposed = true;
			window.clearInterval(interval);
		};
	}, [fetchNativeDeepLinkQueue, ingestAuthUrl, oauthInFlight]);

	useEffect(() => {
		if (isLoading) {
			setStatus((current) => (current === 'signing-in' ? current : 'signing-in'));
			return;
		}
		if (!isAuthenticated) {
			setSession(null);
			if (oauthInFlight) {
				setStatus('signing-in');
				return;
			}
			setStatus((current) => (current === 'error' ? current : 'signed-out'));
			return;
		}

		void (async () => {
			try {
				await syncSessionFromBackend();
				setStatus('signed-in');
				setOAuthInFlight(false);
				clearAuthTimeout();
				clearAuthError();
			} catch (error) {
				setAuthError(error, 'auth_session_failed');
			}
		})();
	}, [clearAuthError, clearAuthTimeout, isAuthenticated, isLoading, oauthInFlight, setAuthError, syncSessionFromBackend]);

	const signInWithGoogle = useCallback(async () => {
		handledCodesRef.current.clear();
		invalidCallbackWarningRef.current.clear();
		setStatus('signing-in');
		setOAuthInFlight(true);
		clearAuthError();
		try {
			const http = new ConvexHttpClient(convexUrl);
			const response = parseOAuthStartResult(
				await http.action(authSignInAction, {
					provider: 'google',
					params: {
						redirectTo: AUTH_REDIRECT_URI,
					},
				}),
			);
			if (!response.redirect || !response.verifier) {
				throw new Error('auth_session_failed: auth provider did not return a redirect URL');
			}
			await convexTokenStorage.setItem(verifierKey, response.verifier);
			armAuthTimeout();
			await openExternal(response.redirect);
		} catch (error) {
			setOAuthInFlight(false);
			clearAuthTimeout();
			setAuthError(error);
		}
	}, [armAuthTimeout, clearAuthError, clearAuthTimeout, convexUrl, setAuthError, verifierKey]);

	const signOutCurrentUser = useCallback(async () => {
		if (!isAuthenticated) {
			setOAuthInFlight(false);
			clearAuthTimeout();
			clearAuthError();
			setSession(null);
			setStatus('signed-out');
			return;
		}
		try {
			await signOut();
			setOAuthInFlight(false);
			clearAuthTimeout();
			setSession(null);
			clearAuthError();
			setStatus('signed-out');
		} catch (error) {
			setAuthError(error);
		}
	}, [clearAuthError, clearAuthTimeout, isAuthenticated, setAuthError, signOut]);

	const completeSignInFromCallback = useCallback(
		async (input: string) => {
			clearAuthTimeout();
			setOAuthInFlight(true);
			setStatus('signing-in');
			clearAuthError();

			const parsed = parseCodeFromAuthInput(input);
			if (parsed.error) {
				setOAuthInFlight(false);
				setAuthError(parsed.error, parsed.error === 'access_denied' ? 'auth_cancelled' : 'auth_invalid_callback');
				return;
			}
			if (!parsed.code) {
				setOAuthInFlight(false);
				setAuthError(new Error('auth_invalid_callback: missing code'), 'auth_invalid_callback');
				return;
			}
			if (handledCodesRef.current.has(parsed.code)) {
				return;
			}
			handledCodesRef.current.add(parsed.code);

			try {
				await signInWithOptionalProvider(undefined, { code: parsed.code });
				await syncSessionFromBackend();
				setOAuthInFlight(false);
				setStatus('signed-in');
			} catch (error) {
				setOAuthInFlight(false);
				setAuthError(error, 'auth_session_failed');
			}
		},
		[clearAuthError, clearAuthTimeout, setAuthError, signInWithOptionalProvider, syncSessionFromBackend],
	);

	const snapshot = useMemo<AuthStateSnapshot>(
		() => ({
			status,
			session,
			errorCode,
			errorMessage,
		}),
		[errorCode, errorMessage, session, status],
	);

	useEffect(() => {
		snapshotRef.current = snapshot;
		for (const listener of listenersRef.current) {
			listener(snapshot);
		}
	}, [snapshot]);

	const service = useMemo<AuthService>(() => {
		return {
			signInWithGoogle,
			signOut: signOutCurrentUser,
			completeSignInFromCallback,
			getSession: () => snapshotRef.current.session,
			onAuthStateChange: (listener): Unsubscribe => {
				listenersRef.current.add(listener);
				listener(snapshotRef.current);
				return () => {
					listenersRef.current.delete(listener);
				};
			},
		};
	}, [completeSignInFromCallback, signInWithGoogle, signOutCurrentUser]);

	return <AuthContext.Provider value={{ ...snapshot, service }}>{children}</AuthContext.Provider>;
};

export const GalileoAuthProvider: React.FC<{ children: React.ReactNode; convexUrl?: string | null }> = ({
	children,
	convexUrl,
}) => {
	if (!convexUrl) {
		return <DisabledAuthProvider>{children}</DisabledAuthProvider>;
	}
	return <EnabledAuthProvider convexUrl={convexUrl}>{children}</EnabledAuthProvider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useGalileoAuth = (): AuthContextValue => {
	return useContext(AuthContext);
};
