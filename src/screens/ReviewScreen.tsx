import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Grade } from 'ts-fsrs';
import { getDueCards, getDomains, saveReview, StudyCard } from '../db';
import { buildSession, rate, Rating } from '../scheduler';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

const GRADES: { label: string; grade: Grade }[] = [
  { label: 'Again', grade: Rating.Again },
  { label: 'Hard', grade: Rating.Hard },
  { label: 'Good', grade: Rating.Good },
  { label: 'Easy', grade: Rating.Easy },
];

export default function ReviewScreen({ onGoImport }: { onGoImport: () => void }) {
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const load = useCallback(() => {
    setQueue(buildSession(getDueCards(), getDomains()));
    setRevealed(false);
  }, []);

  useEffect(load, [load]);

  const card = queue[0];

  function grade(g: Grade) {
    const next = rate(card, g);
    saveReview(card.id, next, g);
    setDoneCount(n => n + 1);
    // "Again" cards come back within minutes; requeue them at the end if due soon.
    const rest = queue.slice(1);
    const comingBack = next.due.getTime() - Date.now() < 10 * 60 * 1000;
    setQueue(comingBack ? [...rest, { ...card, fsrs: next }] : rest);
    setRevealed(false);
  }

  if (!card) {
    return (
      <View style={st.center}>
        <Text style={s.h1}>{doneCount ? 'Session complete' : 'Nothing due'}</Text>
        <Text style={[s.body, st.centerText]}>
          {doneCount
            ? `You reviewed ${doneCount} card${doneCount === 1 ? '' : 's'}.`
            : 'Add material to grow your deck, or check back later.'}
        </Text>
        <View style={st.row}>
          <Button label="Add material" onPress={onGoImport} />
          <Button label="Check again" onPress={load} />
        </View>
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <View style={st.metaRow}>
        <Text style={s.meta}>{card.domain}  /  {card.concept_title}</Text>
        <Text style={s.meta}>{queue.length} left</Text>
      </View>

      <View style={st.card}>
        <Text style={st.front}>{card.front}</Text>
        {revealed && (
          <>
            <View style={st.rule} />
            <Text style={st.back}>{card.back}</Text>
          </>
        )}
      </View>

      {revealed ? (
        <View style={st.grades}>
          {GRADES.map(g => (
            <Button key={g.label} label={g.label} onPress={() => grade(g.grade)} style={st.grade} />
          ))}
        </View>
      ) : (
        <Button label="Show answer" filled onPress={() => setRevealed(true)} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: size.pad, gap: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  front: { fontFamily: font.reading, fontSize: size.card, lineHeight: 38, color: color.ink },
  back: { fontFamily: font.reading, fontSize: 22, lineHeight: 33, color: color.ink },
  rule: { height: 2, backgroundColor: color.ink, marginVertical: 24, width: 64 },
  grades: { flexDirection: 'row', gap: 10 },
  grade: { flex: 1, paddingHorizontal: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: size.pad, gap: 16 },
  centerText: { textAlign: 'center', maxWidth: 420 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
