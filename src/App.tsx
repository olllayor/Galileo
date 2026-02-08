import React, { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
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
	createPenTool,
	hitTestNodeAtPosition,
	hitTestNodeStackAtPosition,
	hitTestVectorSegment,
	findSelectableNode,
	getHitStackInContainer,
	pickHitCycle,
	type HitKind,
} from './interaction/tools';
import {
	ENABLE_BOOLEAN_V1,
	ENABLE_TEXT_PARITY_V1,
	ENABLE_VECTOR_EDIT_V1,
	buildParentMap,
	buildWorldBoundsMap,
	buildLayoutGuideTargets,
	computeConstrainedBounds,
	computeLayoutGuideLines,
	findParentNode,
	getNodeWorldBounds,
	getSelectionBounds,
	isBooleanOperandEligible,
	parseDocumentText,
	resolveConstraints,
	serializeDocument,
	type BoundsOverrideMap,
	type Bounds,
	type WorldBoundsMap,
} from './core/doc';
import { generateId } from './core/doc/id';
import { createDocument } from './core/doc/types';
import type {
	BooleanOp,
	Constraints,
	Document,
	ImageMeta,
	ImageMetaUnsplash,
	ImageOutline,
	Node,
	ShadowEffect,
	VectorPoint,
} from './core/doc/types';
import type { Command } from './core/commands/types';
import { layoutText } from './core/text/layout';
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
import {
	getHandleCursor,
	getVectorAnchorHandles,
	getVectorBezierHandles,
	hitTestHandle,
	hitTestVectorAnchor,
	hitTestVectorBezierHandle,
	type VectorAnchorHandle,
	type VectorBezierHandle,
	type VectorBezierHandleKind,
} from './interaction/handles';
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
import { iconifyClient } from './integrations/iconify/client';
import { IconifyClientError } from './integrations/iconify/types';

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const HANDLE_HIT_SIZE = 14;
const HIT_SLOP_PX = 6;
const EDGE_MIN_PX = 6;
const VECTOR_ANCHOR_HIT_SIZE = 9;
const VECTOR_HANDLE_HIT_SIZE = 8;
const VECTOR_SEGMENT_HIT_SIZE = 10;
const VECTOR_DRAG_SLOP_PX = 3;
const TEXT_CREATE_DRAG_SLOP_PX = 4;
const LEGACY_AUTOSAVE_KEY = 'galileo.autosave.v1';
const UNTITLED_DRAFT_KEY = 'untitled';
const AUTOSAVE_DELAY_MS = 1500;
const ZOOM_SENSITIVITY = 0.0035;
const CLIPBOARD_PREFIX = 'GALILEO_CLIPBOARD_V1:';
const DEFAULT_CANVAS_SIZE = { width: 1280, height: 800 } as const;
const DEFAULT_IMAGE_OUTLINE = {
	color: '#ffffff',
	width: 12,
	blur: 0,
} as const;
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
type IconifySearchResponse = {
	icons: string[];
	limit?: number;
	start?: number;
	total?: number;
};
type IconifyCollectionInfo = {
	name?: string;
	total?: number;
	category?: string;
	palette?: boolean;
	license?: {
		title?: string;
		spdx?: string;
		url?: string;
	};
	author?: {
		name?: string;
		url?: string;
	};
};
type IconifyCollectionsResponse = Record<string, IconifyCollectionInfo>;
type IconifyCollectionResponse = {
	prefix: string;
	icons?: string[];
	aliases?: Record<string, unknown>;
	chars?: Record<string, string | string[]>;
	categories?: Record<string, string[]>;
	info?: IconifyCollectionInfo;
};
type IconifyKeywordsResponse = {
	keywords: string[];
};
type IconifyLastModifiedResponse = Record<string, number>;
type DraftPayload = {
	key: string;
	path?: string | null;
	content: string;
	savedAtMs: number;
	compressedBytes: number;
	uncompressedBytes: number;
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
		}
	| {
			mode: 'vectorAnchor';
			pathId: string;
			pointId: string;
			startPoint: { x: number; y: number };
		}
	| {
			mode: 'vectorHandle';
			pathId: string;
			pointId: string;
			handle: 'in' | 'out';
			draggedValue: { x: number; y: number };
			mirroredValue?: { x: number; y: number };
			altKey: boolean;
		}
	| {
			mode: 'penHandle';
			pathId: string;
			pointId: string;
			startScreen: { x: number; y: number };
			anchorLocal: { x: number; y: number };
			currentOut: { x: number; y: number };
			currentIn?: { x: number; y: number };
			altKey: boolean;
		};

type PenSession = {
	pathId: string;
	parentId: string;
	lastPointId: string;
};

type VectorEditSession = {
	pathId: string;
	selectedPointId: string | null;
};

type Point = {
	x: number;
	y: number;
};

type TextEditSession = {
	nodeId: string;
	draftText: string;
	initialText: string;
	isNewNode: boolean;
	selectAllOnFocus: boolean;
};

type TextCreationDragState = {
	startWorld: Point;
	currentWorld: Point;
	parentId: string;
	active: boolean;
};

type VectorHover =
	| { kind: 'anchor'; pointId: string }
	| { kind: 'handle'; pointId: string; handle: VectorBezierHandleKind }
	| { kind: 'segment'; fromPointId: string; toPointId: string; x: number; y: number }
	| null;

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

const buildDraftKey = (path: string | null): string => {
	if (!path) {
		return UNTITLED_DRAFT_KEY;
	}
	return `path:${path}`;
};

const cloneShadowEffects = (effects: ShadowEffect[] | undefined): ShadowEffect[] | null => {
	if (!effects || effects.length === 0) return null;
	return effects.map((effect) => ({ ...effect }));
};

const normalizeImageOutline = (outline: Partial<ImageOutline> | undefined): ImageOutline => ({
	enabled: outline?.enabled === true,
	color:
		typeof outline?.color === 'string' && outline.color.trim().length > 0
			? outline.color
			: DEFAULT_IMAGE_OUTLINE.color,
	width:
		typeof outline?.width === 'number' && Number.isFinite(outline.width)
			? Math.max(0, outline.width)
			: DEFAULT_IMAGE_OUTLINE.width,
	blur:
		typeof outline?.blur === 'number' && Number.isFinite(outline.blur)
			? Math.max(0, outline.blur)
			: DEFAULT_IMAGE_OUTLINE.blur,
});

