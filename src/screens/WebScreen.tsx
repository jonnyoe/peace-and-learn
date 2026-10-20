import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { getWeb, WebKey } from '../db';
import WebCanvas from '../web/WebCanvas';
import { color, font, size } from '../theme';

// The home of each subject (spec section 4a): breadcrumb, title, the web.
// The to-do panel (step 4) and study mode (step 5) come later.
export default function WebScreen({ webKey, onOpen, onHome }: {
  webKey: WebKey;
  onOpen: (key: WebKey) => void;
  onHome: () => void;
}) {
  const web = getWeb(webKey);
  if (!web) {
    return (
      <View style={st.center}>
        <Text style={st.title}>This subject is gone</Text>
        <Crumb label="Back to subjects" onPress={onHome} first />
      </View>
    );
  }

  const byId = new Map(web.nodes.map(n => [n.id, n]));
  // Tapping a bubble with its own web zooms into it. Bubbles without one
  // do nothing yet; the "+N more" bubble neither (organising big webs comes later).
  function pressNode(id: string) {
    const n = byId.get(id);
    if (n && n.childCount > 0) onOpen({ domain: web!.key.domain, parentId: n.id });
  }

  return (
    <View style={st.wrap}>
      <View style={st.header}>
        <View style={st.crumbs}>
          <Crumb label={web.category ?? 'Subjects'} onPress={onHome} first />
          {web.breadcrumb.map(b => (
            <React.Fragment key={b.key.parentId ?? 'top'}>
              <Text style={st.sep}>›</Text>
              <Crumb label={b.title} onPress={() => onOpen(b.key)} />
            </React.Fragment>
          ))}
        </View>
        <Text style={st.title} numberOfLines={2}>{web.title}</Text>
      </View>

      <View style={st.canvas}>
        <WebCanvas
          centerTitle={web.center?.title ?? web.title}
          nodes={web.nodes}
          edges={web.edges}
          centerHint="TAP TO STUDY"
          onPressNode={pressNode}
        />
      </View>
      {!web.nodes.length && (
        <Text style={st.empty}>No bubbles here yet. Material you add to this subject shows up around the centre.</Text>
      )}
    </View>
  );
}

function Crumb({ label, onPress, first }: { label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={st.crumb}>
      <Text style={st.crumbText}>{first ? '\u2039  ' : ''}{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper },
  header: { paddingHorizontal: size.pad, paddingTop: 12 },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', minHeight: 44 },
  crumb: { minHeight: 44, justifyContent: 'center' },
  crumbText: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  sep: { fontFamily: font.ui, fontSize: size.small, color: color.faint, marginHorizontal: 6 },
  title: { fontFamily: font.readingBold, fontSize: 32, lineHeight: 40, color: color.ink },
  canvas: { flex: 1, marginTop: 4, marginBottom: 8 },
  empty: { fontFamily: font.ui, fontSize: size.small, color: color.faint, textAlign: 'center', paddingHorizontal: size.pad, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: size.pad },
});
