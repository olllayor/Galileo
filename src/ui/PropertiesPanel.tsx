import React from 'react';
import {
	LockOn,
	LockOff,
	AlignLeft,
	AlignHorizontalCenter,
	AlignRight,
	AlignTop,
	AlignVerticalCenter,
	AlignBottom,
	ArrowClockwise,
} from 'akar-icons';
import type { Document, Layout, Node } from '../core/doc/types';
import { findParentNode } from '../core/doc';
import { colors, spacing, typography, radii, transitions, panels } from './design-system';

interface PropertiesPanelProps {
	selectedNode: Node | null;
	document: Document;
	collapsed?: boolean;
	onToggleCollapsed?: () => void;
	onUpdateNode: (id: string, updates: Partial<Node>) => void;
	zoom?: number;
}

const defaultLayout: Layout = {
	type: 'auto',
	direction: 'row',
	gap: 8,
	padding: { top: 8, right: 8, bottom: 8, left: 8 },
	alignment: 'start',
};

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const safeNumber = (value: number | undefined, fallback = 0): number => {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const safeRound = (value: number | undefined, fallback = 0): number => {
	return Math.round(safeNumber(value, fallback));
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
	selectedNode,
	document,
	collapsed = false,
	onToggleCollapsed,
	onUpdateNode,
	zoom = 1,
}) => {
	// Collapsed rail mode
	if (collapsed) {
		return (
			<div
				style={{
					width: `${panels.right.collapsedWidth}px`,
					borderLeft: `1px solid ${colors.border.subtle}`,
					backgroundColor: colors.bg.secondary,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: spacing.sm,
					transition: `width ${transitions.normal}`,
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Properties"
					style={{
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.md,
						cursor: 'pointer',
						color: colors.text.secondary,
						fontSize: '14px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>
				<div
					style={{
						marginTop: spacing.sm,
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: colors.bg.active,
						borderRadius: radii.md,
						fontSize: typography.fontSize.xs,
						fontWeight: typography.fontWeight.semibold,
						color: colors.text.secondary,
					}}
					title="Properties"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M12 3v18M3 12h18M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
					</svg>
				</div>
				{selectedNode && (
					<div
						style={{
							marginTop: spacing.sm,
							width: '24px',
							height: '24px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: colors.accent.primary,
							borderRadius: radii.md,
							fontSize: typography.fontSize.xs,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text.primary,
						}}
						title={selectedNode.type}
					>
						{selectedNode.type.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
		);
	}

	if (!selectedNode) {
		return (
			<div
				style={{
					width: `${panels.right.width}px`,
					padding: spacing.md,
					backgroundColor: colors.bg.secondary,
					borderLeft: `1px solid ${colors.border.subtle}`,
					overflowY: 'auto',
					transition: `width ${transitions.normal}`,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: spacing.lg,
					}}
				>
					<span
						style={{
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							color: colors.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
						}}
					>
						Design
					</span>
					<button
						type="button"
						onClick={onToggleCollapsed}
						title="Collapse panel"
						style={{
							width: '20px',
							height: '20px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: 'transparent',
							border: 'none',
							borderRadius: radii.sm,
							cursor: 'pointer',
							color: colors.text.tertiary,
							fontSize: '12px',
						}}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M9 18l6-6-6-6" />
						</svg>
					</button>
				</div>
				<p
					style={{
						color: colors.text.tertiary,
						fontSize: typography.fontSize.md,
						textAlign: 'center',
						marginTop: '80px',
					}}
				>
					Select a layer to see its properties
				</p>
			</div>
		);
	}

	const parentNode = findParentNode(document, selectedNode.id);

	const handleInputChange = (field: keyof Node, value: unknown) => {
		onUpdateNode(selectedNode.id, { [field]: value });
	};

	const handleNestedInputChange = (parent: 'position' | 'size', field: string, value: number) => {
		const current = selectedNode[parent];
		if (!current || Number.isNaN(value)) return;

		// Handle aspect ratio lock for size changes
		if (parent === 'size' && selectedNode.aspectRatioLocked) {
			const currentSize = selectedNode.size;
			const aspectRatio = currentSize.width / currentSize.height;

			if (field === 'width') {
				const newHeight = value / aspectRatio;
				onUpdateNode(selectedNode.id, {
					size: { width: value, height: Math.max(1, Math.round(newHeight)) },
				});
				return;
			} else if (field === 'height') {
				const newWidth = value * aspectRatio;
				onUpdateNode(selectedNode.id, {
					size: { width: Math.max(1, Math.round(newWidth)), height: value },
				});
				return;
			}
		}

		onUpdateNode(selectedNode.id, {
			[parent]: { ...current, [field]: value },
		});
	};

	const handleLayoutToggle = (enabled: boolean) => {
		if (enabled) {
			const baseLayout = selectedNode.layout || defaultLayout;
			onUpdateNode(selectedNode.id, {
				layout: {
					...baseLayout,
					padding: { ...baseLayout.padding },
				},
			});
		} else {
			onUpdateNode(selectedNode.id, { layout: undefined });
		}
	};

	const handleLayoutChange = (updates: Partial<Layout>) => {
		const baseLayout = selectedNode.layout || defaultLayout;
		const nextLayout = {
			...baseLayout,
			...updates,
			padding: { ...baseLayout.padding },
		};
		onUpdateNode(selectedNode.id, { layout: nextLayout });
	};

	const handlePaddingChange = (field: keyof Layout['padding'], value: number) => {
		if (Number.isNaN(value)) return;
		const nextLayout = selectedNode.layout || defaultLayout;
		onUpdateNode(selectedNode.id, {
			layout: {
				...nextLayout,
				padding: {
					...nextLayout.padding,
					[field]: value,
				},
			},
		});
	};

	const handleAlign = (axis: 'horizontal' | 'vertical', alignment: 'start' | 'center' | 'end') => {
		if (!parentNode) return;
		const parentSize = parentNode.size;
		const size = selectedNode.size;
		const position = { ...selectedNode.position };

		if (axis === 'horizontal') {
			if (alignment === 'start') position.x = 0;
			if (alignment === 'center') position.x = (parentSize.width - size.width) / 2;
			if (alignment === 'end') position.x = parentSize.width - size.width;
		} else {
			if (alignment === 'start') position.y = 0;
			if (alignment === 'center') position.y = (parentSize.height - size.height) / 2;
			if (alignment === 'end') position.y = parentSize.height - size.height;
		}

		onUpdateNode(selectedNode.id, { position });
	};

	const defaultFill = selectedNode.type === 'text' ? '#000000' : '#888888';
	const effectiveOpacity = safeNumber(selectedNode.opacity, 1);
	const rotationValue = safeNumber(selectedNode.rotation, 0);
	const layout = selectedNode.layout;

	return (
		<div
			style={{
				width: `${panels.right.width}px`,
				padding: spacing.md,
				backgroundColor: colors.bg.secondary,
				borderLeft: `1px solid ${colors.border.subtle}`,
				overflowY: 'auto',
				transition: `width ${transitions.normal}`,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: spacing.lg,
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
					<span
						style={{
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							color: colors.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
						}}
					>
						Design
					</span>
					<span
						style={{
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							fontFamily: typography.fontFamily.mono,
						}}
					>
						{Math.round(zoom * 100)}%
					</span>
				</div>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Collapse panel"
					style={{
						width: '20px',
						height: '20px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.sm,
						cursor: 'pointer',
						color: colors.text.tertiary,
						fontSize: '12px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
			</div>

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Alignment
				</h4>
				<div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.lg }}>
					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: colors.border.subtle,
							padding: '1px',
							borderRadius: radii.md,
							flex: 1,
						}}
					>
						{(['start', 'center', 'end'] as const).map((alignment) => (
							<button
								key={`h-${alignment}`}
								type="button"
								onClick={() => handleAlign('horizontal', alignment)}
								disabled={!parentNode}
								title={`Align Horizontal ${alignment}`}
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: spacing.xs,
									backgroundColor: colors.bg.tertiary,
									border: 'none',
									borderRadius: radii.sm,
									fontSize: typography.fontSize.sm,
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.4,
									height: '26px',
									color: colors.text.secondary,
								}}
							>
								{alignment === 'start' && <AlignLeft size={14} />}
								{alignment === 'center' && <AlignHorizontalCenter size={14} />}
								{alignment === 'end' && <AlignRight size={14} />}
							</button>
						))}
					</div>

					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: colors.border.subtle,
							padding: '1px',
							borderRadius: radii.md,
							flex: 1,
						}}
					>
						{(['start', 'center', 'end'] as const).map((alignment) => (
							<button
								key={`v-${alignment}`}
								type="button"
								onClick={() => handleAlign('vertical', alignment)}
								disabled={!parentNode}
								title={`Align Vertical ${alignment}`}
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: spacing.xs,
									backgroundColor: colors.bg.tertiary,
									border: 'none',
									borderRadius: radii.sm,
									fontSize: typography.fontSize.sm,
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.4,
									height: '26px',
									color: colors.text.secondary,
								}}
							>
								{alignment === 'start' && <AlignTop size={14} />}
								{alignment === 'center' && <AlignVerticalCenter size={14} />}
								{alignment === 'end' && <AlignBottom size={14} />}
							</button>
						))}
					</div>
				</div>

				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Transform
				</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							X
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.x)}
							onChange={(e) => handleNestedInputChange('position', 'x', Number(e.target.value))}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Y
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.y)}
							onChange={(e) => handleNestedInputChange('position', 'y', Number(e.target.value))}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>
				</div>
				<div style={{ marginBottom: spacing.sm }}>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							marginBottom: '4px',
						}}
					>
						<ArrowClockwise size={12} /> Rotation
					</label>
					<input
						type="number"
						value={rotationValue}
						onChange={(e) => handleInputChange('rotation', Number(e.target.value))}
						style={{
							width: '100%',
							padding: spacing.xs,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.sm,
							fontSize: typography.fontSize.md,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
						}}
					/>
				</div>
			</div>

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Layout
				</h4>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '1fr auto 1fr',
						gap: spacing.sm,
						marginBottom: spacing.sm,
						alignItems: 'end',
					}}
				>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							W
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.width, 100)}
							onChange={(e) => handleNestedInputChange('size', 'width', Number(e.target.value))}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>
					{selectedNode.type === 'image' && (
						<button
							type="button"
							onClick={() => handleInputChange('aspectRatioLocked', !selectedNode.aspectRatioLocked)}
							title={selectedNode.aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
							style={{
								padding: `${spacing.xs} ${spacing.sm}`,
								backgroundColor: selectedNode.aspectRatioLocked ? colors.accent.primary : 'transparent',
								color: selectedNode.aspectRatioLocked ? colors.text.primary : colors.text.tertiary,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: '14px',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '28px',
								height: '28px',
								marginBottom: '1px',
								transition: `all ${transitions.fast}`,
							}}
						>
							{selectedNode.aspectRatioLocked ? (
								<LockOn size={14} strokeWidth={2} />
							) : (
								<LockOff size={14} strokeWidth={2} />
							)}
						</button>
					)}
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							H
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.height, 100)}
							onChange={(e) => handleNestedInputChange('size', 'height', Number(e.target.value))}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>
				</div>

				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.sm,
						fontSize: typography.fontSize.md,
						color: colors.text.secondary,
					}}
				>
					<input
						type="checkbox"
						checked={Boolean(layout)}
						onChange={(e) => handleLayoutToggle(e.target.checked)}
						style={{ accentColor: colors.accent.primary }}
					/>
					Auto layout
				</label>

				{selectedNode.type === 'frame' && (
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: spacing.sm,
							fontSize: typography.fontSize.md,
							color: colors.text.secondary,
							marginTop: spacing.sm,
						}}
					>
						<input
							type="checkbox"
							checked={Boolean(selectedNode.clipContent)}
							onChange={(e) => handleInputChange('clipContent', e.target.checked)}
							style={{ accentColor: colors.accent.primary }}
						/>
						Clip content
					</label>
				)}

				{layout && (
					<div style={{ marginTop: spacing.sm, display: 'grid', gap: spacing.sm }}>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Direction
								</label>
								<select
									value={layout.direction}
									onChange={(e) => handleLayoutChange({ direction: e.target.value as Layout['direction'] })}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="row">Row</option>
									<option value="column">Column</option>
								</select>
							</div>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Gap
								</label>
								<input
									type="number"
									value={safeNumber(layout.gap)}
									onChange={(e) => {
										const value = Number(e.target.value);
										if (Number.isNaN(value)) return;
										handleLayoutChange({ gap: value });
									}}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								/>
							</div>
						</div>

						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Alignment
							</label>
							<select
								value={layout.alignment}
								onChange={(e) => handleLayoutChange({ alignment: e.target.value as Layout['alignment'] })}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="start">Start</option>
								<option value="center">Center</option>
								<option value="end">End</option>
							</select>
						</div>

						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Padding
							</label>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
								<input
									type="number"
									value={safeNumber(layout.padding.top)}
									onChange={(e) => handlePaddingChange('top', Number(e.target.value))}
									placeholder="T"
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.right)}
									onChange={(e) => handlePaddingChange('right', Number(e.target.value))}
									placeholder="R"
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.bottom)}
									onChange={(e) => handlePaddingChange('bottom', Number(e.target.value))}
									placeholder="B"
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.left)}
									onChange={(e) => handlePaddingChange('left', Number(e.target.value))}
									placeholder="L"
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								/>
							</div>
						</div>
					</div>
				)}
			</div>

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Appearance
				</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Opacity
						</label>
						<div style={{ position: 'relative' }}>
							<input
								type="number"
								min={0}
								max={100}
								value={safeRound(effectiveOpacity * 100)}
								onChange={(e) => {
									const val = Number(e.target.value);
									if (!Number.isNaN(val)) {
										handleInputChange('opacity', clamp(val / 100, 0, 1));
									}
								}}
								style={{
									width: '100%',
									padding: spacing.xs,
									paddingRight: '22px',
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							/>
							<span
								style={{
									position: 'absolute',
									right: '6px',
									top: '50%',
									transform: 'translateY(-50%)',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
								}}
							>
								%
							</span>
						</div>
					</div>

					{(selectedNode.type === 'rectangle' ||
						selectedNode.type === 'frame' ||
						selectedNode.type === 'image' ||
						selectedNode.type === 'componentInstance') && (
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Radius
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.cornerRadius, 0)}
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('cornerRadius', value);
								}}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							/>
						</div>
					)}
				</div>
			</div>

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Fill
				</h4>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.sm,
						fontSize: typography.fontSize.md,
						color: colors.text.secondary,
						marginBottom: spacing.sm,
					}}
				>
					<input
						type="checkbox"
						checked={selectedNode.visible !== false}
						onChange={(e) => handleInputChange('visible', e.target.checked)}
						style={{ accentColor: colors.accent.primary }}
					/>
					Visible
				</label>

				{selectedNode.fill ? (
					<div style={{ display: 'grid', gap: spacing.sm }}>
						<input
							type="color"
							value={selectedNode.fill.type === 'solid' ? selectedNode.fill.value : defaultFill}
							onChange={(e) => handleInputChange('fill', { type: 'solid', value: e.target.value })}
							style={{
								width: '100%',
								height: '28px',
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								cursor: 'pointer',
								backgroundColor: colors.bg.tertiary,
							}}
						/>
						<button
							type="button"
							onClick={() => handleInputChange('fill', undefined)}
							style={{
								padding: spacing.xs,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
							}}
						>
							Remove Fill
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => handleInputChange('fill', { type: 'solid', value: defaultFill })}
						style={{
							padding: spacing.xs,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
							width: '100%',
						}}
					>
						Add Fill
					</button>
				)}
			</div>

			{selectedNode.type === 'text' && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Text
					</h4>
					<div style={{ marginBottom: spacing.sm }}>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Content
						</label>
						<textarea
							value={selectedNode.text || ''}
							onChange={(e) => handleInputChange('text', e.target.value)}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								minHeight: '60px',
								resize: 'vertical',
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Size
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.fontSize, 16)}
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('fontSize', value);
								}}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							/>
						</div>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Weight
							</label>
							<select
								value={selectedNode.fontWeight ?? 'normal'}
								onChange={(e) => handleInputChange('fontWeight', e.target.value)}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="normal">Normal</option>
								<option value="500">Medium</option>
								<option value="600">Semibold</option>
								<option value="bold">Bold</option>
							</select>
						</div>
					</div>

					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Font Family
						</label>
						<input
							type="text"
							value={selectedNode.fontFamily ?? 'Inter, sans-serif'}
							onChange={(e) => handleInputChange('fontFamily', e.target.value)}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
};
