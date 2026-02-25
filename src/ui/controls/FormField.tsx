import React from 'react';
import { FORM_FIELD_CLASS, formFieldHintStyle, formFieldLabelStyle } from './control-styles';

interface FormFieldProps {
	id?: string;
	label?: string;
	hint?: string;
	children: React.ReactNode;
	style?: React.CSSProperties;
	labelStyle?: React.CSSProperties;
}

export const FormField: React.FC<FormFieldProps> = ({ id, label, hint, children, style, labelStyle }) => {
	return (
		<div className={FORM_FIELD_CLASS} style={style}>
			{label ? (
				<label htmlFor={id} style={{ ...formFieldLabelStyle, ...labelStyle }}>
					{label}
				</label>
			) : null}
			{children}
			{hint ? <div style={formFieldHintStyle}>{hint}</div> : null}
		</div>
	);
};
