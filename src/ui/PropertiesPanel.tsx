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
					width: '48px',
					borderLeft: '1px solid #ddd',
					backgroundColor: '#f5f5f5',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: '8px',
					transition: 'width 0.2s ease',
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Properties"
					style={{
						width: '32px',
						height: '32px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: '6px',
						cursor: 'pointer',
						color: '#666',
						fontSize: '14px',
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4" />
					</svg>
				</button>
				<div
					style={{
						marginTop: '8px',
						width: '32px',
						height: '32px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: '#e0e0e0',
						borderRadius: '6px',
						fontSize: '11px',
						fontWeight: 600,
						color: '#666',
					}}
					title="Properties"
				>
					P
				</div>
				{selectedNode && (
					<div
						style={{
							marginTop: '8px',
							width: '24px',
							height: '24px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: '#4a9eff',
							borderRadius: '4px',
							fontSize: '9px',
							fontWeight: 600,
							color: 'white',
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
					width: '280px',
					padding: '16px',
					backgroundColor: '#f5f5f5',
					borderLeft: '1px solid #ddd',
					overflowY: 'auto',
					transition: 'width 0.2s ease',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: '16px',
					}}
				>
					<span style={{ fontSize: '12px', fontWeight: 600, color: '#444' }}>Properties</span>
					<button
						type="button"
						onClick={onToggleCollapsed}
						title="Minimize Properties"
						style={{
							width: '20px',
							height: '20px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: 'transparent',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer',
							color: '#888',
							fontSize: '12px',
						}}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M9 18l6-6-6-6" />
						</svg>
					</button>
				</div>
				<p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '80px' }}>
					Select an element to view its properties
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
				width: '280px',
				padding: '16px',
				backgroundColor: '#f5f5f5',
				borderLeft: '1px solid #ddd',
				overflowY: 'auto',
				transition: 'width 0.2s ease',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '16px',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
					<span style={{ fontSize: '12px', fontWeight: 600, color: '#444' }}>Properties</span>
					<span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>{Math.round(zoom * 100)}%</span>
				</div>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Minimize Properties"
					style={{
						width: '20px',
						height: '20px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: '4px',
						cursor: 'pointer',
						color: '#888',
						fontSize: '12px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
			</div>

			<div style={{ marginBottom: '16px' }}>
				<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Alignment</h4>
				<div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: '#ddd',
							padding: '1px',
							borderRadius: '4px',
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
									padding: '6px',
									backgroundColor: '#ffffff',
									border: 'none',
									borderRadius: '3px',
									fontSize: '11px',
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.6,
									height: '28px',
								}}
							>
								{alignment === 'start' && <AlignLeft size={16} />}
								{alignment === 'center' && <AlignHorizontalCenter size={16} />}
								{alignment === 'end' && <AlignRight size={16} />}
							</button>
						))}
					</div>

					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: '#ddd',
							padding: '1px',
							borderRadius: '4px',
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
									padding: '6px',
									backgroundColor: '#ffffff',
									border: 'none',
									borderRadius: '3px',
									fontSize: '11px',
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.6,
									height: '28px',
								}}
							>
								{alignment === 'start' && <AlignTop size={16} />}
								{alignment === 'center' && <AlignVerticalCenter size={16} />}
								{alignment === 'end' && <AlignBottom size={16} />}
							</button>
						))}
					</div>
				</div>

				<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Transform</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
					<div>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>X</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.x)}
							onChange={(e) => handleNestedInputChange('position', 'x', Number(e.target.value))}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
							}}
						/>
					</div>
					<div>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Y</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.y)}
							onChange={(e) => handleNestedInputChange('position', 'y', Number(e.target.value))}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
							}}
						/>
					</div>
				</div>
				<div style={{ marginBottom: '8px' }}>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
							fontSize: '11px',
							color: '#666',
							marginBottom: '4px',
						}}
					>
						<ArrowClockwise size={12} /> Rotation (deg)
					</label>
					<input
						type="number"
						value={rotationValue}
						onChange={(e) => handleInputChange('rotation', Number(e.target.value))}
						style={{
							width: '100%',
							padding: '6px',
							border: '1px solid #ddd',
							borderRadius: '4px',
							fontSize: '12px',
						}}
					/>
				</div>
			</div>

			<div style={{ marginBottom: '16px' }}>
				<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Layout</h4>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '1fr auto 1fr',
						gap: '8px',
						marginBottom: '8px',
						alignItems: 'end',
					}}
				>
					<div>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>W</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.width, 100)}
							onChange={(e) => handleNestedInputChange('size', 'width', Number(e.target.value))}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
							}}
						/>
					</div>
					{selectedNode.type === 'image' && (
						<button
							type="button"
							onClick={() => handleInputChange('aspectRatioLocked', !selectedNode.aspectRatioLocked)}
							title={selectedNode.aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
							style={{
								padding: '6px 8px',
								backgroundColor: selectedNode.aspectRatioLocked ? '#007bff' : 'transparent',
								color: selectedNode.aspectRatioLocked ? '#fff' : '#666',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '14px',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '32px',
								height: '32px',
								marginBottom: '1px',
								transition: 'all 0.2s ease',
							}}
						>
							{selectedNode.aspectRatioLocked ? (
								<LockOn size={16} strokeWidth={2} />
							) : (
								<LockOff size={16} strokeWidth={2} />
							)}
						</button>
					)}
					<div>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>H</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.height, 100)}
							onChange={(e) => handleNestedInputChange('size', 'height', Number(e.target.value))}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
							}}
						/>
					</div>
				</div>

				<label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666' }}>
					<input type="checkbox" checked={Boolean(layout)} onChange={(e) => handleLayoutToggle(e.target.checked)} />
					Auto layout flow
				</label>

				{layout && (
					<div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
							<div>
								<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
									Direction
								</label>
								<select
									value={layout.direction}
									onChange={(e) => handleLayoutChange({ direction: e.target.value as Layout['direction'] })}
									style={{
										width: '100%',
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								>
									<option value="row">Row</option>
									<option value="column">Column</option>
								</select>
							</div>
							<div>
								<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Gap</label>
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
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								/>
							</div>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
								Alignment
							</label>
							<select
								value={layout.alignment}
								onChange={(e) => handleLayoutChange({ alignment: e.target.value as Layout['alignment'] })}
								style={{
									width: '100%',
									padding: '6px',
									border: '1px solid #ddd',
									borderRadius: '4px',
									fontSize: '12px',
								}}
							>
								<option value="start">Start</option>
								<option value="center">Center</option>
								<option value="end">End</option>
							</select>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Padding</label>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
								<input
									type="number"
									value={safeNumber(layout.padding.top)}
									onChange={(e) => handlePaddingChange('top', Number(e.target.value))}
									placeholder="T"
									style={{
										width: '100%',
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.right)}
									onChange={(e) => handlePaddingChange('right', Number(e.target.value))}
									placeholder="R"
									style={{
										width: '100%',
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.bottom)}
									onChange={(e) => handlePaddingChange('bottom', Number(e.target.value))}
									placeholder="B"
									style={{
										width: '100%',
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								/>
								<input
									type="number"
									value={safeNumber(layout.padding.left)}
									onChange={(e) => handlePaddingChange('left', Number(e.target.value))}
									placeholder="L"
									style={{
										width: '100%',
										padding: '6px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										fontSize: '12px',
									}}
								/>
							</div>
						</div>
					</div>
				)}
			</div>

			<div style={{ marginBottom: '16px' }}>
				<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Appearance</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
					<div>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Opacity</label>
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
									padding: '6px',
									paddingRight: '20px',
									border: '1px solid #ddd',
									borderRadius: '4px',
									fontSize: '12px',
								}}
							/>
							<span
								style={{
									position: 'absolute',
									right: '6px',
									top: '50%',
									transform: 'translateY(-50%)',
									fontSize: '11px',
									color: '#888',
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
							<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
								Corner Radius
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
									padding: '6px',
									border: '1px solid #ddd',
									borderRadius: '4px',
									fontSize: '12px',
								}}
							/>
						</div>
					)}
				</div>
			</div>

			<div style={{ marginBottom: '16px' }}>
				<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Fill</h4>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '8px',
						fontSize: '12px',
						color: '#666',
						marginBottom: '8px',
					}}
				>
					<input
						type="checkbox"
						checked={selectedNode.visible !== false}
						onChange={(e) => handleInputChange('visible', e.target.checked)}
					/>
					Visible
				</label>

				{selectedNode.fill ? (
					<div style={{ display: 'grid', gap: '8px' }}>
						<input
							type="color"
							value={selectedNode.fill.type === 'solid' ? selectedNode.fill.value : defaultFill}
							onChange={(e) => handleInputChange('fill', { type: 'solid', value: e.target.value })}
							style={{
								width: '100%',
								height: '32px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								cursor: 'pointer',
							}}
						/>
						<button
							type="button"
							onClick={() => handleInputChange('fill', undefined)}
							style={{
								padding: '6px',
								borderRadius: '4px',
								border: '1px solid #ccc',
								backgroundColor: '#ffffff',
								fontSize: '12px',
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
							padding: '6px',
							borderRadius: '4px',
							border: '1px solid #ccc',
							backgroundColor: '#ffffff',
							fontSize: '12px',
							cursor: 'pointer',
							width: '100%',
						}}
					>
						Add Fill
					</button>
				)}
			</div>

			{selectedNode.type === 'text' && (
				<div style={{ marginBottom: '16px' }}>
					<h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#444' }}>Text</h4>
					<div style={{ marginBottom: '8px' }}>
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Content</label>
						<textarea
							value={selectedNode.text || ''}
							onChange={(e) => handleInputChange('text', e.target.value)}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
								minHeight: '60px',
								resize: 'vertical',
							}}
						/>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
						<div>
							<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
								Font Size
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
									padding: '6px',
									border: '1px solid #ddd',
									borderRadius: '4px',
									fontSize: '12px',
								}}
							/>
						</div>
						<div>
							<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Weight</label>
							<select
								value={selectedNode.fontWeight ?? 'normal'}
								onChange={(e) => handleInputChange('fontWeight', e.target.value)}
								style={{
									width: '100%',
									padding: '6px',
									border: '1px solid #ddd',
									borderRadius: '4px',
									fontSize: '12px',
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
						<label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
							Font Family
						</label>
						<input
							type="text"
							value={selectedNode.fontFamily ?? 'Inter, sans-serif'}
							onChange={(e) => handleInputChange('fontFamily', e.target.value)}
							style={{
								width: '100%',
								padding: '6px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '12px',
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
};
