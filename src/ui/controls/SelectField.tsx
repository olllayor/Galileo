import React from 'react';
import { FormField } from './FormField';
import { getSelectFieldStyle, SELECT_FIELD_CLASS, selectOptionStyle } from './control-styles';

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

interface SelectFieldProps {
	id?: string;
	label?: string;
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	disabled?: boolean;
	hint?: string;
	ariaLabel?: string;
	style?: React.CSSProperties;
	selectStyle?: React.CSSProperties;
}

export const SelectField: React.FC<SelectFieldProps> = ({
	id,
	label,
	value,
	onChange,
	options,
	disabled = false,
	hint,
	ariaLabel,
	style,
	selectStyle,
}) => {
	const generatedId = React.useId();
	const controlId = id ?? generatedId;

	const select = (
		<select
			id={controlId}
			className={SELECT_FIELD_CLASS}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			disabled={disabled}
			aria-label={ariaLabel ?? label}
			style={{ ...getSelectFieldStyle(disabled), ...selectStyle }}
		>
			{options.map((option) => (
				<option key={option.value} value={option.value} disabled={option.disabled} style={selectOptionStyle}>
					{option.label}
				</option>
			))}
		</select>
	);

	if (!label && !hint) {
		return <div style={style}>{select}</div>;
	}

	return (
		<FormField id={controlId} label={label} hint={hint} style={style}>
			{select}
		</FormField>
	);
};
