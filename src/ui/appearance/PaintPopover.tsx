import React from 'react';
import { createPortal } from 'react-dom';
import type { Color, LayerBlendMode } from '../../core/doc/types';
import { colors, radii, spacing, typography, zIndex } from '../design-system';
import { BlendModePicker } from './BlendModePicker';
import { ColorField2D } from './ColorField2D';
import { GradientEditor } from './GradientEditor';
import { PaintMode, PaintModeTabs } from './PaintModeTabs';
import { PaintSwatchesRow } from './PaintSwatchesRow';
import { normalizeHex } from './color-utils';

interface PaintPopoverProps {
	open: boolean;
	anchorEl: HTMLElement | null;
	paint: Color;
	blendMode?: LayerBlendMode;
	onChangePaint: (paint: Color) => void;
	onChangeBlendMode?: (blendMode: LayerBlendMode) => void;
	onRequestClose: () => void;
	recentSwatches: string[];
	sampleSwatches: string[];
	onPushRecentSwatch: (swatch: string) => void;
	onPickImageAsset?: () => Promise<string | null>;
}

const POPOVER_WIDTH = 300;
const ESTIMATED_POPOVER_HEIGHT = 580;

const DEFAULT_GRADIENT: Extract<Color, { type: 'gradient' }> = {
	type: 'gradient',
	kind: 'linear',
	stops: [
		{ offset: 0, color: '#ff6a5e' },
		{ offset: 1, color: '#4f7bff' },
	],
	angle: 0,
};

const DEFAULT_PATTERN: Extract<Color, { type: 'pattern' }> = {
	type: 'pattern',
	pattern: 'grid',
	fg: '#ffffff',
	bg: '#1b1b1f',
	scale: 1,
	rotation: 0,
	opacity: 1,
};

const makeDefaultImage = (assetId: string): Extract<Color, { type: 'image' }> => ({
	type: 'image',
	assetId,
	fit: 'fill',
	opacity: 1,
});

const modeFromPaint = (paint: Color): PaintMode => {
	if (paint.type === 'gradient') return 'gradient';
	if (paint.type === 'pattern') return 'pattern';
	if (paint.type === 'image') return 'image';
	return 'solid';
};

