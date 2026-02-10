import type { Bounds } from './geometry';
import { resolveGridStyle } from './styles';
import type { Document } from './types';
import type { LayoutGuide, LayoutGuideType, Node } from './types';

export type LayoutGuideLine = { orientation: 'vertical' | 'horizontal'; value: number };
export type LayoutGuideTargets = { x: number[]; y: number[] };

const DEFAULT_GRID = { size: 8 };
const DEFAULT_COLUMNS = { count: 12, gutter: 16, margin: 16 };
const DEFAULT_ROWS = { count: 8, gutter: 16, margin: 16 };

const resolveGuideType = (guide?: LayoutGuide | null): LayoutGuideType | null => {
	if (!guide) return null;
	return guide.type;
};

const clampPositive = (value: number, fallback: number): number => {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(1, value);
};

const clampNonNegative = (value: number, fallback: number): number => {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(0, value);
};

export const resolveNodeLayoutGuides = (doc: Document, node: Node): LayoutGuide | undefined => {
	return resolveGridStyle(doc, node.gridStyleId) ?? node.layoutGuides;
};

export const computeLayoutGuideLines = (frame: Node, frameBounds: Bounds, resolvedGuides?: LayoutGuide): LayoutGuideLine[] => {
	if (frame.type !== 'frame') return [];
	const guides = resolvedGuides ?? frame.layoutGuides;
	if (!guides) return [];
	if (guides.visible === false) return [];

	const type = resolveGuideType(guides);
	if (!type) return [];

	const lines: LayoutGuideLine[] = [];
	const { x, y, width, height } = frameBounds;

	if (type === 'grid') {
		const size = clampPositive(guides.grid?.size ?? DEFAULT_GRID.size, DEFAULT_GRID.size);
		if (size <= 0) return lines;
		for (let gx = x; gx <= x + width + 0.001; gx += size) {
			lines.push({ orientation: 'vertical', value: gx });
		}
		for (let gy = y; gy <= y + height + 0.001; gy += size) {
			lines.push({ orientation: 'horizontal', value: gy });
		}
		return lines;
	}

	if (type === 'columns') {
		const count = Math.max(1, Math.round(guides.columns?.count ?? DEFAULT_COLUMNS.count));
		const gutter = clampNonNegative(guides.columns?.gutter ?? DEFAULT_COLUMNS.gutter, DEFAULT_COLUMNS.gutter);
		const margin = clampNonNegative(guides.columns?.margin ?? DEFAULT_COLUMNS.margin, DEFAULT_COLUMNS.margin);
		const available = width - margin * 2 - gutter * (count - 1);
		const columnWidth = clampPositive(available / count, 1);
		for (let i = 0; i < count; i += 1) {
			const left = x + margin + i * (columnWidth + gutter);
			const right = left + columnWidth;
			lines.push({ orientation: 'vertical', value: left });
			lines.push({ orientation: 'vertical', value: right });
		}
		return lines;
	}

	if (type === 'rows') {
		const count = Math.max(1, Math.round(guides.rows?.count ?? DEFAULT_ROWS.count));
		const gutter = clampNonNegative(guides.rows?.gutter ?? DEFAULT_ROWS.gutter, DEFAULT_ROWS.gutter);
		const margin = clampNonNegative(guides.rows?.margin ?? DEFAULT_ROWS.margin, DEFAULT_ROWS.margin);
		const available = height - margin * 2 - gutter * (count - 1);
		const rowHeight = clampPositive(available / count, 1);
		for (let i = 0; i < count; i += 1) {
			const top = y + margin + i * (rowHeight + gutter);
			const bottom = top + rowHeight;
			lines.push({ orientation: 'horizontal', value: top });
			lines.push({ orientation: 'horizontal', value: bottom });
		}
	}

	return lines;
};

export const buildLayoutGuideTargets = (frame: Node, frameBounds: Bounds, resolvedGuides?: LayoutGuide): LayoutGuideTargets => {
	const lines = computeLayoutGuideLines(frame, frameBounds, resolvedGuides);
	const xSet = new Set<number>();
	const ySet = new Set<number>();
	for (const line of lines) {
		if (line.orientation === 'vertical') {
			xSet.add(line.value);
		} else {
			ySet.add(line.value);
		}
	}
	return { x: Array.from(xSet), y: Array.from(ySet) };
};

export const createDefaultLayoutGuides = (type: LayoutGuideType): LayoutGuide => {
	if (type === 'grid') {
		return { type, visible: true, grid: { ...DEFAULT_GRID } };
	}
	if (type === 'columns') {
		return { type, visible: true, columns: { ...DEFAULT_COLUMNS } };
	}
	return { type, visible: true, rows: { ...DEFAULT_ROWS } };
};
