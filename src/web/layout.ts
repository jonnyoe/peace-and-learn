// Geometry for one knowledge web, in "natural" units (spec section 6:
// bubble radius 38, centre 46, pattern up to about 40 beyond). No React here, so it
// can be tested in plain Node. WebCanvas scales the result to the screen.

export const R_NODE = 38;
export const R_CENTER = 46;
export const MAX_SHOWN = 8;  // more than this and the rest fold into "+N more"
// How far a full pattern (lace or satellites) actually reaches beyond a
// bubble's edge, and the clear space kept between two patterns.
export const PATTERN_REACH = 40;
export const PATTERN_GAP = 4;
// The drawing box keeps this much room around every bubble, so a full
// pattern is never cut off at the edge of the web area.
const EDGE_ROOM = PATTERN_REACH + 1;
// Height kept under the centre title for the small "TAP TO STUDY" line.
const HINT_ROOM = 13.5;

export type LayoutInput = {
  centerTitle: string;
  nodes: { id: string; title: string }[];
  edges: { from_id: string; to_id: string }[];
};

export type Label = {
  lines: string[]; fontSize: number; lineHeight: number;
  hintSize?: number; hintSpacing?: number; // centre only: the "TAP TO STUDY" line
};

// "TAP TO STUDY" in IBM Plex Sans Medium caps: about 0.65 em per letter,
// 0.28 em per space, plus letter spacing between its 12 characters.
const hintWidth = (size: number, spacing: number) => size * (10 * 0.65 + 2 * 0.28) + 11 * spacing;
const HINT_STYLES: [number, number][] = [[8.5, 1.2], [8.5, 0.6], [8, 0.6]]; // size, letter spacing; first that fits

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
    const score = Math.abs(i - word.length / 2) - (double ? 1.5 : 0) - (ending ? 2.5 : 0);
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
 */
