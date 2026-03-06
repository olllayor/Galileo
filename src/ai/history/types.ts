export type AIHistoryMessage = {
	role: 'user' | 'assistant';
	text: string;
};

export type AIHistoryMode = 'edit' | 'image-generate' | 'image-edit';

export type AIHistoryContext = {
	threadId?: string;
	messages: AIHistoryMessage[];
};

export type AIHistoryScope = {
	actorId: string;
	projectKey: string;
	roomId?: string;
	pageId: string;
	mode: AIHistoryMode;
	selectionKey: string;
};

export type AIHistoryInteraction = AIHistoryScope & {
	requestId: string;
	prompt: string;
	assistantText: string;
	modelId: string;
	warnings?: string[];
};

export type AIHistoryFailure = AIHistoryScope & {
	requestId: string;
	prompt: string;
	errorText: string;
	modelId?: string;
};

export interface AIHistoryTransport {
	resolveContext(scope: AIHistoryScope): Promise<AIHistoryContext>;
	appendInteraction(interaction: AIHistoryInteraction): Promise<{ threadId: string }>;
	appendFailure(failure: AIHistoryFailure): Promise<{ threadId: string }>;
}
