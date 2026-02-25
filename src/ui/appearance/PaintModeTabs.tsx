import React from 'react';
import { colors } from '../design-system';

export type PaintMode = 'solid' | 'gradient' | 'pattern' | 'image';

interface PaintModeTabsProps {
	value: PaintMode;
	onChange: (mode: PaintMode) => void;
	onBlendShortcut?: () => void;
}

const MODES: Array<{ mode: PaintMode; label: string; icon: React.ReactNode }> = [
	{
		mode: 'solid',
		label: 'Solid',
		icon: (
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
				<rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
			</svg>
		),
	},
	{
		mode: 'gradient',
		label: 'Gradient',
		icon: (
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
				<rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
				<circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
				<circle cx="7" cy="7" r="1" fill="currentColor" />
				<circle cx="9.5" cy="9.5" r="1" fill="currentColor" />
			</svg>
		),
	},
	{
		mode: 'pattern',
		label: 'Pattern',
		icon: (
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
				<rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
				<path d="M5.5 2.7v8.6M8.5 2.7v8.6M2.7 5.5h8.6M2.7 8.5h8.6" stroke="currentColor" strokeWidth="0.9" />
			</svg>
		),
	},
	{
		mode: 'image',
		label: 'Image',
		icon: (
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
				<rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
				<circle cx="5" cy="5" r="1" fill="currentColor" />
				<path d="M3.6 10l2.1-2 1.8 1.5 1.8-2.1 1.1 2.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
			</svg>
		),
	},
];

const iconButtonBase: React.CSSProperties = {
	height: '24px',
	width: '24px',
	display: 'grid',
	placeItems: 'center',
	borderRadius: '6px',
	border: `1px solid ${colors.border.default}`,
	backgroundColor: 'rgba(255,255,255,0.02)',
	color: colors.text.secondary,
	cursor: 'pointer',
};

export const PaintModeTabs: React.FC<PaintModeTabsProps> = ({ value, onChange, onBlendShortcut }) => {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '2px',
			}}
		>
			{MODES.map((entry) => {
				const active = entry.mode === value;
				return (
					<button
						key={entry.mode}
						type="button"
						onClick={() => onChange(entry.mode)}
						aria-pressed={active}
						title={entry.label}
						style={{
							...iconButtonBase,
							border: `1px solid ${active ? 'rgba(255,255,255,0.26)' : colors.border.default}`,
							backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
							color: active ? colors.text.primary : colors.text.secondary,
						}}
					>
						{entry.icon}
					</button>
				);
			})}
			<button
				type="button"
				title="Video (coming soon)"
				aria-disabled
				onClick={() => {
					// Placeholder for future video paint mode.
				}}
				style={{
					...iconButtonBase,
					color: 'rgba(255,255,255,0.44)',
					cursor: 'default',
				}}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
					<rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
					<path d="M6 5l3 2-3 2V5z" fill="currentColor" />
				</svg>
			</button>
			<div style={{ flex: 1 }} />
			<button type="button" title="Blend mode" onClick={onBlendShortcut} style={iconButtonBase}>
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
					<path
						d="M7 2.2c1.8 2 3 3.6 3 5.1A3 3 0 0 1 7 10.2a3 3 0 0 1-3-2.9c0-1.5 1.2-3.1 3-5.1z"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.25"
					/>
				</svg>
			</button>
			<button type="button" title="Advanced paint settings" style={iconButtonBase}>
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
					<circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
					<path d="M2.8 7h3.1M8.1 7h3.1M7 2.8v3.1M7 8.1v3.1" stroke="currentColor" strokeWidth="1.1" />
				</svg>
			</button>
		</div>
	);
};
