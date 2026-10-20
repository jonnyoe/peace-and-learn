// Geometry for one knowledge web, in "natural" units (spec section 6:
// bubble radius 38, centre 46, lace up to 42 beyond). No React here, so it
// can be tested in plain Node. WebCanvas scales the result to the screen.

export const R_NODE = 38;
export const R_CENTER = 46;
export const LACE = 42;      // room kept around each bubble for its pattern
export const MAX_SHOWN = 8;  // more than this and the rest fold into "+N more"

// Distance from the centre to a neighbour, as a half-width and half-height.
// Neighbours sit on a rounded rectangle rather than a circle, which uses a
// tall phone screen better: four neighbours land on the diagonals.
const RX = 118;
const RY = 150;

export type LayoutInput = {
  centerTitle: string;
  nodes: { id: string; title: string }[];
  edges: { from_id: string; to_id: string }[];
};

export type Label = { lines: string[]; fontSize: number; lineHeight: number };

export type PlacedNode = {
  id: string;            // concept id, or "more" for the "+N more" bubble
  title: string;
  x: number; y: number; r: number;
  label: Label;
  hiddenIds?: string[];  // on the "+N more" bubble: what it stands for
};

export type Strand = { from: string; to: string; x1: number; y1: number; x2: number; y2: number };

export type WebLayout = {
  center: PlacedNode;
  nodes: PlacedNode[];
  strands: Strand[];
  // Everything, lace room included, fits inside this box.
  box: { x: number; y: number; w: number; h: number };
};

// ---------- Labels ----------
const VOWELS = /[aeiouy]/i;

// Splits a word that is too long, preferring a vowel-then-consonant spot
// near the middle: "Visuospatial" -> "Visuo-", "spatial".
// A word that already has a hyphen ("Long-term") breaks there first.
function hyphenate(word: string, max: number): string[] {
  if (word.length <= max) return [word];
  const dash = word.lastIndexOf('-', max - 1);
  if (dash > 0 && dash < word.length - 1) {
    return [word.slice(0, dash + 1), ...hyphenate(word.slice(dash + 1), max)];
  }
  let best = -1;
  for (let i = 2; i <= word.length - 2; i++) {
    const ok = VOWELS.test(word[i - 1]) && !VOWELS.test(word[i]) && /[a-z]/i.test(word[i]);
    if (!ok || i + 1 > max) continue; // first part plus "-" must fit
    if (best < 0 || Math.abs(i - word.length / 2) < Math.abs(best - word.length / 2)) best = i;
  }
  if (best < 0) best = Math.min(max - 1, word.length - 2);
  return [word.slice(0, best) + '-', ...hyphenate(word.slice(best), max)];
}

/** Greedy word wrap at about maxChars per line, hyphenating long words. */
export function wrap(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).flatMap(w => hyphenate(w, maxChars));
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && !last.endsWith('-') && last.length + 1 + w.length <= maxChars) {
      lines[lines.length - 1] = last + ' ' + w;
    } else {
      lines.push(w);
    }
  }
  return lines;
}

// Characters per line for a font size inside a circle of radius r.
// Literata averages about 0.58 em per character (0.64 in bold, set via
// em); keep 15% of the width as margin.
const charsFor = (r: number, fontSize: number, em = 0.58) =>
  Math.max(4, Math.floor((r * 2 * 0.85) / (fontSize * em)));

/**
 * Picks the largest font size whose wrapped lines fit inside the bubble.
 * A smaller size is preferred over splitting a word ("Attention" stays
 * whole), down to the third size; after that, long words are hyphenated
 * at the largest size that fits ("Phono-logical loop").
 */
export function fitLabel(title: string, r: number, sizes: number[], maxLines = 3, em = 0.58): Label {
  const fits = (lines: string[], fontSize: number) =>
    lines.length <= maxLines && lines.length * fontSize * 1.18 <= r * 1.5;
  const longest = Math.max(...title.split(/\s+/).map(w => w.length));
  for (const fontSize of sizes.slice(0, 3)) {
    const max = charsFor(r, fontSize, em);
    const lines = wrap(title, max);
    if (longest <= max && fits(lines, fontSize)) return { lines, fontSize, lineHeight: fontSize * 1.18 };
  }
  // Hyphenate, but split each word at most once if any size allows it
  // ("Consoli-dation" rather than "Conso-lida-tion").
  const words = title.trim().split(/\s+/);
  for (const once of [true, false]) {
    for (const fontSize of sizes) {
      const max = charsFor(r, fontSize, em);
      if (once && words.some(w => hyphenate(w, max).length > 2)) continue;
      const lines = wrap(title, max);
      if (fits(lines, fontSize)) return { lines, fontSize, lineHeight: fontSize * 1.18 };
    }
  }
  const fontSize = sizes[sizes.length - 1];
  const lines = wrap(title, charsFor(r, fontSize, em));
  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = cut[maxLines - 1].replace(/-?$/, '\u2026');
  return { lines: cut, fontSize, lineHeight: fontSize * 1.18 };
}

