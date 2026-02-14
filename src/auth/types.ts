export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'error';

export type AuthProvider = 'google';

export type AuthSession = {
	userId: string;
	email?: string;
	name?: string;
	avatarUrl?: string;
	provider: AuthProvider;
	issuedAt: number;
	expiresAt?: number;
};

export type AuthErrorCode =
	| 'auth_cancelled'
	| 'auth_network_error'
	| 'auth_invalid_callback'
	| 'auth_session_failed';

export type AuthStateSnapshot = {
	status: AuthStatus;
	session: AuthSession | null;
	errorCode: AuthErrorCode | null;
	errorMessage: string | null;
};

export type AuthStateListener = (state: AuthStateSnapshot) => void;

export type Unsubscribe = () => void;

export type AuthService = {
	signInWithGoogle: () => Promise<void>;
	signOut: () => Promise<void>;
	completeSignInFromCallback: (input: string) => Promise<void>;
	getSession: () => AuthSession | null;
	onAuthStateChange: (listener: AuthStateListener) => Unsubscribe;
};