const toSolidColor = (paint: Color): string => {
	if (paint.type === 'solid') return paint.value;
	if (paint.type === 'pattern') return paint.fg;
	if (paint.type === 'gradient') return paint.stops[0]?.color ?? '#888888';
	return '#888888';
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const PaintPopover: React.FC<PaintPopoverProps> = ({
	open,
	anchorEl,
	paint,
	blendMode,
	onChangePaint,
	onChangeBlendMode,
	onRequestClose,
	recentSwatches,
	sampleSwatches,
	onPushRecentSwatch,
	onPickImageAsset,
}) => {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const blendSectionRef = React.useRef<HTMLDivElement | null>(null);
	const dragRef = React.useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
	const [mode, setMode] = React.useState<PaintMode>(() => modeFromPaint(paint));
	const [position, setPosition] = React.useState({ top: 0, left: 0 });
	const [isDragging, setIsDragging] = React.useState(false);

	React.useEffect(() => {
		setMode(modeFromPaint(paint));
	}, [paint]);

	React.useLayoutEffect(() => {
		if (!open || !anchorEl) return;
		const rect = anchorEl.getBoundingClientRect();
		const preferredLeft = rect.left - POPOVER_WIDTH - 14;
		const fallbackRight = rect.right + 14;
		const canUsePreferred = preferredLeft >= 8;
		const canUseFallback = fallbackRight + POPOVER_WIDTH <= window.innerWidth - 8;
		const left = clamp(canUsePreferred ? preferredLeft : canUseFallback ? fallbackRight : preferredLeft, 8, window.innerWidth - POPOVER_WIDTH - 8);
		const maxTop = Math.max(8, window.innerHeight - ESTIMATED_POPOVER_HEIGHT - 8);
		const top = clamp(rect.top - 68, 8, maxTop);
		setPosition({ top, left });
	}, [open, anchorEl]);

	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onRequestClose();
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (rootRef.current?.contains(target)) return;
			if (anchorEl?.contains(target as globalThis.Node)) return;
			onRequestClose();
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('pointerdown', onPointerDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('pointerdown', onPointerDown);
		};
	}, [open, onRequestClose, anchorEl]);

	React.useEffect(() => {
		if (!isDragging) return;
		const onPointerMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) return;
			const nextLeft = clamp(drag.left + (event.clientX - drag.startX), 8, window.innerWidth - POPOVER_WIDTH - 8);
			const maxTop = Math.max(8, window.innerHeight - ESTIMATED_POPOVER_HEIGHT - 8);
			const nextTop = clamp(drag.top + (event.clientY - drag.startY), 8, maxTop);
			setPosition({ top: nextTop, left: nextLeft });
		};
		const stopDragging = () => {
			setIsDragging(false);
			dragRef.current = null;
		};
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', stopDragging);
		window.addEventListener('pointercancel', stopDragging);
		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', stopDragging);
			window.removeEventListener('pointercancel', stopDragging);
		};
	}, [isDragging]);

	if (!open || !anchorEl) return null;

	const setModeAndPaint = (nextMode: PaintMode) => {
		setMode(nextMode);
		if (nextMode === 'solid') {
			onChangePaint({ type: 'solid', value: toSolidColor(paint) });
			return;
		}
		if (nextMode === 'gradient') {
			onChangePaint(paint.type === 'gradient' ? paint : DEFAULT_GRADIENT);
			return;
		}
		if (nextMode === 'pattern') {
			onChangePaint(paint.type === 'pattern' ? paint : DEFAULT_PATTERN);
			return;
		}
		if (paint.type === 'image') return;
		onChangePaint({ type: 'solid', value: '#888888' });
	};

	const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('select')) return;
		event.preventDefault();
		dragRef.current = {
			startX: event.clientX,
			startY: event.clientY,
			left: position.left,
			top: position.top,
		};
		setIsDragging(true);
	};

	const content = (
		<div
			ref={rootRef}
			style={{
				position: 'fixed',
				top: position.top,
				left: position.left,
				width: `${POPOVER_WIDTH}px`,
				maxHeight: 'min(580px, calc(100vh - 16px))',
				overflowY: 'auto',
				background: 'linear-gradient(180deg, #303136 0%, #27282d 100%)',
				border: '1px solid rgba(255,255,255,0.12)',
				borderRadius: '16px',
				boxShadow: '0 16px 36px rgba(0, 0, 0, 0.52)',
				zIndex: zIndex.popover,
			}}
		>
			<div
				onPointerDown={startDrag}
				style={{
					padding: '8px 8px 6px',
					borderBottom: '1px solid rgba(255,255,255,0.08)',
					cursor: isDragging ? 'grabbing' : 'grab',
					userSelect: 'none',
				}}
			>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: spacing.sm }}>
					<div style={{ display: 'flex', gap: spacing.xs }}>
						<button type="button" style={headerTabStyle(true)}>
							Custom
						</button>
						<button type="button" style={headerTabStyle(false)}>
							Libraries
						</button>
					</div>
					<div style={{ display: 'flex', gap: '2px' }}>
						<button type="button" style={headerActionButtonStyle} title="Add paint">
							<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
								<path d="M7.5 2.4v10.2M2.4 7.5h10.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
							</svg>
						</button>
						<button type="button" style={headerActionButtonStyle} title="Close" onClick={onRequestClose}>
							<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
								<path d="M3 3l9 9M12 3l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
							</svg>
						</button>
					</div>
				</div>
			</div>

			<div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
				<PaintModeTabs
					value={mode}
					onChange={setModeAndPaint}
					onBlendShortcut={() => blendSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
				/>
			</div>

			<div style={{ padding: '8px', display: 'grid', gap: spacing.sm }}>
				{mode === 'solid' && (
					<ColorField2D
						value={paint.type === 'solid' ? paint.value : toSolidColor(paint)}
						onChange={(nextColor) => onChangePaint({ type: 'solid', value: nextColor })}
						onCommit={(nextColor) => onPushRecentSwatch(nextColor)}
					/>
				)}

				{mode === 'gradient' && (
					<GradientEditor
						value={paint.type === 'gradient' ? paint : DEFAULT_GRADIENT}
						onChange={(nextGradient) => {
							onChangePaint(nextGradient);
							const firstStop = nextGradient.stops[0]?.color;
							if (firstStop) onPushRecentSwatch(firstStop);
						}}
					/>
				)}

				{mode === 'pattern' && (
					<div style={{ display: 'grid', gap: spacing.sm }}>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: spacing.xs }}>
							{(['grid', 'dots', 'stripes', 'noise'] as const).map((patternKind) => {
								const active = paint.type === 'pattern' && paint.pattern === patternKind;
								return (
									<button
										key={patternKind}
										type="button"
										onClick={() =>
											onChangePaint({
												...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN),
												pattern: patternKind,
											})
										}
										style={{
											height: '30px',
											borderRadius: '9px',
											border: `1px solid ${active ? 'rgba(255,255,255,0.26)' : colors.border.default}`,
											backgroundColor: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
											color: colors.text.secondary,
											textTransform: 'capitalize',
											fontSize: typography.fontSize.sm,
											cursor: 'pointer',
										}}
									>
										{patternKind}
									</button>
								);
							})}
						</div>
						<ColorField2D
							value={paint.type === 'pattern' ? paint.fg : DEFAULT_PATTERN.fg}
							onChange={(nextFg) =>
								onChangePaint({
									...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN),
									fg: nextFg,
								})
							}
							onCommit={(nextFg) => onPushRecentSwatch(nextFg)}
						/>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.xs }}>
							<div>
								<label style={miniLabelStyle}>Background</label>
								<input
									type="color"
									value={normalizeHex(paint.type === 'pattern' ? paint.bg : DEFAULT_PATTERN.bg, '#1b1b1f')}
									onChange={(event) => {
										const nextBg = event.target.value;
										onChangePaint({
											...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN),
											bg: nextBg,
										});
										onPushRecentSwatch(nextBg);
									}}
									style={swatchInputStyle}
								/>
							</div>
							<div>
								<label style={miniLabelStyle}>Scale</label>
								<input
									type="number"
									min={0.2}
									max={8}
									step={0.1}
									value={paint.type === 'pattern' ? paint.scale : DEFAULT_PATTERN.scale}
									onChange={(event) =>
										onChangePaint({
											...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN),
											scale: clamp(Number.parseFloat(event.target.value) || 1, 0.2, 8),
										})
									}
									style={textInputStyle}
								/>
							</div>
							<div>
								<label style={miniLabelStyle}>Rotation</label>
								<input
									type="number"
									step={1}
									value={paint.type === 'pattern' ? paint.rotation : DEFAULT_PATTERN.rotation}
									onChange={(event) =>
										onChangePaint({
											...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN),
											rotation: Number.parseFloat(event.target.value) || 0,
										})
									}
									style={textInputStyle}
								/>
							</div>
						</div>
					</div>
				)}

				{mode === 'image' && (
					<div style={{ display: 'grid', gap: spacing.sm }}>
						<button
							type="button"
							onClick={async () => {
								if (!onPickImageAsset) return;
								const assetId = await onPickImageAsset();
								if (!assetId) return;
								onChangePaint(makeDefaultImage(assetId));
							}}
							style={actionButtonStyle}
						>
							{paint.type === 'image' ? 'Replace image' : 'Choose image'}
						</button>
						<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>
							{paint.type === 'image' ? `Asset: ${paint.assetId}` : 'No image selected'}
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
							<div>
								<label style={miniLabelStyle}>Fit</label>
								<select
									className="gal-select-field"
									value={paint.type === 'image' ? paint.fit : 'fill'}
									onChange={(event) => {
										if (paint.type !== 'image') return;
										onChangePaint({ ...paint, fit: event.target.value as Extract<Color, { type: 'image' }>['fit'] });
									}}
									style={selectStyle}
									disabled={paint.type !== 'image'}
								>
									<option value="fill">Fill</option>
									<option value="fit">Fit</option>
									<option value="tile">Tile</option>
								</select>
							</div>
							<div>
								<label style={miniLabelStyle}>Opacity</label>
								<input
									type="number"
									min={0}
									max={100}
									step={1}
									value={Math.round(((paint.type === 'image' ? paint.opacity : 1) ?? 1) * 100)}
									onChange={(event) => {
										if (paint.type !== 'image') return;
										const nextOpacity = clamp((Number.parseFloat(event.target.value) || 0) / 100, 0, 1);
										onChangePaint({ ...paint, opacity: nextOpacity });
									}}
									style={textInputStyle}
									disabled={paint.type !== 'image'}
								/>
							</div>
						</div>
					</div>
				)}

				{onChangeBlendMode ? (
					<div ref={blendSectionRef}>
						<BlendModePicker value={blendMode} onChange={onChangeBlendMode} />
					</div>
				) : null}
			</div>

			<div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
				<PaintSwatchesRow
					title="On this page"
					recentSwatches={recentSwatches}
					sampleSwatches={sampleSwatches}
					onPick={(swatch) => {
						if (mode === 'pattern') {
							onChangePaint({ ...(paint.type === 'pattern' ? paint : DEFAULT_PATTERN), fg: swatch });
						} else {
							onChangePaint({ type: 'solid', value: swatch });
						}
						onPushRecentSwatch(swatch);
					}}
				/>
			</div>
		</div>
	);

	return createPortal(content, document.body);
};

