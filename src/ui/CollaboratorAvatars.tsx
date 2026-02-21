import React, { useState, useRef, useEffect } from 'react';
import { colors, spacing, typography, radii, shadows } from './design-system';
import type { CollaboratorPresence } from '../collab/types';

type CollaboratorAvatarsProps = {
	collaborators: CollaboratorPresence[];
	currentActorId: string;
	maxVisible?: number;
};

const getInitials = (name: string): string => {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
};

const Avatar: React.FC<{ name: string; color: string; isCurrentUser?: boolean; size?: number }> = ({
	name,
	color,
	isCurrentUser,
	size = 28,
}) => {
	return (
		<div
			title={`${name}${isCurrentUser ? ' (you)' : ''}`}
			style={{
				width: size,
				height: size,
				borderRadius: '50%',
				backgroundColor: color,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontSize: size * 0.4,
				fontWeight: 600,
				color: '#000',
				border: isCurrentUser ? `2px solid ${colors.accent.primary}` : '2px solid transparent',
				boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
				cursor: 'default',
				flexShrink: 0,
			}}
		>
			{getInitials(name)}
		</div>
	);
};

export const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({ collaborators, currentActorId, maxVisible = 4 }) => {
	const [expanded, setExpanded] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const otherCollaborators = collaborators.filter((c) => c.actorId !== currentActorId);
	const currentCollaborator = collaborators.find((c) => c.actorId === currentActorId);

	const visibleCollaborators = otherCollaborators.slice(0, maxVisible);
	const hiddenCount = otherCollaborators.length - maxVisible;

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setExpanded(false);
			}
		};
		if (expanded) {
			document.addEventListener('mousedown', handleClickOutside);
		}
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [expanded]);

	if (collaborators.length === 0) return null;

	return (
		<div
			ref={dropdownRef}
			style={{
				position: 'fixed',
				top: spacing.lg,
				right: spacing.lg,
				display: 'flex',
				alignItems: 'center',
				gap: spacing.xs,
				zIndex: 200,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					flexDirection: 'row-reverse',
				}}
			>
				{currentCollaborator && (
					<Avatar name={currentCollaborator.displayName} color={currentCollaborator.color} isCurrentUser size={28} />
				)}
				{hiddenCount > 0 && (
					<button
						onClick={() => setExpanded(!expanded)}
						style={{
							width: 28,
							height: 28,
							borderRadius: '50%',
							backgroundColor: colors.bg.tertiary,
							border: `1px solid ${colors.border.default}`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: typography.fontSize.xs,
							fontWeight: typography.fontWeight.medium,
							color: colors.text.secondary,
							cursor: 'pointer',
							marginRight: '-4px',
						}}
					>
						+{hiddenCount}
					</button>
				)}
				{visibleCollaborators.map((collab) => (
					<Avatar key={collab.actorId} name={collab.displayName} color={collab.color} size={28} />
				))}
			</div>

			{expanded && hiddenCount > 0 && (
				<div
					style={{
						position: 'absolute',
						top: '100%',
						right: 0,
						marginTop: spacing.sm,
						minWidth: '200px',
						backgroundColor: colors.bg.secondary,
						border: `1px solid ${colors.border.default}`,
						borderRadius: radii.lg,
						boxShadow: shadows.lg,
						overflow: 'hidden',
					}}
				>
					<div
						style={{
							padding: `${spacing.sm} ${spacing.md}`,
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							borderBottom: `1px solid ${colors.border.subtle}`,
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
						}}
					>
						In this room
					</div>
					<div style={{ maxHeight: '240px', overflowY: 'auto' }}>
						{collaborators.map((collab) => (
							<div
								key={collab.actorId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: spacing.sm,
									padding: `${spacing.sm} ${spacing.md}`,
									backgroundColor: collab.actorId === currentActorId ? colors.bg.hover : 'transparent',
								}}
							>
								<Avatar name={collab.displayName} color={collab.color} isCurrentUser={collab.actorId === currentActorId} size={24} />
								<span style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>
									{collab.displayName}
									{collab.actorId === currentActorId && (
										<span style={{ color: colors.text.tertiary, marginLeft: spacing.xs }}>(you)</span>
									)}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};
