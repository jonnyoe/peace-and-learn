import { Card, fsrs, generatorParameters, State } from 'ts-fsrs';

// Derived values per bubble (docs/knowledge-web-spec.md, section 3), worked
// out from FSRS card state and never stored. No React or database here, so
// it can be tested in plain Node.

const f = fsrs(generatorParameters());

export const FADED_BELOW = 0.85;            // recall under this: faded bubble
export const LACE_DAYS = [3, 7, 21, 60, 180]; // stability thresholds, one per lace layer

/** A card counts once it has been reviewed at least once. */
export const isReviewed = (c: Card) => c.state !== State.New && !!c.last_review;

/** Chance of recalling the card right now, or null for a card never reviewed. */
export function cardRecall(c: Card, now: Date): number | null {
  return isReviewed(c) ? f.get_retrievability(c, now, false) : null;
}

export type BubbleStats = {
  recall: number | null; // average recall of reviewed cards; null if none reviewed
  strength: number;      // average stability (days) of reviewed cards
  lace: number;          // 0 to 5 layers
  faded: boolean;
};

export const laceLevel = (strength: number) => LACE_DAYS.filter(d => strength >= d).length;

/**
 * Recall and strength average only reviewed cards, so adding a new card to
 * a bubble doesn't thin its lace (the spec wants the lace to almost never
 * shrink). A bubble with no reviewed cards has lace 0 and is not faded.
 */
export function bubbleStats(cards: Card[], now: Date): BubbleStats {
  const seen = cards.filter(isReviewed);
  if (!seen.length) return { recall: null, strength: 0, lace: 0, faded: false };
  const recall = seen.reduce((s, c) => s + f.get_retrievability(c, now, false), 0) / seen.length;
  const strength = seen.reduce((s, c) => s + c.stability, 0) / seen.length;
  return { recall, strength, lace: laceLevel(strength), faded: recall < FADED_BELOW };
}

/**
 * Cards for a study session, lowest recall first, so faded bubbles are
 * practised first. Cards never reviewed rank as if right at the fading
 * line: after faded ones, before ones that are still well known.
 */
export function orderForStudy<T extends { fsrs: Card }>(cards: T[], now: Date, limit: number): T[] {
  return cards
    .map((c, i) => ({ c, i, k: cardRecall(c.fsrs, now) ?? FADED_BELOW }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .slice(0, limit)
    .map(x => x.c);
}
