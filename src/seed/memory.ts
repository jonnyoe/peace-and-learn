import { Card, createEmptyCard, forgetting_curve, fsrs, generatorParameters, Grade, Rating } from 'ts-fsrs';

// The "Memory" sample subject from docs/knowledge-web-spec.md (section 2).
// Pure data plus a small FSRS simulation: no database access here, so it can
// be tested outside the app. src/db.ts writes it to SQLite.
//
// Every id starts with "sample-", which is how removeSample() finds it.

export const SAMPLE_PREFIX = 'sample-';
export const SAMPLE_DOMAIN = 'memory';
export const SAMPLE_CATEGORY = 'Psychology';

// What each bubble should look like when the sample is added, so the web
// matches the mockups: stability (days) sets the lace level
// (thresholds 3, 7, 21, 60, 180) and recall sets faded / satellite colour
// (below 0.85 faded, 0.85-0.9 white, 0.9 and up black).
type Target = { stability: [number, number]; recall: number };

export type SampleBubble = {
  slug: string;
  title: string;
  summary: string;
  parent: string | null; // slug of the bubble whose web this one sits in
  motif: string;
  target: Target;
  cards: [string, string][];
};

const L1: [number, number] = [3.2, 6.9];
const L2: [number, number] = [14, 19];
const L3: [number, number] = [30, 55];
const L4: [number, number] = [80, 160];
const L5: [number, number] = [200, 400];

