import React from 'react';
import type { ComponentVariantMap, ComponentsLibrary, Document } from '../core/doc/types';
import { colors, panels, radii, spacing, typography } from './design-system';
import { AssetsPanel } from './AssetsPanel';
import { LayersPanel } from './LayersPanel';

type SidebarTab = 'layers' | 'assets';

interface LeftSidebarProps {
	document: Document;
	components: ComponentsLibrary;
	selectionIds: string[];
	renameRequestId?: string | null;
	width?: number;
	collapsed?: boolean;
	tab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
	onToggleCollapsed?: () => void;
	onRenameRequestHandled?: () => void;
	onSelect: (id: string) => void;
	onRename: (id: string, name?: string) => void;
	onToggleVisible: (id: string, nextVisible: boolean) => void;
	onToggleLocked: (id: string, nextLocked: boolean) => void;
	onReorder: (parentId: string, fromIndex: number, toIndex: number) => void;
	onCreateComponent: () => void;
	onInsertComponent: (componentId: string, variant?: ComponentVariantMap) => void;
	onRevealMain: (componentId: string) => void;
	onAddVariant: (setId: string, property: string, value: string) => void;
	recentComponentIds?: string[];
	assetsFocusNonce?: number;
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
	<button
		type="button"
		onClick={onClick}
		style={{
			padding: `${spacing.xs} ${spacing.sm}`,
			borderRadius: radii.sm,
			border: active ? `1px solid ${colors.border.focus}` : `1px solid transparent`,
			backgroundColor: active ? colors.bg.tertiary : 'transparent',
			color: active ? colors.text.primary : colors.text.tertiary,
			fontSize: typography.fontSize.sm,
			cursor: 'pointer',
		}}
	>
		{label}
	</button>
);

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
	document,
	components,
	selectionIds,
	renameRequestId,
	width = panels.left.width,
	collapsed = false,
	tab,
	onTabChange,
	onToggleCollapsed,
	onRenameRequestHandled,
	onSelect,
	onRename,
	onToggleVisible,
	onToggleLocked,
	onReorder,
	onCreateComponent,
	onInsertComponent,
	onRevealMain,
	onAddVariant,
	recentComponentIds = [],
	assetsFocusNonce = 0,
}) => {
	return (
		<div style={{ display: 'flex', flexDirection: 'column' }}>
			{!collapsed && (
				<div
					style={{
						width: `${width}px`,
						display: 'flex',
						alignItems: 'center',
						gap: spacing.xs,
						padding: spacing.sm,
						borderRight: `1px solid ${colors.border.subtle}`,
						borderBottom: `1px solid ${colors.border.subtle}`,
						backgroundColor: colors.bg.secondary,
					}}
				>
					<TabButton active={tab === 'layers'} onClick={() => onTabChange('layers')} label="Layers" />
					<TabButton active={tab === 'assets'} onClick={() => onTabChange('assets')} label="Assets" />
				</div>
			)}
			{tab === 'layers' ? (
				<LayersPanel
					document={document}
					selectionIds={selectionIds}
					renameRequestId={renameRequestId}
					width={width}
					collapsed={collapsed}
					onToggleCollapsed={onToggleCollapsed}
					onRenameRequestHandled={onRenameRequestHandled}
					onSelect={onSelect}
					onRename={onRename}
					onToggleVisible={onToggleVisible}
					onToggleLocked={onToggleLocked}
					onReorder={onReorder}
				/>
			) : (
				<AssetsPanel
					components={components}
					width={width}
					collapsed={collapsed}
					onToggleCollapsed={onToggleCollapsed}
					onCreateComponent={onCreateComponent}
					onInsertComponent={onInsertComponent}
					onRevealMain={onRevealMain}
					onAddVariant={onAddVariant}
					recentComponentIds={recentComponentIds}
					focusSearchNonce={assetsFocusNonce}
				/>
			)}
		</div>
	);
};
