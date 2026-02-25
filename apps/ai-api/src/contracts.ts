import { z } from 'zod';

export const AI_CONTRACT_VERSION = 1;
export const MAX_COMMAND_DRAFTS = 20;

export const createNodeTypeSchema = z.enum(['rectangle', 'text', 'frame']);

const pointSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
});

const sizeSchema = z.object({
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
});

const selectedNodeContextSchema = z.object({
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

export const editRequestSchema = z.object({
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

export type EditRequest = z.infer<typeof editRequestSchema>;

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
	nodeType: createNodeTypeSchema,
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

export type CommandDraft =
	| z.infer<typeof setPropsDraftSchema>
	| z.infer<typeof moveNodeDraftSchema>
	| z.infer<typeof resizeNodeDraftSchema>
	| z.infer<typeof createNodeDraftSchema>
	| z.infer<typeof deleteNodeDraftSchema>
	| {
			type: 'batch';
			commands: CommandDraft[];
		};

export const commandDraftSchema: z.ZodType<CommandDraft> = z.lazy(() =>
	z.union([
		setPropsDraftSchema,
		moveNodeDraftSchema,
		resizeNodeDraftSchema,
		createNodeDraftSchema,
		deleteNodeDraftSchema,
		z.object({
			type: z.literal('batch'),
			commands: z.array(commandDraftSchema).max(MAX_COMMAND_DRAFTS),
		}),
	]),
);

export const aiModelResponseSchema = z.object({
	summary: z.string().min(1).max(2000),
	commandDrafts: z.array(commandDraftSchema).max(MAX_COMMAND_DRAFTS),
	warnings: z.array(z.string().min(1).max(400)).max(20),
});

export type AIModelResponse = z.infer<typeof aiModelResponseSchema>;

export const editResponseSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	modelId: z.string().min(1),
	summary: z.string().min(1).max(2000),
	commandDrafts: z.array(commandDraftSchema).max(MAX_COMMAND_DRAFTS),
	warnings: z.array(z.string().min(1).max(400)).max(20),
});

export type EditResponse = z.infer<typeof editResponseSchema>;

export const imageSizeSchema = z.enum(['1024x1024', '1536x1024', '1024x1536']);

export const imageGenerateRequestSchema = z.object({
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
		size: imageSizeSchema,
		count: z.number().int().min(1).max(2),
	}),
});

export type ImageGenerateRequest = z.infer<typeof imageGenerateRequestSchema>;

export const imageGenerateResponseSchema = z.object({
	contractVersion: z.literal(AI_CONTRACT_VERSION),
	requestId: z.string().min(1),
	modelId: z.string().min(1),
	summary: z.string().min(1).max(2000),
	images: z
		.array(
			z.object({
				mimeType: z.string().min(1).max(120),
				base64: z.string().min(1),
			}),
		)
		.min(1)
		.max(2),
	warnings: z.array(z.string().min(1).max(400)).max(20),
});

export type ImageGenerateResponse = z.infer<typeof imageGenerateResponseSchema>;

export const countDraftCommands = (drafts: CommandDraft[]): number => {
	let count = 0;
	const stack = [...drafts];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		count += 1;
		if (current.type === 'batch') {
			for (const child of current.commands) {
				stack.push(child);
			}
		}
	}
	return count;
};
