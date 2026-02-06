import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Canvas } from './ui/Canvas';
import { ActionBar, type Tool } from './ui/ActionBar';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';
import { PluginModal } from './ui/PluginModal';
import { PluginManagerModal } from './ui/PluginManagerModal';
import { LayersPanel } from './ui/LayersPanel';
import { ProjectsScreen } from './ui/ProjectsScreen';
import { ProjectHandle } from './ui/ProjectHandle';
import { ProjectTabs } from './ui/ProjectTabs';
import { CommandPalette, type CommandPaletteItem } from './ui/CommandPalette';
import { useDocument } from './hooks/useDocument';
import {
	createRectangleTool,
	createFrameTool,
	createTextTool,
	hitTestNodeAtPosition,
	hitTestNodeStackAtPosition,
	findSelectableNode,
	getHitStackInContainer,
	pickHitCycle,
	type HitKind,
} from './interaction/tools';
import {
	buildParentMap,
	buildWorldBoundsMap,
	buildLayoutGuideTargets,
	computeConstrainedBounds,
	computeLayoutGuideLines,
	findParentNode,
	getNodeWorldBounds,
	getSelectionBounds,
	parseDocumentText,
	resolveConstraints,
	serializeDocument,
	type BoundsOverrideMap,
	type Bounds,
	type WorldBoundsMap,
} from './core/doc';
import { generateId } from './core/doc/id';
import { createDocument } from './core/doc/types';
import type { Constraints, Document, ImageMeta, ImageMetaUnsplash, Node, ShadowEffect } from './core/doc/types';
import type { Command } from './core/commands/types';
import {
	createProjectMeta,
	deriveProjectNameFromPath,
	getLastOpenProjectId,
	getProjectById,
	getProjectByPath,
	loadProjects,
	loadProjectsSearch,
	removeProjectById,
	saveProjects,
	saveProjectsSearch,
	setLastOpenProjectId,
	toggleProjectPin,
	updateProjectById,
	upsertProject,
	type ProjectMeta,
	type ProjectVersion,
} from './core/projects/registry';
import type { CanvasPointerInfo, CanvasWheelInfo } from './hooks/useCanvas';
import { getHandleCursor, hitTestHandle } from './interaction/handles';
import type { ResizeHandle } from './interaction/handles';
import { applyResizeSnapping, applySnapping, buildSiblingSnapTargets } from './interaction/snapping';
import type { SnapGuide, SnapTargets } from './interaction/snapping';
import { applyNormalizedEdges, computeNormalizedEdges, type NormalizedEdges } from './interaction/transform-session';
import { exportNodeSnapshot } from './render/export';
import { builtinPlugins } from './plugins/builtin';
import { getIconVariants, renderIcon, searchIcons } from './plugins/icons/registry';
import {
	type PluginManifest,
	type PluginRegistration,
	type PluginPermission,
	type RpcRequest,
	type RpcResponse,
	type SelectionGetResult,
} from './plugins/types';
import {
	loadStoredPlugins,
	saveStoredPlugins,
	loadRecentPluginIds,
	recordRecentPlugin,
	type StoredPlugin,
} from './plugins/storage';
import type { DevicePreset } from './core/framePresets';

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const HANDLE_HIT_SIZE = 14;
const HIT_SLOP_PX = 6;
const EDGE_MIN_PX = 6;
const AUTOSAVE_KEY = 'galileo.autosave.v1';
const AUTOSAVE_DELAY_MS = 1500;
const ZOOM_SENSITIVITY = 0.0035;
const TEXT_PADDING = 4;
const CLIPBOARD_PREFIX = 'GALILEO_CLIPBOARD_V1:';
const DEFAULT_CANVAS_SIZE = { width: 1280, height: 800 } as const;
type RemoveBackgroundResult = {
	maskPngBase64: string;
	width: number;
	height: number;
	revision?: number;
};
type UnsplashSearchResult = {
	id: string;
	width: number;
	height: number;
	color?: string;
	blurHash?: string;
	description?: string;
	altDescription?: string;
	urls: { thumb: string; small: string; regular: string; full: string; raw: string };
	links: { html: string; downloadLocation: string };
	user: { name: string; username: string; links: { html: string } };
};
type UnsplashSearchResponse = {
	total: number;
	totalPages: number;
	results: UnsplashSearchResult[];
};
type UnsplashInsertMode = 'insert' | 'replace';
type UnsplashFetchImageResult = {
	dataBase64: string;
	mime: string;
	width: number;
	height: number;
};
type DragState =
	| {
			mode: 'pan';
			startScreen: { x: number; y: number };
			startPan: { x: number; y: number };
		}
	| {
			mode: 'move';
			startWorld: { x: number; y: number };
			baseDoc: Document;
			selectedIds: string[];
			initialPositions: Record<string, { x: number; y: number }>;
			startBounds: { x: number; y: number; width: number; height: number };
			snapTargets: SnapTargets;
		}
	| {
			mode: 'resize';
			startWorld: { x: number; y: number };
			baseDoc: Document;
			nodeId: string;
			handle: ResizeHandle;
			startBounds: { x: number; y: number; width: number; height: number };
			initialPosition: { x: number; y: number };
			initialSize: { width: number; height: number };
			lockAspectRatio: boolean;
			constraintSnapshot?: FrameConstraintSnapshot | null;
		}
	| {
			mode: 'marquee';
			startWorld: { x: number; y: number };
			currentWorld: { x: number; y: number };
			baseSelection: string[];
			additive: boolean;
		};

type HoverHit = {
	id: string;
	kind: HitKind;
	locked: boolean;
	edgeCursor?: string;
};

type FrameConstraintSnapshot = {
	frameId: string;
	frameSize: { width: number; height: number };
	children: Record<string, { bounds: Bounds; constraints: Constraints }>;
};

type EditorAction =
	| { type: 'duplicate' }
	| { type: 'delete' }
	| { type: 'rename' }
	| { type: 'toggleLock' }
	| { type: 'toggleVisible' }
	| { type: 'reorderZ'; dir: 'front' | 'back' | 'forward' | 'backward' }
	| { type: 'group' }
	| { type: 'ungroup' };

type TransformSession = {
	baseDoc: Document;
	activeIds: string[];
	initialBounds: { x: number; y: number; width: number; height: number };
	normalizedEdgesById: Record<string, NormalizedEdges>;
	handle: ResizeHandle;
	aspectRatio: number;
	startPointerWorld: { x: number; y: number };
	startBoundsMap?: WorldBoundsMap;
	modifiers: { shiftKey: boolean; altKey: boolean };
};

type ClipboardPayload = {
	version: 1;
	rootIds: string[];
	nodes: Record<string, Node>;
	bounds: Bounds;
	rootWorldPositions: Record<string, { x: number; y: number }>;
	parentId: string | null;
};

const cloneShadowEffects = (effects: ShadowEffect[] | undefined): ShadowEffect[] | null => {
	if (!effects || effects.length === 0) return null;
	return effects.map((effect) => ({ ...effect }));
};

const applyPositionUpdates = (doc: Document, updates: Record<string, { x: number; y: number }>): Document => {
	const nodes = { ...doc.nodes };
	for (const [id, position] of Object.entries(updates)) {
		const node = nodes[id];
		if (!node) continue;
		nodes[id] = { ...node, position };
	}

	return { ...doc, nodes };
};

const applyBoundsUpdate = (
	doc: Document,
	nodeId: string,
	position: { x: number; y: number },
	size: { width: number; height: number },
): Document => {
	const node = doc.nodes[nodeId];
	if (!node) return doc;
	return {
		...doc,
		nodes: {
			...doc.nodes,
			[nodeId]: {
				...node,
				position,
				size,
			},
		},
	};
};

const applyBoundsUpdates = (
	doc: Document,
	updates: Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }>,
): Document => {
	const nodes = { ...doc.nodes };
	for (const [id, update] of Object.entries(updates)) {
		const node = nodes[id];
		if (!node) continue;
		nodes[id] = { ...node, position: update.position, size: update.size };
	}

	return { ...doc, nodes };
};

const computeResizeBounds = (
	startBounds: { x: number; y: number; width: number; height: number },
	handle: ResizeHandle,
	deltaX: number,
	deltaY: number,
	minSize = 1,
	lockAspectRatio = false,
): { x: number; y: number; width: number; height: number } => {
	let { x, y, width, height } = startBounds;
	const startAspectRatio = startBounds.width / startBounds.height;

	if (lockAspectRatio) {
		// For corner handles, use the dominant delta direction
		if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se') {
			// Determine which delta is larger to decide the dominant direction
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);

			let newWidth = width;
			let newHeight = height;

			if (absX > absY) {
				// Width is dominant
				if (handle.includes('w')) {
					newWidth = width - deltaX;
				} else {
					newWidth = width + deltaX;
				}
				newHeight = newWidth / startAspectRatio;
			} else {
				// Height is dominant
				if (handle.includes('n')) {
					newHeight = height - deltaY;
				} else {
					newHeight = height + deltaY;
				}
				newWidth = newHeight * startAspectRatio;
			}

			// Ensure minimum size
			if (newWidth < minSize || newHeight < minSize) {
				if (newWidth < minSize) {
					newWidth = minSize;
					newHeight = newWidth / startAspectRatio;
				} else {
					newHeight = minSize;
					newWidth = newHeight * startAspectRatio;
				}
			}

			// Update position based on handle
			if (handle.includes('w')) {
				x = x + (width - newWidth);
			}
			if (handle.includes('n')) {
				y = y + (height - newHeight);
			}

			width = newWidth;
			height = newHeight;
		} else {
			// For edge handles, maintain aspect ratio based on that edge
			if (handle === 'e' || handle === 'w') {
				const newWidth = handle === 'w' ? width - deltaX : width + deltaX;
				const newHeight = newWidth / startAspectRatio;

				if (newWidth >= minSize && newHeight >= minSize) {
					if (handle === 'w') {
						x = x + (width - newWidth);
					}
					width = newWidth;
					height = newHeight;
				}
			} else if (handle === 'n' || handle === 's') {
				const newHeight = handle === 'n' ? height - deltaY : height + deltaY;
				const newWidth = newHeight * startAspectRatio;

				if (newWidth >= minSize && newHeight >= minSize) {
					if (handle === 'n') {
						y = y + (height - newHeight);
					}
					width = newWidth;
					height = newHeight;
				}
			}
		}
	} else {
		// Original free-form resize logic
		if (handle.includes('w')) {
			const nextX = x + deltaX;
			const nextWidth = width - deltaX;
			if (nextWidth >= minSize) {
				x = nextX;
				width = nextWidth;
			} else {
				x = x + (width - minSize);
				width = minSize;
			}
		}

		if (handle.includes('e')) {
			const nextWidth = width + deltaX;
			width = Math.max(minSize, nextWidth);
		}

		if (handle.includes('n')) {
			const nextY = y + deltaY;
			const nextHeight = height - deltaY;
			if (nextHeight >= minSize) {
				y = nextY;
				height = nextHeight;
			} else {
				y = y + (height - minSize);
				height = minSize;
			}
		}

		if (handle.includes('s')) {
			const nextHeight = height + deltaY;
			height = Math.max(minSize, nextHeight);
		}
	}

	return { x, y, width, height };
};

const buildFrameConstraintSnapshot = (
	doc: Document,
	frameId: string,
	boundsMap: WorldBoundsMap,
): FrameConstraintSnapshot | null => {
	const frame = doc.nodes[frameId];
	if (!frame || frame.type !== 'frame') return null;
	if (!frame.children || frame.children.length === 0) return null;
	if (frame.layout) return null;

	const frameBounds = boundsMap[frameId];
	if (!frameBounds) return null;

	const children: FrameConstraintSnapshot['children'] = {};
	for (const childId of frame.children) {
		const child = doc.nodes[childId];
		const childBounds = boundsMap[childId];
		if (!child || !childBounds) continue;
		children[childId] = {
			bounds: {
				x: childBounds.x - frameBounds.x,
				y: childBounds.y - frameBounds.y,
				width: childBounds.width,
				height: childBounds.height,
			},
			constraints: resolveConstraints(child.constraints),
		};
	}

	if (Object.keys(children).length === 0) return null;

	return {
		frameId,
		frameSize: { width: frameBounds.width, height: frameBounds.height },
		children,
	};
};

const computeFrameConstraintUpdates = (
	snapshot: FrameConstraintSnapshot,
	nextSize: { width: number; height: number },
): Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }> => {
	const updates: Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }> = {};
	for (const [childId, child] of Object.entries(snapshot.children)) {
		const nextBounds = computeConstrainedBounds(child.bounds, child.constraints, snapshot.frameSize, nextSize);
		updates[childId] = {
			position: { x: nextBounds.x, y: nextBounds.y },
			size: { width: nextBounds.width, height: nextBounds.height },
		};
	}
	return updates;
};

const parseClipboardPayload = (text: string | null): ClipboardPayload | null => {
	if (!text) return null;
	if (!text.startsWith(CLIPBOARD_PREFIX)) return null;
	const raw = text.slice(CLIPBOARD_PREFIX.length);
	try {
		const parsed = JSON.parse(raw) as ClipboardPayload;
		if (!parsed || parsed.version !== 1) return null;
		if (!Array.isArray(parsed.rootIds) || typeof parsed.nodes !== 'object') return null;
		return parsed;
	} catch (error) {
		console.warn('Failed to parse clipboard payload', error);
		return null;
	}
};

const mergeSnapTargets = (a: SnapTargets, b: SnapTargets): SnapTargets => ({
	x: [...a.x, ...b.x],
	y: [...a.y, ...b.y],
});

const rectFromPoints = (
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number; width: number; height: number } => {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const width = Math.abs(a.x - b.x);
	const height = Math.abs(a.y - b.y);
	return { x, y, width, height };
};

const rectsIntersect = (
	a: { x: number; y: number; width: number; height: number },
	b: { x: number; y: number; width: number; height: number },
): boolean => {
	return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
};

const getMarqueeSelection = (
	doc: Document,
	boundsMap: WorldBoundsMap,
	rect: { x: number; y: number; width: number; height: number },
): string[] => {
	const ids: string[] = [];
	for (const [id, node] of Object.entries(doc.nodes)) {
		if (id === doc.rootId) continue;
		if (node.visible === false) continue;
		const bounds = boundsMap[id];
		if (!bounds) continue;
		if (rectsIntersect(rect, bounds)) {
			ids.push(id);
		}
	}
	return ids;
};

const getSelectableNodeIds = (doc: Document): string[] => {
	const ids: string[] = [];
	for (const [id, node] of Object.entries(doc.nodes)) {
		if (id === doc.rootId) continue;
		if (node.visible === false) continue;
		if (node.locked === true) continue;
		ids.push(id);
	}
	return ids;
};

const sameSelectionSet = (a: string[], b: string[]): boolean => {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	for (const id of b) {
		if (!set.has(id)) return false;
	}
	return true;
};

const getMimeType = (path: string): string => {
	const ext = path.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'webp':
			return 'image/webp';
		case 'svg':
			return 'image/svg+xml';
		case 'ico':
			return 'image/x-icon';
		case 'icns':
			return 'image/icns';
		case 'heic':
			return 'image/heic';
		case 'heif':
			return 'image/heif';
		default:
			return 'application/octet-stream';
	}
};

const buildDataUrl = (mime: string, dataBase64: string): string => {
	return `data:${mime};base64,${dataBase64}`;
};

const parseDataUrl = (dataUrl: string): { mime: string; dataBase64: string } | null => {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) {
		return null;
	}
	return { mime: match[1], dataBase64: match[2] };
};

const getImageSize = (src: string): Promise<{ width: number; height: number }> => {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		};
		img.onerror = () => {
			reject(new Error('Failed to load image'));
		};
		img.src = src;
	});
};

const resolveImageBytesForNode = async (
	doc: Document,
	node: Node,
): Promise<{ dataBase64: string; mime: string | undefined }> => {
	const image = node.image;
	if (!image) {
		throw new Error('Image data missing');
	}

	if (image.assetId) {
		const asset = doc.assets?.[image.assetId];
		if (asset && asset.type === 'image' && asset.dataBase64) {
			return { dataBase64: asset.dataBase64, mime: asset.mime };
		}
	}

	if (image.src && image.src.startsWith('data:')) {
		const parsed = parseDataUrl(image.src);
		if (parsed) {
			return { dataBase64: parsed.dataBase64, mime: parsed.mime };
		}
	}

	if (image.originalPath) {
		const dataBase64 = await invoke<string>('load_binary', { path: image.originalPath });
		return { dataBase64, mime: image.mime ?? getMimeType(image.originalPath) };
	}

	throw new Error('Image source missing');
};

const joinPath = (base: string, segment: string): string => {
	if (base.endsWith('/') || base.endsWith('\\')) {
		return `${base}${segment}`;
	}
	return `${base}/${segment}`;
};

const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const BUNDLE_ASSET_EXTENSIONS = new Set(['glb', 'png', 'jpg', 'jpeg', 'hdr', 'json', 'svg']);
const SHARED_ASSET_EXTENSIONS = new Set(['glb', 'png', 'hdr']);

const normalizeAssetPath = (input: string): string | null => {
	if (!input) return null;
	if (input.startsWith('/') || /^[a-zA-Z]:/.test(input)) return null;
	const normalized = input.replace(/\\/g, '/');
	const parts = normalized.split('/');
	const output: string[] = [];
	for (const part of parts) {
		if (!part || part === '.') continue;
		if (part === '..') return null;
		output.push(part);
	}
	if (output.length === 0) return null;
	return output.join('/');
};

const getAssetExtension = (path: string): string | null => {
	const last = path.split('/').pop();
	if (!last || !last.includes('.')) return null;
	return last.split('.').pop()?.toLowerCase() ?? null;
};

const getMimeForExtension = (extension: string | null): string => {
	switch (extension) {
		case 'glb':
			return 'model/gltf-binary';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'hdr':
			return 'image/vnd.radiance';
		case 'json':
			return 'application/json';
		case 'svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
};

const getBase64ByteLength = (base64: string): number => {
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return Math.floor((base64.length * 3) / 4) - padding;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
};

const isAllowedAssetPath = (allowlist: string[] | undefined, path: string): boolean => {
	if (!allowlist || allowlist.length === 0) return false;
	return allowlist.some((entry) => normalizeAssetPath(entry) === path);
};

const getPluginBundleBasePath = (plugin: PluginRegistration): string | null => {
	const entryUrl = plugin.entryUrl.split('?')[0];
	try {
		const url = new URL(entryUrl, window.location.origin);
		const pathname = url.pathname;
		const index = pathname.lastIndexOf('/');
		if (index === -1) return null;
		return pathname.slice(0, index + 1);
	} catch {
		return null;
	}
};

const resolveStoredPlugin = (stored: StoredPlugin): PluginRegistration | null => {
	if (!stored.path) return null;
	const entryPath = joinPath(stored.path, stored.manifest.entry);
	return {
		manifest: stored.manifest,
		entryUrl: convertFileSrc(entryPath),
		source: stored.source,
		path: stored.path,
	};
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'icns']);

