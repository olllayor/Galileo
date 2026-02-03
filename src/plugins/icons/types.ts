export type Icon = {
	id: string;
	name: string;
	provider: string;
	previewUrl: string;
	keywords?: string[];
};

export type IconVariant = {
	style: string;
	angle: string;
	previewUrl: string;
};

export type IconRenderParams = {
	provider: string;
	iconId: string;
	style: string;
	angle: string;
	size: number;
};

export type IconRenderResult = {
	mime: string;
	dataBase64: string;
	width: number;
	height: number;
	providerVersion: string;
	renderVersion: string;
	sourceUrl?: string;
};

export type IconProvider = {
	id: string;
	name: string;
	search: (query?: string) => Promise<Icon[]>;
	getVariants: (iconId: string) => Promise<IconVariant[]>;
	render: (params: IconRenderParams) => Promise<IconRenderResult>;
};
