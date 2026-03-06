import React from 'react';
import { colors, radii, shadows, spacing, transitions, typography } from './design-system';
import type { AvailableUpdate } from '../hooks/useDesktopUpdater';

type UpdateModalProps = {
	open: boolean;
	update: AvailableUpdate | null;
	isInstalling: boolean;
	onClose: () => void;
	onInstall: () => void;
};

const formatReleaseDate = (date: string | null) => {
	if (!date) return null;
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

export const UpdateModal: React.FC<UpdateModalProps> = ({ open, update, isInstalling, onClose, onInstall }) => {
	if (!open || !update) return null;

	const releaseDate = formatReleaseDate(update.date);

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0, 0, 0, 0.42)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1100,
				padding: spacing.xl,
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="update-modal-title"
				style={{
					width: 'min(560px, 100%)',
					maxHeight: 'min(640px, calc(100vh - 48px))',
					background: colors.bg.tertiary,
					border: `1px solid ${colors.border.default}`,
					borderRadius: radii.xl,
					boxShadow: shadows.xl,
					overflow: 'hidden',
				}}
			>
				<div
					style={{
						padding: spacing.xl,
						borderBottom: `1px solid ${colors.border.subtle}`,
						display: 'flex',
						alignItems: 'flex-start',
						justifyContent: 'space-between',
						gap: spacing.md,
					}}
				>
					<div>
						<div
							style={{
								fontSize: typography.fontSize.xs,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
								color: colors.text.tertiary,
								marginBottom: spacing.xs,
							}}
						>
							Update Available
						</div>
						<h2
							id="update-modal-title"
							style={{
								margin: 0,
								fontSize: typography.fontSize.xl,
								fontWeight: typography.fontWeight.semibold,
								color: colors.text.primary,
							}}
						>
							Galileo {update.version}
						</h2>
						<div
							style={{
								marginTop: spacing.sm,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
							}}
						>
							Current version {update.currentVersion}
							{releaseDate ? ` | Released ${releaseDate}` : ''}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isInstalling}
						aria-label="Close update prompt"
						style={{
							width: 28,
							height: 28,
							border: 'none',
							borderRadius: radii.md,
							background: 'transparent',
							color: isInstalling ? colors.text.disabled : colors.text.secondary,
							cursor: isInstalling ? 'default' : 'pointer',
							flexShrink: 0,
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div
					style={{
						padding: spacing.xl,
						display: 'grid',
						gap: spacing.lg,
					}}
				>
					<div
						style={{
							display: 'grid',
							gap: spacing.xs,
						}}
					>
						<div style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>Release notes</div>
						<div
							style={{
								maxHeight: 240,
								overflow: 'auto',
								borderRadius: radii.lg,
								border: `1px solid ${colors.border.subtle}`,
								background: colors.bg.secondary,
								padding: spacing.lg,
								whiteSpace: 'pre-wrap',
								lineHeight: 1.6,
								fontSize: typography.fontSize.sm,
								color: colors.text.primary,
							}}
						>
							{update.body || 'No release notes were provided for this update.'}
						</div>
					</div>

					<div
						style={{
							display: 'flex',
							justifyContent: 'flex-end',
							gap: spacing.sm,
						}}
					>
						<button
							type="button"
							onClick={onClose}
							disabled={isInstalling}
							style={{
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radii.md,
								border: `1px solid ${colors.border.default}`,
								background: colors.bg.secondary,
								color: isInstalling ? colors.text.disabled : colors.text.primary,
								cursor: isInstalling ? 'default' : 'pointer',
								transition: `background-color ${transitions.fast}, border-color ${transitions.fast}`,
							}}
						>
							Later
						</button>
						<button
							type="button"
							onClick={onInstall}
							disabled={isInstalling}
							style={{
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radii.md,
								border: 'none',
								background: isInstalling ? colors.bg.tertiary : colors.accent.primary,
								color: '#ffffff',
								cursor: isInstalling ? 'default' : 'pointer',
								fontWeight: typography.fontWeight.semibold,
								transition: `transform ${transitions.fast}, background-color ${transitions.fast}`,
							}}
						>
							{isInstalling ? 'Installing...' : 'Download and Install'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
