import { useState } from 'react';
import { Grade, Rating } from 'ts-fsrs';
import { getConceptCards, getStudyCards, saveReview, WebKey, WebStudyCard } from '../db';
import { bubbleStats, orderForStudy } from '../knowledge';
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

const laceOf = (conceptId: string, now: Date) => bubbleStats(getConceptCards(conceptId), now).lace;

export function useStudySession(webKey: WebKey) {
  const [s, setS] = useState<Session>(OFF);

  function start() {
    const queue = orderForStudy(getStudyCards(webKey), new Date(), SESSION_SIZE);
    setS({ ...OFF, phase: queue.length ? 'card' : 'summary', queue });
  }

  function reveal() {
    setS(p => ({ ...p, revealed: true }));
  }

  function rate(grade: Grade) {
    const card = s.queue[s.index];
    if (!card) return;
    const now = new Date();
    const before = laceOf(card.concept_id, now);
    const next = schedule(card, grade);
    saveReview(card.id, next, grade);
    const after = laceOf(card.concept_id, now);

    const grew = after > before && !s.grew.some(g => g.id === card.concept_id)
      ? [...s.grew, { id: card.concept_id, title: card.concept_title }] : s.grew;
    const again = grade === Rating.Again || next.due.getTime() - now.getTime() < AGAIN_WITHIN_MS;
    const sendBack = again && !s.requeued.includes(card.id);
    const queue = sendBack ? [...s.queue, { ...card, fsrs: next }] : s.queue;
    const index = s.index + 1;
    setS({
      ...s, queue, index, grew, revealed: false, reviewed: s.reviewed + 1,
      requeued: sendBack ? [...s.requeued, card.id] : s.requeued,
      phase: index < queue.length ? 'card' : 'summary',
    });
  }

  /** End session: shows the summary (the caller skips it if nothing was rated). */
  function end() {
    setS(p => ({ ...p, phase: 'summary', revealed: false }));
  }

  function close() {
    setS(OFF);
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
