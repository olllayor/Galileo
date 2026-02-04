import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, spacing, typography, radii, transitions, shadows } from './design-system';

export type CommandPaletteItem = {
	id: string;
	label: string;
	description?: string;
	section?: string;
	shortcut?: string;
	disabled?: boolean;
	action: () => void;
};

interface CommandPaletteProps {
	open: boolean;
	items: CommandPaletteItem[];
	onClose: () => void;
}

const matchQuery = (value: string, query: string) => {
	return value.toLowerCase().includes(query.toLowerCase());
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, items, onClose }) => {
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const visibleItems = useMemo(() => {
		if (!query.trim()) return items;
		const trimmed = query.trim();
		return items.filter((item) => matchQuery(item.label, trimmed) || matchQuery(item.description || '', trimmed));
	}, [items, query]);

	const grouped = useMemo(() => {
		return visibleItems.reduce<Record<string, CommandPaletteItem[]>>((acc, item) => {
			const section = item.section || 'Commands';
			if (!acc[section]) acc[section] = [];
			acc[section].push(item);
			return acc;
		}, {});
	}, [visibleItems]);

	useEffect(() => {
		if (!open) return;
		setQuery('');
		setSelectedIndex(0);
		setTimeout(() => inputRef.current?.focus(), 40);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (selectedIndex >= visibleItems.length) {
			setSelectedIndex(0);
		}
	}, [open, selectedIndex, visibleItems.length]);

	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setSelectedIndex((prev) => (visibleItems.length === 0 ? 0 : (prev + 1) % visibleItems.length));
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setSelectedIndex((prev) =>
					visibleItems.length === 0 ? 0 : (prev - 1 + visibleItems.length) % visibleItems.length,
				);
				return;
			}
			if (e.key === 'Enter') {
				const selected = visibleItems[selectedIndex];
				if (!selected || selected.disabled) return;
				e.preventDefault();
				selected.action();
				onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [open, onClose, selectedIndex, visibleItems]);

	if (!open) return null;

	let flatIndex = -1;

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				backgroundColor: 'rgba(0, 0, 0, 0.35)',
				backdropFilter: 'blur(12px)',
				WebkitBackdropFilter: 'blur(12px)',
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'center',
				paddingTop: '18vh',
				zIndex: 1400,
			}}
			role="dialog"
			aria-modal="true"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				style={{
					width: '560px',
					maxWidth: '92vw',
					backgroundColor: colors.bg.secondary,
					borderRadius: radii.lg,
					border: `1px solid ${colors.border.default}`,
					boxShadow: shadows.lg,
					overflow: 'hidden',
				}}
				role="menu"
			>
				<div style={{ padding: spacing.md, borderBottom: `1px solid ${colors.border.subtle}` }}>
					<input
						ref={inputRef}
						type="text"
						placeholder="Search projects, files, commands..."
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setSelectedIndex(0);
						}}
						style={{
							width: '100%',
							height: '36px',
							padding: `0 ${spacing.md}`,
							backgroundColor: colors.bg.primary,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.md,
							fontSize: typography.fontSize.md,
							color: colors.text.primary,
							outline: 'none',
						}}
					/>
				</div>
				<div style={{ maxHeight: '360px', overflowY: 'auto', padding: spacing.sm }}>
					{Object.entries(grouped).map(([section, sectionItems]) => (
						<div key={section} style={{ marginBottom: spacing.sm }}>
							<div
								style={{
									fontSize: typography.fontSize.xs,
									textTransform: 'uppercase',
									letterSpacing: '0.8px',
									color: colors.text.tertiary,
									padding: `${spacing.xs} ${spacing.sm}`,
								}}
							>
								{section}
							</div>
							{sectionItems.map((item) => {
								flatIndex += 1;
								const isSelected = flatIndex === selectedIndex;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											if (item.disabled) return;
											item.action();
											onClose();
										}}
										disabled={item.disabled}
										style={{
											width: '100%',
											textAlign: 'left',
											padding: `${spacing.sm} ${spacing.md}`,
											border: 'none',
											borderRadius: radii.md,
											backgroundColor: isSelected ? colors.bg.active : 'transparent',
											color: item.disabled ? colors.text.disabled : colors.text.primary,
											cursor: item.disabled ? 'default' : 'pointer',
											transition: `background-color ${transitions.fast}`,
										}}
										onMouseEnter={() => {
											if (!item.disabled) setSelectedIndex(flatIndex);
										}}
									>
										<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
											<div>
												<div style={{ fontSize: typography.fontSize.md }}>{item.label}</div>
												{item.description && (
													<div style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
														{item.description}
													</div>
												)}
											</div>
											{item.shortcut && (
												<span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>
													{item.shortcut}
												</span>
											)}
										</div>
									</button>
								);
							})}
						</div>
					))}
					{visibleItems.length === 0 && (
						<div
							style={{
								padding: `${spacing.lg} ${spacing.md}`,
								color: colors.text.tertiary,
								textAlign: 'center',
								fontSize: typography.fontSize.sm,
							}}
						>
							No results. Try a different search.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
