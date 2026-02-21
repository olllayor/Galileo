import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radii, shadows } from './design-system';

type JoinModalProps = {
	open: boolean;
	onClose: () => void;
	onJoin: (inviteToken: string) => void;
	isJoining: boolean;
	error: string | null;
};

const LinkIcon = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
	</svg>
);

const parseInviteToken = (input: string): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('galileo://collab/')) {
		return trimmed.replace('galileo://collab/', '');
	}

	try {
		const url = new URL(trimmed);
		const tokenFromUrl = url.searchParams.get('inviteToken') || url.searchParams.get('token');
		if (tokenFromUrl) return tokenFromUrl;
	} catch {
		// not a URL
	}

	if (/^[a-z0-9]{12,24}$/i.test(trimmed)) {
		return trimmed;
	}

	return trimmed;
};

export const JoinModal: React.FC<JoinModalProps> = ({ open, onClose, onJoin, isJoining, error }) => {
	const [inputValue, setInputValue] = useState('');

	const handleSubmit = useCallback(() => {
		const token = parseInviteToken(inputValue);
		if (token) {
			onJoin(token);
		}
	}, [inputValue, onJoin]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' && !isJoining) {
				handleSubmit();
			}
		},
		[handleSubmit, isJoining],
	);

	const handlePaste = useCallback(async () => {
		try {
			const text = await navigator.clipboard.readText();
			setInputValue(text);
		} catch {
			// ignore
		}
	}, []);

	if (!open) return null;

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
					width: 'min(440px, calc(100vw - 32px))',
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
					<span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold }}>Join Collaboration</span>
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
					<div style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
						Enter an invite token or paste a share link to join a collaboration session.
					</div>

					<div style={{ display: 'grid', gap: spacing.xs }}>
						<span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Invite token or link</span>
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
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									paddingLeft: spacing.md,
									color: colors.text.tertiary,
								}}
							>
								<LinkIcon />
							</div>
							<input
								type="text"
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="galileo://collab/... or token"
								autoFocus
								style={{
									flex: 1,
									padding: `${spacing.sm} ${spacing.md}`,
									paddingLeft: spacing.xs,
									border: 'none',
									background: 'transparent',
									color: colors.text.primary,
									fontSize: typography.fontSize.md,
									outline: 'none',
								}}
							/>
							<button
								onClick={handlePaste}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: `${spacing.sm} ${spacing.md}`,
									border: 'none',
									borderLeft: `1px solid ${colors.border.default}`,
									background: 'transparent',
									color: colors.text.secondary,
									cursor: 'pointer',
									fontSize: typography.fontSize.sm,
								}}
							>
								Paste
							</button>
						</div>
					</div>

					{error && (
						<div
							style={{
								padding: spacing.sm,
								backgroundColor: 'rgba(255, 69, 58, 0.1)',
								borderRadius: radii.md,
								color: colors.semantic.error,
								fontSize: typography.fontSize.sm,
							}}
						>
							{error}
						</div>
					)}

					<div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
						<button
							onClick={onClose}
							disabled={isJoining}
							style={{
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radii.md,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: 'transparent',
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: isJoining ? 'not-allowed' : 'pointer',
								opacity: isJoining ? 0.5 : 1,
							}}
						>
							Cancel
						</button>
						<button
							onClick={handleSubmit}
							disabled={isJoining || !inputValue.trim()}
							style={{
								padding: `${spacing.sm} ${spacing.lg}`,
								borderRadius: radii.md,
								border: 'none',
								backgroundColor: colors.accent.primary,
								color: '#fff',
								fontSize: typography.fontSize.md,
								fontWeight: typography.fontWeight.medium,
								cursor: isJoining || !inputValue.trim() ? 'not-allowed' : 'pointer',
								opacity: isJoining || !inputValue.trim() ? 0.5 : 1,
							}}
						>
							{isJoining ? 'Joining...' : 'Join Room'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
