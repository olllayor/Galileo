import { z } from 'zod';

const gradientSchema = z
	.object({
		type: z.literal('gradient'),
		stops: z.any().array(),
	})
	.passthrough();

export const colorSchema = z.union([
	z.object({
		type: z.literal('solid'),
		value: z.string(),
	}),
	gradientSchema,
]);

export type Color = z.infer<typeof colorSchema>;

export const strokeSchema = z.object({
	color: colorSchema,
	width: z.number(),
	style: z.enum(['solid', 'dashed', 'dotted']),
});

export type Stroke = z.infer<typeof strokeSchema>;

export const shadowBlendModeSchema = z.enum(['normal', 'multiply', 'screen', 'overlay']);
export type ShadowBlendMode = z.infer<typeof shadowBlendModeSchema>;

export const shadowEffectBindingSchema = z.object({
	x: z.string().optional(),
	y: z.string().optional(),
	blur: z.string().optional(),
	spread: z.string().optional(),
	color: z.string().optional(),
	opacity: z.string().optional(),
	blendMode: z.string().optional(),
});

export type ShadowEffectBinding = z.infer<typeof shadowEffectBindingSchema>;

const shadowEffectBaseSchema = z.object({
	x: z.number(),
	y: z.number(),
	blur: z.number(),
	spread: z.number(),
	color: z.string(),
	opacity: z.number(),
	blendMode: shadowBlendModeSchema.optional(),
	enabled: z.boolean().optional(),
});

const dropShadowEffectSchema = shadowEffectBaseSchema.extend({
	type: z.literal('drop'),
});

const innerShadowEffectSchema = shadowEffectBaseSchema.extend({
	type: z.literal('inner'),
});

export const autoShadowEffectBindingSchema = z.object({
	elevation: z.string().optional(),
	angle: z.string().optional(),
	distance: z.string().optional(),
	softness: z.string().optional(),
	color: z.string().optional(),
	opacity: z.string().optional(),
	blendMode: z.string().optional(),
});

export type AutoShadowEffectBinding = z.infer<typeof autoShadowEffectBindingSchema>;

const autoShadowEffectSchema = z.object({
	type: z.literal('auto'),
	elevation: z.number(),
	angle: z.number(),
	distance: z.number(),
	softness: z.number(),
	color: z.string(),
	opacity: z.number(),
	blendMode: shadowBlendModeSchema.optional(),
	enabled: z.boolean().optional(),
	bindings: autoShadowEffectBindingSchema.optional(),
});

export const shadowEffectSchema = z.discriminatedUnion('type', [
	dropShadowEffectSchema,
	innerShadowEffectSchema,
	autoShadowEffectSchema,
]);
export type ShadowEffect = z.infer<typeof shadowEffectSchema>;
export type RenderableShadowEffect = z.infer<typeof dropShadowEffectSchema> | z.infer<typeof innerShadowEffectSchema>;

export const positionSchema = z.object({
	x: z.number(),
	y: z.number(),
});

export type Position = z.infer<typeof positionSchema>;

export const sizeSchema = z.object({
	width: z.number(),
	height: z.number(),
});

export type Size = z.infer<typeof sizeSchema>;

export const imageMeta3dIconSchema = z
	.object({
		kind: z.literal('3d-icon'),
		provider: z.string(),
		iconId: z.string(),
		style: z.string(),
		color: z.string().optional(),
		angle: z.string(),
		size: z.number(),
		providerVersion: z.string(),
		renderVersion: z.string(),
	})
	.passthrough();

export const imageMetaUnsplashSchema = z
	.object({
		kind: z.literal('unsplash'),
		photoId: z.string(),
		photographerName: z.string(),
		photographerUsername: z.string(),
		photographerProfileUrl: z.string(),
		photoUnsplashUrl: z.string(),
		downloadLocation: z.string(),
		insertedAt: z.number(),
	})
	.passthrough();

export const imageMetaIconifyCustomizationsSchema = z
	.object({
		color: z.string().optional(),
		width: z.union([z.string(), z.number()]).optional(),
		height: z.union([z.string(), z.number()]).optional(),
		rotate: z.union([z.string(), z.number()]).optional(),
		flip: z.string().optional(),
		box: z.boolean().optional(),
	})
	.passthrough();

export const imageMetaIconifyLicenseSchema = z
	.object({
		title: z.string().optional(),
		spdx: z.string().optional(),
		url: z.string().optional(),
	})
	.passthrough();

export const imageMetaIconifyAuthorSchema = z
	.object({
		name: z.string().optional(),
		url: z.string().optional(),
	})
	.passthrough();

