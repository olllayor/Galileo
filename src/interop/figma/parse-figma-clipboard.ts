import {
	GALILEO_FIGMA_REST_PREFIX_V1,
	GALILEO_FIGMA_REST_PREFIX_V2,
	type FigmaClipboardPayload,
	type FigmaClipboardPayloadV1,
	type FigmaClipboardPayloadV2,
} from '../clipboard/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const parseFigmaClipboardText = (text: string | null): FigmaClipboardPayload | null => {
	if (!text) {
		return null;
	}

	const prefix = text.startsWith(GALILEO_FIGMA_REST_PREFIX_V2)
		? GALILEO_FIGMA_REST_PREFIX_V2
		: text.startsWith(GALILEO_FIGMA_REST_PREFIX_V1)
			? GALILEO_FIGMA_REST_PREFIX_V1
			: null;
	if (!prefix) return null;

	try {
		const parsed = JSON.parse(text.slice(prefix.length));
		if (!isRecord(parsed)) return null;
		if (parsed.source !== 'figma-plugin') {
			return null;
		}
		if (parsed.version === 1) {
			if (!('payload' in parsed)) return null;
			return parsed as FigmaClipboardPayloadV1;
		}
		if (parsed.version === 2) {
			if (!Array.isArray(parsed.selection)) return null;
			if (!isRecord(parsed.metadata)) return null;
			if (parsed.exportVersion !== 'JSON_REST_V1' && parsed.exportVersion !== 'JSON_REST_VERSIONS') {
				return null;
			}
			return parsed as FigmaClipboardPayloadV2;
		}
		return null;
	} catch {
		return null;
	}
};
