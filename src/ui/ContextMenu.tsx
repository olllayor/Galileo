import React, { useEffect, useRef, useState, useCallback } from 'react';

export type ContextMenuItem = {
	id?: string;
	icon?: string;
	label?: string;
	shortcut?: string;
	enabled?: boolean;
	onSelect?: () => void;
	submenu?: ContextMenuItem[];
	separator?: boolean;
};

interface ContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
}

const MENU_WIDTH = 232;
const ITEM_HEIGHT = 30;
const MENU_PADDING = 8;
const SCREEN_PADDING = 8;

// Calculate submenu position with edge detection
const getSubmenuPosition = (
	parentRect: DOMRect,
	itemIndex: number,
	submenuHeight: number,
): { left: number; top: number; flipHorizontal: boolean; flipVertical: boolean } => {
	const itemTop = parentRect.top + MENU_PADDING + itemIndex * ITEM_HEIGHT;
	const rightSpace = window.innerWidth - parentRect.right;
	const leftSpace = parentRect.left;
	const bottomSpace = window.innerHeight - itemTop;

	// Determine horizontal flip
	const flipHorizontal = rightSpace < MENU_WIDTH + SCREEN_PADDING && leftSpace > rightSpace;

	// Determine vertical adjustment
	const flipVertical = bottomSpace < submenuHeight + SCREEN_PADDING;

	let left: number;
	let top: number;

	if (flipHorizontal) {
		// Open to the left
		left = -MENU_WIDTH + 4;
	} else {
		// Open to the right (default)
		left = MENU_WIDTH - 4;
	}

	if (flipVertical) {
		// Align bottom of submenu with bottom of viewport (with padding)
		const overflow = submenuHeight - bottomSpace + SCREEN_PADDING;
		top = itemIndex * ITEM_HEIGHT - overflow;
	} else {
		top = itemIndex * ITEM_HEIGHT;
	}

	return { left, top, flipHorizontal, flipVertical };
};

interface MenuListProps {
	items: ContextMenuItem[];
	onClose: () => void;
	style?: React.CSSProperties;
	depth?: number;
}

