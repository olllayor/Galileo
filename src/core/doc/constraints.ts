import type { Constraints } from './types';

export type LocalBounds = { x: number; y: number; width: number; height: number };

export const DEFAULT_CONSTRAINTS: Constraints = { horizontal: 'left', vertical: 'top' };

export const resolveConstraints = (constraints?: Partial<Constraints> | null): Constraints => ({
	horizontal: constraints?.horizontal ?? DEFAULT_CONSTRAINTS.horizontal,
	vertical: constraints?.vertical ?? DEFAULT_CONSTRAINTS.vertical,
});

const clampSize = (value: number, min = 1): number => {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, value);
};

export const computeConstrainedBounds = (
	bounds: LocalBounds,
	constraints: Constraints,
	parentStart: { width: number; height: number },
	parentNext: { width: number; height: number },
): LocalBounds => {
	const startWidth = Number.isFinite(parentStart.width) ? parentStart.width : 0;
	const startHeight = Number.isFinite(parentStart.height) ? parentStart.height : 0;
	const nextWidth = Number.isFinite(parentNext.width) ? parentNext.width : startWidth;
	const nextHeight = Number.isFinite(parentNext.height) ? parentNext.height : startHeight;

	if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
		return bounds;
	}
	if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
		return bounds;
	}

	const left = bounds.x;
	const right = startWidth - (bounds.x + bounds.width);
	const top = bounds.y;
	const bottom = startHeight - (bounds.y + bounds.height);
	const centerOffsetX = bounds.x + bounds.width / 2 - startWidth / 2;
	const centerOffsetY = bounds.y + bounds.height / 2 - startHeight / 2;

	let x = bounds.x;
	let y = bounds.y;
	let width = bounds.width;
	let height = bounds.height;

	switch (constraints.horizontal) {
		case 'right':
			x = nextWidth - right - width;
			break;
		case 'left-right':
			x = left;
			width = clampSize(nextWidth - left - right);
			break;
		case 'center':
			x = nextWidth / 2 + centerOffsetX - width / 2;
			break;
		case 'left':
		default:
			x = left;
			break;
	}

	switch (constraints.vertical) {
		case 'bottom':
			y = nextHeight - bottom - height;
			break;
		case 'top-bottom':
			y = top;
			height = clampSize(nextHeight - top - bottom);
			break;
		case 'center':
			y = nextHeight / 2 + centerOffsetY - height / 2;
			break;
		case 'top':
		default:
			y = top;
			break;
	}

	return { x, y, width, height };
};
