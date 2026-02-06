import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectMeta } from '../core/projects/registry';
import { colors, spacing, typography, radii, transitions } from './design-system';

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

const topButtonStyle: React.CSSProperties = {
	height: '32px',
	padding: `0 ${spacing.md}`,
	borderRadius: radii.md,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: 'rgba(255, 255, 255, 0.02)',
	color: colors.text.primary,
	fontSize: typography.fontSize.lg,
	fontWeight: typography.fontWeight.medium,
	cursor: 'pointer',
	transition: `background-color ${transitions.fast}, border-color ${transitions.fast}, color ${transitions.fast}`,
};

const rowTextActionStyle: React.CSSProperties = {
	background: 'transparent',
	border: 'none',
	padding: 0,
	color: colors.text.secondary,
	fontSize: typography.fontSize.lg,
	cursor: 'pointer',
	lineHeight: 1.2,
	transition: `color ${transitions.fast}`,
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
				const target = selectedId ? visible.find((project) => project.id === selectedId) : visible[0];
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
	}, [missingPaths, onOpenProject, recentProjects, selectedId]);

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
		const showActions = isHovered || isSelected;

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
						gap: spacing.lg,
						padding: `${spacing.md} ${spacing.lg} ${spacing.md} ${spacing.md}`,
						borderRadius: radii.lg,
						backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.012)',
						border: `1px solid ${isSelected ? colors.border.default : colors.border.subtle}`,
						cursor: 'pointer',
						transition: `background-color ${transitions.fast}, border-color ${transitions.fast}, opacity ${transitions.fast}`,
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
								width: '22px',
								height: '22px',
								padding: 0,
								display: 'grid',
								placeItems: 'center',
								borderRadius: radii.full,
								border: `1px solid ${colors.border.subtle}`,
								backgroundColor: project.isPinned ? 'rgba(10, 132, 255, 0.12)' : 'transparent',
								color: project.isPinned ? colors.accent.primary : 'rgba(255, 255, 255, 0.38)',
								fontSize: '9px',
								cursor: 'pointer',
								transition: `border-color ${transitions.fast}, background-color ${transitions.fast}, color ${transitions.fast}`,
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
										if (e.key === 'Enter') void commitRename(project);
										if (e.key === 'Escape') setRenamingId(null);
									}}
									style={{
										width: '240px',
										height: '30px',
										backgroundColor: colors.bg.primary,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.md,
										padding: `0 ${spacing.sm}`,
										color: colors.text.primary,
										fontSize: typography.fontSize.lg,
									}}
								/>
							) : (
								<div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
									<span
										style={{
											fontSize: '22px',
											lineHeight: 1,
											fontWeight: typography.fontWeight.semibold,
											color: colors.text.primary,
											textOverflow: 'ellipsis',
											overflow: 'hidden',
											whiteSpace: 'nowrap',
											maxWidth: '300px',
											letterSpacing: '-0.5px',
										}}
									>
										{project.name}
									</span>
									<span style={{ color: colors.text.tertiary, fontSize: typography.fontSize.lg }}>
										{project.workspaceName || 'Local'}
									</span>
									<span
										style={{
											fontSize: typography.fontSize.xs,
											letterSpacing: '0.8px',
											textTransform: 'uppercase',
											color: colors.text.tertiary,
											border: `1px solid ${colors.border.subtle}`,
											borderRadius: radii.full,
											padding: '3px 10px',
											lineHeight: 1,
										}}
									>
										{project.env || 'local'}
									</span>
									{isMissing && (
										<span
											style={{
												fontSize: typography.fontSize.xs,
												letterSpacing: '0.8px',
												textTransform: 'uppercase',
												color: colors.semantic.error,
												border: `1px solid rgba(255, 69, 58, 0.3)`,
												borderRadius: radii.full,
												padding: '3px 10px',
												lineHeight: 1,
											}}
										>
											Missing
										</span>
									)}
								</div>
							)}

							<div
								style={{
									fontSize: typography.fontSize.lg,
									color: colors.text.tertiary,
									marginTop: '4px',
								}}
							>
								Last opened {formatTimestamp(project.lastOpenedAt)}
							</div>
							{renameError && renamingId === project.id && (
								<div style={{ fontSize: typography.fontSize.md, color: colors.semantic.error, marginTop: '4px' }}>
									{renameError}
								</div>
							)}
						</div>
					</div>

					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: spacing.md,
							opacity: showActions ? 1 : 0.2,
							transition: `opacity ${transitions.fast}`,
						}}
					>
						{isMissing ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemoveMissing(project);
								}}
								style={{
									...rowTextActionStyle,
									color: colors.text.secondary,
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
										height: '26px',
										padding: `0 ${spacing.sm}`,
										borderRadius: radii.md,
										border: `1px solid ${colors.border.subtle}`,
										backgroundColor: 'rgba(255, 255, 255, 0.02)',
										color: colors.text.primary,
										fontSize: typography.fontSize.lg,
										cursor: 'pointer',
										transition: `border-color ${transitions.fast}, background-color ${transitions.fast}`,
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
									style={rowTextActionStyle}
								>
									Rename
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onDuplicateProject(project);
									}}
									style={rowTextActionStyle}
								>
									Duplicate
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onDeleteProject(project);
									}}
									style={{ ...rowTextActionStyle, color: colors.semantic.error }}
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
				flex: 1,
				overflow: 'auto',
				background:
					'radial-gradient(1200px 480px at 0% -10%, rgba(255,255,255,0.05), transparent), linear-gradient(180deg, #1a1b1d 0%, #17181a 100%)',
			}}
		>
			<div
				style={{
					width: '100%',
					maxWidth: '1360px',
					margin: '0 auto',
					padding: `${spacing.xl} ${spacing.xl} ${spacing.xxl}`,
					display: 'flex',
					flexDirection: 'column',
					gap: spacing.lg,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: spacing.lg,
						flexWrap: 'wrap',
					}}
				>
					<div>
						<div
							style={{
								fontSize: '42px',
								lineHeight: 1,
								fontWeight: typography.fontWeight.semibold,
								letterSpacing: '-1px',
							}}
						>
							Projects
						</div>
						<div style={{ marginTop: '6px', fontSize: typography.fontSize.xl, color: colors.text.tertiary }}>
							Design systems in motion, kept local.
						</div>
					</div>

					<div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
						<input
							ref={searchRef}
							type="text"
							placeholder="Search projects"
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							style={{
								width: '380px',
								maxWidth: 'calc(100vw - 220px)',
								height: '32px',
								backgroundColor: 'rgba(18, 19, 20, 0.85)',
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.md,
								padding: `0 ${spacing.md}`,
								color: colors.text.primary,
								fontSize: typography.fontSize.lg,
								outline: 'none',
							}}
						/>
						<button type="button" onClick={onCreateProject} style={topButtonStyle}>
							New Project
						</button>
						<button type="button" onClick={onOpenFile} style={topButtonStyle}>
							Open File
						</button>
					</div>
				</div>

				{isEmpty ? (
					<div
						style={{
							minHeight: '340px',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							borderRadius: radii.xl,
							border: `1px solid ${colors.border.subtle}`,
							backgroundColor: 'rgba(255,255,255,0.01)',
							textAlign: 'center',
							gap: spacing.sm,
						}}
					>
						<div style={{ fontSize: '20px', color: colors.text.secondary }}>No projects yet</div>
						<div style={{ fontSize: typography.fontSize.lg, color: colors.text.tertiary }}>
							Create a new Galileo file or open an existing one.
						</div>
						<div style={{ marginTop: spacing.sm, display: 'flex', gap: spacing.md }}>
							<button type="button" onClick={onCreateProject} style={topButtonStyle}>
								New Project
							</button>
							<button type="button" onClick={onOpenFile} style={topButtonStyle}>
								Open File
							</button>
						</div>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
						<div>
							<div
								style={{
									fontSize: typography.fontSize.sm,
									color: colors.text.tertiary,
									textTransform: 'uppercase',
									letterSpacing: '1px',
									marginBottom: spacing.md,
								}}
							>
								{search.trim() ? 'Results' : 'Recent'}
							</div>
							<div>{recentProjects.map(renderProjectRow)}</div>
						</div>

						{!search.trim() && (
							<div>
								<div
									style={{
										fontSize: typography.fontSize.sm,
										color: colors.text.tertiary,
										textTransform: 'uppercase',
										letterSpacing: '1px',
										marginBottom: spacing.md,
									}}
								>
									All Projects
								</div>
								<div>{allProjects.map(renderProjectRow)}</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};
