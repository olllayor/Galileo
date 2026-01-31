import React, { useState, useRef, useEffect } from 'react';
import { Cursor, Square, TextAlignLeft, Hand, ArrowCounterClockwise, ArrowClockwise, Minus, Plus } from 'akar-icons';
import { colors, spacing, typography, radii, transitions, panels } from './design-system';

export type Tool = 'select' | 'hand' | 'rectangle' | 'text';

interface ToolbarProps {
	activeTool: Tool;
	onToolChange: (tool: Tool) => void;
	canUndo?: boolean;
	canRedo?: boolean;
	onUndo?: () => void;
	onRedo?: () => void;
	onSave?: () => void;
	onSaveAs?: () => void;
	onLoad?: () => void;
	onImport?: () => void;
	onExport?: () => void;
	zoom?: number;
	onZoomIn?: () => void;
	onZoomOut?: () => void;
	onZoomFit?: () => void;
	onZoom100?: () => void;
	fileName?: string;
	isDirty?: boolean;
}

interface MenuItemConfig {
	label?: string;
	shortcut?: string;
	action?: () => void;
	disabled?: boolean;
	separator?: boolean;
}

interface DropdownMenuProps {
	label: string;
	items: MenuItemConfig[];
	isOpen: boolean;
	onToggle: () => void;
	onClose: () => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ label, items, isOpen, onToggle, onClose }) => {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);

	return (
		<div ref={menuRef} style={{ position: 'relative' }}>
			<button
				type="button"
				onClick={onToggle}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: spacing.xs,
					padding: `${spacing.xs} ${spacing.sm}`,
					backgroundColor: isOpen ? colors.bg.active : 'transparent',
					border: 'none',
					borderRadius: radii.md,
					color: colors.text.secondary,
					fontSize: typography.fontSize.md,
					cursor: 'pointer',
					transition: `background-color ${transitions.fast}`,
				}}
				onMouseEnter={(e) => {
					if (!isOpen) e.currentTarget.style.backgroundColor = colors.bg.hover;
				}}
				onMouseLeave={(e) => {
					if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
				}}
			>
				{label}
			</button>

			{isOpen && (
				<div
					style={{
						position: 'absolute',
						top: '100%',
						left: 0,
						minWidth: '200px',
						marginTop: spacing.xs,
						padding: spacing.xs,
						backgroundColor: colors.bg.tertiary,
						border: `1px solid ${colors.border.default}`,
						borderRadius: radii.lg,
						boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
						zIndex: 1000,
					}}
				>
					{items.map((item, index) =>
						item.separator ? (
							<div
								key={`sep-${index}`}
								style={{
									height: '1px',
									backgroundColor: colors.border.subtle,
									margin: `${spacing.xs} 0`,
								}}
							/>
						) : (
							<button
								key={item.label}
								type="button"
								onClick={() => {
									item.action?.();
									onClose();
								}}
								disabled={item.disabled}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									width: '100%',
									padding: `${spacing.sm} ${spacing.md}`,
									backgroundColor: 'transparent',
									border: 'none',
									borderRadius: radii.md,
									color: item.disabled ? colors.text.disabled : colors.text.primary,
									fontSize: typography.fontSize.md,
									textAlign: 'left',
									cursor: item.disabled ? 'default' : 'pointer',
									transition: `background-color ${transitions.fast}`,
								}}
								onMouseEnter={(e) => {
									if (!item.disabled) e.currentTarget.style.backgroundColor = colors.bg.hover;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = 'transparent';
								}}
							>
								<span>{item.label}</span>
								{item.shortcut && (
									<span style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>{item.shortcut}</span>
								)}
							</button>
						),
					)}
				</div>
			)}
		</div>
	);
};

