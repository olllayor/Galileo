import type { Bounds } from '../../core/doc';
import type { Asset, Color, Node, Stroke } from '../../core/doc/types';
import type { ClipboardPayloadV2 } from '../clipboard/types';
import { parseDataUrl } from '../utils/data-url';
import type { FigmaImportWarning, SvgImportResult } from '../types';
import { parseSvgDocument } from './parse-svg';

type MapSvgOptions = {
	generateId: () => string;
	name?: string;
};

export type SvgToClipboardMapResult = {
	payload: ClipboardPayloadV2 | null;
	warnings: FigmaImportWarning[];
	importedLayerCount: number;
	fallbackRasterize: boolean;
};

const SVG_SKIPPED_TAGS = new Set(['defs', 'clipPath', 'mask', 'filter', 'style', 'metadata', 'title', 'desc']);

const parseNumber = (value: string | null | undefined, fallback = 0): number => {
	if (!value) return fallback;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const isHiddenElement = (element: Element): boolean => {
	const style = parseStyleMap(element);
	return (
		element.getAttribute('display') === 'none' ||
		style.display === 'none' ||
		element.getAttribute('visibility') === 'hidden' ||
		style.visibility === 'hidden'
	);
};

const parseFill = (value: string | null | undefined): Color | undefined => {
	if (!value || value === 'none') return undefined;
	return { type: 'solid', value };
};

const parseStroke = (stroke: string | null | undefined, width: string | null | undefined): Stroke | undefined => {
	if (!stroke || stroke === 'none') return undefined;
	return {
		color: { type: 'solid', value: stroke },
		width: Math.max(0, parseNumber(width, 1)),
		style: 'solid',
	};
};

const parseStyleMap = (element: Element): Record<string, string> => {
	const styleText = element.getAttribute('style') ?? '';
	const map: Record<string, string> = {};
	for (const part of styleText.split(';')) {
		const [rawKey, rawValue] = part.split(':');
		if (!rawKey || !rawValue) continue;
		map[rawKey.trim()] = rawValue.trim();
	}
	return map;
};

const normalizeFontWeight = (value: string | null | undefined): 'normal' | 'bold' | '500' | '600' | undefined => {
	if (!value) return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'normal' || normalized === 'bold' || normalized === '500' || normalized === '600') {
		return normalized;
	}
	const numeric = Number.parseInt(normalized, 10);
	if (!Number.isFinite(numeric)) return undefined;
	if (numeric >= 700) return 'bold';
	if (numeric >= 600) return '600';
	if (numeric >= 500) return '500';
	return 'normal';
};

const readPaint = (element: Element): { fill?: Color; stroke?: Stroke; opacity?: number } => {
	const style = parseStyleMap(element);
	const fill = parseFill(element.getAttribute('fill') ?? style.fill);
	const stroke = parseStroke(
		element.getAttribute('stroke') ?? style.stroke,
		element.getAttribute('stroke-width') ?? style['stroke-width'],
	);
	const opacityRaw = element.getAttribute('opacity') ?? style.opacity;
	const opacity = opacityRaw ? parseNumber(opacityRaw, 1) : undefined;
	return { fill, stroke, opacity };
};

const parseViewBox = (svg: SVGSVGElement): Bounds => {
	const viewBox = svg.getAttribute('viewBox');
	if (viewBox) {
		const values = viewBox
			.split(/[\s,]+/)
			.map((entry) => Number.parseFloat(entry))
			.filter((entry) => Number.isFinite(entry));
		if (values.length === 4) {
			return {
				x: values[0],
				y: values[1],
				width: Math.max(1, values[2]),
				height: Math.max(1, values[3]),
			};
		}
	}
	return {
		x: 0,
		y: 0,
		width: Math.max(1, parseNumber(svg.getAttribute('width'), 1024)),
		height: Math.max(1, parseNumber(svg.getAttribute('height'), 768)),
	};
};

