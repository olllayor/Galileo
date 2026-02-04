import React from 'react';
import { colors, spacing, typography, transitions } from './design-system';

interface ProjectTabsProps {
	fileName: string;
	isDirty: boolean;
	contentType?: 'design' | 'prototype' | 'asset' | 'doc';
	aiState?: 'none' | 'passive' | 'active';
	onClose?: () => void;
}

const typeLabel: Record<NonNullable<ProjectTabsProps['contentType']>, string> = {
	design: 'Design',
	prototype: 'Prototype',
	asset: 'Asset',
	doc: 'Doc',
};

export const ProjectTabs: React.FC<ProjectTabsProps> = ({ fileName, isDirty, contentType = 'design' }) => {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: spacing.md,
				padding: `0 ${spacing.md}`,
				height: '28px',
				borderBottom: `1px solid ${colors.border.subtle}`,
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
					paddingBottom: '4px',
					borderBottom: `2px solid ${colors.accent.primary}`,
					transition: `border-color ${transitions.fast}`,
				}}
			>
				<span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>{typeLabel[contentType]}</span>
				<span style={{ fontSize: typography.fontSize.md }}>{fileName}</span>
				{isDirty && <span style={{ color: colors.accent.primary }}>●</span>}
			</div>
		</div>
	);
};
