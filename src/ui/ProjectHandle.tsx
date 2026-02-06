import React, { useEffect, useRef, useState } from 'react';
import type { ProjectEnv, ProjectVersion } from '../core/projects/registry';
import { colors, spacing, typography, radii, transitions } from './design-system';

interface ProjectHandleProps {
	projectName: string;
	fileName: string;
	workspaceName: string;
	env: ProjectEnv;
	version: ProjectVersion;
	breadcrumb?: string;
	onRename: (nextName: string) => void;
	onDuplicate: () => void;
	onSnapshot?: () => void;
	onSettings?: () => void;
}

const badgeStyle = {
	display: 'inline-flex',
	alignItems: 'center',
	height: '18px',
	padding: '0 7px',
	borderRadius: radii.full,
	border: `1px solid ${colors.border.subtle}`,
	fontSize: typography.fontSize.xs,
	letterSpacing: '0.5px',
	textTransform: 'uppercase' as const,
	color: colors.text.secondary,
	backgroundColor: 'rgba(255, 255, 255, 0.015)',
};

const actionStyle: React.CSSProperties = {
	padding: 0,
	border: 'none',
	background: 'transparent',
	color: colors.text.secondary,
	fontSize: typography.fontSize.sm,
	fontWeight: typography.fontWeight.medium,
	cursor: 'pointer',
	transition: `color ${transitions.fast}`,
};

const normalizeProjectName = (value: string): string => value.trim().toLowerCase().replace(/\.galileo$/i, '');

export const ProjectHandle: React.FC<ProjectHandleProps> = ({
	projectName,
	fileName,
	workspaceName,
	env,
	version,
	breadcrumb,
	onRename,
	onDuplicate,
	onSnapshot,
	onSettings,
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [draftName, setDraftName] = useState(projectName);
	const inputRef = useRef<HTMLInputElement>(null);
	const showFileName =
		fileName.trim().length > 0 && normalizeProjectName(fileName) !== normalizeProjectName(projectName);
	const showWorkspace = workspaceName.trim().length > 0 && workspaceName.trim().toLowerCase() !== 'local';

	useEffect(() => {
		setDraftName(projectName);
	}, [projectName]);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const commitRename = () => {
		const next = draftName.trim();
		if (next && next !== projectName) {
			onRename(next);
		}
		setDraftName(projectName);
		setIsEditing(false);
	};

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: spacing.md,
				flex: 1,
				minWidth: 0,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, minWidth: 0 }}>
					{isEditing ? (
						<input
							ref={inputRef}
							type="text"
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							onBlur={commitRename}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									commitRename();
								}
								if (e.key === 'Escape') {
									setDraftName(projectName);
									setIsEditing(false);
								}
							}}
							style={{
								width: '190px',
								backgroundColor: colors.bg.primary,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.md,
								padding: `0 ${spacing.sm}`,
								height: '22px',
								fontSize: typography.fontSize.lg,
								color: colors.text.primary,
							}}
						/>
					) : (
						<button
							type="button"
							title={breadcrumb}
							onClick={() => setIsEditing(true)}
							style={{
								padding: 0,
								border: 'none',
								background: 'transparent',
								fontSize: typography.fontSize.lg,
								fontWeight: typography.fontWeight.semibold,
								color: colors.text.primary,
								cursor: 'text',
								textOverflow: 'ellipsis',
								overflow: 'hidden',
								whiteSpace: 'nowrap',
								maxWidth: '220px',
							}}
						>
							{projectName}
						</button>
					)}
					{showFileName ? (
						<>
							<span style={{ color: colors.text.tertiary, fontSize: typography.fontSize.lg }}>-</span>
							<span
								style={{
									fontSize: typography.fontSize.lg,
									color: colors.text.secondary,
									textOverflow: 'ellipsis',
									overflow: 'hidden',
									whiteSpace: 'nowrap',
									maxWidth: '200px',
								}}
							>
								{fileName}
							</span>
						</>
					) : null}
				</div>
				{showWorkspace ? (
					<span
						style={{
							fontSize: typography.fontSize.lg,
							color: colors.text.tertiary,
							paddingLeft: spacing.xs,
							borderLeft: `1px solid ${colors.border.subtle}`,
						}}
					>
						{workspaceName}
					</span>
				) : null}
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
				<span style={{ ...badgeStyle }}>{env}</span>
				<span style={{ ...badgeStyle }}>{version}</span>
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginLeft: spacing.md }}>
				<button
					type="button"
					onClick={onDuplicate}
					style={actionStyle}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = colors.text.primary;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = colors.text.secondary;
					}}
				>
					Duplicate
				</button>
				<button
					type="button"
					onClick={onSnapshot}
					disabled={!onSnapshot}
					title={onSnapshot ? 'Create snapshot' : 'Snapshots in v1 are not yet available'}
					style={{
						...actionStyle,
						color: onSnapshot ? colors.text.secondary : colors.text.disabled,
						cursor: onSnapshot ? 'pointer' : 'default',
					}}
					onMouseEnter={(e) => {
						if (onSnapshot) e.currentTarget.style.color = colors.text.primary;
					}}
					onMouseLeave={(e) => {
						if (onSnapshot) e.currentTarget.style.color = colors.text.secondary;
					}}
				>
					Snapshot
				</button>
				<button
					type="button"
					onClick={onSettings}
					disabled={!onSettings}
					title={onSettings ? 'Project settings' : 'Project settings in v1 are not yet available'}
					style={{
						...actionStyle,
						color: onSettings ? colors.text.secondary : colors.text.disabled,
						cursor: onSettings ? 'pointer' : 'default',
					}}
					onMouseEnter={(e) => {
						if (onSettings) e.currentTarget.style.color = colors.text.primary;
					}}
					onMouseLeave={(e) => {
						if (onSettings) e.currentTarget.style.color = colors.text.secondary;
					}}
				>
					Settings
				</button>
			</div>
		</div>
	);
};
