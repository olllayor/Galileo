import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Canvas } from './ui/Canvas';
import { ActionBar, type Tool } from './ui/ActionBar';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';
import { PluginModal } from './ui/PluginModal';
import { PluginManagerModal } from './ui/PluginManagerModal';
import { LayersPanel } from './ui/LayersPanel';
import { useDocument } from './hooks/useDocument';
import { createRectangleTool, createTextTool, hitTestNodeAtPosition, type HitKind } from './interaction/tools';
import {
	buildParentMap,
	buildWorldBoundsMap,
	getNodeWorldBounds,
	getSelectionBounds,
	parseDocumentText,
	serializeDocument,
	type BoundsOverrideMap,
	type WorldBoundsMap,
} from './core/doc';
import { generateId } from './core/doc/id';
import type { Document, Node } from './core/doc/types';
import type { Command } from './core/commands/types';
import type { CanvasPointerInfo, CanvasWheelInfo } from './hooks/useCanvas';
import { getHandleCursor, hitTestHandle } from './interaction/handles';
import type { ResizeHandle } from './interaction/handles';
import { applyResizeSnapping, applySnapping, buildSiblingSnapTargets } from './interaction/snapping';
import type { SnapGuide, SnapTargets } from './interaction/snapping';
import { exportNodeSnapshot } from './render/export';
import { builtinPlugins } from './plugins/builtin';
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

type EditorAction =
	| { type: 'duplicate' }
	| { type: 'delete' }
	| { type: 'rename' }
	| { type: 'toggleLock' }
	| { type: 'toggleVisible' }
	| { type: 'reorderZ'; dir: 'front' | 'back' | 'forward' | 'backward' };

type NormalizedEdges = { nl: number; nt: number; nr: number; nb: number };

