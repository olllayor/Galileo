import type { FigmaImportWarning } from '../types';

export type SvgStructuralStats = {
	nodeCount: number;
	clipPathCount: number;
	clipPathRefCount: number;
	maskRefCount: number;
	filterRefCount: number;
	nonTranslationTransformCount: number;
	useCount: number;
	gradientCount: number;
	patternCount: number;
	maxDepth: number;
};

export type ParsedSvgDocument = {
	document: Document;
	svgElement: SVGSVGElement;
	hasUnsupportedFeatures: boolean;
	warnings: FigmaImportWarning[];
	stats: SvgStructuralStats;
};

const referencesLocalUrl = (value: string | null | undefined): boolean => {
	if (!value) return false;
	return /url\(\s*#.+\)/i.test(value);
};

const hasAppliedReference = (root: SVGSVGElement, attributeName: string, styleProperty: string): boolean => {
	const stylePattern = new RegExp(`(?:^|;)\\s*${styleProperty}\\s*:\\s*url\\(\\s*#`, 'i');
	for (const element of Array.from(root.querySelectorAll('*'))) {
		if (referencesLocalUrl(element.getAttribute(attributeName))) {
			return true;
		}
		const inlineStyle = element.getAttribute('style');
		if (inlineStyle && stylePattern.test(inlineStyle)) {
			return true;
		}
	}
	return false;
};

const countAppliedReference = (root: SVGSVGElement, attributeName: string, styleProperty: string): number => {
	const stylePattern = new RegExp(`(?:^|;)\\s*${styleProperty}\\s*:\\s*url\\(\\s*#`, 'i');
	let count = 0;
	for (const element of Array.from(root.querySelectorAll('*'))) {
		if (referencesLocalUrl(element.getAttribute(attributeName))) {
			count += 1;
			continue;
		}
		const inlineStyle = element.getAttribute('style');
		if (inlineStyle && stylePattern.test(inlineStyle)) {
			count += 1;
		}
	}
	return count;
};

const isNonTranslationTransform = (transform: string): boolean => {
	const normalized = transform.toLowerCase();
	if (/(rotate|scale|skew(?:x|y)?)/i.test(normalized)) return true;
	const regex = /matrix\(([^)]+)\)/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(normalized)) !== null) {
		const values = match[1]
			.split(/[\s,]+/)
			.map((value) => Number.parseFloat(value))
			.filter((value) => Number.isFinite(value));
		if (values.length >= 6) {
			const [a, b, c, d] = values;
			if (Math.abs(a - 1) > 0.0001 || Math.abs(d - 1) > 0.0001 || Math.abs(b) > 0.0001 || Math.abs(c) > 0.0001) {
				return true;
			}
		}
	}
	return false;
};

const computeMaxDepth = (root: Element): number => {
	let maxDepth = 1;
	const walk = (node: Element, depth: number) => {
		maxDepth = Math.max(maxDepth, depth);
		for (const child of Array.from(node.children)) {
			walk(child, depth + 1);
		}
	};
	walk(root, 1);
	return maxDepth;
};

const hasComplexClipPath = (root: SVGSVGElement): boolean => {
	const clipPaths = Array.from(root.querySelectorAll('clipPath'));
	if (clipPaths.length === 0) return false;
	for (const clip of clipPaths) {
		const children = Array.from(clip.children);
		if (
			children.some(
				(child) =>
					!['rect', 'circle', 'ellipse', 'polygon', 'polyline', 'path'].includes(child.tagName.toLowerCase()),
			)
		) {
			return true;
		}
	}
	return false;
};

export const parseSvgDocument = (svgText: string): ParsedSvgDocument | null => {
	const warnings: FigmaImportWarning[] = [];
	try {
		const parser = new DOMParser();
		const document = parser.parseFromString(svgText, 'image/svg+xml');
		const parserError = document.querySelector('parsererror');
		if (parserError) {
			return null;
		}

		const svgElement = document.querySelector('svg');
		if (!svgElement) return null;

		const hasMaskDefinitions = svgElement.querySelector('mask') !== null;
		const hasFilterDefinitions = svgElement.querySelector('filter') !== null;
		const hasMasks = hasMaskDefinitions && hasAppliedReference(svgElement, 'mask', 'mask');
		const hasFilters = hasFilterDefinitions && hasAppliedReference(svgElement, 'filter', 'filter');
		const maskRefCount = countAppliedReference(svgElement, 'mask', 'mask');
		const filterRefCount = countAppliedReference(svgElement, 'filter', 'filter');
		const clipPathRefCount = countAppliedReference(svgElement, 'clip-path', 'clip-path');
		const hasClipPath = hasComplexClipPath(svgElement);
		const allElements = Array.from(svgElement.querySelectorAll('*'));
		const nonTranslationTransformCount = allElements.reduce((count, element) => {
			const transform = element.getAttribute('transform');
			if (!transform) return count;
			return isNonTranslationTransform(transform) ? count + 1 : count;
		}, 0);
		const useCount = svgElement.querySelectorAll('use').length;
		const gradientCount = svgElement.querySelectorAll('linearGradient, radialGradient').length;
		const patternCount = svgElement.querySelectorAll('pattern').length;
		const clipPathCount = svgElement.querySelectorAll('clipPath').length;
		const maxDepth = computeMaxDepth(svgElement);
		const stats: SvgStructuralStats = {
			nodeCount: allElements.length,
			clipPathCount,
			clipPathRefCount,
			maskRefCount,
			filterRefCount,
			nonTranslationTransformCount,
			useCount,
			gradientCount,
			patternCount,
			maxDepth,
		};
		// This marks hard-unsupported effects. The mapper decides whether to
		// continue with editable import (preferred) or force raster fallback.
		const hasUnsupportedFeatures = hasMasks || hasFilters;
		if (hasMasks) {
			warnings.push({
				code: 'unsupported_feature',
				message: 'SVG uses masks. Mask fidelity may differ in editable import.',
			});
		}
		if (hasFilters) {
			warnings.push({
				code: 'unsupported_feature',
				message: 'SVG uses filters. Effect fidelity may differ in editable import.',
			});
		}
		if (hasClipPath) {
			warnings.push({
				code: 'unsupported_feature',
				message: 'SVG uses clip paths. Import remains editable, but clipping fidelity may differ.',
			});
		}

		return {
			document,
			svgElement,
			hasUnsupportedFeatures,
			warnings,
			stats,
		};
	} catch {
		return null;
	}
};
