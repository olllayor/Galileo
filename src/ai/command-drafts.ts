import type { Command } from '../core/commands/types';
import type { Document, Node } from '../core/doc/types';
import { generateId } from '../core/doc/id';
import type { AICommandDraft } from './contracts';

const MAX_HYDRATED_COMMANDS = 20;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const toFiniteNumber = (value: unknown): number | null => {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return value;
};

const toPoint = (value: unknown): { x: number; y: number } | null => {
	if (!isRecord(value)) return null;
	const x = toFiniteNumber(value.x);
	const y = toFiniteNumber(value.y);
	if (x === null || y === null) return null;
	return { x, y };
};

const toSize = (value: unknown): { width: number; height: number } | null => {
	if (!isRecord(value)) return null;
	const width = toFiniteNumber(value.width);
	const height = toFiniteNumber(value.height);
	if (width === null || height === null) return null;
	return {
		width: Math.max(1, width),
		height: Math.max(1, height),
	};
};

const toSolidFill = (value: unknown): Node['fill'] | undefined => {
	if (typeof value === 'string' && value.trim().length > 0) {
		return { type: 'solid', value: value.trim() };
	}
	if (!isRecord(value)) return undefined;
	if (value.type === 'solid' && typeof value.value === 'string' && value.value.trim().length > 0) {
		return { type: 'solid', value: value.value.trim() };
	}
	return undefined;
};

const sanitizeNodeProps = (props: Record<string, unknown>): Partial<Node> => {
	const next: Partial<Node> = {};

	if (typeof props.name === 'string') next.name = props.name.slice(0, 140);
	if (typeof props.text === 'string') next.text = props.text.slice(0, 8000);
	if (typeof props.fontFamily === 'string') next.fontFamily = props.fontFamily.slice(0, 120);
	if (props.fontWeight === 'normal' || props.fontWeight === 'bold' || props.fontWeight === '500' || props.fontWeight === '600') {
		next.fontWeight = props.fontWeight;
	}
	if (props.textAlign === 'left' || props.textAlign === 'center' || props.textAlign === 'right') {
		next.textAlign = props.textAlign;
	}
	if (props.textResizeMode === 'auto-width' || props.textResizeMode === 'auto-height' || props.textResizeMode === 'fixed') {
		next.textResizeMode = props.textResizeMode;
	}
	if (typeof props.visible === 'boolean') next.visible = props.visible;

	const opacity = toFiniteNumber(props.opacity);
	if (opacity !== null) next.opacity = clamp(opacity, 0, 1);

	const rotation = toFiniteNumber(props.rotation);
	if (rotation !== null) next.rotation = rotation;

	const fontSize = toFiniteNumber(props.fontSize);
	if (fontSize !== null) next.fontSize = Math.max(1, fontSize);

	const cornerRadius = toFiniteNumber(props.cornerRadius);
	if (cornerRadius !== null) next.cornerRadius = Math.max(0, cornerRadius);

	const lineHeightPx = toFiniteNumber(props.lineHeightPx);
	if (lineHeightPx !== null) next.lineHeightPx = Math.max(1, lineHeightPx);

	const letterSpacingPx = toFiniteNumber(props.letterSpacingPx);
	if (letterSpacingPx !== null) next.letterSpacingPx = letterSpacingPx;

	const fill = toSolidFill(props.fill);
	if (fill) next.fill = fill;

	const nextPosition = toPoint(props.position);
	if (nextPosition) next.position = nextPosition;

	const nextSize = toSize(props.size);
	if (nextSize) next.size = nextSize;

	return next;
};

const buildDefaultNode = (
	draft: Extract<AICommandDraft, { type: 'createNode' }>,
	position: { x: number; y: number },
	size: { width: number; height: number },
): Omit<Node, 'id' | 'children'> => {
	const baseName =
		typeof draft.name === 'string' && draft.name.trim().length > 0
			? draft.name.trim()
			: draft.nodeType === 'text'
				? 'Text'
				: draft.nodeType === 'frame'
					? 'Frame'
					: 'Rectangle';

	if (draft.nodeType === 'text') {
		const textFromProps = isRecord(draft.props) && typeof draft.props.text === 'string' ? draft.props.text : undefined;
		return {
			type: 'text',
			name: baseName,
			position,
			size,
			visible: true,
			text: textFromProps ?? 'Edit me',
			fontSize: 18,
			fontFamily: 'SF Pro Text, -apple-system, sans-serif',
			fontWeight: 'normal',
			textAlign: 'left',
			textResizeMode: 'auto-width',
			fill: { type: 'solid', value: '#ffffff' },
		};
	}

	if (draft.nodeType === 'frame') {
		return {
			type: 'frame',
			name: baseName,
			position,
			size,
			visible: true,
			clipContent: false,
		};
	}

	return {
		type: 'rectangle',
		name: baseName,
		position,
		size,
		visible: true,
		fill: { type: 'solid', value: '#0a84ff' },
	};
};

type HydrateAICommandDraftOptions = {
	document: Document;
	drafts: AICommandDraft[];
	selectedIds: string[];
	activePageRootId: string;
	activePageNodeIds: Set<string>;
	fallbackPosition: { x: number; y: number };
};

