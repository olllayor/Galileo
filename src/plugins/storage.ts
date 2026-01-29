import type { PluginManifest, PluginRegistration } from './types';

export type StoredPlugin = {
  manifest: PluginManifest;
  source: 'installed' | 'dev';
  path?: string;
};

const PLUGINS_KEY = 'galileo.plugins.installed.v1';
const RECENTS_KEY = 'galileo.plugins.recents.v1';
const MAX_RECENTS = 5;

export const loadStoredPlugins = (): StoredPlugin[] => {
  try {
    const raw = localStorage.getItem(PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as StoredPlugin[];
  } catch {
    return [];
  }
};

export const saveStoredPlugins = (plugins: StoredPlugin[]): void => {
  localStorage.setItem(PLUGINS_KEY, JSON.stringify(plugins));
};

export const loadRecentPluginIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const recordRecentPlugin = (plugin: PluginRegistration): string[] => {
  const existing = loadRecentPluginIds();
  const next = [plugin.manifest.id, ...existing.filter(id => id !== plugin.manifest.id)];
  const trimmed = next.slice(0, MAX_RECENTS);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
  return trimmed;
};