export const imageMetaIconifyIconSchema = z
	.object({
		kind: z.literal('iconify-icon'),
		icon: z.string(),
		prefix: z.string(),
		name: z.string(),
		providerHost: z.string(),
		customizations: imageMetaIconifyCustomizationsSchema.optional(),
		license: imageMetaIconifyLicenseSchema.optional(),
		author: imageMetaIconifyAuthorSchema.optional(),
		insertedAt: z.number(),
	})
	.passthrough();

export const imageMetaSchema = z.discriminatedUnion('kind', [
	imageMeta3dIconSchema,
	imageMetaUnsplashSchema,
	imageMetaIconifyIconSchema,
]);

export type ImageMeta3dIcon = z.infer<typeof imageMeta3dIconSchema>;
export type ImageMetaUnsplash = z.infer<typeof imageMetaUnsplashSchema>;
export type ImageMetaIconifyIcon = z.infer<typeof imageMetaIconifyIconSchema>;
export type ImageMeta = z.infer<typeof imageMetaSchema>;

export const imageBgRemoveMetaSchema = z
	.object({
		provider: z.literal('apple-vision'),
		model: z.literal('foreground-instance-mask'),
		revision: z.number().int().optional(),
		createdAt: z.number(),
	})
	.passthrough();

export type ImageBgRemoveMeta = z.infer<typeof imageBgRemoveMetaSchema>;

export const imageOutlineSchema = z.object({
	enabled: z.boolean().optional(),
	color: z.string().optional(),
	width: z.number().optional(),
	blur: z.number().optional(),
});

export type ImageOutline = z.infer<typeof imageOutlineSchema>;

export const layoutSchema = z.object({
	type: z.literal('auto'),
	direction: z.enum(['row', 'column']),
	gap: z.number(),
	padding: z.object({
		top: z.number(),
		right: z.number(),
		bottom: z.number(),
		left: z.number(),
	}),
	alignment: z.enum(['start', 'center', 'end']),
	crossAlignment: z.enum(['start', 'center', 'end', 'stretch']).optional(),
});

export type Layout = z.infer<typeof layoutSchema>;

export const layoutSizingSchema = z.object({
	horizontal: z.enum(['fixed', 'hug', 'fill']),
	vertical: z.enum(['fixed', 'hug', 'fill']),
});

export type LayoutSizing = z.infer<typeof layoutSizingSchema>;

export const textAlignSchema = z.enum(['left', 'center', 'right']);
export const textResizeModeSchema = z.enum(['auto-width', 'auto-height', 'fixed']);

export type TextAlign = z.infer<typeof textAlignSchema>;
export type TextResizeMode = z.infer<typeof textResizeModeSchema>;

export const constraintAxisXSchema = z.enum(['left', 'right', 'left-right', 'center']);
export const constraintAxisYSchema = z.enum(['top', 'bottom', 'top-bottom', 'center']);
export const constraintsSchema = z.object({
	horizontal: constraintAxisXSchema,
	vertical: constraintAxisYSchema,
});

export type ConstraintAxisX = z.infer<typeof constraintAxisXSchema>;
export type ConstraintAxisY = z.infer<typeof constraintAxisYSchema>;
export type Constraints = z.infer<typeof constraintsSchema>;

export const layoutGuideTypeSchema = z.enum(['grid', 'columns', 'rows']);
export const layoutGuideGridSchema = z.object({
	size: z.number().positive(),
});
export const layoutGuideColumnsSchema = z.object({
	count: z.number().int().min(1),
	gutter: z.number().min(0),
	margin: z.number().min(0),
});
export const layoutGuideRowsSchema = z.object({
	count: z.number().int().min(1),
	gutter: z.number().min(0),
	margin: z.number().min(0),
});
export const layoutGuideSchema = z.object({
	type: layoutGuideTypeSchema,
	visible: z.boolean().optional(),
	grid: layoutGuideGridSchema.optional(),
	columns: layoutGuideColumnsSchema.optional(),
	rows: layoutGuideRowsSchema.optional(),
});

export type LayoutGuideType = z.infer<typeof layoutGuideTypeSchema>;
export type LayoutGuide = z.infer<typeof layoutGuideSchema>;

