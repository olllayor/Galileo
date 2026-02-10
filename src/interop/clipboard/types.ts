import type { Asset, Node } from '../../core/doc/types';
import type { Bounds } from '../../core/doc';

export const GALILEO_CLIPBOARD_PREFIX_V1 = 'GALILEO_CLIPBOARD_V1:';
export const GALILEO_CLIPBOARD_PREFIX_V2 = 'GALILEO_CLIPBOARD_V2:';
export const GALILEO_FIGMA_REST_PREFIX_V1 = 'GALILEO_FIGMA_REST_V1:';
export const GALILEO_FIGMA_REST_PREFIX_V2 = 'GALILEO_FIGMA_REST_V2:';

export type ClipboardPayloadV1 = {
	version: 1;
	rootIds: string[];
	nodes: Record<string, Node>;
	bounds: Bounds;
	rootWorldPositions: Record<string, { x: number; y: number }>;
	parentId: string | null;
};

export type ClipboardPayloadV2 = Omit<ClipboardPayloadV1, 'version'> & {
	version: 2;
	assets: Record<string, Asset>;
	source?: 'galileo' | 'figma-svg' | 'figma-rest';
};

export type ClipboardPayload = ClipboardPayloadV1 | ClipboardPayloadV2;

export type FigmaClipboardPayloadV1 = {
	version: 1;
	source: 'figma-plugin';
	payload: unknown;
};

export type FigmaClipboardPayloadV2 = {
	version: 2;
	source: 'figma-plugin';
	exportVersion: 'JSON_REST_V1' | 'JSON_REST_VERSIONS';
	selection: unknown[];
	metadata: {
		pageId?: string;
		pageName?: string;
		exportedAt?: number;
	};
};

export type FigmaClipboardPayload = FigmaClipboardPayloadV1 | FigmaClipboardPayloadV2;

export type ParsedClipboardPayload =
	| {
		kind: 'galileo';
		payload: ClipboardPayload;
	}
	| {
		kind: 'figma';
		payload: FigmaClipboardPayload;
	}
	| {
		kind: 'svg';
		svgText: string;
		source: 'text/html' | 'image/svg+xml' | 'text/plain';
	};
