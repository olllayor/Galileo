import type { EditRequest, ImageEditRequest, ImageGenerateRequest } from './contracts';

export const EDIT_SYSTEM_PROMPT = `You are Galileo AI, a deterministic design-edit planner.
Return only valid JSON matching the required schema.

Rules:
- Propose concrete document edits only using these commands: setProps, moveNode, resizeNode, createNode, deleteNode, batch.
- Never use operations outside the allowed command list.
- For createNode, nodeType must be rectangle, text, or frame.
- For mutating existing nodes (setProps, moveNode, resizeNode, deleteNode), target only IDs provided in selectedNodes.
- Keep command count minimal and practical.
- If request is ambiguous or cannot be done safely, return no commandDrafts and add warnings.
- Respect canvas bounds when proposing new positions.
- Prefer preserving user intent with small, reversible edits.
`;

export const IMAGE_EDIT_PLANNER_SYSTEM_PROMPT = `You are Galileo AI image-edit planner.
Rewrite user image-edit instructions into a short, concrete editing prompt.

Rules:
- Preserve intent exactly; do not invent new style goals.
- Keep references to typography/logos/faces faithful.
- Mention composition and fidelity constraints when relevant.
- Output plain text only.`;

const formatRecentThreadMessages = (
	messages: Array<{ role: 'user' | 'assistant'; text: string }> | undefined,
): string => {
	if (!messages || messages.length === 0) return 'none';
	return messages
		.slice(-6)
		.map((message, index) => `${index + 1}. [${message.role}] ${message.text}`)
		.join('\n');
};

export const buildEditPrompt = (request: EditRequest): string => {
	return [
		`Request ID: ${request.requestId}`,
		`User prompt: ${request.prompt}`,
		`Active page: ${request.context.activePageId}`,
		`Selection summary: ${request.context.selectionSummary}`,
		`Canvas: ${request.context.canvas.width}x${request.context.canvas.height}`,
		'Recent thread context:',
		formatRecentThreadMessages(request.thread?.messages),
		'Selected nodes JSON:',
		JSON.stringify(request.context.selectedNodes, null, 2),
		'',
		'Response requirements:',
		'- Provide concise summary.',
		'- Use warnings for assumptions or blockers.',
		'- Provide commandDrafts that satisfy constraints.',
	].join('\n');
};

export const buildImageGeneratePrompt = (request: ImageGenerateRequest): string => {
	return [
		`User prompt: ${request.prompt}`,
		`Active page: ${request.context.activePageId}`,
		`Selection summary: ${request.context.selectionSummary}`,
		`Canvas: ${request.context.canvas.width}x${request.context.canvas.height}`,
		'Recent thread context:',
		formatRecentThreadMessages(request.thread?.messages),
	].join('\n');
};

export const buildImageEditPlannerPrompt = (request: ImageEditRequest): string => {
	return [
		`Request ID: ${request.requestId}`,
		`User prompt: ${request.prompt}`,
		`Active page: ${request.context.activePageId}`,
		`Selection summary: ${request.context.selectionSummary}`,
		`Canvas: ${request.context.canvas.width}x${request.context.canvas.height}`,
		`Source image node: ${request.sourceImage.nodeId}`,
		`Source image size: ${request.sourceImage.width}x${request.sourceImage.height}`,
		'Recent thread context:',
		formatRecentThreadMessages(request.thread?.messages),
		'',
		'Return a concise edit instruction for the image model.',
	].join('\n');
};

export const buildImageEditPrompt = (request: ImageEditRequest, normalizedPrompt: string): string => {
	const size = request.image.size;
	return [
		`Edit the provided source image according to this instruction: ${normalizedPrompt}`,
		`Output exactly one edited image at ${size}.`,
		'Preserve key subject identity and layout unless the instruction explicitly changes them.',
		'Keep logos/text readable when present.',
	].join(' ');
};
