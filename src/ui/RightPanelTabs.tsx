import React from 'react';
import { colors, spacing, typography, radii } from './design-system';

type RightPanelTab = 'properties' | 'ai';

interface RightPanelTabsProps {
	activeTab: RightPanelTab;
	onChange: (tab: RightPanelTab) => void;
}

export const RightPanelTabs: React.FC<RightPanelTabsProps> = ({ activeTab, onChange }) => {
	const renderTabButton = (tab: RightPanelTab, label: string) => {
		const active = activeTab === tab;
		return (
			<button
				key={tab}
				type="button"
				onClick={() => onChange(tab)}
				style={{
					border: active ? `1px solid ${colors.border.focus}` : `1px solid transparent`,
					backgroundColor: active ? colors.bg.tertiary : 'transparent',
					color: active ? colors.text.primary : colors.text.tertiary,
					fontSize: typography.fontSize.sm,
					padding: `3px ${spacing.sm}`,
					borderRadius: radii.md,
					cursor: 'pointer',
				}}
			>
				{label}
			</button>
		);
	};

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: spacing.xs,
				padding: `${spacing.sm} ${spacing.sm} ${spacing.xs}`,
				borderBottom: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.secondary,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
				{renderTabButton('properties', 'Properties')}
				{renderTabButton('ai', 'AI')}
			</div>
			<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Cmd/Ctrl+J</div>
		</div>
	);
};
