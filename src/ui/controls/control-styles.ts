import type React from 'react';
import { colors, radii, spacing, typography } from '../design-system';

export const SELECT_FIELD_CLASS = 'gal-select-field';
export const FORM_FIELD_CLASS = 'gal-form-field';

export const formFieldLabelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: typography.fontSize.xs,
	fontWeight: typography.fontWeight.medium,
	color: colors.text.tertiary,
	letterSpacing: '0.02em',
	marginBottom: '4px',
};

export const formFieldHintStyle: React.CSSProperties = {
	marginTop: '4px',
	fontSize: typography.fontSize.xs,
	color: colors.text.tertiary,
};

const selectChevron = encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none'><path d='M1 1.5 6 6.5 11 1.5' stroke='rgba(255,255,255,0.72)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
);

export const getSelectFieldStyle = (disabled = false): React.CSSProperties => ({
	width: '100%',
	height: '30px',
	padding: `0 ${spacing.xl} 0 ${spacing.sm}`,
	borderRadius: radii.md,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: disabled ? colors.bg.primary : colors.bg.tertiary,
	backgroundImage: `url("data:image/svg+xml,${selectChevron}")`,
	backgroundPosition: `right ${spacing.sm} center`,
	backgroundRepeat: 'no-repeat',
	backgroundSize: '11px 8px',
	color: disabled ? colors.text.disabled : colors.text.primary,
	fontSize: typography.fontSize.md,
	fontFamily: typography.fontFamily.sans,
	lineHeight: '30px',
	appearance: 'none',
	WebkitAppearance: 'none',
	MozAppearance: 'none',
	outline: 'none',
	cursor: disabled ? 'not-allowed' : 'pointer',
});

export const selectOptionStyle: React.CSSProperties = {
	backgroundColor: colors.bg.secondary,
	color: colors.text.primary,
};
