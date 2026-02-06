import { CanvasRenderer } from './canvas-renderer';
import { buildDrawListForNode } from './draw-list';
import type { Document } from '../core/doc/types';
import type { DrawImageCommand } from './draw-list/types';
import { invoke } from '@tauri-apps/api/core';

export type SnapshotOptions = {
	scale?: number;
	format?: 'png' | 'webp';
	background?: 'transparent' | 'solid';
	includeFrameFill?: boolean;
	clipToBounds?: boolean;
	/** Max output dimension (pixels). Applied after scaling. */
	maxDim?: number;
	/** Allow scaling above 1x (upscale). Default false. */
	allowUpscale?: boolean;
	/** Use native Rust encoder (faster) or browser canvas (fallback) */
	useNativeEncoder?: boolean;
	/** WebP quality 0-100 (only for webp format) */
	webpQuality?: number;
};

export type SnapshotResult = {
	mime: 'image/png' | 'image/webp';
	dataBase64: string;
	width: number;
	height: number;
	/** Encoding time in milliseconds (for benchmarking) */
	encodeTimeMs?: number;
	/** Debug info for scale/clamp diagnostics */
	requestedScale?: number;
	usedScale?: number;
	pixelW?: number;
	pixelH?: number;
	clampedBy?: string[];
};

const preloadImages = async (sources: string[]): Promise<void> => {
	const unique = Array.from(new Set(sources)).filter(Boolean);
	await Promise.all(
		unique.map(
			(src) =>
				new Promise<void>((resolve) => {
					const img = new Image();
					img.onload = () => resolve();
					img.onerror = () => resolve();
					img.src = src;
				}),
		),
	);
};

/**
 * Convert Uint8ClampedArray to base64 string
 */
const uint8ArrayToBase64 = (bytes: Uint8ClampedArray): string => {
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
};

/**
 * Encode image using native Rust encoder (PNG or WebP)
 * Falls back to canvas.toDataURL if Tauri invoke fails
 */
const encodeWithRust = async (
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	format: 'png' | 'webp',
	webpQuality?: number,
): Promise<{ dataBase64: string; encodeTimeMs: number }> => {
	const imageData = ctx.getImageData(0, 0, width, height);
	const rgbaBase64 = uint8ArrayToBase64(imageData.data);

	const startTime = performance.now();

	if (format === 'webp') {
		const dataBase64 = await invoke<string>('encode_webp', {
			args: {
				rgbaBase64,
				width,
				height,
				quality: webpQuality ?? 90,
			},
		});
		return { dataBase64, encodeTimeMs: performance.now() - startTime };
	} else {
		const dataBase64 = await invoke<string>('encode_png', {
			args: {
				rgbaBase64,
				width,
				height,
			},
		});
		return { dataBase64, encodeTimeMs: performance.now() - startTime };
	}
};

/**
 * Encode image using browser canvas (fallback)
 */
const encodeWithCanvas = (
	canvas: HTMLCanvasElement,
	format: 'png' | 'webp',
	webpQuality?: number,
): { dataBase64: string; encodeTimeMs: number } => {
	const startTime = performance.now();
	const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
	const quality = format === 'webp' ? (webpQuality ?? 90) / 100 : undefined;
	const dataUrl = canvas.toDataURL(mimeType, quality);
	const dataBase64 = dataUrl.split(',')[1] || '';
	return { dataBase64, encodeTimeMs: performance.now() - startTime };
};

export const exportNodeSnapshot = async (
	doc: Document,
	nodeId: string,
	options: SnapshotOptions = {},
): Promise<SnapshotResult> => {
	const node = doc.nodes[nodeId];
	if (!node) {
		throw new Error('Node not found');
	}

	const requestedScale = Math.max(options.scale ?? 1, 0.1);
	let scale = requestedScale;
	const clampedBy: string[] = [];
	const allowUpscale = options.allowUpscale ?? false;
	if (!allowUpscale && scale > 1) {
		scale = 1;
		clampedBy.push('allowUpscale');
	}
	const maxDim = Math.max(1, Math.floor(options.maxDim ?? 4096));
	const format = options.format ?? 'png';
	const useNativeEncoder = options.useNativeEncoder ?? true; // Default to Rust encoder
	let width = Math.max(1, Math.round(node.size.width * scale));
	let height = Math.max(1, Math.round(node.size.height * scale));

	if (Math.max(width, height) > maxDim) {
		const ratio = maxDim / Math.max(width, height);
		scale *= ratio;
		width = Math.max(1, Math.round(node.size.width * scale));
		height = Math.max(1, Math.round(node.size.height * scale));
		clampedBy.push('maxDim');
	}

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
		.flatMap((cmd) => [cmd.src, cmd.maskSrc].filter(Boolean) as string[]);
	await preloadImages(imageSources);

	const renderer = new CanvasRenderer(canvas);
	renderer.render(commands, { pan: { x: 0, y: 0 }, zoom: scale });

	// Encode using Rust (fast) or canvas (fallback)
	let dataBase64: string;
	let encodeTimeMs: number;

	if (useNativeEncoder) {
		try {
			const result = await encodeWithRust(ctx, width, height, format, options.webpQuality);
			dataBase64 = result.dataBase64;
			encodeTimeMs = result.encodeTimeMs;
		} catch (err) {
			console.warn('Rust encoder failed, falling back to canvas:', err);
			const result = encodeWithCanvas(canvas, format, options.webpQuality);
			dataBase64 = result.dataBase64;
			encodeTimeMs = result.encodeTimeMs;
		}
	} else {
		const result = encodeWithCanvas(canvas, format, options.webpQuality);
		dataBase64 = result.dataBase64;
		encodeTimeMs = result.encodeTimeMs;
	}

	return {
		mime: format === 'webp' ? 'image/webp' : 'image/png',
		dataBase64,
		width,
		height,
		encodeTimeMs,
		requestedScale,
		usedScale: scale,
		pixelW: width,
		pixelH: height,
		clampedBy: clampedBy.length > 0 ? clampedBy : undefined,
	};
};
