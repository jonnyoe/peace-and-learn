import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent, Animated, Easing, AccessibilityInfo } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { layoutWeb, PlacedNode } from './layout';
import {
  DASH, freshDashed, freshRange, LACE_GROW_MS, LaceLayer, motifFor, motifLayers, MotifPattern, PALE,
} from './motifs';
import { color, font } from '../theme';

// Draws one web: centre bubble, neighbours and straight strands (spec
// section 4a), with the derived visuals of sections 3 and 5: faded
// bubbles, lace layers drawn from each bubble's motif (motifs.ts),
// satellites and strand beads. When a bubble's lace gains a layer, the new
// layer fades in.
// The drawing is laid out in natural units and scaled to fit the space it
// gets, so the same code draws the full web and the small one in study mode.

export type CanvasNode = { id: string; title: string };

/** How a bubble looks. Missing: drawn plain (lace 0, not faded). */
export type Look = {
  lace: number;                    // 0 to 5
  faded: boolean;
  recall?: number | null;          // bubble's recall now; sets how fresh its lace ink is
  satellites: (number | null)[];   // recall of each bubble in its nested web
  pattern?: MotifPattern | null;   // lace motif; missing: one picked from the id
};

const INK_W = 1.1;     // lace line width (spec section 6)
const BEADS_FROM = 3;  // both ends need this lace level for strand beads
const PALE_DASH = '2.5 2.5'; // a fully pale lace layer is dashed
const MIN_LABEL_PT = 12;     // bubble labels never drawn smaller than this on screen

const AnimatedG = Animated.createAnimatedComponent(G);

// Reduce Motion on: new layers appear at once instead of fading in.
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

