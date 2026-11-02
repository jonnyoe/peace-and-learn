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
  label: { fontFamily: font.uiSemi, fontSize: size.body },
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
    backgroundColor: color.panel,
  },
});

// Rounded outline button as in the mockup. Pressed or selected is a hard
// invert (no opacity fades, which ghost on e-ink).
export function Pill({ label, onPress, selected, disabled, accessibilityLabel }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean; accessibilityLabel?: string;
}) {
  const isDark = (pressed: boolean) => !disabled && (selected ? !pressed : pressed);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [pill.pill, isDark(pressed) && pill.pillDark, disabled && pill.pillDisabled]}
    >
      {({ pressed }) => (
        <Text style={[pill.pillText, isDark(pressed) && pill.pillTextDark, disabled && pill.pillTextDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
}

const pill = StyleSheet.create({
  pill: {
    minHeight: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: color.ink,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.panel,
  },
  pillDark: { backgroundColor: color.ink },
  pillDisabled: { borderColor: color.fadedLine },
  pillText: { fontFamily: font.ui, fontSize: 16, color: color.ink },
  pillTextDark: { color: color.panel },
  pillTextDisabled: { color: color.fadedLine },
});
