/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_GALILEO_AI_API_BASE_URL?: string;
	readonly VITE_GALILEO_AI_CLIENT_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
