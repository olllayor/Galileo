import React from 'react';
import type { Color } from '../../core/doc/types';
import { colors, radii, spacing, typography } from '../design-system';
import { SelectField } from '../controls/SelectField';

type GradientColor = Extract<Color, { type: 'gradient' }>;

interface GradientEditorProps {
	value: GradientColor;
	onChange: (next: GradientColor) => void;
}

const isHexColor = (value: string): boolean => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toHex = (value: number): string => {
	const rounded = Math.round(clamp(value, 0, 255));
	return rounded.toString(16).padStart(2, '0');
};

const normalizeSolidColor = (value: string, fallback = '#7d7d7d'): string => {
	const trimmed = value.trim();
	if (isHexColor(trimmed)) {
		if (trimmed.length === 4) {
			return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
		}
		return trimmed;
	}
	const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
	if (!rgbaMatch) return fallback;
	const parts = rgbaMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
	if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return fallback;
	return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`;
};

const readOpacity = (value: string): number => {
	const trimmed = value.trim();
	if (trimmed.startsWith('#')) return 1;
	const rgbaMatch = trimmed.match(/^rgba\(([^)]+)\)$/i);
	if (!rgbaMatch) return 1;
	const parts = rgbaMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
	if (parts.length < 4 || !Number.isFinite(parts[3])) return 1;
	return clamp(parts[3], 0, 1);
};

const composeColorWithOpacity = (hex: string, opacity: number): string => {
	const normalizedHex = normalizeSolidColor(hex);
	if (opacity >= 0.999) return normalizedHex;
	const r = Number.parseInt(normalizedHex.slice(1, 3), 16);
	const g = Number.parseInt(normalizedHex.slice(3, 5), 16);
	const b = Number.parseInt(normalizedHex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`;
};

