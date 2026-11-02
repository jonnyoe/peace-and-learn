import { useRef, useState } from 'react';
import { Grade, Rating } from 'ts-fsrs';
import { bubbleLace, getStudyCards, saveReview, WebKey, WebStudyCard } from '../db';
import { orderForStudy } from '../knowledge';
import { rate as schedule } from '../scheduler';

// One study session for a web (spec section 4b): the cards of this web and
// its nested webs, lowest recall first. Each rating is saved with FSRS right
// away, so ending early keeps what was done.

export const SESSION_SIZE = 10;
const AGAIN_WITHIN_MS = 10 * 60 * 1000; // cards due again this soon come back at the end

export type Phase = 'off' | 'card' | 'summary';

type Session = {
  phase: Phase;
  queue: WebStudyCard[];
  index: number;
  revealed: boolean;
  reviewed: number;
  grew: { id: string; title: string }[]; // bubbles whose lace gained a layer
  requeued: string[];                    // card ids already sent round again (once each)
};

const OFF: Session = { phase: 'off', queue: [], index: 0, revealed: false, reviewed: 0, grew: [], requeued: [] };

export function useStudySession(webKey: WebKey) {
  const [s, setState] = useState<Session>(OFF);
  // The latest session, updated synchronously. Actions read this instead of
  // the rendered state, so a fast double tap on a rating can't rate the same
  // card twice or skip one.
  const ref = useRef<Session>(OFF);
  const set = (next: Session) => { ref.current = next; setState(next); };

  /** Always a brand-new session: fresh queue, first card, answer hidden. */
  function start() {
    const queue = orderForStudy(getStudyCards(webKey), new Date(), SESSION_SIZE);
    set({ ...OFF, phase: queue.length ? 'card' : 'summary', queue });
  }

  function reveal() {
    if (ref.current.phase === 'card') set({ ...ref.current, revealed: true });
  }

  function rate(grade: Grade) {
    const s = ref.current;
    const card = s.phase === 'card' && s.revealed ? s.queue[s.index] : undefined;
    if (!card) return;
    const now = new Date();
    const before = bubbleLace(card.concept_id, now);
    const next = schedule(card, grade);
    saveReview(card.id, next, grade);
    const after = bubbleLace(card.concept_id, now);

    const grew = after > before && !s.grew.some(g => g.id === card.concept_id)
      ? [...s.grew, { id: card.concept_id, title: card.concept_title }] : s.grew;
    const again = grade === Rating.Again || next.due.getTime() - now.getTime() < AGAIN_WITHIN_MS;
    const sendBack = again && !s.requeued.includes(card.id);
    const queue = sendBack ? [...s.queue, { ...card, fsrs: next }] : s.queue;
    const index = s.index + 1;
    // The next card shows at once; a new lace layer fades in on the web
    // (WebCanvas) at the same time.
    set({
      ...s, queue, index, grew, revealed: false, reviewed: s.reviewed + 1,
      requeued: sendBack ? [...s.requeued, card.id] : s.requeued,
      phase: index < queue.length ? 'card' : 'summary',
    });
  }

  /** End session: shows the summary (the caller skips it if nothing was rated). */
  function end() {
    if (ref.current.phase === 'card') set({ ...ref.current, phase: 'summary', revealed: false });
  }

  /** Clears everything: queue, position, revealed answer, what grew. */
  function close() {
    set(OFF);
  }

  return {
    phase: s.phase,
    card: s.phase === 'card' ? s.queue[s.index] : undefined,
    index: s.index,
    total: s.queue.length,
    revealed: s.revealed,
    reviewed: s.reviewed,
    grew: s.grew,
    empty: s.phase === 'summary' && s.queue.length === 0,
    start, reveal, rate, end, close,
  };
}