const NODE_SIZES = [14, 13, 12, 11, 10];
const CENTER_SIZES = [20, 18, 16, 14, 13, 12];

// ---------- Placement ----------
/**
 * Angles for n neighbours, clockwise from the upper left. Four neighbours
 * land on the diagonals, as in the mockup; three make a triangle with one
 * below; six fill left and right too.
 */
export function angles(n: number): number[] {
  if (n === 1) return [Math.PI / 2];
  const start = -Math.PI / 2 - Math.PI / n;
  return Array.from({ length: n }, (_, i) => start + (i * 2 * Math.PI) / n);
}

// Point in direction a on a rounded rectangle (a superellipse) with half
// sizes RX, RY: between an ellipse and a rectangle.
function onRing(a: number): { x: number; y: number } {
  const c = Math.cos(a), s = Math.sin(a), p = 4;
  const k = 1 / Math.pow(Math.pow(Math.abs(c) / RX, p) + Math.pow(Math.abs(s) / RY, p), 1 / p);
  return { x: c * k, y: s * k };
}

export function layoutWeb(input: LayoutInput): WebLayout {
  const { nodes, edges } = input;

  // Too many to fit: keep the best connected ones, in their original order.
  let shown = nodes;
  let hidden: typeof nodes = [];
  if (nodes.length > MAX_SHOWN) {
    const degree = (id: string) => edges.filter(e => e.from_id === id || e.to_id === id).length;
    const keep = new Set([...nodes].sort((a, b) => degree(b.id) - degree(a.id)).slice(0, MAX_SHOWN - 1).map(n => n.id));
    shown = nodes.filter(n => keep.has(n.id));
    hidden = nodes.filter(n => !keep.has(n.id));
  }

  // Seven or eight neighbours get slightly smaller bubbles so they don't touch.
  const total = shown.length + (hidden.length ? 1 : 0);
  const r = total > 6 ? R_NODE * 0.9 : R_NODE;

  const center: PlacedNode = {
    id: 'center', title: input.centerTitle, x: 0, y: 0, r: R_CENTER,
    // Room below the title for the small "TAP TO STUDY" line.
    label: fitLabel(input.centerTitle, R_CENTER * 0.92, CENTER_SIZES, 3, 0.64),
  };

  const items = [
    ...shown.map(n => ({ id: n.id, title: n.title, hiddenIds: undefined as string[] | undefined })),
    ...(hidden.length ? [{ id: 'more', title: '+' + hidden.length + ' more', hiddenIds: hidden.map(h => h.id) }] : []),
  ];
  const dirs = angles(items.length);
  const placed: PlacedNode[] = items.map((it, i) => {
    const p = onRing(dirs[i]);
    return { ...it, x: p.x, y: p.y, r, label: fitLabel(it.title, r, NODE_SIZES) };
  });

  // Every bubble hangs off the centre; links between bubbles add more strands.
  const pos = new Map(placed.map(p => [p.id, p]));
  const strands: Strand[] = placed.map(p => ({ from: 'center', to: p.id, x1: 0, y1: 0, x2: p.x, y2: p.y }));
  const seen = new Set<string>();
  for (const e of edges) {
    const a = pos.get(e.from_id), b = pos.get(e.to_id);
    if (!a || !b || a === b) continue;
    const k = [a.id, b.id].sort().join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    strands.push({ from: a.id, to: b.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // Bounding box including lace room.
  const all = [center, ...placed];
  const minX = Math.min(...all.map(n => n.x - n.r - LACE));
  const maxX = Math.max(...all.map(n => n.x + n.r + LACE));
  const minY = Math.min(...all.map(n => n.y - n.r - LACE));
  const maxY = Math.max(...all.map(n => n.y + n.r + LACE));

  return { center, nodes: placed, strands, box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}