type TransformSession = {
	activeIds: string[];
	initialBounds: { x: number; y: number; width: number; height: number };
	normalizedEdgesById: Record<string, NormalizedEdges>;
	handle: ResizeHandle;
	aspectRatio: number;
	startPointerWorld: { x: number; y: number };
	startBoundsMap?: WorldBoundsMap;
	modifiers: { shiftKey: boolean; altKey: boolean };
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

	const [activeTool, setActiveTool] = useState<'select' | 'rectangle' | 'text'>('select');
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
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
	const canvasSize = { width: 1280, height: 800 };
	const isDev = import.meta.env.DEV;

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
	const cursor = useMemo(() => {
		if (dragState?.mode === 'resize') return getHandleCursor(dragState.handle);
		if (dragState?.mode === 'pan') return 'grabbing';
		if (dragState?.mode === 'move') return 'move';
		if (transformSession) return getHandleCursor(transformSession.handle);
		if (hoverHandle) return getHandleCursor(hoverHandle);
		if (hoverHit?.locked) return 'not-allowed';
		if (hoverHit?.kind === 'edge') return hoverHit.edgeCursor || 'default';
		if (hoverHit) return 'move';
		if (activeTool === 'rectangle' || activeTool === 'text') return 'crosshair';
		return 'default';
	}, [dragState, transformSession, hoverHandle, hoverHit, activeTool]);

	useEffect(() => {
		if (recentPluginIds.length === 0 && builtinPlugins.length > 0) {
			const seeded = [builtinPlugins[0].manifest.id];
			localStorage.setItem('galileo.plugins.recents.v1', JSON.stringify(seeded));
			setRecentPluginIds(seeded);
		}
	}, [recentPluginIds.length]);

	const insertImageNode = useCallback(
		async ({
			src,
			dataBase64,
			mime,
			width,
			height,
			name,
			originalPath,
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
					}
				: {
						src: resolvedSrc,
						mime: resolvedMime,
						originalPath,
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

	const runPlugin = useCallback((plugin: PluginRegistration) => {
		setActivePlugin(plugin);
		setRecentPluginIds(recordRecentPlugin(plugin));
	}, []);

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
				const { id: _id, children, ...rest } = node;
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

	const dispatchEditorAction = useCallback(
		(action: EditorAction, targetIds: string[] = selectionIds) => {
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
			}
		},
		[applyPropsToSelection, deleteNodes, document.nodes, duplicateNodes, reorderZ, selectionIds, setSelection],
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
		const anyVisible = selectionIds.some((id) => document.nodes[id]?.visible !== false);
		const anyUnlocked = selectionIds.some((id) => document.nodes[id]?.locked !== true);
		const lockLabel = anyUnlocked ? 'Lock' : 'Unlock';
		const visibleLabel = anyVisible ? 'Hide' : 'Show';

		const primaryId = selectionIds[0];
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
		devPlugins,
		dispatchEditorAction,
		document.nodes,
		documentParentMap,
		handleLoadDevPlugin,
		isDev,
		recentPlugins,
		plugins,
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
							}));

						const result: SelectionGetResult = {
							ids,
							primaryId: ids.length > 0 ? ids[0] : null,
							nodes,
						};
						return { rpc: 1, id: request.id, ok: true, result };
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
							position: insertPosition,
							maxDimension: 1200,
						});
						return { rpc: 1, id: request.id, ok: true, result: { newNodeId } };
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
								const digest = await crypto.subtle.digest('SHA-256', bytesArray);
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
		[document, getDefaultInsertPosition, insertImageNode, isDev, selectionIds],
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
				event.source?.postMessage(response, '*');
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

			if (selectionBounds && selectionIds.length === 1) {
				const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
				if (handle) {
					const nodeId = selectionIds[0];
					const node = document.nodes[nodeId];
					const startBounds = getNodeWorldBounds(displayDocument, nodeId, boundsMap);
					if (node && startBounds) {
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
						});
						setPreviewDocument(document);
						return true;
					}
				}
			}

			const hit = hitTestAtPoint(worldX, worldY);
			if (hit && hit.node.id !== displayDocument.rootId) {
				if (hit.locked) {
					return true;
				}

				const nodeId = hit.node.id;
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
						? buildSiblingSnapTargets(document, nodeId, parentMap, boundsMap)
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
			selectionBounds,
			selectionIds,
			selectNode,
			setSelection,
			toggleSelection,
			view,
			boundsMap,
			hitTestAtPoint,
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

				const hit = hitTestAtPoint(worldX, worldY);
				if (hit && hit.node.id !== displayDocument.rootId) {
					if (hit.locked) {
						return;
					}
					setActiveTool('select');
					handleSelectionPointerDown(info);
					return;
				}

				const tool = createRectangleTool();
				const result = tool.handleMouseDown(document, worldX, worldY, []);
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
							parentId: document.rootId,
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

				const hit = hitTestAtPoint(worldX, worldY);
				if (hit && hit.node.id !== displayDocument.rootId) {
					if (hit.locked) {
						return;
					}
					setActiveTool('select');
					handleSelectionPointerDown(info);
					return;
				}

				const tool = createTextTool();
				const result = tool.handleMouseDown(document, worldX, worldY, []);
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
							parentId: document.rootId,
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
			displayDocument,
			document,
			executeCommand,
			handleSelectionPointerDown,
			selectNode,
			selectionBounds,
			selectionIds,
			setActiveTool,
			view,
			measureTextSize,
			hitTestAtPoint,
			transformSession,
			openContextMenuAt,
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

				const updates: Record<string, { x: number; y: number }> = {};
				for (const id of dragState.selectedIds) {
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
				const snapTargets = buildSiblingSnapTargets(dragState.baseDoc, dragState.nodeId, parentMap, boundsMap);
				const snap = snapDisabled
					? { bounds: rawBounds, guides: [] }
					: applyResizeSnapping(dragState.startBounds, rawBounds, snapTargets, zoom);
				const nextBounds = snap.bounds;
				const nextPosition = {
					x: dragState.initialPosition.x + (nextBounds.x - dragState.startBounds.x),
					y: dragState.initialPosition.y + (nextBounds.y - dragState.startBounds.y),
				};
				const nextSize = { width: nextBounds.width, height: nextBounds.height };
				setPreviewDocument(applyBoundsUpdate(dragState.baseDoc, dragState.nodeId, nextPosition, nextSize));
				setSnapGuides(snap.guides);
				return;
			}

			let nextHandle: ResizeHandle | null = null;
			if (activeTool === 'select' && selectionBounds && selectionIds.length === 1) {
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
			document,
			displayDocument,
			boundsMap,
			parentMap,
			setSelection,
			hitTestAtPoint,
			getEdgeCursorForNode,
		],
	);

	const handleCanvasMouseUp = useCallback(
		(info: CanvasPointerInfo) => {
			if (transformSession) {
				setTransformSession(null);
				setSnapGuides([]);
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

				const updates: Record<string, { x: number; y: number }> = {};
				for (const id of dragState.selectedIds) {
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
				const snapTargets = buildSiblingSnapTargets(dragState.baseDoc, dragState.nodeId, parentMap, boundsMap);
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

				if (positionChanged || sizeChanged) {
					executeCommand({
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
			}

			setPreviewDocument(null);
			setDragState(null);
			setSnapGuides([]);
			setHoverHandle(null);
			setHoverHit(null);
		},
		[dragState, transformSession, snapDisabled, zoom, executeCommand, parentMap, boundsMap],
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
		[document.nodes, executeCommand, measureTextSize],
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
		(id: string, _visible: boolean) => {
			dispatchEditorAction({ type: 'toggleVisible' }, [id]);
		},
		[dispatchEditorAction],
	);

	const handleToggleNodeLocked = useCallback(
		(id: string, _locked: boolean) => {
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

	const handleSave = useCallback(async () => {
		try {
			let path = currentPath;
			let pickedPath: string | null = null;
			if (!path) {
				pickedPath = await invoke<string>('show_save_dialog');
				if (!pickedPath) {
					return;
				}
				path = pickedPath;
			}

			await invoke('save_document', {
				args: { path, content: serializeDocument(document) },
			});
			if (pickedPath) {
				setCurrentPath(pickedPath);
			}
			markSaved();
			localStorage.removeItem(AUTOSAVE_KEY);
			alert('Document saved successfully!');
		} catch (error) {
			console.error('Save error:', error);
			alert('Failed to save document');
		}
	}, [document, currentPath, markSaved]);

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

	const handleLoad = useCallback(async () => {
		try {
			if (isDirty) {
				const proceed = window.confirm('You have unsaved changes. Discard them and load another file?');
				if (!proceed) {
					return;
				}
			}

			const path = await invoke<string>('show_open_dialog');
			if (path) {
				const content = await invoke<string>('load_document', { args: { path } });
				const result = parseDocumentText(content);
				if (!result.ok) {
					const details = result.details?.join('\n');
					alert(`Failed to load document: ${result.error}${details ? `\n${details}` : ''}`);
					return;
				}

				replaceDocument(result.doc);
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
				if (result.warnings.length > 0) {
					console.warn('Document warnings:', result.warnings);
				}
			}
		} catch (error) {
			console.error('Load error:', error);
			alert('Failed to load document');
		}
	}, [isDirty, replaceDocument, markSaved]);

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
		const handlePaste = (event: ClipboardEvent) => {
			const clipboardData = event.clipboardData;
			if (!clipboardData) return;
			if (isEditableTarget(event.target)) return;

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
			}
		};

		window.addEventListener('paste', handlePaste);
		return () => window.removeEventListener('paste', handlePaste);
	}, [insertImageNode]);

	useEffect(() => {
		const handleDragOver = (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};

		const handleDrop = (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();

			const files = event.dataTransfer?.files;
			if (!files || files.length === 0) return;

			void (async () => {
				try {
					for (let i = 0; i < files.length; i += 1) {
						const file = files[i];
						if (!file.type.startsWith('image/')) continue;

						const dataUrl = await readFileAsDataUrl(file);
						await insertImageNode({
							src: dataUrl,
							mime: file.type || getMimeType(file.name),
							name: file.name,
							index: i,
						});
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
	}, [insertImageNode]);

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
			}

			if (!editable) {
				if (isCmd && key === 'd') {
					if (!hasSelection) return;
					e.preventDefault();
					dispatchEditorAction({ type: 'duplicate' });
					return;
				}

				if (e.key === 'Enter') {
					if (selectionIds.length !== 1) return;
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
				if (e.key === 'r') setActiveTool('rectangle');
				if (e.key === 't') setActiveTool('text');
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

		const options = { capture: true };
		window.addEventListener('keydown', handleKeyDown, options);
		return () => window.removeEventListener('keydown', handleKeyDown, options);
	}, [
		selectionIds,
		canUndo,
		canRedo,
		redoCommand,
		undoCommand,
		handleSave,
		handleLoad,
		handleImportImage,
		transformSession,
		contextMenu,
		activePlugin,
		pluginManagerOpen,
		dragState,
		dispatchEditorAction,
		setSelection,
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
		if (tool === 'hand') {
			// Hand tool is handled via pan mode during drag
			setActiveTool('select');
		} else {
			setActiveTool(tool as 'select' | 'rectangle' | 'text');
		}
	}, []);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100vh',
				overflow: 'hidden',
				fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
			}}
		>
			<div
				style={{
					height: '48px',
					display: 'flex',
					alignItems: 'center',
					padding: '0 16px',
					backgroundColor: '#2d2d2d',
					color: 'white',
					borderBottom: '1px solid #444',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
					<h1 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Galileo</h1>
					<span style={{ fontSize: '11px', color: '#bbb' }}>
						{fileName}
						{isDirty ? ' *' : ''}
					</span>
				</div>
				<span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>v0.1.0</span>
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
					onContextMenu={handleCanvasContextMenu}
				>
					<Canvas
						width={canvasSize.width}
						height={canvasSize.height}
						document={displayDocument}
						boundsMap={boundsMap}
						view={view}
						selectionBounds={selectionBounds}
						hoverBounds={hoverBounds}
						showHandles={selectionIds.length === 1}
						hoverHandle={hoverHandle}
						snapGuides={snapGuides}
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

					<div
						style={{
							position: 'absolute',
							bottom: '16px',
							left: '16px',
							padding: '8px 12px',
							backgroundColor: 'rgba(0, 0, 0, 0.7)',
							color: 'white',
							borderRadius: '6px',
							fontSize: '12px',
							fontFamily: 'monospace',
						}}
					>
						Offset: {panOffset.x.toFixed(0)}, {panOffset.y.toFixed(0)} | Zoom: {Math.round(zoom * 100)}%
					</div>

					{selectionIds.length > 0 && (
						<div
							style={{
								position: 'absolute',
								top: '16px',
								left: '16px',
								padding: '8px 12px',
								backgroundColor: 'rgba(74, 158, 255, 0.9)',
								color: 'white',
								borderRadius: '6px',
								fontSize: '12px',
							}}
						>
							{selectionIds.length} selected
						</div>
					)}

					<ActionBar
						activeTool={activeTool}
						onToolChange={handleToolChange}
						canUndo={canUndo}
						canRedo={canRedo}
						onUndo={undoCommand}
						onRedo={redoCommand}
						onSave={handleSave}
						onLoad={handleLoad}
						onImport={handleImportImage}
					/>
				</div>

				<PropertiesPanel
					selectedNode={selectedNode}
					document={document}
					collapsed={rightPanelCollapsed}
					onToggleCollapsed={toggleRightPanel}
					onUpdateNode={handleUpdateNode}
				/>
			</div>

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
		</div>
	);
};
