import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { getHome, WebKey } from '../db';
import { color, font, size } from '../theme';

// Every subject, grouped by category. A plain list for now. It only needs
// getHome() and onOpen(), so it can become a web of subjects later without
// touching the rest of the app.
export default function HomeScreen({ onOpen }: { onOpen: (key: WebKey) => void }) {
  const groups = getHome();

  if (!groups.length) {
    return (
      <View style={st.center}>
        <Text style={st.title}>No subjects yet</Text>
        <Text style={st.body}>Add material in the Add tab and each subject becomes a web here.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={st.root} contentContainerStyle={st.wrap}>
      <Text style={st.title}>Subjects</Text>
      {groups.map(g => (
        <View key={g.category ?? ''} style={st.group}>
          <Text style={st.groupTitle}>{(g.category ?? 'Other').toUpperCase()}</Text>
          {g.webs.map(w => (
            <Pressable
              key={w.key.domain}
              onPress={() => onOpen(w.key)}
              accessibilityRole="button"
              style={({ pressed }) => [st.row, pressed && st.rowPressed]}
            >
              {({ pressed }) => (
                <>
                  <Text style={[st.rowTitle, pressed && st.inverse]}>{w.title}</Text>
                  <Text style={[st.rowMeta, pressed && st.inverse]}>
                    {w.bubbles} bubble{w.bubbles === 1 ? '' : 's'}  ›
                  </Text>
                </>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  wrap: { padding: size.pad, paddingTop: 24, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: size.pad, backgroundColor: color.paper },
  title: { fontFamily: font.readingBold, fontSize: 32, lineHeight: 40, color: color.ink, marginBottom: 8 },
  body: { fontFamily: font.reading, fontSize: size.body, lineHeight: 27, color: color.ink, textAlign: 'center' },
  group: { backgroundColor: color.panel, borderWidth: 1, borderColor: color.divider, borderRadius: 14, paddingHorizontal: 16, paddingTop: 14, marginBottom: 12 },
  groupTitle: { fontFamily: font.uiMedium, fontSize: 13, letterSpacing: 1.2, color: color.faint, marginBottom: 4 },
  // Pressed is a hard invert: refreshes cleanly on e-ink.
  row: { flexDirection: 'row', alignItems: 'center', minHeight: size.tap, borderTopWidth: 1, borderColor: color.divider, marginHorizontal: -16, paddingHorizontal: 16 },
  rowPressed: { backgroundColor: color.ink },
  rowTitle: { flex: 1, fontFamily: font.readingSemi, fontSize: 20, color: color.ink },
  rowMeta: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  inverse: { color: color.panel },
});
