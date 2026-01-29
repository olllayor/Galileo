import type { PluginRegistration } from './types';

export const builtinPlugins: PluginRegistration[] = [
  {
    manifest: {
      id: 'com.galileo.mockrocket',
      name: 'MockRocket - 3D Mockups',
      version: '0.1.0',
      entry: 'index.html',
      permissions: [
        'selection:read',
        'export:snapshot',
        'document:write',
        'fs:save',
        'asset:read',
      ],
      assets: {
        bundle: ['models/iphone_16_free.glb'],
      },
      ui: { width: 980, height: 640 },
    },
    entryUrl: '/plugins/mockrocket/index.html?v=3',
    source: 'builtin',
  },
];
