// The lace motif library (docs/knowledge-web-spec.md, section 6). Each motif
// draws up to five layers outward from a bubble's edge; layer 1 sits closest
// to the bubble. Everything is built from simple geometry (rings, arcs,
// ellipses, radial lines, dots) as SVG path strings around (0, 0), so
// WebCanvas only has to move them to the bubble. No React here, so it can
// be tested in plain Node.
//
// Every layer stays within LACE_MAX (42) of the bubble edge, the room
// layout.ts keeps free around each bubble.

export const MOTIFS = ['neuron', 'orbit', 'rings', 'rays', 'chunks', 'hub', 'slots', 'wave', 'sketch'] as const;
export type MotifName = (typeof MOTIFS)[number];

export type MotifPattern = { motif: string; params?: Record<string, number> };

/**
 * One layer, as up to three combined paths: thin solid lines, dashed lines
 * and filled shapes (dots, balls). Any of them may be empty.
 */
export type LaceLayer = { line: string; dashed: string; fill: string };

export const LACE_MAX = 42;   // furthest any layer reaches beyond the bubble edge
export const DASH = '4 3';    // dash pattern for the "dashed" path

// ---------- Geometry helpers (all return path data) ----------
const TAU = Math.PI * 2;
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const pt = (x: number, y: number) => n2(x) + ' ' + n2(y);
const polar = (R: number, a: number): [number, number] => [R * Math.cos(a), R * Math.sin(a)];

/** A full circle of radius r around (cx, cy). */
function circle(cx: number, cy: number, r: number): string {
  return 'M' + pt(cx - r, cy) + 'a' + n2(r) + ' ' + n2(r) + ' 0 1 0 ' + n2(2 * r) + ' 0' +
    'a' + n2(r) + ' ' + n2(r) + ' 0 1 0 ' + n2(-2 * r) + ' 0Z';
}

/** n evenly spaced dots of radius d on a ring of radius R, starting at angle a0. */
function dotRing(R: number, n: number, d = 1.15, a0 = 0): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = polar(R, a0 + (i * TAU) / n);
    s += circle(x, y, d);
  }
  return s;
}

/** How many dots fit on a ring of radius R about gap apart. */
const countFor = (R: number, gap: number) => Math.max(6, Math.round((TAU * R) / gap));

