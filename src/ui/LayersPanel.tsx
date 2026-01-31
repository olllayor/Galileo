import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Document, Node } from '../core/doc/types';

const TYPE_LABELS: Record<Node['type'], string> = {
	frame: 'Frame',
	rectangle: 'Rectangle',
	text: 'Text',
	image: 'Image',
	componentInstance: 'Component',
	ellipse: 'Ellipse',
	path: 'Path',
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

	const beginRenameById = (id: string) => {
		const node = document.nodes[id];
		if (!node) return;
		setEditingId(id);
		setEditingOriginal(node.name ?? '');
		setDraftName(node.name ?? getDisplayName(node));
	};

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
	}, [renameRequestId, document, parentMap, onRenameRequestHandled]);

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
				width: '20px',
				height: '20px',
				border: '1px solid #ccc',
				backgroundColor: active ? '#fff' : '#f0f0f0',
				color: active ? '#333' : '#888',
				borderRadius: '4px',
				fontSize: '11px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'pointer',
			}}
		>
			{label}
		</button>
	);

	// Collapsed rail mode
	if (collapsed) {
		return (
			<div
				style={{
					width: '48px',
					borderRight: '1px solid #ddd',
					backgroundColor: '#f5f5f5',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: '8px',
					transition: 'width 0.2s ease',
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Layers"
					style={{
						width: '32px',
						height: '32px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: '6px',
						cursor: 'pointer',
						color: '#666',
						fontSize: '14px',
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4" />
					</svg>
				</button>
				<div
					style={{
						marginTop: '8px',
						width: '32px',
						height: '32px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: '#e0e0e0',
						borderRadius: '6px',
						fontSize: '11px',
						fontWeight: 600,
						color: '#666',
					}}
					title="Layers"
				>
					L
				</div>
				{selectionIds.length > 0 && (
					<div
						style={{
							marginTop: '8px',
							width: '24px',
							height: '24px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: '#4a9eff',
							borderRadius: '12px',
							fontSize: '10px',
							fontWeight: 600,
							color: 'white',
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
				width: '240px',
				borderRight: '1px solid #ddd',
				backgroundColor: '#f5f5f5',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'auto',
				cursor: dragState && !dropIndicator ? 'not-allowed' : undefined,
				transition: 'width 0.2s ease',
			}}
		>
			<div
				style={{
					padding: '10px 12px',
					fontSize: '12px',
					fontWeight: 600,
					color: '#444',
					borderBottom: '1px solid #ddd',
					position: 'sticky',
					top: 0,
					backgroundColor: '#f5f5f5',
					zIndex: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<span>Layers</span>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Minimize Layers"
					style={{
						width: '20px',
						height: '20px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: '4px',
						cursor: 'pointer',
						color: '#888',
						fontSize: '12px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>
			</div>

			<div ref={listRef} onDragOver={handleListDragOver} onDrop={handleDragEnd} style={{ position: 'relative' }}>
				{rows.map((row) => {
					const isSelected = selectionIds.includes(row.id);
					const isEditing = editingId === row.id;
					const rowColor = row.isLocked ? '#777' : row.isVisible ? '#333' : '#888';
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
								gap: '6px',
								padding: '6px 8px',
								paddingLeft: `${8 + row.depth * 14}px`,
								backgroundColor: isSelected ? '#dbe9ff' : 'transparent',
								color: rowColor,
								fontSize: '12px',
								borderBottom: '1px solid rgba(0,0,0,0.04)',
								userSelect: 'none',
								opacity: isDraggingRow ? 0.6 : 1,
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
									width: '16px',
									height: '16px',
									border: 'none',
									background: 'transparent',
									color: '#666',
									cursor: row.hasChildren ? 'pointer' : 'default',
									padding: 0,
								}}
								title={row.hasChildren ? (row.isExpanded ? 'Collapse' : 'Expand') : undefined}
							>
								{row.hasChildren ? (row.isExpanded ? 'v' : '>') : ''}
							</button>

							<div style={{ width: '10px', color: '#666', fontSize: '10px' }}>
								{row.type === 'frame' ? 'F' : row.type === 'text' ? 'T' : '*'}
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
										fontSize: '12px',
										padding: '2px 4px',
										borderRadius: '4px',
										border: '1px solid #8ab6ff',
										outline: 'none',
									}}
								/>
							) : (
								<div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
							left: 0,
							right: 0,
							top: dropIndicator.top - 1,
							height: '2px',
							backgroundColor: '#4a9eff',
						}}
					/>
				)}
			</div>
		</div>
	);
};
