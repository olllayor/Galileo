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
        'asset:read:shared',
      ],
      assets: {
        bundle: [
          'models/iphone_15_pro_max.glb',
          'models/iphone_16_free.glb',
          'models/iphone_17_air.glb',
          'models/iphone_17_pro.glb',
          'presets/iphone16.json',
          'templates/iphone16/front_frame.svg',
          'templates/iphone16/front_shadow.svg',
          'templates/iphone16/tilt_frame.svg',
          'templates/iphone16/tilt_shadow.svg',
        ],
        shared: ['v1/devices/iphone16/iphone16.glb', 'v1/env/studio.hdr'],
      },
      ui: { width: 980, height: 640 },
    },
    entryUrl: '/plugins/mockrocket/index.html?v=10',
    source: 'builtin',
  },
];
