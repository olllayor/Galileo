import React from 'react';
import type { Color, PaintLayer } from '../../core/doc/types';
import { colors, radii, spacing, typography } from '../design-system';
import { PaintPopover } from './PaintPopover';

interface PaintLayerRowProps {
	layer: PaintLayer;
	index: number;
	total: number;
	onChange: (next: PaintLayer) => void;
	onRemove: () => void;
	onMove: (direction: -1 | 1) => void;
	recentSwatches: string[];
	sampleSwatches: string[];
	onPushRecentSwatch: (swatch: string) => void;
	onPickImageAsset?: () => Promise<string | null>;
}

const describePaint = (paint: Color): string => {
	if (paint.type === 'solid') return 'Solid';
	if (paint.type === 'gradient') return 'Gradient';
	if (paint.type === 'pattern') return `Pattern (${paint.pattern})`;
	return 'Image';
};

const paintPreviewStyle = (paint: Color): React.CSSProperties => {
	if (paint.type === 'solid') {
		return { background: paint.value };
	}
	if (paint.type === 'gradient') {
		const stops = [...paint.stops]
			.sort((a, b) => a.offset - b.offset)
			.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
			.join(', ');
		const angle = typeof paint.angle === 'number' ? paint.angle : 90;
		return { background: `linear-gradient(${angle}deg, ${stops})` };
	}
	if (paint.type === 'pattern') {
		if (paint.pattern === 'dots') {
			return {
				backgroundColor: paint.bg,
				backgroundImage: `radial-gradient(${paint.fg} 28%, transparent 30%)`,
				backgroundSize: `${12 * Math.max(0.3, paint.scale)}px ${12 * Math.max(0.3, paint.scale)}px`,
			};
		}
		if (paint.pattern === 'stripes') {
			return {
				backgroundColor: paint.bg,
				backgroundImage: `repeating-linear-gradient(45deg, ${paint.fg} 0, ${paint.fg} 4px, transparent 4px, transparent 9px)`,
			};
		}
		if (paint.pattern === 'noise') {
			return {
				backgroundColor: paint.bg,
				backgroundImage: `linear-gradient(45deg, ${paint.fg}22 25%, transparent 25%, transparent 50%, ${paint.fg}22 50%, ${paint.fg}22 75%, transparent 75%, transparent)`,
				backgroundSize: '8px 8px',
			};
		}
		return {
			backgroundColor: paint.bg,
			backgroundImage: `linear-gradient(${paint.fg} 1px, transparent 1px), linear-gradient(90deg, ${paint.fg} 1px, transparent 1px)`,
			backgroundSize: '8px 8px',
		};
	}
	return {
		background:
			'linear-gradient(135deg, rgba(255,255,255,0.15) 0 40%, rgba(255,255,255,0.05) 40% 60%, rgba(255,255,255,0.15) 60% 100%)',
	};
};

export const PaintLayerRow: React.FC<PaintLayerRowProps> = ({
	layer,
	index,
	total,
	onChange,
	onRemove,
	onMove,
	recentSwatches,
	sampleSwatches,
	onPushRecentSwatch,
	onPickImageAsset,
}) => {
	const [open, setOpen] = React.useState(false);
	const swatchButtonRef = React.useRef<HTMLButtonElement | null>(null);
	return (
		<>
			<div
				style={{
					display: 'grid',
					gap: spacing.sm,
					padding: spacing.sm,
					borderRadius: radii.md,
					border: `1px solid ${colors.border.subtle}`,
					backgroundColor: colors.bg.tertiary,
				}}
			>
				<div style={{ display: 'grid', gridTemplateColumns: 'auto 28px 1fr auto auto auto', gap: spacing.xs, alignItems: 'center' }}>
					<input
						type="checkbox"
						checked={layer.visible !== false}
						onChange={(event) => onChange({ ...layer, visible: event.target.checked })}
						aria-label={`Toggle fill layer ${index + 1}`}
						style={{ accentColor: colors.accent.primary }}
					/>
					<button
						ref={swatchButtonRef}
						type="button"
						onClick={() => setOpen((prev) => !prev)}
						style={{
							width: '28px',
							height: '28px',
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							cursor: 'pointer',
							...paintPreviewStyle(layer.paint),
						}}
					/>
					<div style={{ display: 'grid', gap: '2px' }}>
						<div style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>Fill {index + 1}</div>
						<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>{describePaint(layer.paint)}</div>
					</div>
					<input
						type="number"
						min={0}
						max={100}
						step={1}
						value={Math.round((layer.opacity ?? 1) * 100)}
						onChange={(event) => {
							const nextOpacity = Math.min(100, Math.max(0, Number.parseFloat(event.target.value) || 0)) / 100;
							onChange({ ...layer, opacity: nextOpacity });
						}}
						style={{ ...numberInputStyle, width: '66px' }}
					/>
					<button type="button" onClick={() => onMove(-1)} disabled={index === 0} style={iconButtonStyle(index === 0)}>
						↑
					</button>
					<button type="button" onClick={() => onMove(1)} disabled={index === total - 1} style={iconButtonStyle(index === total - 1)}>
						↓
					</button>
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
					<button type="button" onClick={onRemove} style={iconButtonStyle(false)}>
						Delete
					</button>
				</div>
			</div>

			<PaintPopover
				open={open}
				anchorEl={swatchButtonRef.current}
				paint={layer.paint}
				blendMode={layer.blendMode}
				onChangePaint={(paint) => onChange({ ...layer, paint })}
				onChangeBlendMode={(blendMode) => onChange({ ...layer, blendMode })}
				onRequestClose={() => setOpen(false)}
				recentSwatches={recentSwatches}
				sampleSwatches={sampleSwatches}
				onPushRecentSwatch={onPushRecentSwatch}
				onPickImageAsset={onPickImageAsset}
			/>
		</>
	);
};

const numberInputStyle: React.CSSProperties = {
	height: '30px',
	padding: `0 ${spacing.sm}`,
	borderRadius: radii.md,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: colors.bg.secondary,
	color: colors.text.primary,
	fontSize: typography.fontSize.md,
};

const iconButtonStyle = (disabled: boolean): React.CSSProperties => ({
	height: '24px',
	padding: `0 ${spacing.xs}`,
	borderRadius: radii.sm,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: colors.bg.secondary,
	color: disabled ? colors.text.disabled : colors.text.secondary,
	fontSize: typography.fontSize.sm,
	cursor: disabled ? 'not-allowed' : 'pointer',
});
