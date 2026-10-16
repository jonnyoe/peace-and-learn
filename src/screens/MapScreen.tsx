import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { getDomains, getGraph, setDomainWeight } from '../db';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

export default function MapScreen() {
  const [, refresh] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const { concepts, links, cardCounts } = getGraph();
  const domains = getDomains();
  const totalWeight = domains.reduce((t, d) => t + d.target_weight, 0) || 1;
  const title = (id: string) => concepts.find(c => c.id === id)?.title ?? '?';

  if (!concepts.length) {
    return (
      <View style={st.center}>
        <Text style={s.h1}>Your map is empty</Text>
        <Text style={[s.body, { textAlign: 'center' }]}>Add material and the concepts you learn will appear here, linked to each other.</Text>
      </View>
    );
  }

  function bump(name: string, w: number) {
    setDomainWeight(name, w);
    refresh(n => n + 1);
  }

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Text style={s.h1}>Balance</Text>
      <Text style={s.meta}>How each subject is weighted in your daily mix.</Text>
      {domains.map(d => (
        <View key={d.name} style={st.domainRow}>
          <Text style={[s.body, { flex: 1 }]}>{d.name}</Text>
          <Text style={[s.body, st.pct]}>{Math.round((d.target_weight / totalWeight) * 100)}%</Text>
          <Button label="−" onPress={() => bump(d.name, d.target_weight - 1)} style={st.step} />
          <Button label="+" onPress={() => bump(d.name, d.target_weight + 1)} style={st.step} />
        </View>
      ))}

      <Text style={[s.h1, { marginTop: 24 }]}>Knowledge map</Text>
      <Text style={s.meta}>{concepts.length} concepts, {links.length} connections. Tap a concept to see how it fits.</Text>

      {domains.map(d => {
        const inDomain = concepts.filter(c => c.domain === d.name);
        if (!inDomain.length) return null;
        return (
          <View key={d.name} style={st.section}>
            <Text style={st.sectionTitle}>{d.name}</Text>
            {inDomain.map(c => {
              const open = openId === c.id;
              const buildsOn = links.filter(l => l.type === 'prerequisite' && l.to_id === c.id).map(l => l.from_id);
              const leadsTo = links.filter(l => l.type === 'prerequisite' && l.from_id === c.id).map(l => l.to_id);
              const related = links.filter(l => l.type === 'related' && (l.from_id === c.id || l.to_id === c.id))
                .map(l => (l.from_id === c.id ? l.to_id : l.from_id));
              const degree = buildsOn.length + leadsTo.length + related.length;
              return (
                <Pressable key={c.id} onPress={() => setOpenId(open ? null : c.id)} style={st.concept}>
                  <View style={st.conceptHead}>
                    <Text style={st.conceptTitle}>{c.title}</Text>
                    <Text style={s.meta}>{cardCounts[c.id] ?? 0} cards, {degree} links</Text>
                  </View>
                  {open && (
                    <View style={st.detail}>
                      {!!c.summary && <Text style={s.body}>{c.summary}</Text>}
                      <LinkList label="Builds on" ids={buildsOn} title={title} onJump={setOpenId} />
                      <LinkList label="Leads to" ids={leadsTo} title={title} onJump={setOpenId} />
                      <LinkList label="Related" ids={related} title={title} onJump={setOpenId} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function LinkList({ label, ids, title, onJump }: {
  label: string; ids: string[]; title: (id: string) => string; onJump: (id: string) => void;
}) {
  if (!ids.length) return null;
  return (
    <View style={st.linkRow}>
      <Text style={st.linkLabel}>{label}</Text>
      <View style={st.chips}>
        {ids.map(id => (
          <Pressable key={id} onPress={() => onJump(id)} style={st.chip}>
            <Text style={st.chipText}>{title(id)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: size.pad, gap: 10, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: size.pad, gap: 12 },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pct: { width: 56, textAlign: 'right' },
  step: { width: size.tap, paddingHorizontal: 0 },
  section: { marginTop: 14 },
  sectionTitle: { fontFamily: font.ui, fontSize: size.small, fontWeight: '700', color: color.ink, borderBottomWidth: 2, borderColor: color.ink, paddingBottom: 6 },
  concept: { borderBottomWidth: 1, borderColor: color.ink, paddingVertical: 14 },
  conceptHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  conceptTitle: { fontFamily: font.reading, fontSize: 20, color: color.ink, flex: 1 },
  detail: { marginTop: 10, gap: 10 },
  linkRow: { gap: 6 },
  linkLabel: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: color.ink, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12 },
  chipText: { fontFamily: font.reading, fontSize: 16, color: color.ink },
});
