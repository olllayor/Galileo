import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Toolbar } from './ui/Toolbar';
import { Canvas } from './ui/Canvas';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { useDocument } from './hooks/useDocument';
import { findNodeAtPosition, createRectangleTool, createTextTool } from './interaction/tools';
import {
  buildParentMap,
  buildWorldPositionMap,
  getNodeWorldBounds,
  getSelectionBounds,
  parseDocumentText,
  serializeDocument,
} from './core/doc';
import { generateId } from './core/doc/id';
import type { Document } from './core/doc/types';
import type { Command } from './core/commands/types';
import type { CanvasPointerInfo, CanvasWheelInfo } from './hooks/useCanvas';
import { getHandleCursor, hitTestHandle } from './interaction/handles';
import type { ResizeHandle } from './interaction/handles';
import { applyResizeSnapping, applySnapping, buildSiblingSnapTargets } from './interaction/snapping';
import type { SnapGuide, SnapTargets } from './interaction/snapping';

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const HANDLE_HIT_SIZE = 14;
const HIT_SLOP_PX = 6;
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

const applyPositionUpdates = (
  doc: Document,
  updates: Record<string, { x: number; y: number }>
): Document => {
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
  size: { width: number; height: number }
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
  lockAspectRatio = false
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
  b: { x: number; y: number }
): { x: number; y: number; width: number; height: number } => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  return { x, y, width, height };
};

const rectsIntersect = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean => {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
};