const isLikelyImageName = (name: string): boolean => {
	const ext = name.split('.').pop()?.toLowerCase();
	return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
};

const readFileAsDataUrl = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
			} else {
				reject(new Error('Unsupported file reader result'));
			}
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsDataURL(file);
	});
};

const extractFilePaths = (clipboardData: DataTransfer): string[] => {
	const uris = clipboardData.getData('text/uri-list');
	const text = clipboardData.getData('text/plain');
	const raw = uris || text;
	if (!raw) return [];

	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const paths: string[] = [];
	for (const line of lines) {
		if (line.startsWith('#')) continue;
		if (!line.startsWith('file://')) continue;
		try {
			const url = new URL(line);
			if (url.protocol !== 'file:') continue;
			const path = decodeURIComponent(url.pathname);
			if (path) paths.push(path);
		} catch {
			continue;
		}
	}
	return paths;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!target || !(target instanceof HTMLElement)) {
		return false;
	}
	const tag = target.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

const hasPermission = (manifest: PluginManifest, permission: PluginPermission): boolean => {
	return manifest.permissions?.includes(permission) ?? false;
};

const isRpcRequest = (value: unknown): value is RpcRequest => {
	if (typeof value !== 'object' || value === null) return false;
	const req = value as RpcRequest;
	return req.rpc === 1 && typeof req.id === 'string' && typeof req.method === 'string';
};

