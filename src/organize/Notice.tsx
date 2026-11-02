import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pill } from '../ui';
import { color, font, size } from '../theme';

// A one-line note above the web: the Organize suggestion for a crowded web,
// or what an organize just did. No animation.

export default function Notice({ text, action, onAction, onClose, closeLabel = 'Not now' }: {
  text: string;
  action?: string;
  onAction?: () => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <View style={st.box} accessibilityLiveRegion="polite">
      <Text style={st.text}>{text}</Text>
      <View style={st.row}>
        <Pill label={closeLabel} onPress={onClose} />
        {action && onAction && <Pill label={action} selected onPress={onAction} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    marginHorizontal: size.pad, marginTop: 6, padding: 12, gap: 10,
    borderWidth: 1.5, borderColor: color.ink, borderRadius: 10, backgroundColor: color.panel,
  },
  text: { fontFamily: font.ui, fontSize: 16, lineHeight: 22, color: color.ink },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