export const styleVariableTypeSchema = z.enum(['color', 'number', 'string']);
export const styleVariableValueSchema = z.union([z.string(), z.number()]);
export const styleVariableModeSchema = z.object({
	id: z.string(),
	name: z.string(),
});
export const styleVariableCollectionSchema = z.object({
	id: z.string(),
	name: z.string(),
	modes: z.array(styleVariableModeSchema).min(1),
	defaultModeId: z.string().optional(),
});
export const styleVariableTokenSchema = z.object({
	id: z.string(),
	name: z.string(),
	collectionId: z.string(),
	type: styleVariableTypeSchema,
	valuesByMode: z.record(styleVariableValueSchema),
});

export const paintStyleBindingSchema = z.object({
	solidValueTokenId: z.string().optional(),
});

export const paintStyleSchema = z.object({
	id: z.string(),
	name: z.string(),
	paint: colorSchema,
	bindings: paintStyleBindingSchema.optional(),
});

export const textStyleBindingSchema = z.object({
	fillTokenId: z.string().optional(),
	fontSizeTokenId: z.string().optional(),
	fontFamilyTokenId: z.string().optional(),
	fontWeightTokenId: z.string().optional(),
	lineHeightTokenId: z.string().optional(),
	letterSpacingTokenId: z.string().optional(),
});

export const textStyleSchema = z.object({
	id: z.string(),
	name: z.string(),
	fill: colorSchema.optional(),
	fontSize: z.number().optional(),
	fontFamily: z.string().optional(),
	fontWeight: z.enum(['normal', 'bold', '500', '600']).optional(),
	textAlign: textAlignSchema.optional(),
	lineHeightPx: z.number().optional(),
	letterSpacingPx: z.number().optional(),
	textResizeMode: textResizeModeSchema.optional(),
	bindings: textStyleBindingSchema.optional(),
});

export const effectStyleSchema = z.object({
	id: z.string(),
	name: z.string(),
	effects: shadowEffectSchema.array(),
});

export const gridStyleSchema = z.object({
	id: z.string(),
	name: z.string(),
	layoutGuides: layoutGuideSchema,
});

export const styleLibrarySchema = z.object({
	paint: z.record(z.string(), paintStyleSchema),
	text: z.record(z.string(), textStyleSchema),
	effect: z.record(z.string(), effectStyleSchema),
	grid: z.record(z.string(), gridStyleSchema),
});

export const styleVariableLibrarySchema = z.object({
	collections: z.record(z.string(), styleVariableCollectionSchema),
	tokens: z.record(z.string(), styleVariableTokenSchema),
	activeModeByCollection: z.record(z.string(), z.string()),
});

export type StyleVariableType = z.infer<typeof styleVariableTypeSchema>;
export type StyleVariableValue = z.infer<typeof styleVariableValueSchema>;
export type StyleVariableMode = z.infer<typeof styleVariableModeSchema>;
export type StyleVariableCollection = z.infer<typeof styleVariableCollectionSchema>;
export type StyleVariableToken = z.infer<typeof styleVariableTokenSchema>;
export type PaintStyle = z.infer<typeof paintStyleSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type EffectStyle = z.infer<typeof effectStyleSchema>;
export type GridStyle = z.infer<typeof gridStyleSchema>;
export type StyleLibrary = z.infer<typeof styleLibrarySchema>;
export type StyleVariableLibrary = z.infer<typeof styleVariableLibrarySchema>;

export const vectorHandleSchema = z.object({
	x: z.number(),
	y: z.number(),
});

export const vectorCornerModeSchema = z.enum(['sharp', 'mirrored', 'asymmetric', 'disconnected']);

export const vectorPointSchema = z.object({
	id: z.string(),
	x: z.number(),
	y: z.number(),
	inHandle: vectorHandleSchema.optional(),
	outHandle: vectorHandleSchema.optional(),
	cornerMode: vectorCornerModeSchema.optional(),
});

export const vectorSegmentSchema = z.object({
	id: z.string(),
	fromId: z.string(),
	toId: z.string(),
});

export const vectorDataSchema = z
	.object({
		points: vectorPointSchema.array(),
		segments: vectorSegmentSchema.array(),
		closed: z.boolean(),
	})
	.passthrough();

export const booleanOpSchema = z.enum(['union', 'subtract', 'intersect', 'exclude']);
export const booleanStatusSchema = z.enum(['ok', 'invalid']);
export const booleanErrorCodeSchema = z.enum(['self_intersection', 'degenerate', 'empty_result', 'engine_error']);

export const booleanDataSchema = z.object({
	op: booleanOpSchema,
	operandIds: z.string().array(),
	isolationOperandId: z.string().optional(),
	status: booleanStatusSchema,
	lastErrorCode: booleanErrorCodeSchema.optional(),
	tolerance: z.number(),
});

