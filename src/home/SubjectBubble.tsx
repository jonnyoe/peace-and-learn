import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import Svg from 'react-native-svg';
import { HomeSubject } from '../db';
import { Bubble, Look } from '../web/WebCanvas';
import { fitLabel, PATTERN_REACH, PlacedNode } from '../web/layout';
import { PlacedSubject, R_HOME } from './layout';

// One subject on the Subjects screen: a web bubble (paper, ink outline,
// Literata label) with the subject's lace around it. It is drawn by the
// same Bubble as the webs, at R_HOME natural units, and scaled to its size.

const SIZES = [18, 17, 16, 15, 14, 13, 12]; // label sizes, natural units
const MIN_LABEL_PT = 12;                     // never smaller on screen
const HALF = R_HOME + PATTERN_REACH;         // drawing reaches this far from the middle

export default function SubjectBubble({ subject, at, still, onOpen, onMenu }: {
  subject: HomeSubject;
  at: PlacedSubject;
  still: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const scale = at.r / R_HOME;
  const node: PlacedNode = useMemo(() => {
    const min = Math.round((MIN_LABEL_PT / scale) * 10) / 10;
    const sizes = [...new Set(SIZES.map(s => Math.max(s, min)))];
    // The motif id, so a subject without a stored pattern keeps a steady one.
    return { id: subject.motifId, title: subject.title, x: 0, y: 0, r: R_HOME, label: fitLabel(subject.title, R_HOME, sizes) };
  }, [subject.motifId, subject.title, scale]);
  const look: Look = { lace: subject.lace, faded: subject.faded, recall: subject.recall, satellites: [], pattern: subject.pattern };

  const size = HALF * 2 * scale;
  const tap = Math.max(at.r, 22); // at least 44 pt across
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: at.x - size / 2, top: at.y - size / 2, width: size, height: size }}>
      <Svg width={size} height={size} viewBox={-HALF + ' ' + -HALF + ' ' + HALF * 2 + ' ' + HALF * 2}>
        <Bubble node={node} look={look} still={still} />
      </Svg>
      <Pressable
        onPress={onOpen}
        onLongPress={onMenu}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={subject.title + ', ' + subject.concepts + ' concept' + (subject.concepts === 1 ? '' : 's') +
          (subject.faded ? ', needs review' : '')}
        accessibilityHint="Opens its web. Long-press for options."
        accessibilityActions={[{ name: 'longpress', label: 'Options' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'longpress') onMenu(); }}
        style={{ position: 'absolute', left: size / 2 - tap, top: size / 2 - tap, width: tap * 2, height: tap * 2, borderRadius: tap }}
      />
    </View>
  );
}
