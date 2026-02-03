import type { Icon, IconProvider, IconRenderParams, IconRenderResult, IconVariant } from '../types';

const BASE_URL = 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public';
const MANIFEST_URL = '/plugins/3dicons/manifest.json';
const DEFAULT_ANGLE = 'dynamic';
const DEFAULT_STYLE = 'color';
const PREVIEW_SIZE = 200;
const DEFAULT_RENDER_SIZE = 400;
const PROVIDER_VERSION = '3dicons@v1';
const RENDER_VERSION = 'v1';

const STYLES = ['color', 'clay', 'gradient', 'premium'];
const ANGLES = ['dynamic', 'front'];

const FALLBACK_ICONS: Array<{ id: string; name: string }> = [
	{ id: '269bcd-gift-box', name: 'Gift Box' },
	{ id: '5656e5-camera', name: 'Camera' },
	{ id: '1858b9-map-pin', name: 'Map Pin' },
	{ id: '7e47be-setting', name: 'Setting' },
	{ id: 'b5916f-bell', name: 'Bell' },
	{ id: 'b0b258-ribbon', name: 'Ribbon' },
	{ id: 'f32794-calendar', name: 'Calendar' },
	{ id: '3d005d-star', name: 'Star' },
	{ id: '11b186-xmas-tree', name: 'Xmas Tree' },
	{ id: '4e9c51-snowman', name: 'Snowman' },
	{ id: 'd004fd-gingerbread', name: 'Gingerbread' },
	{ id: '6e6a21-candle', name: 'Candle' },
];

const buildIconUrl = (iconId: string, angle: string, size: number, style: string): string => {
	return `${BASE_URL}/sizes/${iconId}/${angle}/${size}/${style}.webp`;
};

const slugToKeywords = (slug: string): string[] => {
	const parts = slug.split('-').slice(1);
	if (parts.length === 0) return [slug];
	return parts;
};

const createIcon = (entry: { id: string; name: string }): Icon => {
	return {
		id: entry.id,
		name: entry.name,
		provider: '3dicons',
		previewUrl: buildIconUrl(entry.id, DEFAULT_ANGLE, PREVIEW_SIZE, DEFAULT_STYLE),
		keywords: slugToKeywords(entry.id),
	};
};

const normalizeManifestEntry = (entry: unknown): { id: string; name: string } | null => {
	if (!entry || typeof entry !== 'object') return null;
	const record = entry as Record<string, unknown>;
	const id = typeof record.id === 'string' ? record.id : null;
	if (!id) return null;
	const name = typeof record.name === 'string' ? record.name : titleFromId(id);
	return { id, name };
};

const titleFromId = (iconId: string): string => {
	const parts = iconId.split('-');
	if (parts.length <= 1) return iconId;
	const [maybeHash, ...rest] = parts;
	const isHash = /^[0-9a-f]{6}$/i.test(maybeHash);
	const slug = (isHash ? rest : parts).join('-');
	return slug
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
};

let manifestPromise: Promise<Icon[]> | null = null;

const loadManifest = async (): Promise<Icon[]> => {
	if (manifestPromise) return manifestPromise;
	manifestPromise = (async () => {
		try {
			const response = await fetch(MANIFEST_URL, { cache: 'force-cache' });
			if (!response.ok) throw new Error(`Manifest fetch failed (${response.status})`);
			const data = await response.json();
			if (!Array.isArray(data)) throw new Error('Manifest is not an array');
			const normalized = data
				.map((entry) => normalizeManifestEntry(entry))
				.filter((entry): entry is { id: string; name: string } => Boolean(entry));
			if (normalized.length === 0) {
				return FALLBACK_ICONS.map(createIcon);
			}
			return normalized.map(createIcon);
		} catch {
			return FALLBACK_ICONS.map(createIcon);
		}
	})();
	return manifestPromise;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	const bytes = new Uint8Array(buffer);
	const chunk = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
};

export const create3dIconsProvider = (): IconProvider => {
	return {
		id: '3dicons',
		name: '3dicons',
		async search(query?: string): Promise<Icon[]> {
			const catalog = await loadManifest();
			if (!query) return catalog;
			const normalized = query.trim().toLowerCase();
			if (!normalized) return catalog;
			return catalog.filter((icon) => {
				if (icon.name.toLowerCase().includes(normalized)) return true;
				return (icon.keywords || []).some((keyword) => keyword.toLowerCase().includes(normalized));
			});
		},
		async getVariants(iconId: string): Promise<IconVariant[]> {
			return STYLES.flatMap((style) =>
				ANGLES.map((angle) => ({
					style,
					angle,
					previewUrl: buildIconUrl(iconId, angle, PREVIEW_SIZE, style),
				})),
			);
		},
		async render(params: IconRenderParams): Promise<IconRenderResult> {
			const size = params.size || DEFAULT_RENDER_SIZE;
			const angle = params.angle || DEFAULT_ANGLE;
			const style = params.style || DEFAULT_STYLE;
			const url = buildIconUrl(params.iconId, angle, size, style);
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch icon render (${response.status})`);
			}
			const buffer = await response.arrayBuffer();
			return {
				mime: 'image/webp',
				dataBase64: arrayBufferToBase64(buffer),
				width: size,
				height: size,
				providerVersion: PROVIDER_VERSION,
				renderVersion: RENDER_VERSION,
				sourceUrl: url,
			};
		},
	};
};
