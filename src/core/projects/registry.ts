import { generateId } from '../doc/id';

export type ProjectEnv = 'local' | 'cloud' | 'read-only';
export type ProjectVersion = 'live' | 'draft' | 'snapshot';
export type ProjectSyncState = 'local-only' | 'queued' | 'synced';

export type ProjectMeta = {
	id: string;
	name: string;
	path: string;
	workspaceName: string;
	env: ProjectEnv;
	lastOpenedAt: number;
	isPinned?: boolean;
	ownerUserId?: string;
	syncState?: ProjectSyncState;
};

const PROJECTS_KEY = 'galileo.projects.v1';
const LAST_OPEN_KEY = 'galileo.projects.lastOpen.v1';
const PROJECTS_SEARCH_KEY = 'galileo.ui.projects.search.v1';

export const getProjectStorageKey = () => PROJECTS_KEY;
export const getProjectSearchKey = () => PROJECTS_SEARCH_KEY;

const safeParse = <T>(raw: string | null, fallback: T): T => {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
};

export const loadProjects = (): ProjectMeta[] => {
	const parsed = safeParse<ProjectMeta[]>(localStorage.getItem(PROJECTS_KEY), []);
	if (!Array.isArray(parsed)) return [];
	return parsed
		.filter((entry) => Boolean(entry?.id && entry?.path && entry?.name))
		.map((entry) => ({
			...entry,
			workspaceName: entry.workspaceName || 'Local',
			env: entry.env || 'local',
			lastOpenedAt: Number.isFinite(entry.lastOpenedAt) ? entry.lastOpenedAt : Date.now(),
			syncState: entry.syncState || 'local-only',
		}));
};

export const saveProjects = (projects: ProjectMeta[]) => {
	localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
};

export const getLastOpenProjectId = (): string | null => {
	const raw = localStorage.getItem(LAST_OPEN_KEY);
	return raw || null;
};

export const setLastOpenProjectId = (projectId: string) => {
	localStorage.setItem(LAST_OPEN_KEY, projectId);
};

export const loadProjectsSearch = (): string => {
	return localStorage.getItem(PROJECTS_SEARCH_KEY) || '';
};

export const saveProjectsSearch = (value: string) => {
	localStorage.setItem(PROJECTS_SEARCH_KEY, value);
};

export const deriveProjectNameFromPath = (path: string): string => {
	const file = path.split(/[/\\]/).pop() || 'Untitled';
	return file.replace(/\.galileo$/i, '') || 'Untitled';
};

export const createProjectMeta = (path: string): ProjectMeta => ({
	id: generateId(),
	name: deriveProjectNameFromPath(path),
	path,
	workspaceName: 'Local',
	env: 'local',
	lastOpenedAt: Date.now(),
	syncState: 'local-only',
});

export const upsertProject = (projects: ProjectMeta[], project: ProjectMeta): ProjectMeta[] => {
	const index = projects.findIndex((item) => item.id === project.id || item.path === project.path);
	if (index === -1) {
		return [project, ...projects];
	}
	const next = [...projects];
	next[index] = { ...projects[index], ...project };
	return next;
};

export const removeProjectById = (projects: ProjectMeta[], projectId: string): ProjectMeta[] => {
	return projects.filter((project) => project.id !== projectId);
};

export const updateProjectById = (
	projects: ProjectMeta[],
	projectId: string,
	updates: Partial<ProjectMeta>,
): ProjectMeta[] => {
	return projects.map((project) => (project.id === projectId ? { ...project, ...updates } : project));
};

export const toggleProjectPin = (projects: ProjectMeta[], projectId: string): ProjectMeta[] => {
	return projects.map((project) =>
		project.id === projectId ? { ...project, isPinned: !project.isPinned } : project,
	);
};

export const touchProject = (projects: ProjectMeta[], projectId: string): ProjectMeta[] => {
	return projects.map((project) =>
		project.id === projectId ? { ...project, lastOpenedAt: Date.now() } : project,
	);
};

export const getProjectByPath = (projects: ProjectMeta[], path: string): ProjectMeta | undefined => {
	return projects.find((project) => project.path === path);
};

export const getProjectById = (projects: ProjectMeta[], projectId: string): ProjectMeta | undefined => {
	return projects.find((project) => project.id === projectId);
};
