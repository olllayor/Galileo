import React from 'react';
import {
	buildLegacyFillFromPaintLayers,
	buildLegacyStrokeFromStrokeLayers,
	buildPaintLayerFromLegacyFill,
	buildStrokeLayerFromLegacyStroke,
} from '../../core/doc/appearance';
import type { Document, DocumentAppearance, Node, PaintLayer, StrokeLayer } from '../../core/doc/types';
import { colors, radii, spacing, typography } from '../design-system';
import { BlendModePicker } from './BlendModePicker';
import { MaskSection } from './MaskSection';
import { PaintLayerRow } from './PaintLayerRow';
import { StrokeLayerRow } from './StrokeLayerRow';

interface AppearanceSectionProps {
	node: Node;
	document: Document;
	onUpdateNode: (id: string, updates: Partial<Node>) => void;
	defaultFill: string;
	onUpdateDocumentAppearance?: (appearance: DocumentAppearance) => void;
	onPickImageAsset?: () => Promise<string | null>;
}

const createLayerId = (prefix: 'fill' | 'stroke') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createDefaultFillLayer = (defaultFill: string): PaintLayer => ({
	id: createLayerId('fill'),
	visible: true,
	opacity: 1,
	blendMode: 'normal',
	paint: { type: 'solid', value: defaultFill },
});

const createDefaultStrokeLayer = (): StrokeLayer => ({
	id: createLayerId('stroke'),
	visible: true,
	opacity: 1,
	blendMode: 'normal',
	paint: { type: 'solid', value: '#111111' },
	width: 1,
	align: 'center',
	cap: 'butt',
	join: 'miter',
	miterLimit: 10,
});

