import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent, Animated, Easing, AccessibilityInfo } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { layoutWeb, PlacedNode } from './layout';
import { DASH, LaceLayer, motifFor, motifLayers, MotifPattern } from './motifs';
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
  satellites: (number | null)[];   // recall of each bubble in its nested web
  pattern?: MotifPattern | null;   // lace motif; missing: one picked from the id
};

const INK_W = 1.1;     // lace line width (spec section 6)
const BEADS_FROM = 3;  // both ends need this lace level for strand beads
const GROW_MS = 1200;  // fade-in of a new lace layer (spec 4b: about 1 to 1.5 s)

const AnimatedG = Animated.createAnimatedComponent(G);

// Reduce Motion on: new layers appear at once instead of fading in.
function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

export default function WebCanvas({ centerTitle, nodes, edges, onPressCenter, onPressNode, centerHint, ringId, looks }: {
  centerTitle: string;
  nodes: CanvasNode[];
  edges: { from_id: string; to_id: string }[];
  onPressCenter?: () => void;
  onPressNode?: (id: string, hiddenIds?: string[]) => void;
  centerHint?: string; // small caps line under the centre title, e.g. "TAP TO STUDY"
  // Study mode: draw a dashed ring around this bubble ('center' for the
  // centre). A bubble folded into "+N more" rings that bubble instead.
  ringId?: string | null;
  looks?: Record<string, Look>; // by node id; 'center' for the centre
}) {
  const [area, setArea] = useState({ w: 0, h: 0 });
  const still = useReduceMotion();
  const web = useMemo(() => layoutWeb({ centerTitle, nodes, edges }), [centerTitle, nodes, edges]);

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
            <Bubble node={web.center} center hint={centerHint} look={lookOf('center')} still={still} />
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
            accessibilityLabel={centerTitle + (centerHint ? ', ' + centerHint.toLowerCase() : '')}
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
function Strand({ a, b, faded, beads }: { a: PlacedNode; b: PlacedNode; faded: boolean; beads: boolean }) {
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
// bubble. Layers it already had are drawn plainly. When the level goes up
// (a rating in study mode), the new layers fade in over GROW_MS; the
// pattern is never drawn at the new level before the fade starts, so it
// doesn't flash. A first draw (opening a web) shows everything at once.
function Lace({ id, x, y, r, level, faded, pattern, still }: {
  id: string; x: number; y: number; r: number; level: number; faded: boolean;
  pattern?: MotifPattern | null; still: boolean;
}) {
  const layers = motifLayers(motifFor(pattern, id), r, pattern?.params);
  const ink = faded ? color.fadedLine : color.ink;
  // Layers below "settled" are drawn plainly; the rest up to level fade in.
  const [settled, setSettled] = useState(level);
  const opacity = useRef(new Animated.Value(0)).current;
  const latest = useRef(level);
  latest.current = level;

  useEffect(() => {
    if (level <= settled || still) {
      if (level !== settled) setSettled(level);
      return;
    }
    // A second rise during a fade carries on from the current opacity.
    Animated.timing(opacity, {
      toValue: 1, duration: GROW_MS, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start(({ finished }) => { if (finished) setSettled(latest.current); });
  }, [level, settled, still, opacity]);

  // Ready for the next rise, once the fading layers have moved to the plain group.
  useEffect(() => { opacity.setValue(0); }, [settled, opacity]);
  useEffect(() => () => opacity.stopAnimation(), [opacity]);

  const plain = Math.min(settled, level);
  return (
    <G transform={'translate(' + x + ' ' + y + ')'}>
      {layers.slice(0, plain).map((l, i) => <LaceLayerPaths key={i} layer={l} ink={ink} />)}
      {level > plain && (
        <AnimatedG opacity={opacity}>
          {layers.slice(plain, level).map((l, i) => <LaceLayerPaths key={plain + i} layer={l} ink={ink} />)}
        </AnimatedG>
      )}
    </G>
  );
}

function LaceLayerPaths({ layer, ink }: { layer: LaceLayer; ink: string }) {
  return (
    <>
      {!!layer.line && <Path d={layer.line} fill="none" stroke={ink} strokeWidth={INK_W} strokeLinejoin="round" strokeLinecap="round" />}
      {!!layer.dashed && <Path d={layer.dashed} fill="none" stroke={ink} strokeWidth={INK_W} strokeDasharray={DASH} />}
      {!!layer.fill && <Path d={layer.fill} fill={ink} />}
    </>
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

function Bubble({ node, center, hint, look, still }: { node: PlacedNode; center?: boolean; hint?: string; look?: Look; still: boolean }) {
  const { x, y, r, label } = node;
  const faded = !!look?.faded;
  // A faded centre turns grey instead of dashed, so its white text stays readable.
  const fill = center ? (faded ? color.fadedBorder : color.ink) : color.panel;
  const fg = center ? color.panel : faded ? color.faint : color.ink;
  const hintSize = 8.5;
  const hintGap = hint && center ? hintSize + 5 : 0;
  // Vertically centre the text block (title lines plus the hint line).
  const blockH = label.lines.length * label.lineHeight + hintGap;
  const firstBaseline = y - blockH / 2 + label.lineHeight * 0.78;
  return (
    <G>
      <Lace id={node.id} x={x} y={y} r={r} level={look?.lace ?? 0} faded={faded} pattern={look?.pattern} still={still} />
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
      {!!hint && center && (
        <SvgText
          x={x}
          y={firstBaseline + (label.lines.length - 1) * label.lineHeight + hintGap + 2}
          fontSize={hintSize}
          fontFamily={font.uiMedium}
          letterSpacing={1.2}
          fill={fg}
          textAnchor="middle"
        >
          {hint}
        </SvgText>
      )}
    </G>
  );
}

const st = StyleSheet.create({ fill: { flex: 1 } });