const parseTranslate = (element: Element): { x: number; y: number } => {
	const transform = element.getAttribute('transform');
	if (!transform) return { x: 0, y: 0 };
	let x = 0;
	let y = 0;
	const regex = /(translate|matrix)\(([^)]+)\)/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(transform)) !== null) {
		const kind = match[1].toLowerCase();
		const values = match[2]
			.split(/[\s,]+/)
			.map((value) => Number.parseFloat(value))
			.filter((value) => Number.isFinite(value));
		if (kind === 'translate' && values.length > 0) {
			x += values[0];
			y += values[1] ?? 0;
		}
		if (kind === 'matrix' && values.length >= 6) {
			x += values[4];
			y += values[5];
		}
	}
	return { x, y };
};

const inferPathBounds = (pathData: string): Bounds => {
	const nums = (pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [])
		.map((value) => Number.parseFloat(value))
		.filter((value) => Number.isFinite(value));
	if (nums.length < 4) {
		return { x: 0, y: 0, width: 24, height: 24 };
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < nums.length - 1; i += 2) {
		const x = nums[i];
		const y = nums[i + 1];
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		return { x: 0, y: 0, width: 24, height: 24 };
	}
	return {
		x: minX,
		y: minY,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY),
	};
};

const createPathFromPoints = (points: string, closed: boolean): string => {
	const values = points
		.split(/[\s,]+/)
		.map((entry) => Number.parseFloat(entry))
		.filter((entry) => Number.isFinite(entry));
	if (values.length < 4) return '';
	const commands: string[] = [`M ${values[0]} ${values[1]}`];
	for (let i = 2; i < values.length - 1; i += 2) {
		commands.push(`L ${values[i]} ${values[i + 1]}`);
	}
	if (closed) commands.push('Z');
	return commands.join(' ');
};

const boundsFromElement = (element: Element): Bounds | null => {
	const tag = element.tagName.toLowerCase();
	const translate = parseTranslate(element);
	if (tag === 'rect') {
		return {
			x: parseNumber(element.getAttribute('x')) + translate.x,
			y: parseNumber(element.getAttribute('y')) + translate.y,
			width: Math.max(1, parseNumber(element.getAttribute('width'), 1)),
			height: Math.max(1, parseNumber(element.getAttribute('height'), 1)),
		};
	}
	if (tag === 'circle' || tag === 'ellipse') {
		const cx = parseNumber(element.getAttribute('cx')) + translate.x;
		const cy = parseNumber(element.getAttribute('cy')) + translate.y;
		const rx = tag === 'circle' ? parseNumber(element.getAttribute('r')) : parseNumber(element.getAttribute('rx'));
		const ry = tag === 'circle' ? parseNumber(element.getAttribute('r')) : parseNumber(element.getAttribute('ry'));
		return {
			x: cx - rx,
			y: cy - ry,
			width: Math.max(1, rx * 2),
			height: Math.max(1, ry * 2),
		};
	}
	if (tag === 'path') {
		const pathData = element.getAttribute('d');
		if (!pathData) return null;
		const bounds = inferPathBounds(pathData);
		return {
			x: bounds.x + translate.x,
			y: bounds.y + translate.y,
			width: bounds.width,
			height: bounds.height,
		};
	}
	if (tag === 'line') {
		const x1 = parseNumber(element.getAttribute('x1'));
		const y1 = parseNumber(element.getAttribute('y1'));
		const x2 = parseNumber(element.getAttribute('x2'));
		const y2 = parseNumber(element.getAttribute('y2'));
		return {
			x: Math.min(x1, x2) + translate.x,
			y: Math.min(y1, y2) + translate.y,
			width: Math.max(1, Math.abs(x2 - x1)),
			height: Math.max(1, Math.abs(y2 - y1)),
		};
	}
	if (tag === 'polyline' || tag === 'polygon') {
		const path = createPathFromPoints(element.getAttribute('points') ?? '', tag === 'polygon');
		if (!path) return null;
		const bounds = inferPathBounds(path);
		return {
			x: bounds.x + translate.x,
			y: bounds.y + translate.y,
			width: bounds.width,
			height: bounds.height,
		};
	}
	return null;
};

