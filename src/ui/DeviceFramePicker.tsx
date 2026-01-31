import React, { useState, useRef, useEffect } from 'react';
import { colors, spacing, typography, radii, transitions } from './design-system';
import { devicePresetGroups, type DevicePreset } from '../core/framePresets';

interface DeviceFramePickerProps {
	onSelectDevice: (preset: DevicePreset) => void;
}

export const DeviceFramePicker: React.FC<DeviceFramePickerProps> = ({ onSelectDevice }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const menuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			// Focus search input when opened
			setTimeout(() => inputRef.current?.focus(), 50);
		}
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen]);

	const filteredGroups = devicePresetGroups
		.map((group) => ({
			...group,
			presets: group.presets.filter((preset) => preset.name.toLowerCase().includes(searchQuery.toLowerCase())),
		}))
		.filter((group) => group.presets.length > 0);

	const handleSelect = (preset: DevicePreset) => {
		onSelectDevice(preset);
		setIsOpen(false);
		setSearchQuery('');
	};

	return (
		<div ref={menuRef} style={{ position: 'relative' }}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				title="Device Frame (F)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: spacing.xs,
					width: '32px',
					height: '32px',
					padding: 0,
					backgroundColor: isOpen ? colors.accent.primary : 'transparent',
					color: isOpen ? colors.text.primary : colors.text.secondary,
					border: 'none',
					borderRadius: radii.md,
					cursor: 'pointer',
					transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
				}}
				onMouseEnter={(e) => {
					if (!isOpen) {
						e.currentTarget.style.backgroundColor = colors.bg.hover;
						e.currentTarget.style.color = colors.text.primary;
					}
				}}
				onMouseLeave={(e) => {
					if (!isOpen) {
						e.currentTarget.style.backgroundColor = 'transparent';
						e.currentTarget.style.color = colors.text.secondary;
					}
				}}
			>
				{/* Phone icon */}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="6" y="2" width="12" height="20" rx="3" />
					<line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
				</svg>
			</button>

			{isOpen && (
				<div
					style={{
						position: 'absolute',
						top: '100%',
						left: 0,
						width: '280px',
						marginTop: spacing.xs,
						backgroundColor: colors.bg.tertiary,
						border: `1px solid ${colors.border.default}`,
						borderRadius: radii.lg,
						boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
						zIndex: 1000,
						overflow: 'hidden',
					}}
				>
					{/* Search input */}
					<div style={{ padding: spacing.sm, borderBottom: `1px solid ${colors.border.subtle}` }}>
						<input
							ref={inputRef}
							type="text"
							placeholder="Search devices..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							style={{
								width: '100%',
								padding: `${spacing.sm} ${spacing.md}`,
								backgroundColor: colors.bg.primary,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.md,
								color: colors.text.primary,
								fontSize: typography.fontSize.md,
								outline: 'none',
							}}
						/>
					</div>

					{/* Device list */}
					<div style={{ maxHeight: '320px', overflowY: 'auto', padding: spacing.xs }}>
						{filteredGroups.length === 0 ? (
							<div
								style={{
									padding: spacing.md,
									textAlign: 'center',
									color: colors.text.tertiary,
									fontSize: typography.fontSize.sm,
								}}
							>
								No devices found
							</div>
						) : (
							filteredGroups.map((group) => (
								<div key={group.label}>
									<div
										style={{
											padding: `${spacing.sm} ${spacing.md}`,
											fontSize: typography.fontSize.xs,
											fontWeight: 600,
											color: colors.text.tertiary,
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
											onClick={() => handleSelect(preset)}
											style={{
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'space-between',
												width: '100%',
												padding: `${spacing.sm} ${spacing.md}`,
												backgroundColor: 'transparent',
												border: 'none',
												borderRadius: radii.md,
												color: colors.text.primary,
												fontSize: typography.fontSize.md,
												textAlign: 'left',
												cursor: 'pointer',
												transition: `background-color ${transitions.fast}`,
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.backgroundColor = colors.bg.hover;
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.backgroundColor = 'transparent';
											}}
										>
											<span style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
												{/* Device type icon */}
												{preset.tags.includes('phone') ? (
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke={colors.text.tertiary}
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
														stroke={colors.text.tertiary}
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
															backgroundColor: colors.accent.primary,
															borderRadius: radii.sm,
															fontSize: typography.fontSize.xs,
															color: '#fff',
														}}
													>
														3D
													</span>
												)}
											</span>
											<span
												style={{
													color: colors.text.tertiary,
													fontSize: typography.fontSize.sm,
													fontFamily: typography.fontFamily.mono,
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
	);
};
