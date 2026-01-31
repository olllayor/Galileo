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
});

export type Layout = z.infer<typeof layoutSchema>;

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

	pathData: z.string().optional(),
	d: z.string().optional(),

	componentId: z.string().optional(),
	variant: z.record(z.any()).optional(),

	// Device preset metadata for mockup integration
	devicePresetId: z.string().optional(),

	locked: z.boolean().optional(),
	visible: z.boolean().optional(),
	aspectRatioLocked: z.boolean().optional(),
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
	version: 2,
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
