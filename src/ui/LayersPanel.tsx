import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { Document, Node } from '../core/doc/types';
import { colors, spacing, typography, radii, transitions, panels } from './design-system';

const TYPE_LABELS: Record<Node['type'], string> = {
	frame: 'Frame',
	group: 'Group',
	rectangle: 'Rectangle',
	text: 'Text',
	image: 'Image',
	componentInstance: 'Component',
	ellipse: 'Ellipse',
	path: 'Path',
	boolean: 'Boolean',
};

type LayerRow = {
	id: string;
	parentId: string;
	depth: number;
	name: string;
	rawName?: string;
	type: Node['type'];
	hasChildren: boolean;
	isExpanded: boolean;
	isVisible: boolean;
	isLocked: boolean;
};

type DragState = {
	id: string;
	parentId: string;
};

type DropIndicator = {
	parentId: string;
	index: number;
	top: number;
};

interface LayersPanelProps {
	document: Document;
	selectionIds: string[];
	renameRequestId?: string | null;
	width?: number;
	collapsed?: boolean;
	onToggleCollapsed?: () => void;
	onRenameRequestHandled?: () => void;
	onSelect: (id: string) => void;
	onRename: (id: string, name?: string) => void;
	onToggleVisible: (id: string, nextVisible: boolean) => void;
	onToggleLocked: (id: string, nextLocked: boolean) => void;
	onReorder: (parentId: string, fromIndex: number, toIndex: number) => void;
}

const getDisplayName = (node: Node): string => {
	if (node.name && node.name.trim().length > 0) {
		return node.name;
	}
	return TYPE_LABELS[node.type] || node.type;
};

