import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { getCategories, HomeSubject, resetSubjectProgress, setSubjectCategory } from '../db';
import { Button, Pill, s as ui } from '../ui';
import { color, font, size } from '../theme';

// Long-press menu for a subject bubble: set its category, or reset its
// progress. A plain sheet with no slide or fade (e-ink friendly); tapping
// above it closes it.

export default function SubjectMenu({ subject, onClose, onChanged }: {
  subject: HomeSubject;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'menu' | 'category'>('menu');
  const [choice, setChoice] = useState<string | null>(subject.category);
  const [typed, setTyped] = useState('');
  const categories = getCategories();

  function saveCategory() {
    setSubjectCategory(subject.key.domain, typed.trim() || choice);
    onChanged();
    onClose();
  }

  function confirmReset() {
    const n = subject.cards;
    Alert.alert(
      'Reset ' + subject.title + '?',
      'Its ' + n + ' card' + (n === 1 ? '' : 's') + ' become new, its review history is cleared and its lace patterns ' +
        'go back to none. Other subjects keep their progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: () => {
            resetSubjectProgress(subject.key.domain);
            onChanged();
            onClose();
          },
        },
      ],
    );
  }

  return (
    <Modal transparent animationType="none" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={st.fill} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
        <View style={st.sheet}>
          <Text style={st.title} numberOfLines={2}>{subject.title}</Text>
          {mode === 'menu' ? (
            <>
              <Text style={ui.meta}>Category: {subject.category ?? 'Other'}</Text>
              <View style={st.buttons}>
                <Button label="Set category" onPress={() => setMode('category')} />
                <Button label="Reset this subject's progress" onPress={confirmReset} disabled={!subject.cards} />
                <Button label="Cancel" onPress={onClose} />
              </View>
            </>
          ) : (
            <>
              <Text style={ui.meta}>Choose a category, or type a new one.</Text>
              <View style={st.pills}>
                {categories.map(c => (
                  <Pill key={c} label={c} selected={!typed.trim() && choice === c} onPress={() => { setChoice(c); setTyped(''); }} />
                ))}
                <Pill label="Other" accessibilityLabel="Other (no category)" selected={!typed.trim() && choice === null}
                  onPress={() => { setChoice(null); setTyped(''); }} />
              </View>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder="New category"
                placeholderTextColor={color.faint}
                style={ui.input}
                returnKeyType="done"
                onSubmitEditing={saveCategory}
                autoCapitalize="words"
              />
              <View style={st.row}>
                <Button label="Back" onPress={() => setMode('menu')} style={st.half} />
                <Button label="Save" filled onPress={saveCategory} style={st.half} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
