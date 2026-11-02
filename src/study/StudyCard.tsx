import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Grade, Rating } from 'ts-fsrs';
import { WebStudyCard } from '../db';
import { color, font, size } from '../theme';

// The flashcard under the shrunken web (spec section 4b, mockups 2-4) and
// the card shown when the session ends.

type Look = { box: ViewStyle; text: TextStyle; pressedBox: ViewStyle; pressedText: TextStyle };
const inverted = { pressedBox: { backgroundColor: color.ink, borderColor: color.ink }, pressedText: { color: color.panel } };

// Forgot: light grey, grey text, solid grey border. Hard: solid black.
// Medium: white with a dashed black border. Easy: white, solid black border.
const GRADES: { label: string; grade: Grade; look: Look }[] = [
  { label: 'Forgot', grade: Rating.Again, look: {
    box: { backgroundColor: color.divider, borderColor: color.fadedBorder }, text: { color: color.faint }, ...inverted } },
  { label: 'Hard', grade: Rating.Hard, look: {
    box: { backgroundColor: color.ink, borderColor: color.ink }, text: { color: color.panel },
    pressedBox: { backgroundColor: color.panel, borderColor: color.ink }, pressedText: { color: color.ink } } },
  { label: 'Medium', grade: Rating.Good, look: {
    box: { backgroundColor: color.panel, borderColor: color.ink, borderStyle: 'dashed' }, text: { color: color.ink }, ...inverted } },
  { label: 'Easy', grade: Rating.Easy, look: {
    box: { backgroundColor: color.panel, borderColor: color.ink }, text: { color: color.ink }, ...inverted } },
];

export function StudyCardView({ card, index, total, revealed, onReveal, onRate }: {
  card: WebStudyCard; index: number; total: number; revealed: boolean;
  onReveal: () => void; onRate: (g: Grade) => void;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.meta}>
        <Text style={st.count}>{'Card ' + (index + 1) + ' of ' + total}</Text>
        <View style={st.tag}><Text style={st.tagText} numberOfLines={1}>{card.concept_title}</Text></View>
      </View>

      <View style={st.card}>
        <ScrollView contentContainerStyle={st.cardBody}>
          <Text style={st.front} accessibilityRole="header">{card.front}</Text>
          {revealed && (
            <>
              <Svg height={2} width="100%" style={st.divider}>
                <Line x1="0" y1="1" x2="100%" y2="1" stroke={color.fadedBorder} strokeWidth={1} strokeDasharray="4 4" />
              </Svg>
              <Text style={st.back}>{card.back}</Text>
            </>
          )}
        </ScrollView>
        {!revealed && <Text style={st.hint}>Say or write your answer, then check it.</Text>}
      </View>

      {revealed ? (
        <View>
          <Text style={st.ask}>How well did you know it?</Text>
          <View style={st.grades}>
            {GRADES.map(g => (
              <Pressable
                key={g.label}
                onPress={() => onRate(g.grade)}
                accessibilityRole="button"
                accessibilityLabel={g.label}
                style={({ pressed }) => [st.grade, g.look.box, pressed && g.look.pressedBox]}
              >
                {({ pressed }) => <Text style={[st.gradeText, g.look.text, pressed && g.look.pressedText]}>{g.label}</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <BigButton label="Show answer" onPress={onReveal} />
      )}
    </View>
  );
}

export function SessionSummary({ reviewed, grew, empty, onBack }: {
  reviewed: number; grew: { id: string; title: string }[]; empty: boolean; onBack: () => void;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.card}>
        <ScrollView contentContainerStyle={st.cardBody}>
          <Text style={st.front} accessibilityRole="header">{empty ? 'No cards here yet' : 'Session complete'}</Text>
          <Text style={st.summaryLine}>
            {empty
              ? 'Add material to this subject, then come back to study it.'
              : 'You went over ' + reviewed + ' card' + (reviewed === 1 ? '' : 's') + '.'}
          </Text>
          {!empty && (grew.length ? (
            <>
              <Text style={st.ask}>{grew.length === 1 ? 'This pattern grew' : 'These patterns grew'}</Text>
              {grew.map(g => <Text key={g.id} style={st.grewItem}>{g.title}</Text>)}
            </>
          ) : (
            <Text style={st.summaryNote}>No patterns grew this time. They grow as what you learn settles in over the days ahead.</Text>
          ))}
        </ScrollView>
      </View>
      <BigButton label="Back to the web" onPress={onBack} />
    </View>
  );
}

function BigButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.big, pressed && st.bigPressed]}
    >
      {({ pressed }) => <Text style={[st.bigText, pressed && st.bigTextPressed]}>{label}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: size.pad, paddingBottom: 12, gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  tag: {
    borderWidth: 1, borderColor: color.faint, borderRadius: 14, paddingHorizontal: 12,
    minHeight: 28, justifyContent: 'center', flexShrink: 1,
  },
  tagText: { fontFamily: font.ui, fontSize: 14, color: color.faint },
  card: {
    flex: 1, backgroundColor: color.panel, borderWidth: 1.5, borderColor: color.ink, borderRadius: 14,
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
  },
  cardBody: { flexGrow: 1 },
  front: { fontFamily: font.readingBold, fontSize: 24, lineHeight: 32, color: color.ink },
  divider: { marginVertical: 18 },
  back: { fontFamily: font.reading, fontSize: 19, lineHeight: 29, color: color.ink },
  hint: { fontFamily: font.ui, fontSize: size.small, color: color.faint, marginTop: 10 },
  ask: { fontFamily: font.ui, fontSize: size.small, color: color.faint, marginBottom: 8, marginTop: 4 },
  grades: { flexDirection: 'row', gap: 8 },
  grade: {
    flex: 1, minHeight: size.tap, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  gradeText: { fontFamily: font.ui, fontSize: 17 },
  big: { minHeight: size.tap, borderRadius: size.tap / 2, backgroundColor: color.ink, borderWidth: 1.5, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  bigPressed: { backgroundColor: color.panel },
  bigText: { fontFamily: font.uiMedium, fontSize: 18, color: color.panel },
  bigTextPressed: { color: color.ink },
  summaryLine: { fontFamily: font.reading, fontSize: 19, lineHeight: 29, color: color.ink, marginTop: 12, marginBottom: 14 },
  summaryNote: { fontFamily: font.reading, fontSize: 17, lineHeight: 26, color: color.faint },
  grewItem: { fontFamily: font.readingSemi, fontSize: 19, lineHeight: 30, color: color.ink },
});
