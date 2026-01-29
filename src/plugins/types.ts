export type PluginPermission =
  | 'selection:read'
  | 'export:snapshot'
  | 'document:write'
  | 'fs:save';

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  entry: string;
  icon?: string;
  permissions?: PluginPermission[];
  ui?: { width?: number; height?: number };
};

export type PluginSource = 'builtin' | 'installed' | 'dev';

export type PluginRegistration = {
  manifest: PluginManifest;
  entryUrl: string;
  source: PluginSource;
  path?: string;
};

export type RpcRequest = {
  rpc: 1;
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponse = {
  rpc: 1;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
};

export type SelectionGetResult = {
  ids: string[];
  primaryId: string | null;
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    size: { width: number; height: number };
  }>;
};
