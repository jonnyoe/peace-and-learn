import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { getHomeSubjects, HomeSubject, WebKey } from '../db';
import { useReduceMotion } from '../web/WebCanvas';
import { layoutHome } from './layout';
import SubjectBubble from './SubjectBubble';
import SubjectMenu from './SubjectMenu';
import { color, font, size } from '../theme';

// The Subjects screen (Webs tab): every subject floats as a bubble, grouped
// by category, with its overall lace. Tap opens the web, long-press opens a
// menu. Nothing moves once it's shown; it only fades in when the screen
// opens. Everything for this screen lives in src/home.

const SIDE = 6;     // patterns may run almost to the screen edge
const FADE_MS = 450;

export default function HomeScreen({ onOpen }: { onOpen: (key: WebKey) => void }) {
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subjects = useMemo(() => getHomeSubjects(), [version]);
  const [width, setWidth] = useState(0);
  const [menuFor, setMenuFor] = useState<HomeSubject | null>(null);
  const still = useReduceMotion();

  const layout = useMemo(() => (width > 0
    ? layoutHome(subjects.map(s => ({ id: s.key.domain, category: s.category, concepts: s.concepts })), width - SIDE * 2)
    : null), [subjects, width]);

  // Gentle fade-in once, when the bubbles are first laid out.
  const fade = useRef(new Animated.Value(0)).current;
  const ready = !!layout;
  useEffect(() => {
    if (!ready) return;
    if (still) { fade.setValue(1); return; }
    const a = Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [ready, still, fade]);

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  }

  if (!subjects.length) {
    return (
      <View style={st.center}>
        <Text style={st.title}>No subjects yet</Text>
        <Text style={st.body}>Add material in the Add tab and each subject becomes a bubble here.</Text>
      </View>
    );
  }

  const byId = new Map(subjects.map(s => [s.key.domain, s]));
  return (
    <ScrollView style={st.root} contentContainerStyle={st.wrap}>
      <Text style={[st.title, st.heading]}>Subjects</Text>
      <View onLayout={onLayout} style={{ height: layout?.height ?? 0 }}>
        {layout && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
            {layout.labels.map(l => (
              <Text
                key={l.text}
                numberOfLines={1}
                accessibilityRole="header"
                style={[st.label, { left: SIDE + l.x - l.w / 2 - 20, top: l.y, width: l.w + 40 }]}
              >
                {l.text}
              </Text>
            ))}
            {layout.bubbles.map(b => {
              const s = byId.get(b.id)!;
              return (
                <SubjectBubble
                  key={b.id}
                  subject={s}
                  at={{ ...b, x: b.x + SIDE }}
                  still={still}
                  onOpen={() => onOpen(s.key)}
                  onMenu={() => setMenuFor(s)}
                />
              );
            })}
          </Animated.View>
        )}
      </View>
      {menuFor && (
        <SubjectMenu subject={menuFor} onClose={() => setMenuFor(null)} onChanged={() => setVersion(v => v + 1)} />
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  wrap: { paddingTop: 24, paddingBottom: 24 },
  heading: { paddingHorizontal: size.pad, marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: size.pad, backgroundColor: color.paper },
  title: { fontFamily: font.readingBold, fontSize: 32, lineHeight: 40, color: color.ink },
  body: { fontFamily: font.reading, fontSize: size.body, lineHeight: 27, color: color.ink, textAlign: 'center' },
  label: {
    position: 'absolute', textAlign: 'center',
    fontFamily: font.uiMedium, fontSize: 14, lineHeight: 20, letterSpacing: 0.4, color: color.faint,
  },
});
