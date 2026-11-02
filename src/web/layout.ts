// Geometry for one knowledge web, in "natural" units (spec section 6:
// bubble radius 38, centre 46, pattern up to about 40 beyond). No React here, so it
// can be tested in plain Node. WebCanvas scales the result to the screen.

export const R_NODE = 38;
export const R_CENTER = 46;
export const MAX_SHOWN = 8;  // more than this and the rest fold into "+N more"
// How far a full pattern (lace or satellites) reaches beyond a bubble's
// edge: the widest motif (hub) reaches 39.3 plus half its 1.1 line, so 40
// covers every motif. Two full patterns are kept PATTERN_GAP apart, so
// they barely don't touch.
export const PATTERN_REACH = 40;
export const PATTERN_GAP = 1;
// The drawing box ends right at the outermost pattern edge: patterns may
// run up to the sides of the web area without being cut off.
const EDGE_ROOM = PATTERN_REACH;

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
const SUFFIXES = /^(ing|tion|sion|ment|ness|able|ible|ful|less)$/i;
// Consonant pairs a syllable can start with. A break before any other pair
// ("Photosy-nthesis") reads badly, so it is avoided when there's a choice.
const ONSETS = /^(bl|br|ch|cl|cr|dr|fl|fr|gl|gr|ph|pl|pr|sc|sh|sk|sl|sm|sn|sp|st|sw|th|tr|tw|wh|wr)/i;