const parseCoordinate = (value: string, fallback: number): number => {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureStops = (stops: GradientColor['stops']): GradientColor['stops'] => {
	const next = (stops ?? [])
		.filter((stop) => Number.isFinite(stop.offset) && typeof stop.color === 'string')
		.map((stop) => ({
			offset: clamp(stop.offset, 0, 1),
			color: stop.color,
		}));
	if (next.length > 0) return next;
	return [
		{ offset: 0, color: '#000000' },
		{ offset: 1, color: '#ffffff' },
	];
};

export const GradientEditor: React.FC<GradientEditorProps> = ({ value, onChange }) => {
	const stops = React.useMemo(() => ensureStops(value.stops), [value.stops]);

	const updateStops = (nextStops: GradientColor['stops']) => {
		onChange({ ...value, stops: ensureStops(nextStops) });
	};

	const updateStop = (index: number, updater: (stop: GradientColor['stops'][number]) => GradientColor['stops'][number]) => {
		const next = stops.map((stop, stopIndex) => (stopIndex === index ? updater(stop) : stop));
		updateStops(next);
	};

	const addStop = () => {
		const sorted = [...stops].sort((a, b) => a.offset - b.offset);
		const previous = sorted[Math.max(0, sorted.length - 2)] ?? sorted[0];
		const last = sorted[sorted.length - 1] ?? previous;
		const offset = previous && last ? clamp((previous.offset + last.offset) / 2, 0, 1) : 0.5;
		updateStops([...stops, { offset, color: composeColorWithOpacity('#7d7d7d', 1) }]);
	};

	const gradientPreview = React.useMemo(() => {
		const sorted = [...stops].sort((a, b) => a.offset - b.offset);
		return `linear-gradient(90deg, ${sorted.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(', ')})`;
	}, [stops]);

	return (
		<div
			style={{
				display: 'grid',
				gap: spacing.sm,
				padding: spacing.sm,
				borderRadius: radii.sm,
				border: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.primary,
			}}
		>
			<div style={{ height: '18px', borderRadius: radii.sm, border: `1px solid ${colors.border.default}`, background: gradientPreview }} />

			<SelectField
				label="Type"
				value={value.kind ?? 'linear'}
				onChange={(kind) => onChange({ ...value, kind: kind === 'radial' ? 'radial' : 'linear' })}
				options={[
					{ value: 'linear', label: 'Linear' },
					{ value: 'radial', label: 'Radial' },
				]}
			/>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
				<div>
					<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
						Angle
					</label>
					<input
						type="number"
						value={Number.isFinite(value.angle) ? value.angle : 0}
						onChange={(event) => onChange({ ...value, angle: parseCoordinate(event.target.value, 0) })}
						style={{
							width: '100%',
							height: '30px',
							padding: `0 ${spacing.sm}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							fontSize: typography.fontSize.md,
						}}
					/>
				</div>
				<div>
					<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
						Radius
					</label>
					<input
						type="number"
						step="0.01"
						value={Number.isFinite(value.radius) ? value.radius : 0.5}
						onChange={(event) => onChange({ ...value, radius: clamp(parseCoordinate(event.target.value, 0.5), 0, 2) })}
						style={{
							width: '100%',
							height: '30px',
							padding: `0 ${spacing.sm}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							fontSize: typography.fontSize.md,
						}}
					/>
				</div>
			</div>

			<div style={{ display: 'grid', gap: spacing.xs }}>
				<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Stops</div>
				{stops.map((stop, index) => {
					const colorHex = normalizeSolidColor(stop.color);
					const opacity = readOpacity(stop.color);
					return (
						<div
							key={`stop-${index}-${stop.offset}`}
							style={{
								display: 'grid',
								gridTemplateColumns: '28px 1fr 68px auto',
								gap: spacing.xs,
								alignItems: 'center',
							}}
						>
							<input
								type="color"
								value={colorHex}
								onChange={(event) =>
									updateStop(index, (current) => ({
										...current,
										color: composeColorWithOpacity(event.target.value, readOpacity(current.color)),
									}))
								}
								style={{ width: '28px', height: '28px', border: 'none', padding: 0, background: 'transparent' }}
							/>
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={Math.round(clamp(stop.offset, 0, 1) * 100)}
								onChange={(event) => {
									const nextOffset = clamp(Number.parseFloat(event.target.value) / 100, 0, 1);
									updateStop(index, (current) => ({ ...current, offset: nextOffset }));
								}}
							/>
							<input
								type="number"
								min={0}
								max={100}
								step={1}
								value={Math.round(opacity * 100)}
								title="Stop opacity"
								onChange={(event) => {
									const nextOpacity = clamp(parseCoordinate(event.target.value, 100) / 100, 0, 1);
									updateStop(index, (current) => ({
										...current,
										color: composeColorWithOpacity(normalizeSolidColor(current.color), nextOpacity),
									}));
								}}
								style={{
									width: '68px',
									height: '28px',
									padding: `0 ${spacing.xs}`,
									borderRadius: radii.md,
									border: `1px solid ${colors.border.default}`,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
									fontSize: typography.fontSize.md,
								}}
							/>
							<button
								type="button"
								onClick={() => updateStops(stops.filter((_, stopIndex) => stopIndex !== index))}
								disabled={stops.length <= 1}
								style={{
									height: '28px',
									padding: `0 ${spacing.xs}`,
									borderRadius: radii.md,
									border: `1px solid ${colors.border.default}`,
									backgroundColor: colors.bg.secondary,
									color: colors.text.secondary,
									fontSize: typography.fontSize.md,
									cursor: stops.length <= 1 ? 'not-allowed' : 'pointer',
								}}
							>
								Remove
							</button>
						</div>
					);
				})}
			</div>

			<button
				type="button"
				onClick={addStop}
				style={{
					height: '28px',
					padding: `0 ${spacing.sm}`,
					borderRadius: radii.md,
					border: `1px solid ${colors.border.default}`,
					backgroundColor: colors.bg.tertiary,
					color: colors.text.secondary,
					fontSize: typography.fontSize.md,
					cursor: 'pointer',
				}}
			>
				Add stop
			</button>
		</div>
	);
};