const MenuList: React.FC<MenuListProps> = ({ items, onClose, style, depth = 0 }) => {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [submenuPosition, setSubmenuPosition] = useState<{
		left: number;
		top: number;
	} | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const submenuItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	// Calculate submenu height
	const getSubmenuHeight = useCallback((submenuItems: ContextMenuItem[]): number => {
		let height = MENU_PADDING * 2; // top and bottom padding
		for (const item of submenuItems) {
			if (item.separator) {
				height += 13; // separator height with margins
			} else {
				height += ITEM_HEIGHT;
			}
		}
		return height;
	}, []);

	// Update submenu position when openIndex changes
	useEffect(() => {
		if (openIndex === null || !menuRef.current) {
			setSubmenuPosition(null);
			return;
		}

		const item = items[openIndex];
		if (!item?.submenu) {
			setSubmenuPosition(null);
			return;
		}

		const menuRect = menuRef.current.getBoundingClientRect();
		const submenuHeight = getSubmenuHeight(item.submenu);
		const pos = getSubmenuPosition(menuRect, openIndex, submenuHeight);
		setSubmenuPosition({ left: pos.left, top: pos.top });
	}, [openIndex, items, getSubmenuHeight]);

	return (
		<div
			ref={menuRef}
			style={{
				minWidth: MENU_WIDTH,
				backgroundColor: '#1f1f1f',
				color: '#f4f4f4',
				borderRadius: 8,
				padding: MENU_PADDING,
				boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
				fontSize: 13,
				fontFamily: 'system-ui, -apple-system, sans-serif',
				position: 'relative',
				...style,
			}}
		>
			{items.map((item, index) => {
				if (item.separator) {
					return (
						<div
							key={`sep-${index}`}
							style={{
								height: 1,
								margin: '6px 6px',
								backgroundColor: 'rgba(255, 255, 255, 0.08)',
							}}
						/>
					);
				}

				const enabled = item.enabled !== false;
				const hasSubmenu = Boolean(item.submenu && item.submenu.length > 0);

				return (
					<div
						key={item.id || item.label || index}
						ref={(el) => {
							if (el) submenuItemRefs.current.set(index, el);
						}}
						onMouseEnter={() => setOpenIndex(hasSubmenu ? index : null)}
						onMouseMove={() => {
							if (hasSubmenu) {
								setOpenIndex(index);
							}
						}}
						onMouseLeave={() => setActiveIndex(null)}
						onMouseDown={() => setActiveIndex(index)}
						onMouseUp={() => setActiveIndex(null)}
						onClick={() => {
							if (!enabled) return;
							if (hasSubmenu) {
								setOpenIndex(index);
								return;
							}
							item.onSelect?.();
							onClose();
						}}
						onContextMenu={(event) => {
							if (!hasSubmenu) return;
							event.preventDefault();
							setOpenIndex(index);
						}}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							height: ITEM_HEIGHT,
							padding: '0 10px',
							borderRadius: 4,
							cursor: enabled ? 'pointer' : 'default',
							opacity: enabled ? 1 : 0.4,
							backgroundColor:
								activeIndex === index
									? 'rgba(255, 255, 255, 0.12)'
									: openIndex === index
										? 'rgba(255, 255, 255, 0.08)'
										: 'transparent',
							userSelect: 'none',
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<span
								style={{
									width: 16,
									textAlign: 'center',
									opacity: 0.7,
									fontSize: 11,
								}}
							>
								{item.icon || ''}
							</span>
							<span>{item.label}</span>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							{item.shortcut && (
								<span
									style={{
										opacity: 0.55,
										fontSize: 11,
										fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
									}}
								>
									{item.shortcut}
								</span>
							)}
							{hasSubmenu && (
								<span style={{ opacity: 0.6 }}>{submenuPosition && submenuPosition.left < 0 ? '<' : '>'}</span>
							)}
						</div>
						{hasSubmenu && openIndex === index && submenuPosition && (
							<MenuList
								items={item.submenu || []}
								onClose={onClose}
								depth={depth + 1}
								style={{
									position: 'absolute',
									left: submenuPosition.left,
									top: submenuPosition.top,
								}}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ x, y });

	useEffect(() => {
		setPosition({ x, y });
	}, [x, y]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			if (containerRef.current && event.target instanceof Node && containerRef.current.contains(event.target)) {
				return;
			}
			onClose();
		};
		const handleContextMenu = (event: MouseEvent) => {
			if (containerRef.current && event.target instanceof Node && containerRef.current.contains(event.target)) {
				return;
			}
			onClose();
		};
		const handleScroll = () => onClose();
		window.addEventListener('mousedown', handleClick);
		window.addEventListener('contextmenu', handleContextMenu);
		window.addEventListener('scroll', handleScroll, true);
		return () => {
			window.removeEventListener('mousedown', handleClick);
			window.removeEventListener('contextmenu', handleContextMenu);
			window.removeEventListener('scroll', handleScroll, true);
		};
	}, [onClose]);

	useEffect(() => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const padding = 8;
		const maxX = window.innerWidth - rect.width - padding;
		const maxY = window.innerHeight - rect.height - padding;
		const nextX = Math.min(Math.max(padding, position.x), Math.max(padding, maxX));
		const nextY = Math.min(Math.max(padding, position.y), Math.max(padding, maxY));
		if (nextX !== position.x || nextY !== position.y) {
			setPosition({ x: nextX, y: nextY });
		}
	}, [items, position.x, position.y]);

	return (
		<div
			ref={containerRef}
			onContextMenu={(event) => event.preventDefault()}
			style={{
				position: 'fixed',
				left: position.x,
				top: position.y,
				zIndex: 1000,
			}}
		>
			<MenuList items={items} onClose={onClose} />
		</div>
	);
};
