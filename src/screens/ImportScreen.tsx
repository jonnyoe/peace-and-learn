import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import { cancel, generate, getEngine } from '../ai';
import { Generated, getConceptIndex, saveGenerated } from '../db';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

export default function ImportScreen({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [draft, setDraft] = useState<Generated | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const existing = getConceptIndex();
  const existingTitle = (key: string) => existing.find(c => c.id === key)?.title;
  const titleFor = (key: string) =>
    draft?.concepts.find(c => c.key === key)?.title ?? existingTitle(key) ?? key;

  async function run() {
    setBusy(true); setError(''); setStatus('Starting…');
    try {
      const g = await generate(text.trim(), domain.trim().toLowerCase(), existing, setStatus);
      setDraft(g); setRejected(new Set());
    } catch (e: any) {
      setError(getEngine() === 'cloud'
        ? `Couldn't reach the server. ${e.message}`
        : `Couldn't generate cards. ${e.message}`);
    } finally { setBusy(false); setStatus(''); }
  }

  function toggle(i: number) {
    const next = new Set(rejected);
    next.has(i) ? next.delete(i) : next.add(i);
    setRejected(next);
  }

  function save() {
    if (!draft) return;
    saveGenerated(draft, domain.trim().toLowerCase(), i => !rejected.has(i));
    setDraft(null); setText('');
    onSaved();
  }

  if (draft) {
    const kept = draft.cards.length - rejected.size;
    const links = draft.links.filter(l => existingTitle(l.from) || existingTitle(l.to));
    return (
      <ScrollView contentContainerStyle={st.wrap}>
        <Text style={s.h1}>Review the draft</Text>
        <Text style={s.meta}>Tap a card to leave it out. Only kept cards go into your deck.</Text>

        {links.length > 0 && (
          <View style={st.box}>
            <Text style={st.boxTitle}>Connects to what you already know</Text>
            {links.map((l, i) => (
              <Text key={i} style={s.body}>
                {titleFor(l.from)} {l.type === 'prerequisite' ? 'leads to' : 'relates to'} {titleFor(l.to)}
              </Text>
            ))}
          </View>
        )}

        {draft.cards.map((c, i) => {
          const off = rejected.has(i);
          return (
            <Pressable key={i} onPress={() => toggle(i)} style={[st.card, off && st.cardOff]}>
              <Text style={s.meta}>{titleFor(c.conceptKey)}{off ? '  (left out)' : ''}</Text>
              <Text style={[st.front, off && st.struck]}>{c.front}</Text>
              <Text style={[s.body, off && st.struck]}>{c.back}</Text>
            </Pressable>
          );
        })}

        <View style={st.row}>
          <Button label="Discard draft" onPress={() => setDraft(null)} />
          <Button label={`Add ${kept} card${kept === 1 ? '' : 's'}`} filled disabled={!kept} onPress={save} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Add material</Text>
      <Text style={s.meta}>Paste notes, a passage, or an article. New ideas get linked to concepts already in your deck.</Text>

      <TextInput
        style={s.input}
        placeholder="Subject, e.g. philosophy"
        placeholderTextColor={color.faint}
        value={domain}
        onChangeText={setDomain}
        autoCapitalize="none"
      />
      <TextInput
        style={[s.input, st.textArea]}
        placeholder="Paste text here"
        placeholderTextColor={color.faint}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
      />
      {!!error && <Text style={[s.body, st.error]}>{error}</Text>}
      {busy ? (
        <View style={st.busy}>
          <Text style={[s.body, { flex: 1 }]}>{status}</Text>
          {getEngine() === 'local' && <Button label="Stop" onPress={cancel} />}
        </View>
      ) : (
        <Button label="Generate cards" filled disabled={!text.trim() || !domain.trim()} onPress={run} />
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: size.pad, gap: 14 },
  textArea: { minHeight: 260 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.tap },
  error: { borderLeftWidth: 4, borderColor: color.ink, paddingLeft: 12 },
  box: { borderWidth: 2, borderColor: color.ink, borderRadius: 6, padding: 14, gap: 6 },
  boxTitle: { fontFamily: font.ui, fontSize: size.small, fontWeight: '700', color: color.ink },
  card: { borderBottomWidth: 1, borderColor: color.ink, paddingVertical: 14, gap: 6 },
  cardOff: { borderColor: color.faint },
  front: { fontFamily: font.reading, fontSize: 21, lineHeight: 30, color: color.ink, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: color.faint },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
