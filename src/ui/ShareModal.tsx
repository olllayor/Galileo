import React, { useState } from 'react';
import { colors, spacing, typography, radii, shadows } from './design-system';
import type { CollaboratorPresence } from '../collab/types';

type ShareModalProps = {
	open: boolean;
	onClose: () => void;
	roomName: string | null;
	shareLink: string | null;
	collaborators: CollaboratorPresence[];
	currentActorId: string;
	isCreating: boolean;
	onCreateRoom: (name: string) => void;
};

const extractInviteToken = (shareLink: string | null): string | null => {
	if (!shareLink) return null;
	if (shareLink.startsWith('galileo://collab/')) {
		return shareLink.replace('galileo://collab/', '');
	}
	return null;
};

const CopyIcon = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</svg>
);

const CheckIcon = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="20 6 9 17 4 12" />
	</svg>
);

const PeopleIcon = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
		<path d="M16 3.13a4 4 0 0 1 0 7.75" />
	</svg>
);

const getInitials = (name: string): string => {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
};

export const ShareModal: React.FC<ShareModalProps> = ({
	open,
	onClose,
	roomName,
	shareLink,
	collaborators,
	currentActorId,
	isCreating,
	onCreateRoom,
}) => {
	const [nameInput, setNameInput] = useState('');
	const [linkCopied, setLinkCopied] = useState(false);
	const [tokenCopied, setTokenCopied] = useState(false);

	const inviteToken = extractInviteToken(shareLink);

	if (!open) return null;

	const handleCopyLink = async () => {
		if (!shareLink) return;
		try {
			await navigator.clipboard.writeText(shareLink);
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		} catch {
			// fallback
		}
	};

	const handleCopyToken = async () => {
		if (!inviteToken) return;
		try {
			await navigator.clipboard.writeText(inviteToken);
			setTokenCopied(true);
			setTimeout(() => setTokenCopied(false), 2000);
		} catch {
			// fallback
		}
	};

	const handleCreate = () => {
		const name = nameInput.trim() || 'Untitled Room';
		onCreateRoom(name);
	};

	const isConnected = Boolean(shareLink && inviteToken);
	const otherCollaborators = collaborators.filter((c) => c.actorId !== currentActorId);

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				backgroundColor: 'rgba(0, 0, 0, 0.5)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1700,
			}}
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
				style={{
					width: 'min(480px, calc(100vw - 32px))',
					backgroundColor: colors.bg.secondary,
					border: `1px solid ${colors.border.default}`,
					borderRadius: radii.lg,
					boxShadow: shadows.xl,
					overflow: 'hidden',
				}}
			>
				<div
					style={{
						padding: spacing.lg,
						borderBottom: `1px solid ${colors.border.subtle}`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
					}}
				>
					<span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold }}>
						{isConnected ? 'Share Invitation' : 'Create Share Link'}
					</span>
					<button
						onClick={onClose}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '28px',
							height: '28px',
							border: 'none',
							borderRadius: radii.md,
							background: 'transparent',
							color: colors.text.secondary,
							cursor: 'pointer',
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div style={{ padding: spacing.lg, display: 'grid', gap: spacing.md }}>
					{!isConnected ? (
						<>
							<div style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
								Create a share link to collaborate with others in real-time. Anyone with the link can edit this document.
							</div>
							<label style={{ display: 'grid', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Room name</span>
								<input
									type="text"
									value={nameInput}
									onChange={(e) => setNameInput(e.target.value)}
									placeholder={roomName || 'Untitled'}
									autoFocus
									style={{
										width: '100%',
										padding: `${spacing.sm} ${spacing.md}`,
										borderRadius: radii.md,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
										fontSize: typography.fontSize.md,
										outline: 'none',
									}}
								/>
							</label>
							<button
								onClick={handleCreate}
								disabled={isCreating}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									gap: spacing.sm,
									padding: `${spacing.sm} ${spacing.lg}`,
									borderRadius: radii.md,
									border: 'none',
									backgroundColor: colors.accent.primary,
									color: '#fff',
									fontSize: typography.fontSize.md,
									fontWeight: typography.fontWeight.medium,
									cursor: isCreating ? 'wait' : 'pointer',
									opacity: isCreating ? 0.7 : 1,
								}}
							>
								{isCreating ? 'Creating...' : 'Create Share Link'}
							</button>
						</>
					) : (
						<>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: spacing.sm,
									padding: spacing.sm,
									backgroundColor: 'rgba(48, 209, 88, 0.1)',
									borderRadius: radii.md,
									color: colors.semantic.success,
									fontSize: typography.fontSize.sm,
								}}
							>
								<CheckIcon />
								<span>Collaboration session active</span>
							</div>

							<div style={{ display: 'grid', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Room</span>
								<span style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium }}>{roomName ?? 'Untitled Room'}</span>
							</div>

							<div style={{ display: 'grid', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Share link</span>
								<div
									style={{
										display: 'flex',
										gap: spacing.xs,
										backgroundColor: colors.bg.tertiary,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.md,
										overflow: 'hidden',
									}}
								>
									<input
										type="text"
										readOnly
										value={shareLink ?? ''}
										style={{
											flex: 1,
											padding: `${spacing.sm} ${spacing.md}`,
											border: 'none',
											background: 'transparent',
											color: colors.text.primary,
											fontSize: typography.fontSize.sm,
											fontFamily: typography.fontFamily.mono,
											outline: 'none',
										}}
									/>
									<button
										onClick={handleCopyLink}
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											padding: spacing.sm,
											border: 'none',
											borderLeft: `1px solid ${colors.border.default}`,
											background: linkCopied ? colors.semantic.success : 'transparent',
											color: linkCopied ? '#fff' : colors.text.secondary,
											cursor: 'pointer',
											transition: 'all 0.15s ease',
										}}
									>
										{linkCopied ? <CheckIcon /> : <CopyIcon />}
									</button>
								</div>
							</div>

							<div style={{ display: 'grid', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Invite token</span>
								<div
									style={{
										display: 'flex',
										gap: spacing.xs,
										backgroundColor: colors.bg.tertiary,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.md,
										overflow: 'hidden',
									}}
								>
									<input
										type="text"
										readOnly
										value={inviteToken || ''}
										style={{
											flex: 1,
											padding: `${spacing.sm} ${spacing.md}`,
											border: 'none',
											background: 'transparent',
											color: colors.text.primary,
											fontSize: typography.fontSize.sm,
											fontFamily: typography.fontFamily.mono,
											outline: 'none',
										}}
									/>
									<button
										onClick={handleCopyToken}
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											padding: spacing.sm,
											border: 'none',
											borderLeft: `1px solid ${colors.border.default}`,
											background: tokenCopied ? colors.semantic.success : 'transparent',
											color: tokenCopied ? '#fff' : colors.text.secondary,
											cursor: 'pointer',
											transition: 'all 0.15s ease',
										}}
									>
										{tokenCopied ? <CheckIcon /> : <CopyIcon />}
									</button>
								</div>
							</div>

							<div style={{ display: 'grid', gap: spacing.sm, marginTop: spacing.sm }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, color: colors.text.secondary }}>
									<PeopleIcon />
									<span style={{ fontSize: typography.fontSize.sm }}>
										{collaborators.length} {collaborators.length === 1 ? 'user' : 'users'} in this room
									</span>
								</div>
								{otherCollaborators.length > 0 && (
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
										{otherCollaborators.map((collab) => (
											<div
												key={collab.actorId}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: spacing.sm,
													padding: `${spacing.xs} ${spacing.sm}`,
													backgroundColor: colors.bg.tertiary,
													borderRadius: radii.md,
												}}
											>
												<div
													style={{
														width: '20px',
														height: '20px',
														borderRadius: '50%',
														backgroundColor: collab.color,
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														fontSize: '10px',
														fontWeight: 600,
														color: '#000',
													}}
												>
													{getInitials(collab.displayName)}
												</div>
												<span style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>{collab.displayName}</span>
											</div>
										))}
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
