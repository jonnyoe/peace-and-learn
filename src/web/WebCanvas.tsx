import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { layoutWeb, PlacedNode } from './layout';
import { color, font } from '../theme';

// Draws one web: centre bubble, neighbours and straight strands
// (spec section 4a). No lace yet. The drawing is laid out in natural units
// and scaled to fit the space it gets, so the same code works for the full
// web and, later, the smaller web shown during study mode.

export type CanvasNode = { id: string; title: string };

export default function WebCanvas({ centerTitle, nodes, edges, onPressCenter, onPressNode, centerHint }: {
  centerTitle: string;
  nodes: CanvasNode[];
  edges: { from_id: string; to_id: string }[];
  onPressCenter?: () => void;
  onPressNode?: (id: string, hiddenIds?: string[]) => void;
  centerHint?: string; // small caps line under the centre title, e.g. "TAP TO STUDY"
}) {
  const [area, setArea] = useState({ w: 0, h: 0 });
  const web = useMemo(() => layoutWeb({ centerTitle, nodes, edges }), [centerTitle, nodes, edges]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== area.w || height !== area.h) setArea({ w: width, h: height });
  };

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
            {web.strands.map(s => (
              <Line key={s.from + '|' + s.to} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color.ink} strokeWidth={1.4} />
            ))}
            {web.nodes.map(n => <Bubble key={n.id} node={n} />)}
            <Bubble node={web.center} center hint={centerHint} />
          </Svg>

          {/* Touch targets on top of the drawing: plain views are more reliable
              to tap than SVG shapes, and give VoiceOver a label. */}
          {web.nodes.map(n => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={n.title}
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

function Bubble({ node, center, hint }: { node: PlacedNode; center?: boolean; hint?: string }) {
  const { x, y, r, label } = node;
  const fg = center ? color.panel : color.ink;
  const hintSize = 8.5;
  const hintGap = hint && center ? hintSize + 5 : 0;
  // Vertically centre the text block (title lines plus the hint line).
  const blockH = label.lines.length * label.lineHeight + hintGap;
  const firstBaseline = y - blockH / 2 + label.lineHeight * 0.78;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={center ? color.ink : color.panel} stroke={color.ink} strokeWidth={center ? 0 : 1.6} />
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
