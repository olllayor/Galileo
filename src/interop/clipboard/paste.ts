import type { Asset, Node } from '../../core/doc/types';
import type { ClipboardPayload, ClipboardPayloadV1, ClipboardPayloadV2 } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const hasImageAssetRef = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const collectPaintImageAssetRefs = (node: Node): string[] => {
	const refs: string[] = [];
	for (const fill of node.fills ?? []) {
		if (fill.paint.type === 'image' && hasImageAssetRef(fill.paint.assetId)) {
			refs.push(fill.paint.assetId);
		}
	}
	for (const stroke of node.strokes ?? []) {
		if (stroke.paint.type === 'image' && hasImageAssetRef(stroke.paint.assetId)) {
			refs.push(stroke.paint.assetId);
		}
	}
	return refs;
};

export const toClipboardPayloadV2 = (payload: ClipboardPayload): ClipboardPayloadV2 => {
	if (payload.version === 2) {
		return payload;
	}
	const v1 = payload as ClipboardPayloadV1;
	return {
		...v1,
		version: 2,
		assets: {},
		source: 'galileo',
	};
};

export const collectClipboardAssetsFromNodes = (
	payload: ClipboardPayloadV1,
	assetStore: Record<string, Asset>,
): Record<string, Asset> => {
	const assets: Record<string, Asset> = {};
	for (const node of Object.values(payload.nodes)) {
		const image = node.image;
		const refs = [
			...(image ? [image.assetId, image.maskAssetId].filter(hasImageAssetRef) : []),
			...collectPaintImageAssetRefs(node),
		];
		for (const patch of Object.values(node.componentOverrides ?? {})) {
			if (patch.image?.assetId && hasImageAssetRef(patch.image.assetId)) refs.push(patch.image.assetId);
			if (patch.image?.maskAssetId && hasImageAssetRef(patch.image.maskAssetId)) refs.push(patch.image.maskAssetId);
			for (const fill of patch.fills ?? []) {
				if (fill.paint.type === 'image' && hasImageAssetRef(fill.paint.assetId)) refs.push(fill.paint.assetId);
			}
			for (const stroke of patch.strokes ?? []) {
				if (stroke.paint.type === 'image' && hasImageAssetRef(stroke.paint.assetId)) refs.push(stroke.paint.assetId);
			}
		}
		for (const ref of refs) {
			const asset = assetStore[ref];
			if (asset) {
				assets[ref] = asset;
			}
		}
	}
	return assets;
};

export const buildClipboardPayloadV2 = (
	payload: ClipboardPayloadV1,
	assetStore: Record<string, Asset>,
	source: ClipboardPayloadV2['source'] = 'galileo',
): ClipboardPayloadV2 => {
	return {
		...payload,
		version: 2,
		assets: collectClipboardAssetsFromNodes(payload, assetStore),
		source,
	};
};

export const buildAssetIdRemapForPaste = (
	payload: ClipboardPayloadV2,
	destinationAssets: Record<string, Asset>,
	generateId: () => string,
): { assetIdMap: Record<string, string>; assetsToCreate: Array<{ id: string; asset: Asset }> } => {
	const assetIdMap: Record<string, string> = {};
	const assetsToCreate: Array<{ id: string; asset: Asset }> = [];

	for (const [oldId, asset] of Object.entries(payload.assets ?? {})) {
		if (!asset || !isRecord(asset)) continue;
		let nextId = oldId;
		if (destinationAssets[nextId] || assetsToCreate.some((entry) => entry.id === nextId)) {
			nextId = generateId();
		}
		assetIdMap[oldId] = nextId;
		assetsToCreate.push({ id: nextId, asset: asset as Asset });
	}

	return { assetIdMap, assetsToCreate };
};

const remapImageAssetRefs = (
	image: Node['image'],
	assetIdMap: Record<string, string>,
): Node['image'] => {
	if (!image) return image;
	const next = { ...image };
	if (next.assetId && assetIdMap[next.assetId]) {
		next.assetId = assetIdMap[next.assetId];
	}
	if (next.maskAssetId && assetIdMap[next.maskAssetId]) {
		next.maskAssetId = assetIdMap[next.maskAssetId];
	}
	return next;
};

const remapPaintAssetRefs = (node: Node, assetIdMap: Record<string, string>): Pick<Node, 'fills' | 'strokes'> => {
	const fills = node.fills?.map((fill) => {
		if (fill.paint.type !== 'image') return fill;
		const nextId = assetIdMap[fill.paint.assetId] ?? fill.paint.assetId;
		return {
			...fill,
			paint: {
				...fill.paint,
				assetId: nextId,
			},
		};
	});
	const strokes = node.strokes?.map((stroke) => {
		if (stroke.paint.type !== 'image') return stroke;
		const nextId = assetIdMap[stroke.paint.assetId] ?? stroke.paint.assetId;
		return {
			...stroke,
			paint: {
				...stroke.paint,
				assetId: nextId,
			},
		};
	});
	return { fills, strokes };
};

export const remapNodeAssetIdsForPaste = (node: Node, assetIdMap: Record<string, string>): Node => {
	const remappedNode: Node = {
		...node,
		...(node.image ? { image: remapImageAssetRefs(node.image, assetIdMap) } : {}),
		...remapPaintAssetRefs(node, assetIdMap),
	};

	if (remappedNode.componentOverrides) {
		const nextOverrides: NonNullable<Node['componentOverrides']> = {};
		for (const [sourceNodeId, patch] of Object.entries(remappedNode.componentOverrides)) {
			const fills = patch.fills?.map((fill) => {
				if (fill.paint.type !== 'image') return fill;
				return {
					...fill,
					paint: {
						...fill.paint,
						assetId: assetIdMap[fill.paint.assetId] ?? fill.paint.assetId,
					},
				};
			});
			const strokes = patch.strokes?.map((stroke) => {
				if (stroke.paint.type !== 'image') return stroke;
				return {
					...stroke,
					paint: {
						...stroke.paint,
						assetId: assetIdMap[stroke.paint.assetId] ?? stroke.paint.assetId,
					},
				};
			});
			nextOverrides[sourceNodeId] = {
				...patch,
				...(patch.image ? { image: remapImageAssetRefs(patch.image, assetIdMap) } : {}),
				...(fills ? { fills } : {}),
				...(strokes ? { strokes } : {}),
			};
		}
		remappedNode.componentOverrides = nextOverrides;
	}

	return remappedNode;
};

export const remapNodeReferencesForPaste = (node: Node, remapNodeId: (nodeId: string) => string | undefined): Node => {
	const nextNode: Node = { ...node };
	if (node.mask?.sourceNodeId) {
		const remappedSource = remapNodeId(node.mask.sourceNodeId);
		nextNode.mask = {
			...node.mask,
			sourceNodeId: remappedSource ?? node.mask.sourceNodeId,
		};
	}

	if (node.componentOverrides) {
		const nextOverrides: NonNullable<Node['componentOverrides']> = {};
		for (const [sourceNodeId, patch] of Object.entries(node.componentOverrides)) {
			const nextPatch = { ...patch };
			if (patch.mask?.sourceNodeId) {
				const remappedSource = remapNodeId(patch.mask.sourceNodeId);
				nextPatch.mask = {
					...patch.mask,
					sourceNodeId: remappedSource ?? patch.mask.sourceNodeId,
				};
			}
			nextOverrides[sourceNodeId] = nextPatch;
		}
		nextNode.componentOverrides = nextOverrides;
	}

	return nextNode;
};