// Order matters: neighbours are laid out around the centre in this order.
export const BUBBLES: SampleBubble[] = [
  // ---------- Memory (top-level web) ----------
  {
    slug: 'memory', title: 'Memory', parent: null, motif: 'neuron',
    summary: 'How the mind encodes, stores and retrieves information.',
    target: { stability: L5, recall: 0.95 },
    cards: [
      ['What are the three basic stages of memory?', 'Encoding, storage and retrieval.'],
      ['What is the difference between working memory and long-term memory?', 'Working memory holds a few items briefly while you use them; long-term memory stores a vast amount for a long time.'],
    ],
  },
  {
    slug: 'working-memory', title: 'Working memory', parent: 'memory', motif: 'orbit',
    summary: 'A small, short-lived workspace for holding and manipulating information.',
    target: { stability: L5, recall: 0.93 },
    cards: [
      ['What is working memory?', 'A limited system that holds a few items active for a short time so you can use them.'],
      ['Who proposed the multicomponent model of working memory?', 'Alan Baddeley and Graham Hitch, in 1974.'],
    ],
  },
  {
    slug: 'long-term-memory', title: 'Long-term memory', parent: 'memory', motif: 'rings',
    summary: 'The durable store of knowledge, experiences and skills.',
    target: { stability: L5, recall: 0.94 },
    cards: [
      ['What are the two main kinds of long-term memory?', 'Explicit (declarative: episodic and semantic) and implicit (non-declarative, such as procedural).'],
      ['Is long-term memory capacity limited in practice?', 'No known practical limit; the bottleneck is encoding and retrieval, not space.'],
    ],
  },
  {
    slug: 'attention', title: 'Attention', parent: 'memory', motif: 'rays',
    summary: 'Selecting what to process and keeping it in focus.',
    target: { stability: L2, recall: 0.91 },
    cards: [
      ['How does attention connect to working memory?', 'Attention decides what enters working memory and keeps it active; what you don\u2019t attend to is mostly lost.'],
      ['What does the cocktail party effect show about attention?', 'We filter out most input but still notice important signals, like our own name.'],
    ],
  },
  {
    slug: 'chunking', title: 'Chunking', parent: 'memory', motif: 'chunks',
    summary: 'Grouping items into larger meaningful units.',
    target: { stability: L1, recall: 0.78 },
    cards: [
      ['What is chunking?', 'Grouping separate items into bigger, meaningful units, so more information fits in working memory at once.'],
      ['Why can chess masters recall whole board positions?', 'They see familiar patterns as single chunks instead of separate pieces.'],
    ],
  },

  // ---------- Working memory's web ----------
  {
    slug: 'central-executive', title: 'Central executive', parent: 'working-memory', motif: 'hub',
    summary: 'Directs attention and coordinates the other parts of working memory.',
    target: { stability: L4, recall: 0.93 },
    cards: [
      ['What does the central executive do?', 'Directs attention, switches between tasks and coordinates the loop and the sketchpad.'],
      ['Does the central executive store information itself?', 'No. It controls and coordinates; storage happens in the subsystems.'],
    ],
  },
  {
    slug: 'capacity-limit', title: 'Capacity limit', parent: 'working-memory', motif: 'slots',
    summary: 'Working memory holds only about four chunks at once.',
    target: { stability: L5, recall: 0.87 },
    cards: [
      ['About how many chunks can working memory hold?', 'Around four (Cowan), revised down from Miller\u2019s \u201cseven, plus or minus two\u201d.'],
      ['What usually happens when working memory overflows?', 'Items are dropped or overwritten, and errors rise.'],
    ],
  },
  {
    slug: 'phonological-loop', title: 'Phonological loop', parent: 'working-memory', motif: 'wave',
    summary: 'Holds sounds and words, refreshed by inner speech.',
    target: { stability: L4, recall: 0.88 },
    cards: [
      ['What are the two parts of the phonological loop?', 'The phonological store (inner ear) and articulatory rehearsal (inner voice).'],
      ['What is the word-length effect?', 'Lists of short words are remembered better than lists of long words.'],
    ],
  },
  {
    slug: 'visuospatial-sketchpad', title: 'Visuospatial sketchpad', parent: 'working-memory', motif: 'sketch',
    summary: 'Holds images and spatial layouts for a short time.',
    target: { stability: L1, recall: 0.75 },
    cards: [
      ['What does the visuospatial sketchpad hold?', 'Visual images and spatial information, like the layout of a room.'],
      ['Why is it hard to track two visual tasks at once?', 'They compete for the same visuospatial sketchpad.'],
    ],
  },

  // ---------- Central executive's web ----------
  {
    slug: 'planning', title: 'Planning', parent: 'central-executive', motif: 'rays',
    summary: 'Ordering steps toward a goal.',
    target: { stability: L3, recall: 0.94 },
    cards: [['Which part of working memory sequences steps toward a goal?', 'The central executive, through planning.']],
  },
  {
    slug: 'inhibition', title: 'Inhibition', parent: 'central-executive', motif: 'slots',
    summary: 'Holding back habits and distractions.',
    target: { stability: L2, recall: 0.88 },
    cards: [['What does the Stroop task measure?', 'Inhibition: suppressing the automatic urge to read the word instead of naming its colour.']],
  },
  {
    slug: 'task-switching', title: 'Task switching', parent: 'central-executive', motif: 'orbit',
    summary: 'Moving attention between tasks, at a cost.',
    target: { stability: L1, recall: 0.72 },
    cards: [['What is a switch cost?', 'The slower, less accurate response right after changing from one task to another.']],
  },

  // ---------- Long-term memory's web ----------
  {
    slug: 'episodic-memory', title: 'Episodic memory', parent: 'long-term-memory', motif: 'rings',
    summary: 'Memories of personal events in time and place.',
    target: { stability: L3, recall: 0.95 },
    cards: [['What is episodic memory?', 'Memory for specific personal experiences: what happened, where and when.']],
  },
  {
    slug: 'semantic-memory', title: 'Semantic memory', parent: 'long-term-memory', motif: 'neuron',
    summary: 'General knowledge and facts.',
    target: { stability: L4, recall: 0.88 },
    cards: [['How does semantic memory differ from episodic memory?', 'It stores facts and meanings without the personal context of when you learned them.']],
  },
  {
    slug: 'procedural-memory', title: 'Procedural memory', parent: 'long-term-memory', motif: 'wave',
    summary: 'Skills and habits you perform without thinking.',
    target: { stability: L5, recall: 0.93 },
    cards: [['Give an example of procedural memory.', 'Riding a bike or typing: skills performed without conscious recall.']],
  },
  {
    slug: 'consolidation', title: 'Consolidation', parent: 'long-term-memory', motif: 'hub',
    summary: 'Stabilising new memories over time, much of it during sleep.',
    target: { stability: L1, recall: 0.7 },
    cards: [['What is memory consolidation?', 'The process that stabilises a new memory after learning, much of it during sleep.']],
  },
  {
    slug: 'retrieval', title: 'Retrieval', parent: 'long-term-memory', motif: 'rays',
    summary: 'Bringing stored information back to mind.',
    target: { stability: L3, recall: 0.87 },
    cards: [['What is the testing effect?', 'Practising retrieval strengthens memory more than re-reading does.']],
  },
  {
    slug: 'forgetting', title: 'Forgetting', parent: 'long-term-memory', motif: 'sketch',
    summary: 'Losing access to stored information over time.',
    target: { stability: L2, recall: 0.92 },
    cards: [['What does the Ebbinghaus forgetting curve show?', 'Memory drops fast soon after learning, then more slowly; reviews flatten the curve.']],
  },
];

