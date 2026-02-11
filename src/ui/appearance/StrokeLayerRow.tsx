import React from 'react';
import type { Color, StrokeLayer } from '../../core/doc/types';
import { colors, radii, spacing, typography } from '../design-system';
import { SelectField } from '../controls/SelectField';
import { PaintPopover } from './PaintPopover';

interface StrokeLayerRowProps {
	layer: StrokeLayer;
	index: number;
	total: number;
	onChange: (next: StrokeLayer) => void;
	onRemove: () => void;
	onMove: (direction: -1 | 1) => void;
	recentSwatches: string[];
	sampleSwatches: string[];
	onPushRecentSwatch: (swatch: string) => void;
	onPickImageAsset?: () => Promise<string | null>;
}

const paintPreviewStyle = (paint: Color): React.CSSProperties => {
	if (paint.type === 'solid') return { background: paint.value };
	if (paint.type === 'gradient') {
		const stops = [...paint.stops]
			.sort((a, b) => a.offset - b.offset)
			.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
			.join(', ');
		return { background: `linear-gradient(90deg, ${stops})` };
	}
	if (paint.type === 'pattern') {
		return {
			backgroundColor: paint.bg,
			backgroundImage: `linear-gradient(${paint.fg} 1px, transparent 1px), linear-gradient(90deg, ${paint.fg} 1px, transparent 1px)`,
			backgroundSize: '7px 7px',
		};
	}
	return {
		background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))',
	};
};

const describePaint = (paint: Color): string => {
	if (paint.type === 'solid') return 'Solid';
	if (paint.type === 'gradient') return 'Gradient';
	if (paint.type === 'pattern') return `Pattern (${paint.pattern})`;
	return 'Image';
};

const parseDashPattern = (value: string): number[] | undefined => {
	const entries = value
		.split(/[ ,]+/)
		.map((entry) => Number.parseFloat(entry))
		.filter((entry) => Number.isFinite(entry) && entry >= 0);
	return entries.length > 0 ? entries : undefined;
};

const toDashPatternText = (dashPattern: number[] | undefined): string => {
	if (!dashPattern || dashPattern.length === 0) return '';
	return dashPattern.join(', ');
};

export const StrokeLayerRow: React.FC<StrokeLayerRowProps> = ({
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
						aria-label={`Toggle stroke layer ${index + 1}`}
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
						<div style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>Stroke {index + 1}</div>
						<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>{describePaint(layer.paint)}</div>
					</div>
					<button type="button" onClick={() => onMove(-1)} disabled={index === 0} style={iconButtonStyle(index === 0)}>
						↑
					</button>
					<button type="button" onClick={() => onMove(1)} disabled={index === total - 1} style={iconButtonStyle(index === total - 1)}>
						↓
					</button>
					<button type="button" onClick={onRemove} style={iconButtonStyle(false)}>
						Delete
					</button>
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.sm }}>
					<div>
						<label style={labelStyle}>Width</label>
						<input
							type="number"
							min={0}
							step={0.25}
							value={layer.width}
							onChange={(event) => onChange({ ...layer, width: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
							style={numberInputStyle}
						/>
					</div>
					<SelectField
						label="Align"
						value={layer.align ?? 'center'}
						onChange={(align) => onChange({ ...layer, align: align as StrokeLayer['align'] })}
						options={[
							{ value: 'inside', label: 'Inside' },
							{ value: 'center', label: 'Center' },
							{ value: 'outside', label: 'Outside' },
						]}
					/>
					<div>
						<label style={labelStyle}>Opacity</label>
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
							style={numberInputStyle}
						/>
					</div>
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.sm }}>
					<SelectField
						label="Cap"
						value={layer.cap ?? 'butt'}
						onChange={(cap) => onChange({ ...layer, cap: cap as StrokeLayer['cap'] })}
						options={[
							{ value: 'butt', label: 'Butt' },
							{ value: 'round', label: 'Round' },
							{ value: 'square', label: 'Square' },
						]}
					/>
					<SelectField
						label="Join"
						value={layer.join ?? 'miter'}
						onChange={(join) => onChange({ ...layer, join: join as StrokeLayer['join'] })}
						options={[
							{ value: 'miter', label: 'Miter' },
							{ value: 'round', label: 'Round' },
							{ value: 'bevel', label: 'Bevel' },
						]}
					/>
					<div>
						<label style={labelStyle}>Miter limit</label>
						<input
							type="number"
							min={0}
							step={0.25}
							value={layer.miterLimit ?? 10}
							onChange={(event) => onChange({ ...layer, miterLimit: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
							style={numberInputStyle}
						/>
					</div>
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
					<div>
						<label style={labelStyle}>Dash pattern</label>
						<input
							type="text"
							placeholder="4, 2"
							value={toDashPatternText(layer.dashPattern)}
							onChange={(event) => onChange({ ...layer, dashPattern: parseDashPattern(event.target.value) })}
							style={numberInputStyle}
						/>
					</div>
					<div>
						<label style={labelStyle}>Dash offset</label>
						<input
							type="number"
							step={0.25}
							value={layer.dashOffset ?? 0}
							onChange={(event) => onChange({ ...layer, dashOffset: Number.parseFloat(event.target.value) || 0 })}
							style={numberInputStyle}
						/>
					</div>
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

const labelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: typography.fontSize.xs,
	color: colors.text.tertiary,
	marginBottom: '4px',
};

const numberInputStyle: React.CSSProperties = {
	width: '100%',
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
