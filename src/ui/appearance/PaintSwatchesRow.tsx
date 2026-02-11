import React from 'react';
import { spacing, typography } from '../design-system';

interface PaintSwatchesRowProps {
	title: string;
	recentSwatches: string[];
	sampleSwatches: string[];
	onPick: (color: string) => void;
}

const checkerboardBackground =
	'linear-gradient(45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.14) 75%)';

export const PaintSwatchesRow: React.FC<PaintSwatchesRowProps> = ({ title, recentSwatches, sampleSwatches, onPick }) => {
	const swatches = [...recentSwatches, ...sampleSwatches]
		.filter((value, index, list) => list.indexOf(value) === index)
		.slice(0, 8);

	return (
		<div style={{ display: 'grid', gap: spacing.sm }}>
			<button
				type="button"
				style={{
					height: '30px',
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '0 8px',
					borderRadius: '8px',
					border: '1px solid rgba(255,255,255,0.11)',
					background: 'rgba(255,255,255,0.02)',
					color: 'rgba(255,255,255,0.9)',
					fontSize: typography.fontSize.sm,
					cursor: 'default',
				}}
			>
				<span>{title}</span>
				<svg width="12" height="8" viewBox="0 0 12 8" aria-hidden>
					<path d="M1 1.5l5 5 5-5" fill="none" stroke="rgba(255,255,255,0.66)" strokeWidth="1.4" strokeLinecap="round" />
				</svg>
			</button>
			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', paddingLeft: '1px' }}>
				{swatches.map((swatch) => (
					<button
						key={swatch}
						type="button"
						onClick={() => onPick(swatch)}
						title={swatch}
						style={{
							width: '22px',
							height: '22px',
							borderRadius: '5px',
							border: '1px solid rgba(255,255,255,0.14)',
							background: swatch,
							cursor: 'pointer',
						}}
					/>
				))}
				<button
					type="button"
					title="Transparent"
					onClick={() => onPick('rgba(0,0,0,0)')}
					style={{
						width: '22px',
						height: '22px',
						borderRadius: '5px',
						border: '1px solid rgba(255,255,255,0.14)',
						backgroundImage: checkerboardBackground,
						backgroundSize: '12px 12px',
						backgroundPosition: '0 0, 0 0, 6px 6px, 6px -6px, -6px 0',
						backgroundColor: 'rgba(255,255,255,0.02)',
						cursor: 'pointer',
					}}
				/>
			</div>
		</div>
	);
};