const sectionTitleStyle: React.CSSProperties = {
	margin: 0,
	fontSize: typography.fontSize.sm,
	color: colors.text.secondary,
	fontWeight: typography.fontWeight.medium,
};

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
	node,
	document,
	onUpdateNode,
	defaultFill,
	onUpdateDocumentAppearance,
	onPickImageAsset,
}) => {
	const fills = React.useMemo(() => {
		if (node.fills && node.fills.length > 0) return node.fills;
		if (node.fill) return [buildPaintLayerFromLegacyFill(node.fill, 'fill_legacy_1')];
		return [];
	}, [node.fills, node.fill]);

	const strokes = React.useMemo(() => {
		if (node.strokes && node.strokes.length > 0) return node.strokes;
		if (node.stroke) return [buildStrokeLayerFromLegacyStroke(node.stroke, 'stroke_legacy_1')];
		return [];
	}, [node.strokes, node.stroke]);

	const setFills = (next: PaintLayer[]) => {
		onUpdateNode(node.id, {
			fills: next.length > 0 ? next : undefined,
			fill: buildLegacyFillFromPaintLayers(next),
		});
	};

	const setStrokes = (next: StrokeLayer[]) => {
		onUpdateNode(node.id, {
			strokes: next.length > 0 ? next : undefined,
			stroke: buildLegacyStrokeFromStrokeLayers(next),
		});
	};

	const reorder = <T,>(source: T[], from: number, delta: -1 | 1): T[] => {
		const to = from + delta;
		if (to < 0 || to >= source.length) return source;
		const next = source.slice();
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		return next;
	};

	const totalLayerCount = fills.length + strokes.length;
	const recentSwatches = document.appearance?.recentSwatches ?? [];
	const sampleSwatches = document.appearance?.sampleSwatches ?? ['#ffffff', '#d9d9d9', '#000000', '#ff5e5b', '#00a884', '#3a7bff'];

	const pushRecentSwatch = (swatch: string) => {
		if (!onUpdateDocumentAppearance) return;
		const normalized = swatch.trim();
		if (normalized.length === 0) return;
		const nextRecent = [normalized, ...recentSwatches.filter((entry) => entry !== normalized)].slice(0, 24);
		onUpdateDocumentAppearance({
			recentSwatches: nextRecent,
			sampleSwatches,
		});
	};

	return (
		<div style={{ display: 'grid', gap: spacing.lg }}>
			<div style={{ display: 'grid', gap: spacing.sm }}>
				<h4 style={sectionTitleStyle}>Appearance</h4>
				<label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.fontSize.md, color: colors.text.secondary }}>
					<input
						type="checkbox"
						checked={node.visible !== false}
						onChange={(event) => onUpdateNode(node.id, { visible: event.target.checked })}
						style={{ accentColor: colors.accent.primary }}
					/>
					Visible
				</label>
				<BlendModePicker
					label="Node blend mode"
					value={node.blendMode}
					onChange={(blendMode) => onUpdateNode(node.id, { blendMode })}
				/>
				{totalLayerCount > 8 ? (
					<div
						style={{
							padding: spacing.sm,
							borderRadius: radii.sm,
							border: `1px solid ${colors.semantic.warning}`,
							backgroundColor: 'rgba(255, 159, 10, 0.08)',
							fontSize: typography.fontSize.xs,
							color: colors.text.secondary,
						}}
					>
						This node has {totalLayerCount} appearance layers. Consider reducing layers to keep canvas performance predictable.
					</div>
				) : null}
			</div>

			<div style={{ display: 'grid', gap: spacing.sm }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
					<h4 style={sectionTitleStyle}>Fills</h4>
					<button
						type="button"
						onClick={() => setFills([...fills, createDefaultFillLayer(defaultFill)])}
						style={actionButtonStyle}
					>
						Add fill
					</button>
				</div>
				{fills.length === 0 ? (
					<div style={emptyStateStyle}>No fill layers.</div>
				) : (
					fills.map((layer, index) => (
						<PaintLayerRow
							key={layer.id || `fill-${index}`}
							layer={layer}
							index={index}
							total={fills.length}
							onChange={(nextLayer) => {
								const next = fills.map((current, currentIndex) => (currentIndex === index ? nextLayer : current));
								setFills(next);
							}}
							onRemove={() => setFills(fills.filter((_, currentIndex) => currentIndex !== index))}
							onMove={(direction) => setFills(reorder(fills, index, direction))}
							recentSwatches={recentSwatches}
							sampleSwatches={sampleSwatches}
							onPushRecentSwatch={pushRecentSwatch}
							onPickImageAsset={onPickImageAsset}
						/>
					))
				)}
			</div>

			<div style={{ display: 'grid', gap: spacing.sm }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
					<h4 style={sectionTitleStyle}>Strokes</h4>
					<button type="button" onClick={() => setStrokes([...strokes, createDefaultStrokeLayer()])} style={actionButtonStyle}>
						Add stroke
					</button>
				</div>
				{strokes.length === 0 ? (
					<div style={emptyStateStyle}>No stroke layers.</div>
				) : (
					strokes.map((layer, index) => (
						<StrokeLayerRow
							key={layer.id || `stroke-${index}`}
							layer={layer}
							index={index}
							total={strokes.length}
							onChange={(nextLayer) => {
								const next = strokes.map((current, currentIndex) => (currentIndex === index ? nextLayer : current));
								setStrokes(next);
							}}
							onRemove={() => setStrokes(strokes.filter((_, currentIndex) => currentIndex !== index))}
							onMove={(direction) => setStrokes(reorder(strokes, index, direction))}
							recentSwatches={recentSwatches}
							sampleSwatches={sampleSwatches}
							onPushRecentSwatch={pushRecentSwatch}
							onPickImageAsset={onPickImageAsset}
						/>
					))
				)}
			</div>

			<div style={{ display: 'grid', gap: spacing.sm }}>
				<h4 style={sectionTitleStyle}>Mask</h4>
				<MaskSection node={node} document={document} onChange={(nextMask) => onUpdateNode(node.id, { mask: nextMask })} />
			</div>
		</div>
	);
};

const actionButtonStyle: React.CSSProperties = {
	height: '26px',
	padding: `0 ${spacing.sm}`,
	borderRadius: radii.sm,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: colors.bg.tertiary,
	color: colors.text.secondary,
	fontSize: typography.fontSize.md,
	cursor: 'pointer',
};

const emptyStateStyle: React.CSSProperties = {
	padding: spacing.sm,
	borderRadius: radii.sm,
	border: `1px dashed ${colors.border.default}`,
	fontSize: typography.fontSize.xs,
	color: colors.text.tertiary,
};
