import React, { useMemo, useState } from 'react';
import type { Page } from '../core/doc/types';
import { colors, panels, radii, spacing, transitions, typography } from './design-system';

interface PagesPanelProps {
	pages: Page[];
	activePageId: string;
	width?: number;
	collapsed?: boolean;
	isResizing?: boolean;
	onToggleCollapsed?: () => void;
	onSelectPage: (pageId: string) => void;
	onCreatePage: () => void;
	onRenamePage: (pageId: string, name: string) => void;
	onReorderPage: (fromIndex: number, toIndex: number) => void;
	onDeletePage: (pageId: string) => void;
}

export const PagesPanel: React.FC<PagesPanelProps> = ({
	pages,
	activePageId,
	width = panels.left.width,
	collapsed = false,
	isResizing = false,
	onToggleCollapsed,
	onSelectPage,
	onCreatePage,
	onRenamePage,
	onReorderPage,
	onDeletePage,
}) => {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draftName, setDraftName] = useState('');
	const [dragPageId, setDragPageId] = useState<string | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);

	const canDelete = pages.length > 1;
	const activeIndex = useMemo(() => pages.findIndex((page) => page.id === activePageId), [pages, activePageId]);

	const beginRename = (page: Page) => {
		setEditingId(page.id);
		setDraftName(page.name);
	};

	const commitRename = () => {
		if (!editingId) return;
		const next = draftName.trim();
		if (next.length > 0) {
			onRenamePage(editingId, next);
		}
		setEditingId(null);
		setDraftName('');
	};

	const handleDrop = () => {
		if (!dragPageId || dropIndex === null) {
			setDragPageId(null);
			setDropIndex(null);
			return;
		}
		const fromIndex = pages.findIndex((page) => page.id === dragPageId);
		if (fromIndex === -1) {
			setDragPageId(null);
			setDropIndex(null);
			return;
		}
		let toIndex = Math.max(0, Math.min(dropIndex, pages.length));
		if (toIndex > fromIndex) {
			toIndex -= 1;
		}
		if (toIndex !== fromIndex) {
			onReorderPage(fromIndex, toIndex);
		}
		setDragPageId(null);
		setDropIndex(null);
	};

	if (collapsed) {
		return (
			<div
				style={{
					width: '44px',
					borderRight: `1px solid ${colors.border.subtle}`,
					backgroundColor: colors.bg.secondary,
					display: 'flex',
					justifyContent: 'center',
					paddingTop: spacing.sm,
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					style={{
						width: '28px',
						height: '28px',
						borderRadius: radii.sm,
						border: `1px solid ${colors.border.subtle}`,
						backgroundColor: colors.bg.tertiary,
						color: colors.text.secondary,
						cursor: 'pointer',
					}}
				>
					❯
				</button>
			</div>
		);
	}

	return (
		<div
			style={{
				width: `${width}px`,
				borderRight: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.secondary,
				display: 'flex',
				flexDirection: 'column',
				height: `calc(100vh - 68px)`,
				minWidth: `${panels.left.minWidth}px`,
				maxWidth: `${panels.left.maxWidth}px`,
				userSelect: isResizing ? 'none' : 'auto',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: spacing.sm,
					borderBottom: `1px solid ${colors.border.subtle}`,
				}}
			>
				<div style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, fontWeight: 600 }}>Pages</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
					<button
						type="button"
						onClick={onCreatePage}
						title="Add page"
						style={{
							width: '24px',
							height: '24px',
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.subtle}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							cursor: 'pointer',
						}}
					>
						+
					</button>
					<button
						type="button"
						onClick={onToggleCollapsed}
						title="Collapse"
						style={{
							width: '24px',
							height: '24px',
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.subtle}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							cursor: 'pointer',
						}}
					>
						❮
					</button>
				</div>
			</div>

			<div style={{ overflowY: 'auto', padding: spacing.xs }}>
				{pages.map((page, index) => {
					const isActive = page.id === activePageId;
					const isEditing = page.id === editingId;
					const showDropBefore = dropIndex === index;
					const showDropAfter = dropIndex === index + 1 && index === pages.length - 1;

					return (
						<div key={page.id}>
							{showDropBefore && (
								<div
									style={{
										height: '2px',
										backgroundColor: colors.border.focus,
										borderRadius: '999px',
										margin: `0 ${spacing.sm}`,
									}}
								/>
							)}
							<div
								draggable
								onDragStart={() => {
									setDragPageId(page.id);
									setDropIndex(index);
								}}
								onDragOver={(event) => {
									if (!dragPageId) return;
									event.preventDefault();
									const rect = event.currentTarget.getBoundingClientRect();
									const insertAfter = event.clientY > rect.top + rect.height / 2;
									setDropIndex(insertAfter ? index + 1 : index);
								}}
								onDrop={(event) => {
									event.preventDefault();
									handleDrop();
								}}
								onDragEnd={() => {
									setDragPageId(null);
									setDropIndex(null);
								}}
								onClick={() => onSelectPage(page.id)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: spacing.xs,
									padding: `${spacing.xs} ${spacing.sm}`,
									borderRadius: radii.sm,
									backgroundColor: isActive ? colors.bg.tertiary : 'transparent',
									border: isActive ? `1px solid ${colors.border.focus}` : '1px solid transparent',
									cursor: 'pointer',
									transition: `background-color ${transitions.fast}, border-color ${transitions.fast}`,
								}}
							>
								<div
									style={{
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										width: '14px',
										textAlign: 'center',
										opacity: dragPageId === page.id ? 0.4 : 1,
									}}
								>
									☰
								</div>
								{isEditing ? (
									<input
										value={draftName}
										onChange={(event) => setDraftName(event.target.value)}
										onBlur={commitRename}
										onKeyDown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault();
												commitRename();
											}
											if (event.key === 'Escape') {
												event.preventDefault();
												setEditingId(null);
											}
										}}
										autoFocus
										style={{
											flex: 1,
											minWidth: 0,
											fontSize: typography.fontSize.sm,
											backgroundColor: colors.bg.tertiary,
											border: `1px solid ${colors.border.focus}`,
											borderRadius: radii.sm,
											color: colors.text.primary,
											padding: `2px ${spacing.xs}`,
										}}
									/>
								) : (
									<button
										type="button"
										onDoubleClick={() => beginRename(page)}
										style={{
											flex: 1,
											minWidth: 0,
											textAlign: 'left',
											background: 'none',
											border: 'none',
											color: isActive ? colors.text.primary : colors.text.secondary,
											fontSize: typography.fontSize.sm,
											cursor: 'pointer',
											padding: 0,
										}}
									>
										{page.name}
									</button>
								)}
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										beginRename(page);
									}}
									title="Rename page"
									style={{
										border: 'none',
										background: 'none',
										color: colors.text.tertiary,
										cursor: 'pointer',
										fontSize: typography.fontSize.xs,
										padding: 0,
									}}
								>
									✎
								</button>
								<button
									type="button"
									disabled={!canDelete}
									onClick={(event) => {
										event.stopPropagation();
										onDeletePage(page.id);
									}}
									title={canDelete ? 'Delete page' : 'At least one page is required'}
									style={{
										border: 'none',
										background: 'none',
										color: canDelete ? '#ff7f7f' : colors.text.tertiary,
										cursor: canDelete ? 'pointer' : 'not-allowed',
										fontSize: typography.fontSize.xs,
										padding: 0,
									}}
								>
									✕
								</button>
							</div>
							{showDropAfter && (
								<div
									style={{
										height: '2px',
										backgroundColor: colors.border.focus,
										borderRadius: '999px',
										margin: `0 ${spacing.sm}`,
									}}
								/>
							)}
						</div>
					);
				})}
			</div>

			<div
				style={{
					padding: `${spacing.xs} ${spacing.sm}`,
					borderTop: `1px solid ${colors.border.subtle}`,
					color: colors.text.tertiary,
					fontSize: typography.fontSize.xs,
				}}
			>
				{activeIndex >= 0 ? `Active: ${activeIndex + 1} / ${pages.length}` : `${pages.length} pages`}
			</div>
		</div>
	);
};
