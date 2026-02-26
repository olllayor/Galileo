import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colors, radii, shadows, spacing, transitions, typography } from './design-system';

export type ContextMenuItem = {
	id?: string;
	icon?: string;
	label?: string;
	shortcut?: string;
	enabled?: boolean;
	onSelect?: () => void;
	submenu?: ContextMenuItem[];
	separator?: boolean;
	checked?: boolean;
	checkType?: 'check' | 'radio';
	closeOnSelect?: boolean;
	danger?: boolean;
};

interface ContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
}

const MENU_MIN_WIDTH = 220;
const MENU_MAX_WIDTH = 320;
const ROW_HEIGHT = 30;
const PANEL_PADDING = 6;
const SCREEN_PADDING = 8;
const SUBMENU_GAP = 4;
const MIN_PANEL_HEIGHT = 160;
const MENU_Z_INDEX = 1450;

type PanelPosition = {
	left: number;
	top: number;
	maxHeight: number;
	opensLeft: boolean;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const panelKey = (depth: number, index: number): string => `${depth}:${index}`;

const hasSubmenu = (item: ContextMenuItem): boolean => Boolean(item.submenu && item.submenu.length > 0);

const isNavigableItem = (item: ContextMenuItem | undefined): boolean => Boolean(item && !item.separator && item.enabled !== false);

const isCheckableItem = (item: ContextMenuItem): boolean => Boolean(item.checkType || item.checked !== undefined);

const getItemRole = (item: ContextMenuItem): 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' => {
	if (!isCheckableItem(item)) return 'menuitem';
	return item.checkType === 'radio' ? 'menuitemradio' : 'menuitemcheckbox';
};

const getFirstNavigableIndex = (menuItems: ContextMenuItem[]): number => menuItems.findIndex((item) => isNavigableItem(item));

const getLastNavigableIndex = (menuItems: ContextMenuItem[]): number => {
	for (let index = menuItems.length - 1; index >= 0; index -= 1) {
		if (isNavigableItem(menuItems[index])) return index;
	}
	return -1;
};

const getNextNavigableIndex = (menuItems: ContextMenuItem[], startIndex: number, direction: 1 | -1): number => {
	if (menuItems.length === 0) return -1;
	if (startIndex < 0 || startIndex >= menuItems.length) {
		return direction > 0 ? getFirstNavigableIndex(menuItems) : getLastNavigableIndex(menuItems);
	}
	let nextIndex = startIndex;
	for (let step = 0; step < menuItems.length; step += 1) {
		nextIndex = (nextIndex + direction + menuItems.length) % menuItems.length;
		if (isNavigableItem(menuItems[nextIndex])) return nextIndex;
	}
	return -1;
};

const buildPanels = (rootItems: ContextMenuItem[], openPath: number[]): ContextMenuItem[][] => {
	const result: ContextMenuItem[][] = [rootItems];
	let currentItems = rootItems;
	for (let depth = 1; depth <= openPath.length; depth += 1) {
		const parentIndex = openPath[depth - 1];
		const parentItem = currentItems[parentIndex];
		if (!parentItem?.submenu?.length) break;
		currentItems = parentItem.submenu;
		result.push(currentItems);
	}
	return result;
};

const updatePathIndex = (path: number[], depth: number, index: number): number[] => {
	const next = path.slice(0, depth);
	if (index >= 0) next[depth] = index;
	return next;
};

