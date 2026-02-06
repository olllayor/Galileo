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

export const shadowEffectSchema = z.discriminatedUnion('type', [dropShadowEffectSchema, innerShadowEffectSchema]);
export type ShadowEffect = z.infer<typeof shadowEffectSchema>;

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

export const imageMetaSchema = z.discriminatedUnion('kind', [imageMeta3dIconSchema, imageMetaUnsplashSchema]);

export type ImageMeta3dIcon = z.infer<typeof imageMeta3dIconSchema>;
export type ImageMetaUnsplash = z.infer<typeof imageMetaUnsplashSchema>;
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

export const vectorPointSchema = z.object({
	x: z.number(),
	y: z.number(),
});

export const vectorDataSchema = z
	.object({
		points: vectorPointSchema.array(),
		closed: z.boolean().optional(),
	})
	.passthrough();

export type VectorPoint = z.infer<typeof vectorPointSchema>;
export type VectorData = z.infer<typeof vectorDataSchema>;

export const nodeSchema = z.object({
	id: z.string(),
	type: z.enum(['frame', 'group', 'rectangle', 'text', 'image', 'componentInstance', 'ellipse', 'path']),
	name: z.string().optional(),
	children: z.string().array().optional(),

	position: positionSchema,
	size: sizeSchema,
	rotation: z.number().optional(),

	layout: layoutSchema.optional(),

	fill: colorSchema.optional(),
	stroke: strokeSchema.optional(),
	opacity: z.number().optional(),
	cornerRadius: z.number().optional(),

	text: z.string().optional(),
	fontSize: z.number().optional(),
	fontFamily: z.string().optional(),
	fontWeight: z.enum(['normal', 'bold', '500', '600']).optional(),

	image: z
		.object({
			src: z.string().optional(),
			mime: z.string().optional(),
			originalPath: z.string().optional(),
			assetId: z.string().optional(),
			meta: imageMetaSchema.optional(),
			maskAssetId: z.string().optional(),
			bgRemoveMeta: imageBgRemoveMetaSchema.optional(),
		})
		.optional(),

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

	componentId: z.string().optional(),
	variant: z.record(z.any()).optional(),

	// Device preset metadata for mockup integration
	devicePresetId: z.string().optional(),

	locked: z.boolean().optional(),
	visible: z.boolean().optional(),
	aspectRatioLocked: z.boolean().optional(),
	clipContent: z.boolean().optional(),
	shadowOverflow: z.enum(['visible', 'clipped', 'clip-content-only']).optional(),
	effects: shadowEffectSchema.array().optional(),
	effectBindings: shadowEffectBindingSchema.optional(),
	constraints: constraintsSchema.optional(),
	layoutGuides: layoutGuideSchema.optional(),
	layoutSizing: layoutSizingSchema.optional(),
});

export type Node = z.infer<typeof nodeSchema>;

export const imageAssetSchema = z.object({
	type: z.literal('image'),
	mime: z.string(),
	dataBase64: z.string().optional(),
	width: z.number(),
	height: z.number(),
});

export const assetSchema = z.discriminatedUnion('type', [imageAssetSchema]);

export type Asset = z.infer<typeof assetSchema>;

export const documentSchema = z.object({
	version: z.number().int().nonnegative(),
	rootId: z.string(),
	nodes: z.record(z.string(), nodeSchema),
	assets: z.record(z.string(), assetSchema),
});

export type Document = z.infer<typeof documentSchema>;

export const createDocument = (): Document => ({
	version: 3,
	rootId: 'root',
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
});

export const validateDocument = (doc: unknown): doc is Document => {
	return documentSchema.safeParse(doc).success;
};

export const validateNode = (node: unknown): node is Node => {
	return nodeSchema.safeParse(node).success;
};
