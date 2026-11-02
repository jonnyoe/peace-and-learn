import React, { useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Animated, Easing, LayoutChangeEvent,
} from 'react-native';
import { getWeb, getWebLooks, WebKey } from '../db';
import WebCanvas from '../web/WebCanvas';
import TodoPanel from '../web/TodoPanel';
import { useStudySession } from '../study/useStudySession';
import { SessionSummary, StudyCardView } from '../study/StudyCard';
import { Pill } from '../ui';
import { color, font, size } from '../theme';

// The home of each subject (spec section 4a): breadcrumb, title, the web
// and its to-do panel. Tapping the centre starts study mode (4b): the panel
// goes away, the web shrinks to the top and a flashcard appears below it.

const STUDY_SCALE = 0.6;

type Props = { webKey: WebKey; onOpen: (key: WebKey) => void; onHome: () => void };

// A fresh screen (and study session) for every web.
export default function WebScreen(props: Props) {
  return <WebScreenFor key={props.webKey.domain + '/' + (props.webKey.parentId ?? '')} {...props} />;
}

function WebScreenFor({ webKey, onOpen, onHome }: Props) {
  const web = getWeb(webKey);
  const session = useStudySession(webKey);
  const studying = session.phase !== 'off';

  // Size of the full web, measured before study starts. While studying (and
  // while growing back) the web is drawn at that size and scaled down, so
  // it isn't laid out again on every frame.
  const [full, setFull] = useState<{ w: number; h: number } | null>(null);
  const [shrunk, setShrunk] = useState(false);
  const t = useRef(new Animated.Value(0)).current;

  if (!web) {
    return (
      <View style={st.center}>
        <Text style={st.title}>This subject is gone</Text>
        <Crumb label="Back to subjects" onPress={onHome} first />
      </View>
    );
  }

  // Read fresh on every render, so a rating in study mode shows at once.
  const looks = getWebLooks(web);
  if (web.center && looks[web.center.id]) looks.center = looks[web.center.id];

  const byId = new Map(web.nodes.map(n => [n.id, n]));
  // Tapping a bubble with its own web zooms into it. Bubbles without one
  // do nothing yet; the "+N more" bubble neither (organising big webs comes later).
  function pressNode(id: string) {
    if (studying) return;
    const n = byId.get(id);
    if (n && n.childCount > 0) onOpen({ domain: web!.key.domain, parentId: n.id });
  }

  function animate(to: number, done?: () => void) {
    Animated.timing(t, {
      toValue: to, duration: 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: false,
    }).start(done);
  }

  function startStudy() {
    if (!full) return;
    session.start();
    setShrunk(true);
    animate(1);
  }

  function backToWeb() {
    session.close();
    animate(0, () => setShrunk(false));
  }

  // Nothing rated yet: just go back. Otherwise show what grew.
  function endSession() {
    if (session.reviewed === 0) backToWeb(); else session.end();
  }

  function measure(e: LayoutChangeEvent) {
    if (shrunk) return;
    const { width, height } = e.nativeEvent.layout;
    if (!full || full.w !== width || full.h !== height) setFull({ w: width, h: height });
  }

  // A new to-do can link to the centre or any bubble around it; the centre
  // is preselected.
  const linkChoices = [web.center, ...web.nodes]
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map(n => ({ id: n.id, title: n.title }));

  // The bubble holding the current card gets a dashed ring.
  const anchor = session.card?.anchor_id ?? null;
  const ringId = anchor && anchor === web.center?.id ? 'center' : anchor;

  const animated = shrunk && full;
  const outerStyle = animated
    ? [st.canvasBox, { height: t.interpolate({ inputRange: [0, 1], outputRange: [full.h, full.h * STUDY_SCALE] }) }]
    : [st.canvasBox, st.grow];
  const innerStyle = animated
    ? {
      position: 'absolute' as const, left: 0, top: 0, width: full.w, height: full.h,
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -full.h * (1 - STUDY_SCALE) / 2] }) },
        { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, STUDY_SCALE] }) },
      ],
    }
    : st.grow;

  return (
    <KeyboardAvoidingView style={st.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.header}>
        <View style={st.crumbs}>
          <Crumb label={web.category ?? 'Subjects'} onPress={onHome} first />
          {web.breadcrumb.map(b => (
            <React.Fragment key={b.key.parentId ?? 'top'}>
              <Text style={st.sep}>›</Text>
              <Crumb label={b.title} onPress={() => onOpen(b.key)} />
            </React.Fragment>
          ))}
        </View>
        <View style={st.titleRow}>
          <Text style={[st.title, st.titleText]} numberOfLines={2}>{web.title}</Text>
          {session.phase === 'card' && <Pill label="End session" onPress={endSession} />}
        </View>
      </View>

      <Animated.View style={outerStyle} onLayout={measure}>
        <Animated.View style={innerStyle}>
          <WebCanvas
            centerTitle={web.center?.title ?? web.title}
            nodes={web.nodes}
            edges={web.edges}
            centerHint={studying ? 'STUDYING' : 'TAP TO STUDY'}
            onPressCenter={studying ? undefined : startStudy}
            onPressNode={pressNode}
            ringId={ringId}
            looks={looks}
          />
        </Animated.View>
      </Animated.View>

      {session.phase === 'card' && session.card && (
        <StudyCardView
          key={session.index}
          card={session.card}
          index={session.index}
          total={session.total}
          revealed={session.revealed}
          onReveal={session.reveal}
          onRate={session.rate}
        />
      )}
      {session.phase === 'summary' && (
        <SessionSummary reviewed={session.reviewed} grew={session.grew} empty={session.empty} onBack={backToWeb} />
      )}

      {!studying && (
        <>
          {/* Fills the gap while the web grows back after a session. */}
          {shrunk && <View style={st.grow} />}
          {!web.nodes.length && (
            <Text style={st.empty}>No bubbles here yet. Material you add to this subject shows up around the centre.</Text>
          )}
          <TodoPanel
            webKey={web.key}
            webTitle={web.title}
            bubbles={linkChoices}
            defaultLinkId={web.center?.id ?? null}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Crumb({ label, onPress, first }: { label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={st.crumb}>
      <Text style={st.crumbText}>{first ? '\u2039  ' : ''}{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper },
  header: { paddingHorizontal: size.pad, paddingTop: 12 },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', minHeight: 44 },
  crumb: { minHeight: 44, justifyContent: 'center' },
  crumbText: { fontFamily: font.ui, fontSize: size.small, color: color.faint },
  sep: { fontFamily: font.ui, fontSize: size.small, color: color.faint, marginHorizontal: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { flex: 1 },
  title: { fontFamily: font.readingBold, fontSize: 32, lineHeight: 40, color: color.ink },
  canvasBox: { marginTop: 4, marginBottom: 8 },
  grow: { flex: 1 },
  empty: { fontFamily: font.ui, fontSize: size.small, color: color.faint, textAlign: 'center', paddingHorizontal: size.pad, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: size.pad },
});
