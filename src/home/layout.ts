// Where each subject bubble sits on the Subjects screen. No React here, so
// it can be tested in plain Node.
//
// Subjects are grouped into loose clusters by category. Inside a cluster
// the bubbles are circle-packed (each one placed against the ones already
// there, as close to the middle as it fits) with small random nudges. The
// nudges come from the subject's own name, so the layout is the same on
// every visit. Clusters flow left to right in rows; the screen scrolls when
// there are more rows than fit.
//
// All units are screen points.

import { PATTERN_REACH } from '../web/layout';

/** Natural radius a home bubble is drawn at (lace reaches PATTERN_REACH beyond it). */
export const R_HOME = 50;
/** Whole drawing (bubble plus full lace) relative to the bubble's radius. */
export const FOOT = (R_HOME + PATTERN_REACH) / R_HOME;

export const R_MIN = 32;  // 64 pt across: tappable, and room for a 12 pt label
export const R_MAX = 52;

const GAP = 1;            // between two full patterns, as on a web
const NUDGE = 7;          // up to this much extra room around a bubble
const CLUSTER_GAP = 18;   // between clusters in a row
const ROW_GAP = 22;       // between rows of clusters
export const LABEL_H = 26; // category label above a cluster

/** Bubble radius on screen: grows gently with the number of concepts. */
export function bubbleRadius(concepts: number): number {
  return Math.round(Math.min(R_MAX, Math.max(R_MIN, 26 + 5 * Math.sqrt(Math.max(0, concepts)))) * 10) / 10;
}

export type HomeItem = { id: string; category: string | null; concepts: number };
export type PlacedSubject = { id: string; x: number; y: number; r: number; foot: number };
export type PlacedLabel = { text: string; x: number; y: number; w: number };
export type HomeLayout = { bubbles: PlacedSubject[]; labels: PlacedLabel[]; height: number };

// Small seeded random numbers, so the same name always gets the same nudges.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Disc = { id: string; x: number; y: number; room: number; r: number; foot: number };

/**
 * Packs one cluster around (0, 0), no wider than maxW. Bubbles go in
 * biggest first; each takes the free spot nearest the middle (a little
 * wider than tall is preferred, so clusters spread across the screen
 * before they grow down).
 */
function packCluster(items: HomeItem[], maxW: number): Disc[] {
  const discs = items
    .map(it => {
      const r = bubbleRadius(it.concepts);
      const rand = rng(it.id);
      return { id: it.id, r, foot: r * FOOT, room: r * FOOT + GAP / 2 + rand() * NUDGE, turn: rand() * Math.PI * 2 };
    })
    .sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));

  const placed: Disc[] = [];
  const half = maxW / 2;
  const free = (x: number, y: number, room: number) =>
    Math.abs(x) + room <= half + 1e-6 &&
    placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.room + room - 1e-6);
  const score = (x: number, y: number) => Math.hypot(x * 0.8, y * 1.25);

  for (const d of discs) {
    if (!placed.length) { placed.push({ id: d.id, x: 0, y: 0, room: d.room, r: d.r, foot: d.foot }); continue; }
    const cands: [number, number][] = [];
    // Touching one bubble, at a spread of angles turned by this bubble's own nudge.
    for (const p of placed) {
      for (let k = 0; k < 12; k++) {
        const a = d.turn + (k * Math.PI) / 6, dist = p.room + d.room;
        cands.push([p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist]);
      }
    }
    // Touching two bubbles at once (the snug spots).
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const ra = a.room + d.room, rb = b.room + d.room;
        const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
        if (dd === 0 || dd > ra + rb || dd < Math.abs(ra - rb)) continue;
        const l = (ra * ra - rb * rb + dd * dd) / (2 * dd);
        const hh = Math.sqrt(Math.max(0, ra * ra - l * l));
        const mx = a.x + (dx * l) / dd, my = a.y + (dy * l) / dd;
        cands.push([mx - (dy * hh) / dd, my + (dx * hh) / dd], [mx + (dy * hh) / dd, my - (dx * hh) / dd]);
      }
    }
    // Pulled sideways to fit the width, in case nothing else does.
    for (const [x, y] of [...cands]) {
      const lim = half - d.room;
      if (Math.abs(x) > lim && lim >= 0) cands.push([Math.sign(x) * lim, y]);
    }
    let best: [number, number] | null = null, bestS = Infinity;
    for (const [x, y] of cands) {
      if (!free(x, y, d.room)) continue;
      const s = score(x, y);
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    if (!best) {
      // Nothing fits beside the others: start a new line underneath.
      const bottom = Math.max(...placed.map(p => p.y + p.room));
      best = [0, bottom + d.room];
    }
    placed.push({ id: d.id, x: best[0], y: best[1], room: d.room, r: d.r, foot: d.foot });
  }
  return placed;
}

const labelWidth = (text: string) => Math.ceil(text.length * 7.6 + 8);

/**
 * Lays out every subject in an area width points wide, starting top points
 * down. Clusters go A to Z by category, with "Other" (no category) last.
 */
export function layoutHome(items: HomeItem[], width: number, top = 0): HomeLayout {
  const cats = [...new Set(items.map(i => i.category))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b));

  const blocks = cats.map(cat => {
    const discs = packCluster(items.filter(i => i.category === cat), width);
    const minX = Math.min(...discs.map(d => d.x - d.foot));
    const maxX = Math.max(...discs.map(d => d.x + d.foot));
    const minY = Math.min(...discs.map(d => d.y - d.foot));
    const maxY = Math.max(...discs.map(d => d.y + d.foot));
    const text = cat ?? 'Other';
    const w = Math.max(maxX - minX, labelWidth(text));
    const cx = (minX + maxX) / 2;
    return { text, discs, w, h: LABEL_H + (maxY - minY), cx, minY, jitter: rng('cat:' + text)() };
  });

  // Rows: as many clusters side by side as fit, spread over the width.
  const bubbles: PlacedSubject[] = [];
  const labels: PlacedLabel[] = [];
  let y = top;
  for (let i = 0; i < blocks.length;) {
    const row = [blocks[i]];
    let used = blocks[i].w;
    while (i + row.length < blocks.length && used + CLUSTER_GAP + blocks[i + row.length].w <= width) {
      used += CLUSTER_GAP + blocks[i + row.length].w;
      row.push(blocks[i + row.length]);
    }
    i += row.length;
    const spare = (width - used) / (row.length + 1);
    // Loose: in a row of several, each cluster sits a little higher or lower.
    const drop = (b: typeof row[number]) => (row.length > 1 ? b.jitter * 16 : 0);
    let x = spare;
    let rowH = 0;
    for (const b of row) {
      const bx = x + b.w / 2;            // block centre
      const by = y + drop(b);            // block top
      labels.push({ text: b.text, x: bx, y: by, w: labelWidth(b.text) });
      for (const d of b.discs) {
        bubbles.push({ id: d.id, x: bx + (d.x - b.cx), y: by + LABEL_H + (d.y - b.minY), r: d.r, foot: d.foot });
      }
      rowH = Math.max(rowH, drop(b) + b.h);
      x += b.w + CLUSTER_GAP + spare;
    }
    y += rowH + ROW_GAP;
  }
  return { bubbles, labels, height: y - ROW_GAP };
}
