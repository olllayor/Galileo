import React, { useRef } from 'react';

type ScrubbableNumberInputProps = {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	scrubStep?: number;
	disabled?: boolean;
	inputStyle?: React.CSSProperties;
};

const clamp = (value: number, min?: number, max?: number): number => {
	let next = value;
	if (typeof min === 'number') {
		next = Math.max(min, next);
	}
	if (typeof max === 'number') {
		next = Math.min(max, next);
	}
	return next;
};

const roundToStep = (value: number, step: number): number => {
	if (!Number.isFinite(step) || step <= 0) return value;
	const places = Math.max(0, Math.ceil(-Math.log10(step)));
	return Number((Math.round(value / step) * step).toFixed(Math.min(6, places + 2)));
};

export const ScrubbableNumberInput: React.FC<ScrubbableNumberInputProps> = ({
	value,
	onChange,
	min,
	max,
	step = 1,
	scrubStep = step,
	disabled = false,
	inputStyle,
}) => {
	const dragRef = useRef<{ startX: number; startValue: number } | null>(null);
	const pointerIdRef = useRef<number | null>(null);
	const scrubberRef = useRef<HTMLButtonElement | null>(null);

	const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		if (Number.isNaN(parsed)) return;
		onChange(clamp(parsed, min, max));
	};

	const handlePointerMove = (event: PointerEvent) => {
		const drag = dragRef.current;
		if (!drag) return;
		const modifier = event.shiftKey ? 0.2 : event.altKey ? 0.1 : 1;
		const delta = (event.clientX - drag.startX) * scrubStep * modifier;
		const next = roundToStep(clamp(drag.startValue + delta, min, max), step);
		onChange(next);
	};

	const stopDragging = () => {
		if (pointerIdRef.current !== null && scrubberRef.current) {
			try {
				scrubberRef.current.releasePointerCapture(pointerIdRef.current);
			} catch {
				// Pointer capture can be released by browser before cleanup.
				void 0;
			}
		}
		pointerIdRef.current = null;
		dragRef.current = null;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', stopDragging);
		window.removeEventListener('pointercancel', stopDragging);
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (disabled) return;
		event.preventDefault();
		event.stopPropagation();
		dragRef.current = { startX: event.clientX, startValue: value };
		pointerIdRef.current = event.pointerId;
		scrubberRef.current = event.currentTarget;
		event.currentTarget.setPointerCapture(event.pointerId);
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', stopDragging);
		window.addEventListener('pointercancel', stopDragging);
	};

	return (
		<div style={{ position: 'relative' }}>
			<input
				type="number"
				value={value}
				onChange={handleInputChange}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				style={{
					width: '100%',
					paddingRight: '28px',
					...inputStyle,
				}}
			/>
			<button
				ref={scrubberRef}
				type="button"
				disabled={disabled}
				title="Drag to scrub value"
				onPointerDown={handlePointerDown}
				style={{
					position: 'absolute',
					top: '50%',
					right: '4px',
					transform: 'translateY(-50%)',
					width: '20px',
					height: '20px',
					border: 'none',
					background: 'transparent',
					cursor: disabled ? 'not-allowed' : 'ew-resize',
					fontSize: '11px',
					lineHeight: 1,
					opacity: disabled ? 0.4 : 0.7,
				}}
			>
				↔
			</button>
		</div>
	);
};
