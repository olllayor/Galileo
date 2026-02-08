import { invoke } from '@tauri-apps/api/core';
import React from 'react';

type FontFilter = 'all' | 'sans' | 'serif' | 'mono';

interface FontPickerModalProps {
	open: boolean;
	selectedFontFamily: string;
	anchorRect: DOMRect | null;
	onSelect: (fontFamily: string) => void;
	onClose: () => void;
}

type LocalFontRecord = {
	family?: unknown;
};

type WindowWithLocalFonts = Window & {
	queryLocalFonts?: () => Promise<LocalFontRecord[]>;
};

const FALLBACK_SYSTEM_FONTS = [
	'Arial',
	'Arial Black',
	'Avenir',
	'Avenir Next',
	'Baskerville',
	'Courier New',
	'Futura',
	'Garamond',
	'Georgia',
	'Gill Sans',
	'Helvetica',
	'Helvetica Neue',
	'Hoefler Text',
	'Menlo',
	'Monaco',
	'Optima',
	'Palatino',
	'SF Pro Display',
	'SF Pro Text',
	'SF Mono',
	'Segoe UI',
	'Tahoma',
	'Times New Roman',
	'Trebuchet MS',
	'Verdana',
].sort((a, b) => a.localeCompare(b));

const PANEL_WIDTH = 356;