const mergeBounds = (acc: Bounds | null, next: Bounds): Bounds => {
	if (!acc) return next;
	const minX = Math.min(acc.x, next.x);
	const minY = Math.min(acc.y, next.y);
	const maxX = Math.max(acc.x + acc.width, next.x + next.width);
	const maxY = Math.max(acc.y + acc.height, next.y + next.height);
	return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const extractClipPathId = (element: Element): string | null => {
	const style = parseStyleMap(element);
	const raw = element.getAttribute('clip-path') ?? style['clip-path'];
	if (!raw) return null;
	const match = raw.match(/url\(\s*#([^)]+)\)/i);
	return match?.[1]?.trim() ?? null;
};

const buildClipPathBoundsIndex = (svgRoot: SVGSVGElement): Record<string, Bounds> => {
	const out: Record<string, Bounds> = {};
	for (const clipPath of Array.from(svgRoot.querySelectorAll('clipPath'))) {
		const clipId = clipPath.getAttribute('id');
		if (!clipId) continue;

		let merged: Bounds | null = null;
		const clipTranslate = parseTranslate(clipPath);
		for (const child of Array.from(clipPath.children)) {
			const bounds = boundsFromElement(child);
			if (!bounds) continue;
			merged = mergeBounds(merged, {
				x: bounds.x + clipTranslate.x,
				y: bounds.y + clipTranslate.y,
				width: bounds.width,
				height: bounds.height,
			});
		}
		if (merged) {
			out[clipId] = merged;
		}
	}
	return out;
};

const finalizeGroupBounds = (nodes: Record<string, Node>, groupId: string): void => {
	const group = nodes[groupId];
	if (!group?.children || group.children.length === 0) return;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const childId of group.children) {
		const child = nodes[childId];
		if (!child) continue;
		minX = Math.min(minX, child.position.x);
		minY = Math.min(minY, child.position.y);
		maxX = Math.max(maxX, child.position.x + child.size.width);
		maxY = Math.max(maxY, child.position.y + child.size.height);
	}
	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		group.size = { width: 1, height: 1 };
		return;
	}
	group.size = {
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY),
	};
};

