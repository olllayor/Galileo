import { z } from 'zod';

export const AI_CONTRACT_VERSION = 1;
export const AI_MAX_COMMAND_DRAFTS = 20;

const pointSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
});

const sizeSchema = z.object({
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
});

export const selectedNodeContextSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	name: z.string().optional(),
	position: pointSchema,
	size: sizeSchema,
	text: z.string().optional(),
	fill: z.string().optional(),
	fontSize: z.number().finite().optional(),
	fontWeight: z.string().optional(),
	textAlign: z.enum(['left', 'center', 'right']).optional(),
});

export type SelectedNodeContext = z.infer<typeof selectedNodeContextSchema>;

const setPropsDraftSchema = z.object({
	type: z.literal('setProps'),
	id: z.string().min(1),
	props: z.record(z.unknown()),
});

const moveNodeDraftSchema = z.object({
	type: z.literal('moveNode'),
	id: z.string().min(1),
	position: pointSchema,
});

const resizeNodeDraftSchema = z.object({
	type: z.literal('resizeNode'),
	id: z.string().min(1),
	size: sizeSchema,
});

const createNodeDraftSchema = z.object({
	type: z.literal('createNode'),
	nodeType: z.enum(['rectangle', 'text', 'frame']),
	id: z.string().min(1).optional(),
	parentId: z.string().min(1).optional(),
	name: z.string().min(1).max(140).optional(),
	position: pointSchema.optional(),
	size: sizeSchema.optional(),
	props: z.record(z.unknown()).optional(),
});

const deleteNodeDraftSchema = z.object({
	type: z.literal('deleteNode'),
	id: z.string().min(1),
});

export type AICommandDraft =
	| z.infer<typeof setPropsDraftSchema>
	| z.infer<typeof moveNodeDraftSchema>
	| z.infer<typeof resizeNodeDraftSchema>
	| z.infer<typeof createNodeDraftSchema>
	| z.infer<typeof deleteNodeDraftSchema>
	| {
			type: 'batch';
			commands: AICommandDraft[];
		};

export const aiCommandDraftSchema: z.ZodType<AICommandDraft> = z.lazy(() =>
	z.union([
		setPropsDraftSchema,
		moveNodeDraftSchema,
		resizeNodeDraftSchema,
		createNodeDraftSchema,
		deleteNodeDraftSchema,
		z.object({
			type: z.literal('batch'),
			commands: z.array(aiCommandDraftSchema).max(AI_MAX_COMMAND_DRAFTS),
		}),
	]),
);

export const aiEditRequestSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	prompt: z.string().min(1).max(6000),
	modelId: z.string().min(1).optional(),
	context: z.object({
		activePageId: z.string().min(1),
		selectionSummary: z.string().min(1).max(2000),
		selectedNodes: z.array(selectedNodeContextSchema).max(200),
		canvas: sizeSchema,
	}),
});

export type AIEditRequest = z.infer<typeof aiEditRequestSchema>;

export const aiEditResponseSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	modelId: z.string().min(1),
	summary: z.string().min(1).max(2000),
	commandDrafts: z.array(aiCommandDraftSchema).max(AI_MAX_COMMAND_DRAFTS),
	warnings: z.array(z.string().min(1).max(400)).max(20),
});

export type AIEditResponse = z.infer<typeof aiEditResponseSchema>;

export const aiImageSizeSchema = z.enum(['1024x1024', '1536x1024', '1024x1536']);
export type AIImageSize = z.infer<typeof aiImageSizeSchema>;

export const aiImageGenerateRequestSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	prompt: z.string().min(1).max(6000),
	modelId: z.string().min(1).optional(),
	context: z.object({
		activePageId: z.string().min(1),
		selectionSummary: z.string().min(1).max(2000),
		canvas: sizeSchema,
	}),
	image: z.object({
		size: aiImageSizeSchema,
		count: z.number().int().min(1).max(2),
	}),
});

export type AIImageGenerateRequest = z.infer<typeof aiImageGenerateRequestSchema>;

export const aiImageGenerateResponseSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	modelId: z.string().min(1),
	summary: z.string().min(1).max(2000),
	images: z
		.array(
			z.object({
				mimeType: z.string().min(1),
				base64: z.string().min(1),
			}),
		)
		.min(1)
		.max(2),
	warnings: z.array(z.string().min(1).max(400)).max(20),
});

export type AIImageGenerateResponse = z.infer<typeof aiImageGenerateResponseSchema>;

export type AIAssistantStatus = 'idle' | 'generating' | 'preview-ready' | 'applied' | 'error';
