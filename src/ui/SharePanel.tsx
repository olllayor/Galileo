import React from 'react';
import { colors, spacing, typography, radii } from './design-system';
import type { CollaboratorPresence, CollabStatus } from '../collab/types';

type SharePanelProps = {
	collabStatus: CollabStatus;
	collaborators: CollaboratorPresence[];
	currentActorId: string;
	roomName: string | null;
	onOpenShareModal: () => void;
	onOpenJoinModal: () => void;
};

const ShareIcon = ({ size = 14 }: { size?: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<circle cx="18" cy="5" r="3" />
		<circle cx="6" cy="12" r="3" />
		<circle cx="18" cy="19" r="3" />
		<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
		<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
	</svg>
);

const getInitials = (name: string): string => {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
};

const getStatusColor = (status: CollabStatus): string => {
	switch (status) {
		case 'connected':
			return colors.semantic.success;
		case 'connecting':
		case 'reconnecting':
			return colors.semantic.warning;
		case 'error':
			return colors.semantic.error;
		default:
			return colors.text.tertiary;
	}
};

const getStatusLabel = (status: CollabStatus): string => {
	switch (status) {
		case 'connected':
			return 'Connected';
		case 'connecting':
			return 'Connecting...';
		case 'reconnecting':
			return 'Reconnecting...';
		case 'error':
			return 'Connection error';
		case 'local':
			return 'Local';
		default:
			return 'Offline';
	}
};

export const SharePanel: React.FC<SharePanelProps> = ({
	collabStatus,
	collaborators,
	currentActorId,
	roomName,
	onOpenShareModal,
	onOpenJoinModal,
}) => {
	const isConnected = collabStatus === 'connected';
	const otherCollaborators = collaborators.filter((c) => c.actorId !== currentActorId);
	const statusColor = getStatusColor(collabStatus);
	const statusLabel = getStatusLabel(collabStatus);

	return (
		<div
			style={{
				padding: spacing.md,
				borderBottom: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.secondary,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: spacing.sm,
				}}
			>
				{isConnected ? (
					<button
						onClick={onOpenShareModal}
						style={{
							flex: 1,
							display: 'flex',
							alignItems: 'center',
							gap: spacing.sm,
							padding: `${spacing.sm} ${spacing.md}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							cursor: 'pointer',
							transition: 'background-color 0.15s ease',
						}}
					>
						<ShareIcon size={14} />
						<span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
							{roomName || 'Share'}
						</span>
						<div
							style={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								backgroundColor: statusColor,
								flexShrink: 0,
							}}
						/>
					</button>
				) : (
					<button
						onClick={onOpenShareModal}
						style={{
							flex: 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: spacing.xs,
							padding: `${spacing.sm} ${spacing.md}`,
							borderRadius: radii.md,
							border: 'none',
							backgroundColor: colors.accent.primary,
							color: '#fff',
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							cursor: 'pointer',
							transition: 'background-color 0.15s ease',
						}}
					>
						<ShareIcon size={14} />
						<span>Share</span>
					</button>
				)}

				{!isConnected && (
					<button
						onClick={onOpenJoinModal}
						title="Join by invite"
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: spacing.sm,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: 'transparent',
							color: colors.text.secondary,
							cursor: 'pointer',
							transition: 'background-color 0.15s ease',
						}}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
							<polyline points="10 17 15 12 10 7" />
							<line x1="15" y1="12" x2="3" y2="12" />
						</svg>
					</button>
				)}
			</div>

			{isConnected && otherCollaborators.length > 0 && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.xs,
						marginTop: spacing.sm,
						paddingTop: spacing.sm,
						borderTop: `1px solid ${colors.border.subtle}`,
					}}
				>
					<div
						style={{
							display: 'flex',
							flexDirection: 'row-reverse',
							gap: '-4px',
						}}
					>
						{otherCollaborators.slice(0, 4).map((collab) => (
							<div
								key={collab.actorId}
								title={collab.displayName}
								style={{
									width: 20,
									height: 20,
									borderRadius: '50%',
									backgroundColor: collab.color,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									fontSize: 9,
									fontWeight: 600,
									color: '#000',
									border: `2px solid ${colors.bg.secondary}`,
									marginLeft: -4,
									cursor: 'default',
								}}
							>
								{getInitials(collab.displayName)}
							</div>
						))}
					</div>
					<span
						style={{
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
						}}
					>
						{otherCollaborators.length} {otherCollaborators.length === 1 ? 'collaborator' : 'collaborators'}
					</span>
				</div>
			)}

			{!isConnected && collabStatus !== 'local' && collabStatus !== 'disabled' && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.xs,
						marginTop: spacing.sm,
						fontSize: typography.fontSize.xs,
						color: statusColor,
					}}
				>
					<div
						style={{
							width: 5,
							height: 5,
							borderRadius: '50%',
							backgroundColor: statusColor,
							animation: collabStatus === 'connecting' || collabStatus === 'reconnecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
						}}
					/>
					{statusLabel}
				</div>
			)}
		</div>
	);
};
