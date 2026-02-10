import type {
	Color,
	Document,
	LayoutGuide,
	Node,
	ShadowEffect,
	StyleVariableCollection,
	StyleVariableToken,
} from './types';

type ResolvedNodeStyleProps = {
	fill: Color | undefined;
	fontSize: number | undefined;
	fontFamily: string | undefined;
	fontWeight: Node['fontWeight'] | undefined;
	textAlign: Node['textAlign'] | undefined;
	lineHeightPx: number | undefined;
	letterSpacingPx: number | undefined;
	textResizeMode: Node['textResizeMode'] | undefined;
	effects: ShadowEffect[] | undefined;
	layoutGuides: LayoutGuide | undefined;
};

const cloneColor = (color: Color | undefined): Color | undefined => {
	if (!color) return undefined;
	if (color.type === 'solid') {
		return { type: 'solid', value: color.value };
	}
	return {
		...color,
		stops: Array.isArray(color.stops) ? [...color.stops] : [],
	};
};

const cloneLayoutGuide = (guide: LayoutGuide | undefined): LayoutGuide | undefined => {
	if (!guide) return undefined;
	return {
		type: guide.type,
		visible: guide.visible,
		...(guide.grid ? { grid: { size: guide.grid.size } } : {}),
		...(guide.columns
			? {
					columns: {
						count: guide.columns.count,
						gutter: guide.columns.gutter,
						margin: guide.columns.margin,
					},
			}
			: {}),
		...(guide.rows
			? {
					rows: {
						count: guide.rows.count,
						gutter: guide.rows.gutter,
						margin: guide.rows.margin,
					},
			}
			: {}),
	};
};

const cloneEffects = (effects: ShadowEffect[] | undefined): ShadowEffect[] | undefined => {
	if (!effects) return undefined;
	return effects.map((effect) => {
		if (effect.type === 'auto') {
			return {
				...effect,
				bindings: effect.bindings ? { ...effect.bindings } : undefined,
			};
		}
		return { ...effect };
	});
};

const getVariableCollection = (doc: Document, collectionId: string): StyleVariableCollection | undefined => {
	return doc.variables.collections[collectionId];
};

const getVariableToken = (doc: Document, tokenId: string): StyleVariableToken | undefined => {
	return doc.variables.tokens[tokenId];
};

export const getVariableCollectionActiveModeId = (doc: Document, collectionId: string): string | undefined => {
	const collection = getVariableCollection(doc, collectionId);
	if (!collection) return undefined;
	const requestedModeId = doc.variables.activeModeByCollection[collectionId];
	if (requestedModeId && collection.modes.some((mode) => mode.id === requestedModeId)) {
		return requestedModeId;
	}
	if (collection.defaultModeId && collection.modes.some((mode) => mode.id === collection.defaultModeId)) {
		return collection.defaultModeId;
	}
	return collection.modes[0]?.id;
};

export const resolveVariableTokenValue = (doc: Document, tokenId: string): string | number | undefined => {
	const token = getVariableToken(doc, tokenId);
	if (!token) return undefined;
	const modeId = getVariableCollectionActiveModeId(doc, token.collectionId);
	if (!modeId) return undefined;
	return token.valuesByMode[modeId];
};

const resolveTokenAsString = (doc: Document, tokenId: string): string | undefined => {
	const value = resolveVariableTokenValue(doc, tokenId);
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return undefined;
};

