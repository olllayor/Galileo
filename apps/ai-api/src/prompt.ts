import type { EditRequest } from './contracts';

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

export const buildEditPrompt = (request: EditRequest): string => {
	return [
		`Request ID: ${request.requestId}`,
		`User prompt: ${request.prompt}`,
		`Active page: ${request.context.activePageId}`,
		`Selection summary: ${request.context.selectionSummary}`,
		`Canvas: ${request.context.canvas.width}x${request.context.canvas.height}`,
		'Selected nodes JSON:',
		JSON.stringify(request.context.selectedNodes, null, 2),
		'',
		'Response requirements:',
		'- Provide concise summary.',
		'- Use warnings for assumptions or blockers.',
		'- Provide commandDrafts that satisfy constraints.',
	].join('\n');
};
