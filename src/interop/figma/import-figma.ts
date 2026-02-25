import { figmaClient } from './client';
import { mapFigmaPayloadToClipboardPayload } from './map-figma-to-galileo';

export type ImportFromFigmaParams = {
	fileKey: string;
	token: string;
	nodeIds?: string[];
	generateId: () => string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const collectImageRefsFromNode = (node: unknown, refs: Set<string>): void => {
	if (!isRecord(node)) return;
	const fills = node.fills;
	if (Array.isArray(fills)) {
		for (const fill of fills) {
			if (!isRecord(fill)) continue;
			if (fill.type !== 'IMAGE') continue;
			if (typeof fill.imageRef === 'string' && fill.imageRef.length > 0) {
				refs.add(fill.imageRef);
			}
		}
	}

	const children = node.children;
	if (!Array.isArray(children)) return;
	for (const child of children) {
		collectImageRefsFromNode(child, refs);
	}
};

const collectImageRefsFromPayload = (payload: unknown): string[] => {
	const refs = new Set<string>();
	if (!isRecord(payload)) return [];

	if (Array.isArray(payload.selection)) {
		for (const entry of payload.selection) {
			collectImageRefsFromNode(entry, refs);
		}
	}

	if (isRecord(payload.document)) {
		collectImageRefsFromNode(payload.document, refs);
	}

	if (isRecord(payload.nodes)) {
		for (const entry of Object.values(payload.nodes)) {
			if (!isRecord(entry)) continue;
			if (isRecord(entry.document)) {
				collectImageRefsFromNode(entry.document, refs);
			}
		}
	}

	return Array.from(refs);
};

const chunk = <T>(items: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
};

export const parseFigmaFileKey = (input: string): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (!trimmed.includes('/')) return trimmed;
	const match = trimmed.match(/figma\.com\/file\/([a-zA-Z0-9]+)\//i);
	if (match?.[1]) return match[1];
	const nodeMatch = trimmed.match(/figma\.com\/design\/([a-zA-Z0-9]+)\//i);
	if (nodeMatch?.[1]) return nodeMatch[1];
	return null;
};

export const parseNodeIds = (input: string): string[] => {
	if (!input.trim()) return [];
	return input
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
};

export const importFromFigma = async (params: ImportFromFigmaParams) => {
	const normalizedNodeIds = (params.nodeIds ?? []).map((id) => id.trim()).filter(Boolean);
	const fileResponse =
		normalizedNodeIds.length > 0
			? await figmaClient.fetchNodes({
					fileKey: params.fileKey,
					token: params.token,
					nodeIds: normalizedNodeIds,
					depth: 6,
					geometry: 'paths',
				})
			: await figmaClient.fetchFile({
					fileKey: params.fileKey,
					token: params.token,
					depth: 6,
					geometry: 'paths',
				});

	const imageRefs = collectImageRefsFromPayload(fileResponse);
	let imagesByRef: Record<string, string> | undefined;
	if (imageRefs.length > 0) {
		imagesByRef = {};
		for (const group of chunk(imageRefs, 100)) {
			try {
				const next = await figmaClient.fetchImages({
					fileKey: params.fileKey,
					token: params.token,
					imageRefs: group,
					format: 'png',
					scale: 2,
				});
				Object.assign(imagesByRef, next);
			} catch (error) {
				console.warn('Figma image fetch failed; continuing without image URLs.', error);
				break;
			}
		}
	}

	const mapped = mapFigmaPayloadToClipboardPayload(fileResponse, {
		generateId: params.generateId,
		name: 'Figma Import',
		imagesByRef,
	});
	return mapped;
};
