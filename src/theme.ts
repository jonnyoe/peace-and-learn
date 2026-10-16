import { Platform } from 'react-native';

// E-ink rules: pure black on white, no animation, big targets, few grays.
export const color = {
  ink: '#000000',
  paper: '#FFFFFF',
  faint: '#6B6B6B', // secondary text; still readable on 16-level grayscale panels
};

export const font = {
  // Serif for card content (reads like paper), system sans for controls.
  reading: Platform.select({ android: 'serif', ios: 'Georgia', default: 'Georgia, serif' }),
  ui: Platform.select({ android: 'sans-serif', ios: 'System', default: 'system-ui, sans-serif' }),
};

export const size = {
  card: 26,
  body: 18,
  small: 15,
  tap: 56, // minimum touch target height
  pad: 20,
};