export function fitLabel(title: string, r: number, sizes: number[], maxLines = 3, em = 0.58, hintRoom = 0): Label {
  // Every line must fit the circle's width at its own height (top and
  // bottom lines get less room), with room kept below for a hint line.
  const chordAt = (y: number) => (Math.abs(y) < r ? 2 * Math.sqrt(r * r - y * y) : 0);
  // The hint sits at the bottom of the text block, where the circle is narrower.
  const hintStyle = (lines: string[], fontSize: number) => {
    const room = chordAt((lines.length * fontSize * 1.18 + hintRoom) / 2) * 0.97;
    return HINT_STYLES.find(([size, sp]) => hintWidth(size, sp) <= room);
  };
  const fits = (lines: string[], fontSize: number) => {
    const lh = fontSize * 1.18;
    if (lines.length > maxLines || lines.length * lh + hintRoom > r * 1.6) return false;
    if (hintRoom && !hintStyle(lines, fontSize)) return false;
    return lines.every((line, i) => {
      const yc = (i - (lines.length - 1) / 2) * lh - hintRoom / 2;
      const y = Math.abs(yc) + fontSize * 0.4;
      return line.length * fontSize * em <= chordAt(y) * 0.94;
    });
  };
  const withHint = (l: Label): Label => {
    if (!hintRoom) return l;
    const [hintSize, hintSpacing] = hintStyle(l.lines, l.fontSize) ?? HINT_STYLES[HINT_STYLES.length - 1];
    return { ...l, hintSize, hintSpacing };
  };
  const longest = Math.max(...title.split(/\s+/).map(w => w.length));
  for (const fontSize of sizes.slice(0, 3)) {
    const max = charsFor(r, fontSize, em);
    const lines = wrap(title, max);
    if (longest <= max && fits(lines, fontSize)) return withHint({ lines, fontSize, lineHeight: fontSize * 1.18 });
  }
  // Hyphenate, but split each word at most once if any size allows it
  // ("Consoli-dation" rather than "Conso-lida-tion").
  const words = title.trim().split(/\s+/);
  for (const once of [true, false]) {
    for (const fontSize of sizes) {
      const max = charsFor(r, fontSize, em);
      if (once && words.some(w => hyphenate(w, max).length > 2)) continue;
      const lines = wrap(title, max);
      if (fits(lines, fontSize)) return withHint({ lines, fontSize, lineHeight: fontSize * 1.18 });
    }
  }
  const fontSize = sizes[sizes.length - 1];
  const lines = wrap(title, charsFor(r, fontSize, em));
  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = cut[maxLines - 1].replace(/-?$/, '\u2026');
  return withHint({ lines: cut, fontSize, lineHeight: fontSize * 1.18 });
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

/**
 * Shortest centre-to-neighbour distance at which every full pattern stays
 * PATTERN_GAP clear: of the centre's pattern, and of the patterns of the
 * neighbours on either side (n evenly spaced neighbours of radius r).
 */
export function neighbourDistance(n: number, r: number): number {
  const fromCenter = R_CENTER + r + 2 * PATTERN_REACH + PATTERN_GAP;
  if (n < 2) return fromCenter;
  const fromEachOther = (2 * r + 2 * PATTERN_REACH + PATTERN_GAP) / (2 * Math.sin(Math.PI / n));
  return Math.max(fromCenter, fromEachOther);
}

/** Font sizes with nothing below min (natural units). */
const atLeast = (sizes: number[], min: number) => [...new Set(sizes.map(s => Math.max(s, Math.round(min * 10) / 10)))];

/**
 * Lays out one web, packed tight: neighbours sit at neighbourDistance, so
 * the visible strand between two patterns is only about PATTERN_GAP long.
 * WebCanvas then scales the whole drawing up to fill its area.
 *
 * aspect (area height / width) picks between the two symmetric turns of
 * the ring (e.g. four on the diagonals or on the axes), whichever fills the
 * area better. minFont keeps labels from shrinking below that size in
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
    // Room below the title for the small "TAP TO STUDY" line.
    label: fitLabel(input.centerTitle, R_CENTER, atLeast(CENTER_SIZES, minFont), 3, 0.64, HINT_ROOM),
  };

  const items = [
    ...shown.map(n => ({ id: n.id, title: n.title, hiddenIds: undefined as string[] | undefined })),
    ...(hidden.length ? [{ id: 'more', title: '+' + hidden.length + ' more', hiddenIds: hidden.map(h => h.id) }] : []),
  ];
  const n = items.length;
  const d = neighbourDistance(n, r);

  // Bounding box (pattern room included) for one turn of the ring.
  const boxFor = (dirs: number[]) => {
    const pts = [{ x: 0, y: 0, r: R_CENTER }, ...dirs.map(a => ({ x: Math.cos(a) * d, y: Math.sin(a) * d, r }))];
    const minX = Math.min(...pts.map(p => p.x - p.r - EDGE_ROOM));
    const maxX = Math.max(...pts.map(p => p.x + p.r + EDGE_ROOM));
    const minY = Math.min(...pts.map(p => p.y - p.r - EDGE_ROOM));
    const maxY = Math.max(...pts.map(p => p.y + p.r + EDGE_ROOM));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
  const fill = (b: { w: number; h: number }) => Math.min(1 / b.w, aspect / b.h); // relative scale in the area
  let dirs = angles(n);
  if (n >= 2) {
    const turned = dirs.map(a => a + Math.PI / n);
    if (fill(boxFor(turned)) > fill(boxFor(dirs)) * 1.001) dirs = turned;
  }

  const sizes = atLeast(NODE_SIZES, minFont);
  const placed: PlacedNode[] = items.map((it, i) => ({
    ...it, x: Math.cos(dirs[i]) * d, y: Math.sin(dirs[i]) * d, r, label: fitLabel(it.title, r, sizes),
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

  return { center, nodes: placed, strands, box: boxFor(dirs) };
}
