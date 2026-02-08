export type TextAlignMode = 'left' | 'center' | 'right';
export type TextResizeMode = 'auto-width' | 'auto-height' | 'fixed';

export interface TextLayoutInput {
	text: string;
	width: number;
	height: number;
	fontSize: number;
	textAlign?: TextAlignMode;
	lineHeightPx?: number;
	letterSpacingPx?: number;
	textResizeMode?: TextResizeMode;
	paddingX?: number;
	paddingY?: number;
	minWidth?: number;
	minHeight?: number;
}

export interface TextLayoutLine {
	text: string;
	width: number;
	x: number;
	y: number;
}

export interface TextLayoutResult {
	lines: TextLayoutLine[];
	lineHeight: number;
	contentWidth: number;
	contentHeight: number;
	boxWidth: number;
	boxHeight: number;
	paddingX: number;
	paddingY: number;
	availableWidth: number;
	isOverflowing: boolean;
}

const DEFAULT_PADDING_X = 4;
const DEFAULT_PADDING_Y = 4;

const clampMin = (value: number, min: number): number => {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, value);
};

const countGlyphs = (text: string): number => Array.from(text).length;

const measureTextLineWidth = (text: string, letterSpacingPx: number, measureText: (text: string) => number): number => {
	if (text.length === 0) return 0;
	const base = clampMin(measureText(text), 0);
	if (letterSpacingPx === 0) return base;
	const glyphCount = countGlyphs(text);
	if (glyphCount <= 1) return base;
	return base + (glyphCount - 1) * letterSpacingPx;
};

const splitLongToken = (token: string, maxWidth: number, measureLine: (text: string) => number): string[] => {
	const result: string[] = [];
	let current = '';
	for (const glyph of Array.from(token)) {
		const candidate = `${current}${glyph}`;
		if (current.length === 0 || measureLine(candidate) <= maxWidth) {
			current = candidate;
			continue;
		}
		if (current.length > 0) {
			result.push(current);
		}
		current = glyph;
		if (measureLine(current) > maxWidth) {
			result.push(current);
			current = '';
		}
	}
	if (current.length > 0) {
		result.push(current);
	}
	return result.length > 0 ? result : [''];
};

const wrapLine = (rawLine: string, maxWidth: number, measureLine: (text: string) => number): string[] => {
	if (rawLine.length === 0) return [''];
	if (maxWidth <= 0) return [''];
	if (measureLine(rawLine) <= maxWidth) return [rawLine];

	const lines: string[] = [];
	const tokens = rawLine.match(/\S+\s*|\s+/g) ?? [rawLine];
	let current = '';

	for (const token of tokens) {
		if (current.length === 0 && /^\s+$/.test(token)) {
			continue;
		}

		const candidate = `${current}${token}`;
		if (current.length === 0 || measureLine(candidate) <= maxWidth) {
			current = candidate;
			continue;
		}

		const finalized = current.trimEnd();
		lines.push(finalized);
		current = token.replace(/^\s+/, '');
		if (current.length === 0) {
			continue;
		}
		if (measureLine(current) <= maxWidth) {
			continue;
		}

		const broken = splitLongToken(current, maxWidth, measureLine);
		if (broken.length > 1) {
			lines.push(...broken.slice(0, -1));
		}
		current = broken[broken.length - 1] ?? '';
	}

	const finalized = current.trimEnd();
	lines.push(finalized);
	return lines.length > 0 ? lines : [''];
};

const wrapParagraphs = (text: string, maxWidth: number, measureLine: (text: string) => number): string[] => {
	const rawLines = text.split('\n');
	if (rawLines.length === 0) return [''];

	const wrapped: string[] = [];
	for (const rawLine of rawLines) {
		const lines = wrapLine(rawLine, maxWidth, measureLine);
		wrapped.push(...lines);
	}
	return wrapped.length > 0 ? wrapped : [''];
};

export const layoutText = (input: TextLayoutInput, measureText: (text: string) => number): TextLayoutResult => {
	const mode = input.textResizeMode ?? 'auto-width';
	const textAlign = input.textAlign ?? 'left';
	const letterSpacingPx = Number.isFinite(input.letterSpacingPx) ? (input.letterSpacingPx as number) : 0;
	const paddingX = clampMin(input.paddingX ?? DEFAULT_PADDING_X, 0);
	const paddingY = clampMin(input.paddingY ?? DEFAULT_PADDING_Y, 0);
	const minWidth = clampMin(input.minWidth ?? 20, 1);
	const minHeight = clampMin(input.minHeight ?? 1, 1);
	const fontSize = clampMin(input.fontSize, 1);
	const lineHeight = clampMin(input.lineHeightPx ?? fontSize * 1.2, 1);
	const rawText = input.text ?? '';
	const baseWidth = clampMin(input.width, minWidth);
	const baseHeight = clampMin(input.height, minHeight);

	const measureLine = (line: string): number => measureTextLineWidth(line, letterSpacingPx, measureText);
	const wrapWidth = Math.max(1, baseWidth - paddingX * 2);
	const rawLines =
		mode === 'auto-width' ? (rawText.split('\n').length > 0 ? rawText.split('\n') : ['']) : wrapParagraphs(rawText, wrapWidth, measureLine);
	const lines = rawLines.length > 0 ? rawLines : [''];
	const lineWidths = lines.map((line) => measureLine(line));
	const contentWidth = lineWidths.length > 0 ? Math.max(...lineWidths, 0) : 0;
	const contentHeight = lineHeight * Math.max(lines.length, 1);

	let boxWidth = baseWidth;
	let boxHeight = baseHeight;
	if (mode === 'auto-width') {
		boxWidth = Math.max(minWidth, Math.ceil(contentWidth + paddingX * 2));
		boxHeight = Math.max(minHeight, Math.ceil(contentHeight + paddingY * 2));
	} else if (mode === 'auto-height') {
		boxWidth = Math.max(minWidth, Math.ceil(baseWidth));
		boxHeight = Math.max(minHeight, Math.ceil(contentHeight + paddingY * 2));
	}

	const alignmentWidth = mode === 'auto-width' ? contentWidth : Math.max(0, boxWidth - paddingX * 2);
	const layoutLines: TextLayoutLine[] = lines.map((line, index) => {
		const width = lineWidths[index] ?? 0;
		let x = paddingX;
		if (textAlign === 'center') {
			x = paddingX + (alignmentWidth - width) / 2;
		} else if (textAlign === 'right') {
			x = paddingX + (alignmentWidth - width);
		}
		return {
			text: line,
			width,
			x,
			y: paddingY + index * lineHeight,
		};
	});

	const isOverflowing = mode === 'fixed' && contentHeight + paddingY * 2 > boxHeight + 0.001;

	return {
		lines: layoutLines,
		lineHeight,
		contentWidth,
		contentHeight,
		boxWidth: Math.max(minWidth, boxWidth),
		boxHeight: Math.max(minHeight, boxHeight),
		paddingX,
		paddingY,
		availableWidth: mode === 'auto-width' ? contentWidth : Math.max(0, boxWidth - paddingX * 2),
		isOverflowing,
	};
};
