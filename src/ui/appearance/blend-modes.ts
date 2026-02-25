import type { LayerBlendMode } from '../../core/doc/types';
import type { SelectOption } from '../controls/SelectField';

export const BLEND_MODE_OPTIONS: Array<{ value: LayerBlendMode; label: string }> = [
	{ value: 'normal', label: 'Normal' },
	{ value: 'multiply', label: 'Multiply' },
	{ value: 'screen', label: 'Screen' },
	{ value: 'overlay', label: 'Overlay' },
	{ value: 'darken', label: 'Darken' },
	{ value: 'lighten', label: 'Lighten' },
	{ value: 'color-dodge', label: 'Color Dodge' },
	{ value: 'color-burn', label: 'Color Burn' },
	{ value: 'hard-light', label: 'Hard Light' },
	{ value: 'soft-light', label: 'Soft Light' },
	{ value: 'difference', label: 'Difference' },
	{ value: 'exclusion', label: 'Exclusion' },
	{ value: 'hue', label: 'Hue' },
	{ value: 'saturation', label: 'Saturation' },
	{ value: 'color', label: 'Color' },
	{ value: 'luminosity', label: 'Luminosity' },
];

export const BLEND_MODE_SELECT_OPTIONS: SelectOption[] = BLEND_MODE_OPTIONS.map((option) => ({
	value: option.value,
	label: option.label,
}));
