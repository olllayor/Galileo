import type { PluginRegistration } from './types';

const iconifyBuiltinPlugins: PluginRegistration[] = [
	{
		manifest: {
			id: 'com.galileo.iconify',
			name: 'Iconify Icons',
			version: '0.1.0',
			entry: 'index.html',
			permissions: ['selection:read', 'document:write', 'iconify:search', 'iconify:browse', 'iconify:render'],
			ui: { width: 520, height: 740 },
		},
    entryUrl: '/plugins/iconify/index.html?v=10',
		source: 'builtin',
	},
	{
		manifest: {
			id: 'com.galileo.iconify.material',
			name: 'Material Icons (Iconify)',
			version: '0.1.0',
			entry: 'index.html',
			permissions: ['selection:read', 'document:write', 'iconify:search', 'iconify:browse', 'iconify:render'],
			ui: { width: 520, height: 740 },
		},
    entryUrl: '/plugins/iconify/index.html?v=10&preset=material',
		source: 'builtin',
	},
];

export const builtinPlugins: PluginRegistration[] = [
	{
		manifest: {
			id: 'com.galileo.3dicons',
			name: '3D Icons',
			version: '0.1.0',
			entry: 'index.html',
			permissions: ['selection:read', 'document:write'],
			ui: { width: 320, height: 740 },
		},
		entryUrl: '/plugins/3dicons/index.html?v=1',
		source: 'builtin',
	},
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
			ui: { width: 980, height: 740 },
		},
		entryUrl: '/plugins/mockrocket/index.html?v=10',
		source: 'builtin',
	},
	{
		manifest: {
			id: 'com.galileo.unsplash',
			name: 'Unsplash Photos',
			version: '0.1.0',
			entry: 'index.html',
			permissions: ['selection:read', 'document:write', 'unsplash:search', 'unsplash:insert'],
			ui: { width: 420, height: 740 },
		},
		entryUrl: '/plugins/unsplash/index.html?v=1',
		source: 'builtin',
	},
	...iconifyBuiltinPlugins,
];