export const mapSvgToClipboardPayload = (svgText: string, options: MapSvgOptions): SvgToClipboardMapResult => {
	const parsed = parseSvgDocument(svgText);
	if (!parsed) {
		return {
			payload: null,
			warnings: [{ code: 'parse_error', message: 'Failed to parse SVG clipboard payload.' }],
			importedLayerCount: 0,
			fallbackRasterize: false,
		};
	}

	const nodes: Record<string, Node> = {};
	const assets: Record<string, Asset> = {};
	const warnings: FigmaImportWarning[] = [...parsed.warnings];
	const viewBox = parseViewBox(parsed.svgElement);
	const clipPathBoundsById = buildClipPathBoundsIndex(parsed.svgElement);
	const rootId = options.generateId();
	nodes[rootId] = {
		id: rootId,
		type: 'frame',
		name: options.name ?? 'Figma SVG Import',
		position: { x: 0, y: 0 },
		size: { width: viewBox.width, height: viewBox.height },
		children: [],
		visible: true,
	};

	const walk = (element: Element, parentId: string, offset: { x: number; y: number }) => {
		const tag = element.tagName.toLowerCase();
		if (SVG_SKIPPED_TAGS.has(tag)) return;
		if (isHiddenElement(element)) return;
		const translate = parseTranslate(element);
		const nextOffset = { x: offset.x + translate.x, y: offset.y + translate.y };

		if (tag === 'g' || tag === 'svg') {
			const groupId = options.generateId();
			const clipPathId = extractClipPathId(element);
			const clipBounds = clipPathId ? clipPathBoundsById[clipPathId] : undefined;
			const group: Node = {
				id: groupId,
				type: clipBounds ? 'frame' : 'group',
				name: clipBounds ? 'Clipped Group' : tag === 'svg' ? 'SVG Group' : 'Group',
				position: clipBounds
					? { x: nextOffset.x + clipBounds.x, y: nextOffset.y + clipBounds.y }
					: { x: nextOffset.x, y: nextOffset.y },
				size: clipBounds ? { width: clipBounds.width, height: clipBounds.height } : { width: 1, height: 1 },
				children: [],
				clipContent: clipBounds ? true : undefined,
				visible: true,
			};
			nodes[groupId] = group;
			nodes[parentId]?.children?.push(groupId);
			const childOffset = clipBounds ? { x: -clipBounds.x, y: -clipBounds.y } : { x: 0, y: 0 };
			for (const child of Array.from(element.children)) {
				walk(child, groupId, childOffset);
			}
			if (!clipBounds) {
				finalizeGroupBounds(nodes, groupId);
			}
			return;
		}

		const { fill, stroke, opacity } = readPaint(element);
		const nodeId = options.generateId();
		let node: Node | null = null;

		if (tag === 'rect') {
			const x = parseNumber(element.getAttribute('x')) + nextOffset.x;
			const y = parseNumber(element.getAttribute('y')) + nextOffset.y;
			node = {
				id: nodeId,
				type: 'rectangle',
				name: 'Rectangle',
				position: { x, y },
				size: {
					width: Math.max(1, parseNumber(element.getAttribute('width'), 1)),
					height: Math.max(1, parseNumber(element.getAttribute('height'), 1)),
				},
				fill,
				stroke,
				opacity,
				cornerRadius: parseNumber(element.getAttribute('rx')),
				visible: true,
			};
		} else if (tag === 'circle' || tag === 'ellipse') {
			const cx = parseNumber(element.getAttribute('cx')) + nextOffset.x;
			const cy = parseNumber(element.getAttribute('cy')) + nextOffset.y;
			const rx = tag === 'circle' ? parseNumber(element.getAttribute('r')) : parseNumber(element.getAttribute('rx'));
			const ry = tag === 'circle' ? parseNumber(element.getAttribute('r')) : parseNumber(element.getAttribute('ry'));
			node = {
				id: nodeId,
				type: 'ellipse',
				name: 'Ellipse',
				position: { x: cx - rx, y: cy - ry },
				size: { width: Math.max(1, rx * 2), height: Math.max(1, ry * 2) },
				fill,
				stroke,
				opacity,
				visible: true,
			};
		} else if (tag === 'path' || tag === 'line' || tag === 'polyline' || tag === 'polygon') {
			let pathData = element.getAttribute('d') ?? '';
			if (!pathData && tag === 'line') {
				const x1 = parseNumber(element.getAttribute('x1'));
				const y1 = parseNumber(element.getAttribute('y1'));
				const x2 = parseNumber(element.getAttribute('x2'));
				const y2 = parseNumber(element.getAttribute('y2'));
				pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
			}
			if (!pathData && (tag === 'polyline' || tag === 'polygon')) {
				pathData = createPathFromPoints(element.getAttribute('points') ?? '', tag === 'polygon');
			}
			if (pathData) {
				const bounds = inferPathBounds(pathData);
				node = {
					id: nodeId,
					type: 'path',
					name: 'Path',
					position: { x: bounds.x + nextOffset.x, y: bounds.y + nextOffset.y },
					size: { width: bounds.width, height: bounds.height },
					path: pathData,
					fill,
					stroke,
					opacity,
					visible: true,
				};
			}
		} else if (tag === 'text') {
			const fontSize = Math.max(1, parseNumber(element.getAttribute('font-size'), 16));
			const text = element.textContent?.trim() || 'Text';
			const x = parseNumber(element.getAttribute('x')) + nextOffset.x;
			const y = parseNumber(element.getAttribute('y')) + nextOffset.y;
			node = {
				id: nodeId,
				type: 'text',
				name: 'Text',
				position: { x, y: y - fontSize },
				size: { width: Math.max(1, text.length * fontSize * 0.6), height: fontSize * 1.2 },
				text,
				fontSize,
				fontFamily: element.getAttribute('font-family') ?? undefined,
				fontWeight: normalizeFontWeight(element.getAttribute('font-weight')),
				fill: fill ?? { type: 'solid', value: '#000000' },
				opacity,
				visible: true,
			};
		} else if (tag === 'image') {
			const x = parseNumber(element.getAttribute('x')) + nextOffset.x;
			const y = parseNumber(element.getAttribute('y')) + nextOffset.y;
			const width = Math.max(1, parseNumber(element.getAttribute('width'), 1));
			const height = Math.max(1, parseNumber(element.getAttribute('height'), 1));
			const href =
				element.getAttribute('href') ?? element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? undefined;
			if (!href) {
				warnings.push({ code: 'invalid_payload', message: 'Image node missing href and was skipped.' });
			} else {
				const parsedData = parseDataUrl(href);
				if (parsedData) {
					const assetId = options.generateId();
					assets[assetId] = {
						type: 'image',
						mime: parsedData.mime,
						dataBase64: parsedData.dataBase64,
						width,
						height,
					};
					node = {
						id: nodeId,
						type: 'image',
						name: 'Image',
						position: { x, y },
						size: { width, height },
						image: {
							assetId,
							mime: parsedData.mime,
						},
						opacity,
						visible: true,
						aspectRatioLocked: true,
					};
				} else {
					node = {
						id: nodeId,
						type: 'image',
						name: 'Image',
						position: { x, y },
						size: { width, height },
						image: {
							src: href,
						},
						opacity,
						visible: true,
						aspectRatioLocked: true,
					};
				}
			}
		}

		if (!node) {
			warnings.push({
				code: 'unsupported_node',
				message: `Unsupported SVG node "${tag}" was skipped.`,
			});
			return;
		}

		nodes[nodeId] = node;
		nodes[parentId]?.children?.push(nodeId);
	};

	for (const child of Array.from(parsed.svgElement.children)) {
		walk(child, rootId, { x: 0, y: 0 });
	}
	finalizeGroupBounds(nodes, rootId);
	const importedLayerCount = Math.max(0, Object.keys(nodes).length - 1);

	if (importedLayerCount === 0 && parsed.hasUnsupportedFeatures) {
		return {
			payload: null,
			warnings: [
				...warnings,
				{ code: 'rasterized_fallback', message: 'No editable SVG layers were detected; using raster fallback.' },
			],
			importedLayerCount: 0,
			fallbackRasterize: true,
		};
	}

	const payload: ClipboardPayloadV2 = {
		version: 2,
		rootIds: [rootId],
		nodes,
		bounds: { x: 0, y: 0, width: viewBox.width, height: viewBox.height },
		rootWorldPositions: {
			[rootId]: { x: 0, y: 0 },
		},
		parentId: null,
		assets,
		source: 'figma-svg',
	};

	return {
		payload,
		warnings,
		importedLayerCount,
		fallbackRasterize: false,
	};
};

export const rasterizeSvgToDataUrl = async (svgText: string): Promise<string> => {
	const encoded = encodeURIComponent(svgText);
	const src = `data:image/svg+xml;charset=utf-8,${encoded}`;
	const image = new Image();
	image.decoding = 'async';
	image.src = src;
	await image.decode();

	const width = Math.max(1, image.naturalWidth);
	const height = Math.max(1, image.naturalHeight);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Canvas 2D context unavailable for SVG rasterization');
	}
	ctx.drawImage(image, 0, 0, width, height);
	return canvas.toDataURL('image/png');
};

export const toSvgImportResult = (warnings: FigmaImportWarning[], importedLayerCount: number): SvgImportResult => ({
	warnings,
	importedLayerCount,
});
