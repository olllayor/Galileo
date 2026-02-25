import React from 'react';
import { colors, radii, spacing, typography } from '../design-system';

interface EyeDropperLike {
	open: () => Promise<{ sRGBHex: string }>;
}

declare global {
	interface Window {
		EyeDropper?: {
			new (): EyeDropperLike;
		};
	}
}

interface EyedropperButtonProps {
	onPick: (hex: string) => void;
}

export const EyedropperButton: React.FC<EyedropperButtonProps> = ({ onPick }) => {
	const supported = typeof window !== 'undefined' && typeof window.EyeDropper === 'function';
	return (
		<button
			type="button"
			onClick={async () => {
				if (!supported) return;
				try {
					const picker = new window.EyeDropper!();
					const result = await picker.open();
					onPick(result.sRGBHex);
				} catch {
					// User cancelled eyedropper.
				}
			}}
			disabled={!supported}
			title={supported ? 'Sample color from screen' : 'Eyedropper not available in this browser'}
			style={{
				height: '32px',
				padding: `0 ${spacing.sm}`,
				borderRadius: radii.md,
				border: `1px solid ${colors.border.default}`,
				backgroundColor: colors.bg.tertiary,
				color: supported ? colors.text.secondary : colors.text.disabled,
				fontSize: typography.fontSize.sm,
				cursor: supported ? 'pointer' : 'not-allowed',
			}}
		>
			Sample color
		</button>
	);
};