type HydrateAICommandDraftResult = {
	commands: Command[];
	warnings: string[];
};

const hydrateDraft = (
	draft: AICommandDraft,
	options: HydrateAICommandDraftOptions,
	warnings: string[],
	hydratedCount: { value: number },
	depth = 0,
): Command[] => {
	if (hydratedCount.value >= MAX_HYDRATED_COMMANDS) {
		warnings.push(`Exceeded command limit (${MAX_HYDRATED_COMMANDS}).`);
		return [];
	}

	const selectedIdSet = new Set(options.selectedIds);

	if (draft.type === 'batch') {
		if (depth > 1) {
			warnings.push('Nested batch commands are ignored.');
			return [];
		}
		const commands: Command[] = [];
		for (const child of draft.commands) {
			commands.push(...hydrateDraft(child, options, warnings, hydratedCount, depth + 1));
			if (hydratedCount.value >= MAX_HYDRATED_COMMANDS) break;
		}
		return commands;
	}

	if (draft.type !== 'createNode' && !selectedIdSet.has(draft.id)) {
		warnings.push(`Skipped ${draft.type} for non-selected node: ${draft.id}`);
		return [];
	}
	if (draft.type !== 'createNode' && !options.activePageNodeIds.has(draft.id)) {
		warnings.push(`Skipped ${draft.type} outside active page: ${draft.id}`);
		return [];
	}

	hydratedCount.value += 1;

	if (draft.type === 'setProps') {
		const props = sanitizeNodeProps(draft.props);
		if (Object.keys(props).length === 0) {
			warnings.push(`Skipped setProps for ${draft.id}; no supported properties.`);
			return [];
		}
		return [
			{
				id: generateId(),
				timestamp: Date.now(),
				source: 'ai',
				description: `AI set properties: ${draft.id}`,
				type: 'setProps',
				payload: {
					id: draft.id,
					props,
				},
			},
		];
	}

	if (draft.type === 'moveNode') {
		return [
			{
				id: generateId(),
				timestamp: Date.now(),
				source: 'ai',
				description: `AI move node: ${draft.id}`,
				type: 'moveNode',
				payload: {
					id: draft.id,
					position: draft.position,
				},
			},
		];
	}

	if (draft.type === 'resizeNode') {
		return [
			{
				id: generateId(),
				timestamp: Date.now(),
				source: 'ai',
				description: `AI resize node: ${draft.id}`,
				type: 'resizeNode',
				payload: {
					id: draft.id,
					size: {
						width: Math.max(1, draft.size.width),
						height: Math.max(1, draft.size.height),
					},
				},
			},
		];
	}

	if (draft.type === 'deleteNode') {
		return [
			{
				id: generateId(),
				timestamp: Date.now(),
				source: 'ai',
				description: `AI delete node: ${draft.id}`,
				type: 'deleteNode',
				payload: {
					id: draft.id,
				},
			},
		];
	}

	const parentCandidate = draft.parentId ?? options.activePageRootId;
	const parentNode = options.document.nodes[parentCandidate];
	const parentValid =
		Boolean(parentNode) &&
		options.activePageNodeIds.has(parentCandidate) &&
		(parentNode?.type === 'frame' || parentNode?.type === 'group');
	const parentId = parentValid ? parentCandidate : options.activePageRootId;

	if (!parentValid && draft.parentId) {
		warnings.push(`Invalid create parent ${draft.parentId}; using active page root.`);
	}

	const defaultSize =
		draft.nodeType === 'text'
			? { width: 260, height: 48 }
			: draft.nodeType === 'frame'
				? { width: 480, height: 320 }
				: { width: 220, height: 140 };
	const size = draft.size
		? {
				width: Math.max(1, draft.size.width),
				height: Math.max(1, draft.size.height),
			}
		: defaultSize;
	const position = draft.position ?? options.fallbackPosition;
	const nodeDefaults = buildDefaultNode(draft, position, size);
	const props = isRecord(draft.props) ? sanitizeNodeProps(draft.props) : {};
	const node = {
		...nodeDefaults,
		...props,
		position: props.position ?? nodeDefaults.position,
		size: props.size ?? nodeDefaults.size,
	};
	const nextNodeId =
		typeof draft.id === 'string' && draft.id.length > 0 && !options.document.nodes[draft.id]
			? draft.id
			: generateId();
	if (draft.id && draft.id !== nextNodeId) {
		warnings.push(`Create node id ${draft.id} already exists; generated a new id.`);
	}

	return [
		{
			id: generateId(),
			timestamp: Date.now(),
			source: 'ai',
			description: `AI create ${draft.nodeType}`,
			type: 'createNode',
			payload: {
				id: nextNodeId,
				parentId,
				node,
			},
		},
	];
};

export const hydrateAICommandDrafts = (options: HydrateAICommandDraftOptions): HydrateAICommandDraftResult => {
	const warnings: string[] = [];
	const hydratedCount = { value: 0 };
	const commands: Command[] = [];
	for (const draft of options.drafts) {
		commands.push(...hydrateDraft(draft, options, warnings, hydratedCount));
		if (hydratedCount.value >= MAX_HYDRATED_COMMANDS) {
			break;
		}
	}

	return {
		commands,
		warnings,
	};
};
