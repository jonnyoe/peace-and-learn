import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Button, s as ui } from '../ui';
import { color, font, size } from '../theme';

// Long-press menu for a web's centre bubble. A plain sheet with no slide or
// fade (e-ink friendly); tapping above it closes it.

export default function CenterMenu({ title, bubbles, canUndo, onOrganize, onUndo, onClose }: {
  title: string;
  bubbles: number;
  canUndo: boolean;
  onOrganize: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const enough = bubbles >= 3;
  return (
    <Modal transparent animationType="none" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={st.fill} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <View style={st.sheet}>
        <Text style={st.title} numberOfLines={2}>{title}</Text>
        <Text style={ui.meta}>{bubbles} bubble{bubbles === 1 ? '' : 's'} around the centre</Text>
        <View style={st.buttons}>
          <Button label="Organize" filled={enough} disabled={!enough} onPress={onOrganize} />
          {!enough && <Text style={ui.meta}>Organizing needs at least 3 bubbles.</Text>}
          {canUndo && <Button label="Undo organize" onPress={onUndo} />}
          <Button label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    backgroundColor: color.panel, borderTopWidth: 2, borderColor: color.ink,
    padding: size.pad, paddingBottom: size.pad + 16, gap: 12,
  },
  title: { fontFamily: font.readingSemi, fontSize: 24, lineHeight: 30, color: color.ink },
  buttons: { gap: 10, marginTop: 4 },
});