const headerTabStyle = (active: boolean): React.CSSProperties => ({
	height: '28px',
	padding: '0 10px',
	borderRadius: '8px',
	border: active ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
	backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
	color: active ? '#f4f4f5' : 'rgba(255,255,255,0.58)',
	fontSize: typography.fontSize.lg,
	fontWeight: 500,
	cursor: 'default',
});

const headerActionButtonStyle: React.CSSProperties = {
	height: '24px',
	width: '24px',
	display: 'grid',
	placeItems: 'center',
	borderRadius: '7px',
	border: '1px solid transparent',
	backgroundColor: 'transparent',
	color: 'rgba(255,255,255,0.78)',
	cursor: 'pointer',
};

const miniLabelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: typography.fontSize.xs,
	color: colors.text.tertiary,
	marginBottom: '3px',
};

const swatchInputStyle: React.CSSProperties = {
	width: '100%',
	height: '32px',
	border: `1px solid ${colors.border.default}`,
	borderRadius: radii.md,
	backgroundColor: colors.bg.tertiary,
};

const textInputStyle: React.CSSProperties = {
	height: '32px',
	width: '100%',
	padding: `0 ${spacing.sm}`,
	border: '1px solid rgba(255,255,255,0.08)',
	borderRadius: '8px',
	backgroundColor: 'rgba(255,255,255,0.06)',
	color: colors.text.primary,
	fontSize: typography.fontSize.md,
};

const selectStyle: React.CSSProperties = {
	height: '32px',
	borderRadius: '8px',
	backgroundColor: 'rgba(255,255,255,0.06)',
	borderColor: 'rgba(255,255,255,0.08)',
};

const actionButtonStyle: React.CSSProperties = {
	height: '32px',
	padding: `0 ${spacing.sm}`,
	borderRadius: '8px',
	border: '1px solid rgba(255,255,255,0.12)',
	backgroundColor: 'rgba(255,255,255,0.05)',
	color: colors.text.secondary,
	fontSize: typography.fontSize.md,
	cursor: 'pointer',
};
