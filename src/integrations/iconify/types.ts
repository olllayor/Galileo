export const ICONIFY_API_HOSTS = [
	'https://api.iconify.design',
	'https://api.simplesvg.com',
	'https://api.unisvg.com',
] as const;

export type IconifyApiHost = (typeof ICONIFY_API_HOSTS)[number];

export type IconifyClientErrorCode =
	| 'iconify_unavailable'
	| 'iconify_timeout'
	| 'iconify_invalid_params'
	| 'iconify_not_found';

export class IconifyClientError extends Error {
	code: IconifyClientErrorCode;

	constructor(code: IconifyClientErrorCode, message: string) {
		super(message);
		this.name = 'IconifyClientError';
		this.code = code;
	}
}

export type IconifySearchOptions = {
	limit?: number;
	start?: number;
	prefix?: string;
	prefixes?: string[];
	category?: string;
};

export type IconifySearchResponse = {
	icons: string[];
	limit?: number;
	start?: number;
	total?: number;
};

export type IconifyCollectionsOptions = {
	prefix?: string;
	prefixes?: string[];
};

export type IconifyCollectionInfo = {
	name?: string;
	total?: number;
	category?: string;
	palette?: boolean;
	license?: {
		title?: string;
		spdx?: string;
		url?: string;
	};
	author?: {
		name?: string;
		url?: string;
	};
	aliases?: number;
	chars?: number;
};

export type IconifyCollectionsResponse = Record<string, IconifyCollectionInfo>;

export type IconifyCollectionResponse = {
	prefix: string;
	icons?: string[];
	uncategorized?: string[];
	hidden?: string[];
	aliases?: Record<string, unknown>;
	chars?: Record<string, string | string[]>;
	categories?: Record<string, string[]>;
	info?: IconifyCollectionInfo;
};

export type IconifyIconDataResponse = {
	prefix: string;
	icons: Record<string, Record<string, unknown>>;
	aliases?: Record<string, Record<string, unknown>>;
	not_found?: string[];
};

export type IconifyCustomizations = {
	color?: string;
	width?: string | number;
	height?: string | number;
	rotate?: string | number;
	flip?: string;
	box?: boolean;
};

export type IconifyRenderSvgResult = {
	svg: string;
	host: string;
	url: string;
};

export type IconifyKeywordsOptions = {
	prefix?: string;
	keyword?: string;
};

export type IconifyKeywordsResponse = {
	keywords: string[];
};

export type IconifyLastModifiedResponse = Record<string, number>;
