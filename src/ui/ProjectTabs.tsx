import React from 'react';
import { colors, spacing, typography, transitions } from './design-system';

interface ProjectTabsProps {
	fileName: string;
	isDirty: boolean;
	editorMode?: 'design' | 'prototype';
	onEditorModeChange?: (mode: 'design' | 'prototype') => void;
}

export const ProjectTabs: React.FC<ProjectTabsProps> = ({
	fileName,
	isDirty,
	editorMode = 'design',
	onEditorModeChange,
}) => {
	const canToggleMode = typeof onEditorModeChange === 'function';

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: `0 ${spacing.md}`,
				height: '30px',
				borderTop: `1px solid rgba(255, 255, 255, 0.04)`,
				borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
				color: colors.text.secondary,
				fontSize: typography.fontSize.sm,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: spacing.xs,
					color: colors.text.primary,
					paddingTop: '2px',
					paddingBottom: '3px',
					borderBottom: `1.5px solid ${colors.accent.primary}`,
					transition: `border-color ${transitions.fast}`,
				}}
				title={fileName}
			>
				<span style={{ fontSize: typography.fontSize.lg }}>{fileName}</span>
				{isDirty && <span style={{ color: colors.accent.primary, fontSize: typography.fontSize.sm }}>●</span>}
			</div>

			{canToggleMode && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.xs,
					}}
				>
					{(['design', 'prototype'] as const).map((mode) => {
						const active = editorMode === mode;
						return (
							<button
								key={mode}
								type="button"
								onClick={() => onEditorModeChange(mode)}
								style={{
									border: active ? `1px solid ${colors.border.focus}` : '1px solid transparent',
									backgroundColor: active ? colors.bg.tertiary : 'transparent',
									color: active ? colors.text.primary : colors.text.tertiary,
									fontSize: typography.fontSize.sm,
									padding: `2px ${spacing.sm}`,
									borderRadius: '6px',
									cursor: 'pointer',
								}}
							>
								{mode === 'design' ? 'Design' : 'Prototype'}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};
