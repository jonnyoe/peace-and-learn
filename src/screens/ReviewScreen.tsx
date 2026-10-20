import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Grade } from 'ts-fsrs';
import { countCards, getAllCards, getDueCards, getDomains, saveReview, StudyCard } from '../db';
import { buildPracticeSession, buildSession, rate, Rating } from '../scheduler';
import { Button, s } from '../ui';
import { color, font, size } from '../theme';

const GRADES: { label: string; grade: Grade }[] = [
  { label: 'Again', grade: Rating.Again },
  { label: 'Hard', grade: Rating.Hard },
  { label: 'Good', grade: Rating.Good },
  { label: 'Easy', grade: Rating.Easy },
];

type Mode = 'due' | 'practice';

export default function ReviewScreen({ onGoImport }: { onGoImport: () => void }) {
  const [mode, setMode] = useState<Mode>('due');
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [total, setTotal] = useState(countCards);

  const load = useCallback(() => {
    setMode('due');
    setQueue(buildSession(getDueCards(), getDomains()));
    setRevealed(false);
    setDoneCount(0);
    setTotal(countCards());
  }, []);

  useEffect(load, [load]);

  // Practice: every card, interleaved by subject weight. Nothing is saved.
  function startPractice() {
    setMode('practice');
    setQueue(buildPracticeSession(getAllCards(), getDomains()));
    setRevealed(false);
    setDoneCount(0);
  }

  const practice = mode === 'practice';
  const card = queue[0];

  function grade(g: Grade) {
    const rest = queue.slice(1);
    setDoneCount(n => n + 1);
    setRevealed(false);
    if (practice) {
      // No saveReview, no FSRS change. "Again" still comes back this session.
      setQueue(g === Rating.Again ? [...rest, card] : rest);
      return;
    }
    const next = rate(card, g);
    saveReview(card.id, next, g);
    // "Again" cards come back within minutes; requeue them at the end if due soon.
    const comingBack = next.due.getTime() - Date.now() < 10 * 60 * 1000;
    setQueue(comingBack ? [...rest, { ...card, fsrs: next }] : rest);
  }

  const practiceBar = practice && (
    <View style={st.practiceBar}>
      <Text style={st.practiceLabel}>Practice — progress not saved</Text>
      <Button label="Exit practice" onPress={load} style={st.small} />
    </View>
  );

  if (!card) {
    return (
      <View style={st.wrap}>
        {practiceBar}
        <View style={st.center}>
          <Text style={s.h1}>
            {practice ? 'Practice complete' : doneCount ? 'Session complete' : 'Nothing due'}
          </Text>
          <Text style={[s.body, st.centerText]}>
            {practice
              ? `You practised ${doneCount} card${doneCount === 1 ? '' : 's'}. Nothing was saved.`
              : doneCount
                ? `You reviewed ${doneCount} card${doneCount === 1 ? '' : 's'}.`
                : total
                  ? 'No cards are due. Practise to go over them anyway without changing your schedule.'
                  : 'Add material to grow your deck, or check back later.'}
          </Text>
          {total > 0 && (
            <Button label={practice ? 'Practice again' : 'Practice all cards'} filled onPress={startPractice} />
          )}
          <View style={st.row}>
            <Button label="Add material" onPress={onGoImport} />
            {!practice && <Button label="Check again" onPress={load} />}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      {practice ? practiceBar : (
        <View style={st.topRow}>
          <Button label="Practice all cards" onPress={startPractice} style={st.small} />
        </View>
      )}

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
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  // Secondary control: smaller than the main buttons but still a 44 pt target.
  small: { minHeight: 44, paddingHorizontal: 12 },
  practiceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, borderColor: color.ink, borderRadius: 6, paddingVertical: 6, paddingLeft: 12, paddingRight: 6,
  },
  practiceLabel: { flex: 1, fontFamily: font.uiBold, fontSize: size.small, color: color.ink },
  card: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  front: { fontFamily: font.reading, fontSize: size.card, lineHeight: 38, color: color.ink },
  back: { fontFamily: font.reading, fontSize: 22, lineHeight: 33, color: color.ink },
  rule: { height: 2, backgroundColor: color.ink, marginVertical: 24, width: 64 },
  grades: { flexDirection: 'row', gap: 10 },
  grade: { flex: 1, paddingHorizontal: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  centerText: { textAlign: 'center', maxWidth: 420 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
