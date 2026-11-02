import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { WebView as Web } from '../db';
import { Button, s as ui } from '../ui';
import { color, font, size } from '../theme';
import { InvalidProposal, proposeGroups, Stopped, stopOrganizing } from './ai';
import { MIN_MEMBERS, ProposedGroup } from './prompt';
import { applyOrganize } from './store';

// Organize a web (docs/knowledge-web-ai-growth.md, item 12). Asks the
// on-device model for groups, then shows them as a draft, like the card
// draft on the Add tab: rename a group, tap a bubble to take it out, or
// drop a group. Nothing changes until Apply.

type Draft = ProposedGroup & { key: number; dropped: boolean; removed: string[] };
type State =
  | { phase: 'running'; status: string }
  | { phase: 'error'; message: string }
  | { phase: 'draft'; groups: Draft[] };

export default function OrganizeView({ web, bottomInset, onApplied, onCancel }: {
  web: Web;
  bottomInset: number;
  onApplied: (groups: number) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<State>({ phase: 'running', status: 'Starting\u2026' });
  const live = useRef(true);
  const title = web.center?.title ?? web.title;
  const titleOf = new Map(web.nodes.map(n => [n.id, n.title]));

  function run() {
    setState({ phase: 'running', status: 'Starting\u2026' });
    const bubbles = web.nodes.map(n => ({ id: n.id, title: n.title, summary: n.summary }));
    proposeGroups(title, bubbles, status => { if (live.current) setState({ phase: 'running', status }); })
      .then(p => {
        if (!live.current) return;
        setState({ phase: 'draft', groups: p.groups.map((g, i) => ({ ...g, key: i, dropped: false, removed: [] })) });
      })
      .catch(e => {
        if (!live.current) return;
        if (e instanceof Stopped) { onCancel(); return; }
        const message = e instanceof InvalidProposal
          ? e.message + ' Try again, or pick a larger model on the Model tab.'
          : 'Couldn\'t organize this web. ' + (e?.message ?? String(e)) + ' Nothing was changed.';
        setState({ phase: 'error', message });
      });
  }

  useEffect(() => {
    live.current = true;
    run();
    return () => { live.current = false; stopOrganizing(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === 'running') {
    return (
      <View style={[st.wrap, st.center]}>
        <Text style={ui.h1}>Organizing {title}</Text>
        <Text style={ui.body}>The model on this device is grouping {web.nodes.length} bubbles. Nothing changes until you apply its suggestion.</Text>
        <Text style={[ui.meta, st.status]} accessibilityLiveRegion="polite">{state.status}</Text>
        <Button label="Stop" onPress={() => { stopOrganizing(); }} />
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={[st.wrap, st.center]}>
        <Text style={ui.h1}>Couldn't organize</Text>
        <Text style={[ui.body, st.error]}>{state.message}</Text>
        <View style={st.row}>
          <Button label="Back to web" onPress={onCancel} />
          <Button label="Try again" filled onPress={run} style={st.flex} />
        </View>
      </View>
    );
  }

  const groups = state.groups;
  const set = (key: number, patch: Partial<Draft>) =>
    setState({ phase: 'draft', groups: groups.map(g => (g.key === key ? { ...g, ...patch } : g)) });
  const kept = (g: Draft) => g.memberIds.filter(id => !g.removed.includes(id));
  const usable = groups.filter(g => !g.dropped && g.title.trim() && kept(g).length >= MIN_MEMBERS);
  const moved = usable.reduce((n, g) => n + kept(g).length, 0);
  const after = usable.length + web.nodes.length - moved;
  const left = web.nodes.filter(n => !usable.some(g => kept(g).includes(n.id)));

  function apply() {
    const n = applyOrganize(web.key, usable.map(g => ({ title: g.title.trim(), reason: g.reason, memberIds: kept(g) })));
    onApplied(n);
  }

  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[st.wrap, { paddingBottom: size.pad + bottomInset }]} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        <Text style={ui.h1}>Review the groups</Text>
        <Text style={ui.meta}>
          Rename a group, tap a bubble to leave it where it is, or drop a group. Nothing changes until you apply.
        </Text>

        {groups.map(g => {
          const k = kept(g);
          const tooSmall = !g.dropped && k.length < MIN_MEMBERS;
          return (
            <View key={g.key} style={[st.group, g.dropped && st.groupOff]}>
              {g.dropped ? (
                <Text style={[st.groupTitle, st.struck]}>{g.title}</Text>
              ) : (
                <TextInput
                  value={g.title}
                  onChangeText={t => set(g.key, { title: t })}
                  style={st.titleInput}
                  accessibilityLabel="Group title"
                  returnKeyType="done"
                  multiline
                  submitBehavior="blurAndSubmit"
                  maxLength={40}
                />
              )}
              {!!g.reason && <Text style={[ui.meta, g.dropped && st.struck]}>{g.reason}</Text>}
              {g.memberIds.map(id => {
                const off = g.dropped || g.removed.includes(id);
                return (
                  <Pressable
                    key={id}
                    disabled={g.dropped}
                    onPress={() => set(g.key, { removed: g.removed.includes(id) ? g.removed.filter(x => x !== id) : [...g.removed, id] })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !off }}
                    accessibilityHint={off ? 'Puts it back in the group' : 'Leaves it where it is'}
                    style={({ pressed }) => [st.member, pressed && st.pressed]}
                  >
                    {({ pressed }) => (
                      <Text style={[st.memberText, off && st.struck, pressed && st.inverse]}>
                        {titleOf.get(id) ?? id}{!g.dropped && off ? '  (stays)' : ''}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {tooSmall && <Text style={ui.meta}>A group needs at least {MIN_MEMBERS} bubbles, so this one will be skipped.</Text>}
              {!g.dropped && !g.title.trim() && <Text style={ui.meta}>Give this group a title, or it will be skipped.</Text>}
              <View style={st.groupButtons}>
                <Button label={g.dropped ? 'Keep group' : 'Drop group'} onPress={() => set(g.key, { dropped: !g.dropped })} />
              </View>
            </View>
          );
        })}

        {left.length > 0 && (
          <View style={st.leftBox}>
            <Text style={st.boxTitle}>Staying where they are ({left.length})</Text>
            <Text style={ui.body}>{left.map(n => n.title).join(', ')}</Text>
          </View>
        )}

        <Text style={ui.meta}>
          {usable.length
            ? 'After applying, this web shows ' + after + ' bubble' + (after === 1 ? '' : 's') + ' instead of ' + web.nodes.length + '. You can undo from the centre\'s long-press menu.'
            : 'No group will be made. Keep at least one group with ' + MIN_MEMBERS + ' or more bubbles.'}
        </Text>
        <View style={st.row}>
          <Button label="Discard" onPress={onCancel} />
          <Button label={usable.length ? 'Apply ' + usable.length + ' group' + (usable.length === 1 ? '' : 's') : 'Apply'}
            filled disabled={!usable.length} onPress={apply} style={st.flex} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { padding: size.pad, gap: 14 },
  center: { flex: 1, justifyContent: 'center' },
  status: { minHeight: 22 },
  error: { borderLeftWidth: 4, borderColor: color.ink, paddingLeft: 12 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  group: { borderWidth: 2, borderColor: color.ink, borderRadius: 8, padding: 14, gap: 6, backgroundColor: color.panel },
  groupOff: { borderColor: color.fadedBorder, borderStyle: 'dashed', backgroundColor: color.paper },
  groupTitle: { fontFamily: font.readingSemi, fontSize: 22, lineHeight: 30, color: color.ink },
  titleInput: {
    fontFamily: font.readingSemi, fontSize: 22, color: color.ink, minHeight: 48,
    borderBottomWidth: 1.5, borderColor: color.ink, paddingVertical: 4,
  },
  member: { minHeight: 44, justifyContent: 'center', borderTopWidth: 1, borderColor: color.divider, marginHorizontal: -14, paddingHorizontal: 14 },
  pressed: { backgroundColor: color.ink },
  memberText: { fontFamily: font.reading, fontSize: size.body, color: color.ink },
  inverse: { color: color.panel },
  struck: { textDecorationLine: 'line-through', color: color.faint },
  groupButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  leftBox: { borderTopWidth: 2, borderColor: color.ink, paddingTop: 10, gap: 4 },
  boxTitle: { fontFamily: font.uiBold, fontSize: size.small, color: color.ink },
});