// Splits a word that is too long, preferring a vowel-then-consonant spot
// near the middle: "Visuospatial" -> "Visuo-", "spatial".
// A word that already has a hyphen ("Long-term") breaks there first.
function hyphenate(word: string, max: number): string[] {
  if (word.length <= max) return [word];
  const dash = word.lastIndexOf('-', max - 1);
  if (dash > 0 && dash < word.length - 1) {
    return [word.slice(0, dash + 1), ...hyphenate(word.slice(dash + 1), max)];
  }
  // Break after a vowel before a consonant, or between a doubled consonant
  // ("Forget-ting"), or before a common ending ("switch-ing"); the last two
  // are preferred. Nearest the middle wins.
  let best = -1, bestScore = Infinity;
  for (let i = 2; i <= word.length - 2; i++) {
    const letter = /[a-z]/i.test(word[i]) && !VOWELS.test(word[i]);
    const double = letter && word[i - 1].toLowerCase() === word[i].toLowerCase();
    const ending = SUFFIXES.test(word.slice(i));
    const ok = (letter && (VOWELS.test(word[i - 1]) || double)) || ending;
    if (!ok || i + 1 > max) continue; // first part plus "-" must fit
    const next = word.slice(i, i + 2);
    const awkward = next.length === 2 && !VOWELS.test(next[0]) && !VOWELS.test(next[1]) && /[a-z]{2}/i.test(next) &&
      !double && !ONSETS.test(next);
    const score = Math.abs(i - word.length / 2) - (double ? 1.5 : 0) - (ending ? 2.5 : 0) + (awkward ? 3 : 0);
    if (score < bestScore) { best = i; bestScore = score; }
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

/** Every way to break words into 1 to maxLines lines, fewest lines first. */
function splits(words: string[], maxLines: number): string[][] {
  const out: string[][] = [];
  const go = (from: number, acc: string[], left: number) => {
    if (from === words.length) { out.push(acc); return; }
    if (left === 0) return;
    for (let k = from + 1; k <= words.length; k++) go(k, [...acc, words.slice(from, k).join(' ')], left - 1);
  };
  if (words.length) go(0, [], maxLines);
  return out.sort((a, b) => a.length - b.length);
}

// Characters per line for a font size inside a circle of radius r.
// Literata averages about 0.58 em per character (0.64 in bold, set via
// em); keep 10% of the width as margin.
const charsFor = (r: number, fontSize: number, em = 0.58) =>
  Math.max(4, Math.floor((r * 2 * 0.9) / (fontSize * em)));

/**
 * Picks the largest font size whose wrapped lines fit inside the bubble.
 * A smaller size is preferred over splitting a word ("Attention" stays
 * whole), down to the third size; after that, long words are hyphenated
 * at the largest size that fits ("Phono-logical loop").
 *
 * wholeWords (the centre bubble): words are never split, not even at a
 * hyphen ("Long-term / memory"); the largest size at which some line
 * break fits wins. Only a title that fits at no size falls back to the
 * hyphenating rules above.
 */
export function fitLabel(title: string, r: number, sizes: number[], maxLines = 3, em = 0.58, wholeWords = false): Label {
  // Every line must fit the circle's width at its own height (top and
  // bottom lines get less room).
  const chordAt = (y: number) => (Math.abs(y) < r ? 2 * Math.sqrt(r * r - y * y) : 0);
  // margin: share of the line's chord the text may use.
  const fits = (lines: string[], fontSize: number, margin = 0.94) => {
    const lh = fontSize * 1.18;
    if (lines.length > maxLines || lines.length * lh > r * 1.6) return false;
    return lines.every((line, i) => {
      const yc = (i - (lines.length - 1) / 2) * lh;
      const y = Math.abs(yc) + fontSize * 0.4;
      return line.length * fontSize * em <= chordAt(y) * margin;
    });
  };
  if (wholeWords) {
    const words = title.trim().split(/\s+/);
    for (const fontSize of sizes) {
      // Fewest lines first, so short titles stay on one line.
      // The filled centre has no outline to crowd, so text may run a little
      // closer to its edge.
      const lines = splits(words, maxLines).find(ls => fits(ls, fontSize, 0.97));
      if (lines) return { lines, fontSize, lineHeight: fontSize * 1.18 };
    }
  }
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
 * below. layoutWeb may turn the ring by half a step to fit the screen.
 */
export function angles(n: number): number[] {
  if (n === 1) return [Math.PI / 2];
  const start = -Math.PI / 2 - Math.PI / n;
  return Array.from({ length: n }, (_, i) => start + (i * 2 * Math.PI) / n);
}

// Clear distances between bubble centres: full patterns PATTERN_GAP apart.
const centreGap = (r: number) => R_CENTER + r + 2 * PATTERN_REACH + PATTERN_GAP;
const neighbourGap = (r: number) => 2 * r + 2 * PATTERN_REACH + PATTERN_GAP;

/**
 * Neighbours in directions dirs, on an ellipse k times as tall as it is
 * wide, pulled in as close as the clear distances allow: to the centre and
 * between every pair of neighbours.
 */
function placeTight(dirs: number[], k: number, r: number): { x: number; y: number }[] {
  const base = dirs.map(a => ({ x: Math.cos(a), y: Math.sin(a) * k }));
  let t = 0;
  for (const p of base) t = Math.max(t, centreGap(r) / (Math.hypot(p.x, p.y) || 1e-9));
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      const d = Math.hypot(base[i].x - base[j].x, base[i].y - base[j].y) || 1e-9;
      t = Math.max(t, neighbourGap(r) / d);
    }
  }
  return base.map(p => ({ x: p.x * t, y: p.y * t }));
}

/** Font sizes with nothing below min (natural units). */
const atLeast = (sizes: number[], min: number) => [...new Set(sizes.map(s => Math.max(s, Math.round(min * 10) / 10)))];

/**
 * Lays out one web, packed tight: neighbours sit as close as their full
 * patterns allow (PATTERN_GAP apart), on a ring stretched to the shape of
 * the area (aspect = area height / width). WebCanvas then scales the whole
 * drawing up to fill its area. minFont keeps labels from shrinking below that size in
 * natural units (WebCanvas passes 12 pt divided by its scale).
 */
export function layoutWeb(input: LayoutInput, minFont = 0, aspect = 1.1): WebLayout {
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

  const r = R_NODE;
  const center: PlacedNode = {
    id: 'center', title: input.centerTitle, x: 0, y: 0, r: R_CENTER,
    label: fitLabel(input.centerTitle, R_CENTER, atLeast(CENTER_SIZES, minFont), 3, 0.64, true),
  };

  const items = [
    ...shown.map(n => ({ id: n.id, title: n.title, hiddenIds: undefined as string[] | undefined })),
    ...(hidden.length ? [{ id: 'more', title: '+' + hidden.length + ' more', hiddenIds: hidden.map(h => h.id) }] : []),
  ];
  const n = items.length;

  // Bounding box (pattern room included) of a placement.
  const boxFor = (pts: { x: number; y: number }[]) => {
    const all = [{ x: 0, y: 0, r: R_CENTER }, ...pts.map(p => ({ ...p, r }))];
    const minX = Math.min(...all.map(p => p.x - p.r - EDGE_ROOM));
    const maxX = Math.max(...all.map(p => p.x + p.r + EDGE_ROOM));
    const minY = Math.min(...all.map(p => p.y - p.r - EDGE_ROOM));
    const maxY = Math.max(...all.map(p => p.y + p.r + EDGE_ROOM));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
  // How big the web is drawn in an area of this aspect (relative units).
  const fill = (b: { w: number; h: number }) => Math.min(1 / b.w, aspect / b.h);

  // Try both turns of the ring and stretch it taller or wider, so the web
  // matches the shape of its area (tall on the web screen, wide in study
  // mode); keep whichever draws the bubbles biggest. A plain circle wins ties.
  let pts = placeTight(angles(n), 1, r);
  let best = fill(boxFor(pts));
  if (n >= 2) {
    for (const turn of [0, Math.PI / n]) {
      const dirs = angles(n).map(a => a + turn);
      for (let k = 0.4; k <= 3.001; k += 0.02) {
        const cand = placeTight(dirs, k, r);
        const f = fill(boxFor(cand));
        if (f > best * 1.002) { best = f; pts = cand; }
      }
    }
  }

  const sizes = atLeast(NODE_SIZES, minFont);
  const placed: PlacedNode[] = items.map((it, i) => ({
    ...it, x: pts[i].x, y: pts[i].y, r, label: fitLabel(it.title, r, sizes),
  }));

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

  return { center, nodes: placed, strands, box: boxFor(pts) };
}