export const LayersPanel: React.FC<LayersPanelProps> = ({
	document,
	selectionIds,
	renameRequestId,
	width = panels.left.width,
	collapsed = false,
	onToggleCollapsed,
	onRenameRequestHandled,
	onSelect,
	onRename,
	onToggleVisible,
	onToggleLocked,
	onReorder,
}) => {
	const root = document.nodes[document.rootId];
	const parentMap = useMemo(() => {
		const map: Record<string, string | null> = {};
		for (const node of Object.values(document.nodes)) {
			if (!node.children) continue;
			for (const childId of node.children) {
				map[childId] = node.id;
			}
		}
		return map;
	}, [document]);
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		if (!root?.children) return initial;
		const stack = [...root.children];
		while (stack.length > 0) {
			const id = stack.pop()!;
			const node = document.nodes[id];
			if (!node) continue;
			if (node.children && node.children.length > 0) {
				initial.add(id);
				for (const childId of node.children) {
					stack.push(childId);
				}
			}
		}
		return initial;
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingOriginal, setEditingOriginal] = useState('');
	const [draftName, setDraftName] = useState('');
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (editingId && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editingId]);

	const rows = useMemo(() => {
		const result: LayerRow[] = [];
		if (!root?.children) return result;

		const walk = (id: string, depth: number, parentId: string) => {
			const node = document.nodes[id];
			if (!node) return;
			const hasChildren = Boolean(node.children && node.children.length > 0);
			const isExpanded = hasChildren && expandedIds.has(id);
			const isVisible = node.visible !== false;
			const isLocked = node.locked === true;
			result.push({
				id,
				parentId,
				depth,
				name: getDisplayName(node),
				rawName: node.name,
				type: node.type,
				hasChildren,
				isExpanded,
				isVisible,
				isLocked,
			});
			if (hasChildren && isExpanded) {
				for (const childId of node.children!) {
					walk(childId, depth + 1, id);
				}
			}
		};

		for (const childId of root.children) {
			walk(childId, 0, document.rootId);
		}

		return result;
	}, [document, expandedIds, root]);

	const toggleExpanded = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const beginRenameById = useCallback(
		(id: string) => {
			const node = document.nodes[id];
			if (!node) return;
			setEditingId(id);
			setEditingOriginal(node.name ?? '');
			setDraftName(node.name ?? getDisplayName(node));
		},
		[document.nodes],
	);

	const cancelRename = () => {
		setEditingId(null);
		setEditingOriginal('');
		setDraftName('');
	};

	const commitRename = () => {
		if (!editingId) return;
		const nextName = draftName.trim();
		if (nextName !== editingOriginal) {
			onRename(editingId, nextName.length > 0 ? nextName : undefined);
		}
		cancelRename();
	};

	const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (editingId) return;
		if (rows.length === 0) return;
		const selectedId = selectionIds[0];
		const currentIndex = rows.findIndex((row) => row.id === selectedId);

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next = rows[Math.min(rows.length - 1, currentIndex + 1)];
			if (next) onSelect(next.id);
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const next = rows[Math.max(0, currentIndex - 1)];
			if (next) onSelect(next.id);
		}

		if (event.key === 'Enter' && selectedId) {
			event.preventDefault();
			beginRenameById(selectedId);
		}
	};

	useEffect(() => {
		if (!renameRequestId) return;
		const node = document.nodes[renameRequestId];
		if (!node) {
			onRenameRequestHandled?.();
			return;
		}
		const ancestors: string[] = [];
		let current = parentMap[renameRequestId];
		while (current && current !== document.rootId) {
			ancestors.push(current);
			current = parentMap[current] ?? null;
		}
		if (ancestors.length > 0) {
			setExpandedIds((prev) => {
				const next = new Set(prev);
				for (const id of ancestors) {
					next.add(id);
				}
				return next;
			});
		}
		beginRenameById(renameRequestId);
		onRenameRequestHandled?.();
		}, [renameRequestId, document, parentMap, beginRenameById, onRenameRequestHandled]);

	const getSiblings = (parentId: string, excludeId?: string): string[] => {
		const parent = document.nodes[parentId];
		if (!parent?.children) return [];
		return excludeId ? parent.children.filter((id) => id !== excludeId) : [...parent.children];
	};

	const handleDragStart = (event: React.DragEvent<HTMLDivElement>, row: LayerRow) => {
		if (!selectionIds.includes(row.id)) {
			onSelect(row.id);
		}
		setDragState({ id: row.id, parentId: row.parentId });
		setDropIndicator(null);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', row.id);
	};

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>, row: LayerRow) => {
		if (!dragState) return;
		if (row.parentId !== dragState.parentId) {
			setDropIndicator(null);
			return;
		}
		if (row.id === dragState.id) {
			setDropIndicator(null);
			return;
		}
		event.preventDefault();

		const siblings = getSiblings(row.parentId, dragState.id);
		const rowIndex = siblings.indexOf(row.id);
		if (rowIndex === -1) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const insertAfter = event.clientY > rect.top + rect.height / 2;
		const dropIndex = rowIndex + (insertAfter ? 1 : 0);

		const listRect = listRef.current?.getBoundingClientRect();
		const listTop = listRect?.top ?? 0;
		const scrollTop = containerRef.current?.scrollTop ?? 0;
		const top = (insertAfter ? rect.bottom : rect.top) - listTop + scrollTop;

		setDropIndicator({ parentId: row.parentId, index: dropIndex, top });
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>, row: LayerRow) => {
		if (!dragState) return;
		if (row.parentId !== dragState.parentId) return;
		if (row.id === dragState.id) return;
		event.preventDefault();

		const parent = document.nodes[dragState.parentId];
		if (!parent?.children) return;

		const fromIndex = parent.children.indexOf(dragState.id);
		if (fromIndex === -1) return;

		const siblings = getSiblings(row.parentId, dragState.id);
		const rowIndex = siblings.indexOf(row.id);
		if (rowIndex === -1) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const insertAfter = event.clientY > rect.top + rect.height / 2;
		let toIndex = rowIndex + (insertAfter ? 1 : 0);
		if (toIndex < 0) toIndex = 0;
		if (toIndex > siblings.length) toIndex = siblings.length;

		if (toIndex !== fromIndex) {
			onReorder(dragState.parentId, fromIndex, toIndex);
		}

		setDragState(null);
		setDropIndicator(null);
	};

	const handleDragEnd = () => {
		setDragState(null);
		setDropIndicator(null);
	};

	const handleListDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		if (!dragState) return;
		if (event.currentTarget === event.target) {
			setDropIndicator(null);
		}
	};

	const renderToggleButton = (
		label: string,
		title: string,
		active: boolean,
		onClick: (event: React.MouseEvent<HTMLButtonElement>) => void,
	) => (
		<button
			type="button"
			title={title}
			onClick={onClick}
			draggable={false}
			style={{
				width: '18px',
				height: '18px',
				border: 'none',
				backgroundColor: 'transparent',
				color: active ? colors.text.secondary : colors.text.disabled,
				borderRadius: radii.sm,
				fontSize: typography.fontSize.xs,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'pointer',
				transition: `color ${transitions.fast}`,
				opacity: 0,
			}}
			className="layer-toggle-btn"
		>
			{label === 'V' ? (
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					{active ? (
						<>
							<circle cx="12" cy="12" r="3" />
							<path d="M2.5 12a10 10 0 0 1 19 0 10 10 0 0 1-19 0" />
						</>
					) : (
						<>
							<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
							<line x1="1" y1="1" x2="23" y2="23" />
						</>
					)}
				</svg>
			) : (
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					{active ? (
						<>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</>
					) : (
						<>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
							<path d="M7 11V7a5 5 0 0 1 9.9-1" />
						</>
					)}
				</svg>
			)}
		</button>
	);

	// Collapsed rail mode
	if (collapsed) {
		return (
			<div
				style={{
					width: `${panels.left.collapsedWidth}px`,
					borderRight: `1px solid ${colors.border.subtle}`,
					backgroundColor: 'rgba(25, 26, 28, 0.92)',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: spacing.sm,
					transition: `width ${transitions.normal}`,
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Layers"
					style={{
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.md,
						cursor: 'pointer',
						color: colors.text.secondary,
						fontSize: '14px',
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
				<div
					style={{
						marginTop: spacing.sm,
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'rgba(255, 255, 255, 0.05)',
						borderRadius: radii.md,
						fontSize: typography.fontSize.xs,
						fontWeight: typography.fontWeight.semibold,
						color: colors.text.secondary,
					}}
					title="Layers"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<polygon points="12 2 2 7 12 12 22 7 12 2" />
						<polyline points="2 17 12 22 22 17" />
						<polyline points="2 12 12 17 22 12" />
					</svg>
				</div>
				{selectionIds.length > 0 && (
					<div
						style={{
							marginTop: spacing.sm,
							minWidth: '18px',
							height: '18px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: colors.accent.primary,
							borderRadius: radii.full,
							fontSize: typography.fontSize.xs,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text.primary,
							padding: `0 ${spacing.xs}`,
						}}
						title={`${selectionIds.length} selected`}
					>
						{selectionIds.length}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			onKeyDown={handleRowKeyDown}
			style={{
				width: `${width}px`,
				borderRight: `1px solid ${colors.border.subtle}`,
				backgroundColor: 'rgba(25, 26, 28, 0.92)',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
				cursor: dragState && !dropIndicator ? 'not-allowed' : undefined,
				transition: `width ${transitions.normal}`,
			}}
		>
			{/* Panel Header */}
			<div
				style={{
					height: '40px',
					padding: `0 ${spacing.md}`,
					fontSize: typography.fontSize.lg,
					fontWeight: typography.fontWeight.semibold,
					color: colors.text.secondary,
					borderBottom: `1px solid ${colors.border.subtle}`,
					position: 'sticky',
					top: 0,
					backgroundColor: 'rgba(25, 26, 28, 0.94)',
					zIndex: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					letterSpacing: '0.2px',
				}}
			>
				<span>Layers</span>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Collapse panel"
					style={{
						width: '20px',
						height: '20px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.sm,
						cursor: 'pointer',
						color: colors.text.tertiary,
						fontSize: '12px',
						transition: `color ${transitions.fast}`,
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = colors.text.primary;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = colors.text.tertiary;
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>
			</div>

			{/* Layer List */}
			<div
				ref={listRef}
				onDragOver={handleListDragOver}
				onDrop={handleDragEnd}
				style={{ position: 'relative', flex: 1, overflow: 'auto', padding: `${spacing.xs} 0` }}
			>
				{rows.map((row) => {
					const isSelected = selectionIds.includes(row.id);
					const isEditing = editingId === row.id;
					const rowColor = row.isLocked
						? colors.text.disabled
						: row.isVisible
							? colors.text.primary
							: colors.text.tertiary;
					const isDraggingRow = dragState?.id === row.id;
					return (
						<div
							key={row.id}
							draggable={!isEditing}
							onDragStart={(event) => handleDragStart(event, row)}
							onDragOver={(event) => handleDragOver(event, row)}
							onDrop={(event) => handleDrop(event, row)}
							onDragEnd={handleDragEnd}
							onClick={() => onSelect(row.id)}
							onDoubleClick={() => beginRenameById(row.id)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: spacing.xs,
								padding: `${spacing.xs} ${spacing.sm}`,
								paddingLeft: `${8 + row.depth * 12}px`,
								margin: `0 ${spacing.xs}`,
								backgroundColor: isSelected ? colors.bg.selected : 'transparent',
								color: rowColor,
								fontSize: typography.fontSize.md,
								borderRadius: radii.sm,
								userSelect: 'none',
								opacity: isDraggingRow ? 0.5 : 1,
								transition: `background-color ${transitions.fast}`,
								border: isSelected ? `1px solid ${colors.accent.primary}` : '1px solid transparent',
							}}
							onMouseEnter={(e) => {
								if (!isSelected) e.currentTarget.style.backgroundColor = colors.bg.hover;
							}}
							onMouseLeave={(e) => {
								if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
							}}
						>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									if (row.hasChildren) toggleExpanded(row.id);
								}}
								draggable={false}
								style={{
									width: '14px',
									height: '14px',
									border: 'none',
									background: 'transparent',
									color: colors.text.tertiary,
									cursor: row.hasChildren ? 'pointer' : 'default',
									padding: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									transition: `transform ${transitions.fast}`,
									transform: row.hasChildren && row.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
								}}
								title={row.hasChildren ? (row.isExpanded ? 'Collapse' : 'Expand') : undefined}
							>
								{row.hasChildren ? (
									<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
										<path d="M2 1l4 3-4 3V1z" />
									</svg>
								) : null}
							</button>

							<div
								style={{
									width: '14px',
									height: '14px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									color: colors.text.tertiary,
									flexShrink: 0,
								}}
							>
								{row.type === 'frame' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<rect x="2" y="2" width="12" height="12" rx="2" />
									</svg>
								) : row.type === 'group' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<rect x="1" y="4" width="8" height="8" rx="1" />
										<rect x="7" y="4" width="8" height="8" rx="1" />
									</svg>
								) : row.type === 'text' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<path d="M3 4h10M8 4v9M5 13h6" />
									</svg>
								) : row.type === 'rectangle' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
										<rect x="2" y="4" width="12" height="8" />
									</svg>
								) : row.type === 'ellipse' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
										<ellipse cx="8" cy="8" rx="6" ry="4" />
									</svg>
								) : row.type === 'image' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<rect x="2" y="2" width="12" height="12" rx="1" />
										<circle cx="5" cy="5" r="1.5" fill="currentColor" />
										<path d="M2 11l3-3 2 2 4-4 3 3" />
									</svg>
								) : row.type === 'path' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<path d="M2 14C2 8 8 8 8 2S14 8 14 14" />
									</svg>
								) : row.type === 'boolean' ? (
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
										<circle cx="6" cy="8" r="4" />
										<circle cx="10" cy="8" r="4" />
									</svg>
								) : (
									'*'
								)}
							</div>

							{isEditing ? (
								<input
									ref={inputRef}
									value={draftName}
									onChange={(event) => setDraftName(event.target.value)}
									onBlur={commitRename}
									draggable={false}
									onKeyDown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											commitRename();
										}
										if (event.key === 'Escape') {
											event.preventDefault();
											cancelRename();
										}
									}}
									style={{
										flex: 1,
										fontSize: typography.fontSize.md,
										padding: `2px ${spacing.xs}`,
										borderRadius: radii.sm,
										border: `1px solid ${colors.accent.primary}`,
										backgroundColor: colors.bg.primary,
										color: colors.text.primary,
										outline: 'none',
									}}
								/>
							) : (
								<div
									style={{
										flex: 1,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										fontSize: typography.fontSize.md,
									}}
								>
									{row.name}
								</div>
							)}

							<div style={{ display: 'flex', gap: '4px' }}>
								{renderToggleButton('V', row.isVisible ? 'Hide' : 'Show', row.isVisible, (event) => {
									event.stopPropagation();
									onToggleVisible(row.id, !row.isVisible);
								})}
								{renderToggleButton('L', row.isLocked ? 'Unlock' : 'Lock', row.isLocked, (event) => {
									event.stopPropagation();
									onToggleLocked(row.id, !row.isLocked);
								})}
							</div>
						</div>
					);
				})}

				{dropIndicator && (
					<div
						style={{
							position: 'absolute',
							left: spacing.sm,
							right: spacing.sm,
							top: dropIndicator.top - 1,
							height: '2px',
							backgroundColor: colors.accent.primary,
							borderRadius: radii.full,
						}}
					/>
				)}
			</div>

			{/* CSS for hover reveal of toggle buttons */}
			<style>{`
				.layer-toggle-btn {
					opacity: 0 !important;
					transition: opacity 100ms ease !important;
				}
				div:hover > div > .layer-toggle-btn,
				.layer-toggle-btn:focus {
					opacity: 1 !important;
				}
			`}</style>
		</div>
	);
};
