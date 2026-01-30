import { CanvasRenderer } from './canvas-renderer';
import { buildDrawListForNode } from './draw-list';
import type { Document } from '../core/doc/types';
import type { DrawImageCommand } from './draw-list/types';

export type SnapshotOptions = {
  scale?: number;
  format?: 'png';
  background?: 'transparent' | 'solid';
  includeFrameFill?: boolean;
  clipToBounds?: boolean;
};

export type SnapshotResult = {
  mime: 'image/png';
  dataBase64: string;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const preloadImages = async (sources: string[]): Promise<void> => {
  const unique = Array.from(new Set(sources)).filter(Boolean);
  await Promise.all(unique.map(src => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  })));
};

export const exportNodeSnapshot = async (
  doc: Document,
  nodeId: string,
  options: SnapshotOptions = {}
): Promise<SnapshotResult> => {
  const node = doc.nodes[nodeId];
  if (!node) {
    throw new Error('Node not found');
  }

  const scale = clamp(options.scale ?? 1, 1, 4);
  const width = Math.max(1, Math.round(node.size.width * scale));
  const height = Math.max(1, Math.round(node.size.height * scale));

  const canvas = window.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create snapshot canvas');
  }

  if (options.background === 'solid') {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const commands = buildDrawListForNode(doc, nodeId, {
    includeFrameFill: options.includeFrameFill,
    clipToBounds: options.clipToBounds,
  });
  const imageSources = commands
    .filter((cmd): cmd is DrawImageCommand => cmd.type === 'image')
    .map(cmd => cmd.src);
  await preloadImages(imageSources);

  const renderer = new CanvasRenderer(canvas);
  renderer.render(commands, { pan: { x: 0, y: 0 }, zoom: scale });

  const dataUrl = canvas.toDataURL('image/png');
  const dataBase64 = dataUrl.split(',')[1] || '';

  return {
    mime: 'image/png',
    dataBase64,
    width,
    height,
  };
};
