import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

/** Brand: primary green with black text, secondary black, neutral off-white, one cool grey family. */
export const color = {
  green: '#00D632',
  black: '#000000',
  white: '#FFFFFF',
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  text: '#000000',
  muted: '#5E6470',
  body: '#353A42',
  line: '#E3E6EA',
  lineSoft: '#EEF0F2',
  disabled: '#DCDFE3',
  danger: '#B42318',
  // Over the camera
  glassFill: 'rgba(16,17,19,0.42)',
  glassFillAndroid: 'rgba(16,17,19,0.78)',
  glassBorder: 'rgba(255,255,255,0.18)',
  glassChip: 'rgba(255,255,255,0.14)',
  onGlassMuted: 'rgba(255,255,255,0.66)',
  greenTint: 'rgba(0,214,50,0.14)',
  greenBorder: 'rgba(0,214,50,0.42)',
} as const;

/** Corner radius scale. Nothing outside it. */
export const radius = { chip: 8, control: 14, card: 20, sheet: 28, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** San Francisco on iOS, Roboto on Android: the system faces. */
export const font = {
  family: Platform.select({ ios: 'System', default: undefined }),
  numbers: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '600' as const, letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.4 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.7 },
};

/** Motion: strong ease-out for UI, drawer curve for sheets. Durations in ms. */
export const motion = {
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
  press: 160,
  lock: 260,
  swap: 240,
  sheet: 440,
};