/** Arc of radius R from angle a0 to a1 (radians, a1 > a0), as its own subpath. */
function arc(R: number, a0: number, a1: number): string {
  const [x0, y0] = polar(R, a0), [x1, y1] = polar(R, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return 'M' + pt(x0, y0) + 'A' + n2(R) + ' ' + n2(R) + ' 0 ' + large + ' 1 ' + pt(x1, y1);
}

/** Radial segment at angle a from radius r0 to r1. */
function ray(a: number, r0: number, r1: number): string {
  return seg(polar(r0, a), polar(r1, a));
}

/** Straight segment between two points. */
function seg(a: [number, number], b: [number, number]): string {
  return 'M' + pt(a[0], a[1]) + 'L' + pt(b[0], b[1]);
}

/** Closed outline at radius rOf(angle) all the way round. */
function radial(rOf: (a: number) => number, steps = 120): string {
  let s = '';
  for (let i = 0; i < steps; i++) {
    const a = (i * TAU) / steps;
    const [x, y] = polar(rOf(a), a);
    s += (i ? 'L' : 'M') + pt(x, y);
  }
  return s + 'Z';
}

/** A ring that waves in and out "waves" times around. */
const wavy = (R: number, amp: number, waves: number, phase = 0) =>
  radial(a => R + amp * Math.sin(waves * a + phase), Math.max(96, waves * 12));

/** Point at parameter t on an ellipse (semi-axes rx, ry, turned by rot) round the bubble. */
function onEllipse(rx: number, ry: number, rot: number, t: number): [number, number] {
  const x = rx * Math.cos(t), y = ry * Math.sin(t);
  return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
}

function ellipse(rx: number, ry: number, rot: number): string {
  let s = '';
  for (let i = 0; i < 96; i++) {
    const [x, y] = onEllipse(rx, ry, rot, (i * TAU) / 96);
    s += (i ? 'L' : 'M') + pt(x, y);
  }
  return s + 'Z';
}

/** Small deterministic pseudo-random numbers, so a bubble looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const L = (line = '', dashed = '', fill = ''): LaceLayer => ({ line, dashed, fill });

// ---------- The motifs ----------
// Each takes the bubble radius r and the optional params and returns all
// five layers. "n" is the symmetry count where a motif has one.
type Params = Record<string, number> | undefined;
type Builder = (r: number, p: Params) => LaceLayer[];

// The fine dot ring most motifs start with.
const firstDots = (r: number) => dotRing(r + 5, countFor(r + 5, 6.5));

// Dot ring -> short branches -> forked branches -> second forks with
// synapse dots -> wavy membrane ring.
const neuron: Builder = (r, p) => {
  const n = p?.n ?? 8;
  let branches = '', forks = '', forks2 = '', synapses = '';
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n + TAU / (n * 4);
    branches += ray(a, r + 9, r + 16);
    const p0 = polar(r + 16, a);
    for (const s1 of [-1, 1]) {
      const p1 = polar(r + 24, a + s1 * 0.13);
      forks += seg(p0, p1);
      for (const s2 of [-1, 1]) {
        const p2 = polar(r + 31, a + s1 * 0.13 + s2 * 0.065);
        forks2 += seg(p1, p2);
        synapses += circle(p2[0], p2[1], 1.3);
      }
    }
  }
  return [
    L('', '', firstDots(r)),
    L(branches),
    L(forks),
    L(forks2, '', synapses),
    L(wavy(r + 37, 1.4, Math.round((r + 37) / 2.6))),
  ];
};

// Dot ring -> two crossed elliptical orbits -> four balls on them ->
// second pair of orbits with balls -> dashed outer ring.
const orbit: Builder = r => {
  const balls = (rx: number, ry: number, rot: number, ts: number[], d: number) =>
    ts.map(t => { const [x, y] = onEllipse(rx, ry, rot, t); return circle(x, y, d); }).join('');
  const a1 = r + 20, b1 = r + 9, a2 = r + 30, b2 = r + 13;
  const rotA = -Math.PI / 5, rotB = Math.PI / 5;
  const rotC = Math.PI / 2 - 0.12, rotD = 0.12;
  return [
    L('', '', firstDots(r)),
    L(ellipse(a1, b1, rotA) + ellipse(a1, b1, rotB)),
    L('', '', balls(a1, b1, rotA, [0.35, Math.PI + 0.35], 2.6) + balls(a1, b1, rotB, [Math.PI - 0.35, -0.35], 2.6)),
    L(ellipse(a2, b2, rotC) + ellipse(a2, b2, rotD), '',
      balls(a2, b2, rotC, [0.9, Math.PI + 0.9], 2.2) + balls(a2, b2, rotD, [Math.PI / 2 + 0.6, -Math.PI / 2 + 0.6], 2.2)),
    L('', circle(0, 0, r + 39)),
  ];
};

// Wobbly concentric rings like tree rings, one per layer; radial cracks at
// layer 4; small knots at layer 5.
const rings: Builder = (r, p) => {
  const rand = rng(p?.seed ?? 7);
  const rs = [0, 1, 2, 3, 4].map(k => {
    const R = r + 6 + k * 7.2;
    const f1 = 2 + Math.floor(rand() * 3), f2 = 5 + Math.floor(rand() * 3);
    const ph1 = rand() * TAU, ph2 = rand() * TAU;
    return { R, d: radial(a => R + 0.9 * Math.sin(f1 * a + ph1) + 0.5 * Math.sin(f2 * a + ph2)) };
  });
  let cracks = '';
  const nc = p?.n ?? 7;
  for (let i = 0; i < nc; i++) {
    const a = (i * TAU) / nc + (rand() - 0.5) * 0.5;
    cracks += ray(a, r + 3 + rand() * 4, rs[3].R + 1 - rand() * 6);
  }
  let knots = '';
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU, k = 1 + Math.floor(rand() * 4);
    const [x, y] = polar(rs[k].R, a);
    knots += circle(x, y, 1.8 + rand() * 0.8);
  }
  return [L(rs[0].d), L(rs[1].d), L(rs[2].d), L(rs[3].d + cracks), L(rs[4].d + knots)];
};

// Dot ring -> rays of alternating length -> inward-pointing chevrons ->
// fine dot ring -> dashed outer ring.
const rays: Builder = (r, p) => {
  const n = p?.n ?? 16;
  let rs = '', chevrons = '';
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n;
    rs += ray(a, r + 9, i % 2 ? r + 17 : r + 23);
    const m = a + TAU / (2 * n);
    const tip = polar(r + 24, m);
    chevrons += seg(polar(r + 29, m - 0.07), tip) + seg(tip, polar(r + 29, m + 0.07));
  }
  return [
    L('', '', firstDots(r)),
    L(rs),
    L(chevrons),
    L('', '', dotRing(r + 33, countFor(r + 33, 4), 0.8)),
    L('', circle(0, 0, r + 38)),
  ];
};

// Dots in groups of three -> brackets round each group -> three-dot
// clusters between groups plus arcs joining pairs of groups -> tick marks
// -> small outer circles.
const chunks: Builder = (r, p) => {
  const g = p?.n ?? 6;
  const step = TAU / g, d = 0.085;   // d: angle between dots in a group
  let dots = '', brackets = '', clusters = '', joins = '', ticks = '', outer = '';
  for (let i = 0; i < g; i++) {
    const a = i * step;
    for (const k of [-1, 0, 1]) { const [x, y] = polar(r + 6, a + k * d); dots += circle(x, y, 1.25); }
    const a0 = a - d - 0.07, a1 = a + d + 0.07;
    brackets += ray(a0, r + 8, r + 11) + arc(r + 11, a0, a1) + ray(a1, r + 11, r + 8);
    const m = a + step / 2;
    for (const [dr, da] of [[0, -0.05], [0, 0.05], [4, 0]]) {
      const [x, y] = polar(r + 9 + dr, m + da);
      clusters += circle(x, y, 1);
    }
    if (i % 2 === 0) joins += arc(r + 17, a, a + step);
    for (const k of [-1, 0, 1]) ticks += ray(a + k * d * 1.4, r + 22, r + 27);
    const [ox, oy] = polar(r + 34, a), [mx, my] = polar(r + 34, m);
    outer += circle(ox, oy, 2.6) + circle(mx, my, 1.8);
  }
  return [L('', '', dots), L(brackets), L(joins, '', clusters), L(ticks), L(outer)];
};

// Dot ring -> six spokes with end dots -> arcs between spoke ends ->
// small diamonds -> wavy outer ring.
const hub: Builder = (r, p) => {
  const n = p?.n ?? 6;
  let spokes = '', ends = '', arcs = '', diamonds = '';
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n - Math.PI / 2, b = a + TAU / n, m = (a + b) / 2;
    spokes += ray(a, r + 8, r + 21);
    const [ex, ey] = polar(r + 23.5, a);
    ends += circle(ex, ey, 1.9);
    const p0 = polar(r + 25.5, a + 0.06), p1 = polar(r + 25.5, b - 0.06), c = polar(r + 33, m);
    arcs += 'M' + pt(p0[0], p0[1]) + 'Q' + pt(c[0], c[1]) + ' ' + pt(p1[0], p1[1]);
    const R = r + 15, s = 3.2;
    const q = [polar(R - s, m), polar(R, m - s / R), polar(R + s, m), polar(R, m + s / R)];
    diamonds += 'M' + q.map(v => pt(v[0], v[1])).join('L') + 'Z';
  }
  return [
    L('', '', firstDots(r)),
    L(spokes, '', ends),
    L(arcs),
    L(diamonds),
    L(wavy(r + 38, 1.3, Math.round((r + 38) / 2.8))),
  ];
};

// Dot ring -> four small squares (slots) -> four "overflow" circles between
// them -> broken arc ring -> double dot ring.
const slots: Builder = r => {
  let squares = '', overflow = '', broken = '';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * TAU) / 4;
    const R = r + 16, h = 4.2, c = Math.cos(a), s = Math.sin(a);
    const at = (u: number, v: number) => pt(R * c + u * c - v * s, R * s + u * s + v * c);
    squares += 'M' + at(-h, -h) + 'L' + at(h, -h) + 'L' + at(h, h) + 'L' + at(-h, h) + 'Z';
    const [ox, oy] = polar(R, a + Math.PI / 4);
    overflow += circle(ox, oy, 3.3);
  }
  const segs = 12, part = TAU / segs;
  for (let i = 0; i < segs; i++) broken += arc(r + 27, i * part + part * 0.2, i * part + part * 0.8);
  return [
    L('', '', firstDots(r)),
    L(squares),
    L(overflow),
    L(broken),
    L('', '', dotRing(r + 33, countFor(r + 33, 6), 1) + dotRing(r + 37.5, countFor(r + 37.5, 6), 1, 0.08)),
  ];
};

// Dot ring -> wavy ring -> second wavy ring half a wave off (they braid) ->
// third wavy ring -> outer ring of small circles.
const wave: Builder = (r, p) => {
  const w = p?.n ?? Math.round((r + 13) / 4.2);
  const n = countFor(r + 33, 10);
  let rim = '';
  for (let i = 0; i < n; i++) { const [x, y] = polar(r + 33, (i * TAU) / n); rim += circle(x, y, 2.4); }
  return [
    L('', '', firstDots(r)),
    L(wavy(r + 13, 2.6, w)),
    L(wavy(r + 13, 2.6, w, Math.PI)),
    L(wavy(r + 22, 2.4, w + 4)),
    L(rim),
  ];
};

// Small plus marks -> dot ring, then the same two again, further out.
const sketch: Builder = (r, p) => {
  const plus = (R: number, n: number, arm: number, a0 = 0) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = polar(R, a0 + (i * TAU) / n);
      s += 'M' + pt(x - arm, y) + 'L' + pt(x + arm, y) + 'M' + pt(x, y - arm) + 'L' + pt(x, y + arm);
    }
    return s;
  };
  const n = p?.n ?? Math.round((TAU * (r + 8)) / 22);
  return [
    L(plus(r + 8, n, 2.6)),
    L('', '', dotRing(r + 15, countFor(r + 15, 6.5))),
    L(plus(r + 22, n + 4, 2.8, Math.PI / (n + 4))),
    L('', '', dotRing(r + 29, countFor(r + 29, 6.5))),
    L(plus(r + 36, n + 8, 3)),
  ];
};

const BUILDERS: Record<MotifName, Builder> = { neuron, orbit, rings, rays, chunks, hub, slots, wave, sketch };

export const isMotif = (m: string | undefined | null): m is MotifName =>
  !!m && (MOTIFS as readonly string[]).includes(m);

/**
 * The motif a bubble uses: its own if it names one from the library,
 * otherwise one picked from its id, so bubbles of older subjects (no
 * pattern stored) still get a steady pattern of their own.
 */
export function motifFor(pattern: MotifPattern | null | undefined, id: string): MotifName {
  const m = pattern?.motif;
  if (isMotif(m)) return m;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MOTIFS[h % MOTIFS.length];
}

const cache = new Map<string, LaceLayer[]>();

/** All five layers of a motif for a bubble of radius r (cached). */
export function motifLayers(motif: MotifName, r: number, params?: Record<string, number>): LaceLayer[] {
  const key = motif + '|' + r + '|' + (params ? JSON.stringify(params) : '');
  let layers = cache.get(key);
  if (!layers) {
    layers = BUILDERS[motif](r, params);
    cache.set(key, layers);
  }
  return layers;
}