const normalizeFontFamily = (value: string): string => {
	const first = value.split(',')[0]?.trim() ?? value.trim();
	return first.replace(/^['"]|['"]$/g, '');
};

const classifyFont = (family: string): Exclude<FontFilter, 'all'> => {
	const normalized = family.toLowerCase();
	if (
		normalized.includes('mono') ||
		normalized.includes('courier') ||
		normalized.includes('menlo') ||
		normalized.includes('consolas')
	) {
		return 'mono';
	}
	if (
		normalized.includes('serif') ||
		normalized.includes('times') ||
		normalized.includes('garamond') ||
		normalized.includes('georgia') ||
		normalized.includes('baskerville')
	) {
		return 'serif';
	}
	return 'sans';
};

const mergeFontList = (selectedBaseFamily: string, fonts: string[]): string[] => {
	return Array.from(new Set([selectedBaseFamily, ...fonts]))
		.map((family) => family.trim())
		.filter((family) => family.length > 0)
		.sort((a, b) => a.localeCompare(b));
};

const loadFontsFromTauri = async (): Promise<string[]> => {
	try {
		const result = await invoke<string[]>('list_system_fonts');
		return Array.isArray(result) ? result : [];
	} catch {
		return [];
	}
};

const loadFontsFromBrowser = async (): Promise<string[]> => {
	try {
		const maybeWindow = window as WindowWithLocalFonts;
		if (typeof maybeWindow.queryLocalFonts !== 'function') return [];
		const localFonts = await maybeWindow.queryLocalFonts();
		return localFonts
			.map((entry) => (typeof entry.family === 'string' ? entry.family.trim() : ''))
			.filter((family) => family.length > 0);
	} catch {
		return [];
	}
};

export const FontPickerModal: React.FC<FontPickerModalProps> = ({
	open,
	selectedFontFamily,
	anchorRect,
	onSelect,
	onClose,
}) => {
	const [query, setQuery] = React.useState('');
	const [filter, setFilter] = React.useState<FontFilter>('all');
	const [fonts, setFonts] = React.useState<string[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [viewport, setViewport] = React.useState({ width: window.innerWidth, height: window.innerHeight });
	const searchInputRef = React.useRef<HTMLInputElement | null>(null);

	const selectedBaseFamily = React.useMemo(() => normalizeFontFamily(selectedFontFamily), [selectedFontFamily]);
	const panelHeight = Math.max(380, Math.min(610, viewport.height - 24));

	React.useEffect(() => {
		if (!open) return;
		let cancelled = false;

		const loadFonts = async () => {
			setIsLoading(true);
			const tauriFonts = await loadFontsFromTauri();
			const browserFonts = tauriFonts.length === 0 ? await loadFontsFromBrowser() : [];
			const sourceFonts = tauriFonts.length > 0 ? tauriFonts : browserFonts.length > 0 ? browserFonts : FALLBACK_SYSTEM_FONTS;
			const merged = mergeFontList(selectedBaseFamily, sourceFonts);

			if (!cancelled) {
				setFonts(merged);
				setIsLoading(false);
			}
		};

		void loadFonts();
		return () => {
			cancelled = true;
		};
	}, [open, selectedBaseFamily]);

	React.useEffect(() => {
		if (!open) return;
		searchInputRef.current?.focus();
	}, [open]);

	React.useEffect(() => {
		if (!open) return;
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		const handleViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener('keydown', handleEscape);
		window.addEventListener('resize', handleViewport);
		window.addEventListener('scroll', handleViewport, true);
		return () => {
			window.removeEventListener('keydown', handleEscape);
			window.removeEventListener('resize', handleViewport);
			window.removeEventListener('scroll', handleViewport, true);
		};
	}, [open, onClose]);

	React.useEffect(() => {
		if (!open) {
			setQuery('');
			setFilter('all');
		}
	}, [open]);

	const filteredFonts = React.useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return fonts.filter((family) => {
			if (filter !== 'all' && classifyFont(family) !== filter) return false;
			if (!normalizedQuery) return true;
			return family.toLowerCase().includes(normalizedQuery);
		});
	}, [filter, fonts, query]);

	const panelPosition = React.useMemo(() => {
		if (!anchorRect) {
			return {
				left: Math.max(12, (viewport.width - PANEL_WIDTH) / 2),
				top: Math.max(12, (viewport.height - panelHeight) / 2),
			};
		}

		const spaceLeft = anchorRect.left - 16;
		const spaceRight = viewport.width - anchorRect.right - 16;
		const preferLeft = spaceLeft >= PANEL_WIDTH || spaceLeft >= spaceRight;
		const left = preferLeft
			? Math.max(12, anchorRect.left - PANEL_WIDTH - 10)
			: Math.min(viewport.width - PANEL_WIDTH - 12, anchorRect.right + 10);
		const top = Math.min(Math.max(12, anchorRect.top - 72), viewport.height - panelHeight - 12);
		return { left, top };
	}, [anchorRect, panelHeight, viewport.height, viewport.width]);

	if (!open) return null;

	return (
		<div
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			style={{
				position: 'fixed',
				inset: 0,
				backgroundColor: 'transparent',
				zIndex: 2100,
			}}
		>
			<div
				onMouseDown={(event) => event.stopPropagation()}
				style={{
					position: 'fixed',
					left: `${panelPosition.left}px`,
					top: `${panelPosition.top}px`,
					width: `${PANEL_WIDTH}px`,
					height: `${panelHeight}px`,
					display: 'flex',
					flexDirection: 'column',
					background: 'linear-gradient(180deg, rgba(44, 44, 47, 0.985) 0%, rgba(37, 37, 39, 0.985) 100%)',
					border: '1px solid rgba(255, 255, 255, 0.16)',
					borderRadius: '16px',
					boxShadow: '0 28px 58px rgba(0, 0, 0, 0.6)',
					overflow: 'hidden',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '12px 14px 10px',
						borderBottom: '1px solid rgba(255,255,255,0.1)',
					}}
				>
					<div style={{ color: 'rgba(255,255,255,0.92)', fontSize: '34px', lineHeight: 1 }}>Fonts</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<button
							type="button"
							title="Settings"
							style={{
								width: '30px',
								height: '30px',
								borderRadius: '8px',
								border: '1px solid rgba(255,255,255,0.14)',
								backgroundColor: 'transparent',
								color: 'rgba(255,255,255,0.78)',
								fontSize: '16px',
								cursor: 'default',
							}}
							disabled
						>
							⚙
						</button>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close font picker"
							title="Close"
							style={{
								width: '30px',
								height: '30px',
								border: 'none',
								borderRadius: '8px',
								backgroundColor: 'transparent',
								color: 'rgba(255,255,255,0.82)',
								fontSize: '24px',
								lineHeight: 1,
								cursor: 'pointer',
							}}
						>
							×
						</button>
					</div>
				</div>

				<div style={{ padding: '10px 12px', display: 'grid', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
					<div style={{ position: 'relative' }}>
						<span
							style={{
								position: 'absolute',
								left: '10px',
								top: '50%',
								transform: 'translateY(-50%)',
								color: 'rgba(255,255,255,0.66)',
								fontSize: '14px',
							}}
						>
							🔍
						</span>
						<input
							ref={searchInputRef}
							type="text"
							placeholder="Search fonts"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							style={{
								width: '100%',
								height: '36px',
								padding: '0 34px 0 32px',
								borderRadius: '10px',
								border: '1px solid rgba(255,255,255,0.2)',
								backgroundColor: 'rgba(14, 14, 15, 0.56)',
								color: '#f0f0f0',
								fontSize: '16px',
								outline: 'none',
							}}
						/>
						{query.trim().length > 0 && (
							<button
								type="button"
								onClick={() => setQuery('')}
								title="Clear search"
								aria-label="Clear search"
								style={{
									position: 'absolute',
									right: '8px',
									top: '50%',
									transform: 'translateY(-50%)',
									width: '20px',
									height: '20px',
									border: 'none',
									borderRadius: '50%',
									backgroundColor: 'rgba(255,255,255,0.18)',
									color: 'rgba(255,255,255,0.9)',
									cursor: 'pointer',
									fontSize: '14px',
									lineHeight: 1,
								}}
							>
								×
							</button>
						)}
					</div>

					<select
						value={filter}
						onChange={(event) => setFilter(event.target.value as FontFilter)}
						style={{
							width: '100%',
							height: '34px',
							padding: '0 10px',
							borderRadius: '10px',
							border: '1px solid rgba(255,255,255,0.16)',
							backgroundColor: 'rgba(14, 14, 15, 0.48)',
							color: '#f0f0f0',
							fontSize: '15px',
							outline: 'none',
						}}
					>
						<option value="all">All fonts</option>
						<option value="sans">Sans-serif</option>
						<option value="serif">Serif</option>
						<option value="mono">Monospace</option>
					</select>
				</div>

				<div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
					{isLoading ? (
						<div style={{ padding: '14px 14px', color: 'rgba(255,255,255,0.64)', fontSize: '14px' }}>Loading system fonts...</div>
					) : filteredFonts.length === 0 ? (
						<div style={{ padding: '14px 14px', color: 'rgba(255,255,255,0.64)', fontSize: '14px' }}>No fonts found.</div>
					) : (
						filteredFonts.map((family) => {
							const isSelected = normalizeFontFamily(family) === selectedBaseFamily;
							return (
								<button
									key={family}
									type="button"
									onClick={() => onSelect(family)}
									style={{
										width: '100%',
										display: 'flex',
										alignItems: 'center',
										gap: '8px',
										padding: '8px 12px',
										border: 'none',
										backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
										color: '#f2f2f2',
										cursor: 'pointer',
										textAlign: 'left',
									}}
								>
									<span style={{ width: '16px', color: isSelected ? '#f2f2f2' : 'transparent', fontSize: '16px' }}>✓</span>
									<span
										style={{
											fontFamily: `"${family}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
											fontSize: '18px',
											lineHeight: 1.25,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											flex: 1,
										}}
									>
										{family}
									</span>
								</button>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
};