const resolveTokenAsNumber = (doc: Document, tokenId: string): number | undefined => {
	const value = resolveVariableTokenValue(doc, tokenId);
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

export const resolvePaintStyleFill = (doc: Document, styleId: string | undefined): Color | undefined => {
	if (!styleId) return undefined;
	const style = doc.styles.paint[styleId];
	if (!style) return undefined;
	const paint = cloneColor(style.paint);
	if (!paint) return undefined;
	if (paint.type === 'solid' && style.bindings?.solidValueTokenId) {
		const tokenValue = resolveTokenAsString(doc, style.bindings.solidValueTokenId);
		if (tokenValue) {
			paint.value = tokenValue;
		}
	}
	return paint;
};

export const resolveTextStyleProps = (
	doc: Document,
	styleId: string | undefined,
): Partial<Pick<Node, 'fill' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'textAlign' | 'lineHeightPx' | 'letterSpacingPx' | 'textResizeMode'>> => {
	if (!styleId) return {};
	const style = doc.styles.text[styleId];
	if (!style) return {};

	const next: Partial<
		Pick<Node, 'fill' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'textAlign' | 'lineHeightPx' | 'letterSpacingPx' | 'textResizeMode'>
	> = {};

	next.fill = cloneColor(style.fill);
	next.fontSize = style.fontSize;
	next.fontFamily = style.fontFamily;
	next.fontWeight = style.fontWeight;
	next.textAlign = style.textAlign;
	next.lineHeightPx = style.lineHeightPx;
	next.letterSpacingPx = style.letterSpacingPx;
	next.textResizeMode = style.textResizeMode;

	const fillTokenId = style.bindings?.fillTokenId;
	if (fillTokenId) {
		const fill = resolveTokenAsString(doc, fillTokenId);
		if (fill) {
			next.fill = { type: 'solid', value: fill };
		}
	}
	if (style.bindings?.fontSizeTokenId) {
		const value = resolveTokenAsNumber(doc, style.bindings.fontSizeTokenId);
		if (typeof value === 'number') next.fontSize = value;
	}
	if (style.bindings?.fontFamilyTokenId) {
		const value = resolveTokenAsString(doc, style.bindings.fontFamilyTokenId);
		if (typeof value === 'string' && value.trim().length > 0) next.fontFamily = value;
	}
	if (style.bindings?.fontWeightTokenId) {
		const value = resolveTokenAsString(doc, style.bindings.fontWeightTokenId);
		if (value === 'normal' || value === 'bold' || value === '500' || value === '600') next.fontWeight = value;
	}
	if (style.bindings?.lineHeightTokenId) {
		const value = resolveTokenAsNumber(doc, style.bindings.lineHeightTokenId);
		if (typeof value === 'number') next.lineHeightPx = value;
	}
	if (style.bindings?.letterSpacingTokenId) {
		const value = resolveTokenAsNumber(doc, style.bindings.letterSpacingTokenId);
		if (typeof value === 'number') next.letterSpacingPx = value;
	}

	return next;
};

export const resolveEffectStyleEffects = (doc: Document, styleId: string | undefined): ShadowEffect[] | undefined => {
	if (!styleId) return undefined;
	const style = doc.styles.effect[styleId];
	if (!style) return undefined;
	return cloneEffects(style.effects);
};

export const resolveGridStyle = (doc: Document, styleId: string | undefined): LayoutGuide | undefined => {
	if (!styleId) return undefined;
	const style = doc.styles.grid[styleId];
	if (!style) return undefined;
	return cloneLayoutGuide(style.layoutGuides);
};

export const resolveNodeStyleProps = (doc: Document, node: Node): ResolvedNodeStyleProps => {
	const fill = resolvePaintStyleFill(doc, node.fillStyleId) ?? cloneColor(node.fill);
	const textStyleProps = resolveTextStyleProps(doc, node.textStyleId);
	const effects = resolveEffectStyleEffects(doc, node.effectStyleId) ?? cloneEffects(node.effects);
	const layoutGuides = resolveGridStyle(doc, node.gridStyleId) ?? cloneLayoutGuide(node.layoutGuides);

	return {
		fill,
		fontSize: textStyleProps.fontSize ?? node.fontSize,
		fontFamily: textStyleProps.fontFamily ?? node.fontFamily,
		fontWeight: textStyleProps.fontWeight ?? node.fontWeight,
		textAlign: textStyleProps.textAlign ?? node.textAlign,
		lineHeightPx: textStyleProps.lineHeightPx ?? node.lineHeightPx,
		letterSpacingPx: textStyleProps.letterSpacingPx ?? node.letterSpacingPx,
		textResizeMode: textStyleProps.textResizeMode ?? node.textResizeMode,
		effects,
		layoutGuides,
	};
};
