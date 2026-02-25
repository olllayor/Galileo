import { applyCommand } from '../core/commands/executor';
import type { Command } from '../core/commands/types';
import type { Document } from '../core/doc/types';

export const applyAICommandPreview = (baseDocument: Document, commands: Command[]): Document => {
	let next = baseDocument;
	for (const command of commands) {
		next = applyCommand(next, command);
	}
	return next;
};
