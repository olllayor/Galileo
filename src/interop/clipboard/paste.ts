import type { Asset, Node } from '../../core/doc/types';
import type { ClipboardPayload, ClipboardPayloadV1, ClipboardPayloadV2 } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const hasImageAssetRef = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

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
		if (!image) continue;
		const refs = [image.assetId, image.maskAssetId].filter(hasImageAssetRef);
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

export const remapNodeAssetIdsForPaste = (node: Node, assetIdMap: Record<string, string>): Node => {
	const remappedNode: Node = {
		...node,
		...(node.image ? { image: remapImageAssetRefs(node.image, assetIdMap) } : {}),
	};

	if (remappedNode.componentOverrides) {
		const nextOverrides: NonNullable<Node['componentOverrides']> = {};
		for (const [sourceNodeId, patch] of Object.entries(remappedNode.componentOverrides)) {
			nextOverrides[sourceNodeId] = {
				...patch,
				...(patch.image ? { image: remapImageAssetRefs(patch.image, assetIdMap) } : {}),
			};
		}
		remappedNode.componentOverrides = nextOverrides;
	}

	return remappedNode;
};
