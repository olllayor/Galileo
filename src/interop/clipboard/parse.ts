import {
	GALILEO_CLIPBOARD_PREFIX_V1,
	GALILEO_CLIPBOARD_PREFIX_V2,
	type ClipboardPayload,
	type ClipboardPayloadV1,
	type ClipboardPayloadV2,
	type ParsedClipboardPayload,
} from './types';
import { parseFigmaClipboardText } from '../figma/parse-figma-clipboard';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const parseJson = (raw: string): unknown => {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const validateClipboardPayloadV1 = (value: unknown): value is ClipboardPayloadV1 => {
	if (!isRecord(value)) return false;
	return (
		value.version === 1 &&
		Array.isArray(value.rootIds) &&
		isRecord(value.nodes) &&
		isRecord(value.bounds) &&
		isRecord(value.rootWorldPositions)
	);
};

const validateClipboardPayloadV2 = (value: unknown): value is ClipboardPayloadV2 => {
	if (!isRecord(value)) return false;
	return validateClipboardPayloadV1({ ...value, version: 1 }) && value.version === 2 && isRecord(value.assets);
};

export const parseGalileoClipboardPayload = (text: string | null): ClipboardPayload | null => {
	if (!text) return null;
	if (text.startsWith(GALILEO_CLIPBOARD_PREFIX_V2)) {
		const parsed = parseJson(text.slice(GALILEO_CLIPBOARD_PREFIX_V2.length));
		return validateClipboardPayloadV2(parsed) ? parsed : null;
	}
	if (text.startsWith(GALILEO_CLIPBOARD_PREFIX_V1)) {
		const parsed = parseJson(text.slice(GALILEO_CLIPBOARD_PREFIX_V1.length));
		return validateClipboardPayloadV1(parsed) ? parsed : null;
	}
	return null;
};

export const parseFigmaClipboardPayload = parseFigmaClipboardText;

const isSvgText = (value: string | null): boolean => {
	if (!value) return false;
	const trimmed = value.trim();
	if (!trimmed) return false;
	return /^<svg[\s\S]*<\/svg>$/i.test(trimmed) || /^<svg[\s\S]*\/>$/i.test(trimmed);
};

export const extractSvgFromHtml = (htmlText: string | null): string | null => {
	if (!htmlText) return null;
	const match = htmlText.match(/<svg[\s\S]*?<\/svg>/i);
	if (!match) return null;
	return match[0];
};

export const parseClipboardByPriority = (clipboardData: DataTransfer): ParsedClipboardPayload | null => {
	const customText = clipboardData.getData('application/x-galileo') || clipboardData.getData('text/plain');
	const galileo = parseGalileoClipboardPayload(customText);
	if (galileo) {
		return { kind: 'galileo', payload: galileo };
	}

	const figmaPayload = parseFigmaClipboardPayload(customText);
	if (figmaPayload) {
		return { kind: 'figma', payload: figmaPayload };
	}

	const html = clipboardData.getData('text/html');
	const svgFromHtml = extractSvgFromHtml(html);
	if (svgFromHtml) {
		return { kind: 'svg', svgText: svgFromHtml, source: 'text/html' };
	}

	const svgMime = clipboardData.getData('image/svg+xml');
	if (isSvgText(svgMime)) {
		return { kind: 'svg', svgText: svgMime, source: 'image/svg+xml' };
	}

	const plainText = clipboardData.getData('text/plain');
	if (isSvgText(plainText)) {
		return { kind: 'svg', svgText: plainText, source: 'text/plain' };
	}

	return null;
};
