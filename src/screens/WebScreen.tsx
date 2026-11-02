import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Animated, Easing, LayoutChangeEvent,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWeb, getWebLooks, WebKey } from '../db';
import WebCanvas from '../web/WebCanvas';
import TodoPanel from '../web/TodoPanel';
import { useStudySession } from '../study/useStudySession';
import { SessionSummary, StudyCardView } from '../study/StudyCard';
import { color, font, size } from '../theme';

// The home of each subject (spec section 4a): breadcrumb, title, the web
// and its to-do panel. Tapping the centre starts study mode (4b): the panel
// goes away, the web shrinks to the top and a flashcard appears below it.

const STUDY_SCALE = 0.6;

type Props = {
  webKey: WebKey;
  onOpen: (key: WebKey) => void;
  onHome: () => void;
};

// Swipe from the left edge to go back one level (iOS style).
const EDGE = 28;        // the swipe must start this close to the left edge
const SWIPE_BACK = 70;  // and travel at least this far right

// A fresh screen (and study session) for every web.
export default function WebScreen(props: Props) {
  return <WebScreenFor key={props.webKey.domain + '/' + (props.webKey.parentId ?? '')} {...props} />;
}

function WebScreenFor({ webKey, onOpen, onHome }: Props) {
  const web = getWeb(webKey);
  const session = useStudySession(webKey);
  const studying = session.phase !== 'off';
  const insets = useSafeAreaInsets();

  // One level up: the parent web, or Subjects from a top-level web. Read
  // through a ref so the pan responder (created once) sees the latest.
  const up = useRef<() => void>(() => {});
  up.current = () => {
    if (studying || !web) return; // no swipe-back mid-session; End is the way out
    const parent = web.breadcrumb[web.breadcrumb.length - 1];
    if (parent) onOpen(parent.key); else onHome();
  };
  // Capture phase, so it wins over the web and lists, but only for a mostly
  // horizontal drag that starts at the left edge. Taps are never captured.
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) =>
      g.x0 < EDGE && g.dx > 12 && Math.abs(g.dy) < Math.abs(g.dx) * 0.6,
    onPanResponderRelease: (_, g) => { if (g.dx > SWIPE_BACK || g.vx > 0.5) up.current(); },
    onPanResponderTerminationRequest: () => false,
  })).current;

  // Size of the full web, measured before study starts. While studying (and
  // while growing back) the web is drawn at that size and scaled down, so
  // it isn't laid out again on every frame.
  const [full, setFull] = useState<{ w: number; h: number } | null>(null);
  const [shrunk, setShrunk] = useState(false);
  const t = useRef(new Animated.Value(0)).current;
  const animGen = useRef(0);
  const mounted = useRef(true);
  // Leaving the web (breadcrumb, Subjects, another tab) unmounts this screen,
  // which drops the session with it. Stop any running animation too.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; animGen.current++; t.stopAnimation(); };
  }, [t]);

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

  // Only the latest animation may finish. Starting a session while the web
  // is still growing back stops that animation, and its callback must not
  // then switch the web back to full size under the new session.
  function animate(to: number, done?: () => void) {
    const gen = ++animGen.current;
    t.stopAnimation();
    Animated.timing(t, {
      toValue: to, duration: 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && gen === animGen.current && mounted.current) done?.();
    });
  }

  function startStudy() {
    if (!full || session.phase !== 'off') return;
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
    ? [st.canvasBox, studying && st.canvasStudy, { height: t.interpolate({ inputRange: [0, 1], outputRange: [full.h, full.h * STUDY_SCALE] }) }]
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
    <KeyboardAvoidingView style={st.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} {...swipe.panHandlers}>
      {studying ? (
        // Compact header while studying: one short line, so the shrunken web
        // and the card get the room. End session is the way out.
        <View style={st.bar}>
          <Text style={[st.barTitle, st.titleText]} numberOfLines={1}>{web.title}</Text>
          {session.phase === 'card' && (
            <Pressable
              onPress={endSession}
              accessibilityRole="button"
              accessibilityLabel="End session"
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 12 }}
              style={st.barEnd}
            >
              {({ pressed }) => <Text style={[st.barEndText, pressed && st.barEndPressed]}>End</Text>}
            </Pressable>
          )}
        </View>
      ) : (
      <View style={st.header}>
        <View style={st.crumbs}>
          <Crumb label="Subjects" onPress={onHome} first />
          {web.breadcrumb.map(b => (
            <React.Fragment key={b.key.parentId ?? 'top'}>
              <Text style={st.sep}>›</Text>
              <Crumb label={b.title} onPress={() => onOpen(b.key)} />
            </React.Fragment>
          ))}
        </View>
        <Text style={st.title} numberOfLines={2}>{web.title}</Text>
      </View>
      )}

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
      {/* Keeps the rating buttons clear of the home indicator. */}
      {studying && <View style={{ height: insets.bottom }} />}

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
            bottomInset={insets.bottom}
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
  // Study mode: a thin bar instead of a heading. "End" is plain text; its
  // hitSlop keeps the touch area at 44 pt.
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: size.pad, paddingTop: 2, minHeight: 30 },
  barTitle: { fontFamily: font.readingSemi, fontSize: 16, lineHeight: 22, color: color.ink },
  barEnd: { minHeight: 28, justifyContent: 'center' },
  barEndText: { fontFamily: font.uiMedium, fontSize: 16, color: color.ink, textDecorationLine: 'underline' },
  barEndPressed: { color: color.faint },
  titleText: { flex: 1 },
  title: { fontFamily: font.readingBold, fontSize: 32, lineHeight: 40, color: color.ink },
  canvasBox: { marginTop: 4, marginBottom: 8 },
  canvasStudy: { marginTop: 0, marginBottom: 4 },
  grow: { flex: 1 },
  empty: { fontFamily: font.ui, fontSize: size.small, color: color.faint, textAlign: 'center', paddingHorizontal: size.pad, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: size.pad },
});
