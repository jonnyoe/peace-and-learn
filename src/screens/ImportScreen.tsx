import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';
import { cancel, Draft, generate, getEngine } from '../ai';
import {
  addSource, getConceptIndex, getSource, getSourcePages, getSources, nextUnfinishedRange, saveGenerated,
} from '../db';
import { looksScanned, pickFile, readBase64, readTextPages } from '../import/files';
import { estimate, pagesCovered, planParts, rangeLabel } from '../import/plan';
import PdfExtractor from '../import/PdfExtractor';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

type PdfJob = { base64: string; title: string };

// Keeps content above the iPhone keyboard. Dragging the list down closes the
// keyboard, and tapping anywhere that isn't a control or text box closes it too.
// The tap catcher has no pressed style, so nothing flashes on e-ink.
function KeyboardScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false} style={st.wrap}>
          {children}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
type DraftSource = { id: string; pages: number[]; label: string };

export default function ImportScreen({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const textBox = useRef<React.ComponentRef<typeof TextInput>>(null);

  // File import
  const [pdf, setPdf] = useState<PdfJob | null>(null);
  const [reading, setReading] = useState('');
  const [sources, setSources] = useState(getSources);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [range, setRange] = useState({ start: 1, end: 1 });

  const existing = getConceptIndex();
  const existingTitle = (key: string) => existing.find(c => c.id === key)?.title;
  const titleFor = (key: string) =>
    draft?.concepts.find(c => c.key === key)?.title ?? existingTitle(key) ?? key;
  const subject = domain.trim().toLowerCase();

  const failMessage = (e: any) => getEngine() === 'cloud'
    ? `Couldn't reach the server. ${e.message}`
    : `Couldn't generate cards. ${e.message}`;

  // ---------- Pasted text ----------
  async function run() {
    setBusy(true); setError(''); setStatus('Starting…');
    try {
      const g = await generate(text.trim(), subject, existing, setStatus);
      setDraft(g); setDraftSource(null); setRejected(new Set());
    } catch (e: any) {
      setError(failMessage(e));
    } finally { setBusy(false); setStatus(''); }
  }

  // ---------- File import ----------
  function openSource(id: string) {
    const r = nextUnfinishedRange(id, 5);
    setRange({ start: r.start, end: r.end });
    setSourceId(id); setError('');
  }

  function finishImport(title: string, kind: string, pages: string[]) {
    const id = addSource(title, kind, pages);
    setSources(getSources());
    openSource(id);
  }

  async function importFile() {
    setError('');
    try {
      const f = await pickFile();
      if (!f) return;
      if (f.kind === 'pdf') {
        setReading('Opening PDF…');
        setPdf({ base64: await readBase64(f.uri), title: f.title });
      } else {
        setReading('Reading file…');
        const pages = await readTextPages(f.uri);
        setReading('');
        if (!pages.length) { setError('That file is empty.'); return; }
        finishImport(f.title, f.kind, pages);
      }
    } catch (e: any) {
      setReading(''); setPdf(null);
      setError(`Couldn't import the file. ${e.message}`);
    }
  }

  function pdfDone(pages: string[], pageCount: number) {
    const job = pdf;
    setPdf(null); setReading('');
    if (!job) return;
    if (!pageCount) { setError('That PDF has no pages.'); return; }
    if (looksScanned(pages)) {
      setError('This looks like a scanned PDF: almost no text could be read from it. Scanned PDFs aren\'t supported yet.');
      return;
    }
    finishImport(job.title, 'pdf', pages);
  }

  function pdfError(message: string) {
    setPdf(null); setReading('');
    setError(message);
  }

  async function runSource() {
    if (!sourceId) return;
    const pages = getSourcePages(sourceId, range.start, range.end);
    const parts = planParts(pages);
    if (!parts.length) { setError('Those pages have no text. Pick other pages.'); return; }
    const label = rangeLabel(range.start, range.end);
    setBusy(true); setError(''); setStatus(`${label}: starting…`);
    try {
      const g = await generate(parts.map(p => p.text), subject, existing, setStatus, label);
      const covered = pagesCovered(pages, parts, g.partsCompleted);
      const coveredLabel = covered.length
        ? rangeLabel(covered[0], covered[covered.length - 1]) : 'No pages';
      setDraft(g); setRejected(new Set());
      setDraftSource({ id: sourceId, pages: covered, label: coveredLabel });
    } catch (e: any) {
      setError(failMessage(e));
    } finally { setBusy(false); setStatus(''); }
  }

  // ---------- Draft ----------
  function toggle(i: number) {
    const next = new Set(rejected);
    next.has(i) ? next.delete(i) : next.add(i);
    setRejected(next);
  }

  function save() {
    if (!draft) return;
    saveGenerated(draft, subject, i => !rejected.has(i),
      draftSource ? { id: draftSource.id, pages: draftSource.pages } : undefined);
    setDraft(null); setDraftSource(null); setSourceId(null);
    if (!draftSource) setText('');
    setSources(getSources());
    onSaved();
  }

  const busyRow = (
    <View style={st.busy}>
      <Text style={[s.body, { flex: 1 }]}>{status}</Text>
      {getEngine() === 'local' && <Button label="Stop" onPress={cancel} />}
    </View>
  );
  const errorBox = !!error && <Text style={[s.body, st.error]}>{error}</Text>;
  // On the main screen Return jumps to the paste box; elsewhere it closes the keyboard.
  const subjectInput = (next: boolean) => (
    <TextInput
      style={s.input}
      placeholder="Subject, e.g. philosophy"
      placeholderTextColor={color.faint}
      value={domain}
      onChangeText={setDomain}
      autoCapitalize="none"
      returnKeyType={next ? 'next' : 'done'}
      submitBehavior={next ? 'submit' : 'blurAndSubmit'}
      onSubmitEditing={() => (next ? textBox.current?.focus() : Keyboard.dismiss())}
    />
  );

  if (draft) {
    const kept = draft.cards.length - rejected.size;
    const links = draft.links.filter(l => existingTitle(l.from) || existingTitle(l.to));
    return (
      <ScrollView contentContainerStyle={st.wrap} keyboardDismissMode="interactive">
        <Text style={s.h1}>Review the draft</Text>
        <Text style={s.meta}>Tap a card to leave it out. Only kept cards go into your deck.</Text>

        {draft.stopped && (
          <View style={st.box}>
            <Text style={st.boxTitle}>Stopped early</Text>
            <Text style={s.body}>
              These are the cards from {draft.partsCompleted} of {draft.partsTotal} parts.
              {draftSource
                ? draftSource.pages.length
                  ? ` Saving marks ${draftSource.label.toLowerCase()} as done.`
                  : ' No page was finished, so none will be marked done.'
                : ''}
            </Text>
          </View>
        )}

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
          <Button label="Discard draft" onPress={() => { setDraft(null); setDraftSource(null); }} />
          <Button label={`Add ${kept} card${kept === 1 ? '' : 's'}`} filled disabled={!kept} onPress={save} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    );
  }

  const source = sourceId ? getSource(sourceId) : null;
  if (source) {
    const total = source.page_count;
    const pages = getSourcePages(source.id, range.start, range.end);
    const parts = planParts(pages);
    const chars = parts.reduce((n, p) => n + p.text.length, 0);
    const set = (start: number, end: number) => {
      start = Math.max(1, Math.min(start, total));
      end = Math.max(start, Math.min(end, total));
      setRange({ start, end });
    };
    const label = rangeLabel(range.start, range.end);
    return (
      <KeyboardScreen>
        <Text style={s.h1}>{source.title}</Text>
        <Text style={s.meta}>
          {source.kind.toUpperCase()} · {total} page{total === 1 ? '' : 's'} · {source.done_count} done
        </Text>

        {subjectInput(false)}

        <Stepper label="From page" value={range.start} disabled={busy}
          onMinus={() => set(range.start - 1, range.end)}
          onPlus={() => set(range.start + 1, Math.max(range.end, range.start + 1))} />
        <Stepper label="To page" value={range.end} disabled={busy}
          onMinus={() => set(Math.min(range.start, range.end - 1), range.end - 1)}
          onPlus={() => set(range.start, range.end + 1)} />

        <Text style={s.body}>
          {parts.length
            ? `${label}: ${chars.toLocaleString()} characters in ${parts.length} part${parts.length === 1 ? '' : 's'}, ${estimate(parts.length, getEngine())}.`
            : `${label} have no text.`}
        </Text>
        {pages.some(p => p.done) && (
          <Text style={s.meta}>Some of these pages are already done. Generating again adds new cards.</Text>
        )}

        {errorBox}
        {busy ? busyRow : (
          <View style={st.row}>
            <Button label="Back" onPress={() => { setSourceId(null); setError(''); setSources(getSources()); }} />
            <Button label={`Generate from ${label.toLowerCase()}`} filled style={{ flex: 1 }}
              disabled={!parts.length || !subject} onPress={() => { Keyboard.dismiss(); runSource(); }} />
          </View>
        )}
      </KeyboardScreen>
    );
  }

  return (
    <KeyboardScreen>
      {pdf && (
        <PdfExtractor
          base64={pdf.base64}
          onProgress={(p, n) => setReading(`Reading PDF… page ${p} of ${n}`)}
          onDone={pdfDone}
          onError={pdfError}
        />
      )}

      <Text style={s.h1}>Add material</Text>
      <Text style={s.meta}>Import a document or paste text. New ideas get linked to concepts already in your deck.</Text>

      {subjectInput(true)}

      {reading ? (
        <View style={st.busy}>
          <Text style={[s.body, { flex: 1 }]}>{reading}</Text>
          {pdf && <Button label="Cancel" onPress={() => { setPdf(null); setReading(''); }} />}
        </View>
      ) : (
        <Button label="Import file" onPress={importFile} disabled={busy} />
      )}
      <Text style={s.meta}>PDF, .txt or .md. PDFs need an internet connection to read.</Text>

      {sources.length > 0 && (
        <View style={st.sources}>
          <Text style={st.boxTitle}>Sources</Text>
          {sources.map(src => {
            const done = src.done_count >= src.page_count;
            return (
              <View key={src.id} style={st.sourceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.body} numberOfLines={2}>{src.title}</Text>
                  <Text style={s.meta}>
                    {done ? 'All ' : `${src.done_count} of `}{src.page_count} page{src.page_count === 1 ? '' : 's'} done
                  </Text>
                </View>
                <Button label={done ? 'Open' : 'Continue'} disabled={busy || !!reading} onPress={() => openSource(src.id)} />
              </View>
            );
          })}
        </View>
      )}

      <Text style={[st.boxTitle, { marginTop: 8 }]}>Or paste text</Text>
      {/* Above the text box so it stays reachable while the keyboard is open. */}
      {busy ? busyRow : (
        <Button label="Generate cards" filled disabled={!text.trim() || !subject}
          onPress={() => { Keyboard.dismiss(); run(); }} />
      )}
      {errorBox}
      <TextInput
        ref={textBox}
        style={[s.input, st.textArea]}
        placeholder="Paste text here"
        placeholderTextColor={color.faint}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
      />
    </KeyboardScreen>
  );
}

// Large −/+ buttons instead of a slider: easier to hit and nothing animates.
function Stepper({ label, value, onMinus, onPlus, disabled }: {
  label: string; value: number; onMinus: () => void; onPlus: () => void; disabled?: boolean;
}) {
  return (
    <View style={st.stepper}>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
      <Button label="−" onPress={onMinus} disabled={disabled} style={st.stepBtn} />
      <Text style={st.stepValue}>{value}</Text>
      <Button label="+" onPress={onPlus} disabled={disabled} style={st.stepBtn} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: size.pad, gap: 14 },
  textArea: { minHeight: 220 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.tap },
  error: { borderLeftWidth: 4, borderColor: color.ink, paddingLeft: 12 },
  box: { borderWidth: 2, borderColor: color.ink, borderRadius: 6, padding: 14, gap: 6 },
  boxTitle: { fontFamily: font.uiBold, fontSize: size.small, color: color.ink },
  card: { borderBottomWidth: 1, borderColor: color.ink, paddingVertical: 14, gap: 6 },
  cardOff: { borderColor: color.faint },
  front: { fontFamily: font.readingSemi, fontSize: 21, lineHeight: 30, color: color.ink },
  struck: { textDecorationLine: 'line-through', color: color.faint },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sources: { borderTopWidth: 2, borderColor: color.ink, paddingTop: 12, gap: 4 },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderColor: color.ink, paddingVertical: 10, minHeight: size.tap + 16,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { minWidth: size.tap, paddingHorizontal: 0 },
  stepValue: {
    fontFamily: font.reading, fontSize: 24, color: color.ink, minWidth: 56, textAlign: 'center',
  },
});
