import React from 'react';
import type { ComponentVariantMap, ComponentsLibrary, Document, Page } from '../core/doc/types';
import { colors, panels, radii, spacing, typography } from './design-system';
import { AssetsPanel } from './AssetsPanel';
import { LayersPanel } from './LayersPanel';
import { PagesPanel } from './PagesPanel';

type SidebarTab = 'pages' | 'layers' | 'assets';

interface LeftSidebarProps {
	document: Document;
	pages: Page[];
	activePageId: string;
	components: ComponentsLibrary;
	selectionIds: string[];
	renameRequestId?: string | null;
	width?: number;
	collapsed?: boolean;
	isResizing?: boolean;
	tab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
	onToggleCollapsed?: () => void;
	onRenameRequestHandled?: () => void;
	onSelect: (id: string) => void;
	onRename: (id: string, name?: string) => void;
	onToggleVisible: (id: string, nextVisible: boolean) => void;
	onToggleLocked: (id: string, nextLocked: boolean) => void;
	onReorder: (parentId: string, fromIndex: number, toIndex: number) => void;
	onSelectPage: (pageId: string) => void;
	onCreatePage: () => void;
	onRenamePage: (pageId: string, name: string) => void;
	onReorderPage: (fromIndex: number, toIndex: number) => void;
	onDeletePage: (pageId: string) => void;
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
	pages,
	activePageId,
	components,
	selectionIds,
	renameRequestId,
	width = panels.left.width,
	collapsed = false,
	isResizing = false,
	tab,
	onTabChange,
	onToggleCollapsed,
	onRenameRequestHandled,
	onSelect,
	onRename,
	onToggleVisible,
	onToggleLocked,
	onReorder,
	onSelectPage,
	onCreatePage,
	onRenamePage,
	onReorderPage,
	onDeletePage,
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
					<TabButton active={tab === 'pages'} onClick={() => onTabChange('pages')} label="Pages" />
					<TabButton active={tab === 'layers'} onClick={() => onTabChange('layers')} label="Layers" />
					<TabButton active={tab === 'assets'} onClick={() => onTabChange('assets')} label="Assets" />
				</div>
			)}
			{tab === 'pages' ? (
				<PagesPanel
					pages={pages}
					activePageId={activePageId}
					width={width}
					collapsed={collapsed}
					isResizing={isResizing}
					onToggleCollapsed={onToggleCollapsed}
					onSelectPage={onSelectPage}
					onCreatePage={onCreatePage}
					onRenamePage={onRenamePage}
					onReorderPage={onReorderPage}
					onDeletePage={onDeletePage}
				/>
			) : tab === 'layers' ? (
				<LayersPanel
					document={document}
					selectionIds={selectionIds}
					renameRequestId={renameRequestId}
					width={width}
					collapsed={collapsed}
					isResizing={isResizing}
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
					isResizing={isResizing}
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
