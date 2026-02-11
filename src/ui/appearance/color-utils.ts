export type Rgba = { r: number; g: number; b: number; a: number };
export type Hsva = { h: number; s: number; v: number; a: number };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const padHex = (value: number): string => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

export const normalizeHex = (value: string, fallback = '#888888'): string => {
	const input = value.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) {
		if (input.length === 4) {
			return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}`.toLowerCase();
		}
		return input.toLowerCase();
	}
	return fallback;
};

export const rgbaToHex = (rgba: Pick<Rgba, 'r' | 'g' | 'b'>): string => {
	return `#${padHex(rgba.r)}${padHex(rgba.g)}${padHex(rgba.b)}`;
};

export const parseColor = (value: string, fallback = '#888888'): Rgba => {
	const input = value.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) {
		const hex = normalizeHex(input, fallback);
		return {
			r: Number.parseInt(hex.slice(1, 3), 16),
			g: Number.parseInt(hex.slice(3, 5), 16),
			b: Number.parseInt(hex.slice(5, 7), 16),
			a: 1,
		};
	}
	const rgbaMatch = input.match(/^rgba?\(([^)]+)\)$/i);
	if (!rgbaMatch) {
		return parseColor(fallback, '#888888');
	}
	const parts = rgbaMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
	if (parts.length < 3 || parts.slice(0, 3).some((entry) => !Number.isFinite(entry))) {
		return parseColor(fallback, '#888888');
	}
	return {
		r: clamp(parts[0], 0, 255),
		g: clamp(parts[1], 0, 255),
		b: clamp(parts[2], 0, 255),
		a: clamp(parts[3] ?? 1, 0, 1),
	};
};

export const toColorString = (rgba: Rgba): string => {
	const hex = rgbaToHex(rgba);
	if (rgba.a >= 0.999) return hex;
	const alpha = clamp(rgba.a, 0, 1).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
	return `rgba(${Math.round(rgba.r)}, ${Math.round(rgba.g)}, ${Math.round(rgba.b)}, ${alpha})`;
};

export const rgbaToHsva = (rgba: Rgba): Hsva => {
	const r = clamp(rgba.r, 0, 255) / 255;
	const g = clamp(rgba.g, 0, 255) / 255;
	const b = clamp(rgba.b, 0, 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	let h = 0;
	if (delta > 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	const s = max === 0 ? 0 : delta / max;
	return {
		h,
		s,
		v: max,
		a: clamp(rgba.a, 0, 1),
	};
};

export const hsvaToRgba = (hsva: Hsva): Rgba => {
	const h = ((hsva.h % 360) + 360) % 360;
	const s = clamp(hsva.s, 0, 1);
	const v = clamp(hsva.v, 0, 1);
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let rp = 0;
	let gp = 0;
	let bp = 0;
	if (h < 60) {
		rp = c;
		gp = x;
	} else if (h < 120) {
		rp = x;
		gp = c;
	} else if (h < 180) {
		gp = c;
		bp = x;
	} else if (h < 240) {
		gp = x;
		bp = c;
	} else if (h < 300) {
		rp = x;
		bp = c;
	} else {
		rp = c;
		bp = x;
	}
	return {
		r: Math.round((rp + m) * 255),
		g: Math.round((gp + m) * 255),
		b: Math.round((bp + m) * 255),
		a: clamp(hsva.a, 0, 1),
	};
};

export const withAlpha = (color: string, alpha: number): string => {
	const parsed = parseColor(color);
	return toColorString({ ...parsed, a: clamp(alpha, 0, 1) });
};
