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
