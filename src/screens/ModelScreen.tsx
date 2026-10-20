import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { addSample, hasSample, removeSample, resetAllProgress, setSetting } from '../db';
import { getEngine, getModelId, Engine } from '../ai';
import { MODELS, ModelInfo } from '../ai/models';
import { cancelDownload, deleteModel, downloadModel, isDownloaded, unload } from '../ai/local';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

export default function ModelScreen() {
  const [engine, setEngineState] = useState<Engine>(getEngine());
  const [selected, setSelected] = useState(getModelId());
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{ id: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [sample, setSample] = useState(hasSample);
  const [sampleNote, setSampleNote] = useState('');

  function confirmRemoveSample() {
    setSampleNote('');
    Alert.alert(
      'Remove the Memory sample?',
      'Deletes the sample bubbles, their cards, review history and to-dos. Anything you added yourself stays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => {
            const n = removeSample();
            setSample(false);
            setSampleNote(`Sample removed (${n} bubble${n === 1 ? '' : 's'}).`);
          },
        },
      ],
    );
  }

  function putSampleBack() {
    addSample();
    setSample(true);
    setSampleNote('Sample added. It shows up as the "memory" subject.');
  }

  function confirmReset() {
    setResetNote('');
    Alert.alert(
      'Reset all progress?',
      'Every card becomes new and due now, and your review history is deleted. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: () => {
            const n = resetAllProgress();
            setResetNote(`Progress reset. ${n} card${n === 1 ? ' is' : 's are'} due now.`);
          },
        },
      ],
    );
  }

  async function refresh() {
    const entries = await Promise.all(MODELS.map(async m => [m.id, await isDownloaded(m)] as const));
    setHave(Object.fromEntries(entries));
  }
  useEffect(() => { refresh(); }, []);

  function chooseEngine(e: Engine) {
    setSetting('engine', e);
    setEngineState(e);
    if (e === 'cloud') unload(); // free the RAM
  }

  function choose(m: ModelInfo) {
    setSetting('model', m.id);
    setSelected(m.id);
    unload(); // next generation loads the newly chosen model
  }

  async function download(m: ModelInfo) {
    setError('');
    setProgress({ id: m.id, pct: 0 });
    try {
      // Updating every 1% keeps e-ink redraws to a minimum.
      await downloadModel(m, f => setProgress(p => {
        const pct = Math.floor(f * 100);
        return p && p.pct === pct ? p : { id: m.id, pct };
      }));
      if (!have[selected]) choose(m);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProgress(null);
      refresh();
    }
  }

  async function remove(m: ModelInfo) {
    await deleteModel(m);
    refresh();
  }

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Text style={s.h1}>Where cards are made</Text>
      <View style={st.segment}>
        {(['local', 'cloud'] as Engine[]).map(e => {
          const on = engine === e;
          return (
            <Pressable key={e} onPress={() => chooseEngine(e)} style={[st.segItem, on && st.segOn]}>
              <Text style={[st.segText, on && st.segTextOn]}>{e === 'local' ? 'On this device' : 'Server'}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.meta}>
        {engine === 'local'
          ? 'Your material never leaves the device and works offline. Slower, and cards are simpler than a large model makes.'
          : 'Sends material to your server, which uses Claude. Faster and better cards, but needs Wi-Fi.'}
      </Text>

      {engine === 'local' && (
        <>
          <Text style={[s.h1, { marginTop: 20 }]}>Models</Text>
          {!!error && <Text style={[s.body, st.error]}>{error}</Text>}
          {MODELS.map(m => {
            const downloaded = have[m.id];
            const inUse = selected === m.id && downloaded;
            const downloading = progress?.id === m.id;
            return (
              <View key={m.id} style={st.model}>
                <View style={st.modelHead}>
                  <Text style={st.modelName}>{m.name}{inUse ? '  (in use)' : ''}</Text>
                  <Text style={s.meta}>{m.sizeLabel}</Text>
                </View>
                <Text style={s.body}>{m.note}</Text>
                <Text style={s.meta}>Needs about {m.minRamGb} GB of RAM.</Text>
                <View style={st.actions}>
                  {downloading ? (
                    <>
                      <Text style={[s.body, { flex: 1 }]}>Downloading… {progress!.pct}%</Text>
                      <Button label="Cancel" onPress={cancelDownload} />
                    </>
                  ) : downloaded ? (
                    <>
                      {!inUse && <Button label="Use this model" filled onPress={() => choose(m)} />}
                      <Button label="Delete" onPress={() => remove(m)} />
                    </>
                  ) : (
                    <Button label={`Download ${m.sizeLabel}`} disabled={!!progress} onPress={() => download(m)} />
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      <View style={st.reset}>
        <Text style={s.h1}>Sample subject</Text>
        <Text style={s.body}>
          {sample
            ? 'The "Memory" sample shows how a knowledge web looks: nested webs, cards with some review history, and to-dos.'
            : 'Add the "Memory" sample to see how a knowledge web looks. You can remove it again here.'}
        </Text>
        {!!sampleNote && <Text style={[s.body, st.error]}>{sampleNote}</Text>}
        {sample
          ? <Button label="Remove sample" onPress={confirmRemoveSample} />
          : <Button label="Add sample" onPress={putSampleBack} />}
      </View>

      <View style={st.reset}>
        <Text style={s.h1}>Reset all progress</Text>
        <Text style={s.body}>
          Makes every card new and due today, and deletes your review history.
          Your cards, concepts, links and subjects stay.
        </Text>
        {!!resetNote && <Text style={[s.body, st.error]}>{resetNote}</Text>}
        <Button label="Reset all progress" onPress={confirmReset} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: size.pad, gap: 12, paddingBottom: 40 },
  segment: { flexDirection: 'row', borderWidth: 2, borderColor: color.ink, borderRadius: 6, overflow: 'hidden' },
  segItem: { flex: 1, minHeight: size.tap, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.ink },
  segText: { fontFamily: font.ui, fontSize: size.body, color: color.ink },
  segTextOn: { color: color.paper, fontFamily: font.uiBold },
  error: { borderLeftWidth: 4, borderColor: color.ink, paddingLeft: 12 },
  model: { borderBottomWidth: 1, borderColor: color.ink, paddingVertical: 16, gap: 6 },
  modelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  modelName: { fontFamily: font.readingSemi, fontSize: 21, color: color.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  reset: { borderTopWidth: 2, borderColor: color.ink, marginTop: 32, paddingTop: 20, gap: 12 },
});
