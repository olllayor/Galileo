import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectMeta } from '../core/projects/registry';
import { colors, spacing, typography, radii, transitions, shadows } from './design-system';

interface ProjectsScreenProps {
	projects: ProjectMeta[];
	missingPaths: Record<string, boolean>;
	search: string;
	onSearchChange: (value: string) => void;
	onCreateProject: () => void;
	onOpenFile: () => void;
	onOpenProject: (project: ProjectMeta) => void;
	onRenameProject: (project: ProjectMeta, nextName: string) => Promise<void>;
	onDuplicateProject: (project: ProjectMeta) => void;
	onDeleteProject: (project: ProjectMeta) => void;
	onTogglePin: (project: ProjectMeta) => void;
	onRemoveMissing: (project: ProjectMeta) => void;
}

const formatTimestamp = (value: number) => {
	const date = new Date(value);
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
};

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!target || !(target instanceof HTMLElement)) {
		return false;
	}
	const tag = target.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
	projects,
	missingPaths,
	search,
	onSearchChange,
	onCreateProject,
	onOpenFile,
	onOpenProject,
	onRenameProject,
	onDuplicateProject,
	onDeleteProject,
	onTogglePin,
	onRemoveMissing,
}) => {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [renameError, setRenameError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const filteredProjects = useMemo(() => {
		const trimmed = search.trim().toLowerCase();
		if (!trimmed) return projects;
		return projects.filter((project) =>
			project.name.toLowerCase().includes(trimmed) || project.path.toLowerCase().includes(trimmed),
		);
	}, [projects, search]);

	const recentProjects = useMemo(() => {
		const sorted = [...filteredProjects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		const pinned = sorted.filter((project) => project.isPinned);
		const rest = sorted.filter((project) => !project.isPinned);
		return [...pinned, ...rest];
	}, [filteredProjects]);

	const allProjects = useMemo(() => {
		return [...filteredProjects].sort((a, b) => a.name.localeCompare(b.name));
	}, [filteredProjects]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isEditableTarget(e.target)) return;
			const isCmd = e.metaKey || e.ctrlKey;
			const key = e.key.toLowerCase();
			if (isCmd && key === 'f') {
				e.preventDefault();
				searchRef.current?.focus();
				return;
			}
			if (key === 'enter') {
				const visible = recentProjects;
				const target = selectedId
					? visible.find((project) => project.id === selectedId)
					: visible[0];
			if (target) {
				if (missingPaths[target.path]) return;
				e.preventDefault();
				onOpenProject(target);
			}
			}
		};
		const options = { capture: true } as const;
		window.addEventListener('keydown', handleKeyDown, options);
		return () => window.removeEventListener('keydown', handleKeyDown, options);
	}, [missingPaths, recentProjects, selectedId, search, onOpenProject]);

	const beginRename = (project: ProjectMeta) => {
		setRenamingId(project.id);
		setRenameValue(project.name);
		setRenameError(null);
	};

	const commitRename = async (project: ProjectMeta) => {
		const next = renameValue.trim();
		if (!next || next === project.name) {
			setRenamingId(null);
			return;
		}
		try {
			await onRenameProject(project, next);
			setRenamingId(null);
			setRenameError(null);
		} catch (error) {
			setRenameError(error instanceof Error ? error.message : 'Rename failed');
		}
	};

	const renderProjectRow = (project: ProjectMeta) => {
		const isMissing = missingPaths[project.path] === true;
		const isSelected = selectedId === project.id;
		const isHovered = hoveredId === project.id;
		return (
			<div key={project.id} style={{ marginBottom: spacing.sm }}>
				<div
					role="button"
					tabIndex={0}
					onMouseEnter={() => setHoveredId(project.id)}
					onMouseLeave={() => setHoveredId(null)}
					onClick={() => setSelectedId(project.id)}
					onDoubleClick={() => {
						if (isMissing) return;
						onOpenProject(project);
					}}
					title={project.path}
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: `${spacing.sm} ${spacing.md}`,
						borderRadius: radii.lg,
						backgroundColor: isSelected ? colors.bg.active : colors.bg.secondary,
						border: `1px solid ${colors.border.subtle}`,
						boxShadow: isSelected ? shadows.sm : 'none',
						cursor: 'pointer',
						transition: `background-color ${transitions.fast}`,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0, flex: 1 }}>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onTogglePin(project);
							}}
							title={project.isPinned ? 'Unpin project' : 'Pin project'}
							style={{
								width: '20px',
								height: '20px',
								borderRadius: radii.full,
								border: `1px solid ${colors.border.subtle}`,
								backgroundColor: project.isPinned ? colors.accent.primary : 'transparent',
								color: project.isPinned ? colors.text.primary : colors.text.secondary,
								fontSize: typography.fontSize.xs,
								cursor: 'pointer',
							}}
						>
							●
						</button>
						<div style={{ minWidth: 0 }}>
							{renamingId === project.id ? (
								<input
									type="text"
									value={renameValue}
									onChange={(e) => setRenameValue(e.target.value)}
									onBlur={() => commitRename(project)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') commitRename(project);
										if (e.key === 'Escape') setRenamingId(null);
									}}
									style={{
										width: '220px',
										backgroundColor: colors.bg.primary,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.md,
										padding: `4px ${spacing.sm}`,
										color: colors.text.primary,
										fontSize: typography.fontSize.md,
									}}
								/>
							) : (
								<div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
									<span
										style={{
											fontSize: typography.fontSize.lg,
											color: colors.text.primary,
											textOverflow: 'ellipsis',
											overflow: 'hidden',
											whiteSpace: 'nowrap',
											maxWidth: '280px',
										}}
									>
										{project.name}
									</span>
									<span style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
										{project.workspaceName || 'Local'}
									</span>
									<span
										style={{
											fontSize: typography.fontSize.xs,
											padding: '2px 6px',
											borderRadius: radii.full,
											border: `1px solid ${colors.border.subtle}`,
											color: colors.text.tertiary,
											textTransform: 'uppercase',
										}}
									>
										{project.env || 'local'}
									</span>
									{isMissing && (
										<span
											style={{
												fontSize: typography.fontSize.xs,
												padding: '2px 6px',
												borderRadius: radii.full,
												border: `1px solid ${colors.semantic.error}`,
												color: colors.semantic.error,
												textTransform: 'uppercase',
											}}
										>
										Missing
										</span>
									)}
								</div>
							)}
							<div style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary, marginTop: '2px' }}>
								Last opened {formatTimestamp(project.lastOpenedAt)}
							</div>
							{renameError && renamingId === project.id && (
								<div style={{ fontSize: typography.fontSize.sm, color: colors.semantic.error, marginTop: '2px' }}>
									{renameError}
								</div>
							)}
						</div>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
						{isMissing ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemoveMissing(project);
								}}
								style={{
									background: 'transparent',
									border: 'none',
									color: colors.text.secondary,
									fontSize: typography.fontSize.sm,
									cursor: 'pointer',
								}}
							>
								Remove
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={(e) => {
									e.stopPropagation();
									onOpenProject(project);
								}}
									style={{
										background: 'transparent',
										border: 'none',
										color: isHovered ? colors.text.primary : colors.text.secondary,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
										transition: `color ${transitions.fast}`,
									}}
								>
									Open
								</button>
								<button
									type="button"
									onClick={(e) => {
									e.stopPropagation();
									beginRename(project);
								}}
									style={{
										background: 'transparent',
										border: 'none',
										color: isHovered ? colors.text.primary : colors.text.secondary,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
										transition: `color ${transitions.fast}`,
									}}
								>
									Rename
								</button>
								<button
									type="button"
									onClick={(e) => {
									e.stopPropagation();
									onDuplicateProject(project);
								}}
									style={{
										background: 'transparent',
										border: 'none',
										color: isHovered ? colors.text.primary : colors.text.secondary,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
										transition: `color ${transitions.fast}`,
									}}
								>
									Duplicate
								</button>
								<button
									type="button"
									onClick={(e) => {
									e.stopPropagation();
									onDeleteProject(project);
								}}
									style={{
										background: 'transparent',
										border: 'none',
										color: colors.semantic.error,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
										transition: `color ${transitions.fast}`,
									}}
								>
									Delete
								</button>
							</>
						)}
					</div>
				</div>
			</div>
		);
	};

	const isEmpty = projects.length === 0;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				flex: 1,
				padding: `${spacing.lg} ${spacing.xl}`,
				gap: spacing.lg,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
				<div>
					<div style={{ fontSize: '20px', fontWeight: typography.fontWeight.semibold }}>Projects</div>
					<div style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
						Design systems in motion, kept local.
					</div>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
					<input
						ref={searchRef}
						type="text"
						placeholder="Search projects"
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						style={{
							width: '240px',
							height: '32px',
							backgroundColor: colors.bg.primary,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.md,
							padding: `0 ${spacing.sm}`,
							color: colors.text.primary,
							fontSize: typography.fontSize.md,
						}}
					/>
					<button
						type="button"
						onClick={onCreateProject}
						style={{
							height: '32px',
							padding: `0 ${spacing.md}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.secondary,
							color: colors.text.primary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
						}}
					>
						New Project
					</button>
					<button
						type="button"
						onClick={onOpenFile}
						style={{
							height: '32px',
							padding: `0 ${spacing.md}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.secondary,
							color: colors.text.primary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
						}}
					>
						Open File
					</button>
				</div>
			</div>

			{isEmpty ? (
				<div
					style={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: radii.lg,
						border: `1px dashed ${colors.border.subtle}`,
						color: colors.text.tertiary,
						textAlign: 'center',
						gap: spacing.sm,
					}}
				>
					<div style={{ fontSize: typography.fontSize.lg, color: colors.text.secondary }}>No projects yet</div>
					<div style={{ fontSize: typography.fontSize.sm }}>Create a new Galileo file or open an existing one.</div>
					<div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.sm }}>
						<button
							type="button"
							onClick={onCreateProject}
							style={{
								height: '32px',
								padding: `0 ${spacing.md}`,
								borderRadius: radii.md,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.secondary,
								color: colors.text.primary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
							}}
						>
							New Project
						</button>
						<button
							type="button"
							onClick={onOpenFile}
							style={{
								height: '32px',
								padding: `0 ${spacing.md}`,
								borderRadius: radii.md,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.secondary,
								color: colors.text.primary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
							}}
						>
							Open File
						</button>
					</div>
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
					<div>
						<div style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary, marginBottom: spacing.sm }}>
							{search.trim() ? 'Results' : 'Recent'}
						</div>
						<div>{recentProjects.map(renderProjectRow)}</div>
					</div>
					{!search.trim() && (
						<div>
							<div
								style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary, marginBottom: spacing.sm }}
							>
								All Projects
							</div>
							<div>{allProjects.map(renderProjectRow)}</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
