export type FramePreset = {
	id: string;
	label: string;
	width: number;
	height: number;
};

export type FramePresetGroup = {
	label: string;
	presets: FramePreset[];
};

// Device presets include screen metadata for mockup integration
export type DevicePreset = {
	id: string;
	name: string;
	// Frame dimensions (what gets created on canvas)
	frameWidth: number;
	frameHeight: number;
	// Screen dimensions (same as frame unless bezel frames are added later)
	screenWidth: number;
	screenHeight: number;
	// Computed aspect ratio for mockup fitting
	screenAspect: number;
	// Device category for filtering
	tags: ('phone' | 'tablet' | 'desktop')[];
	// Optional safe area insets (top, right, bottom, left)
	safeArea?: { top: number; right: number; bottom: number; left: number };
	// Reference to mockRocket preset (if 3D model exists)
	mockupPresetId?: string;
};

export type DevicePresetGroup = {
	label: string;
	presets: DevicePreset[];
};

// Device presets with full metadata for mockup integration
export const devicePresetGroups: DevicePresetGroup[] = [
	{
		label: 'iPhone',
		presets: [
			{
				id: 'iphone-16-pro',
				name: 'iPhone 16 Pro',
				frameWidth: 402,
				frameHeight: 874,
				screenWidth: 402,
				screenHeight: 874,
				screenAspect: 874 / 402, // ~2.17
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
				mockupPresetId: 'iphone16',
			},
			{
				id: 'iphone-16',
				name: 'iPhone 16',
				frameWidth: 393,
				frameHeight: 852,
				screenWidth: 393,
				screenHeight: 852,
				screenAspect: 852 / 393, // ~2.17
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
				mockupPresetId: 'iphone16',
			},
			{
				id: 'iphone-16-pro-max',
				name: 'iPhone 16 Pro Max',
				frameWidth: 440,
				frameHeight: 956,
				screenWidth: 440,
				screenHeight: 956,
				screenAspect: 956 / 440, // ~2.17
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
				mockupPresetId: 'iphone16',
			},
			{
				id: 'iphone-16-plus',
				name: 'iPhone 16 Plus',
				frameWidth: 430,
				frameHeight: 932,
				screenWidth: 430,
				screenHeight: 932,
				screenAspect: 932 / 430, // ~2.17
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
				mockupPresetId: 'iphone16',
			},
			{
				id: 'iphone-14-15-pro-max',
				name: 'iPhone 14 & 15 Pro Max',
				frameWidth: 430,
				frameHeight: 932,
				screenWidth: 430,
				screenHeight: 932,
				screenAspect: 932 / 430,
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
			},
			{
				id: 'iphone-14-15-pro',
				name: 'iPhone 14 & 15 Pro',
				frameWidth: 393,
				frameHeight: 852,
				screenWidth: 393,
				screenHeight: 852,
				screenAspect: 852 / 393,
				tags: ['phone'],
				safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
			},
			{
				id: 'iphone-13-14',
				name: 'iPhone 13 & 14',
				frameWidth: 390,
				frameHeight: 844,
				screenWidth: 390,
				screenHeight: 844,
				screenAspect: 844 / 390,
				tags: ['phone'],
				safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
			},
			{
				id: 'iphone-14-plus',
				name: 'iPhone 14 Plus',
				frameWidth: 428,
				frameHeight: 926,
				screenWidth: 428,
				screenHeight: 926,
				screenAspect: 926 / 428,
				tags: ['phone'],
				safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
			},
		],
	},
	{
		label: 'Android',
		presets: [
			{
				id: 'android-compact',
				name: 'Android Compact',
				frameWidth: 412,
				frameHeight: 917,
				screenWidth: 412,
				screenHeight: 917,
				screenAspect: 917 / 412,
				tags: ['phone'],
			},
			{
				id: 'android-medium',
				name: 'Android Medium',
				frameWidth: 700,
				frameHeight: 840,
				screenWidth: 700,
				screenHeight: 840,
				screenAspect: 840 / 700,
				tags: ['tablet'],
			},
		],
	},
	{
		label: 'iPad',
		presets: [
			{
				id: 'ipad-pro-13',
				name: 'iPad Pro 13"',
				frameWidth: 1032,
				frameHeight: 1376,
				screenWidth: 1032,
				screenHeight: 1376,
				screenAspect: 1376 / 1032,
				tags: ['tablet'],
				safeArea: { top: 24, right: 0, bottom: 20, left: 0 },
			},
			{
				id: 'ipad-pro-11',
				name: 'iPad Pro 11"',
				frameWidth: 834,
				frameHeight: 1194,
				screenWidth: 834,
				screenHeight: 1194,
				screenAspect: 1194 / 834,
				tags: ['tablet'],
				safeArea: { top: 24, right: 0, bottom: 20, left: 0 },
			},
		],
	},
];

// Helper to get device preset by ID
export const getDevicePresetById = (id: string): DevicePreset | null => {
	for (const group of devicePresetGroups) {
		const preset = group.presets.find((p) => p.id === id);
		if (preset) return preset;
	}
	return null;
};

// Helper to check if aspect ratios match within epsilon
export const aspectsMatch = (a: number, b: number, epsilon = 0.01): boolean => {
	return Math.abs(a - b) < epsilon;
};

// Helper to find a matching device preset for given dimensions
export const findMatchingDevicePreset = (width: number, height: number): DevicePreset | null => {
	const aspect = height / width;
	for (const group of devicePresetGroups) {
		for (const preset of group.presets) {
			// Check exact dimension match first
			if (preset.frameWidth === width && preset.frameHeight === height) {
				return preset;
			}
			// Fallback to aspect ratio match with same width
			if (preset.frameWidth === width && aspectsMatch(preset.screenAspect, aspect)) {
				return preset;
			}
		}
	}
	return null;
};

// Legacy frame presets (for backwards compatibility)
export const framePresetGroups: FramePresetGroup[] = [
	{
		label: 'iPhone',
		presets: [
			{ id: 'iphone-16-pro', label: 'iPhone 16 Pro', width: 402, height: 874 },
			{ id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852 },
			{ id: 'iphone-16-pro-max', label: 'iPhone 16 Pro Max', width: 440, height: 956 },
			{ id: 'iphone-16-plus', label: 'iPhone 16 Plus', width: 430, height: 932 },
			{ id: 'iphone-14-15-pro-max', label: 'iPhone 14 & 15 Pro Max', width: 430, height: 932 },
			{ id: 'iphone-14-15-pro', label: 'iPhone 14 & 15 Pro', width: 393, height: 852 },
			{ id: 'iphone-13-14', label: 'iPhone 13 & 14', width: 390, height: 844 },
			{ id: 'iphone-14-plus', label: 'iPhone 14 Plus', width: 428, height: 926 },
		],
	},
	{
		label: 'Android',
		presets: [
			{ id: 'android-compact', label: 'Android Compact', width: 412, height: 917 },
			{ id: 'android-medium', label: 'Android Medium', width: 700, height: 840 },
		],
	},
];