const mergeImageOutline = (current: ImageOutline | undefined, updates: Partial<ImageOutline>): ImageOutline => {
	return normalizeImageOutline({
		...current,
		...updates,
	});
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

const constrainWorldPoint45 = (origin: { x: number; y: number }, target: { x: number; y: number }): { x: number; y: number } => {
	const dx = target.x - origin.x;
	const dy = target.y - origin.y;
	const angle = Math.atan2(dy, dx);
	const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
	const distance = Math.hypot(dx, dy);
	return {
		x: origin.x + Math.cos(snapped) * distance,
		y: origin.y + Math.sin(snapped) * distance,
	};
};

const applyVectorPointPreview = (
	doc: Document,
	pathId: string,
	pointId: string,
	updater: (point: VectorPoint) => VectorPoint,
): Document => {
	const path = doc.nodes[pathId];
	if (!path || path.type !== 'path' || !path.vector) return doc;
	const nextPoints = path.vector.points.map((point) => (point.id === pointId ? updater(point) : point));
	return {
		...doc,
		nodes: {
			...doc.nodes,
			[pathId]: {
				...path,
				vector: {
					...path.vector,
					points: nextPoints,
				},
			},
		},
	};
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

const normalizeIconifyError = (error: unknown): { code: string; message: string } => {
	if (error instanceof IconifyClientError) {
		return {
			code: error.code,
			message: error.message,
		};
	}

	const message = error instanceof Error ? error.message : String(error);
	const lower = message.toLowerCase();
	if (lower.includes('timeout')) {
		return { code: 'iconify_timeout', message: 'Iconify request timed out' };
	}
	if (lower.includes('not found') || lower.includes('404')) {
		return { code: 'iconify_not_found', message: 'Iconify resource not found' };
	}
	if (lower.includes('invalid')) {
		return { code: 'iconify_invalid_params', message: 'Invalid Iconify request' };
	}
	return { code: 'iconify_unavailable', message: 'Iconify API unavailable' };
};

const normalizeIconifySearchResponse = (payload: unknown): IconifySearchResponse => {
	if (!isRecord(payload)) {
		return { icons: [] };
	}
	const rawIcons = Array.isArray(payload.icons) ? payload.icons : [];
	const icons = rawIcons.filter((value): value is string => typeof value === 'string' && value.includes(':'));
	const limit = getNumber(payload.limit) ?? undefined;
	const start = getNumber(payload.start) ?? undefined;
	const total = getNumber(payload.total) ?? undefined;
	return { icons, ...(limit !== undefined ? { limit } : {}), ...(start !== undefined ? { start } : {}), ...(total !== undefined ? { total } : {}) };
};

const normalizeIconifyCollectionInfo = (payload: unknown): IconifyCollectionInfo | null => {
	if (!isRecord(payload)) return null;
	const name = getString(payload.name) ?? undefined;
	const total = getNumber(payload.total) ?? undefined;
	const category = getString(payload.category) ?? undefined;
	const palette = typeof payload.palette === 'boolean' ? payload.palette : undefined;
	const licenseRecord = isRecord(payload.license) ? payload.license : null;
	const authorRecord = isRecord(payload.author) ? payload.author : null;
	const license =
		licenseRecord && (licenseRecord.title || licenseRecord.spdx || licenseRecord.url)
			? {
					title: getString(licenseRecord.title) ?? undefined,
					spdx: getString(licenseRecord.spdx) ?? undefined,
					url: getString(licenseRecord.url) ?? undefined,
				}
			: undefined;
	const author =
		authorRecord && (authorRecord.name || authorRecord.url)
			? {
					name: getString(authorRecord.name) ?? undefined,
					url: getString(authorRecord.url) ?? undefined,
				}
			: undefined;

	return {
		...(name ? { name } : {}),
		...(total !== undefined ? { total } : {}),
		...(category ? { category } : {}),
		...(palette !== undefined ? { palette } : {}),
		...(license ? { license } : {}),
		...(author ? { author } : {}),
	};
};

const normalizeIconifyCollectionsResponse = (payload: unknown): IconifyCollectionsResponse => {
	if (!isRecord(payload)) return {};
	const entries = Object.entries(payload);
	const out: IconifyCollectionsResponse = {};
	for (const [prefix, value] of entries) {
		if (!prefix || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(prefix)) continue;
		const info = normalizeIconifyCollectionInfo(value);
		if (!info) continue;
		out[prefix] = info;
	}
	return out;
};

const normalizeIconifyCollectionResponse = (payload: unknown): IconifyCollectionResponse | null => {
	if (!isRecord(payload)) return null;
	const prefix = getString(payload.prefix);
	if (!prefix) return null;

	const icons = Array.isArray(payload.icons)
		? payload.icons.filter((value): value is string => typeof value === 'string')
		: undefined;
	const uncategorized = Array.isArray(payload.uncategorized)
		? payload.uncategorized.filter((value): value is string => typeof value === 'string')
		: undefined;
	const hidden = Array.isArray(payload.hidden)
		? payload.hidden.filter((value): value is string => typeof value === 'string')
		: undefined;
	const aliases = isRecord(payload.aliases) ? payload.aliases : undefined;
	const chars = isRecord(payload.chars) ? (payload.chars as Record<string, string | string[]>) : undefined;
	const categories = isRecord(payload.categories)
		? (Object.fromEntries(
				Object.entries(payload.categories).map(([key, value]) => [
					key,
					Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [],
				]),
			) as Record<string, string[]>)
		: undefined;
	const info = normalizeIconifyCollectionInfo(payload.info) ?? undefined;

	return {
		prefix,
		...(icons ? { icons } : {}),
		...(uncategorized ? { uncategorized } : {}),
		...(hidden ? { hidden } : {}),
		...(aliases ? { aliases } : {}),
		...(chars ? { chars } : {}),
		...(categories ? { categories } : {}),
		...(info ? { info } : {}),
	};
};

const normalizeIconifyKeywordsResponse = (payload: unknown): IconifyKeywordsResponse => {
	if (!isRecord(payload)) return { keywords: [] };
	const keywords = Array.isArray(payload.keywords)
		? payload.keywords.filter((value): value is string => typeof value === 'string')
		: [];
	return { keywords };
};

const normalizeIconifyLastModifiedResponse = (payload: unknown): IconifyLastModifiedResponse => {
	if (!isRecord(payload)) return {};
	const out: IconifyLastModifiedResponse = {};
	for (const [key, value] of Object.entries(payload)) {
		const parsed = getNumber(value);
		if (parsed !== null) out[key] = parsed;
	}
	return out;
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

	const [activeTool, setActiveTool] = useState<'select' | 'hand' | 'frame' | 'rectangle' | 'text' | 'pen'>('select');
	const [penSession, setPenSession] = useState<PenSession | null>(null);
	const [vectorEditSession, setVectorEditSession] = useState<VectorEditSession | null>(null);
	const [vectorHover, setVectorHover] = useState<VectorHover>(null);
	const [spaceKeyHeld, setSpaceKeyHeld] = useState(false);
	const [toolBeforeSpace, setToolBeforeSpace] = useState<
		'select' | 'hand' | 'frame' | 'rectangle' | 'text' | 'pen' | null
	>(null);
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
	const [textEditSession, setTextEditSession] = useState<TextEditSession | null>(null);
	const [textCreationDragState, setTextCreationDragState] = useState<TextCreationDragState | null>(null);
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
	const [canvasViewportOffset, setCanvasViewportOffset] = useState({ x: 0, y: 0 });
	const pluginIframeRef = useRef<HTMLIFrameElement | null>(null);
	const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const textEditorRef = useRef<HTMLInputElement | null>(null);
	const textEditorIsComposingRef = useRef(false);
	const suppressTextEditorBlurCommitRef = useRef(false);
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

	const saveDraftSnapshot = useCallback(async (snapshot: { key: string; path: string | null; content: string }) => {
		try {
			await invoke('save_draft', {
				args: {
					key: snapshot.key,
					path: snapshot.path,
					content: snapshot.content,
				},
			});
		} catch (error) {
			console.warn('Failed to save draft', error);
		}
	}, []);

	const deleteDraftByKey = useCallback(async (key: string) => {
		try {
			await invoke('delete_draft', { args: { key } });
		} catch (error) {
			console.warn('Failed to delete draft', error);
		}
	}, []);

	const handleProjectsSearchChange = useCallback((value: string) => {
		setProjectsSearch(value);
		saveProjectsSearch(value);
	}, []);

	useLayoutEffect(() => {
		const wrapper = canvasWrapperRef.current;
		if (!wrapper) return;

		let frameId: number | null = null;
		let observer: ResizeObserver | null = null;

		const updateOffset = () => {
			const canvas = wrapper.querySelector('canvas');
			if (!canvas) {
				setCanvasViewportOffset((current) => (current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 }));
				return;
			}

			const wrapperRect = wrapper.getBoundingClientRect();
			const canvasRect = canvas.getBoundingClientRect();
			const next = {
				x: canvasRect.left - wrapperRect.left,
				y: canvasRect.top - wrapperRect.top,
			};
			setCanvasViewportOffset((current) =>
				Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5 ? current : next,
			);
		};

		const schedule = () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			frameId = requestAnimationFrame(() => {
				frameId = null;
				updateOffset();
			});
		};

		updateOffset();
		observer = new ResizeObserver(() => schedule());
		observer.observe(wrapper);
		const canvas = wrapper.querySelector('canvas');
		if (canvas) {
			observer.observe(canvas);
		}
		window.addEventListener('resize', schedule);

		return () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			if (observer) {
				observer.disconnect();
			}
			window.removeEventListener('resize', schedule);
		};
	}, [appView, leftPanelCollapsed, rightPanelCollapsed, canvasSize.height, canvasSize.width]);

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
	const editablePathId = useMemo(() => {
		if (!ENABLE_VECTOR_EDIT_V1) return null;
		if (selectedIds.length !== 1) return null;
		const selected = displayDocument.nodes[selectedIds[0]];
		if (!selected) return null;
		if (selected.type === 'path') return selected.id;
		if (selected.type === 'boolean' && ENABLE_BOOLEAN_V1) {
			const isolatedId = selected.booleanData?.isolationOperandId;
			if (!isolatedId) return null;
			const isolated = displayDocument.nodes[isolatedId];
			if (isolated?.type === 'path') {
				return isolated.id;
			}
		}
		return null;
	}, [displayDocument, selectedIds]);
	const editablePathNode = editablePathId ? displayDocument.nodes[editablePathId] : null;
	const editablePathBounds = editablePathId ? boundsMap[editablePathId] : null;
	const editablePathPointCount = editablePathNode?.type === 'path' ? editablePathNode.vector?.points.length ?? 0 : 0;
	const isVectorEditActive = Boolean(vectorEditSession && editablePathId && vectorEditSession.pathId === editablePathId);
	const vectorAnchors = useMemo<VectorAnchorHandle[]>(() => {
		if (!editablePathNode || editablePathNode.type !== 'path' || !editablePathBounds || !editablePathNode.vector) return [];
		if (!isVectorEditActive && activeTool !== 'pen') return [];
		return getVectorAnchorHandles({
			points: editablePathNode.vector.points,
			nodeWorld: { x: editablePathBounds.x, y: editablePathBounds.y },
			selectedPointId: vectorEditSession?.selectedPointId ?? null,
			hoveredPointId: vectorHover?.kind === 'anchor' ? vectorHover.pointId : null,
		});
	}, [editablePathNode, editablePathBounds, isVectorEditActive, activeTool, vectorEditSession, vectorHover]);
	const vectorBezierHandles = useMemo<VectorBezierHandle[]>(() => {
		if (!editablePathNode || editablePathNode.type !== 'path' || !editablePathBounds || !editablePathNode.vector) return [];
		if (!isVectorEditActive && activeTool !== 'pen') return [];
		return getVectorBezierHandles({
			points: editablePathNode.vector.points,
			nodeWorld: { x: editablePathBounds.x, y: editablePathBounds.y },
			hovered:
				vectorHover?.kind === 'handle'
					? { pointId: vectorHover.pointId, kind: vectorHover.handle }
					: null,
		});
	}, [editablePathNode, editablePathBounds, isVectorEditActive, activeTool, vectorHover]);
	const vectorSegmentPreview =
		vectorHover?.kind === 'segment' && isVectorEditActive
			? { x: vectorHover.x, y: vectorHover.y }
			: null;
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
	const textCreationDraftRect = useMemo(() => {
		if (!textCreationDragState?.active) return null;
		const worldRect = rectFromPoints(textCreationDragState.startWorld, textCreationDragState.currentWorld);
		return {
			x: worldRect.x * view.zoom + view.pan.x,
			y: worldRect.y * view.zoom + view.pan.y,
			width: worldRect.width * view.zoom,
			height: worldRect.height * view.zoom,
		};
	}, [textCreationDragState, view]);
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
		if (dragState?.mode === 'vectorAnchor') return 'move';
		if (dragState?.mode === 'vectorHandle' || dragState?.mode === 'penHandle') return 'crosshair';
		if (isInPanMode) return 'grab';
		if (transformSession) return getHandleCursor(transformSession.handle);
		if (hoverHandle) return getHandleCursor(hoverHandle);
		if (vectorHover?.kind === 'handle') return 'crosshair';
		if (vectorHover?.kind === 'anchor') return 'pointer';
		if (vectorHover?.kind === 'segment') return 'copy';
		if (hoverHit?.locked) return 'not-allowed';
		if (hoverHit?.kind === 'edge') return hoverHit.edgeCursor || 'move';
		if (hoverHit?.kind === 'fill') return 'default';
		if (activeTool === 'frame' || activeTool === 'rectangle' || activeTool === 'text' || activeTool === 'pen')
			return 'crosshair';
		return undefined; // Let CSS custom cursor apply
	}, [dragState, transformSession, hoverHandle, hoverHit, activeTool, isInPanMode, vectorHover]);

	useEffect(() => {
		if (!vectorEditSession) return;
		const path = displayDocument.nodes[vectorEditSession.pathId];
		if (!path || path.type !== 'path' || editablePathId !== vectorEditSession.pathId) {
			setVectorEditSession(null);
			setVectorHover(null);
		}
	}, [displayDocument, editablePathId, vectorEditSession]);

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
								outline: undefined,
							},
						},
					},
				});
			},
			[document.nodes, executeCommand],
		);

	const removeBackgroundForImage = useCallback(
		async (nodeId: string, options?: { outlineOnSuccess?: Partial<ImageOutline> }): Promise<boolean> => {
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'image') {
				return false;
			}
			if (isRemovingBackground) {
				return false;
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
				const outline = options?.outlineOnSuccess ? mergeImageOutline(node.image?.outline, options.outlineOnSuccess) : undefined;
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
									...(outline ? { outline } : {}),
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
				return true;
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
				return false;
			} finally {
				setIsRemovingBackground(false);
			}
		},
		[document, executeCommand, isRemovingBackground, showToast],
	);

	const updateImageOutline = useCallback(
		async (nodeId: string, updates: Partial<ImageOutline>) => {
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'image') {
				return;
			}
			const image = node.image ?? {};
			const nextOutline = mergeImageOutline(image.outline, updates);
			const needsMaskForEnable = nextOutline.enabled === true && !image.maskAssetId;

			if (needsMaskForEnable) {
				await removeBackgroundForImage(nodeId, { outlineOnSuccess: nextOutline });
				return;
			}

			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Update image outline',
				type: 'setProps',
				payload: {
					id: nodeId,
					props: {
						image: {
							...image,
							outline: nextOutline,
						},
					},
				},
			});
		},
		[document.nodes, executeCommand, removeBackgroundForImage],
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

	const createBooleanFromSelection = useCallback(
		(op: BooleanOp, ids: string[] = selectionIds) => {
			if (!ENABLE_BOOLEAN_V1) return;
			const validIds = ids.filter((id) => {
				const node = document.nodes[id];
				return Boolean(node) && isBooleanOperandEligible(node);
			});
			if (validIds.length < 2) {
				return;
			}

			const parentIds = Array.from(new Set(validIds.map((id) => documentParentMap[id]).filter(Boolean)));
			if (parentIds.length !== 1) {
				return;
			}
			const parentId = parentIds[0] as string;
			const parent = document.nodes[parentId];
			if (!parent?.children) return;

			const orderedIds = parent.children.filter((childId) => validIds.includes(childId));
			if (orderedIds.length < 2) return;

			const booleanId = generateId();
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: `Create boolean (${op})`,
				type: 'createBooleanNode',
				payload: {
					id: booleanId,
					parentId,
					operandIds: orderedIds,
					op,
				},
			} as Command);
			setSelection([booleanId]);
		},
		[document.nodes, documentParentMap, executeCommand, selectionIds, setSelection],
	);

	const setBooleanOp = useCallback(
		(nodeId: string, op: BooleanOp) => {
			if (!ENABLE_BOOLEAN_V1) return;
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'boolean') return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: `Set boolean op (${op})`,
				type: 'setBooleanOp',
				payload: { id: nodeId, op },
			} as Command);
		},
		[document.nodes, executeCommand],
	);

	const flattenBoolean = useCallback(
		(nodeId: string) => {
			if (!ENABLE_BOOLEAN_V1) return;
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'boolean') return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Flatten boolean',
				type: 'flattenBooleanNode',
				payload: { id: nodeId },
			} as Command);
		},
		[document.nodes, executeCommand],
	);

	const setBooleanIsolation = useCallback(
		(nodeId: string, isolationOperandId?: string) => {
			if (!ENABLE_BOOLEAN_V1) return;
			const node = document.nodes[nodeId];
			if (!node || node.type !== 'boolean') return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: isolationOperandId ? 'Set boolean isolation' : 'Clear boolean isolation',
				type: 'setBooleanIsolation',
				payload: {
					id: nodeId,
					isolationOperandId,
				},
			} as Command);
		},
		[document.nodes, executeCommand],
	);

	const toggleVectorClosed = useCallback(
		(pathId: string, closed: boolean) => {
			const node = document.nodes[pathId];
			if (!node || node.type !== 'path') return;
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: closed ? 'Close path' : 'Open path',
				type: 'toggleVectorClosed',
				payload: { id: pathId, closed },
			} as Command);
		},
		[document.nodes, executeCommand],
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
		const isSingleBoolean = selectionIds.length === 1 && primaryNode?.type === 'boolean';
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

		const canCreateBoolean =
			ENABLE_BOOLEAN_V1 &&
			selectionIds.length >= 2 &&
			selectionIds.every((id) => isBooleanOperandEligible(document.nodes[id] ?? null)) &&
			(() => {
				const parentIds = new Set(selectionIds.map((id) => documentParentMap[id]).filter(Boolean));
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
			...(ENABLE_BOOLEAN_V1
				? [
						{
							icon: 'B',
							label: 'Boolean',
							enabled: canCreateBoolean || isSingleBoolean,
							submenu: [
								{
									label: 'Union',
									enabled: canCreateBoolean || isSingleBoolean,
									onSelect: () =>
										isSingleBoolean && primaryId
											? setBooleanOp(primaryId, 'union')
											: createBooleanFromSelection('union'),
								},
								{
									label: 'Subtract',
									enabled: canCreateBoolean || isSingleBoolean,
									onSelect: () =>
										isSingleBoolean && primaryId
											? setBooleanOp(primaryId, 'subtract')
											: createBooleanFromSelection('subtract'),
								},
								{
									label: 'Intersect',
									enabled: canCreateBoolean || isSingleBoolean,
									onSelect: () =>
										isSingleBoolean && primaryId
											? setBooleanOp(primaryId, 'intersect')
											: createBooleanFromSelection('intersect'),
								},
								{
									label: 'Exclude',
									enabled: canCreateBoolean || isSingleBoolean,
									onSelect: () =>
										isSingleBoolean && primaryId
											? setBooleanOp(primaryId, 'exclude')
											: createBooleanFromSelection('exclude'),
								},
								...(isSingleBoolean
									? [
											{ separator: true } as ContextMenuItem,
											{
												label: 'Isolation',
												submenu: [
													{
														label: 'Off',
														onSelect: () => primaryId && setBooleanIsolation(primaryId),
													},
													...((primaryNode?.children ?? []).map((operandId) => {
														const operand = document.nodes[operandId];
														const isActive =
															primaryNode?.type === 'boolean' &&
															primaryNode.booleanData?.isolationOperandId === operandId;
														return {
															label: `${isActive ? '• ' : ''}${operand?.name ?? operand?.type ?? 'Operand'}`,
															onSelect: () => primaryId && setBooleanIsolation(primaryId, operandId),
														};
													}) as ContextMenuItem[]),
												],
											},
											{
												label: 'Flatten',
												onSelect: () => primaryId && flattenBoolean(primaryId),
											},
										]
									: []),
							],
						},
					]
				: []),
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
		createBooleanFromSelection,
		devPlugins,
		dispatchEditorAction,
		document.nodes,
		documentParentMap,
		flattenBoolean,
		handleLoadDevPlugin,
		isDev,
		isRemovingBackground,
		recentPlugins,
		plugins,
		removeBackgroundForImage,
		runPlugin,
		setBooleanOp,
		setBooleanIsolation,
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

					case 'host.close': {
						setActivePlugin(null);
						return { rpc: 1, id: request.id, ok: true, result: { closed: true } };
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

					case 'iconify.search': {
						if (!hasPermission(plugin.manifest, 'iconify:search')) {
							return fail('permission_denied', 'iconify:search is required');
						}
						const params = (request.params || {}) as {
							query?: string;
							limit?: number;
							start?: number;
							prefix?: string;
							prefixes?: string[];
							category?: string;
						};
						try {
							const raw = await iconifyClient.searchIcons(params.query ?? '', {
								limit: params.limit,
								start: params.start,
								prefix: params.prefix,
								prefixes: params.prefixes,
								category: params.category,
							});
							return { rpc: 1, id: request.id, ok: true, result: normalizeIconifySearchResponse(raw) };
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
					}

					case 'iconify.collections': {
						if (!hasPermission(plugin.manifest, 'iconify:browse')) {
							return fail('permission_denied', 'iconify:browse is required');
						}
						const params = (request.params || {}) as {
							prefix?: string;
							prefixes?: string[];
						};
						try {
							const raw = await iconifyClient.listCollections({
								prefix: params.prefix,
								prefixes: params.prefixes,
							});
							return {
								rpc: 1,
								id: request.id,
								ok: true,
								result: normalizeIconifyCollectionsResponse(raw),
							};
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
					}

					case 'iconify.collection': {
						if (!hasPermission(plugin.manifest, 'iconify:browse')) {
							return fail('permission_denied', 'iconify:browse is required');
						}
						const params = (request.params || {}) as {
							prefix?: string;
							info?: boolean;
							chars?: boolean;
						};
						const prefix = params.prefix?.trim();
						if (!prefix) {
							return fail('iconify_invalid_params', 'prefix is required');
						}
						try {
							const raw = await iconifyClient.getCollection(prefix, {
								info: params.info ?? true,
								chars: params.chars ?? false,
							});
							const normalized = normalizeIconifyCollectionResponse(raw);
							if (!normalized) {
								return fail('iconify_unavailable', 'Iconify collection response invalid');
							}
							return { rpc: 1, id: request.id, ok: true, result: normalized };
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
					}

					case 'iconify.keywords': {
						if (!hasPermission(plugin.manifest, 'iconify:browse')) {
							return fail('permission_denied', 'iconify:browse is required');
						}
						const params = (request.params || {}) as {
							prefix?: string;
							keyword?: string;
						};
						try {
							const raw = await iconifyClient.getKeywords({
								prefix: params.prefix,
								keyword: params.keyword,
							});
							return {
								rpc: 1,
								id: request.id,
								ok: true,
								result: normalizeIconifyKeywordsResponse(raw),
							};
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
					}

					case 'iconify.svg': {
						if (!hasPermission(plugin.manifest, 'iconify:render')) {
							return fail('permission_denied', 'iconify:render is required');
						}
						const params = (request.params || {}) as {
							icon?: string;
							prefix?: string;
							name?: string;
							customizations?: {
								color?: string;
								width?: string | number;
								height?: string | number;
								rotate?: string | number;
								flip?: string;
								box?: boolean;
							};
						};

						let prefix = params.prefix?.trim();
						let name = params.name?.trim();
						if (params.icon?.includes(':')) {
							const [parsedPrefix, parsedName] = params.icon.split(':');
							prefix = parsedPrefix;
							name = parsedName;
						}
						if (!prefix || !name) {
							return fail('iconify_invalid_params', 'icon or prefix/name is required');
						}
						try {
							const rendered = await iconifyClient.renderSvg(prefix, name, params.customizations);
							return {
								rpc: 1,
								id: request.id,
								ok: true,
								result: {
									icon: `${prefix}:${name}`,
									prefix,
									name,
									svg: rendered.svg,
									host: rendered.host,
									url: rendered.url,
								},
							};
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
					}

					case 'iconify.lastModified': {
						if (!hasPermission(plugin.manifest, 'iconify:browse')) {
							return fail('permission_denied', 'iconify:browse is required');
						}
						const params = (request.params || {}) as {
							prefixes?: string[];
						};
						const prefixes = Array.isArray(params.prefixes) ? params.prefixes : [];
						try {
							const raw = await iconifyClient.getLastModified(prefixes);
							return {
								rpc: 1,
								id: request.id,
								ok: true,
								result: normalizeIconifyLastModifiedResponse(raw),
							};
						} catch (error) {
							const mapped = normalizeIconifyError(error);
							return fail(mapped.code, mapped.message);
						}
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
		[document, executeCommand, getDefaultInsertPosition, insertImageNode, isDev, selectionIds, setActivePlugin],
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

	const measureTextSize = useCallback(
		(options: {
			text: string;
			fontSize: number;
			fontFamily: string;
			fontWeight: string;
			textAlign?: Node['textAlign'];
			lineHeightPx?: number;
			letterSpacingPx?: number;
			textResizeMode?: Node['textResizeMode'];
			width?: number;
			height?: number;
		}) => {
			if (!measureCanvasRef.current) {
				measureCanvasRef.current = window.document.createElement('canvas');
			}
			const ctx = measureCanvasRef.current.getContext('2d');
			if (!ctx) {
				return { width: 1, height: Math.max(1, Math.ceil(options.fontSize)) };
			}

			const fontSize = Number.isFinite(options.fontSize) ? Math.max(1, options.fontSize) : 16;
			const fontFamily = options.fontFamily || 'Inter, sans-serif';
			const fontWeight = options.fontWeight || 'normal';
			const letterSpacingPx = Number.isFinite(options.letterSpacingPx) ? (options.letterSpacingPx as number) : 0;
			const textResizeMode = options.textResizeMode ?? 'auto-width';

			ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
			const layout = layoutText(
				{
					text: options.text ?? '',
					width: typeof options.width === 'number' ? Math.max(1, options.width) : 200,
					height: typeof options.height === 'number' ? Math.max(1, options.height) : Math.max(1, fontSize),
					fontSize,
					textAlign: options.textAlign ?? 'left',
					lineHeightPx: options.lineHeightPx,
					letterSpacingPx,
					textResizeMode,
				},
				(line) => {
					if (!line) return 0;
					const baseWidth = Math.max(0, ctx.measureText(line).width);
					const glyphCount = Array.from(line).length;
					if (glyphCount <= 1 || letterSpacingPx === 0) {
						return baseWidth;
					}
					return baseWidth + (glyphCount - 1) * letterSpacingPx;
				},
			);

			return {
				width: Math.max(1, Math.ceil(layout.boxWidth)),
				height: Math.max(1, Math.ceil(layout.boxHeight)),
			};
		},
		[],
	);

	const startTextEditing = useCallback(
		(
			nodeId: string,
			options?: {
				isNewNode?: boolean;
				selectAll?: boolean;
				initialText?: string;
				draftText?: string;
			},
		) => {
			if (!ENABLE_TEXT_PARITY_V1) return;
			const node = document.nodes[nodeId];
			if (node && (node.type !== 'text' || node.locked === true)) {
				return;
			}

			const baseInitialText = typeof options?.initialText === 'string' ? options.initialText : node?.text ?? '';
			const rawDraftText = typeof options?.draftText === 'string' ? options.draftText : baseInitialText;
			const baseDraftText = rawDraftText.replace(/[\r\n]+/g, ' ');
			textEditorIsComposingRef.current = false;
			suppressTextEditorBlurCommitRef.current = false;
			setTextEditSession({
				nodeId,
				draftText: baseDraftText,
				initialText: baseInitialText,
				isNewNode: Boolean(options?.isNewNode),
				selectAllOnFocus: options?.selectAll !== false,
			});
			setSelection([nodeId]);
			setActiveTool('select');
		},
		[document, setSelection],
	);

	const createTextNodeAndStartEditing = useCallback(
		(options: { parentId: string; worldStart: Point; worldEnd: Point; asFixedBox: boolean }) => {
			const startLocal = getLocalPointForParent(options.parentId, options.worldStart.x, options.worldStart.y);
			const endLocal = getLocalPointForParent(options.parentId, options.worldEnd.x, options.worldEnd.y);
			const tool = createTextTool(options.parentId);
			const result = tool.handleMouseDown(document, startLocal.x, startLocal.y, []);
			if (!result) return;

			const newIds = Object.keys(result.nodes).filter((id) => !(id in document.nodes));
			const newId = newIds[0];
			const newNode = newId ? result.nodes[newId] : null;
			if (!newId || !newNode || newNode.type !== 'text') {
				return;
			}

			const nextText = newNode.text ?? '';
			const nextFontSize = newNode.fontSize ?? 16;
			const nextFontFamily = newNode.fontFamily ?? 'Inter, sans-serif';
			const nextFontWeight = newNode.fontWeight ?? 'normal';
			const lineHeightPx = newNode.lineHeightPx;
			const defaultLineHeight = lineHeightPx ?? nextFontSize * 1.2;
			const textResizeMode = options.asFixedBox ? 'fixed' : (newNode.textResizeMode ?? 'auto-width');

			let createdNode: Node = newNode;
			if (options.asFixedBox) {
				const localRect = rectFromPoints(startLocal, endLocal);
				createdNode = {
					...newNode,
					position: { x: localRect.x, y: localRect.y },
					size: {
						width: Math.max(20, localRect.width),
						height: Math.max(Math.ceil(defaultLineHeight + 8), localRect.height),
					},
					textResizeMode,
				};
			} else {
				const measured = measureTextSize({
					text: nextText,
					fontSize: nextFontSize,
					fontFamily: nextFontFamily,
					fontWeight: nextFontWeight,
					textAlign: newNode.textAlign ?? 'left',
					lineHeightPx: newNode.lineHeightPx,
					letterSpacingPx: newNode.letterSpacingPx ?? 0,
					textResizeMode,
					width: newNode.size?.width,
					height: newNode.size?.height,
				});
				createdNode = {
					...newNode,
					size: measured,
					textResizeMode,
				};
			}

			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Create text',
				type: 'createNode',
				payload: {
					id: newId,
					parentId: options.parentId,
					node: createdNode,
				},
			} as Command);
			selectNode(newId);
			startTextEditing(newId, {
				isNewNode: true,
				selectAll: true,
				initialText: nextText,
				draftText: '',
			});
		},
		[document, executeCommand, getLocalPointForParent, measureTextSize, selectNode, startTextEditing],
	);

	useEffect(() => {
		if (!textEditSession) return;
		const textarea = textEditorRef.current;
		if (!textarea) return;
		textarea.focus();
		if (textEditSession.selectAllOnFocus) {
			textarea.select();
		} else {
			const end = textarea.value.length;
			textarea.setSelectionRange(end, end);
		}
	}, [textEditSession]);

	useEffect(() => {
		if (!textEditSession) return;
		const node = document.nodes[textEditSession.nodeId];
		if (!node || node.type !== 'text' || node.locked === true) {
			setTextEditSession(null);
		}
	}, [document, textEditSession]);

	const editingTextNode = textEditSession ? document.nodes[textEditSession.nodeId] : null;
	const hiddenCanvasNodeIds = useMemo(
		() => (ENABLE_TEXT_PARITY_V1 && textEditSession ? [textEditSession.nodeId] : []),
		[textEditSession],
	);
	const editingTextBounds = textEditSession ? boundsMap[textEditSession.nodeId] : null;
	const editingTextSize = useMemo(() => {
		if (!ENABLE_TEXT_PARITY_V1 || !textEditSession) return null;
		if (!editingTextNode || editingTextNode.type !== 'text') return null;
		const measured = measureTextSize({
			text: textEditSession.draftText,
			fontSize: editingTextNode.fontSize ?? 16,
			fontFamily: editingTextNode.fontFamily ?? 'Inter, sans-serif',
			fontWeight: editingTextNode.fontWeight ?? 'normal',
			textAlign: editingTextNode.textAlign ?? 'left',
			lineHeightPx: editingTextNode.lineHeightPx,
			letterSpacingPx: editingTextNode.letterSpacingPx ?? 0,
			textResizeMode: editingTextNode.textResizeMode ?? 'auto-width',
			width: editingTextNode.size.width,
			height: editingTextNode.size.height,
		});
		const mode = editingTextNode.textResizeMode ?? 'auto-width';
		if (mode === 'fixed') {
			return {
				width: Math.max(1, editingTextNode.size.width),
				height: Math.max(1, editingTextNode.size.height),
			};
		}
		if (mode === 'auto-height') {
			return {
				width: Math.max(1, editingTextNode.size.width),
				height: Math.max(1, measured.height),
			};
		}
		return measured;
	}, [editingTextNode, measureTextSize, textEditSession]);
	const editingTextScreenRect = useMemo(() => {
		if (!editingTextBounds || !editingTextSize) return null;
		return {
			left: editingTextBounds.x * zoom + panOffset.x + canvasViewportOffset.x,
			top: editingTextBounds.y * zoom + panOffset.y + canvasViewportOffset.y,
			width: editingTextSize.width * zoom,
			height: editingTextSize.height * zoom,
		};
	}, [canvasViewportOffset.x, canvasViewportOffset.y, editingTextBounds, editingTextSize, panOffset.x, panOffset.y, zoom]);
	const activeTextEditSelectionBounds = useMemo(() => {
		if (!ENABLE_TEXT_PARITY_V1 || !textEditSession) return null;
		if (!editingTextBounds || !editingTextNode || editingTextNode.type !== 'text') return null;
		const effectiveLineHeight = Math.max(1, editingTextNode.lineHeightPx ?? (editingTextNode.fontSize ?? 16) * 1.2);
		return {
			x: editingTextBounds.x,
			y: editingTextBounds.y,
			width: Math.max(1, editingTextSize?.width ?? editingTextNode.size.width),
			height: Math.max(1, effectiveLineHeight + 8),
		};
	}, [editingTextBounds, editingTextNode, editingTextSize, textEditSession]);
	const canvasSelectionBounds = activeTextEditSelectionBounds ?? selectionBounds;
	const editingTextColor =
		editingTextNode?.type === 'text' && editingTextNode.fill?.type === 'solid' ? editingTextNode.fill.value : '#f5f5f5';
	const selectedTextOverflow = useMemo(() => {
		if (!ENABLE_TEXT_PARITY_V1 || !selectedNode || selectedNode.type !== 'text') return null;
		if ((selectedNode.textResizeMode ?? 'auto-width') !== 'fixed') {
			return { isOverflowing: false };
		}
		const measured = measureTextSize({
			text: selectedNode.text ?? '',
			fontSize: selectedNode.fontSize ?? 16,
			fontFamily: selectedNode.fontFamily ?? 'Inter, sans-serif',
			fontWeight: selectedNode.fontWeight ?? 'normal',
			textAlign: selectedNode.textAlign ?? 'left',
			lineHeightPx: selectedNode.lineHeightPx,
			letterSpacingPx: selectedNode.letterSpacingPx ?? 0,
			textResizeMode: 'auto-height',
			width: selectedNode.size.width,
			height: selectedNode.size.height,
		});
		return {
			isOverflowing: measured.height > selectedNode.size.height + 0.5,
		};
	}, [measureTextSize, selectedNode]);
	const selectedTextOverflowIndicatorNodeIds = useMemo(() => {
		if (!selectedNode || selectedNode.type !== 'text') return [];
		if (!selectedTextOverflow?.isOverflowing) return [];
		return [selectedNode.id];
	}, [selectedNode, selectedTextOverflow]);

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
			setVectorHover(null);
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
				if (ENABLE_VECTOR_EDIT_V1 && info.detail >= 2) {
					const hit = hitTestAtPoint(worldX, worldY);
					if (hit?.node.type === 'path') {
						const selectedBooleanId =
							selectedIds.length === 1 && document.nodes[selectedIds[0]]?.type === 'boolean' ? selectedIds[0] : null;
						const selectedBoolean = selectedBooleanId ? document.nodes[selectedBooleanId] : null;
						const isolatedOperandId =
							selectedBoolean?.type === 'boolean' ? selectedBoolean.booleanData?.isolationOperandId : undefined;
						if (isolatedOperandId && isolatedOperandId === hit.node.id) {
							setVectorEditSession({ pathId: hit.node.id, selectedPointId: null });
							setVectorHover(null);
							return;
						}
						selectNode(hit.node.id);
						setVectorEditSession({ pathId: hit.node.id, selectedPointId: null });
						setVectorHover(null);
						return;
					}
				}
				if (ENABLE_TEXT_PARITY_V1 && info.detail >= 2) {
					const hit = hitTestAtPoint(worldX, worldY);
					if (hit?.node.type === 'text' && !hit.locked) {
						startTextEditing(hit.node.id, { selectAll: false });
						return;
					}
				}

				if (isVectorEditActive && editablePathId) {
					const pathNode = document.nodes[editablePathId];
					const pathBounds = boundsMap[editablePathId];
					if (pathNode?.type === 'path' && pathBounds && pathNode.vector) {
						const handleHit = hitTestVectorBezierHandle(
							screenX,
							screenY,
							vectorBezierHandles,
							view,
							VECTOR_HANDLE_HIT_SIZE,
						);
						if (handleHit) {
							const point = pathNode.vector.points.find((entry) => entry.id === handleHit.pointId);
							if (!point) return;
							const draggedValue =
								handleHit.kind === 'in'
									? point.inHandle ?? { x: point.x, y: point.y }
									: point.outHandle ?? { x: point.x, y: point.y };
							setVectorEditSession({ pathId: editablePathId, selectedPointId: point.id });
							setDragState({
								mode: 'vectorHandle',
								pathId: editablePathId,
								pointId: point.id,
								handle: handleHit.kind,
								draggedValue,
								altKey: info.altKey,
							});
							return;
						}

						const anchorHit = hitTestVectorAnchor(screenX, screenY, vectorAnchors, view, VECTOR_ANCHOR_HIT_SIZE);
						if (anchorHit) {
							const point = pathNode.vector.points.find((entry) => entry.id === anchorHit.pointId);
							if (!point) return;
							setVectorEditSession({ pathId: editablePathId, selectedPointId: point.id });
							setDragState({
								mode: 'vectorAnchor',
								pathId: editablePathId,
								pointId: point.id,
								startPoint: { x: point.x, y: point.y },
							});
							return;
						}

						const segmentHit = hitTestVectorSegment(
							screenX,
							screenY,
							pathNode.vector.points,
							pathNode.vector.closed,
							{ x: pathBounds.x, y: pathBounds.y },
							view,
							VECTOR_SEGMENT_HIT_SIZE,
						);
						if (segmentHit) {
							const pointId = generateId();
							executeCommand({
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Insert vector point',
								type: 'addVectorPoint',
								payload: {
									id: editablePathId,
									afterPointId: segmentHit.fromPointId,
									point: {
										id: pointId,
										x: segmentHit.x - pathBounds.x,
										y: segmentHit.y - pathBounds.y,
										cornerMode: 'sharp',
									},
								},
							} as Command);
							setVectorEditSession({ pathId: editablePathId, selectedPointId: pointId });
							return;
						}
					}
				}

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
				if (ENABLE_TEXT_PARITY_V1 && info.detail >= 2) {
					const hit = hitTestAtPoint(worldX, worldY);
					if (hit?.node.type === 'text' && !hit.locked) {
						setActiveTool('select');
						startTextEditing(hit.node.id, { selectAll: false });
						return;
					}
				}

				if (selectionBounds && selectionIds.length === 1) {
					const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
					if (handle) {
						setActiveTool('select');
						handleSelectionPointerDown(info);
						return;
					}
				}

				const parentId = getInsertionParentId(worldX, worldY);
				setTextCreationDragState({
					startWorld: { x: worldX, y: worldY },
					currentWorld: { x: worldX, y: worldY },
					parentId,
					active: true,
				});
				return;
			}

			if (activeTool === 'pen' && ENABLE_VECTOR_EDIT_V1) {
				const activePathId = (() => {
					if (penSession?.pathId && document.nodes[penSession.pathId]?.type === 'path') {
						return penSession.pathId;
					}
					if (editablePathId && document.nodes[editablePathId]?.type === 'path') {
						return editablePathId;
					}
					return null;
				})();

				const activePathNode = activePathId ? document.nodes[activePathId] : null;
				const activePathBounds = activePathId ? boundsMap[activePathId] : null;
				if (activePathNode?.type === 'path' && activePathBounds && activePathNode.vector) {
					const points = activePathNode.vector.points;
					const firstAnchor =
						points.length > 0 ? { x: activePathBounds.x + points[0].x, y: activePathBounds.y + points[0].y } : null;
					if (firstAnchor && !activePathNode.vector.closed && points.length >= 3) {
						const firstAnchorHit = hitTestVectorAnchor(
							screenX,
							screenY,
							[
								{
									id: `anchor:${points[0].id}`,
									pointId: points[0].id,
									x: firstAnchor.x,
									y: firstAnchor.y,
									isFirst: true,
									isSelected: false,
									isHovered: false,
								},
							],
							view,
							VECTOR_ANCHOR_HIT_SIZE + 2,
						);
						if (firstAnchorHit) {
							toggleVectorClosed(activePathNode.id, true);
							setPenSession({
								pathId: activePathNode.id,
								parentId: documentParentMap[activePathNode.id] ?? document.rootId,
								lastPointId: points[0].id,
							});
							setVectorEditSession({ pathId: activePathNode.id, selectedPointId: points[0].id });
							return;
						}
					}

					const lastPoint = points[points.length - 1];
					const lastWorld = lastPoint
						? { x: activePathBounds.x + lastPoint.x, y: activePathBounds.y + lastPoint.y }
						: null;
					const constrained = info.shiftKey && lastWorld ? constrainWorldPoint45(lastWorld, { x: worldX, y: worldY }) : { x: worldX, y: worldY };
					const localPoint = {
						x: constrained.x - activePathBounds.x,
						y: constrained.y - activePathBounds.y,
					};
					const pointId = generateId();
					executeCommand({
						id: generateId(),
						timestamp: Date.now(),
						source: 'user',
						description: 'Add vector point',
						type: 'addVectorPoint',
						payload: {
							id: activePathNode.id,
							point: { id: pointId, x: localPoint.x, y: localPoint.y, cornerMode: 'sharp' },
							afterPointId: lastPoint?.id,
						},
					} as Command);
					setPenSession({
						pathId: activePathNode.id,
						parentId: documentParentMap[activePathNode.id] ?? document.rootId,
						lastPointId: pointId,
					});
					setVectorEditSession({ pathId: activePathNode.id, selectedPointId: pointId });
					setDragState({
						mode: 'penHandle',
						pathId: activePathNode.id,
						pointId,
						startScreen: { x: screenX, y: screenY },
						anchorLocal: localPoint,
						currentOut: localPoint,
						altKey: info.altKey,
					});
					return;
				}

				const parentId = getInsertionParentId(worldX, worldY);
				const localPoint = getLocalPointForParent(parentId, worldX, worldY);
				const tool = createPenTool(parentId);
				const result = tool.handleMouseDown(document, localPoint.x, localPoint.y, []);
				if (!result) return;
				const newIds = Object.keys(result.nodes).filter((id) => !(id in document.nodes));
				const newId = newIds[0];
				const newNode = newId ? result.nodes[newId] : null;
				if (!newId || !newNode || newNode.type !== 'path') return;
				executeCommand({
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					description: 'Create path',
					type: 'createNode',
					payload: {
						id: newId,
						parentId,
						node: newNode,
					},
				} as Command);
				const firstPointId = newNode.vector?.points?.[0]?.id ?? null;
				setPenSession({
					pathId: newId,
					parentId,
					lastPointId: firstPointId ?? generateId(),
				});
				if (firstPointId) {
					setVectorEditSession({ pathId: newId, selectedPointId: firstPointId });
					setDragState({
						mode: 'penHandle',
						pathId: newId,
						pointId: firstPointId,
						startScreen: { x: screenX, y: screenY },
						anchorLocal: { x: 0, y: 0 },
						currentOut: { x: 0, y: 0 },
						altKey: info.altKey,
					});
				}
				selectNode(newId);
				return;
			}
		},
		[
			activeTool,
			boundsMap,
			document,
			documentParentMap,
			editablePathId,
			executeCommand,
			hitTestAtPoint,
			handleSelectionPointerDown,
			isVectorEditActive,
			penSession,
			selectedIds,
			selectionIds,
			selectionBounds,
			toggleVectorClosed,
			vectorAnchors,
			vectorBezierHandles,
			selectNode,
			setActiveTool,
			startTextEditing,
			view,
			transformSession,
			openContextMenuAt,
			spaceKeyHeld,
			panOffset,
			getInsertionParentId,
			getLocalPointForParent,
			setTextCreationDragState,
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

			if (textCreationDragState?.active) {
				setTextCreationDragState((current) =>
					current
						? {
								...current,
								currentWorld: { x: worldX, y: worldY },
							}
						: current,
				);
				return;
			}

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

			if (dragState?.mode === 'vectorAnchor') {
				const pathBounds = boundsMap[dragState.pathId];
				if (!pathBounds) return;
				const nextLocal = { x: worldX - pathBounds.x, y: worldY - pathBounds.y };
				setPreviewDocument(
					applyVectorPointPreview(document, dragState.pathId, dragState.pointId, (point) => ({
						...point,
						x: nextLocal.x,
						y: nextLocal.y,
					})),
				);
				return;
			}

			if (dragState?.mode === 'vectorHandle') {
				const pathBounds = boundsMap[dragState.pathId];
				const pathNode = document.nodes[dragState.pathId];
				if (!pathBounds || pathNode?.type !== 'path' || !pathNode.vector) return;
				const point = pathNode.vector.points.find((entry) => entry.id === dragState.pointId);
				if (!point) return;
				const anchorWorld = { x: pathBounds.x + point.x, y: pathBounds.y + point.y };
				const constrainedWorld = info.shiftKey ? constrainWorldPoint45(anchorWorld, { x: worldX, y: worldY }) : { x: worldX, y: worldY };
				const nextLocal = { x: constrainedWorld.x - pathBounds.x, y: constrainedWorld.y - pathBounds.y };
				const mirror = !info.altKey;
				const mirrored = mirror
					? { x: point.x - (nextLocal.x - point.x), y: point.y - (nextLocal.y - point.y) }
					: undefined;
				const opposite = dragState.handle === 'in' ? 'outHandle' : 'inHandle';
				setDragState({
					...dragState,
					draggedValue: nextLocal,
					mirroredValue: mirrored,
					altKey: info.altKey,
				});
				setPreviewDocument(
					applyVectorPointPreview(document, dragState.pathId, dragState.pointId, (entry) => ({
						...entry,
						...(dragState.handle === 'in' ? { inHandle: nextLocal } : { outHandle: nextLocal }),
						...(mirrored ? { [opposite]: mirrored } : {}),
					})),
				);
				return;
			}

			if (dragState?.mode === 'penHandle') {
				const pathBounds = boundsMap[dragState.pathId];
				if (!pathBounds) return;
				const anchorWorld = {
					x: pathBounds.x + dragState.anchorLocal.x,
					y: pathBounds.y + dragState.anchorLocal.y,
				};
				const constrainedWorld = info.shiftKey ? constrainWorldPoint45(anchorWorld, { x: worldX, y: worldY }) : { x: worldX, y: worldY };
				const outLocal = { x: constrainedWorld.x - pathBounds.x, y: constrainedWorld.y - pathBounds.y };
				const inLocal = info.altKey
					? undefined
					: {
							x: dragState.anchorLocal.x - (outLocal.x - dragState.anchorLocal.x),
							y: dragState.anchorLocal.y - (outLocal.y - dragState.anchorLocal.y),
						};
				setDragState({
					...dragState,
					currentOut: outLocal,
					currentIn: inLocal,
					altKey: info.altKey,
				});
				setPreviewDocument(
					applyVectorPointPreview(document, dragState.pathId, dragState.pointId, (point) => ({
						...point,
						outHandle: outLocal,
						inHandle: inLocal,
						cornerMode: info.altKey ? 'disconnected' : 'mirrored',
					})),
				);
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

			const canHoverVectors =
				(isVectorEditActive || activeTool === 'pen') &&
				editablePathNode?.type === 'path' &&
				Boolean(editablePathBounds) &&
				Boolean(editablePathNode.vector);
			if (canHoverVectors && editablePathBounds && editablePathNode.type === 'path' && editablePathNode.vector) {
				const handleHit = hitTestVectorBezierHandle(
					screenX,
					screenY,
					vectorBezierHandles,
					view,
					VECTOR_HANDLE_HIT_SIZE,
				);
				if (handleHit) {
					const nextHover: VectorHover = { kind: 'handle', pointId: handleHit.pointId, handle: handleHit.kind };
					if (
						vectorHover?.kind !== 'handle' ||
						vectorHover.pointId !== handleHit.pointId ||
						vectorHover.handle !== handleHit.kind
					) {
						setVectorHover(nextHover);
					}
					if (hoverHit) setHoverHit(null);
					return;
				}

				const anchorHit = hitTestVectorAnchor(screenX, screenY, vectorAnchors, view, VECTOR_ANCHOR_HIT_SIZE);
				if (anchorHit) {
					if (vectorHover?.kind !== 'anchor' || vectorHover.pointId !== anchorHit.pointId) {
						setVectorHover({ kind: 'anchor', pointId: anchorHit.pointId });
					}
					if (hoverHit) setHoverHit(null);
					return;
				}

				if (isVectorEditActive) {
					const segmentHit = hitTestVectorSegment(
						screenX,
						screenY,
						editablePathNode.vector.points,
						editablePathNode.vector.closed,
						{ x: editablePathBounds.x, y: editablePathBounds.y },
						view,
						VECTOR_SEGMENT_HIT_SIZE,
					);
					if (segmentHit) {
						const nextHover: VectorHover = {
							kind: 'segment',
							fromPointId: segmentHit.fromPointId,
							toPointId: segmentHit.toPointId,
							x: segmentHit.x,
							y: segmentHit.y,
						};
						if (
							vectorHover?.kind !== 'segment' ||
							vectorHover.fromPointId !== segmentHit.fromPointId ||
							vectorHover.toPointId !== segmentHit.toPointId ||
							Math.abs(vectorHover.x - segmentHit.x) > 0.01 ||
							Math.abs(vectorHover.y - segmentHit.y) > 0.01
						) {
							setVectorHover(nextHover);
						}
						if (hoverHit) setHoverHit(null);
						return;
					}
				}
			}

			if (vectorHover) {
				setVectorHover(null);
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
			boundsMap,
			document,
			documentParentMap,
			dragState,
			editablePathBounds,
			editablePathNode,
			getEdgeCursorForNode,
			getLayoutGuideTargetsForParent,
			hoverHit,
			hoverHandle,
			hitTestAtPoint,
			isVectorEditActive,
			parentMap,
			selectionBounds,
			selectionIds,
			setSelection,
			snapDisabled,
			transformSession,
			vectorAnchors,
			vectorBezierHandles,
			vectorHover,
			view,
			zoom,
			displayDocument,
			textCreationDragState,
		],
	);

	const handleCanvasMouseUp = useCallback(
		(info: CanvasPointerInfo) => {
			if (textCreationDragState?.active) {
				const dx = info.worldX - textCreationDragState.startWorld.x;
				const dy = info.worldY - textCreationDragState.startWorld.y;
				const dragDistancePx = Math.hypot(dx, dy) * (zoom === 0 ? 1 : zoom);
				const asFixedBox = dragDistancePx >= TEXT_CREATE_DRAG_SLOP_PX;
				createTextNodeAndStartEditing({
					parentId: textCreationDragState.parentId,
					worldStart: textCreationDragState.startWorld,
					worldEnd: { x: info.worldX, y: info.worldY },
					asFixedBox,
				});
				setTextCreationDragState(null);
				setSnapGuides([]);
				setHoverHandle(null);
				setHoverHit(null);
				return;
			}

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

			if (dragState.mode === 'vectorAnchor') {
				const pathBounds = boundsMap[dragState.pathId];
				if (pathBounds) {
					const nextLocal = { x: info.worldX - pathBounds.x, y: info.worldY - pathBounds.y };
					const changed =
						Math.abs(nextLocal.x - dragState.startPoint.x) > 0.01 || Math.abs(nextLocal.y - dragState.startPoint.y) > 0.01;
					if (changed) {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Move vector point',
							type: 'moveVectorPoint',
							payload: {
								id: dragState.pathId,
								pointId: dragState.pointId,
								x: nextLocal.x,
								y: nextLocal.y,
							},
						} as Command);
					}
				}
				setPreviewDocument(null);
				setDragState(null);
				setSnapGuides([]);
				return;
			}

			if (dragState.mode === 'vectorHandle') {
				const pathNode = document.nodes[dragState.pathId];
				if (pathNode?.type === 'path' && pathNode.vector) {
					const point = pathNode.vector.points.find((entry) => entry.id === dragState.pointId);
					if (point) {
						const currentHandle = dragState.handle === 'in' ? point.inHandle : point.outHandle;
						const changed =
							!currentHandle ||
							Math.abs(currentHandle.x - dragState.draggedValue.x) > 0.01 ||
							Math.abs(currentHandle.y - dragState.draggedValue.y) > 0.01;
						const commands: Command[] = [];
						if (changed) {
							commands.push({
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Set vector handle',
								type: 'setVectorHandle',
								payload: {
									id: dragState.pathId,
									pointId: dragState.pointId,
									handle: dragState.handle,
									value: dragState.draggedValue,
								},
							});
						}
						if (dragState.mirroredValue) {
							const opposite: 'in' | 'out' = dragState.handle === 'in' ? 'out' : 'in';
							commands.push({
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Mirror vector handle',
								type: 'setVectorHandle',
								payload: {
									id: dragState.pathId,
									pointId: dragState.pointId,
									handle: opposite,
									value: dragState.mirroredValue,
								},
							});
						}
						if (commands.length === 1) {
							executeCommand(commands[0]);
						} else if (commands.length > 1) {
							executeCommand({
								id: generateId(),
								timestamp: Date.now(),
								source: 'user',
								description: 'Update vector handles',
								type: 'batch',
								payload: { commands },
							} as Command);
						}
					}
				}
				setPreviewDocument(null);
				setDragState(null);
				setSnapGuides([]);
				return;
			}

			if (dragState.mode === 'penHandle') {
				const dragDistance = Math.hypot(info.screenX - dragState.startScreen.x, info.screenY - dragState.startScreen.y);
				if (dragDistance >= VECTOR_DRAG_SLOP_PX) {
					const commands: Command[] = [
						{
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Set pen handle',
							type: 'setVectorHandle',
							payload: {
								id: dragState.pathId,
								pointId: dragState.pointId,
								handle: 'out',
								value: dragState.currentOut,
							},
						},
					];
					if (dragState.currentIn) {
						commands.push({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Set pen mirror handle',
							type: 'setVectorHandle',
							payload: {
								id: dragState.pathId,
								pointId: dragState.pointId,
								handle: 'in',
								value: dragState.currentIn,
							},
						});
					}
					if (commands.length === 1) {
						executeCommand(commands[0] as Command);
					} else {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Create curve handles',
							type: 'batch',
							payload: { commands: commands as Command[] },
						} as Command);
					}
				}
				setPreviewDocument(null);
				setDragState(null);
				setSnapGuides([]);
				return;
			}

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
			textCreationDragState,
			snapDisabled,
			zoom,
			createTextNodeAndStartEditing,
			executeCommand,
			document,
			parentMap,
			boundsMap,
			documentParentMap,
			getLayoutGuideTargetsForParent,
			setTextCreationDragState,
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
				const hasLineHeightUpdate = Object.prototype.hasOwnProperty.call(updates, 'lineHeightPx');
				const hasLetterSpacingUpdate = Object.prototype.hasOwnProperty.call(updates, 'letterSpacingPx');
				const hasTextAlignUpdate = Object.prototype.hasOwnProperty.call(updates, 'textAlign');
				const hasResizeModeUpdate = Object.prototype.hasOwnProperty.call(updates, 'textResizeMode');
				const hasSizeUpdate = Object.prototype.hasOwnProperty.call(updates, 'size');

				const nextLineHeightPx = hasLineHeightUpdate
					? typeof updates.lineHeightPx === 'number'
						? updates.lineHeightPx
						: undefined
					: current.lineHeightPx;
				const nextLetterSpacingPx = hasLetterSpacingUpdate
					? typeof updates.letterSpacingPx === 'number'
						? updates.letterSpacingPx
						: 0
					: (current.letterSpacingPx ?? 0);
				const nextTextAlign =
					typeof updates.textAlign === 'string'
						? (updates.textAlign as Node['textAlign'])
						: (current.textAlign ?? 'left');
				const nextResizeMode =
					typeof updates.textResizeMode === 'string'
						? (updates.textResizeMode as Node['textResizeMode'])
						: (current.textResizeMode ?? 'auto-width');
				const requestedSize =
					(nextUpdates as Partial<Node>).size && typeof (nextUpdates as Partial<Node>).size === 'object'
						? ((nextUpdates as Partial<Node>).size as Node['size'])
						: undefined;
				const baseWidth = typeof requestedSize?.width === 'number' ? requestedSize.width : current.size.width;
				const baseHeight = typeof requestedSize?.height === 'number' ? requestedSize.height : current.size.height;

				if (
					Object.prototype.hasOwnProperty.call(updates, 'text') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontSize') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontFamily') ||
					Object.prototype.hasOwnProperty.call(updates, 'fontWeight') ||
					hasTextAlignUpdate ||
					hasLineHeightUpdate ||
					hasLetterSpacingUpdate ||
					hasResizeModeUpdate ||
					hasSizeUpdate
				) {
					const measured = measureTextSize({
						text: nextText,
						fontSize: nextFontSize,
						fontFamily: nextFontFamily,
						fontWeight: nextFontWeight,
						textAlign: nextTextAlign,
						lineHeightPx: nextLineHeightPx,
						letterSpacingPx: nextLetterSpacingPx,
						textResizeMode: nextResizeMode,
						width: baseWidth,
						height: baseHeight,
					});

					let nextSize = requestedSize;
					if (nextResizeMode === 'auto-width') {
						nextSize = measured;
					} else if (nextResizeMode === 'auto-height') {
						nextSize = { width: Math.max(1, Math.ceil(baseWidth)), height: measured.height };
					}

					if (nextSize) {
						nextUpdates = {
							...updates,
							size: nextSize,
						};
					}
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

	const commitTextEditing = useCallback(() => {
		if (!ENABLE_TEXT_PARITY_V1 || !textEditSession) return;
		const session = textEditSession;
		const node = document.nodes[session.nodeId];
		textEditorIsComposingRef.current = false;
		setTextEditSession(null);
		if (!node || node.type !== 'text') {
			return;
		}

		const nextText = session.draftText;
		const isEmpty = nextText.trim().length === 0;
		if (session.isNewNode && isEmpty) {
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Delete empty text',
				type: 'deleteNode',
				payload: { id: node.id },
			} as Command);
			setSelection([]);
			return;
		}

		if (nextText !== (node.text ?? '')) {
			handleUpdateNode(node.id, { text: nextText });
		}
	}, [document, executeCommand, handleUpdateNode, setSelection, textEditSession]);

	const cancelTextEditing = useCallback(() => {
		if (!ENABLE_TEXT_PARITY_V1 || !textEditSession) return;
		const session = textEditSession;
		const node = document.nodes[session.nodeId];
		textEditorIsComposingRef.current = false;
		setTextEditSession(null);
		if (session.isNewNode && node) {
			executeCommand({
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				description: 'Cancel text edit',
				type: 'deleteNode',
				payload: { id: session.nodeId },
			} as Command);
			setSelection([]);
		}
	}, [document, executeCommand, setSelection, textEditSession]);

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

	const persistDraftIfNeeded = useCallback(async () => {
		if (appView !== 'editor' || !isDirty) {
			return;
		}
		await saveDraftSnapshot({
			key: buildDraftKey(currentPath),
			path: currentPath,
			content: serializeDocument(document),
		});
	}, [appView, currentPath, document, isDirty, saveDraftSnapshot]);

	const flushDraftNow = useCallback(() => {
		void persistDraftIfNeeded();
	}, [persistDraftIfNeeded]);

	const persistCurrentWorkBeforeNavigation = useCallback(async () => {
		if (appView !== 'editor' || !isDirty) {
			return;
		}

		const content = serializeDocument(document);

		if (currentPath) {
			try {
				await invoke('save_document', {
					args: {
						path: currentPath,
						content,
					},
				});
				await deleteDraftByKey(buildDraftKey(currentPath));
				return;
			} catch (error) {
				console.warn('Failed to save current project before navigation; falling back to draft', error);
			}
		}

		await saveDraftSnapshot({
			key: buildDraftKey(currentPath),
			path: currentPath,
			content,
		});
	}, [
		appView,
		currentPath,
		deleteDraftByKey,
		document,
		isDirty,
		saveDraftSnapshot,
	]);

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

	const tryRestoreDraftForPath = useCallback(
		async (path: string): Promise<boolean> => {
			try {
				const key = buildDraftKey(path);
				const draft = await invoke<DraftPayload | null>('load_draft', { args: { key } });
				if (!draft?.content) {
					return false;
				}

				const fileMtime = await invoke<number | null>('get_file_mtime', { path });
				if (fileMtime !== null && draft.savedAtMs <= fileMtime) {
					return false;
				}

				const restore = window.confirm('A newer recovered draft exists for this file. Restore it?');
				if (!restore) {
					return false;
				}

				const parsed = parseDocumentText(draft.content);
				if (!parsed.ok) {
					alert(`Failed to restore draft: ${parsed.error}`);
					return false;
				}

				applyLoadedDocument(parsed.doc, path);
				markDirty();
				return true;
			} catch (error) {
				console.warn('Failed to restore project draft', error);
				return false;
			}
		},
		[applyLoadedDocument, markDirty],
	);

	const openProjectPath = useCallback(
		async (path: string) => {
			await persistCurrentWorkBeforeNavigation();
			const restored = await tryRestoreDraftForPath(path);
			if (restored) {
				registerProjectOpened(path);
				setAppView('editor');
				return true;
			}
			const ok = await loadDocumentFromPath(path);
			if (!ok) return false;
			registerProjectOpened(path);
			setAppView('editor');
			return true;
		},
		[loadDocumentFromPath, persistCurrentWorkBeforeNavigation, registerProjectOpened, tryRestoreDraftForPath],
	);

	const handleCreateProject = useCallback(async () => {
		await persistCurrentWorkBeforeNavigation();
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
	}, [applyLoadedDocument, ensureGalileoExtension, persistCurrentWorkBeforeNavigation, registerProjectOpened]);

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
		void (async () => {
			await persistCurrentWorkBeforeNavigation();
			setContextMenu(null);
			setActivePlugin(null);
			setPluginManagerOpen(false);
			setAppView('projects');
		})();
	}, [persistCurrentWorkBeforeNavigation]);

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
			const previousPath = currentPath;
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
			const keysToClear = new Set([buildDraftKey(previousPath), buildDraftKey(path)]);
			await Promise.all(Array.from(keysToClear).map((key) => deleteDraftByKey(key)));
			alert('Document saved successfully!');
		} catch (error) {
			console.error('Save error:', error);
			alert('Failed to save document');
		}
	}, [currentPath, deleteDraftByKey, document, ensureGalileoExtension, markSaved, registerProjectOpened]);

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
		setVectorHover(null);
	}, [selectionIds]);

	useEffect(() => {
		if (activeTool !== 'pen') {
			setPenSession(null);
		}
		if (activeTool !== 'select') {
			setVectorEditSession(null);
			setVectorHover(null);
		}
	}, [activeTool]);

	useEffect(() => {
		const title = `${fileName}${isDirty ? ' *' : ''} - Galileo`;
		window.document.title = title;
	}, [fileName, isDirty]);

	useEffect(() => {
		if (appView !== 'editor' || !isDirty) {
			return;
		}

		const handle = window.setTimeout(() => {
			void saveDraftSnapshot({
				key: buildDraftKey(currentPath),
				path: currentPath,
				content: serializeDocument(document),
			});
		}, AUTOSAVE_DELAY_MS);

		return () => window.clearTimeout(handle);
	}, [appView, currentPath, document, isDirty, saveDraftSnapshot]);

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
		const onBlur = () => {
			flushDraftNow();
		};
		window.addEventListener('blur', onBlur);
		return () => window.removeEventListener('blur', onBlur);
	}, [flushDraftNow]);

	useEffect(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!isDirty) return;
			flushDraftNow();
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', beforeUnload);
		return () => window.removeEventListener('beforeunload', beforeUnload);
	}, [flushDraftNow, isDirty]);

	useEffect(() => {
		let cancelled = false;

		const migrateLegacyAutosave = async () => {
			const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
			if (!raw) return;

			try {
				const parsed = JSON.parse(raw) as { content?: string; path?: string; timestamp?: number };
				if (!parsed.content) return;
				await saveDraftSnapshot({
					key: buildDraftKey(parsed.path ?? null),
					path: parsed.path ?? null,
					content: parsed.content,
				});
			} catch (error) {
				console.warn('Failed to migrate legacy autosave', error);
			} finally {
				localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
			}
		};

		const restoreUntitledDraft = async () => {
			try {
				const draft = await invoke<DraftPayload | null>('load_draft', {
					args: { key: UNTITLED_DRAFT_KEY },
				});
				if (!draft?.content || cancelled) {
					return;
				}

				const confirmed = window.confirm('Recovered unsaved changes were found. Restore them?');
				if (!confirmed || cancelled) {
					return;
				}

				const result = parseDocumentText(draft.content);
				if (!result.ok) {
					console.warn('Recovered draft is invalid', result.error);
					return;
				}

				applyLoadedDocument(result.doc, draft.path ?? null);
				markDirty();
				setAppView('editor');
			} catch (error) {
				console.warn('Failed to restore draft', error);
			}
		};

		void (async () => {
			await migrateLegacyAutosave();
			if (!cancelled) {
				await restoreUntitledDraft();
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [applyLoadedDocument, markDirty, saveDraftSnapshot]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const editable = isEditableTarget(e.target);
			const hasSelection = selectionIds.length > 0;
			const isCmd = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			const isEditorView = appView === 'editor';
			const isComposing = e.isComposing || textEditorIsComposingRef.current;

			if (ENABLE_TEXT_PARITY_V1 && textCreationDragState?.active && e.key === 'Escape') {
				e.preventDefault();
				setTextCreationDragState(null);
				setActiveTool('select');
				return;
			}

			if (ENABLE_TEXT_PARITY_V1 && textEditSession) {
				if (!isComposing && e.key === 'Escape') {
					e.preventDefault();
					suppressTextEditorBlurCommitRef.current = true;
					cancelTextEditing();
					return;
				}
				if (!isComposing && e.key === 'Enter') {
					e.preventDefault();
					suppressTextEditorBlurCommitRef.current = true;
					commitTextEditing();
					return;
				}
				if (!isComposing && isCmd && e.key === 'Enter') {
					e.preventDefault();
					suppressTextEditorBlurCommitRef.current = true;
					commitTextEditing();
					return;
				}
				if (isCmd && key === 's') {
					e.preventDefault();
					handleSave();
					return;
				}
				return;
			}

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
				if (activeTool === 'pen' && penSession) {
					e.preventDefault();
					const path = document.nodes[penSession.pathId];
					const pointCount = path?.type === 'path' ? path.vector?.points.length ?? 0 : 0;
					if (pointCount < 2) {
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Delete short path',
							type: 'deleteNode',
							payload: { id: penSession.pathId },
						} as Command);
						setSelection([]);
					}
					setPenSession(null);
					setPreviewDocument(null);
					setDragState(null);
					setVectorHover(null);
					return;
				}
				if (vectorEditSession) {
					e.preventDefault();
					setVectorEditSession(null);
					setVectorHover(null);
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

				const singleSelectedNode = selectionIds.length === 1 ? document.nodes[selectionIds[0]] : null;
				if (singleSelectedNode?.type === 'text') {
					if (isCmd && key === 'b') {
						e.preventDefault();
						const nextWeight = singleSelectedNode.fontWeight === 'bold' ? 'normal' : 'bold';
						handleUpdateNode(singleSelectedNode.id, { fontWeight: nextWeight });
						return;
					}
					if (isCmd && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {
						e.preventDefault();
						const currentFontSize = singleSelectedNode.fontSize ?? 16;
						const delta = e.code === 'Period' ? 1 : -1;
						const nextFontSize = Math.max(1, Math.round(currentFontSize + delta));
						handleUpdateNode(singleSelectedNode.id, { fontSize: nextFontSize });
						return;
					}
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
					if (activeTool === 'pen' && penSession) {
						e.preventDefault();
						setPenSession(null);
						setPreviewDocument(null);
						setDragState((current) => (current?.mode === 'penHandle' ? null : current));
						setVectorHover(null);
						return;
					}
					if (selectionIds.length !== 1) return;
					const target = document.nodes[selectionIds[0]];
					if (ENABLE_TEXT_PARITY_V1 && target?.type === 'text') {
						e.preventDefault();
						startTextEditing(target.id, { selectAll: false });
						return;
					}
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
					if (vectorEditSession?.selectedPointId) {
						e.preventDefault();
						executeCommand({
							id: generateId(),
							timestamp: Date.now(),
							source: 'user',
							description: 'Delete vector point',
							type: 'deleteVectorPoint',
							payload: {
								id: vectorEditSession.pathId,
								pointId: vectorEditSession.selectedPointId,
							},
						} as Command);
						setVectorEditSession((current) => (current ? { ...current, selectedPointId: null } : current));
						return;
					}
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
				if (key === 'v') setActiveTool('select');
				if (key === 'h') setActiveTool('hand');
				if (key === 'f') setActiveTool('frame');
				if (key === 'r') setActiveTool('rectangle');
				if (key === 't') setActiveTool('text');
				if (ENABLE_VECTOR_EDIT_V1 && key === 'p') setActiveTool('pen');

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
		executeCommand,
		copySelectionToClipboard,
		copyEffects,
		pasteEffects,
		handleUpdateNode,
		commitTextEditing,
		cancelTextEditing,
		startTextEditing,
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
		textEditSession,
		textCreationDragState,
		penSession,
		vectorEditSession,
		setTextCreationDragState,
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
		if (tool !== 'pen') {
			setPenSession(null);
		}
		if (tool !== 'select') {
			setVectorEditSession(null);
		}
		if (tool !== 'text') {
			setTextCreationDragState(null);
		}
		setVectorHover(null);
		setActiveTool(tool as 'select' | 'hand' | 'frame' | 'rectangle' | 'text' | 'pen');
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
				background: '#2C2C2C',
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
				data-tauri-drag-region
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
								selectionBounds={canvasSelectionBounds}
								hoverBounds={hoverBounds}
								showHandles={selectionIds.length > 0 && !textEditSession}
								hoverHandle={hoverHandle}
								snapGuides={snapGuides}
								layoutGuides={layoutGuideState.lines}
								layoutGuideBounds={layoutGuideState.bounds}
								marqueeRect={marqueeRect}
								textCreationDraftRect={textCreationDraftRect}
								textOverflowIndicatorNodeIds={selectedTextOverflowIndicatorNodeIds}
								hiddenNodeIds={hiddenCanvasNodeIds}
								vectorAnchors={vectorAnchors}
								vectorBezierHandles={vectorBezierHandles}
								vectorSegmentPreview={vectorSegmentPreview}
								cursor={cursor}
								onMouseLeave={() => {
									setHoverHandle(null);
									setHoverHit(null);
									setVectorHover(null);
								}}
								onMouseDown={handleCanvasMouseDown}
								onMouseMove={handleCanvasMouseMove}
								onMouseUp={handleCanvasMouseUp}
								onWheel={handleCanvasWheel}
								onContextMenu={handleCanvasContextMenu}
							/>

							{ENABLE_TEXT_PARITY_V1 &&
								textEditSession &&
								editingTextNode?.type === 'text' &&
								editingTextScreenRect && (
									<input
										ref={textEditorRef}
										type="text"
										value={textEditSession.draftText}
										spellCheck={false}
										autoCorrect="off"
										autoCapitalize="off"
										onChange={(event) => {
											const value = event.target.value.replace(/[\r\n]+/g, ' ');
											setTextEditSession((current) =>
												current
													? {
															...current,
															draftText: value,
															selectAllOnFocus: false,
														}
													: current,
											);
										}}
										onBlur={() => {
											if (suppressTextEditorBlurCommitRef.current) {
												suppressTextEditorBlurCommitRef.current = false;
												return;
											}
											commitTextEditing();
										}}
										onCompositionStart={() => {
											textEditorIsComposingRef.current = true;
										}}
										onCompositionEnd={() => {
											textEditorIsComposingRef.current = false;
										}}
										onKeyDown={(event) => {
											if (event.defaultPrevented) {
												return;
											}
											const isComposing = event.nativeEvent.isComposing || textEditorIsComposingRef.current;
											if (!isComposing && event.key === 'Escape') {
												event.preventDefault();
												suppressTextEditorBlurCommitRef.current = true;
												cancelTextEditing();
												return;
											}
											if (!isComposing && event.key === 'Enter') {
												event.preventDefault();
												suppressTextEditorBlurCommitRef.current = true;
												commitTextEditing();
												return;
											}
											if (!isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
												event.preventDefault();
												suppressTextEditorBlurCommitRef.current = true;
												commitTextEditing();
											}
										}}
										style={{
											position: 'absolute',
											left: `${editingTextScreenRect.left}px`,
											top: `${editingTextScreenRect.top}px`,
											width: `${Math.max(1, editingTextScreenRect.width)}px`,
											height: `${Math.max(
												1,
												(editingTextNode.lineHeightPx ?? (editingTextNode.fontSize ?? 16) * 1.2) * zoom + Math.max(2, 4 * zoom) * 2,
											)}px`,
											padding: `${Math.max(2, 4 * zoom)}px`,
											border: 'none',
											borderRadius: 0,
											outline: 'none',
											background: 'transparent',
											color: editingTextColor,
											caretColor: editingTextColor,
											fontFamily: editingTextNode.fontFamily ?? 'Inter, sans-serif',
											fontWeight: editingTextNode.fontWeight ?? 'normal',
											fontSize: `${Math.max(1, (editingTextNode.fontSize ?? 16) * zoom)}px`,
											lineHeight: `${Math.max(
												1,
												(editingTextNode.lineHeightPx ?? (editingTextNode.fontSize ?? 16) * 1.2) * zoom,
											)}px`,
											letterSpacing: `${(editingTextNode.letterSpacingPx ?? 0) * zoom}px`,
											textAlign: editingTextNode.textAlign ?? 'left',
											overflow: 'hidden',
											boxShadow: 'none',
											margin: 0,
											zIndex: 1200,
										}}
									/>
								)}

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
							onUpdateImageOutline={updateImageOutline}
							isRemovingBackground={isRemovingBackground}
							zoom={zoom}
							onCopyEffects={(nodeId) => copyEffects(nodeId)}
							onPasteEffects={(nodeId) => pasteEffects([nodeId])}
							canPasteEffects={Boolean(effectsClipboardRef.current?.length)}
							textOverflow={selectedTextOverflow}
							vectorTarget={
								editablePathNode?.type === 'path'
									? {
											pathId: editablePathNode.id,
											closed: editablePathNode.vector?.closed ?? false,
											pointCount: editablePathPointCount,
											selectedPointId: vectorEditSession?.selectedPointId ?? null,
										}
									: null
							}
							onToggleVectorClosed={toggleVectorClosed}
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