const ToolButton: React.FC<{
	icon: React.ReactNode;
	label: string;
	shortcut: string;
	isActive: boolean;
	onClick: () => void;
}> = ({ icon, label, shortcut, isActive, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		title={`${label} (${shortcut})`}
		style={{
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: '32px',
			height: '32px',
			padding: 0,
			backgroundColor: isActive ? colors.accent.primary : 'transparent',
			color: isActive ? colors.text.primary : colors.text.secondary,
			border: 'none',
			borderRadius: radii.md,
			cursor: 'pointer',
			transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
		}}
		onMouseEnter={(e) => {
			if (!isActive) {
				e.currentTarget.style.backgroundColor = colors.bg.hover;
				e.currentTarget.style.color = colors.text.primary;
			}
		}}
		onMouseLeave={(e) => {
			if (!isActive) {
				e.currentTarget.style.backgroundColor = 'transparent';
				e.currentTarget.style.color = colors.text.secondary;
			}
		}}
	>
		{icon}
	</button>
);

export const Toolbar: React.FC<ToolbarProps> = ({
	activeTool,
	onToolChange,
	canUndo = false,
	canRedo = false,
	onUndo,
	onRedo,
	onSave,
	onSaveAs,
	onLoad,
	onImport,
	onExport,
	zoom = 1,
	onZoomIn,
	onZoomOut,
	onZoomFit,
	onZoom100,
	fileName = 'Untitled',
	isDirty = false,
}) => {
	const [openMenu, setOpenMenu] = useState<string | null>(null);

	const fileMenuItems: MenuItemConfig[] = [
		{ label: 'New file', shortcut: '⌘N', disabled: true },
		{ label: 'Open...', shortcut: '⌘O', action: onLoad },
		{ separator: true },
		{ label: 'Save', shortcut: '⌘S', action: onSave },
		{ label: 'Save as...', shortcut: '⇧⌘S', action: onSaveAs },
		{ separator: true },
		{ label: 'Import image...', shortcut: '⌘I', action: onImport },
		{ label: 'Export...', shortcut: '⇧⌘E', action: onExport },
	];

	const editMenuItems: MenuItemConfig[] = [
		{ label: 'Undo', shortcut: '⌘Z', action: onUndo, disabled: !canUndo },
		{ label: 'Redo', shortcut: '⇧⌘Z', action: onRedo, disabled: !canRedo },
		{ separator: true },
		{ label: 'Cut', shortcut: '⌘X', disabled: true },
		{ label: 'Copy', shortcut: '⌘C', disabled: true },
		{ label: 'Paste', shortcut: '⌘V', disabled: true },
		{ separator: true },
		{ label: 'Select all', shortcut: '⌘A', disabled: true },
	];

	const viewMenuItems: MenuItemConfig[] = [
		{ label: 'Zoom in', shortcut: '⌘+', action: onZoomIn },
		{ label: 'Zoom out', shortcut: '⌘-', action: onZoomOut },
		{ label: 'Zoom to 100%', shortcut: '⌘0', action: onZoom100 },
		{ label: 'Zoom to fit', shortcut: '⇧1', action: onZoomFit },
	];

	const tools: { id: Tool; label: string; shortcut: string; icon: React.ReactNode }[] = [
		{ id: 'select', label: 'Move', shortcut: 'V', icon: <Cursor size={16} /> },
		{ id: 'hand', label: 'Hand', shortcut: 'H', icon: <Hand size={16} /> },
		{ id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square size={16} /> },
		{ id: 'text', label: 'Text', shortcut: 'T', icon: <TextAlignLeft size={16} /> },
	];

	const zoomPercent = Math.round(zoom * 100);

	return (
		<div
			style={{
				height: `${panels.toolbar.height}px`,
				display: 'flex',
				alignItems: 'center',
				padding: `0 ${spacing.sm}`,
				backgroundColor: colors.bg.secondary,
				borderBottom: `1px solid ${colors.border.subtle}`,
				gap: spacing.sm,
			}}
		>
			{/* Logo / Home */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '32px',
					height: '32px',
					backgroundColor: colors.accent.primary,
					borderRadius: radii.md,
					marginRight: spacing.sm,
				}}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
					<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
				</svg>
			</div>

			{/* Menus */}
			<DropdownMenu
				label="File"
				items={fileMenuItems}
				isOpen={openMenu === 'file'}
				onToggle={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
				onClose={() => setOpenMenu(null)}
			/>
			<DropdownMenu
				label="Edit"
				items={editMenuItems}
				isOpen={openMenu === 'edit'}
				onToggle={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}
				onClose={() => setOpenMenu(null)}
			/>
			<DropdownMenu
				label="View"
				items={viewMenuItems}
				isOpen={openMenu === 'view'}
				onToggle={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
				onClose={() => setOpenMenu(null)}
			/>

			{/* Divider */}
			<div
				style={{
					width: '1px',
					height: '20px',
					backgroundColor: colors.border.default,
					margin: `0 ${spacing.sm}`,
				}}
			/>

			{/* Tools */}
			<div style={{ display: 'flex', gap: '2px' }}>
				{tools.map((tool) => (
					<ToolButton
						key={tool.id}
						icon={tool.icon}
						label={tool.label}
						shortcut={tool.shortcut}
						isActive={activeTool === tool.id}
						onClick={() => onToolChange(tool.id)}
					/>
				))}
			</div>

			{/* Spacer */}
			<div style={{ flex: 1 }} />

			{/* File name */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: spacing.xs,
					padding: `${spacing.xs} ${spacing.sm}`,
					backgroundColor: colors.bg.primary,
					borderRadius: radii.md,
					fontSize: typography.fontSize.md,
					color: colors.text.primary,
				}}
			>
				<span>{fileName}</span>
				{isDirty && <span style={{ color: colors.text.tertiary }}>•</span>}
			</div>

			{/* Spacer */}
			<div style={{ flex: 1 }} />

			{/* Zoom controls */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '2px',
					padding: '2px',
					backgroundColor: colors.bg.primary,
					borderRadius: radii.md,
				}}
			>
				<button
					type="button"
					onClick={onZoomOut}
					title="Zoom out (⌘-)"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: '24px',
						height: '24px',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.sm,
						color: colors.text.secondary,
						cursor: 'pointer',
					}}
				>
					<Minus size={12} />
				</button>
				<span
					style={{
						minWidth: '48px',
						textAlign: 'center',
						fontSize: typography.fontSize.sm,
						color: colors.text.primary,
						fontFamily: typography.fontFamily.mono,
					}}
				>
					{zoomPercent}%
				</span>
				<button
					type="button"
					onClick={onZoomIn}
					title="Zoom in (⌘+)"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: '24px',
						height: '24px',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.sm,
						color: colors.text.secondary,
						cursor: 'pointer',
					}}
				>
					<Plus size={12} />
				</button>
			</div>

			{/* Undo/Redo */}
			<div style={{ display: 'flex', gap: '2px', marginLeft: spacing.sm }}>
				<button
					type="button"
					onClick={onUndo}
					disabled={!canUndo}
					title="Undo (⌘Z)"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: '28px',
						height: '28px',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.md,
						color: canUndo ? colors.text.secondary : colors.text.disabled,
						cursor: canUndo ? 'pointer' : 'default',
					}}
				>
					<ArrowCounterClockwise size={16} />
				</button>
				<button
					type="button"
					onClick={onRedo}
					disabled={!canRedo}
					title="Redo (⇧⌘Z)"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: '28px',
						height: '28px',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.md,
						color: canRedo ? colors.text.secondary : colors.text.disabled,
						cursor: canRedo ? 'pointer' : 'default',
					}}
				>
					<ArrowClockwise size={16} />
				</button>
			</div>
		</div>
	);
};
