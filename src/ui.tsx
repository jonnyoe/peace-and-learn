import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { color, font, size } from './theme';

// No ripple, no opacity fades: e-ink shows those as ghosting.
// Pressed state is a hard invert, which refreshes cleanly.
export function Button({ label, onPress, filled, disabled, style }: {
  label: string; onPress: () => void; filled?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => {
        const dark = filled ? !pressed : pressed;
        return [s.btn, { backgroundColor: dark ? color.ink : color.paper }, disabled && s.disabled, style];
      }}
    >
      {({ pressed }) => {
        const dark = filled ? !pressed : pressed;
        return <Text style={[s.label, { color: dark ? color.paper : color.ink }]}>{label}</Text>;
      }}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  btn: {
    minHeight: size.tap,
    borderWidth: 2,
    borderColor: color.ink,
    borderRadius: 6,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { borderColor: color.faint },
  label: { fontFamily: font.ui, fontSize: size.body, fontWeight: '600' },
  h1: { fontFamily: font.reading, fontSize: 30, color: color.ink, marginBottom: 6 },
  body: { fontFamily: font.reading, fontSize: size.body, color: color.ink, lineHeight: 27 },
  meta: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  input: {
    borderWidth: 2,
    borderColor: color.ink,
    borderRadius: 6,
    padding: 14,
    fontFamily: font.reading,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.paper,
  },
});
