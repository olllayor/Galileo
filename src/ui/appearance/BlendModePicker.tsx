import React from 'react';
import type { LayerBlendMode } from '../../core/doc/types';
import { SelectField } from '../controls/SelectField';
import { BLEND_MODE_SELECT_OPTIONS } from './blend-modes';

interface BlendModePickerProps {
	id?: string;
	label?: string;
	value?: LayerBlendMode;
	onChange: (value: LayerBlendMode) => void;
	disabled?: boolean;
	hint?: string;
}

export const BlendModePicker: React.FC<BlendModePickerProps> = ({
	id,
	label = 'Blend mode',
	value = 'normal',
	onChange,
	disabled,
	hint,
}) => {
	return (
		<SelectField
			id={id}
			label={label}
			value={value}
			onChange={(next) => onChange(next as LayerBlendMode)}
			options={BLEND_MODE_SELECT_OPTIONS}
			disabled={disabled}
			hint={hint}
		/>
	);
};
