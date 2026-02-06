import React from 'react';
import { colors, spacing, typography, transitions } from './design-system';

interface ProjectTabsProps {
	fileName: string;
	isDirty: boolean;
	contentType?: 'design' | 'prototype' | 'asset' | 'doc';
	aiState?: 'none' | 'passive' | 'active';
	onClose?: () => void;
}

export const ProjectTabs: React.FC<ProjectTabsProps> = ({ fileName, isDirty }) => {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
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
		</div>
	);
};
