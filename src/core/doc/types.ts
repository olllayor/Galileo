import { z } from 'zod';

export const colorSchema = z.union([
  z.object({
    type: z.literal('solid'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('gradient'),
    stops: z.any().array(),
  }),
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
  type: z.enum([
    'frame',
    'rectangle',
    'text',
    'image',
    'componentInstance',
    'ellipse',
    'path',
  ]),
  name: z.string().optional(),
  children: z.string().array().optional(),

  position: positionSchema,
  size: sizeSchema,

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
      src: z.string(),
      mime: z.string().optional(),
      originalPath: z.string().optional(),
    })
    .optional(),

  componentId: z.string().optional(),
  variant: z.record(z.any()).optional(),

  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  aspectRatioLocked: z.boolean().optional(),
});

export type Node = z.infer<typeof nodeSchema>;

export const documentSchema = z.object({
  version: z.number().int().nonnegative(),
  rootId: z.string(),
  nodes: z.record(z.string(), nodeSchema),
});

export type Document = z.infer<typeof documentSchema>;

export const createDocument = (): Document => ({
  version: 1,
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
});

export const validateDocument = (doc: unknown): doc is Document => {
  return documentSchema.safeParse(doc).success;
};

export const validateNode = (node: unknown): node is Node => {
  return nodeSchema.safeParse(node).success;
};