const UNSPLASH_UTM_SOURCE = 'galileo';
const UNSPLASH_UTM_MEDIUM = 'referral';

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const getString = (value: unknown): string | null => {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

const getNumber = (value: unknown): number | null => {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const appendUnsplashUtm = (rawUrl: string): string => {
	try {
		const url = new URL(rawUrl);
		url.searchParams.set('utm_source', UNSPLASH_UTM_SOURCE);
		url.searchParams.set('utm_medium', UNSPLASH_UTM_MEDIUM);
		return url.toString();
	} catch {
		return rawUrl;
	}
};

const normalizeUnsplashPhoto = (payload: unknown): UnsplashSearchResult | null => {
	if (!isRecord(payload)) return null;

	const id = getString(payload.id);
	const width = getNumber(payload.width);
	const height = getNumber(payload.height);
	const color = getString(payload.color) ?? undefined;
	const blurHash = getString(payload.blur_hash) ?? undefined;
	const description = getString(payload.description) ?? undefined;
	const altDescription = getString(payload.alt_description) ?? undefined;
	if (!id || width === null || height === null) return null;

	const urls = isRecord(payload.urls) ? payload.urls : null;
	const links = isRecord(payload.links) ? payload.links : null;
	const user = isRecord(payload.user) ? payload.user : null;
	const userLinks = user && isRecord(user.links) ? user.links : null;
	if (!urls || !links || !user || !userLinks) return null;

	const thumb = getString(urls.thumb);
	const small = getString(urls.small);
	const regular = getString(urls.regular);
	const full = getString(urls.full);
	const raw = getString(urls.raw);
	const html = getString(links.html);
	const downloadLocation = getString(links.download_location);
	const username = getString(user.username);
	const name = getString(user.name);
	const userHtml = getString(userLinks.html);

	if (
		!thumb ||
		!small ||
		!regular ||
		!full ||
		!raw ||
		!html ||
		!downloadLocation ||
		!username ||
		!name ||
		!userHtml
	) {
		return null;
	}

	return {
		id,
		width,
		height,
		color,
		blurHash,
		description,
		altDescription,
		urls: { thumb, small, regular, full, raw },
		links: { html, downloadLocation },
		user: {
			name,
			username,
			links: { html: userHtml },
		},
	};
};

const normalizeUnsplashSearchResponse = (payload: unknown): UnsplashSearchResponse => {
	if (!isRecord(payload)) {
		return { total: 0, totalPages: 0, results: [] };
	}
	const total = getNumber(payload.total) ?? 0;
	const totalPages = getNumber(payload.total_pages) ?? 0;
	const rawResults = Array.isArray(payload.results) ? payload.results : [];
	const results = rawResults.map(normalizeUnsplashPhoto).filter((entry): entry is UnsplashSearchResult => Boolean(entry));
	return {
		total,
		totalPages,
		results,
	};
};

export const App: React.FC = () => {
	const {
		document,
		selectedIds,
		executeCommand,
		undoCommand,
		redoCommand,
		selectNode,
		toggleSelection,
		setSelection,
		canUndo,
		canRedo,
		replaceDocument,
		markSaved,
		markDirty,
		isDirty,
	} = useDocument();

	const [appView, setAppView] = useState<'projects' | 'editor'>('projects');
	const [projects, setProjects] = useState<ProjectMeta[]>(() => loadProjects());
	const [projectsSearch, setProjectsSearch] = useState(() => loadProjectsSearch());
	const [activeProjectId, setActiveProjectId] = useState<string | null>(() => getLastOpenProjectId());
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [missingPaths, setMissingPaths] = useState<Record<string, boolean>>({});

	const [activeTool, setActiveTool] = useState<'select' | 'hand' | 'frame' | 'rectangle' | 'text'>('select');
	const [spaceKeyHeld, setSpaceKeyHeld] = useState(false);
	const [toolBeforeSpace, setToolBeforeSpace] = useState<'select' | 'hand' | 'frame' | 'rectangle' | 'text' | null>(null);
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
	const [containerFocusId, setContainerFocusId] = useState<string | null>(null);
	const [hitCycle, setHitCycle] = useState<{ key: string; index: number } | null>(null);
	const [hoverHandle, setHoverHandle] = useState<ResizeHandle | null>(null);
	const [hoverHit, setHoverHit] = useState<HoverHit | null>(null);
	const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
	const [snapDisabled, setSnapDisabled] = useState(false);
	const [renameRequestId, setRenameRequestId] = useState<string | null>(null);
	const [currentPath, setCurrentPath] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		worldX: number;
		worldY: number;
		target: 'selection' | 'canvas';
	} | null>(null);
	const [plugins, setPlugins] = useState<PluginRegistration[]>(() => {
		const stored = loadStoredPlugins()
			.map(resolveStoredPlugin)
			.filter((plugin): plugin is PluginRegistration => Boolean(plugin));
		return [...builtinPlugins, ...stored];
	});
	const [recentPluginIds, setRecentPluginIds] = useState<string[]>(loadRecentPluginIds());
	const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
	const [activePlugin, setActivePlugin] = useState<PluginRegistration | null>(null);
	const [toastMessage, setToastMessage] = useState<string | null>(null);
	const toastTimerRef = useRef<number | null>(null);
	const [isRemovingBackground, setIsRemovingBackground] = useState(false);
	const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(() => {
		const stored = localStorage.getItem('galileo.ui.leftPanelCollapsed');
		return stored === 'true';
	});
	const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
		const stored = localStorage.getItem('galileo.ui.rightPanelCollapsed');
		return stored === 'true';
	});
	const pluginIframeRef = useRef<HTMLIFrameElement | null>(null);
	const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
	const clipboardRef = useRef<ClipboardPayload | null>(null);
	const clipboardPasteCountRef = useRef(0);
	const effectsClipboardRef = useRef<ShadowEffect[] | null>(null);
	const canvasSize = DEFAULT_CANVAS_SIZE;

	const showToast = useCallback((message: string) => {
		setToastMessage(message);
		if (toastTimerRef.current) {
			window.clearTimeout(toastTimerRef.current);
		}
		toastTimerRef.current = window.setTimeout(() => {
			setToastMessage(null);
		}, 2400);
	}, []);
	const isDev = import.meta.env?.DEV ?? false;

	const updateProjects = useCallback((updater: (prev: ProjectMeta[]) => ProjectMeta[]) => {
		setProjects((prev) => {
			const next = updater(prev);
			saveProjects(next);
			return next;
		});
	}, []);

	const ensureGalileoExtension = useCallback((value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return trimmed;
		const lower = trimmed.toLowerCase();
		if (lower.endsWith('.galileo')) return trimmed;
		if (/\\.[a-z0-9]+$/i.test(trimmed)) {
			return trimmed.replace(/\\.[a-z0-9]+$/i, '.galileo');
		}
		return `${trimmed}.galileo`;
	}, []);

	const buildRenamedPath = useCallback((path: string, nextName: string) => {
		const separator = path.includes('\\\\') ? '\\\\' : '/';
		const parts = path.split(/[/\\\\]/);
		parts.pop();
		const base = parts.join(separator);
		const fileName = ensureGalileoExtension(nextName);
		return base ? `${base}${separator}${fileName}` : fileName;
	}, [ensureGalileoExtension]);

	const registerProjectOpened = useCallback(
		(path: string) => {
			let resolved = createProjectMeta(path);
			updateProjects((prev) => {
				const existing = getProjectByPath(prev, path);
				const nextProject = existing ? { ...existing, lastOpenedAt: Date.now() } : resolved;
				resolved = nextProject;
				return upsertProject(prev, nextProject);
			});
			setActiveProjectId(resolved.id);
			setLastOpenProjectId(resolved.id);
			return resolved;
		},
		[updateProjects],
	);

	const handleProjectsSearchChange = useCallback((value: string) => {
		setProjectsSearch(value);
		saveProjectsSearch(value);
	}, []);

	const displayDocument = previewDocument ?? document;
	const selectedNode = selectedIds.length === 1 ? displayDocument.nodes[selectedIds[0]] : null;
	const view = useMemo(() => ({ pan: panOffset, zoom }), [panOffset, zoom]);
	const baseBoundsMap = useMemo(() => buildWorldBoundsMap(displayDocument), [displayDocument]);
	const boundsOverrides = useMemo(() => {
		if (!transformSession) return undefined;
		const overrides: BoundsOverrideMap = {};
		for (const id of transformSession.activeIds) {
			const bounds = baseBoundsMap[id];
			if (bounds) {
				overrides[id] = { ...bounds };
			}
		}
		return overrides;
	}, [transformSession, baseBoundsMap]);
	const boundsMap = useMemo(
		() => buildWorldBoundsMap(displayDocument, boundsOverrides),
		[displayDocument, boundsOverrides],
	);
	const parentMap = useMemo(() => buildParentMap(displayDocument), [displayDocument]);
	const documentParentMap = useMemo(() => buildParentMap(document), [document]);
	const selectionIds = useMemo(
		() => selectedIds.filter((id) => id !== displayDocument.rootId),
		[selectedIds, displayDocument.rootId],
	);
	const selectionBounds = useMemo(
		() => getSelectionBounds(displayDocument, selectionIds, boundsMap),
		[displayDocument, selectionIds, boundsMap],
	);
	const layoutGuideState = useMemo(() => {
		if (selectionIds.length !== 1) return { lines: [], bounds: null as Bounds | null };
		const node = displayDocument.nodes[selectionIds[0]];
		if (!node || node.type !== 'frame' || !node.layoutGuides) return { lines: [], bounds: null };
		const bounds = boundsMap[node.id];
		if (!bounds) return { lines: [], bounds: null };
		return { lines: computeLayoutGuideLines(node, bounds), bounds };
	}, [selectionIds, displayDocument, boundsMap]);
	const pluginMap = useMemo(() => {
		return new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
	}, [plugins]);
	const recentPlugins = useMemo(() => {
		return recentPluginIds
			.map((id) => pluginMap.get(id))
			.filter((plugin): plugin is PluginRegistration => Boolean(plugin));
	}, [pluginMap, recentPluginIds]);
	const devPlugins = useMemo(() => plugins.filter((plugin) => plugin.source === 'dev'), [plugins]);
	const fileName = useMemo(() => {
		if (!currentPath) return 'Untitled';
		const parts = currentPath.split(/[/\\\\]/);
		return parts[parts.length - 1] || 'Untitled';
	}, [currentPath]);
	const currentProject = useMemo(() => {
		if (activeProjectId) {
			return getProjectById(projects, activeProjectId) || (currentPath ? getProjectByPath(projects, currentPath) : null);
		}
		if (currentPath) return getProjectByPath(projects, currentPath);
		return null;
	}, [activeProjectId, projects, currentPath]);
	const projectName = currentProject?.name ?? (currentPath ? deriveProjectNameFromPath(currentPath) : 'Untitled');
	const projectWorkspace = currentProject?.workspaceName ?? 'Local';
	const projectEnv = currentProject?.env ?? 'local';
	const projectVersion: ProjectVersion = isDirty ? 'draft' : 'live';
	const projectBreadcrumb = `${projectWorkspace} / ${projectName} / ${fileName}`;
	const hoverBounds = useMemo(() => {
		const hoverId = hoverHit?.id;
		if (!hoverId || selectionIds.includes(hoverId)) return null;
		return getNodeWorldBounds(displayDocument, hoverId, boundsMap);
	}, [hoverHit, selectionIds, displayDocument, boundsMap]);
	const marqueeRect = useMemo(() => {
		if (dragState?.mode !== 'marquee') return null;
		const worldRect = rectFromPoints(dragState.startWorld, dragState.currentWorld);
		return {
			x: worldRect.x * view.zoom + view.pan.x,
			y: worldRect.y * view.zoom + view.pan.y,
			width: worldRect.width * view.zoom,
			height: worldRect.height * view.zoom,
		};
	}, [dragState, view]);
	const hitTestAtPoint = useCallback(
		(worldX: number, worldY: number) =>
			hitTestNodeAtPosition(displayDocument, worldX, worldY, zoom, {
				hitSlopPx: HIT_SLOP_PX,
				edgeMinPx: EDGE_MIN_PX,
				boundsMap,
			}),
		[displayDocument, zoom, boundsMap],
	);
	const hitTestStackAtPoint = useCallback(
		(worldX: number, worldY: number) =>
			hitTestNodeStackAtPosition(displayDocument, worldX, worldY, zoom, {
				hitSlopPx: HIT_SLOP_PX,
				edgeMinPx: EDGE_MIN_PX,
				boundsMap,
			}),
		[displayDocument, zoom, boundsMap],
	);
	const findTopmostFrameAtPoint = useCallback(
		(worldX: number, worldY: number) => {
			const root = displayDocument.nodes[displayDocument.rootId];
			if (!root?.children || root.children.length === 0) {
				return null;
			}

			const stack = [...root.children];
			while (stack.length > 0) {
				const nodeId = stack.pop();
				if (!nodeId) continue;
				const node = displayDocument.nodes[nodeId];
				if (!node) continue;

				if (node.children && node.children.length > 0) {
					for (const childId of node.children) {
						stack.push(childId);
					}
				}

				if (node.type !== 'frame' || node.locked === true) {
					continue;
				}
				const bounds = boundsMap[node.id];
				if (!bounds) continue;
				if (worldX >= bounds.x && worldX <= bounds.x + bounds.width && worldY >= bounds.y && worldY <= bounds.y + bounds.height) {
					return node.id;
				}
			}
			return null;
		},
		[displayDocument, boundsMap],
	);
	const getInsertionParentId = useCallback(
		(worldX: number, worldY: number) => {
			if (containerFocusId) {
				return containerFocusId;
			}
			const hits = hitTestStackAtPoint(worldX, worldY);
			for (const hit of hits) {
				const node = hit.node;
				if (node.id === displayDocument.rootId) continue;
				if (node.type === 'frame' && node.locked !== true) {
					return node.id;
				}
			}
			const topmostFrame = findTopmostFrameAtPoint(worldX, worldY);
			if (topmostFrame) {
				return topmostFrame;
			}
			if (selectionIds.length === 1) {
				const selected = displayDocument.nodes[selectionIds[0]];
				if (selected?.type === 'frame' && selected.locked !== true) {
					const bounds = boundsMap[selected.id];
					if (
						bounds &&
						worldX >= bounds.x &&
						worldX <= bounds.x + bounds.width &&
						worldY >= bounds.y &&
						worldY <= bounds.y + bounds.height
					) {
						return selected.id;
					}
				}
			}
			return document.rootId;
		},
		[
			containerFocusId,
			hitTestStackAtPoint,
			displayDocument,
			selectionIds,
			document.rootId,
			boundsMap,
			findTopmostFrameAtPoint,
		],
	);
	const getLocalPointForParent = useCallback(
		(parentId: string, worldX: number, worldY: number) => {
			if (parentId === document.rootId) {
				return { x: worldX, y: worldY };
			}
			const parentBounds = boundsMap[parentId];
			if (!parentBounds) {
				return { x: worldX, y: worldY };
			}
			return { x: worldX - parentBounds.x, y: worldY - parentBounds.y };
		},
		[boundsMap, document.rootId],
	);

	const getLayoutGuideTargetsForParent = useCallback(
		(parentId: string | null): SnapTargets => {
			if (!parentId) return { x: [], y: [] };
			const parent = document.nodes[parentId];
			if (!parent || parent.type !== 'frame' || !parent.layoutGuides) {
				return { x: [], y: [] };
			}
			const parentBounds = boundsMap[parentId];
			if (!parentBounds) return { x: [], y: [] };
			return buildLayoutGuideTargets(parent, parentBounds);
		},
		[document.nodes, boundsMap],
	);
	const getEdgeCursorForNode = useCallback(
		(nodeId: string, worldX: number, worldY: number): string => {
			const node = displayDocument.nodes[nodeId];
			const bounds = boundsMap[nodeId];
			if (!node || !bounds) {
				return 'default';
			}
			const { width, height } = bounds;
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
				return 'default';
			}

			const zoomSafe = zoom > 0 ? zoom : 1;
			const strokeWidth = Number.isFinite(node.stroke?.width) ? node.stroke!.width : 0;
			const edgeWorld = Math.max(strokeWidth / 2, EDGE_MIN_PX / zoomSafe) + HIT_SLOP_PX / zoomSafe;
			const left = bounds.x;
			const right = bounds.x + width;
			const top = bounds.y;
			const bottom = bounds.y + height;

			const nearLeft = Math.abs(worldX - left) <= edgeWorld;
			const nearRight = Math.abs(worldX - right) <= edgeWorld;
			const nearTop = Math.abs(worldY - top) <= edgeWorld;
			const nearBottom = Math.abs(worldY - bottom) <= edgeWorld;

			if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
				if ((nearLeft && nearTop) || (nearRight && nearBottom)) {
					return 'nwse-resize';
				}
				return 'nesw-resize';
			}
			if (nearLeft || nearRight) {
				return 'ew-resize';
			}
			if (nearTop || nearBottom) {
				return 'ns-resize';
			}
			return 'default';
		},
		[displayDocument, boundsMap, zoom],
	);
	// Determine if we're in pan mode (either hand tool or space key held)
	const isInPanMode = activeTool === 'hand' || spaceKeyHeld;

	const cursor = useMemo(() => {
		// Priority order (highest to lowest):
		// 1. Active drag/resize/pan states
		// 2. Hand tool or space key held → grab/grabbing
		// 3. Hover on resize handles
		// 4. Locked node → not-allowed
		// 5. Edge hit → directional resize or move
		// 6. Fill hit → pointer (Figma-style)
		// 7. Tool cursors (crosshair for draw tools)
		// 8. Default (inherit custom CSS cursor)
		if (dragState?.mode === 'resize') return getHandleCursor(dragState.handle);
		if (dragState?.mode === 'pan') return 'grabbing';
		if (dragState?.mode === 'move') return 'move';
		if (isInPanMode) return 'grab';
		if (transformSession) return getHandleCursor(transformSession.handle);
		if (hoverHandle) return getHandleCursor(hoverHandle);
		if (hoverHit?.locked) return 'not-allowed';
		if (hoverHit?.kind === 'edge') return hoverHit.edgeCursor || 'move';
		if (hoverHit?.kind === 'fill') return 'default';
		if (activeTool === 'frame' || activeTool === 'rectangle' || activeTool === 'text') return 'crosshair';
		return undefined; // Let CSS custom cursor apply
	}, [dragState, transformSession, hoverHandle, hoverHit, activeTool, isInPanMode]);

	useEffect(() => {
		if (recentPluginIds.length === 0 && builtinPlugins.length > 0) {
			const seeded = [builtinPlugins[0].manifest.id];
			localStorage.setItem('galileo.plugins.recents.v1', JSON.stringify(seeded));
			setRecentPluginIds(seeded);
		}
	}, [recentPluginIds.length]);

	useEffect(() => {
		let cancelled = false;
		if (projects.length === 0) {
			setMissingPaths({});
			return;
		}

		const checkPaths = async () => {
			const entries = await Promise.all(
				projects.map(async (project) => {
					try {
						const exists = await invoke<boolean>('path_exists', { path: project.path });
						return [project.path, !exists] as const;
					} catch {
						return [project.path, false] as const;
					}
				}),
			);
			if (!cancelled) {
				setMissingPaths(Object.fromEntries(entries));
			}
		};

		void checkPaths();
		return () => {
			cancelled = true;
		};
	}, [projects]);

	const insertImageNode = useCallback(
		async ({
			src,
			dataBase64,
			mime,
			width,
			height,
			name,
			originalPath,
			meta,
			index = 0,
			position,
			maxDimension = 800,
		}: {
			src?: string;
			dataBase64?: string;
			mime?: string;
			width?: number;
			height?: number;
			name?: string;
			originalPath?: string;
			meta?: ImageMeta;
			index?: number;
			position?: { x: number; y: number };
			maxDimension?: number;
		}): Promise<string> => {
			let resolvedMime = mime;
			let resolvedBase64 = dataBase64;
			let resolvedSrc = src;

			if (!resolvedBase64 && resolvedSrc && resolvedSrc.startsWith('data:')) {
				const parsed = parseDataUrl(resolvedSrc);
				if (parsed) {
					resolvedMime = resolvedMime || parsed.mime;
					resolvedBase64 = parsed.dataBase64;
				}
			}

			if (!resolvedSrc && resolvedBase64 && resolvedMime) {
				resolvedSrc = buildDataUrl(resolvedMime, resolvedBase64);
			}

			if (!resolvedSrc) {
				throw new Error('Image source missing');
			}

			let naturalSize = width && height ? { width, height } : null;
			if (!naturalSize) {
				naturalSize = await getImageSize(resolvedSrc);
			}

			const scale = Math.min(1, maxDimension / Math.max(naturalSize.width, naturalSize.height));
			const scaledSize = {
				width: Math.max(1, Math.round(naturalSize.width * scale)),
				height: Math.max(1, Math.round(naturalSize.height * scale)),
			};

			const centerWorld = {
				x: (canvasSize.width / 2 - view.pan.x) / Math.max(view.zoom, 0.0001),
				y: (canvasSize.height / 2 - view.pan.y) / Math.max(view.zoom, 0.0001),
			};

			const offset = index * 24;
			const resolvedPosition = position ?? {
				x: centerWorld.x - scaledSize.width / 2 + offset,
				y: centerWorld.y - scaledSize.height / 2 + offset,
			};

			const newId = generateId();
			const assetId = resolvedBase64 && resolvedMime ? generateId() : null;
			const commands: Command[] = [];

			if (assetId && resolvedBase64 && resolvedMime) {
				commands.push({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Create image asset',
					type: 'createAsset',
					payload: {
						id: assetId,
						asset: {
							type: 'image',
							mime: resolvedMime,
							dataBase64: resolvedBase64,
							width: naturalSize.width,
							height: naturalSize.height,
						},
					},
				} as Command);
			}

			const imageProps = assetId
				? {
						mime: resolvedMime,
						originalPath,
						assetId,
						meta,
					}
				: {
						src: resolvedSrc,
						mime: resolvedMime,
						originalPath,
						meta,
					};

			commands.push({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Insert image',
				type: 'createNode',
				payload: {
					id: newId,
					parentId: document.rootId,
					node: {
						type: 'image',
						name: name || 'Image',
						position: resolvedPosition,
						size: scaledSize,
						image: imageProps,
						visible: true,
						aspectRatioLocked: true,
					},
				},
			} as Command);

			const command: Command =
				commands.length > 1
					? {
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Insert image asset',
							type: 'batch',
							payload: { commands },
						}
					: commands[0];

			executeCommand(command);
			selectNode(newId);
			return newId;
		},
		[
			canvasSize.height,
			canvasSize.width,
			document.rootId,
			executeCommand,
			selectNode,
			view.pan.x,
			view.pan.y,
			view.zoom,
		],
	);

	const clearBackgroundRemoval = useCallback(
		(nodeId: string) => {
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'image') {
				return;
			}
			const image = node.image;
			if (!image?.maskAssetId) {
				return;
			}
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Clear background removal',
				type: 'setProps',
				payload: {
					id: nodeId,
					props: {
						image: {
							...image,
							maskAssetId: undefined,
							bgRemoveMeta: undefined,
						},
					},
				},
			});
		},
		[document.nodes, executeCommand],
	);

	const removeBackgroundForImage = useCallback(
		async (nodeId: string) => {
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'image') {
				return;
			}
			if (isRemovingBackground) {
				return;
			}
			flushSync(() => {
				setIsRemovingBackground(true);
			});
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => {
					setTimeout(resolve, 0);
				}),
			);
			try {
				const { dataBase64 } = await resolveImageBytesForNode(document, node);
				const result = await invoke<RemoveBackgroundResult>('remove_background', {
					args: { imageBase64: dataBase64 },
				});

				const maskAssetId = generateId();
				const now = Date.now();
				const commands: Command[] = [
					{
						id: generateId(),
						timestamp: now,
						source: 'user',
						description: 'Create background mask asset',
						type: 'createAsset',
						payload: {
							id: maskAssetId,
							asset: {
								type: 'image',
								mime: 'image/png',
								dataBase64: result.maskPngBase64,
								width: result.width,
								height: result.height,
							},
						},
					},
					{
						id: generateId(),
						timestamp: now,
						source: 'user',
						description: 'Apply background removal',
						type: 'setProps',
						payload: {
							id: nodeId,
							props: {
								image: {
									...(node.image || {}),
									maskAssetId,
									bgRemoveMeta: {
										provider: 'apple-vision',
										model: 'foreground-instance-mask',
										revision: result.revision,
										createdAt: now,
									},
								},
							},
						},
					},
				];

				executeCommand({
					id: generateId(),
					timestamp: now,
					source: 'user',
					description: 'Remove background',
					type: 'batch',
					payload: { commands },
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message.includes('unsupported_platform')) {
					showToast('Background removal requires the macOS app (14+).');
				} else if (message.includes('no_subject_detected')) {
					showToast('No subject detected in this image.');
				} else {
					showToast('Background removal failed. Try re-importing the image.');
				}
				console.error('Background removal error:', error);
			} finally {
				setIsRemovingBackground(false);
			}
		},
		[document, executeCommand, isRemovingBackground, showToast],
	);

	const getDefaultInsertPosition = useCallback(() => {
		const primaryId = selectionIds[0];
		if (primaryId) {
			const bounds = getNodeWorldBounds(displayDocument, primaryId, boundsMap);
			if (bounds) {
				return {
					x: bounds.x + bounds.width + 24,
					y: bounds.y,
				};
			}
		}

		return {
			x: 40,
			y: 40,
		};
	}, [displayDocument, boundsMap, selectionIds]);

	const copySelectionToClipboard = useCallback(() => {
		if (selectionIds.length === 0) return;

		const isDescendantOf = (nodeId: string, potentialAncestorId: string): boolean => {
			let current = documentParentMap[nodeId];
			while (current) {
				if (current === potentialAncestorId) return true;
				current = documentParentMap[current] || null;
			}
			return false;
		};

		const topLevelIds = selectionIds.filter((id) => {
			return !selectionIds.some((otherId) => otherId !== id && isDescendantOf(id, otherId));
		});
		if (topLevelIds.length === 0) return;

		const parentIds = new Set(topLevelIds.map((id) => documentParentMap[id] ?? null));
		const parentId = parentIds.size === 1 ? Array.from(parentIds)[0] : null;

		const docBoundsMap = buildWorldBoundsMap(document);
		const bounds = getSelectionBounds(document, topLevelIds, docBoundsMap);
		if (!bounds) return;

		const nodes: Record<string, Node> = {};
		const rootWorldPositions: ClipboardPayload['rootWorldPositions'] = {};

		const collect = (nodeId: string) => {
			const node = document.nodes[nodeId];
			if (!node) return;
			nodes[nodeId] = node;
			if (node.children) {
				for (const childId of node.children) {
					collect(childId);
				}
			}
		};

		for (const id of topLevelIds) {
			const rootBounds = docBoundsMap[id];
			if (rootBounds) {
				rootWorldPositions[id] = { x: rootBounds.x, y: rootBounds.y };
			}
			collect(id);
		}

		const payload: ClipboardPayload = {
			version: 1,
			rootIds: topLevelIds,
			nodes,
			bounds,
			rootWorldPositions,
			parentId,
		};

		clipboardRef.current = payload;
		clipboardPasteCountRef.current = 0;

		const textPayload = `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`;
		if (navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(textPayload).catch(() => {
				// Ignore clipboard permission errors; internal clipboard still works.
			});
		}
	}, [selectionIds, documentParentMap, document]);

	const pasteClipboardPayload = useCallback(
		(payload: ClipboardPayload) => {
			if (!payload.rootIds.length) return;

			const targetParentId =
				payload.parentId && document.nodes[payload.parentId] ? payload.parentId : document.rootId;
			const docBoundsMap = buildWorldBoundsMap(document);
			const parentBounds = docBoundsMap[targetParentId];
			const parentWorld = {
				x: parentBounds?.x ?? 0,
				y: parentBounds?.y ?? 0,
			};

			const pasteOffset = (clipboardPasteCountRef.current + 1) * 24;
			const anchor = getDefaultInsertPosition();
			const deltaWorld =
				payload.parentId && payload.parentId === targetParentId
					? { x: pasteOffset, y: pasteOffset }
					: {
							x: anchor.x - payload.bounds.x + pasteOffset,
							y: anchor.y - payload.bounds.y + pasteOffset,
						};

			const idMap = new Map<string, string>();
			const commands: Command[] = [];
			const newRootIds: string[] = [];
			const parent = document.nodes[targetParentId];
			const baseIndex = parent?.children?.length ?? 0;

			const ensureId = (oldId: string) => {
				const existing = idMap.get(oldId);
				if (existing) return existing;
				const nextId = generateId();
				idMap.set(oldId, nextId);
				return nextId;
			};

				const cloneNode = (oldId: string, parentId: string, isRoot: boolean, index?: number) => {
					const node = payload.nodes[oldId];
					if (!node) return;
					const newId = ensureId(oldId);
					const { children } = node;
					const rest = Object.fromEntries(
						Object.entries(node).filter(([key]) => key !== 'id' && key !== 'children'),
					) as Omit<Node, 'id' | 'children'>;
					const baseWorld = payload.rootWorldPositions[oldId] || { x: node.position.x, y: node.position.y };
				const position = isRoot
					? {
							x: baseWorld.x + deltaWorld.x - parentWorld.x,
							y: baseWorld.y + deltaWorld.y - parentWorld.y,
						}
					: { ...node.position };
				commands.push({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Paste node',
					type: 'createNode',
					payload: {
						id: newId,
						parentId,
						index,
						node: {
							...(rest as Omit<Node, 'id' | 'children'>),
							position,
							size: { ...node.size },
						},
					},
				} as Command);
				if (isRoot) {
					newRootIds.push(newId);
				}
				if (children && children.length > 0) {
					for (const childId of children) {
						cloneNode(childId, newId, false);
					}
				}
			};

			payload.rootIds.forEach((rootId, index) => cloneNode(rootId, targetParentId, true, baseIndex + index));

			if (commands.length === 0) return;
			if (commands.length === 1) {
				executeCommand(commands[0]);
			} else {
				executeCommand({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Paste nodes',
					type: 'batch',
					payload: { commands },
				} as Command);
			}
			if (newRootIds.length > 0) {
				setSelection(newRootIds);
			}
			clipboardPasteCountRef.current += 1;
		},
		[document, executeCommand, getDefaultInsertPosition, setSelection],
	);

	const runPlugin = useCallback((plugin: PluginRegistration) => {
		setActivePlugin(plugin);
		setRecentPluginIds(recordRecentPlugin(plugin));
	}, []);

	const handleOpenPlugin = useCallback(
		(pluginId: string) => {
			const plugin = pluginMap.get(pluginId);
			if (plugin) {
				runPlugin(plugin);
			}
		},
		[pluginMap, runPlugin],
	);

	const handleLoadDevPlugin = useCallback(async () => {
		try {
			const folder = await invoke<string>('show_open_folder');
			if (!folder) {
				return;
			}

			const manifestPath = joinPath(folder, 'plugin.json');
			const raw = await invoke<string>('load_text', { path: manifestPath });
			const manifest = JSON.parse(raw) as PluginManifest;
			if (!manifest?.id || !manifest.entry || !manifest.name) {
				alert('Invalid plugin manifest.');
				return;
			}

			const entryPath = joinPath(folder, manifest.entry);
			const entryUrl = convertFileSrc(entryPath);
			const plugin: PluginRegistration = {
				manifest,
				entryUrl,
				source: 'dev',
				path: folder,
			};

			setPlugins((prev) => {
				const filtered = prev.filter((p) => p.manifest.id !== manifest.id);
				return [...filtered, plugin];
			});

			const stored = loadStoredPlugins().filter((p) => p.manifest.id !== manifest.id);
			stored.push({ manifest, source: 'dev', path: folder });
			saveStoredPlugins(stored);
		} catch (error) {
			console.error('Failed to load dev plugin', error);
			alert('Failed to load dev plugin.');
		}
	}, []);

	const handleRemovePlugin = useCallback((plugin: PluginRegistration) => {
		setPlugins((prev) => prev.filter((p) => p.manifest.id !== plugin.manifest.id));
		const stored = loadStoredPlugins().filter((p) => p.manifest.id !== plugin.manifest.id);
		saveStoredPlugins(stored);
		setActivePlugin((prev) => (prev?.manifest.id === plugin.manifest.id ? null : prev));
		setRecentPluginIds((prev) => {
			const next = prev.filter((id) => id !== plugin.manifest.id);
			localStorage.setItem('galileo.plugins.recents.v1', JSON.stringify(next));
			return next;
		});
	}, []);

	const applyPropsToSelection = useCallback(
		(ids: string[], props: Record<string, unknown>, description: string) => {
			if (ids.length === 0) {
				return;
			}
			const commands = ids.map((id) => ({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user' as const,
				description,
				type: 'setProps' as const,
				payload: {
					id,
					props,
				},
			}));

			executeCommand(
				commands.length === 1
					? (commands[0] as Command)
					: ({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description,
							type: 'batch',
							payload: { commands: commands as Command[] },
						} as Command),
			);
		},
		[executeCommand],
	);

	const copyEffects = useCallback(
		(preferredNodeId?: string) => {
			const candidates = preferredNodeId ? [preferredNodeId] : selectionIds;
			const source = candidates
				.map((id) => document.nodes[id])
				.find((node): node is Node => Boolean(node && node.effects && node.effects.length > 0));
			const cloned = cloneShadowEffects(source?.effects);
			if (!cloned) {
				showToast('No effects to copy.');
				return;
			}
			effectsClipboardRef.current = cloned;
			showToast('Effects copied.');
		},
		[document.nodes, selectionIds, showToast],
	);

	const pasteEffects = useCallback(
		(preferredTargetIds?: string[]) => {
			const effects = cloneShadowEffects(effectsClipboardRef.current ?? undefined);
			if (!effects) {
				showToast('No copied effects to paste.');
				return;
			}
			const targetIds = preferredTargetIds && preferredTargetIds.length > 0 ? preferredTargetIds : selectionIds;
			if (targetIds.length === 0) {
				showToast('Select at least one layer to paste effects.');
				return;
			}
			applyPropsToSelection(targetIds, { effects }, 'Paste effects');
			showToast(`Pasted effects to ${targetIds.length} layer${targetIds.length === 1 ? '' : 's'}.`);
		},
		[applyPropsToSelection, selectionIds, showToast],
	);

	const deleteNodes = useCallback(
		(ids: string[]) => {
			const deletable = ids.filter((id) => id !== document.rootId);
			if (deletable.length === 0) {
				return;
			}
			const commands = deletable.map((id) => ({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user' as const,
				description: 'Delete node',
				type: 'deleteNode' as const,
				payload: { id },
			}));

			if (commands.length === 1) {
				executeCommand(commands[0] as Command);
			} else {
				executeCommand({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Delete nodes',
					type: 'batch',
					payload: { commands: commands as Command[] },
				} as Command);
			}
		},
		[document.rootId, executeCommand],
	);

	const duplicateNodes = useCallback(
		(ids: string[]) => {
			const sourceIds = ids.filter((id) => id !== document.rootId);
			if (sourceIds.length === 0) {
				return;
			}
			const workingChildren = new Map<string, string[]>();
			const commands: Command[] = [];
			const newIds: string[] = [];

				const cloneSubtree = (nodeId: string, parentId: string, index?: number, applyOffset = false): string | null => {
					const node = document.nodes[nodeId];
					if (!node) return null;
					const { children } = node;
					const rest = Object.fromEntries(
						Object.entries(node).filter(([key]) => key !== 'id' && key !== 'children'),
					) as Omit<Node, 'id' | 'children'>;
					const nextId = generateId();
				const position = { ...node.position };
				if (applyOffset) {
					position.x += 10;
					position.y += 10;
				}
				commands.push({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Duplicate node',
					type: 'createNode',
					payload: {
						id: nextId,
						parentId,
						index,
						node: {
							...(rest as Omit<Node, 'id' | 'children'>),
							position,
							size: { ...node.size },
						},
					},
				} as Command);

				if (children && children.length > 0) {
					for (const childId of children) {
						cloneSubtree(childId, nextId, undefined, false);
					}
				}

				return nextId;
			};

			for (const id of sourceIds) {
				const parentId = documentParentMap[id] ?? document.rootId;
				const parent = document.nodes[parentId];
				if (!parent?.children) continue;
				const siblings = workingChildren.get(parentId) ?? [...parent.children];
				if (!workingChildren.has(parentId)) {
					workingChildren.set(parentId, siblings);
				}
				const fromIndex = siblings.indexOf(id);
				const insertIndex = fromIndex === -1 ? siblings.length : fromIndex + 1;
				const newId = cloneSubtree(id, parentId, insertIndex, true);
				if (newId) {
					siblings.splice(insertIndex, 0, newId);
					newIds.push(newId);
				}
			}

			if (commands.length === 0) return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Duplicate nodes',
				type: 'batch',
				payload: { commands },
			} as Command);
			if (newIds.length > 0) {
				setSelection(newIds);
			}
		},
		[document.nodes, document.rootId, documentParentMap, executeCommand, setSelection],
	);

	const reorderZ = useCallback(
		(id: string, dir: 'front' | 'back' | 'forward' | 'backward') => {
			const parentId = documentParentMap[id];
			if (!parentId) return;
			const parent = document.nodes[parentId];
			if (!parent?.children) return;
			const fromIndex = parent.children.indexOf(id);
			if (fromIndex === -1) return;
			const maxIndex = parent.children.length - 1;
			let toIndex = fromIndex;
			if (dir === 'front') toIndex = maxIndex;
			if (dir === 'back') toIndex = 0;
			if (dir === 'forward') toIndex = Math.min(maxIndex, fromIndex + 1);
			if (dir === 'backward') toIndex = Math.max(0, fromIndex - 1);
			if (toIndex === fromIndex) return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Reorder layer',
				type: 'reorderChild',
				payload: { parentId, fromIndex, toIndex },
			});
		},
		[document.nodes, documentParentMap, executeCommand],
	);

	const groupNodes = useCallback(
		(ids: string[]) => {
			console.log('groupNodes called with:', ids);
			console.log('document.rootId:', document.rootId);
			console.log('documentParentMap:', documentParentMap);

			// Filter out root node and ensure we have at least 2 nodes to group
			const validIds = ids.filter((id) => id !== document.rootId && document.nodes[id]);
			console.log('validIds:', validIds);

			if (validIds.length < 2) {
				console.log('Not enough valid IDs, returning');
				return;
			}

			// All nodes must share the same parent
			const parentIds = validIds.map((id) => documentParentMap[id]).filter((pid): pid is string => Boolean(pid));
			console.log('parentIds:', parentIds);

			const uniqueParents = new Set(parentIds);
			console.log('uniqueParents:', uniqueParents);

			if (uniqueParents.size !== 1) {
				console.log('Nodes dont have same parent, returning');
				// Can't group nodes from different parents
				return;
			}

			const parentId = Array.from(uniqueParents)[0];
			console.log('parentId:', parentId);

			if (!parentId) {
				console.log('No parentId, returning');
				return;
			}

			const parent = document.nodes[parentId];
			console.log('parent node:', parent);

			if (!parent?.children) {
				console.log('Parent has no children, returning');
				return;
			}

			// Sort by their order in parent (to preserve z-order)
			const sortedIds = validIds.slice().sort((a, b) => {
				const indexA = parent.children!.indexOf(a);
				const indexB = parent.children!.indexOf(b);
				return indexA - indexB;
			});

			// Insert group at the position of the first (bottommost) node
			const insertIndex = parent.children.indexOf(sortedIds[0]);
			console.log('Executing group command with:', { sortedIds, parentId, insertIndex });

			const groupId = generateId();
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Group nodes',
				type: 'groupNodes',
				payload: {
					groupId,
					nodeIds: sortedIds,
					parentId,
					insertIndex,
				},
			} as Command);

			// Select the new group
			setSelection([groupId]);
			console.log('Group command executed, new groupId:', groupId);
		},
		[document.nodes, document.rootId, documentParentMap, executeCommand, setSelection],
	);

	const ungroupNodes = useCallback(
		(ids: string[]) => {
			// Find all groups in selection
			const groupIds = ids.filter((id) => {
				const node = document.nodes[id];
				return node && node.type === 'group';
			});

			if (groupIds.length === 0) {
				return;
			}

			// Collect all children that will be "released" from groups
			const releasedChildIds: string[] = [];

			const commands: Command[] = groupIds.map((groupId) => {
				const group = document.nodes[groupId];
				if (group?.children) {
					releasedChildIds.push(...group.children);
				}
				return {
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Ungroup nodes',
					type: 'ungroupNodes',
					payload: { groupId },
				} as Command;
			});

			if (commands.length === 1) {
				executeCommand(commands[0]);
			} else {
				executeCommand({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Ungroup multiple groups',
					type: 'batch',
					payload: { commands },
				} as Command);
			}

			// Select the released children
			if (releasedChildIds.length > 0) {
				setSelection(releasedChildIds);
			}
		},
		[document.nodes, executeCommand, setSelection],
	);

	const dispatchEditorAction = useCallback(
		(action: EditorAction, targetIds: string[] = selectionIds) => {
			console.log('dispatchEditorAction called:', action.type, 'targetIds:', targetIds);
			if (action.type === 'duplicate') {
				duplicateNodes(targetIds);
				return;
			}
			if (action.type === 'delete') {
				deleteNodes(targetIds);
				setSelection([]);
				return;
			}
			if (action.type === 'rename') {
				if (targetIds.length === 1) {
					setRenameRequestId(targetIds[0]);
				}
				return;
			}
			if (action.type === 'toggleLock') {
				const anyUnlocked = targetIds.some((id) => document.nodes[id]?.locked !== true);
				applyPropsToSelection(targetIds, { locked: anyUnlocked }, anyUnlocked ? 'Lock node' : 'Unlock node');
				return;
			}
			if (action.type === 'toggleVisible') {
				const anyVisible = targetIds.some((id) => document.nodes[id]?.visible !== false);
				applyPropsToSelection(targetIds, { visible: !anyVisible }, anyVisible ? 'Hide node' : 'Show node');
				return;
			}
			if (action.type === 'reorderZ') {
				const targetId = targetIds[0];
				if (targetId) {
					reorderZ(targetId, action.dir);
				}
				return;
			}
			if (action.type === 'group') {
				console.log('Group action received, calling groupNodes with:', targetIds);
				groupNodes(targetIds);
				return;
			}
			if (action.type === 'ungroup') {
				ungroupNodes(targetIds);
				return;
			}
		},
		[
			applyPropsToSelection,
			deleteNodes,
			document.nodes,
			duplicateNodes,
			groupNodes,
			ungroupNodes,
			reorderZ,
			selectionIds,
			setSelection,
		],
	);

	const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
		const recentItems: ContextMenuItem[] =
			recentPlugins.length > 0
				? recentPlugins.map((plugin) => ({
						label: plugin.manifest.name,
						onSelect: () => runPlugin(plugin),
					}))
				: [{ label: 'No recent plugins', enabled: false }];

		const allPluginItems: ContextMenuItem[] =
			plugins.length > 0
				? plugins.map((plugin) => ({
						label: plugin.manifest.name,
						onSelect: () => runPlugin(plugin),
					}))
				: [{ label: 'No plugins installed', enabled: false }];

		const devItems: ContextMenuItem[] = [
			{ label: 'Load Dev Plugin...', onSelect: handleLoadDevPlugin },
			...(devPlugins.length > 0 ? [{ separator: true } as ContextMenuItem] : []),
			...devPlugins.map((plugin) => ({
				label: plugin.manifest.name,
				onSelect: () => runPlugin(plugin),
			})),
		];

		const hasSelection = selectionIds.length > 0;
		const canRename = selectionIds.length === 1;
		const primaryId = selectionIds[0];
		const primaryNode = primaryId ? document.nodes[primaryId] : null;
		const isSingleImage = selectionIds.length === 1 && primaryNode?.type === 'image';
		const hasBgMask = Boolean(primaryNode?.image?.maskAssetId);
		const anyVisible = selectionIds.some((id) => document.nodes[id]?.visible !== false);
		const anyUnlocked = selectionIds.some((id) => document.nodes[id]?.locked !== true);
		const lockLabel = anyUnlocked ? 'Lock' : 'Unlock';
		const visibleLabel = anyVisible ? 'Hide' : 'Show';
		let canMoveForward = false;
		let canMoveBackward = false;
		if (primaryId) {
			const parentId = documentParentMap[primaryId];
			const parent = parentId ? document.nodes[parentId] : null;
			if (parent?.children) {
				const index = parent.children.indexOf(primaryId);
				canMoveBackward = index > 0;
				canMoveForward = index >= 0 && index < parent.children.length - 1;
			}
		}

		// Check if selection can be grouped (2+ items with same parent)
		const canGroup =
			selectionIds.length >= 2 &&
			(() => {
				const parentIds = new Set(selectionIds.map((id) => documentParentMap[id]));
				return parentIds.size === 1;
			})();

		// Check if selection contains any groups that can be ungrouped
		const canUngroup = selectionIds.some((id) => document.nodes[id]?.type === 'group');

		const selectionItems: ContextMenuItem[] = [
			{
				icon: 'D',
				label: 'Duplicate',
				shortcut: 'Cmd/Ctrl+D',
				enabled: hasSelection,
				onSelect: () => dispatchEditorAction({ type: 'duplicate' }),
			},
			{
				icon: 'X',
				label: 'Delete',
				shortcut: 'Backspace',
				enabled: hasSelection,
				onSelect: () => dispatchEditorAction({ type: 'delete' }),
			},
			{
				icon: 'R',
				label: 'Rename',
				shortcut: 'Enter',
				enabled: canRename,
				onSelect: () => dispatchEditorAction({ type: 'rename' }),
			},
			...(isSingleImage
				? [
						{
							icon: 'B',
							label: hasBgMask ? 'Re-run background removal' : 'Remove background',
							enabled: !isRemovingBackground,
							onSelect: () => primaryId && removeBackgroundForImage(primaryId),
						},
						...(hasBgMask
							? [
									{
										icon: 'C',
										label: 'Clear background removal',
										enabled: !isRemovingBackground,
										onSelect: () => primaryId && clearBackgroundRemoval(primaryId),
									},
								]
							: []),
						{ separator: true } as ContextMenuItem,
					]
				: []),
			{ separator: true },
			{
				icon: 'G',
				label: 'Group',
				shortcut: 'Cmd/Ctrl+G',
				enabled: canGroup,
				onSelect: () => dispatchEditorAction({ type: 'group' }),
			},
			{
				icon: 'U',
				label: 'Ungroup',
				shortcut: 'Cmd/Ctrl+Shift+G',
				enabled: canUngroup,
				onSelect: () => dispatchEditorAction({ type: 'ungroup' }),
			},
			{ separator: true },
			{
				icon: 'L',
				label: lockLabel,
				enabled: hasSelection,
				onSelect: () => dispatchEditorAction({ type: 'toggleLock' }),
			},
			{
				icon: 'V',
				label: visibleLabel,
				enabled: hasSelection,
				onSelect: () => dispatchEditorAction({ type: 'toggleVisible' }),
			},
			{
				icon: '>',
				label: 'Bring forward',
				shortcut: 'Cmd/Ctrl+]',
				enabled: hasSelection && canMoveForward,
				onSelect: () => dispatchEditorAction({ type: 'reorderZ', dir: 'forward' }),
			},
			{
				icon: '<',
				label: 'Send backward',
				shortcut: 'Cmd/Ctrl+[',
				enabled: hasSelection && canMoveBackward,
				onSelect: () => dispatchEditorAction({ type: 'reorderZ', dir: 'backward' }),
			},
		];

		const canvasItems: ContextMenuItem[] = [
			{ icon: 'P', label: 'Paste', enabled: false },
			{ icon: 'A', label: 'Select all', enabled: false },
		];

		const pluginMenu: ContextMenuItem = {
			label: 'Plugins',
			submenu: [
				{ label: 'Recents', submenu: recentItems },
				{ label: 'All plugins', submenu: allPluginItems },
				...(isDev ? [{ label: 'Development', submenu: devItems }] : []),
				{ separator: true },
				{ label: 'Manage plugins...', onSelect: () => setPluginManagerOpen(true) },
			],
		};

		if (contextMenu?.target === 'canvas') {
			return [...canvasItems, { separator: true }, pluginMenu];
		}

		return [...selectionItems, { separator: true }, pluginMenu];
	}, [
		contextMenu?.target,
		clearBackgroundRemoval,
		devPlugins,
		dispatchEditorAction,
		document.nodes,
		documentParentMap,
		handleLoadDevPlugin,
		isDev,
		isRemovingBackground,
		recentPlugins,
		plugins,
		removeBackgroundForImage,
		runPlugin,
		selectionIds,
	]);

	const handlePluginRpcRequest = useCallback(
		async (request: RpcRequest, plugin: PluginRegistration): Promise<RpcResponse> => {
			const fail = (code: string, message: string): RpcResponse => ({
				rpc: 1,
				id: request.id,
				ok: false,
				error: { code, message },
			});

			try {
				switch (request.method) {
					case 'host.getInfo': {
						return {
							rpc: 1,
							id: request.id,
							ok: true,
							result: {
								apiVersion: '1.0',
								appVersion: '0.1.0',
							},
						};
					}

					case 'host.toast': {
						const params = (request.params || {}) as { message?: string };
						if (!params.message) {
							return fail('invalid_params', 'message is required');
						}
						setToastMessage(params.message);
						if (toastTimerRef.current) {
							window.clearTimeout(toastTimerRef.current);
						}
						toastTimerRef.current = window.setTimeout(() => {
							setToastMessage(null);
							toastTimerRef.current = null;
						}, 2400);
						return { rpc: 1, id: request.id, ok: true, result: { shown: true } };
					}

					case 'selection.get': {
						if (!hasPermission(plugin.manifest, 'selection:read')) {
							return fail('permission_denied', 'selection:read is required');
						}
						const ids = selectionIds;
						const nodes = ids
							.map((id) => document.nodes[id])
							.filter(Boolean)
							.map((node) => ({
								id: node.id,
								type: node.type,
								name: node.name,
								size: { width: node.size.width, height: node.size.height },
								// Include device preset metadata for mockup integration
								devicePresetId: node.devicePresetId,
								isFrame: node.type === 'frame',
								imageMeta: node.type === 'image' ? node.image?.meta : undefined,
							}));

						const result: SelectionGetResult = {
							ids,
							primaryId: ids.length > 0 ? ids[0] : null,
							nodes,
						};
						return { rpc: 1, id: request.id, ok: true, result };
					}

					case 'icons.search': {
						const params = (request.params || {}) as { query?: string; provider?: string };
						const results = await searchIcons(params.query, params.provider);
						return { rpc: 1, id: request.id, ok: true, result: results };
					}

					case 'icons.getVariants': {
						const params = (request.params || {}) as { iconId?: string; provider?: string };
						if (!params.iconId) {
							return fail('invalid_params', 'iconId is required');
						}
						const results = await getIconVariants(params.iconId, params.provider);
						return { rpc: 1, id: request.id, ok: true, result: results };
					}

					case 'icons.render': {
						const params = (request.params || {}) as {
							provider?: string;
							iconId?: string;
							style?: string;
							angle?: string;
							size?: number;
						};
						if (!params.iconId) {
							return fail('invalid_params', 'iconId is required');
						}
						if (!params.style || !params.angle || !params.size) {
							return fail('invalid_params', 'style, angle, and size are required');
						}
						const result = await renderIcon({
							provider: params.provider ?? '3dicons',
							iconId: params.iconId,
							style: params.style,
							angle: params.angle,
							size: params.size,
						});
						return { rpc: 1, id: request.id, ok: true, result };
					}

					case 'unsplash.search': {
						if (!hasPermission(plugin.manifest, 'unsplash:search')) {
							return fail('permission_denied', 'unsplash:search is required');
						}
						const params = (request.params || {}) as {
							query?: string;
							page?: number;
							perPage?: number;
							orientation?: 'landscape' | 'portrait' | 'squarish';
							contentFilter?: 'low' | 'high';
						};
						const query = params.query?.trim();
						if (!query) {
							return fail('invalid_params', 'query is required');
						}

						const rawResponse = await invoke<unknown>('unsplash_search_photos', {
							args: {
								query,
								page: Math.max(1, params.page ?? 1),
								perPage: clamp(params.perPage ?? 24, 1, 30),
								orientation: params.orientation,
								contentFilter: params.contentFilter ?? 'high',
							},
						});
						const result = normalizeUnsplashSearchResponse(rawResponse);
						return { rpc: 1, id: request.id, ok: true, result };
					}

					case 'unsplash.insert': {
						if (!hasPermission(plugin.manifest, 'unsplash:insert')) {
							return fail('permission_denied', 'unsplash:insert is required');
						}
						if (!hasPermission(plugin.manifest, 'document:write')) {
							return fail('permission_denied', 'document:write is required');
						}

						const params = (request.params || {}) as {
							photoId?: string;
							mode?: UnsplashInsertMode;
							targetNodeId?: string;
							sizeUrl?: 'regular' | 'full';
						};

						const photoId = params.photoId?.trim();
						if (!photoId) {
							return fail('invalid_params', 'photoId is required');
						}

						const mode: UnsplashInsertMode = params.mode === 'replace' ? 'replace' : 'insert';
						const sizeUrl = params.sizeUrl === 'full' ? 'full' : 'regular';
						const rawPhoto = await invoke<unknown>('unsplash_get_photo', {
							args: { photoId },
						});
						const photo = normalizeUnsplashPhoto(rawPhoto);
						if (!photo) {
							return fail('invalid_response', 'Unsplash photo response is invalid');
						}

						await invoke('unsplash_track_download', {
							args: { downloadLocation: photo.links.downloadLocation },
						});

						const imageUrl = photo.urls[sizeUrl];
						const fetched = await invoke<UnsplashFetchImageResult>('unsplash_fetch_image', {
							args: { url: imageUrl },
						});

						const photoName = photo.description ?? photo.altDescription ?? `Photo by ${photo.user.name}`;
						const meta: ImageMetaUnsplash = {
							kind: 'unsplash',
							photoId: photo.id,
							photographerName: photo.user.name,
							photographerUsername: photo.user.username,
							photographerProfileUrl: appendUnsplashUtm(photo.user.links.html),
							photoUnsplashUrl: appendUnsplashUtm(photo.links.html),
							downloadLocation: photo.links.downloadLocation,
							insertedAt: Date.now(),
						};

						if (mode === 'replace') {
							const targetNodeId = params.targetNodeId ?? selectionIds[0];
							if (!targetNodeId) {
								return fail('invalid_params', 'targetNodeId is required for replace mode');
							}
							const node = document.nodes[targetNodeId];
							if (!node || node.type !== 'image') {
								return fail('invalid_params', 'Target node must be an image');
							}

							const assetId = generateId();
							const commands: Command[] = [
								{
									id: generateId(),
									timestamp: Date.now(),
									source: 'user',
									description: 'Create image asset',
									type: 'createAsset',
									payload: {
										id: assetId,
										asset: {
											type: 'image',
											mime: fetched.mime,
											dataBase64: fetched.dataBase64,
											width: fetched.width,
											height: fetched.height,
										},
									},
								} as Command,
								{
									id: generateId(),
									timestamp: Date.now(),
									source: 'user',
									description: 'Replace image',
									type: 'setProps',
									payload: {
										id: targetNodeId,
										props: {
											image: {
												mime: fetched.mime,
												assetId,
												originalPath: node.image?.originalPath,
												meta,
											},
											name: photoName,
										},
									},
								},
							];

							executeCommand({
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Replace Unsplash image',
								type: 'batch',
								payload: { commands },
							} as Command);

							return { rpc: 1, id: request.id, ok: true, result: { nodeId: targetNodeId, mode } };
						}

						const newNodeId = await insertImageNode({
							dataBase64: fetched.dataBase64,
							mime: fetched.mime,
							width: fetched.width,
							height: fetched.height,
							name: photoName,
							meta,
							position: getDefaultInsertPosition(),
							maxDimension: 1200,
						});
						return { rpc: 1, id: request.id, ok: true, result: { newNodeId, mode } };
					}

					case 'export.snapshot': {
						if (!hasPermission(plugin.manifest, 'export:snapshot')) {
							return fail('permission_denied', 'export:snapshot is required');
						}
						const params = (request.params || {}) as {
							nodeId?: string;
							scale?: number;
							format?: 'png';
							background?: 'transparent' | 'solid';
							includeFrameFill?: boolean;
							clipToBounds?: boolean;
							maxDim?: number;
							allowUpscale?: boolean;
						};
						const targetId = params.nodeId || selectionIds[0];
						if (!targetId) {
							return fail('no_selection', 'No selection to export');
						}

						const snapshot = await exportNodeSnapshot(document, targetId, {
							scale: params.scale,
							format: params.format,
							background: params.background,
							includeFrameFill: params.includeFrameFill,
							clipToBounds: params.clipToBounds,
							maxDim: params.maxDim,
							allowUpscale: params.allowUpscale,
						});
						return { rpc: 1, id: request.id, ok: true, result: snapshot };
					}

					case 'document.insertImage': {
						if (!hasPermission(plugin.manifest, 'document:write')) {
							return fail('permission_denied', 'document:write is required');
						}
						const params = (request.params || {}) as {
							dataBase64: string;
							mime: string;
							width: number;
							height: number;
							position?: { x: number; y: number };
							name?: string;
							meta?: ImageMeta;
						};
						if (!params.dataBase64 || !params.mime) {
							return fail('invalid_params', 'dataBase64 and mime are required');
						}
						const insertPosition = params.position ?? getDefaultInsertPosition();
						const newNodeId = await insertImageNode({
							dataBase64: params.dataBase64,
							mime: params.mime,
							width: params.width,
							height: params.height,
							name: params.name || plugin.manifest.name,
							meta: params.meta,
							position: insertPosition,
							maxDimension: 1200,
						});
						return { rpc: 1, id: request.id, ok: true, result: { newNodeId } };
					}

					case 'document.updateImage': {
						if (!hasPermission(plugin.manifest, 'document:write')) {
							return fail('permission_denied', 'document:write is required');
						}
						const params = (request.params || {}) as {
							nodeId?: string;
							dataBase64?: string;
							mime?: string;
							width?: number;
							height?: number;
							name?: string;
							meta?: ImageMeta;
							resize?: boolean;
						};
						if (!params.nodeId) {
							return fail('invalid_params', 'nodeId is required');
						}
						if (!params.dataBase64 || !params.mime || !params.width || !params.height) {
							return fail('invalid_params', 'dataBase64, mime, width, and height are required');
						}

						const node = document.nodes[params.nodeId];
						if (!node || node.type !== 'image') {
							return fail('invalid_params', 'Target node must be an image');
						}

						const assetId = generateId();
						const commands: Command[] = [
							{
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Create image asset',
								type: 'createAsset',
								payload: {
									id: assetId,
									asset: {
										type: 'image',
										mime: params.mime,
										dataBase64: params.dataBase64,
										width: params.width,
										height: params.height,
									},
								},
							} as Command,
						];

						const imageProps = {
							mime: params.mime,
							assetId,
							originalPath: node.image?.originalPath,
							meta: params.meta ?? node.image?.meta,
						};

						const props: Partial<Node> = {
							image: imageProps,
						};
						if (params.name) {
							props.name = params.name;
						}
						if (params.resize) {
							props.size = { width: params.width, height: params.height };
						}

						commands.push({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Update image',
							type: 'setProps',
							payload: {
								id: params.nodeId,
								props,
							},
						});

						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Update image asset',
							type: 'batch',
							payload: { commands },
						} as Command);

						return { rpc: 1, id: request.id, ok: true, result: { nodeId: params.nodeId } };
					}

					case 'fs.saveFile': {
						if (!hasPermission(plugin.manifest, 'fs:save')) {
							return fail('permission_denied', 'fs:save is required');
						}
						const params = (request.params || {}) as {
							suggestedName?: string;
							mime?: string;
							dataBase64: string;
						};
						if (!params.dataBase64) {
							return fail('invalid_params', 'dataBase64 is required');
						}
						const normalizePngName = (name?: string) => {
							if (!name) return 'export.png';
							const trimmed = name.trim();
							if (!trimmed) return 'export.png';
							const lower = trimmed.toLowerCase();
							if (lower.endsWith('.png')) return trimmed;
							if (/\.[a-z0-9]+$/i.test(trimmed)) {
								return trimmed.replace(/\.[a-z0-9]+$/i, '.png');
							}
							return `${trimmed}.png`;
						};
						const savedPath = await invoke<string>('show_save_image_dialog', {
							args: { suggestedName: normalizePngName(params.suggestedName) },
						});
						if (!savedPath) {
							return fail('cancelled', 'Save cancelled');
						}
						let finalPath = savedPath;
						if (!finalPath.toLowerCase().endsWith('.png')) {
							if (/\.[a-z0-9]+$/i.test(finalPath)) {
								finalPath = finalPath.replace(/\.[a-z0-9]+$/i, '.png');
							} else {
								finalPath = `${finalPath}.png`;
							}
						}
						await invoke('save_binary', {
							args: { path: finalPath, dataBase64: params.dataBase64 },
						});
						return { rpc: 1, id: request.id, ok: true, result: { savedPath: finalPath } };
					}

					case 'asset.load': {
						const params = (request.params || {}) as {
							scope?: 'bundle' | 'shared';
							path?: string;
							encoding?: 'base64' | 'binary';
						};
						if (!params.scope || !params.path) {
							return fail('invalid_params', 'scope and path are required');
						}
						if (params.encoding && params.encoding !== 'base64') {
							return fail('unsupported_encoding', 'Only base64 encoding is supported');
						}

						const normalizedPath = normalizeAssetPath(params.path);
						if (!normalizedPath) {
							return fail('invalid_path', 'Invalid asset path');
						}

						if (params.scope === 'shared' && !normalizedPath.startsWith('v1/')) {
							return fail('invalid_path', 'Shared assets must be under v1/');
						}

						if (params.scope === 'bundle' && !hasPermission(plugin.manifest, 'asset:read')) {
							return fail('forbidden_permission', 'asset:read is required');
						}
						if (params.scope === 'shared' && !hasPermission(plugin.manifest, 'asset:read:shared')) {
							return fail('forbidden_permission', 'asset:read:shared is required');
						}

						const allowlist =
							params.scope === 'bundle' ? plugin.manifest.assets?.bundle : plugin.manifest.assets?.shared;
						if (!isAllowedAssetPath(allowlist, normalizedPath)) {
							return fail('forbidden_allowlist', 'Asset not allowlisted');
						}

						const extension = getAssetExtension(normalizedPath);
						const extensionSet = params.scope === 'bundle' ? BUNDLE_ASSET_EXTENSIONS : SHARED_ASSET_EXTENSIONS;
						if (!extension || !extensionSet.has(extension)) {
							return fail('unsupported_extension', 'Asset extension not supported');
						}

						let dataBase64: string | null = null;
						try {
							if (params.scope === 'shared') {
								const sharedPath = joinPath('plugins/shared', normalizedPath);
								if (isDev) {
									const url = new URL(`/${sharedPath}`, window.location.origin);
									const response = await fetch(url.toString());
									if (!response.ok) {
										return fail('not_found', 'Shared asset not found');
									}
									dataBase64 = arrayBufferToBase64(await response.arrayBuffer());
								} else {
									dataBase64 = await invoke<string>('load_resource_binary', { path: sharedPath });
								}
							} else if (plugin.path) {
								const filePath = joinPath(plugin.path, normalizedPath);
								dataBase64 = await invoke<string>('load_binary', { path: filePath });
							} else {
								const bundleBase = getPluginBundleBasePath(plugin);
								if (!bundleBase) {
									return fail('invalid_path', 'Unable to resolve plugin bundle path');
								}
								if (isDev) {
									const assetUrl = new URL(joinPath(bundleBase, normalizedPath), window.location.origin);
									const response = await fetch(assetUrl.toString());
									if (!response.ok) {
										return fail('not_found', 'Asset not found');
									}
									dataBase64 = arrayBufferToBase64(await response.arrayBuffer());
								} else {
									const resourceBase = bundleBase.startsWith('/') ? bundleBase.slice(1) : bundleBase;
									const resourcePath = joinPath(resourceBase, normalizedPath);
									dataBase64 = await invoke<string>('load_resource_binary', { path: resourcePath });
								}
							}
						} catch (error) {
							console.error('Asset load failed', error);
							return fail('not_found', 'Asset not found');
						}

						if (!dataBase64) {
							return fail('not_found', 'Asset not found');
						}

						const bytes = getBase64ByteLength(dataBase64);
						if (bytes > MAX_ASSET_BYTES) {
							return fail('too_large', 'Asset exceeds size limit');
						}

						let sha256: string | undefined;
						try {
							if (crypto?.subtle) {
								const bytesArray = base64ToUint8Array(dataBase64);
								const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytesArray));
								sha256 = Array.from(new Uint8Array(digest))
									.map((byte) => byte.toString(16).padStart(2, '0'))
									.join('');
							}
						} catch {
							sha256 = undefined;
						}

						return {
							rpc: 1,
							id: request.id,
							ok: true,
							result: {
								mime: getMimeForExtension(extension),
								encoding: 'base64',
								dataBase64,
								bytes,
								...(sha256 ? { sha256 } : {}),
							},
						};
					}

					default:
						return fail('unknown_method', `Unknown method ${request.method}`);
				}
			} catch (error) {
				console.error('Plugin RPC error', error);
				return fail('internal_error', error instanceof Error ? error.message : 'Unknown error');
			}
		},
		[document, executeCommand, getDefaultInsertPosition, insertImageNode, isDev, selectionIds],
	);

	useEffect(() => {
		if (!activePlugin) {
			return;
		}

		const handler = (event: MessageEvent) => {
			if (event.source !== pluginIframeRef.current?.contentWindow) {
				return;
			}
			if (!isRpcRequest(event.data)) {
				return;
			}

			void (async () => {
				const response = await handlePluginRpcRequest(event.data, activePlugin);
				event.source?.postMessage(response, { targetOrigin: '*' });
			})();
		};

		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, [activePlugin, handlePluginRpcRequest]);

	const measureTextSize = useCallback((text: string, fontSize: number, fontFamily: string, fontWeight: string) => {
		if (!measureCanvasRef.current) {
			measureCanvasRef.current = window.document.createElement('canvas');
		}
		const ctx = measureCanvasRef.current.getContext('2d');
		if (!ctx) {
			return { width: 1, height: fontSize };
		}
		ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		const lines = text.split('\n');
		let maxWidth = 0;
		for (const line of lines) {
			const sample = line.length > 0 ? line : ' ';
			const metrics = ctx.measureText(sample);
			maxWidth = Math.max(maxWidth, metrics.width);
		}
		const lineHeight = Math.max(1, fontSize * 1.2);
		const width = Math.max(20, Math.ceil(maxWidth + TEXT_PADDING * 2));
		const height = Math.max(Math.ceil(lineHeight * lines.length + TEXT_PADDING * 2), Math.ceil(lineHeight));
		return { width, height };
	}, []);

	const handleSelectionPointerDown = useCallback(
		(info: CanvasPointerInfo): boolean => {
			const { worldX, worldY, screenX, screenY } = info;
			// Cmd/Meta key enables deep selection (select inside groups)
			const deepSelect = info.metaKey || info.ctrlKey;

			if (selectionBounds && selectionIds.length >= 1) {
				const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
				if (handle) {
					if (selectionIds.length === 1) {
						const nodeId = selectionIds[0];
						const node = document.nodes[nodeId];
						const startBounds = getNodeWorldBounds(displayDocument, nodeId, boundsMap);
						if (node && startBounds) {
							const constraintSnapshot =
								node.type === 'frame' ? buildFrameConstraintSnapshot(document, nodeId, boundsMap) : null;
							setDragState({
								mode: 'resize',
								startWorld: { x: worldX, y: worldY },
								baseDoc: document,
								nodeId,
								handle,
								startBounds,
								initialPosition: { ...node.position },
								initialSize: { ...node.size },
								lockAspectRatio: Boolean(node.aspectRatioLocked || info.shiftKey),
								constraintSnapshot,
							});
							setPreviewDocument(document);
							return true;
						}
					} else {
						const isDescendantOf = (nodeId: string, potentialAncestorId: string): boolean => {
							let current = parentMap[nodeId];
							while (current) {
								if (current === potentialAncestorId) return true;
								current = parentMap[current] || null;
							}
							return false;
						};

						const activeIds = selectionIds.filter((id) => {
							const node = document.nodes[id];
							if (!node || node.locked === true) return false;
							return !selectionIds.some((otherId) => otherId !== id && isDescendantOf(id, otherId));
						});
						if (activeIds.length === 0) {
							return true;
						}

						const activeBounds = getSelectionBounds(displayDocument, activeIds, boundsMap);
						if (!activeBounds) {
							return true;
						}

						const normalizedEdgesById: Record<string, NormalizedEdges> = {};
						const startBoundsMap: WorldBoundsMap = {};
						for (const id of activeIds) {
							const bounds = boundsMap[id];
							if (!bounds) continue;
							normalizedEdgesById[id] = computeNormalizedEdges(activeBounds, bounds);
							startBoundsMap[id] = { ...bounds };
						}

						setTransformSession({
							baseDoc: document,
							activeIds,
							initialBounds: activeBounds,
							normalizedEdgesById,
							handle,
							aspectRatio: activeBounds.width / activeBounds.height,
							startPointerWorld: { x: worldX, y: worldY },
							startBoundsMap,
							modifiers: { shiftKey: info.shiftKey, altKey: info.altKey },
						});
						setPreviewDocument(document);
						return true;
					}
				}
			}

			const hitStack = hitTestStackAtPoint(worldX, worldY).filter((entry) => entry.node.id !== displayDocument.rootId);
			const hitIds = hitStack.map((entry) => entry.node.id);
			let filteredIds = getHitStackInContainer(displayDocument, hitIds, containerFocusId);
			if (containerFocusId && filteredIds.length === 0 && hitIds.length > 0) {
				setContainerFocusId(null);
				filteredIds = hitIds;
				setHitCycle(null);
			}
			const hitMap = new Map(hitStack.map((entry) => [entry.node.id, entry]));
			const hitKey = `${Math.round(worldX)}:${Math.round(worldY)}:${filteredIds.join('|')}`;
			const cycleIndex = info.altKey && hitCycle?.key === hitKey ? hitCycle.index + 1 : 0;
			const nextId = info.altKey ? pickHitCycle(filteredIds, cycleIndex) : filteredIds[0] ?? null;
			if (info.altKey) {
				setHitCycle(nextId ? { key: hitKey, index: cycleIndex } : null);
			} else if (hitCycle) {
				setHitCycle(null);
			}
			const hit = nextId ? hitMap.get(nextId) ?? null : null;

			if (hit && hit.node.id !== displayDocument.rootId) {
				if (hit.locked) {
					return true;
				}

				// Apply Figma-style selection: respect group boundaries unless deep selecting
				const selectableId = findSelectableNode(displayDocument, hit.node.id, deepSelect);
				const nodeId = selectableId;
				const node = document.nodes[nodeId] ?? hit.node;

				if (info.shiftKey) {
					toggleSelection(nodeId);
					return true;
				}

				const isAlreadySelected = selectionIds.includes(nodeId);
				const nextSelection = isAlreadySelected ? selectionIds : [nodeId];
				if (!isAlreadySelected) {
					selectNode(nodeId);
				}

				const initialPositions: Record<string, { x: number; y: number }> = {};
				for (const id of nextSelection) {
					const selected = document.nodes[id];
					if (selected) {
						initialPositions[id] = { ...selected.position };
					}
				}

				const startBounds = getSelectionBounds(displayDocument, nextSelection, boundsMap);
				const snapTargets =
					nextSelection.length === 1
						? mergeSnapTargets(
								buildSiblingSnapTargets(document, nodeId, parentMap, boundsMap),
								getLayoutGuideTargetsForParent(parentMap[nodeId] ?? null),
							)
						: { x: [], y: [] };

				setDragState({
					mode: 'move',
					startWorld: { x: worldX, y: worldY },
					baseDoc: document,
					selectedIds: nextSelection,
					initialPositions,
					startBounds: startBounds || {
						x: worldX,
						y: worldY,
						width: node.size.width,
						height: node.size.height,
					},
					snapTargets,
				});
				return true;
			}

			const additive = info.shiftKey;
			if (!additive) {
				setSelection([]);
			}
			setDragState({
				mode: 'marquee',
				startWorld: { x: worldX, y: worldY },
				currentWorld: { x: worldX, y: worldY },
				baseSelection: additive ? selectionIds : [],
				additive,
			});
			return true;
		},
		[
			displayDocument,
			document,
			parentMap,
			getLayoutGuideTargetsForParent,
			containerFocusId,
			hitCycle,
			selectionBounds,
			selectionIds,
			selectNode,
			setSelection,
			toggleSelection,
			view,
			boundsMap,
			hitTestStackAtPoint,
		],
	);

	const openContextMenuAt = useCallback(
		(clientX: number, clientY: number) => {
			const rect = canvasWrapperRef.current?.getBoundingClientRect();
			const screenX = rect ? clientX - rect.left : clientX;
			const screenY = rect ? clientY - rect.top : clientY;
			const safeZoom = zoom === 0 ? 1 : zoom;
			const worldX = (screenX - panOffset.x) / safeZoom;
			const worldY = (screenY - panOffset.y) / safeZoom;
			const hit = hitTestAtPoint(worldX, worldY);
			if (hit && hit.node.id !== displayDocument.rootId) {
				if (!selectionIds.includes(hit.node.id)) {
					selectNode(hit.node.id);
				}
				setContextMenu({ x: clientX, y: clientY, worldX, worldY, target: 'selection' });
				return;
			}
			setContextMenu({ x: clientX, y: clientY, worldX, worldY, target: 'canvas' });
		},
		[displayDocument.rootId, hitTestAtPoint, panOffset.x, panOffset.y, selectNode, selectionIds, zoom],
	);

	const handleCanvasMouseDown = useCallback(
		(info: CanvasPointerInfo) => {
			const { worldX, worldY, screenX, screenY } = info;
			setHoverHandle(null);
			setHoverHit(null);
			setSnapGuides([]);

			if (transformSession) {
				return;
			}

			if (info.button === 2 || (info.buttons & 2) === 2) {
				openContextMenuAt(info.clientX, info.clientY);
				return;
			}

			if (info.button === 0 && info.ctrlKey) {
				openContextMenuAt(info.clientX, info.clientY);
				return;
			}

			// Hand tool or space key held - start panning
			if (activeTool === 'hand' || spaceKeyHeld) {
				setDragState({
					mode: 'pan',
					startScreen: { x: screenX, y: screenY },
					startPan: { ...panOffset },
				});
				return;
			}

			if (activeTool === 'select') {
				handleSelectionPointerDown(info);
				return;
			}

			if (activeTool === 'rectangle') {
				if (selectionBounds && selectionIds.length === 1) {
					const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
					if (handle) {
						setActiveTool('select');
						handleSelectionPointerDown(info);
						return;
					}
				}

				const parentId = getInsertionParentId(worldX, worldY);
				const localPoint = getLocalPointForParent(parentId, worldX, worldY);
				const tool = createRectangleTool(parentId);
				const result = tool.handleMouseDown(document, localPoint.x, localPoint.y, []);
				if (result) {
					const newIds = Object.keys(result.nodes).filter((id) => !(id in document.nodes));
					const newId = newIds[0];
					const newNode = newId ? result.nodes[newId] : null;
					if (!newId || !newNode) {
						return;
					}

					executeCommand({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Create rectangle',
						type: 'createNode',
						payload: {
							id: newId,
							parentId,
							node: newNode,
						},
					} as Command);
					selectNode(newId);
					setActiveTool('select');
				}
				return;
			}

			if (activeTool === 'frame') {
				if (selectionBounds && selectionIds.length === 1) {
					const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
					if (handle) {
						setActiveTool('select');
						handleSelectionPointerDown(info);
						return;
					}
				}

				const parentId = getInsertionParentId(worldX, worldY);
				const localPoint = getLocalPointForParent(parentId, worldX, worldY);
				const tool = createFrameTool(parentId);
				const result = tool.handleMouseDown(document, localPoint.x, localPoint.y, []);
				if (result) {
					const newIds = Object.keys(result.nodes).filter((id) => !(id in document.nodes));
					const newId = newIds[0];
					const newNode = newId ? result.nodes[newId] : null;
					if (!newId || !newNode) {
						return;
					}

					executeCommand({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Create frame',
						type: 'createNode',
						payload: {
							id: newId,
							parentId,
							node: newNode,
						},
					} as Command);
					selectNode(newId);
					setActiveTool('select');
				}
				return;
			}

			if (activeTool === 'text') {
				if (selectionBounds && selectionIds.length === 1) {
					const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
					if (handle) {
						setActiveTool('select');
						handleSelectionPointerDown(info);
						return;
					}
				}

				const parentId = getInsertionParentId(worldX, worldY);
				const localPoint = getLocalPointForParent(parentId, worldX, worldY);
				const tool = createTextTool(parentId);
				const result = tool.handleMouseDown(document, localPoint.x, localPoint.y, []);
				if (result) {
					const newIds = Object.keys(result.nodes).filter((id) => !(id in document.nodes));
					const newId = newIds[0];
					const newNode = newId ? result.nodes[newId] : null;
					if (!newId || !newNode) {
						return;
					}

					const nextText = newNode.text ?? 'Text';
					const nextFontSize = newNode.fontSize ?? 16;
					const nextFontFamily = newNode.fontFamily ?? 'Inter, sans-serif';
					const nextFontWeight = newNode.fontWeight ?? 'normal';
					const measured = measureTextSize(nextText, nextFontSize, nextFontFamily, nextFontWeight);

					executeCommand({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Create text',
						type: 'createNode',
						payload: {
							id: newId,
							parentId,
							node: {
								...newNode,
								size: measured,
							},
						},
					} as Command);
					selectNode(newId);
					setActiveTool('select');
				}
			}
		},
		[
			activeTool,
			document,
			executeCommand,
			handleSelectionPointerDown,
			selectNode,
			selectionBounds,
			selectionIds,
			setActiveTool,
			view,
			measureTextSize,
			transformSession,
			openContextMenuAt,
			spaceKeyHeld,
			panOffset,
			getInsertionParentId,
			getLocalPointForParent,
		],
	);

	const handleCanvasContextMenu = useCallback(
		(event: React.MouseEvent<HTMLCanvasElement>) => {
			event.preventDefault();
			event.stopPropagation();
			openContextMenuAt(event.clientX, event.clientY);
		},
		[openContextMenuAt],
	);

	const handleCanvasMouseMove = useCallback(
		(info: CanvasPointerInfo) => {
			const { worldX, worldY, screenX, screenY } = info;

			if (transformSession) {
				const deltaX = worldX - transformSession.startPointerWorld.x;
				const deltaY = worldY - transformSession.startPointerWorld.y;
				const rawBounds = computeResizeBounds(
					transformSession.initialBounds,
					transformSession.handle,
					deltaX,
					deltaY,
					1,
					info.shiftKey,
				);
				const snap = snapDisabled
					? { bounds: rawBounds, guides: [] }
					: applyResizeSnapping(transformSession.initialBounds, rawBounds, { x: [], y: [] }, zoom);
				const nextBounds = snap.bounds;

				const updates: Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }> =
					{};
				for (const id of transformSession.activeIds) {
					const edges = transformSession.normalizedEdgesById[id];
					if (!edges) continue;
					const next = applyNormalizedEdges(nextBounds, edges);
					const parentId = documentParentMap[id];
					const parentBounds = parentId ? boundsMap[parentId] : null;
					const parentX = parentBounds?.x ?? 0;
					const parentY = parentBounds?.y ?? 0;
					updates[id] = {
						position: { x: next.x - parentX, y: next.y - parentY },
						size: { width: next.width, height: next.height },
					};
				}

				setPreviewDocument(applyBoundsUpdates(transformSession.baseDoc, updates));
				setSnapGuides(snap.guides);
				return;
			}

			if (dragState?.mode === 'pan') {
				setPanOffset({
					x: dragState.startPan.x + (screenX - dragState.startScreen.x),
					y: dragState.startPan.y + (screenY - dragState.startScreen.y),
				});
				return;
			}

			if (dragState?.mode === 'marquee') {
				setDragState({
					...dragState,
					currentWorld: { x: worldX, y: worldY },
				});

				const rect = rectFromPoints(dragState.startWorld, { x: worldX, y: worldY });
				const hits = getMarqueeSelection(displayDocument, boundsMap, rect);
				const merged = dragState.additive ? Array.from(new Set([...dragState.baseSelection, ...hits])) : hits;

				if (!sameSelectionSet(merged, selectionIds)) {
					setSelection(merged);
				}
				return;
			}

			if (dragState?.mode === 'move') {
				const rawDeltaX = worldX - dragState.startWorld.x;
				const rawDeltaY = worldY - dragState.startWorld.y;
				const snap = snapDisabled
					? { deltaX: rawDeltaX, deltaY: rawDeltaY, guides: [] }
					: applySnapping(dragState.startBounds, rawDeltaX, rawDeltaY, dragState.snapTargets, zoom);

				// Filter out descendants to avoid double-moving during preview
				const isDescendantOf = (nodeId: string, potentialAncestorId: string): boolean => {
					let current = documentParentMap[nodeId];
					while (current) {
						if (current === potentialAncestorId) return true;
						current = documentParentMap[current];
					}
					return false;
				};

				const topLevelIds = dragState.selectedIds.filter((id) => {
					return !dragState.selectedIds.some((otherId) => otherId !== id && isDescendantOf(id, otherId));
				});

				const updates: Record<string, { x: number; y: number }> = {};
				for (const id of topLevelIds) {
					const start = dragState.initialPositions[id];
					if (!start) continue;
					updates[id] = {
						x: start.x + snap.deltaX,
						y: start.y + snap.deltaY,
					};
				}

				setPreviewDocument(applyPositionUpdates(dragState.baseDoc, updates));
				setSnapGuides(snap.guides);
				return;
			}

			if (dragState?.mode === 'resize') {
				const deltaX = worldX - dragState.startWorld.x;
				const deltaY = worldY - dragState.startWorld.y;
				const rawBounds = computeResizeBounds(
					dragState.startBounds,
					dragState.handle,
					deltaX,
					deltaY,
					1,
					dragState.lockAspectRatio,
				);
				const snapTargets = mergeSnapTargets(
					buildSiblingSnapTargets(dragState.baseDoc, dragState.nodeId, parentMap, boundsMap),
					getLayoutGuideTargetsForParent(parentMap[dragState.nodeId] ?? null),
				);
				const snap = snapDisabled
					? { bounds: rawBounds, guides: [] }
					: applyResizeSnapping(dragState.startBounds, rawBounds, snapTargets, zoom);
				const nextBounds = snap.bounds;
				const nextPosition = {
					x: dragState.initialPosition.x + (nextBounds.x - dragState.startBounds.x),
					y: dragState.initialPosition.y + (nextBounds.y - dragState.startBounds.y),
				};
				const nextSize = { width: nextBounds.width, height: nextBounds.height };
				let nextDoc = applyBoundsUpdate(dragState.baseDoc, dragState.nodeId, nextPosition, nextSize);
				if (dragState.constraintSnapshot) {
					const childUpdates = computeFrameConstraintUpdates(dragState.constraintSnapshot, nextSize);
					if (Object.keys(childUpdates).length > 0) {
						nextDoc = applyBoundsUpdates(nextDoc, childUpdates);
					}
				}
				setPreviewDocument(nextDoc);
				setSnapGuides(snap.guides);
				return;
			}

			let nextHandle: ResizeHandle | null = null;
			if (activeTool === 'select' && selectionBounds && selectionIds.length > 0) {
				nextHandle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
			}
			if (nextHandle !== hoverHandle) {
				setHoverHandle(nextHandle);
			}

			if (activeTool === 'select' && !nextHandle) {
				const hit = hitTestAtPoint(worldX, worldY);
				const edgeCursor = hit && hit.kind === 'edge' ? getEdgeCursorForNode(hit.node.id, worldX, worldY) : undefined;
				const nextHover =
					hit && hit.node.id !== displayDocument.rootId
						? { id: hit.node.id, kind: hit.kind, locked: hit.locked, edgeCursor }
						: null;
				const isSameHover =
					nextHover?.id === hoverHit?.id &&
					nextHover?.kind === hoverHit?.kind &&
					nextHover?.locked === hoverHit?.locked &&
					nextHover?.edgeCursor === hoverHit?.edgeCursor;
				if (!isSameHover) {
					setHoverHit(nextHover);
				}
			} else if (hoverHit) {
				setHoverHit(null);
			}
		},
		[
			activeTool,
			dragState,
			transformSession,
			selectionBounds,
			selectionIds,
			view,
			snapDisabled,
			hoverHandle,
			hoverHit,
			documentParentMap,
			displayDocument,
			boundsMap,
			parentMap,
			zoom,
			getLayoutGuideTargetsForParent,
			setSelection,
			hitTestAtPoint,
			getEdgeCursorForNode,
		],
	);

	const handleCanvasMouseUp = useCallback(
		(info: CanvasPointerInfo) => {
			if (transformSession) {
				const deltaX = info.worldX - transformSession.startPointerWorld.x;
				const deltaY = info.worldY - transformSession.startPointerWorld.y;
				const rawBounds = computeResizeBounds(
					transformSession.initialBounds,
					transformSession.handle,
					deltaX,
					deltaY,
					1,
					info.shiftKey,
				);
				const snap = snapDisabled
					? { bounds: rawBounds, guides: [] }
					: applyResizeSnapping(transformSession.initialBounds, rawBounds, { x: [], y: [] }, zoom);
				const nextBounds = snap.bounds;

				const subCommands: Command[] = [];
				let hasChange = false;

				for (const id of transformSession.activeIds) {
					const edges = transformSession.normalizedEdgesById[id];
					if (!edges) continue;
					const next = applyNormalizedEdges(nextBounds, edges);
					const start = transformSession.startBoundsMap?.[id];
					if (start) {
						const changed =
							Math.abs(next.x - start.x) > 0.01 ||
							Math.abs(next.y - start.y) > 0.01 ||
							Math.abs(next.width - start.width) > 0.01 ||
							Math.abs(next.height - start.height) > 0.01;
						hasChange = hasChange || changed;
					}

					const parentId = documentParentMap[id];
					const parentBounds = parentId ? boundsMap[parentId] : null;
					const parentX = parentBounds?.x ?? 0;
					const parentY = parentBounds?.y ?? 0;

					subCommands.push({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Resize node',
						type: 'setProps',
						payload: {
							id,
							props: {
								position: { x: next.x - parentX, y: next.y - parentY },
								size: { width: next.width, height: next.height },
							},
						},
					});
				}

				if (hasChange && subCommands.length > 0) {
					if (subCommands.length === 1) {
						executeCommand(subCommands[0]);
					} else {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Resize nodes',
							type: 'batch',
							payload: { commands: subCommands },
						} as Command);
					}
				}

				setPreviewDocument(null);
				setTransformSession(null);
				setSnapGuides([]);
				setHoverHandle(null);
				setHoverHit(null);
				return;
			}

			if (!dragState) return;

			if (dragState.mode === 'marquee') {
				setDragState(null);
				setSnapGuides([]);
				setHoverHandle(null);
				setHoverHit(null);
				return;
			}

			if (dragState.mode === 'move') {
				const rawDeltaX = info.worldX - dragState.startWorld.x;
				const rawDeltaY = info.worldY - dragState.startWorld.y;
				const snap = snapDisabled
					? { deltaX: rawDeltaX, deltaY: rawDeltaY, guides: [] }
					: applySnapping(dragState.startBounds, rawDeltaX, rawDeltaY, dragState.snapTargets, zoom);

				// Filter out nodes that are descendants of other nodes in the selection
				// to avoid double-moving (parent moves child already)
				const isDescendantOf = (nodeId: string, potentialAncestorId: string): boolean => {
					let current = documentParentMap[nodeId];
					while (current) {
						if (current === potentialAncestorId) return true;
						current = documentParentMap[current];
					}
					return false;
				};

				const topLevelIds = dragState.selectedIds.filter((id) => {
					return !dragState.selectedIds.some((otherId) => otherId !== id && isDescendantOf(id, otherId));
				});

				const updates: Record<string, { x: number; y: number }> = {};
				for (const id of topLevelIds) {
					const start = dragState.initialPositions[id];
					if (!start) continue;
					updates[id] = {
						x: start.x + snap.deltaX,
						y: start.y + snap.deltaY,
					};
				}

				const subCommands = Object.entries(updates).map(([id, position]) => ({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Move node',
					type: 'moveNode' as const,
					payload: { id, position },
				}));

				const hasChange = Object.entries(updates).some(([id, position]) => {
					const start = dragState.initialPositions[id];
					return !start || position.x !== start.x || position.y !== start.y;
				});

				if (hasChange) {
					if (subCommands.length === 1) {
						executeCommand(subCommands[0] as Command);
					} else if (subCommands.length > 1) {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Move nodes',
							type: 'batch',
							payload: { commands: subCommands as Command[] },
						} as Command);
					}
				}
			}

			if (dragState.mode === 'resize') {
				const deltaX = info.worldX - dragState.startWorld.x;
				const deltaY = info.worldY - dragState.startWorld.y;
				const rawBounds = computeResizeBounds(
					dragState.startBounds,
					dragState.handle,
					deltaX,
					deltaY,
					1,
					dragState.lockAspectRatio,
				);
				const snapTargets = mergeSnapTargets(
					buildSiblingSnapTargets(dragState.baseDoc, dragState.nodeId, parentMap, boundsMap),
					getLayoutGuideTargetsForParent(parentMap[dragState.nodeId] ?? null),
				);
				const snap = snapDisabled
					? { bounds: rawBounds, guides: [] }
					: applyResizeSnapping(dragState.startBounds, rawBounds, snapTargets, zoom);
				const nextBounds = snap.bounds;
				const nextPosition = {
					x: dragState.initialPosition.x + (nextBounds.x - dragState.startBounds.x),
					y: dragState.initialPosition.y + (nextBounds.y - dragState.startBounds.y),
				};
				const nextSize = { width: nextBounds.width, height: nextBounds.height };
				const positionChanged =
					nextPosition.x !== dragState.initialPosition.x || nextPosition.y !== dragState.initialPosition.y;
				const sizeChanged =
					nextSize.width !== dragState.initialSize.width || nextSize.height !== dragState.initialSize.height;

				const subCommands: Command[] = [];
				if (positionChanged || sizeChanged) {
					subCommands.push({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Resize node',
						type: 'setProps',
						payload: {
							id: dragState.nodeId,
							props: {
								position: nextPosition,
								size: nextSize,
							},
						},
					});
				}

				if (dragState.constraintSnapshot) {
					const childUpdates = computeFrameConstraintUpdates(dragState.constraintSnapshot, nextSize);
					for (const [childId, update] of Object.entries(childUpdates)) {
						const child = dragState.baseDoc.nodes[childId];
						if (!child) continue;
						const changed =
							Math.abs(update.position.x - child.position.x) > 0.01 ||
							Math.abs(update.position.y - child.position.y) > 0.01 ||
							Math.abs(update.size.width - child.size.width) > 0.01 ||
							Math.abs(update.size.height - child.size.height) > 0.01;
						if (!changed) continue;
						subCommands.push({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Apply constraints',
							type: 'setProps',
							payload: {
								id: childId,
								props: {
									position: update.position,
									size: update.size,
								},
							},
						});
					}
				}

				if (subCommands.length === 1) {
					executeCommand(subCommands[0]);
				} else if (subCommands.length > 1) {
					executeCommand({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Resize with constraints',
						type: 'batch',
						payload: { commands: subCommands },
					} as Command);
				}
			}

			setPreviewDocument(null);
			setDragState(null);
			setSnapGuides([]);
			setHoverHandle(null);
			setHoverHit(null);
		},
		[
			dragState,
			transformSession,
			snapDisabled,
			zoom,
			executeCommand,
			parentMap,
			boundsMap,
			documentParentMap,
			getLayoutGuideTargetsForParent,
		],
	);

	const handleCanvasWheel = useCallback((info: CanvasWheelInfo) => {
		if (info.ctrlKey || info.metaKey) {
			const zoomFactor = Math.exp(-info.deltaY * ZOOM_SENSITIVITY);
			setZoom((prevZoom) => {
				const nextZoom = clamp(prevZoom * zoomFactor, 0.2, 6);
				setPanOffset({
					x: info.screenX - info.worldX * nextZoom,
					y: info.screenY - info.worldY * nextZoom,
				});
				return nextZoom;
			});
			return;
		}

		setPanOffset((prev) => ({
			x: prev.x - info.deltaX,
			y: prev.y - info.deltaY,
		}));
	}, []);

	const handleUpdateNode = useCallback(
		(id: string, updates: Record<string, unknown>) => {
			const current = document.nodes[id];
			let nextUpdates = updates;
			if (current?.type === 'text') {
				const nextText = typeof updates.text === 'string' ? updates.text : (current.text ?? '');
				const nextFontSize = typeof updates.fontSize === 'number' ? updates.fontSize : (current.fontSize ?? 16);
				const nextFontFamily =
					typeof updates.fontFamily === 'string' ? updates.fontFamily : (current.fontFamily ?? 'Inter, sans-serif');
				const nextFontWeight =
					typeof updates.fontWeight === 'string' ? updates.fontWeight : (current.fontWeight ?? 'normal');

				if (
					Object.prototype.hasOwnProperty.call(updates, 'text') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontSize') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontFamily') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontWeight')
				) {
					const measured = measureTextSize(nextText, nextFontSize, nextFontFamily, nextFontWeight);
					nextUpdates = {
						...updates,
						size: measured,
					};
				}
			}

			const sizeUpdate = (nextUpdates as Partial<Node>).size;
			if (
				current?.type === 'frame' &&
				sizeUpdate &&
				typeof sizeUpdate.width === 'number' &&
				typeof sizeUpdate.height === 'number' &&
				!current.layout
			) {
				const snapshot = buildFrameConstraintSnapshot(document, id, boundsMap);
				if (snapshot) {
					const childUpdates = computeFrameConstraintUpdates(snapshot, sizeUpdate);
					const subCommands: Command[] = [
						{
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Update frame',
							type: 'setProps',
							payload: { id, props: nextUpdates },
						},
					];

					for (const [childId, update] of Object.entries(childUpdates)) {
						const child = document.nodes[childId];
						if (!child) continue;
						const changed =
							Math.abs(update.position.x - child.position.x) > 0.01 ||
							Math.abs(update.position.y - child.position.y) > 0.01 ||
							Math.abs(update.size.width - child.size.width) > 0.01 ||
							Math.abs(update.size.height - child.size.height) > 0.01;
						if (!changed) continue;
						subCommands.push({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Apply constraints',
							type: 'setProps',
							payload: { id: childId, props: { position: update.position, size: update.size } },
						});
					}

					if (subCommands.length === 1) {
						executeCommand(subCommands[0]);
					} else {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Update frame with constraints',
							type: 'batch',
							payload: { commands: subCommands },
						} as Command);
					}
					return;
				}
			}

			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Update node properties',
				type: 'setProps',
				payload: {
					id,
					props: nextUpdates,
				},
			});
		},
		[document, boundsMap, executeCommand, measureTextSize],
	);

	const handleRenameNode = useCallback(
		(id: string, name?: string) => {
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Rename node',
				type: 'setProps',
				payload: {
					id,
					props: { name },
				},
			});
		},
		[executeCommand],
	);

	const handleToggleNodeVisible = useCallback(
		(id: string) => {
			dispatchEditorAction({ type: 'toggleVisible' }, [id]);
		},
		[dispatchEditorAction],
	);

	const handleToggleNodeLocked = useCallback(
		(id: string) => {
			dispatchEditorAction({ type: 'toggleLock' }, [id]);
		},
		[dispatchEditorAction],
	);

	const handleReorderChild = useCallback(
		(parentId: string, fromIndex: number, toIndex: number) => {
			if (fromIndex === toIndex) return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Reorder layer',
				type: 'reorderChild',
				payload: { parentId, fromIndex, toIndex },
			});
		},
		[executeCommand],
	);

	const confirmDiscard = useCallback(
		(actionLabel: string) => {
			if (!isDirty) return true;
			return window.confirm(`You have unsaved changes. Discard them and ${actionLabel}?`);
		},
		[isDirty],
	);

	const applyLoadedDocument = useCallback(
		(doc: Document, path: string | null) => {
			replaceDocument(doc);
			setCurrentPath(path);
			markSaved();
			setPanOffset({ x: 0, y: 0 });
			setZoom(1);
			setPreviewDocument(null);
			setDragState(null);
			setSnapGuides([]);
			setHoverHandle(null);
			setHoverHit(null);
			localStorage.removeItem(AUTOSAVE_KEY);
		},
		[replaceDocument, markSaved],
	);

	const loadDocumentFromPath = useCallback(
		async (path: string): Promise<boolean> => {
			try {
				const content = await invoke<string>('load_document', { args: { path } });
				const result = parseDocumentText(content);
				if (!result.ok) {
					const details = result.details?.join('\n');
					alert(`Failed to load document: ${result.error}${details ? `\n${details}` : ''}`);
					return false;
				}
				applyLoadedDocument(result.doc, path);
				if (result.warnings.length > 0) {
					console.warn('Document warnings:', result.warnings);
				}
				return true;
			} catch (error) {
				console.error('Load error:', error);
				alert('Failed to load document');
				return false;
			}
		},
		[applyLoadedDocument],
	);

	const openProjectPath = useCallback(
		async (path: string) => {
			if (!confirmDiscard('open another file')) return false;
			const ok = await loadDocumentFromPath(path);
			if (!ok) return false;
			registerProjectOpened(path);
			setAppView('editor');
			return true;
		},
		[confirmDiscard, loadDocumentFromPath, registerProjectOpened],
	);

	const handleCreateProject = useCallback(async () => {
		if (!confirmDiscard('create a new project')) return;
		const pickedPath = await invoke<string>('show_save_dialog');
		if (!pickedPath) {
			return;
		}
		const path = ensureGalileoExtension(pickedPath);
		try {
			const doc = createDocument();
			await invoke('save_document', {
				args: { path, content: serializeDocument(doc) },
			});
			applyLoadedDocument(doc, path);
			registerProjectOpened(path);
			setAppView('editor');
		} catch (error) {
			console.error('Create project error:', error);
			alert('Failed to create project');
		}
	}, [applyLoadedDocument, confirmDiscard, ensureGalileoExtension, registerProjectOpened]);

	const handleOpenFile = useCallback(async () => {
		const path = await invoke<string>('show_open_dialog');
		if (path) {
			await openProjectPath(path);
		}
	}, [openProjectPath]);

	const handleOpenProject = useCallback(
		async (project: ProjectMeta) => {
			await openProjectPath(project.path);
		},
		[openProjectPath],
	);

	const handleRenameProject = useCallback(
		async (project: ProjectMeta, nextName: string) => {
			const trimmed = nextName.trim();
			if (!trimmed) {
				throw new Error('Project name cannot be empty');
			}
			const nextPath = buildRenamedPath(project.path, trimmed);
			if (nextPath === project.path) {
				return;
			}
			try {
				await invoke('rename_document', { args: { oldPath: project.path, newPath: nextPath } });
				updateProjects((prev) =>
					updateProjectById(prev, project.id, {
						name: deriveProjectNameFromPath(nextPath),
						path: nextPath,
					}),
				);
				if (currentPath === project.path) {
					setCurrentPath(nextPath);
				}
			} catch (error) {
				console.error('Rename error:', error);
				throw new Error('Rename failed. Check permissions or name conflicts.');
			}
		},
		[buildRenamedPath, currentPath, updateProjects],
	);

	const handleDuplicateProject = useCallback(
		async (project: ProjectMeta) => {
			const pickedPath = await invoke<string>('show_save_dialog');
			if (!pickedPath) return;
			const dest = ensureGalileoExtension(pickedPath);
			try {
				await invoke('duplicate_document', { args: { src: project.path, dest } });
				await openProjectPath(dest);
			} catch (error) {
				console.error('Duplicate error:', error);
				alert('Failed to duplicate project');
			}
		},
		[ensureGalileoExtension, openProjectPath],
	);

	const handleDeleteProject = useCallback(
			async (project: ProjectMeta) => {
				const confirmed = window.confirm(`Delete "${project.name}"? This cannot be undone.`);
			if (!confirmed) return;
			try {
				await invoke('delete_document', { args: { path: project.path } });
				updateProjects((prev) => removeProjectById(prev, project.id));
				if (currentPath === project.path) {
					applyLoadedDocument(createDocument(), null);
					setActiveProjectId(null);
					setAppView('projects');
				}
			} catch (error) {
				console.error('Delete error:', error);
				alert('Failed to delete project');
			}
		},
		[applyLoadedDocument, currentPath, updateProjects],
	);

	const handleRemoveMissingProject = useCallback(
		(project: ProjectMeta) => {
			updateProjects((prev) => removeProjectById(prev, project.id));
			if (project.id === activeProjectId) {
				setActiveProjectId(null);
			}
		},
		[activeProjectId, updateProjects],
	);

	const handleTogglePinProject = useCallback(
		(project: ProjectMeta) => {
			updateProjects((prev) => toggleProjectPin(prev, project.id));
		},
		[updateProjects],
	);

	const handleBackToProjects = useCallback(() => {
		if (!confirmDiscard('return to Projects')) return;
		setContextMenu(null);
		setActivePlugin(null);
		setPluginManagerOpen(false);
		setAppView('projects');
	}, [confirmDiscard]);

	const handleRenameCurrentProject = useCallback(
		(nextName: string) => {
			if (!currentProject) return;
			void handleRenameProject(currentProject, nextName).catch((error) => {
				alert(error instanceof Error ? error.message : 'Rename failed');
			});
		},
		[currentProject, handleRenameProject],
	);

	const handleDuplicateCurrentProject = useCallback(() => {
		if (!currentProject) return;
		void handleDuplicateProject(currentProject);
	}, [currentProject, handleDuplicateProject]);

	const handleSave = useCallback(async () => {
		try {
			let path = currentPath;
			let pickedPath: string | null = null;
			if (!path) {
				pickedPath = await invoke<string>('show_save_dialog');
				if (!pickedPath) {
					return;
				}
				path = ensureGalileoExtension(pickedPath);
			}

			await invoke('save_document', {
				args: { path, content: serializeDocument(document) },
			});
			if (pickedPath) {
				setCurrentPath(path);
				registerProjectOpened(path);
			}
			markSaved();
			localStorage.removeItem(AUTOSAVE_KEY);
			alert('Document saved successfully!');
		} catch (error) {
			console.error('Save error:', error);
			alert('Failed to save document');
		}
	}, [document, currentPath, ensureGalileoExtension, markSaved, registerProjectOpened]);

	const handleImportImage = useCallback(async () => {
		try {
			const path = await invoke<string>('show_import_dialog');
			if (!path) {
				return;
			}

			const base64 = await invoke<string>('load_binary', { path });
			const mime = getMimeType(path);
			const name = path.split(/[/\\\\]/).pop();
			await insertImageNode({
				dataBase64: base64,
				mime,
				name,
				originalPath: path,
			});
		} catch (error) {
			console.error('Import error:', error);
			alert('Failed to import image');
		}
	}, [insertImageNode]);

	const handleCreateDeviceFrame = useCallback(
		(preset: DevicePreset) => {
			const newId = generateId();

			// Calculate position - center in viewport or offset from last selection
			const viewportCenterX = (canvasSize.width / 2 - panOffset.x) / zoom;
			const viewportCenterY = (canvasSize.height / 2 - panOffset.y) / zoom;
			const position = {
				x: Math.round(viewportCenterX - preset.frameWidth / 2),
				y: Math.round(viewportCenterY - preset.frameHeight / 2),
			};

			const command: Command = {
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: `Create ${preset.name} frame`,
				type: 'createNode',
				payload: {
					id: newId,
					parentId: document.rootId,
					node: {
						type: 'frame',
						name: preset.name,
						position,
						size: { width: preset.frameWidth, height: preset.frameHeight },
						fill: { type: 'solid', value: '#ffffff' },
						visible: true,
						// Store device preset metadata for mockup integration
						devicePresetId: preset.id,
					},
				},
			};

			executeCommand(command);
			setSelection([newId]);
		},
		[document.rootId, executeCommand, setSelection, canvasSize, panOffset, zoom],
	);

	const handleLoad = useCallback(async () => {
		await handleOpenFile();
	}, [handleOpenFile]);

	useEffect(() => {
		const updateSnapState = (e: KeyboardEvent) => {
			setSnapDisabled(e.altKey || e.metaKey);
		};
		const clearSnapState = () => setSnapDisabled(false);
		window.addEventListener('keydown', updateSnapState);
		window.addEventListener('keyup', updateSnapState);
		window.addEventListener('blur', clearSnapState);
		return () => {
			window.removeEventListener('keydown', updateSnapState);
			window.removeEventListener('keyup', updateSnapState);
			window.removeEventListener('blur', clearSnapState);
		};
	}, []);

	useEffect(() => {
		setHoverHandle(null);
		setHoverHit(null);
		setHitCycle(null);
	}, [selectionIds]);

	useEffect(() => {
		const title = `${fileName}${isDirty ? ' *' : ''} - Galileo`;
		window.document.title = title;
	}, [fileName, isDirty]);

	useEffect(() => {
		if (!isDirty) {
			return;
		}

		const handle = window.setTimeout(() => {
			try {
				const payload = {
					content: serializeDocument(document),
					path: currentPath,
					timestamp: Date.now(),
				};
				localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
			} catch (error) {
				console.warn('Failed to autosave document', error);
			}
		}, AUTOSAVE_DELAY_MS);

		return () => window.clearTimeout(handle);
	}, [document, currentPath, isDirty]);

	useEffect(() => {
		if (appView !== 'editor') return;
		const handlePaste = (event: ClipboardEvent) => {
			const clipboardData = event.clipboardData;
			if (!clipboardData) return;
			if (isEditableTarget(event.target)) return;

			const customText =
				clipboardData.getData('application/x-galileo') || clipboardData.getData('text/plain');
			const payload = parseClipboardPayload(customText);
			if (payload) {
				event.preventDefault();
				pasteClipboardPayload(payload);
				return;
			}

			const files = Array.from(clipboardData.files || []);
			const imageFiles = files.filter((file) => file.type.startsWith('image/') || isLikelyImageName(file.name));

			if (imageFiles.length > 0) {
				event.preventDefault();
				void (async () => {
					try {
						for (let i = 0; i < imageFiles.length; i += 1) {
							const file = imageFiles[i];
							const dataUrl = await readFileAsDataUrl(file);
							const mime = file.type || getMimeType(file.name);
							await insertImageNode({
								src: dataUrl,
								mime,
								name: file.name,
								index: i,
							});
						}
					} catch (error) {
						console.error('Paste image error:', error);
					}
				})();
				return;
			}

			const items = Array.from(clipboardData.items || []);
			const imageItem = items.find((item) => item.type.startsWith('image/'));
			if (imageItem) {
				const file = imageItem.getAsFile();
				if (file) {
					event.preventDefault();
					void (async () => {
						try {
							const dataUrl = await readFileAsDataUrl(file);
							await insertImageNode({
								src: dataUrl,
								mime: file.type || getMimeType(file.name),
								name: file.name,
							});
						} catch (error) {
							console.error('Paste image error:', error);
						}
					})();
				}
				return;
			}

			const paths = extractFilePaths(clipboardData);
			if (paths.length > 0) {
				event.preventDefault();
				void (async () => {
					try {
						for (let i = 0; i < paths.length; i += 1) {
							const path = paths[i];
							if (!isLikelyImageName(path)) continue;
							const base64 = await invoke<string>('load_binary', { path });
							const mime = getMimeType(path);
							const name = path.split(/[/\\\\]/).pop();
							await insertImageNode({
								dataBase64: base64,
								mime,
								name,
								originalPath: path,
								index: i,
							});
						}
					} catch (error) {
						console.error('Paste image error:', error);
					}
				})();
				return;
			}

			if (clipboardRef.current) {
				const text = clipboardData.getData('text/plain');
				if (!text) {
					event.preventDefault();
					pasteClipboardPayload(clipboardRef.current);
				}
			}
		};

		window.addEventListener('paste', handlePaste);
		return () => window.removeEventListener('paste', handlePaste);
	}, [appView, insertImageNode, pasteClipboardPayload]);

	useEffect(() => {
		if (appView !== 'editor') return;
		const handleDragOver = (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};

		const handleDrop = (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();

			const dataTransfer = event.dataTransfer;
			if (!dataTransfer) return;

			const rect = canvasWrapperRef.current?.getBoundingClientRect();
			const screenX = rect ? event.clientX - rect.left : event.clientX;
			const screenY = rect ? event.clientY - rect.top : event.clientY;
			const safeZoom = zoom === 0 ? 1 : zoom;
			const worldX = (screenX - panOffset.x) / safeZoom;
			const worldY = (screenY - panOffset.y) / safeZoom;
			const basePosition = { x: worldX, y: worldY };

			const files = Array.from(dataTransfer.files || []);
			const itemFiles = Array.from(dataTransfer.items || [])
				.filter((item) => item.kind === 'file')
				.map((item) => item.getAsFile())
				.filter((file): file is File => Boolean(file));

			const allFiles = files.length > 0 ? files : itemFiles;

			void (async () => {
				try {
					if (allFiles.length > 0) {
						for (let i = 0; i < allFiles.length; i += 1) {
							const file = allFiles[i];
						if (!file.type.startsWith('image/')) continue;

						const dataUrl = await readFileAsDataUrl(file);
						await insertImageNode({
							src: dataUrl,
							mime: file.type || getMimeType(file.name),
							name: file.name,
							index: i,
							position: {
								x: basePosition.x + i * 24,
								y: basePosition.y + i * 24,
							},
						});
					}
						return;
					}

					const paths = extractFilePaths(dataTransfer);
					if (paths.length > 0) {
						for (let i = 0; i < paths.length; i += 1) {
							const path = paths[i];
							if (!isLikelyImageName(path)) continue;
							const base64 = await invoke<string>('load_binary', { path });
							const mime = getMimeType(path);
							const name = path.split(/[/\\\\]/).pop();
							await insertImageNode({
								dataBase64: base64,
								mime,
								name,
								originalPath: path,
								index: i,
								position: {
									x: basePosition.x + i * 24,
									y: basePosition.y + i * 24,
								},
							});
						}
					}
				} catch (error) {
					console.error('Drop image error:', error);
				}
			})();
		};

		window.addEventListener('dragover', handleDragOver);
		window.addEventListener('drop', handleDrop);
		return () => {
			window.removeEventListener('dragover', handleDragOver);
			window.removeEventListener('drop', handleDrop);
		};
	}, [appView, insertImageNode, panOffset.x, panOffset.y, zoom]);

	useEffect(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!isDirty) return;
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', beforeUnload);
		return () => window.removeEventListener('beforeunload', beforeUnload);
	}, [isDirty]);

	useEffect(() => {
		const raw = localStorage.getItem(AUTOSAVE_KEY);
		if (!raw) return;

		try {
			const parsed = JSON.parse(raw) as { content?: string; path?: string; timestamp?: number };
			if (!parsed.content) return;

			const result = parseDocumentText(parsed.content);
			if (!result.ok) {
				localStorage.removeItem(AUTOSAVE_KEY);
				return;
			}

			const confirmed = window.confirm('Recovered unsaved changes were found. Restore them?');
			if (!confirmed) {
				localStorage.removeItem(AUTOSAVE_KEY);
				return;
			}

			replaceDocument(result.doc);
			setCurrentPath(parsed.path || null);
			markDirty();
		} catch (error) {
			console.warn('Failed to restore autosave', error);
		}
	}, [replaceDocument, markDirty]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const editable = isEditableTarget(e.target);
			const hasSelection = selectionIds.length > 0;
			const isCmd = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			const isEditorView = appView === 'editor';

			if (isCmd && key === 'k') {
				e.preventDefault();
				setCommandPaletteOpen((prev) => !prev);
				return;
			}

			if (commandPaletteOpen) {
				if (e.key === 'Escape') {
					e.preventDefault();
					setCommandPaletteOpen(false);
				}
				return;
			}

			if (isCmd && key === 'o') {
				e.preventDefault();
				handleOpenFile();
				return;
			}

			if (isCmd && key === 'w' && isEditorView) {
				e.preventDefault();
				handleBackToProjects();
				return;
			}

			if (!isEditorView) {
				return;
			}

			if (e.key === 'Escape') {
				if (contextMenu) {
					e.preventDefault();
					setContextMenu(null);
					return;
				}
				if (activePlugin) {
					e.preventDefault();
					setActivePlugin(null);
					return;
				}
				if (pluginManagerOpen) {
					e.preventDefault();
					setPluginManagerOpen(false);
					return;
				}
				if (transformSession) {
					e.preventDefault();
					setTransformSession(null);
					setSnapGuides([]);
					return;
				}
				if (dragState) {
					e.preventDefault();
					if (dragState.mode === 'pan') {
						setPanOffset(dragState.startPan);
					}
					if (dragState.mode === 'marquee') {
						setSelection(dragState.baseSelection);
					}
					setPreviewDocument(null);
					setDragState(null);
					setSnapGuides([]);
					setHoverHandle(null);
					setHoverHit(null);
					return;
				}
				if (containerFocusId) {
					e.preventDefault();
					const parent = findParentNode(displayDocument, containerFocusId);
					const nextFocus = parent && parent.id !== displayDocument.rootId ? parent.id : null;
					setContainerFocusId(nextFocus);
					setSelection([containerFocusId]);
					return;
				}
			}

			if (!editable) {
				if (isCmd && e.altKey && key === 'c') {
					e.preventDefault();
					copyEffects();
					return;
				}
				if (isCmd && e.altKey && key === 'v') {
					e.preventDefault();
					pasteEffects();
					return;
				}
				if (isCmd && key === 'a') {
					e.preventDefault();
					setSelection(getSelectableNodeIds(document));
					return;
				}
				if (isCmd && key === 'c') {
					if (!hasSelection) return;
					e.preventDefault();
					copySelectionToClipboard();
					return;
				}
				if (isCmd && key === 'd') {
					if (!hasSelection) return;
					e.preventDefault();
					dispatchEditorAction({ type: 'duplicate' });
					return;
				}

				// Cmd+G to group, Cmd+Shift+G to ungroup
				if (isCmd && key === 'g') {
					e.preventDefault();
					console.log('Cmd+G pressed, selectionIds:', selectionIds);
					if (e.shiftKey) {
						// Ungroup: need at least one group selected
						const hasGroups = selectionIds.some((id) => document.nodes[id]?.type === 'group');
						if (hasGroups) {
							console.log('Ungrouping...');
							dispatchEditorAction({ type: 'ungroup' });
						}
					} else {
						// Group: need at least 2 items selected
						console.log('Attempting to group, count:', selectionIds.length);
						if (selectionIds.length >= 2) {
							console.log('Calling dispatchEditorAction with group');
							dispatchEditorAction({ type: 'group' });
						} else {
							console.log('Not enough items selected for grouping');
						}
					}
					return;
				}

				if (e.key === 'Enter') {
					if (selectionIds.length !== 1) return;
					const target = document.nodes[selectionIds[0]];
					if (target && (target.type === 'group' || target.type === 'frame')) {
						e.preventDefault();
						setContainerFocusId(target.id);
						return;
					}
					e.preventDefault();
					dispatchEditorAction({ type: 'rename' });
					return;
				}

				if (e.key === 'Delete' || e.key === 'Backspace') {
					if (!hasSelection) return;
					e.preventDefault();
					dispatchEditorAction({ type: 'delete' });
					return;
				}

				if (isCmd && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
					if (!hasSelection) return;
					e.preventDefault();
					if (e.shiftKey) {
						dispatchEditorAction({
							type: 'reorderZ',
							dir: e.code === 'BracketRight' ? 'front' : 'back',
						});
					} else {
						dispatchEditorAction({
							type: 'reorderZ',
							dir: e.code === 'BracketRight' ? 'forward' : 'backward',
						});
					}
					return;
				}
			}

			if (!editable) {
				if (e.key === 'v') setActiveTool('select');
				if (e.key === 'h') setActiveTool('hand');
				if (e.key === 'f') setActiveTool('frame');
				if (e.key === 'r') setActiveTool('rectangle');
				if (e.key === 't') setActiveTool('text');

				// Space key for temporary pan mode (Figma-style)
				if (e.code === 'Space' && !spaceKeyHeld && !dragState) {
					e.preventDefault();
					setSpaceKeyHeld(true);
					setToolBeforeSpace(activeTool);
				}
			}

			if (editable) {
				if (isCmd && key === 's') {
					e.preventDefault();
					handleSave();
				}

				if (isCmd && key === 'o') {
					e.preventDefault();
					handleLoad();
				}

				if (isCmd && key === 'i') {
					e.preventDefault();
					handleImportImage();
				}

				return;
			}

			if (isCmd && key === 'z') {
				e.preventDefault();
				if (e.shiftKey) {
					if (canRedo) redoCommand();
				} else {
					if (canUndo) undoCommand();
				}
			}

			if (isCmd && key === 's') {
				e.preventDefault();
				handleSave();
			}

			if (isCmd && key === 'o') {
				e.preventDefault();
				handleLoad();
			}

			if (isCmd && key === 'i') {
				e.preventDefault();
				handleImportImage();
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			// Space key release - return to previous tool
			if (e.code === 'Space' && spaceKeyHeld) {
				e.preventDefault();
				setSpaceKeyHeld(false);
				// If we were dragging (panning), end the drag
				if (dragState?.mode === 'pan') {
					setDragState(null);
				}
				// Restore previous tool if we saved one
				if (toolBeforeSpace !== null) {
					setActiveTool(toolBeforeSpace);
					setToolBeforeSpace(null);
				}
			}
		};

		const options = { capture: true };
		window.addEventListener('keydown', handleKeyDown, options);
		window.addEventListener('keyup', handleKeyUp, options);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, options);
			window.removeEventListener('keyup', handleKeyUp, options);
		};
	}, [
		appView,
		commandPaletteOpen,
		displayDocument,
		document,
		selectionIds,
		canUndo,
		canRedo,
		redoCommand,
		undoCommand,
		handleBackToProjects,
		handleOpenFile,
		handleSave,
		handleLoad,
		handleImportImage,
		copySelectionToClipboard,
		copyEffects,
		pasteEffects,
		transformSession,
		contextMenu,
		activePlugin,
		pluginManagerOpen,
		dragState,
		dispatchEditorAction,
		setSelection,
		containerFocusId,
		setContainerFocusId,
		spaceKeyHeld,
		toolBeforeSpace,
		activeTool,
	]);

	// Persist panel collapse state
	const toggleLeftPanel = useCallback(() => {
		setLeftPanelCollapsed((prev) => {
			const next = !prev;
			localStorage.setItem('galileo.ui.leftPanelCollapsed', String(next));
			return next;
		});
	}, []);

	const toggleRightPanel = useCallback(() => {
		setRightPanelCollapsed((prev) => {
			const next = !prev;
			localStorage.setItem('galileo.ui.rightPanelCollapsed', String(next));
			return next;
		});
	}, []);

	// Handle tool change including 'hand' tool
	const handleToolChange = useCallback((tool: Tool) => {
		setActiveTool(tool as 'select' | 'hand' | 'frame' | 'rectangle' | 'text');
	}, []);

	const commandItems = useMemo<CommandPaletteItem[]>(() => {
		const items: CommandPaletteItem[] = [
			{
				id: 'command-new-project',
				label: 'New Project',
				section: 'Commands',
				action: () => {
					void handleCreateProject();
				},
			},
			{
				id: 'command-open-file',
				label: 'Open File',
				section: 'Commands',
				shortcut: 'Cmd+O',
				action: () => {
					void handleOpenFile();
				},
			},
		];

		if (appView === 'editor') {
			items.push({
				id: 'command-back-projects',
				label: 'Back to Projects',
				section: 'Commands',
				shortcut: 'Cmd+W',
				action: handleBackToProjects,
			});
		}

		if (appView === 'editor' && currentPath) {
			items.push({
				id: 'file-current',
				label: fileName,
				description: currentPath,
				section: 'Files',
				disabled: true,
				action: () => {},
			});
		}

		const sortedProjects = [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		for (const project of sortedProjects) {
			const isMissing = missingPaths[project.path];
			items.push({
				id: `project-${project.id}`,
				label: project.name,
				description: isMissing ? 'Missing file' : project.path,
				section: 'Projects',
				disabled: isMissing,
				action: () => {
					void handleOpenProject(project);
				},
			});
		}

		return items;
	}, [
		appView,
		currentPath,
		fileName,
		handleBackToProjects,
		handleCreateProject,
		handleOpenFile,
		handleOpenProject,
		missingPaths,
		projects,
	]);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100vh',
				overflow: 'hidden',
				fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif',
				background: 'linear-gradient(180deg, #1b1c1f 0%, #18191b 100%)',
			}}
		>
			<style>{`
				@keyframes bg-remove-progress {
					0% { transform: translateX(-120%); }
					100% { transform: translateX(280%); }
				}
			`}</style>
			{/* Spacer for native macOS traffic lights */}
			<div
				style={{
					height: '28px',
					width: '100%',
					flexShrink: 0,
				}}
			/>

			{appView === 'projects' ? (
				<div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
					<ProjectsScreen
						projects={projects}
						missingPaths={missingPaths}
						search={projectsSearch}
						onSearchChange={handleProjectsSearchChange}
						onCreateProject={handleCreateProject}
						onOpenFile={handleOpenFile}
						onOpenProject={handleOpenProject}
						onRenameProject={handleRenameProject}
						onDuplicateProject={handleDuplicateProject}
						onDeleteProject={handleDeleteProject}
						onTogglePin={handleTogglePinProject}
						onRemoveMissing={handleRemoveMissingProject}
					/>
				</div>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							background: 'linear-gradient(180deg, rgba(34, 35, 38, 0.95) 0%, rgba(29, 30, 33, 0.92) 100%)',
							backdropFilter: 'blur(20px)',
							WebkitBackdropFilter: 'blur(20px)',
							borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
						}}
					>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								height: '36px',
								padding: '0 14px',
							}}
						>
							<ProjectHandle
								projectName={projectName}
								fileName={fileName}
								workspaceName={projectWorkspace}
								env={projectEnv}
								version={projectVersion}
								breadcrumb={projectBreadcrumb}
								onRename={handleRenameCurrentProject}
								onDuplicate={handleDuplicateCurrentProject}
							/>
						</div>
						<ProjectTabs fileName={fileName} isDirty={isDirty} />
					</div>
					<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
						<LayersPanel
							document={displayDocument}
							selectionIds={selectionIds}
							renameRequestId={renameRequestId}
							collapsed={leftPanelCollapsed}
							onToggleCollapsed={toggleLeftPanel}
							onRenameRequestHandled={() => setRenameRequestId(null)}
							onSelect={selectNode}
							onRename={handleRenameNode}
							onToggleVisible={handleToggleNodeVisible}
							onToggleLocked={handleToggleNodeLocked}
							onReorder={handleReorderChild}
						/>

						<div
							ref={canvasWrapperRef}
							style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
							onContextMenu={(e) => handleCanvasContextMenu(e as unknown as React.MouseEvent<HTMLCanvasElement>)}
						>
							<Canvas
								width={canvasSize.width}
								height={canvasSize.height}
								document={displayDocument}
								boundsMap={boundsMap}
								view={view}
								selectionBounds={selectionBounds}
								hoverBounds={hoverBounds}
								showHandles={selectionIds.length > 0}
								hoverHandle={hoverHandle}
								snapGuides={snapGuides}
								layoutGuides={layoutGuideState.lines}
								layoutGuideBounds={layoutGuideState.bounds}
								marqueeRect={marqueeRect}
								cursor={cursor}
								onMouseLeave={() => {
									setHoverHandle(null);
									setHoverHit(null);
								}}
								onMouseDown={handleCanvasMouseDown}
								onMouseMove={handleCanvasMouseMove}
								onMouseUp={handleCanvasMouseUp}
								onWheel={handleCanvasWheel}
								onContextMenu={handleCanvasContextMenu}
							/>

							<ActionBar
								activeTool={activeTool}
								onToolChange={handleToolChange}
								onSave={handleSave}
								onLoad={handleLoad}
								onImport={handleImportImage}
								onCreateDeviceFrame={handleCreateDeviceFrame}
							/>
						</div>

						<PropertiesPanel
							selectedNode={selectedNode}
							document={document}
							collapsed={rightPanelCollapsed}
							onToggleCollapsed={toggleRightPanel}
							onUpdateNode={handleUpdateNode}
							onOpenPlugin={handleOpenPlugin}
							onRemoveBackground={removeBackgroundForImage}
							onClearBackground={clearBackgroundRemoval}
							isRemovingBackground={isRemovingBackground}
							zoom={zoom}
							onCopyEffects={(nodeId) => copyEffects(nodeId)}
							onPasteEffects={(nodeId) => pasteEffects([nodeId])}
							canPasteEffects={Boolean(effectsClipboardRef.current?.length)}
						/>
					</div>
				</>
			)}

			{contextMenu && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}

			{activePlugin && (
				<PluginModal plugin={activePlugin} iframeRef={pluginIframeRef} onClose={() => setActivePlugin(null)} />
			)}

			{pluginManagerOpen && (
				<PluginManagerModal
					plugins={plugins}
					onClose={() => setPluginManagerOpen(false)}
					onLoadDev={handleLoadDevPlugin}
					onRemove={handleRemovePlugin}
					showDev={isDev}
				/>
			)}

			<CommandPalette
				open={commandPaletteOpen}
				items={commandItems}
				onClose={() => setCommandPaletteOpen(false)}
			/>

			{toastMessage && (
				<div
					style={{
						position: 'fixed',
						left: '50%',
						top: 20,
						transform: 'translateX(-50%)',
						backgroundColor: '#2f2f2f',
						color: '#ffffff',
						borderRadius: 16,
						border: '1px solid rgba(255,255,255,0.08)',
						boxShadow: '0 18px 30px rgba(0,0,0,0.5)',
						padding: '12px 18px',
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						zIndex: 1400,
						fontSize: 14,
					}}
				>
					<div
						style={{
							width: 28,
							height: 28,
							borderRadius: 8,
							backgroundColor: '#ffffff',
							display: 'grid',
							placeItems: 'center',
						}}
					>
						<img src="/logo.png" alt="Galileo" style={{ width: 18, height: 18 }} />
					</div>
					<div>{toastMessage}</div>
				</div>
			)}

			{isRemovingBackground && (
				<div
					style={{
						position: 'fixed',
						left: 0,
						right: 0,
						top: 28,
						height: 5,
						backgroundColor: 'rgba(255,255,255,0.12)',
						overflow: 'hidden',
						zIndex: 1500,
						pointerEvents: 'none',
					}}
				>
					<div
						style={{
							height: '100%',
							width: '35%',
							background: 'linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.95), rgba(255,255,255,0.1))',
							animation: 'bg-remove-progress 1s ease-in-out infinite',
							boxShadow: '0 0 10px rgba(255,255,255,0.35)',
						}}
					/>
				</div>
			)}
		</div>
	);
};