export const componentVariantMapSchema = z.record(z.string());

export const componentOverridePatchSchema = z
	.object({
		text: z.string().optional(),
		fill: colorSchema.optional(),
		fillStyleId: z.string().optional(),
		stroke: strokeSchema.optional(),
		opacity: z.number().optional(),
		visible: z.boolean().optional(),
		textStyleId: z.string().optional(),
		effectStyleId: z.string().optional(),
		gridStyleId: z.string().optional(),
		image: z
			.object({
				src: z.string().optional(),
				mime: z.string().optional(),
				originalPath: z.string().optional(),
				assetId: z.string().optional(),
				meta: imageMetaSchema.optional(),
				maskAssetId: z.string().optional(),
				bgRemoveMeta: imageBgRemoveMetaSchema.optional(),
				outline: imageOutlineSchema.optional(),
			})
			.optional(),
	})
	.passthrough();

export type VectorPoint = z.infer<typeof vectorPointSchema>;
export type VectorSegment = z.infer<typeof vectorSegmentSchema>;
export type VectorData = z.infer<typeof vectorDataSchema>;
export type BooleanOp = z.infer<typeof booleanOpSchema>;
export type BooleanStatus = z.infer<typeof booleanStatusSchema>;
export type BooleanErrorCode = z.infer<typeof booleanErrorCodeSchema>;
export type BooleanData = z.infer<typeof booleanDataSchema>;
export type ComponentVariantMap = z.infer<typeof componentVariantMapSchema>;
export type ComponentOverridePatch = z.infer<typeof componentOverridePatchSchema>;

const nodeImageSchema = z
	.object({
		src: z.string().optional(),
		mime: z.string().optional(),
		originalPath: z.string().optional(),
		assetId: z.string().optional(),
		meta: imageMetaSchema.optional(),
		maskAssetId: z.string().optional(),
		bgRemoveMeta: imageBgRemoveMetaSchema.optional(),
		outline: imageOutlineSchema.optional(),
	})
	.passthrough();

export const nodeSchema = z.object({
	id: z.string(),
	type: z.enum(['frame', 'group', 'rectangle', 'text', 'image', 'componentInstance', 'ellipse', 'path', 'boolean']),
	name: z.string().optional(),
	children: z.string().array().optional(),

	position: positionSchema,
	size: sizeSchema,
	rotation: z.number().optional(),

	layout: layoutSchema.optional(),

	fill: colorSchema.optional(),
	fillStyleId: z.string().optional(),
	stroke: strokeSchema.optional(),
	opacity: z.number().optional(),
	cornerRadius: z.number().optional(),

	text: z.string().optional(),
	textStyleId: z.string().optional(),
	fontSize: z.number().optional(),
	fontFamily: z.string().optional(),
	fontWeight: z.enum(['normal', 'bold', '500', '600']).optional(),
	textAlign: textAlignSchema.optional(),
	lineHeightPx: z.number().optional(),
	letterSpacingPx: z.number().optional(),
	textResizeMode: textResizeModeSchema.optional(),

	image: nodeImageSchema.optional(),

	path: z
		.union([
			z.string(),
			z
				.object({
					d: z.string(),
					fillRule: z.enum(['nonzero', 'evenodd']).optional(),
				})
				.passthrough(),
		])
		.optional(),
	vector: vectorDataSchema.optional(),

	pathData: z.string().optional(),
	d: z.string().optional(),
	booleanData: booleanDataSchema.optional(),

	componentId: z.string().optional(),
	variant: componentVariantMapSchema.optional(),
	componentOverrides: z.record(componentOverridePatchSchema).optional(),
	componentSourceNodeId: z.string().optional(),
	isComponentMainPreview: z.boolean().optional(),

	// Device preset metadata for mockup integration
	devicePresetId: z.string().optional(),

	locked: z.boolean().optional(),
	visible: z.boolean().optional(),
	aspectRatioLocked: z.boolean().optional(),
	clipContent: z.boolean().optional(),
	shadowOverflow: z.enum(['visible', 'clipped', 'clip-content-only']).optional(),
	effects: shadowEffectSchema.array().optional(),
	effectStyleId: z.string().optional(),
	effectBindings: shadowEffectBindingSchema.optional(),
	effectVariables: z.record(z.union([z.string(), z.number()])).optional(),
	constraints: constraintsSchema.optional(),
	layoutGuides: layoutGuideSchema.optional(),
	gridStyleId: z.string().optional(),
	layoutSizing: layoutSizingSchema.optional(),
});

