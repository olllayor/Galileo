import type { Document, Node } from '../core/doc/types';
import type { SelectedNodeContext } from './contracts';

export interface SelectionContext {
	selectedNodes: Node[];
	contextSummary: string;
}

const MAX_TEXT_PREVIEW_CHARS = 240;

const toHexFill = (node: Node): string | undefined => {
	if (!node.fill) return undefined;
	if (node.fill.type === 'solid') return node.fill.value;
	return undefined;
};

const truncateText = (value: string | undefined): string | undefined => {
	if (!value) return undefined;
	if (value.length <= MAX_TEXT_PREVIEW_CHARS) return value;
	return `${value.slice(0, MAX_TEXT_PREVIEW_CHARS)}...`;
};

const toSelectedNodeContext = (node: Node): SelectedNodeContext => {
	return {
		id: node.id,
		type: node.type,
		name: node.name,
		position: {
			x: node.position.x,
			y: node.position.y,
		},
		size: {
			width: Math.max(1, node.size.width),
			height: Math.max(1, node.size.height),
		},
		text: node.type === 'text' ? truncateText(node.text) : undefined,
		fill: toHexFill(node),
		fontSize: typeof node.fontSize === 'number' ? node.fontSize : undefined,
		fontWeight: node.fontWeight,
		textAlign: node.textAlign,
	};
};

export const buildSelectionContext = (doc: Document, selectedIds: string[]): SelectionContext => {
	const selectedNodes = selectedIds
		.map((id) => doc.nodes[id])
		.filter((node): node is Node => node !== undefined);

	const contextSummary = summarizeSelection(selectedNodes);

	return {
		selectedNodes,
		contextSummary,
	};
};

const summarizeSelection = (nodes: Node[]): string => {
	if (nodes.length === 0) {
		return 'No selection';
	}

	const types = nodes.map((n) => n.type);
	const typeCounts = types.reduce((acc: Record<string, number>, type) => {
		acc[type] = (acc[type] || 0) + 1;
		return acc;
	}, {});

	const summary = Object.entries(typeCounts)
		.map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
		.join(', ');

	return `Selected: ${summary}`;
};

export const buildAIEditContext = (
	doc: Document,
	selectedIds: string[],
	activePageId: string,
	canvas: { width: number; height: number },
): {
	activePageId: string;
	selectionSummary: string;
	selectedNodes: SelectedNodeContext[];
	canvas: { width: number; height: number };
} => {
	const selection = buildSelectionContext(doc, selectedIds);
	return {
		activePageId,
		selectionSummary: selection.contextSummary,
		selectedNodes: selection.selectedNodes.map(toSelectedNodeContext),
		canvas: {
			width: Math.max(1, Math.round(canvas.width)),
			height: Math.max(1, Math.round(canvas.height)),
		},
	};
};

export const nodesToJSON = (nodes: Node[]): string => {
	return JSON.stringify(
		nodes.map((node) => ({
			id: node.id,
			type: node.type,
			name: node.name,
			position: node.position,
			size: node.size,
			fill: node.fill,
			stroke: node.stroke,
			text: node.text,
			fontSize: node.fontSize,
			fontFamily: node.fontFamily,
			fontWeight: node.fontWeight,
			textAlign: node.textAlign,
			lineHeightPx: node.lineHeightPx,
			letterSpacingPx: node.letterSpacingPx,
			textResizeMode: node.textResizeMode,
			componentId: node.componentId,
			variant: node.variant,
		})),
		null,
		2,
	);
};

export const nodeToJSON = (node: Node): string => {
	return JSON.stringify(
		{
			id: node.id,
			type: node.type,
			name: node.name,
			position: node.position,
			size: node.size,
			fill: node.fill,
			stroke: node.stroke,
			text: node.text,
			fontSize: node.fontSize,
			fontFamily: node.fontFamily,
			fontWeight: node.fontWeight,
			textAlign: node.textAlign,
			lineHeightPx: node.lineHeightPx,
			letterSpacingPx: node.letterSpacingPx,
			textResizeMode: node.textResizeMode,
			layout: node.layout,
			componentId: node.componentId,
			variant: node.variant,
		},
		null,
		2,
	);
};

export const getChildrenForAI = (doc: Document, nodeId: string): Node[] => {
	const node = doc.nodes[nodeId];
	if (!node || !node.children) {
		return [];
	}

	return node.children.map((id) => doc.nodes[id]).filter((n): n is Node => n !== undefined);
};
