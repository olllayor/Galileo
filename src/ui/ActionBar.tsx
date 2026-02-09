import React, { useState, useRef, useEffect } from 'react';
import { Cursor, Square, TextAlignLeft, Hand, Save, Folder, Image } from 'akar-icons';
import { devicePresetGroups, type DevicePreset } from '../core/framePresets';
import { ENABLE_VECTOR_EDIT_V1 } from '../core/feature-flags';

export type Tool = 'select' | 'hand' | 'frame' | 'rectangle' | 'text' | 'pen';

interface ActionBarProps {
	activeTool: Tool;
	onToolChange: (tool: Tool) => void;
	onSave?: () => void;
	onLoad?: () => void;
	onImport?: () => void;
	onCreateDeviceFrame?: (preset: DevicePreset) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
	activeTool,
	onToolChange,
	onSave,
	onLoad,
	onImport,
	onCreateDeviceFrame,
}) => {
	const [devicePickerOpen, setDevicePickerOpen] = useState(false);
	const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
	const devicePickerRef = useRef<HTMLDivElement>(null);
	const deviceInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (devicePickerRef.current && !devicePickerRef.current.contains(e.target as Node)) {
				setDevicePickerOpen(false);
			}
		};
		if (devicePickerOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			setTimeout(() => deviceInputRef.current?.focus(), 50);
		}
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [devicePickerOpen]);

	const filteredDeviceGroups = devicePresetGroups
		.map((group) => ({
			...group,
			presets: group.presets.filter((preset) => preset.name.toLowerCase().includes(deviceSearchQuery.toLowerCase())),
		}))
		.filter((group) => group.presets.length > 0);

	const handleDeviceSelect = (preset: DevicePreset) => {
		onCreateDeviceFrame?.(preset);
		setDevicePickerOpen(false);
		setDeviceSearchQuery('');
	};
	const actionButtonSize = 38;
	const actionIconSize = 18;
	const actionButtonBaseStyle: React.CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: `${actionButtonSize}px`,
		height: `${actionButtonSize}px`,
		padding: 0,
		border: 'none',
		borderRadius: '9px',
		cursor: 'pointer',
		transition: 'all 0.15s ease',
	};

	const tools = [
		{ id: 'select' as const, label: 'Select', shortcut: 'V', icon: <Cursor strokeWidth={2} size={actionIconSize} /> },
		{ id: 'hand' as const, label: 'Hand', shortcut: 'H', icon: <Hand strokeWidth={2} size={actionIconSize} /> },
		{
			id: 'frame' as const,
			label: 'Frame',
			shortcut: 'F',
			icon: (
				<svg width={actionIconSize} height={actionIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="4" y="5" width="16" height="14" rx="2" />
					<line x1="4" y1="9" x2="20" y2="9" />
				</svg>
			),
		},
		{ id: 'rectangle' as const, label: 'Rectangle', shortcut: 'R', icon: <Square strokeWidth={2} size={actionIconSize} /> },
		{ id: 'text' as const, label: 'Text', shortcut: 'T', icon: <TextAlignLeft strokeWidth={2} size={actionIconSize} /> },
		...(ENABLE_VECTOR_EDIT_V1
			? [
					{
						id: 'pen' as const,
						label: 'Pen',
						shortcut: 'P',
						icon: (
							<svg
								width={actionIconSize}
								height={actionIconSize}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M7 16l10-10 3 3-10 10H7v-3z" />
								<path d="M16 7l3 3" />
							</svg>
						),
					},
				]
			: []),
	];

	return (
		<div
			style={{
				position: 'fixed',
				bottom: '18px',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: '2px',
				padding: '6px',
				background: 'linear-gradient(180deg, rgba(39, 40, 44, 0.95) 0%, rgba(24, 25, 27, 0.93) 100%)',
				backdropFilter: 'blur(26px)',
				WebkitBackdropFilter: 'blur(26px)',
				borderRadius: '14px',
				boxShadow:
					'0 16px 40px rgba(0, 0, 0, 0.48), 0 2px 0 rgba(255, 255, 255, 0.08) inset, 0 -1px 0 rgba(0, 0, 0, 0.35) inset',
				border: '1px solid rgba(255, 255, 255, 0.12)',
				zIndex: 1300,
			}}
		>
			{tools.map((tool, index) => (
				<React.Fragment key={tool.id}>
					{index === 2 && (
							<div
								style={{
									width: '1px',
									height: '26px',
									backgroundColor: 'rgba(255, 255, 255, 0.15)',
									margin: '0 5px',
								}}
							/>
						)}
					<button
						type="button"
						onClick={() => onToolChange(tool.id)}
							title={`${tool.label} (${tool.shortcut})`}
							style={{
								...actionButtonBaseStyle,
								backgroundColor:
									activeTool === tool.id
										? tool.id === 'text'
										? 'rgba(255, 110, 199, 0.22)'
										: tool.id === 'pen'
											? 'rgba(110, 231, 255, 0.24)'
											: 'rgba(255, 255, 255, 0.15)'
									: 'transparent',
								color:
									activeTool === tool.id
										? tool.id === 'text'
										? '#ff6ec7'
										: tool.id === 'pen'
											? '#6ee7ff'
											: '#fff'
									: 'rgba(255, 255, 255, 0.6)',
								boxShadow:
									activeTool === tool.id
										? '0 0 0 1px rgba(255, 255, 255, 0.12) inset'
										: 'none',
							}}
						>
							{tool.icon}
						</button>
				</React.Fragment>
			))}

			{/* Device Frame Picker */}
			{onCreateDeviceFrame && (
				<div ref={devicePickerRef} style={{ position: 'relative' }}>
					<button
						type="button"
						onClick={() => setDevicePickerOpen(!devicePickerOpen)}
							title="Device Frame"
							style={{
								...actionButtonBaseStyle,
								backgroundColor: devicePickerOpen ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
								color: devicePickerOpen ? '#fff' : 'rgba(255, 255, 255, 0.6)',
							}}
						>
							<svg width={actionIconSize} height={actionIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="6" y="2" width="12" height="20" rx="3" />
								<line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
							</svg>
						</button>

					{devicePickerOpen && (
						<div
								style={{
									position: 'absolute',
									bottom: '100%',
									left: '50%',
									transform: 'translateX(-50%)',
									width: '300px',
									marginBottom: '10px',
									backgroundColor: 'rgba(30, 30, 30, 0.95)',
									backdropFilter: 'blur(20px)',
								WebkitBackdropFilter: 'blur(20px)',
								borderRadius: '10px',
								boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
								border: '0.5px solid rgba(255, 255, 255, 0.1)',
								overflow: 'hidden',
							}}
						>
							{/* Search input */}
							<div style={{ padding: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
								<input
									ref={deviceInputRef}
									type="text"
									placeholder="Search devices..."
									value={deviceSearchQuery}
									onChange={(e) => setDeviceSearchQuery(e.target.value)}
									style={{
										width: '100%',
										padding: '8px 12px',
										backgroundColor: 'rgba(0, 0, 0, 0.3)',
										border: '1px solid rgba(255, 255, 255, 0.1)',
										borderRadius: '6px',
										color: '#fff',
										fontSize: '13px',
										outline: 'none',
									}}
								/>
							</div>

							{/* Device list */}
							<div style={{ maxHeight: '320px', overflowY: 'auto', padding: '4px' }}>
								{filteredDeviceGroups.length === 0 ? (
									<div
										style={{
											padding: '16px',
											textAlign: 'center',
											color: 'rgba(255, 255, 255, 0.5)',
											fontSize: '12px',
										}}
									>
										No devices found
									</div>
								) : (
									filteredDeviceGroups.map((group) => (
										<div key={group.label}>
											<div
												style={{
													padding: '8px 12px',
													fontSize: '10px',
													fontWeight: 600,
													color: 'rgba(255, 255, 255, 0.5)',
													textTransform: 'uppercase',
													letterSpacing: '0.05em',
												}}
											>
												{group.label}
											</div>
											{group.presets.map((preset) => (
												<button
													key={preset.id}
													type="button"
													onClick={() => handleDeviceSelect(preset)}
													style={{
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'space-between',
														width: '100%',
														padding: '8px 12px',
														backgroundColor: 'transparent',
														border: 'none',
														borderRadius: '6px',
														color: '#fff',
														fontSize: '13px',
														textAlign: 'left',
														cursor: 'pointer',
														transition: 'background-color 0.15s ease',
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.backgroundColor = 'transparent';
													}}
												>
													<span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
														{preset.tags.includes('phone') ? (
															<svg
																width="14"
																height="14"
																viewBox="0 0 24 24"
																fill="none"
																stroke="rgba(255, 255, 255, 0.5)"
																strokeWidth="2"
															>
																<rect x="6" y="2" width="12" height="20" rx="3" />
															</svg>
														) : (
															<svg
																width="14"
																height="14"
																viewBox="0 0 24 24"
																fill="none"
																stroke="rgba(255, 255, 255, 0.5)"
																strokeWidth="2"
															>
																<rect x="2" y="4" width="20" height="16" rx="3" />
															</svg>
														)}
														<span>{preset.name}</span>
														{preset.mockupPresetId && (
															<span
																style={{
																	padding: '1px 4px',
																	backgroundColor: '#4a9eff',
																	borderRadius: '3px',
																	fontSize: '10px',
																	color: '#fff',
																}}
															>
																3D
															</span>
														)}
													</span>
													<span
														style={{
															color: 'rgba(255, 255, 255, 0.5)',
															fontSize: '12px',
															fontFamily: 'SF Mono, Monaco, monospace',
														}}
													>
														{preset.frameWidth}×{preset.frameHeight}
													</span>
												</button>
											))}
										</div>
									))
								)}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Divider */}
			<div
				style={{
					width: '1px',
					height: '26px',
					backgroundColor: 'rgba(255, 255, 255, 0.15)',
					margin: '0 5px',
				}}
			/>

			{/* File actions */}
			<button
				type="button"
				onClick={onSave}
				title="Save (⌘S)"
				style={{
					...actionButtonBaseStyle,
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
				}}
			>
				<Save strokeWidth={2} size={actionIconSize} />
			</button>

			<button
				type="button"
				onClick={onLoad}
				title="Open (⌘O)"
				style={{
					...actionButtonBaseStyle,
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
				}}
			>
				<Folder strokeWidth={2} size={actionIconSize} />
			</button>

			<button
				type="button"
				onClick={onImport}
				title="Import Image (⌘I)"
				style={{
					...actionButtonBaseStyle,
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
				}}
			>
				<Image strokeWidth={2} size={actionIconSize} />
			</button>
		</div>
	);
};