const getMarqueeSelection = (
  doc: Document,
  worldMap: Record<string, { x: number; y: number }>,
  rect: { x: number; y: number; width: number; height: number }
): string[] => {
  const ids: string[] = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === doc.rootId) continue;
    if (node.visible === false) continue;
    const pos = worldMap[id];
    if (!pos) continue;
    const bounds = { x: pos.x, y: pos.y, width: node.size.width, height: node.size.height };
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

  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
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
  const [hoverHandle, setHoverHandle] = useState<ResizeHandle | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [snapDisabled, setSnapDisabled] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = { width: 1280, height: 800 };

  const displayDocument = previewDocument ?? document;
  const selectedNode = selectedIds.length === 1 ? displayDocument.nodes[selectedIds[0]] : null;
  const view = useMemo(() => ({ pan: panOffset, zoom }), [panOffset, zoom]);
  const worldMap = useMemo(() => buildWorldPositionMap(displayDocument), [displayDocument]);
  const parentMap = useMemo(() => buildParentMap(displayDocument), [displayDocument]);
  const selectionIds = useMemo(
    () => selectedIds.filter(id => id !== displayDocument.rootId),
    [selectedIds, displayDocument.rootId]
  );
  const selectionBounds = useMemo(
    () => getSelectionBounds(displayDocument, selectionIds, worldMap),
    [displayDocument, selectionIds, worldMap]
  );
  const fileName = useMemo(() => {
    if (!currentPath) return 'Untitled';
    const parts = currentPath.split(/[/\\\\]/);
    return parts[parts.length - 1] || 'Untitled';
  }, [currentPath]);
  const hoverBounds = useMemo(() => {
    if (!hoverNodeId || selectionIds.includes(hoverNodeId)) return null;
    return getNodeWorldBounds(displayDocument, hoverNodeId, worldMap);
  }, [hoverNodeId, selectionIds, displayDocument, worldMap]);
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
  const cursor = useMemo(() => {
    if (dragState?.mode === 'resize') return getHandleCursor(dragState.handle);
    if (dragState?.mode === 'pan') return 'grabbing';
    if (dragState?.mode === 'move') return 'move';
    if (hoverHandle) return getHandleCursor(hoverHandle);
    if (hoverNodeId) return 'pointer';
    if (activeTool === 'rectangle' || activeTool === 'text') return 'crosshair';
    return 'default';
  }, [dragState, hoverHandle, hoverNodeId, activeTool]);

  const insertImageNode = useCallback(async (
    {
      src,
      mime,
      name,
      originalPath,
      index = 0,
    }: {
      src: string;
      mime?: string;
      name?: string;
      originalPath?: string;
      index?: number;
    }
  ) => {
    const size = await getImageSize(src);
    const maxDimension = 800;
    const scale = Math.min(1, maxDimension / Math.max(size.width, size.height));
    const scaledSize = {
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    };

    const centerWorld = {
      x: (canvasSize.width / 2 - view.pan.x) / Math.max(view.zoom, 0.0001),
      y: (canvasSize.height / 2 - view.pan.y) / Math.max(view.zoom, 0.0001),
    };

    const offset = index * 24;
    const position = {
      x: centerWorld.x - scaledSize.width / 2 + offset,
      y: centerWorld.y - scaledSize.height / 2 + offset,
    };

    const newId = generateId();
    executeCommand({
      id: generateId(),
      timestamp: Date.now(),
      source: 'user',
      description: 'Import image',
      type: 'createNode',
      payload: {
        id: newId,
        parentId: document.rootId,
        node: {
          type: 'image',
          name: name || 'Image',
          position,
          size: scaledSize,
          image: {
            src,
            mime,
            originalPath,
          },
          visible: true,
          aspectRatioLocked: true,
        },
      },
    } as Command);
    selectNode(newId);
  }, [canvasSize.height, canvasSize.width, document.rootId, executeCommand, selectNode, view.pan.x, view.pan.y, view.zoom]);

  const measureTextSize = useCallback(
    (text: string, fontSize: number, fontFamily: string, fontWeight: string) => {
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
    },
    []
  );

  const handleSelectionPointerDown = useCallback((info: CanvasPointerInfo): boolean => {
    const { worldX, worldY, screenX, screenY } = info;

    if (selectionBounds && selectionIds.length === 1) {
      const handle = hitTestHandle(screenX, screenY, selectionBounds, view, HANDLE_HIT_SIZE);
      if (handle) {
        const nodeId = selectionIds[0];
        const node = document.nodes[nodeId];
        const startBounds = getNodeWorldBounds(document, nodeId);
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

    const hitSlopWorld = HIT_SLOP_PX / Math.max(zoom, 0.0001);
    const node = findNodeAtPosition(displayDocument, worldX, worldY, hitSlopWorld);
    if (node && node.id !== displayDocument.rootId) {
      if (info.shiftKey) {
        toggleSelection(node.id);
        return true;
      }

      const isAlreadySelected = selectionIds.includes(node.id);
      const nextSelection = isAlreadySelected ? selectionIds : [node.id];
      if (!isAlreadySelected) {
        selectNode(node.id);
      }

      const initialPositions: Record<string, { x: number; y: number }> = {};
      for (const id of nextSelection) {
        const selected = document.nodes[id];
        if (selected) {
          initialPositions[id] = { ...selected.position };
        }
      }

      const startBounds = getSelectionBounds(document, nextSelection);
      const snapTargets = nextSelection.length === 1
        ? buildSiblingSnapTargets(document, node.id, parentMap, worldMap)
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
  }, [displayDocument, document, parentMap, selectionBounds, selectionIds, selectNode, setSelection, toggleSelection, view, worldMap, zoom]);

  const handleCanvasMouseDown = useCallback((info: CanvasPointerInfo) => {
    const { worldX, worldY, screenX, screenY } = info;
    setHoverHandle(null);
    setHoverNodeId(null);
    setSnapGuides([]);

    if (info.button === 2 || (info.buttons & 2) === 2) {
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

      const hitSlopWorld = HIT_SLOP_PX / Math.max(zoom, 0.0001);
      const hitNode = findNodeAtPosition(displayDocument, worldX, worldY, hitSlopWorld);
      if (hitNode && hitNode.id !== displayDocument.rootId) {
        setActiveTool('select');
        handleSelectionPointerDown(info);
        return;
      }

      const tool = createRectangleTool();
      const result = tool.handleMouseDown(document, worldX, worldY, []);
      if (result) {
        const newIds = Object.keys(result.nodes).filter(id => !(id in document.nodes));
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

      const hitSlopWorld = HIT_SLOP_PX / Math.max(zoom, 0.0001);
      const hitNode = findNodeAtPosition(displayDocument, worldX, worldY, hitSlopWorld);
      if (hitNode && hitNode.id !== displayDocument.rootId) {
        setActiveTool('select');
        handleSelectionPointerDown(info);
        return;
      }

      const tool = createTextTool();
      const result = tool.handleMouseDown(document, worldX, worldY, []);
      if (result) {
        const newIds = Object.keys(result.nodes).filter(id => !(id in document.nodes));
        const newId = newIds[0];
        const newNode = newId ? result.nodes[newId] : null;
        if (!newId || !newNode) {
          return;
        }

        const nextText = newNode.text ?? 'Text';
        const nextFontSize = newNode.fontSize ?? 16;
        const nextFontFamily = newNode.fontFamily ?? 'Inter, sans-serif';
        const nextFontWeight = newNode.fontWeight ?? 'normal';
        const measured = measureTextSize(
          nextText,
          nextFontSize,
          nextFontFamily,
          nextFontWeight
        );

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
  }, [activeTool, displayDocument, document, executeCommand, handleSelectionPointerDown, panOffset, selectNode, selectionBounds, selectionIds, setActiveTool, view, zoom, measureTextSize]);

  const handleCanvasMouseMove = useCallback((info: CanvasPointerInfo) => {
    const { worldX, worldY, screenX, screenY } = info;

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
      const hits = getMarqueeSelection(document, worldMap, rect);
      const merged = dragState.additive
        ? Array.from(new Set([...dragState.baseSelection, ...hits]))
        : hits;

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
        : applySnapping(
          dragState.startBounds,
          rawDeltaX,
          rawDeltaY,
          dragState.snapTargets,
          zoom
        );

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
        dragState.lockAspectRatio
      );
      const snapTargets = buildSiblingSnapTargets(
        dragState.baseDoc,
        dragState.nodeId,
        parentMap,
        worldMap
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
      const hitSlopWorld = HIT_SLOP_PX / Math.max(zoom, 0.0001);
      const node = findNodeAtPosition(displayDocument, worldX, worldY, hitSlopWorld);
      const nextHover = node && node.id !== displayDocument.rootId ? node.id : null;
      if (nextHover !== hoverNodeId) {
        setHoverNodeId(nextHover);
      }
    } else if (hoverNodeId) {
      setHoverNodeId(null);
    }
  }, [activeTool, dragState, selectionBounds, selectionIds, view, zoom, snapDisabled, hoverHandle, hoverNodeId, document, displayDocument, worldMap, parentMap, setSelection]);

  const handleCanvasMouseUp = useCallback((info: CanvasPointerInfo) => {
    if (!dragState) return;

    if (dragState.mode === 'marquee') {
      setDragState(null);
      setSnapGuides([]);
      setHoverHandle(null);
      return;
    }

    if (dragState.mode === 'move') {
      const rawDeltaX = info.worldX - dragState.startWorld.x;
      const rawDeltaY = info.worldY - dragState.startWorld.y;
      const snap = snapDisabled
        ? { deltaX: rawDeltaX, deltaY: rawDeltaY, guides: [] }
        : applySnapping(
          dragState.startBounds,
          rawDeltaX,
          rawDeltaY,
          dragState.snapTargets,
          zoom
        );

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
        dragState.lockAspectRatio
      );
      const snapTargets = buildSiblingSnapTargets(
        dragState.baseDoc,
        dragState.nodeId,
        parentMap,
        worldMap
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
        nextPosition.x !== dragState.initialPosition.x ||
        nextPosition.y !== dragState.initialPosition.y;
      const sizeChanged =
        nextSize.width !== dragState.initialSize.width ||
        nextSize.height !== dragState.initialSize.height;

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
    setHoverNodeId(null);
  }, [dragState, snapDisabled, zoom, executeCommand, parentMap, worldMap]);

  const handleCanvasWheel = useCallback((info: CanvasWheelInfo) => {
    if (info.ctrlKey || info.metaKey) {
      const zoomFactor = Math.exp(-info.deltaY * ZOOM_SENSITIVITY);
      setZoom(prevZoom => {
        const nextZoom = clamp(prevZoom * zoomFactor, 0.2, 6);
        setPanOffset({
          x: info.screenX - info.worldX * nextZoom,
          y: info.screenY - info.worldY * nextZoom,
        });
        return nextZoom;
      });
      return;
    }

    setPanOffset(prev => ({
      x: prev.x - info.deltaX,
      y: prev.y - info.deltaY,
    }));
  }, []);

  const handleUpdateNode = useCallback((id: string, updates: Record<string, unknown>) => {
    const current = document.nodes[id];
    let nextUpdates = updates;
    if (current?.type === 'text') {
      const nextText =
        typeof updates.text === 'string' ? updates.text : current.text ?? '';
      const nextFontSize =
        typeof updates.fontSize === 'number' ? updates.fontSize : current.fontSize ?? 16;
      const nextFontFamily =
        typeof updates.fontFamily === 'string' ? updates.fontFamily : current.fontFamily ?? 'Inter, sans-serif';
      const nextFontWeight =
        typeof updates.fontWeight === 'string' ? updates.fontWeight : current.fontWeight ?? 'normal';

      if (
        Object.prototype.hasOwnProperty.call(updates, 'text') ||
        Object.prototype.hasOwnProperty.call(updates, 'fontSize') ||
        Object.prototype.hasOwnProperty.call(updates, 'fontFamily') ||
        Object.prototype.hasOwnProperty.call(updates, 'fontWeight')
      ) {
        const measured = measureTextSize(
          nextText,
          nextFontSize,
          nextFontFamily,
          nextFontWeight
        );
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
  }, [document.nodes, executeCommand, measureTextSize]);

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
        path,
        content: serializeDocument(document),
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
      const dataUrl = `data:${mime};base64,${base64}`;
      const name = path.split(/[/\\\\]/).pop();
      await insertImageNode({
        src: dataUrl,
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
        const content = await invoke<string>('load_document', { path });
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
        setHoverNodeId(null);
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
    setHoverNodeId(null);
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
      const imageFiles = files.filter(file => file.type.startsWith('image/') || isLikelyImageName(file.name));

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
      const imageItem = items.find(item => item.type.startsWith('image/'));
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
              const dataUrl = `data:${mime};base64,${base64}`;
              const name = path.split(/[/\\\\]/).pop();
              await insertImageNode({
                src: dataUrl,
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

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditableTarget(e.target)) {
        if (selectionIds.length === 0) {
          return;
        }

        const deletable = selectionIds.filter(id => id !== document.rootId);
        if (deletable.length === 0) {
          return;
        }

        e.preventDefault();
        const commands = deletable.map(id => ({
          id: generateId(),
          timestamp: Date.now(),
          source: 'user',
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
        setSelection([]);
        return;
      }

      if (!editable) {
        if (e.key === 'v') setActiveTool('select');
        if (e.key === 'r') setActiveTool('rectangle');
        if (e.key === 't') setActiveTool('text');
      }

      if (editable) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          handleSave();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
          e.preventDefault();
          handleLoad();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
          e.preventDefault();
          handleImportImage();
        }

        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redoCommand();
        } else {
          if (canUndo) undoCommand();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleLoad();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        handleImportImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionIds, document.rootId, executeCommand, setSelection, canUndo, canRedo, redoCommand, undoCommand, handleSave, handleLoad, handleImportImage]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        backgroundColor: '#2d2d2d',
        color: 'white',
        borderBottom: '1px solid #444',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Galileo
          </h1>
          <span style={{ fontSize: '11px', color: '#bbb' }}>
            {fileName}{isDirty ? ' *' : ''}
          </span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
          v0.1.0
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undoCommand}
          onRedo={redoCommand}
          onSave={handleSave}
          onLoad={handleLoad}
          onImport={handleImportImage}
        />

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <Canvas
            width={canvasSize.width}
            height={canvasSize.height}
            document={displayDocument}
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
              setHoverNodeId(null);
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onWheel={handleCanvasWheel}
          />

          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}>
            Offset: {panOffset.x.toFixed(0)}, {panOffset.y.toFixed(0)} | Zoom: {Math.round(zoom * 100)}%
          </div>

          {selectionIds.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              padding: '8px 12px',
              backgroundColor: 'rgba(74, 158, 255, 0.9)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '12px',
            }}>
              {selectionIds.length} selected
            </div>
          )}
        </div>

        <PropertiesPanel
          selectedNode={selectedNode}
          document={document}
          onUpdateNode={handleUpdateNode}
        />
      </div>
    </div>
  );
};
