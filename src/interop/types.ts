export type InteropWarningCode =
	| 'unsupported_feature'
	| 'invalid_payload'
	| 'parse_error'
	| 'unsupported_node'
	| 'rasterized_fallback'
	| 'network_error';

export type FigmaImportWarning = {
	code: InteropWarningCode;
	message: string;
	nodeId?: string;
};

export type FigmaImportResult = {
	importedLayerCount: number;
	warnings: FigmaImportWarning[];
	pageName?: string;
};

export type SvgImportResult = {
	importedLayerCount: number;
	warnings: FigmaImportWarning[];
};

export type InteropImportMode = 'editable' | 'raster-fallback';

export type InteropImportSource = 'figma-plugin' | 'figma-pat' | 'figma-svg';

export type InteropImportReport = {
	source: InteropImportSource;
	mode: InteropImportMode;
	reasons: string[];
	warningCount: number;
	importedLayerCount: number;
};

export type SvgComplexityReport = {
	isComplex: boolean;
	score: number;
	reasons: string[];
};