// A to-do's home web is given by web (slug of that web's centre bubble;
// null = the top-level web). bubble is the bubble it is linked to.
export const TODOS: { slug: string; text: string; web: string | null; bubble: string | null; done: boolean }[] = [
  { slug: 'read-ch4', text: 'Read ch. 4 on working memory', web: 'working-memory', bubble: 'working-memory', done: false },
  { slug: 'review-chunking', text: 'Review Chunking', web: null, bubble: 'chunking', done: false },
  { slug: 'lecture-notes', text: 'Add notes from Tuesday\u2019s lecture', web: null, bubble: 'memory', done: true },
  { slug: 'sketch-baddeley', text: 'Sketch Baddeley\u2019s model from memory', web: 'working-memory', bubble: 'central-executive', done: false },
];

export const sampleId = (slug: string) => SAMPLE_PREFIX + slug;

// ---------- FSRS history simulation ----------
// Seed cards get a believable review history so lace and fading show from
// the start. No fuzz, so the sample looks the same on every install.
const sim = fsrs(generatorParameters({ enable_fuzz: false }));
const DAY = 86_400_000;

export type SimulatedCard = { card: Card; reviews: { rating: Grade; at: Date }[] };

// Review times tried at each step, as a fraction of the current interval.
// Reviewing early grows stability less, which lets the simulation land
// inside a narrow stability range.
const TIMING = [0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1];

/**
 * Reviews a new card again and again, choosing the rating and review time
 * that grow stability fastest without overshooting target.stability. Then
 * shifts the whole history so the last review is just long enough ago that
 * recall today equals target.recall.
 */
export function simulate(target: Target, now: Date): SimulatedCard {
  const [lo, hi] = target.stability;
  let card = createEmptyCard(new Date(0));
  const reviews: { rating: Grade; at: Date }[] = [];

  for (let i = 0; i < 40; i++) {
    const from = card.last_review?.getTime() ?? card.due.getTime();
    const span = card.due.getTime() - from;
    const options = TIMING.flatMap(k => {
      const at = new Date(from + span * k);
      return ([Rating.Easy, Rating.Good, Rating.Hard] as Grade[])
        .map(g => ({ g, at, next: sim.next(card, at, g).card }));
    });
    const fits = options.filter(o => o.next.stability <= hi);
    const pick = fits.length
      ? fits.reduce((a, b) => (b.next.stability > a.next.stability ? b : a))
      : options.reduce((a, b) => (b.next.stability < a.next.stability ? b : a));
    card = pick.next;
    reviews.push({ rating: pick.g, at: pick.at });
    if (card.stability >= lo) break;
  }

  // Days since the last review that give the wanted recall (binary search on
  // the FSRS forgetting curve, which falls as time passes).
  let a = 0, b = card.stability * 50;
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (forgetting_curve(sim.parameters.w, mid, card.stability) > target.recall) a = mid; else b = mid;
  }
  const lastAt = now.getTime() - a * DAY;
  const shift = lastAt - card.last_review!.getTime();
  const move = (d: Date) => new Date(d.getTime() + shift);

  return {
    card: { ...card, due: move(card.due), last_review: move(card.last_review!) },
    reviews: reviews.map(r => ({ ...r, at: move(r.at) })),
  };
}

/** Recall right now, for checks. */
export const recallOf = (card: Card, now: Date) => sim.get_retrievability(card, now, false);