export type Node = z.infer<typeof nodeSchema>;

export const componentDefinitionSchema = z.object({
	id: z.string(),
	name: z.string(),
	setId: z.string(),
	variant: componentVariantMapSchema.optional(),
	templateRootId: z.string(),
	templateNodes: z.record(z.string(), nodeSchema),
	previewNodeId: z.string().optional(),
});

export const componentSetSchema = z.object({
	id: z.string(),
	name: z.string(),
	defaultDefinitionId: z.string(),
	definitionIds: z.string().array(),
	properties: z.record(z.string().array()),
});

export const componentsLibrarySchema = z.object({
	definitions: z.record(z.string(), componentDefinitionSchema),
	sets: z.record(z.string(), componentSetSchema),
});

export type ComponentDefinition = z.infer<typeof componentDefinitionSchema>;
export type ComponentSet = z.infer<typeof componentSetSchema>;
export type ComponentsLibrary = z.infer<typeof componentsLibrarySchema>;

export const imageAssetSchema = z.object({
	type: z.literal('image'),
	mime: z.string(),
	dataBase64: z.string().optional(),
	width: z.number(),
	height: z.number(),
});

export const assetSchema = z.discriminatedUnion('type', [imageAssetSchema]);

export type Asset = z.infer<typeof assetSchema>;

export const pageSchema = z.object({
	id: z.string(),
	name: z.string(),
	rootId: z.string(),
});

export type Page = z.infer<typeof pageSchema>;

export const prototypeTransitionSchema = z.enum([
	'instant',
	'dissolve',
	'slide-left',
	'slide-right',
	'slide-up',
	'slide-down',
]);

export const prototypeInteractionSchema = z.object({
	targetFrameId: z.string(),
	transition: prototypeTransitionSchema,
});

export const prototypeSourceInteractionsSchema = z.object({
	click: prototypeInteractionSchema.optional(),
	hover: prototypeInteractionSchema.optional(),
});

export const prototypePageGraphSchema = z.object({
	startFrameId: z.string().optional(),
	interactionsBySource: z.record(z.string(), prototypeSourceInteractionsSchema),
});

export const prototypeGraphSchema = z.object({
	pages: z.record(z.string(), prototypePageGraphSchema),
});

export type PrototypeTransition = z.infer<typeof prototypeTransitionSchema>;
export type PrototypeInteraction = z.infer<typeof prototypeInteractionSchema>;
export type PrototypeSourceInteractions = z.infer<typeof prototypeSourceInteractionsSchema>;
export type PrototypePageGraph = z.infer<typeof prototypePageGraphSchema>;
export type PrototypeGraph = z.infer<typeof prototypeGraphSchema>;

export const createEmptyPrototypePageGraph = (): PrototypePageGraph => ({
	interactionsBySource: {},
});

export const createEmptyPrototypeGraph = (pageIds: string[] = []): PrototypeGraph => ({
	pages: Object.fromEntries(pageIds.map((pageId) => [pageId, createEmptyPrototypePageGraph()])),
});

export const documentSchema = z.object({
	version: z.number().int().nonnegative(),
	rootId: z.string(),
	pages: z.array(pageSchema).min(1),
	activePageId: z.string(),
	nodes: z.record(z.string(), nodeSchema),
	assets: z.record(z.string(), assetSchema),
	components: componentsLibrarySchema,
	styles: styleLibrarySchema,
	variables: styleVariableLibrarySchema,
	prototype: prototypeGraphSchema,
});

export type Document = z.infer<typeof documentSchema>;

export const createDocument = (): Document => ({
	version: 10,
	rootId: 'root',
	pages: [
		{
			id: 'page_1',
			name: 'Page 1',
			rootId: 'root',
		},
	],
	activePageId: 'page_1',
	nodes: {
		root: {
			id: 'root',
			type: 'frame',
			name: 'Canvas',
			position: { x: 0, y: 0 },
			size: { width: 1280, height: 800 },
			children: [],
			visible: true,
		},
	},
	assets: {},
	components: {
		definitions: {},
		sets: {},
	},
	styles: {
		paint: {},
		text: {},
		effect: {},
		grid: {},
	},
	variables: {
		collections: {},
		tokens: {},
		activeModeByCollection: {},
	},
	prototype: createEmptyPrototypeGraph(['page_1']),
});

export const validateDocument = (doc: unknown): doc is Document => {
	return documentSchema.safeParse(doc).success;
};

export const validateNode = (node: unknown): node is Node => {
	return nodeSchema.safeParse(node).success;
};