const panelPositionsEqual = (a: PanelPosition[], b: PanelPosition[]): boolean => {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index += 1) {
		const left = a[index];
		const right = b[index];
		if (!left || !right) return false;
		if (left.left !== right.left || left.top !== right.top || left.maxHeight !== right.maxHeight || left.opensLeft !== right.opensLeft) {
			return false;
		}
	}
	return true;
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const panelRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const [openPath, setOpenPath] = useState<number[]>([]);
	const [activePath, setActivePath] = useState<number[]>([]);
	const [keyboardDepth, setKeyboardDepth] = useState(0);
	const [panelPositions, setPanelPositions] = useState<PanelPosition[]>([]);
	const [pressedRowKey, setPressedRowKey] = useState<string | null>(null);
	const [layoutTick, setLayoutTick] = useState(0);

	const panels = useMemo(() => buildPanels(items, openPath), [items, openPath]);

	useEffect(() => {
		const firstIndex = getFirstNavigableIndex(items);
		setOpenPath([]);
		setKeyboardDepth(0);
		setActivePath(firstIndex >= 0 ? [firstIndex] : []);
	}, [items]);

	useEffect(() => {
		containerRef.current?.focus({ preventScroll: true });
	}, []);

	useEffect(() => {
		const handleResize = () => setLayoutTick((tick) => tick + 1);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		const containsTarget = (target: EventTarget | null): boolean =>
			Boolean(containerRef.current && target instanceof Node && containerRef.current.contains(target));

		const handleClick = (event: MouseEvent) => {
			if (containsTarget(event.target)) return;
			onClose();
		};
		const handleContextMenu = (event: MouseEvent) => {
			if (containsTarget(event.target)) return;
			onClose();
		};
		const handleScroll = (event: Event) => {
			if (containsTarget(event.target)) return;
			onClose();
		};
		window.addEventListener('mousedown', handleClick);
		window.addEventListener('contextmenu', handleContextMenu);
		window.addEventListener('scroll', handleScroll, true);
		return () => {
			window.removeEventListener('mousedown', handleClick);
			window.removeEventListener('contextmenu', handleContextMenu);
			window.removeEventListener('scroll', handleScroll, true);
		};
	}, [onClose]);

	useLayoutEffect(() => {
		const rootPanel = panelRefs.current.get(0);
		if (!rootPanel) return;

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const nextPositions: PanelPosition[] = [];

		const rootRect = rootPanel.getBoundingClientRect();
		const rootMaxHeight = Math.max(MIN_PANEL_HEIGHT, viewportHeight - SCREEN_PADDING * 2);
		const rootHeight = Math.min(rootRect.height, rootMaxHeight);
		const rootMaxX = Math.max(SCREEN_PADDING, viewportWidth - rootRect.width - SCREEN_PADDING);
		const rootMaxY = Math.max(SCREEN_PADDING, viewportHeight - rootHeight - SCREEN_PADDING);

		nextPositions[0] = {
			left: clamp(x, SCREEN_PADDING, rootMaxX),
			top: clamp(y, SCREEN_PADDING, rootMaxY),
			maxHeight: rootMaxHeight,
			opensLeft: false,
		};

		for (let depth = 1; depth < panels.length; depth += 1) {
			const panel = panelRefs.current.get(depth);
			const parentIndex = openPath[depth - 1];
			const parentRow = rowRefs.current.get(panelKey(depth - 1, parentIndex));
			if (!panel || !parentRow) break;

			const panelRect = panel.getBoundingClientRect();
			const parentRect = parentRow.getBoundingClientRect();
			const panelMaxHeight = Math.max(MIN_PANEL_HEIGHT, viewportHeight - SCREEN_PADDING * 2);
			const panelHeight = Math.min(panelRect.height, panelMaxHeight);
			const openRightX = parentRect.right + SUBMENU_GAP;
			const openLeftX = parentRect.left - panelRect.width - SUBMENU_GAP;
			const rightFits = openRightX + panelRect.width <= viewportWidth - SCREEN_PADDING;
			const leftFits = openLeftX >= SCREEN_PADDING;
			const opensLeft = !rightFits && (leftFits || parentRect.left > viewportWidth - parentRect.right);
			const maxLeft = Math.max(SCREEN_PADDING, viewportWidth - panelRect.width - SCREEN_PADDING);
			const maxTop = Math.max(SCREEN_PADDING, viewportHeight - panelHeight - SCREEN_PADDING);

			nextPositions[depth] = {
				left: clamp(opensLeft ? openLeftX : openRightX, SCREEN_PADDING, maxLeft),
				top: clamp(parentRect.top, SCREEN_PADDING, maxTop),
				maxHeight: panelMaxHeight,
				opensLeft,
			};
		}

		setPanelPositions((previous) => (panelPositionsEqual(previous, nextPositions) ? previous : nextPositions));
	}, [items, x, y, panels, openPath, layoutTick]);

	const setActiveIndexForDepth = (depth: number, index: number) => {
		setActivePath((previous) => updatePathIndex(previous, depth, index));
	};

	const openSubmenuForItem = (depth: number, index: number, focusChild: boolean) => {
		const currentItems = panels[depth] || [];
		const item = currentItems[index];
		if (!item || !hasSubmenu(item) || item.enabled === false) return;
		const childFirstIndex = getFirstNavigableIndex(item.submenu || []);
		setOpenPath((previous) => {
			const next = previous.slice(0, depth);
			next[depth] = index;
			return next;
		});
		setActivePath((previous) => {
			const next = updatePathIndex(previous, depth, index);
			if (focusChild && childFirstIndex >= 0) {
				next[depth + 1] = childFirstIndex;
			}
			return next;
		});
		if (focusChild) {
			setKeyboardDepth(depth + 1);
		} else {
			setKeyboardDepth(depth);
		}
	};

	const closeSubmenusAfterDepth = (depth: number) => {
		setOpenPath((previous) => previous.slice(0, depth));
		setActivePath((previous) => previous.slice(0, depth + 1));
	};

	const handleRowHover = (depth: number, index: number, item: ContextMenuItem) => {
		setPressedRowKey(null);
		containerRef.current?.focus({ preventScroll: true });
		setKeyboardDepth(depth);
		setActiveIndexForDepth(depth, index);
		if (hasSubmenu(item) && item.enabled !== false) {
			setOpenPath((previous) => {
				const next = previous.slice(0, depth);
				next[depth] = index;
				return next;
			});
			return;
		}
		closeSubmenusAfterDepth(depth);
	};

	const triggerItem = (depth: number, index: number) => {
		const currentItems = panels[depth] || [];
		const item = currentItems[index];
		if (!item || item.separator || item.enabled === false) return;
		if (hasSubmenu(item)) {
			openSubmenuForItem(depth, index, true);
			return;
		}
		item.onSelect?.();
		if (item.closeOnSelect !== false) {
			onClose();
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const maxDepth = panels.length - 1;
		const depth = clamp(keyboardDepth, 0, Math.max(0, maxDepth));
		const currentItems = panels[depth] || [];
		if (currentItems.length === 0) return;

		const selectedIndex = isNavigableItem(currentItems[activePath[depth]])
			? activePath[depth]
			: getFirstNavigableIndex(currentItems);
		if (selectedIndex >= 0 && selectedIndex !== activePath[depth]) {
			setActiveIndexForDepth(depth, selectedIndex);
		}

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			case 'ArrowDown': {
				event.preventDefault();
				event.stopPropagation();
				const nextIndex = getNextNavigableIndex(currentItems, selectedIndex, 1);
				if (nextIndex >= 0) {
					setActiveIndexForDepth(depth, nextIndex);
					closeSubmenusAfterDepth(depth);
				}
				return;
			}
			case 'ArrowUp': {
				event.preventDefault();
				event.stopPropagation();
				const nextIndex = getNextNavigableIndex(currentItems, selectedIndex, -1);
				if (nextIndex >= 0) {
					setActiveIndexForDepth(depth, nextIndex);
					closeSubmenusAfterDepth(depth);
				}
				return;
			}
			case 'Home': {
				event.preventDefault();
				event.stopPropagation();
				const nextIndex = getFirstNavigableIndex(currentItems);
				if (nextIndex >= 0) {
					setActiveIndexForDepth(depth, nextIndex);
					closeSubmenusAfterDepth(depth);
				}
				return;
			}
			case 'End': {
				event.preventDefault();
				event.stopPropagation();
				const nextIndex = getLastNavigableIndex(currentItems);
				if (nextIndex >= 0) {
					setActiveIndexForDepth(depth, nextIndex);
					closeSubmenusAfterDepth(depth);
				}
				return;
			}
			case 'ArrowRight': {
				event.preventDefault();
				event.stopPropagation();
				if (selectedIndex >= 0) {
					openSubmenuForItem(depth, selectedIndex, true);
				}
				return;
			}
			case 'ArrowLeft': {
				if (depth <= 0) return;
				event.preventDefault();
				event.stopPropagation();
				const parentIndex = openPath[depth - 1];
				setOpenPath((previous) => previous.slice(0, Math.max(0, depth - 1)));
				setActivePath((previous) => {
					const next = previous.slice(0, depth);
					if (typeof parentIndex === 'number') {
						next[depth - 1] = parentIndex;
					}
					return next;
				});
				setKeyboardDepth(depth - 1);
				return;
			}
			case 'Enter':
			case ' ': {
				event.preventDefault();
				event.stopPropagation();
				if (selectedIndex >= 0) {
					triggerItem(depth, selectedIndex);
				}
				return;
			}
			default:
				return;
		}
	};

	return (
		<div
			ref={containerRef}
			onContextMenu={(event) => event.preventDefault()}
			onKeyDown={handleKeyDown}
			tabIndex={-1}
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				zIndex: MENU_Z_INDEX,
			}}
		>
			{panels.map((panelItems, depth) => {
				const panelPosition = panelPositions[depth];
				const visible = depth === 0 || Boolean(panelPosition);
				const activeIndex = activePath[depth] ?? -1;
				const panelHasChecks = panelItems.some((item) => !item.separator && isCheckableItem(item));
				const panelHasIcons = panelItems.some((item) => !item.separator && Boolean(item.icon));

				return (
					<div
						key={`panel-${depth}`}
						ref={(element) => {
							if (element) {
								panelRefs.current.set(depth, element);
							} else {
								panelRefs.current.delete(depth);
							}
						}}
						role="menu"
						style={{
							position: 'fixed',
							left: panelPosition?.left ?? x,
							top: panelPosition?.top ?? y,
							visibility: visible ? 'visible' : 'hidden',
							minWidth: MENU_MIN_WIDTH,
							maxWidth: MENU_MAX_WIDTH,
							maxHeight: panelPosition?.maxHeight ?? Math.max(MIN_PANEL_HEIGHT, window.innerHeight - SCREEN_PADDING * 2),
							overflowY: 'auto',
							padding: PANEL_PADDING,
							backgroundColor: colors.bg.secondary,
							color: colors.text.primary,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.lg,
							boxShadow: shadows.lg,
							fontFamily: typography.fontFamily.sans,
							fontSize: typography.fontSize.md,
							pointerEvents: 'auto',
						}}
					>
						{panelItems.map((item, index) => {
							const key = panelKey(depth, index);
							if (item.separator) {
								return (
									<div
										key={`separator-${key}`}
										role="separator"
										style={{
											height: 1,
											margin: `${spacing.xs} ${spacing.sm}`,
											backgroundColor: colors.border.subtle,
										}}
									/>
								);
							}

							const enabled = item.enabled !== false;
							const itemHasSubmenu = hasSubmenu(item);
							const isActive = activeIndex === index;
							const isOpen = openPath[depth] === index;
							const rowIsPressed = pressedRowKey === key;
							const isCheckable = isCheckableItem(item);
							const checkGlyph = item.checkType === 'radio' ? '•' : '✓';
							const checked = Boolean(item.checked);
							const itemColor = !enabled
								? colors.text.disabled
								: item.danger
									? colors.semantic.error
									: colors.text.primary;

							return (
								<div
									key={item.id || item.label || key}
									ref={(element) => {
										if (element) {
											rowRefs.current.set(key, element);
										} else {
											rowRefs.current.delete(key);
										}
									}}
									role={getItemRole(item)}
									aria-disabled={!enabled}
									aria-checked={isCheckable ? checked : undefined}
									aria-haspopup={itemHasSubmenu ? 'menu' : undefined}
									aria-expanded={itemHasSubmenu ? isOpen : undefined}
									onMouseEnter={() => handleRowHover(depth, index, item)}
									onMouseMove={() => handleRowHover(depth, index, item)}
									onMouseDown={() => {
										containerRef.current?.focus({ preventScroll: true });
										setPressedRowKey(key);
										setKeyboardDepth(depth);
										setActiveIndexForDepth(depth, index);
									}}
									onMouseUp={() => setPressedRowKey(null)}
									onMouseLeave={() => {
										setPressedRowKey((current) => (current === key ? null : current));
									}}
									onClick={() => triggerItem(depth, index)}
									onContextMenu={(event) => {
										event.preventDefault();
										if (itemHasSubmenu && enabled) {
											openSubmenuForItem(depth, index, false);
										}
									}}
									style={{
										height: ROW_HEIGHT,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										gap: spacing.sm,
										padding: `0 ${spacing.sm}`,
										borderRadius: radii.md,
										cursor: enabled ? 'pointer' : 'default',
										userSelect: 'none',
										backgroundColor: rowIsPressed
											? colors.bg.active
											: isActive || isOpen
												? colors.bg.hover
												: 'transparent',
										transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
									}}
								>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: spacing.sm,
											minWidth: 0,
											flex: 1,
										}}
									>
										{panelHasChecks && (
											<span
												aria-hidden="true"
												style={{
													width: 12,
													textAlign: 'center',
													fontSize: typography.fontSize.sm,
													color: colors.text.secondary,
												}}
											>
												{checked ? checkGlyph : ''}
											</span>
										)}
										{panelHasIcons && (
											<span
												aria-hidden="true"
												style={{
													width: 14,
													textAlign: 'center',
													color: colors.text.tertiary,
													fontSize: typography.fontSize.sm,
												}}
											>
												{item.icon || ''}
											</span>
										)}
										<span
											style={{
												color: itemColor,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{item.label}
										</span>
									</div>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: spacing.sm,
											paddingLeft: spacing.sm,
											flexShrink: 0,
										}}
									>
										{item.shortcut && (
											<span
												style={{
													color: colors.text.tertiary,
													fontSize: typography.fontSize.xs,
													fontFamily: typography.fontFamily.mono,
												}}
											>
												{item.shortcut}
											</span>
										)}
										{itemHasSubmenu && (
											<span
												aria-hidden="true"
												style={{
													color: colors.text.secondary,
													fontSize: typography.fontSize.lg,
													lineHeight: 1,
												}}
											>
												{panelPositions[depth + 1]?.opensLeft ? '‹' : '›'}
											</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
};
