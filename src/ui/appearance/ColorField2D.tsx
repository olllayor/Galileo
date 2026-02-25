import React from 'react';
import { colors, spacing, typography } from '../design-system';
import { hsvaToRgba, normalizeHex, parseColor, rgbaToHex, rgbaToHsva, toColorString } from './color-utils';

interface ColorField2DProps {
	value: string;
	onChange: (next: string) => void;
	onCommit?: (next: string) => void;
}

interface EyeDropperLike {
	open: () => Promise<{ sRGBHex: string }>;
}

declare global {
	interface Window {
		EyeDropper?: {
			new (): EyeDropperLike;
		};
	}
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const nearlyEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.0001;

const checkerboardBackground =
	'linear-gradient(45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.14) 75%)';

export const ColorField2D: React.FC<ColorField2DProps> = ({ value, onChange, onCommit }) => {
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const [hsva, setHsva] = React.useState(() => rgbaToHsva(parseColor(value)));

	React.useEffect(() => {
		const next = rgbaToHsva(parseColor(value));
		setHsva((prev) => {
			if (
				nearlyEqual(next.h, prev.h) &&
				nearlyEqual(next.s, prev.s) &&
				nearlyEqual(next.v, prev.v) &&
				nearlyEqual(next.a, prev.a)
			) {
				return prev;
			}
			return next;
		});
	}, [value]);

	const rgba = React.useMemo(() => hsvaToRgba(hsva), [hsva]);
	const hex = React.useMemo(() => rgbaToHex(rgba), [rgba]);
	const colorString = React.useMemo(() => toColorString(rgba), [rgba]);
	const eyedropperSupported = typeof window !== 'undefined' && typeof window.EyeDropper === 'function';

	const commit = React.useCallback(
		(next: string) => {
			onCommit?.(next);
		},
		[onCommit],
	);

	const setSaturationValueFromEvent = React.useCallback(
		(clientX: number, clientY: number) => {
			if (!rootRef.current) return;
			const rect = rootRef.current.getBoundingClientRect();
			const s = clamp((clientX - rect.left) / rect.width, 0, 1);
			const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
			setHsva((prev) => {
				const next = { ...prev, s, v };
				onChange(toColorString(hsvaToRgba(next)));
				return next;
			});
		},
		[onChange],
	);

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
		setSaturationValueFromEvent(event.clientX, event.clientY);
	};

	const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!(event.currentTarget as HTMLDivElement).hasPointerCapture(event.pointerId)) return;
		setSaturationValueFromEvent(event.clientX, event.clientY);
	};

	const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if ((event.currentTarget as HTMLDivElement).hasPointerCapture(event.pointerId)) {
			(event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
		}
		commit(colorString);
	};

	const hueColor = toColorString(hsvaToRgba({ ...hsva, s: 1, v: 1, a: 1 }));
	const svLeft = `${hsva.s * 100}%`;
	const svTop = `${(1 - hsva.v) * 100}%`;

	return (
		<div style={{ display: 'grid', gap: '10px' }}>
			<div
				ref={rootRef}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				style={{
					position: 'relative',
					height: '196px',
					borderRadius: '9px',
					border: '1px solid rgba(255, 255, 255, 0.14)',
					background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
					cursor: 'crosshair',
					overflow: 'hidden',
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: svLeft,
						top: svTop,
						width: '20px',
						height: '20px',
						borderRadius: '50%',
						background: 'rgba(235, 235, 235, 0.96)',
						boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255,255,255,0.9)',
						transform: 'translate(-50%, -50%)',
						pointerEvents: 'none',
					}}
				/>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: spacing.xs, alignItems: 'center' }}>
				<button
					type="button"
					onClick={async () => {
						if (!eyedropperSupported) return;
						try {
							const picker = new window.EyeDropper!();
							const result = await picker.open();
							onChange(result.sRGBHex);
							commit(result.sRGBHex);
						} catch {
							// User cancelled eyedropper.
						}
					}}
					disabled={!eyedropperSupported}
					title={eyedropperSupported ? 'Sample color from screen' : 'Eyedropper not available in this browser'}
					style={{
						height: '16px',
						width: '16px',
						display: 'grid',
						placeItems: 'center',
						border: 'none',
						background: 'transparent',
						color: eyedropperSupported ? 'rgba(255,255,255,0.76)' : colors.text.disabled,
						padding: 0,
						cursor: eyedropperSupported ? 'pointer' : 'not-allowed',
					}}
				>
					<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
						<path
							d="M8.5 2.1l3.4 3.4-1.3 1.3-1-1-2.5 2.5.7.7-4 2.8 2.8-4 .7.7 2.5-2.5-1-1z"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<input
					className="paint-popover-range paint-popover-range-hue"
					type="range"
					min={0}
					max={360}
					step={1}
					value={Math.round(hsva.h)}
					onChange={(event) => {
						const h = clamp(Number.parseFloat(event.target.value) || 0, 0, 360);
						setHsva((prev) => {
							const next = { ...prev, h };
							onChange(toColorString(hsvaToRgba(next)));
							return next;
						});
					}}
					onPointerUp={() => commit(colorString)}
					aria-label="Hue"
				/>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: spacing.xs, alignItems: 'center' }}>
				<div />
				<input
					className="paint-popover-range paint-popover-range-alpha"
					type="range"
					min={0}
					max={100}
					step={1}
					value={Math.round(hsva.a * 100)}
					onChange={(event) => {
						const a = clamp((Number.parseFloat(event.target.value) || 0) / 100, 0, 1);
						setHsva((prev) => {
							const next = { ...prev, a };
							onChange(toColorString(hsvaToRgba(next)));
							return next;
						});
					}}
					onPointerUp={() => commit(colorString)}
					aria-label="Opacity"
					style={{
						backgroundImage: `linear-gradient(90deg, rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, 0), rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, 1)), ${checkerboardBackground}`,
						backgroundSize: '100% 100%, 12px 12px',
						backgroundPosition: '0 0, 0 0, 6px 6px, 6px -6px, -6px 0',
						backgroundColor: 'rgba(255,255,255,0.06)',
					}}
				/>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '66px 1fr 74px', gap: spacing.xs }}>
				<select
					value="hex"
					disabled
					aria-label="Color format"
					className="gal-select-field"
					style={{
						height: '32px',
						borderRadius: '8px',
						backgroundColor: 'rgba(255,255,255,0.06)',
						borderColor: 'rgba(255,255,255,0.08)',
						fontSize: typography.fontSize.sm,
						paddingLeft: '8px',
					}}
				>
					<option value="hex">Hex</option>
				</select>
				<input
					type="text"
					value={hex.slice(1).toUpperCase()}
					onChange={(event) => {
						const normalized = normalizeHex(`#${event.target.value}`);
						const parsed = parseColor(normalized);
						const next = rgbaToHsva({ ...parsed, a: hsva.a });
						setHsva(next);
						onChange(toColorString(hsvaToRgba(next)));
					}}
					onBlur={() => commit(colorString)}
					style={inputStyle}
					aria-label="Hex color"
				/>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: spacing.xs }}>
					<input
						type="number"
						min={0}
						max={100}
						step={1}
						value={Math.round(hsva.a * 100)}
						onChange={(event) => {
							const a = clamp((Number.parseFloat(event.target.value) || 0) / 100, 0, 1);
							setHsva((prev) => {
								const next = { ...prev, a };
								onChange(toColorString(hsvaToRgba(next)));
								return next;
							});
						}}
						onBlur={() => commit(colorString)}
						style={inputStyle}
						aria-label="Opacity percent"
					/>
					<div
						style={{
							display: 'grid',
							placeItems: 'center',
							color: 'rgba(255,255,255,0.74)',
							fontSize: typography.fontSize.md,
						}}
					>
						%
					</div>
				</div>
			</div>
		</div>
	);
};

const inputStyle: React.CSSProperties = {
	height: '32px',
	width: '100%',
	padding: '0 8px',
	borderRadius: '8px',
	border: '1px solid rgba(255,255,255,0.08)',
	backgroundColor: 'rgba(255,255,255,0.06)',
	color: '#f4f4f5',
	fontSize: typography.fontSize.sm,
};