export default function WebCanvas({ centerTitle, nodes, edges, onPressCenter, onPressNode, ringId, looks, minLabelPt = MIN_LABEL_PT }: {
  centerTitle: string;
  nodes: CanvasNode[];
  edges: { from_id: string; to_id: string }[];
  onPressCenter?: () => void;
  onPressNode?: (id: string, hiddenIds?: string[]) => void;
  // Study mode: draw a dashed ring around this bubble ('center' for the
  // centre). A bubble folded into "+N more" rings that bubble instead.
  ringId?: string | null;
  looks?: Record<string, Look>; // by node id; 'center' for the centre
  // Smallest label size on screen. The small study-mode web passes 0, so
  // labels shrink to fit their bubbles instead of overflowing.
  minLabelPt?: number;
}) {
  const [area, setArea] = useState({ w: 0, h: 0 });
  const still = useReduceMotion();
  // Pass 1 places the bubbles; the scale that fills the area follows from
  // it. Pass 2 refits the labels so none is drawn under MIN_LABEL_PT on
  // screen (placement doesn't depend on labels, so the box is the same).
  const aspect = area.w && area.h ? Math.round((area.h / area.w) * 20) / 20 : 1.1;
  // The screen reads the web fresh on every render (new arrays each time),
  // so key the layout on its content: the same web keeps the same placed
  // bubbles, and unchanged bubbles skip re-rendering (Bubble is memoized).
  const shape = JSON.stringify([centerTitle, nodes.map(n => [n.id, n.title]), edges.map(e => [e.from_id, e.to_id])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => ({ centerTitle, nodes, edges }), [shape]);
  const geo = useMemo(() => layoutWeb(input, 0, aspect), [input, aspect]);
  const fit = area.w && area.h ? Math.min(area.w / geo.box.w, area.h / geo.box.h) : 0;
  const minFont = fit && minLabelPt ? Math.round((minLabelPt / fit) * 10) / 10 : 0;
  const web = useMemo(
    () => (minFont ? layoutWeb(input, minFont, aspect) : geo),
    [geo, minFont, input, aspect]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== area.w || height !== area.h) setArea({ w: width, h: height });
  };

  const ringed = !ringId ? null : ringId === 'center' ? web.center
    : web.nodes.find(n => n.id === ringId || n.hiddenIds?.includes(ringId)) ?? null;
  const lookOf = (id: string): Look | undefined => looks?.[id];
  const placed = new Map([web.center, ...web.nodes].map(n => [n.id, n]));

  const { box } = web;
  const scale = area.w && area.h ? Math.min(area.w / box.w, area.h / box.h) : 0;
  const w = box.w * scale, h = box.h * scale;
  // Screen position of a natural-units point, relative to this view.
  const left = (area.w - w) / 2, top = (area.h - h) / 2;
  const sx = (x: number) => left + (x - box.x) * scale;
  const sy = (y: number) => top + (y - box.y) * scale;

  return (
    <View style={st.fill} onLayout={onLayout}>
      {scale > 0 && (
        <>
          <Svg width={w} height={h} viewBox={box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h} style={{ position: 'absolute', left, top }}>
            {web.strands.map(s => {
              const a = placed.get(s.from)!, b = placed.get(s.to)!;
              const la = lookOf(s.from), lb = lookOf(s.to);
              return (
                <Strand
                  key={s.from + '|' + s.to}
                  a={a} b={b}
                  faded={!!(la?.faded || lb?.faded)}
                  beads={(la?.lace ?? 0) >= BEADS_FROM && (lb?.lace ?? 0) >= BEADS_FROM}
                />
              );
            })}
            {web.nodes.map(n => <Bubble key={n.id} node={n} look={lookOf(n.id)} still={still} />)}
            <Bubble node={web.center} center look={lookOf('center')} still={still} />
            {ringed && (
              <Circle cx={ringed.x} cy={ringed.y} r={ringed.r + 9} fill="none" stroke={color.ink} strokeWidth={2} strokeDasharray="5 4" />
            )}
          </Svg>

          {/* Touch targets on top of the drawing: plain views are more reliable
              to tap than SVG shapes, and give VoiceOver a label. */}
          {web.nodes.map(n => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={n.title + (lookOf(n.id)?.faded ? ', needs review' : '')}
              onPress={() => onPressNode?.(n.id, n.hiddenIds)}
              style={target(sx(n.x), sy(n.y), n.r * scale)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={centerTitle}
            accessibilityHint={onPressCenter ? 'Starts a study session' : undefined}
            onPress={onPressCenter}
            disabled={!onPressCenter}
            style={target(sx(0), sy(0), web.center.r * scale)}
          />
        </>
      )}
    </View>
  );
}

// At least 44 pt across, even when the web is drawn small.
function target(cx: number, cy: number, r: number) {
  const half = Math.max(r, 22);
  return { position: 'absolute' as const, left: cx - half, top: cy - half, width: half * 2, height: half * 2, borderRadius: half };
}

// A strand: solid ink, or dashed grey to a faded bubble. When both ends are
// well learned, small bead pairs sit along the part between the bubbles.
const Strand = React.memo(StrandView);

function StrandView({ a, b, faded, beads }: { a: PlacedNode; b: PlacedNode; faded: boolean; beads: boolean }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // along the strand
  const px = -uy, py = ux;              // across it
  const dots: { x: number; y: number }[] = [];
  if (beads && !faded) {
    const from = a.r + 6, to = len - b.r - 6, step = 8;
    for (let d = from; d <= to; d += step) {
      const x = a.x + ux * d, y = a.y + uy * d;
      dots.push({ x: x + px * 2.6, y: y + py * 2.6 }, { x: x - px * 2.6, y: y - py * 2.6 });
    }
  }
  return (
    <G>
      <Line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={faded ? color.fadedLine : color.ink}
        strokeWidth={faded ? 1.2 : 1.4}
        strokeDasharray={faded ? '5 4' : undefined}
      />
      {dots.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={1.1} fill={color.ink} />)}
    </G>
  );
}

// The bubble's lace: the first "level" layers of its motif, centred on the
// bubble. level is the earned level, so layers never go away once drawn.
//
// Growing: when the level goes up (a rating in study mode), the new layers
// fade in over LACE_GROW_MS; they are never drawn at full ink before the
// fade starts, so nothing flashes. A first draw shows everything at once.
//
// Fresh ink: each layer's ink follows the bubble's recall right now
// (motifs.ts, freshInk): outer layers pale first as recall drops from 0.9
// to 0.85, and are dashed once fully pale; below 0.85 (a faded bubble) the
// innermost layer is pale too, but stays solid. When a review raises recall the
// ink darkens back over LACE_GROW_MS. Recall is read on every draw, so the
// ink keeps up as days pass.
function Lace({ id, x, y, r, level, recall, pattern, still }: {
  id: string; x: number; y: number; r: number; level: number; recall: number | null;
  pattern?: MotifPattern | null; still: boolean;
}) {
  const layers = motifLayers(motifFor(pattern, id), r, pattern?.params);

  // ---- Growing ----
  const [settled, setSettled] = useState(level);
  const grow = useRef(new Animated.Value(0)).current;
  const latest = useRef(level);
  latest.current = level;
  useEffect(() => {
    if (level <= settled || still) {
      if (level !== settled) setSettled(level);
      return;
    }
    // A second rise during a fade carries on from the current opacity.
    Animated.timing(grow, {
      toValue: 1, duration: LACE_GROW_MS, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start(({ finished }) => { if (finished) setSettled(latest.current); });
  }, [level, settled, still, grow]);
  // Ready for the next rise once the faded-in layers have joined the plain ones.
  useEffect(() => { grow.setValue(0); }, [settled, grow]);

  // ---- Fresh ink ----
  // Rounded down, so the tiny drift of recall between draws doesn't restart
  // the animation, and a bubble just under 0.85 (faded) never rounds up to it.
  const target = recall === null ? null : Math.floor(recall * 10000) / 10000;
  const ink = useRef(new Animated.Value(target ?? 1)).current;
  const first = useRef(true);
  useEffect(() => {
    const to = target ?? 1;
    if (first.current || still) {
      first.current = false;
      ink.stopAnimation();
      ink.setValue(to);
      return;
    }
    Animated.timing(ink, {
      toValue: to, duration: LACE_GROW_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false,
    }).start();
  }, [target, still, ink]);
  const inkOf = useMemo(() => Array.from({ length: level }, (_, i) => {
    const range = freshRange(i, level);
    return range ? ink.interpolate({ inputRange: range, outputRange: [PALE, 1], extrapolate: 'clamp' }) : 1;
  }), [level, ink]);

  useEffect(() => () => { grow.stopAnimation(); ink.stopAnimation(); }, [grow, ink]);

  const plain = Math.min(settled, level);
  const layer = (i: number) => (
    <LaceLayerPaths key={i} layer={layers[i]} opacity={inkOf[i]} dashed={freshDashed(i, level, target)} />
  );
  return (
    <G transform={'translate(' + x + ' ' + y + ')'}>
      {Array.from({ length: plain }, (_, i) => layer(i))}
      {level > plain && (
        <AnimatedG opacity={grow}>
          {Array.from({ length: level - plain }, (_, k) => layer(plain + k))}
        </AnimatedG>
      )}
    </G>
  );
}

function LaceLayerPaths({ layer, opacity, dashed }: {
  layer: LaceLayer; opacity: Animated.AnimatedInterpolation<number> | number; dashed: boolean;
}) {
  return (
    <AnimatedG opacity={opacity}>
      {!!layer.line && (
        <Path
          d={layer.line} fill="none" stroke={color.ink} strokeWidth={INK_W}
          strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashed ? PALE_DASH : undefined}
        />
      )}
      {!!layer.dashed && <Path d={layer.dashed} fill="none" stroke={color.ink} strokeWidth={INK_W} strokeDasharray={DASH} />}
      {!!layer.fill && <Path d={layer.fill} fill={color.ink} />}
    </AnimatedG>
  );
}

// One small circle on a stem per bubble in the nested web, fanned out on the
// side facing away from the centre. Fill by that bubble's recall: solid at
// 0.9 and up, white with an outline from 0.85, dashed grey below (faded).
// Not yet reviewed: white with an outline, like a bubble that isn't faded.
function Satellites({ node, recalls }: { node: PlacedNode; recalls: (number | null)[] }) {
  if (!recalls.length) return null;
  const away = Math.atan2(node.y, node.x);
  const spread = Math.min(0.34, 2.4 / recalls.length);
  const stemFrom = node.r, at = node.r + 30, sr = 5;
  return (
    <G>
      {recalls.map((recall, i) => {
        const a = away + (i - (recalls.length - 1) / 2) * spread;
        const c = Math.cos(a), s = Math.sin(a);
        const faded = recall !== null && recall < 0.85;
        const solid = recall !== null && recall >= 0.9;
        return (
          <G key={i}>
            <Line
              x1={node.x + c * stemFrom} y1={node.y + s * stemFrom}
              x2={node.x + c * (at - sr)} y2={node.y + s * (at - sr)}
              stroke={faded ? color.fadedLine : color.ink} strokeWidth={INK_W}
            />
            <Circle
              cx={node.x + c * at} cy={node.y + s * at} r={sr}
              fill={solid ? color.ink : color.panel}
              stroke={faded ? color.fadedBorder : color.ink}
              strokeWidth={1.3}
              strokeDasharray={faded ? '2 1.6' : undefined}
            />
          </G>
        );
      })}
    </G>
  );
}

type BubbleProps = { node: PlacedNode; center?: boolean; look?: Look; still: boolean };

// Recall drifts a little on every draw as time passes; only a visible
// change (to 4 decimals, as the lace ink uses) re-renders a bubble.
const r4 = (v: number | null | undefined) => (v == null ? null : Math.floor(v * 10000));
const sameLook = (a?: Look, b?: Look) => a === b || (!!a && !!b &&
  a.lace === b.lace && a.faded === b.faded && r4(a.recall) === r4(b.recall) &&
  JSON.stringify(a.pattern ?? null) === JSON.stringify(b.pattern ?? null) &&
  a.satellites.length === b.satellites.length && a.satellites.every((v, i) => r4(v) === r4(b.satellites[i])));
// Exported for the Subjects screen, which draws each subject as one bubble.
export const Bubble = React.memo(BubbleView, (a: BubbleProps, b: BubbleProps) =>
  a.node === b.node && a.center === b.center && a.still === b.still && sameLook(a.look, b.look));

function BubbleView({ node, center, look, still }: BubbleProps) {
  const { x, y, r, label } = node;
  const faded = !!look?.faded;
  // A faded centre turns grey instead of dashed, so its white text stays readable.
  const fill = center ? (faded ? color.fadedBorder : color.ink) : color.panel;
  const fg = center ? color.panel : faded ? color.faint : color.ink;
  // Vertically centre the title lines.
  const blockH = label.lines.length * label.lineHeight;
  const firstBaseline = y - blockH / 2 + label.lineHeight * 0.78;
  return (
    <G>
      <Lace id={node.id} x={x} y={y} r={r} level={look?.lace ?? 0} recall={look?.recall ?? null} pattern={look?.pattern} still={still} />
      {!center && <Satellites node={node} recalls={look?.satellites ?? []} />}
      <Circle
        cx={x} cy={y} r={r}
        fill={fill}
        stroke={center ? 'none' : faded ? color.fadedBorder : color.ink}
        strokeWidth={center ? 0 : faded ? 1.3 : 1.6}
        strokeDasharray={!center && faded ? '4 3' : undefined}
      />
      {label.lines.map((line, i) => (
        <SvgText
          key={i}
          x={x}
          y={firstBaseline + i * label.lineHeight}
          fontSize={label.fontSize}
          fontFamily={center ? font.readingBold : font.reading}
          fill={fg}
          textAnchor="middle"
        >
          {line}
        </SvgText>
      ))}
    </G>
  );
}

const st = StyleSheet.create({ fill: { flex: 1 } });
