import { useEffect, useRef, useState } from 'react';
import { Grade, Rating } from 'ts-fsrs';
import { bubbleLace, getStudyCards, saveReview, WebKey, WebStudyCard } from '../db';
import { orderForStudy } from '../knowledge';
import { LACE_GROW_MS } from '../web/motifs';
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
  pausing: boolean;                      // a lace layer is fading in; the next card waits
};

const OFF: Session = { phase: 'off', queue: [], index: 0, revealed: false, reviewed: 0, grew: [], requeued: [], pausing: false };

export function useStudySession(webKey: WebKey) {
  const [s, setState] = useState<Session>(OFF);
  // The latest session, updated synchronously. Actions read this instead of
  // the rendered state, so a fast double tap on a rating can't rate the same
  // card twice or skip one.
  const ref = useRef<Session>(OFF);
  const set = (next: Session) => { ref.current = next; setState(next); };

  // When a rating grows a bubble's lace, the rated card stays up (buttons
  // inert) while the new layer fades in; then the next card shows.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Session | null>(null);
  const cancelPause = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    return next;
  };
  useEffect(() => () => { cancelPause(); }, []);

  /** Always a brand-new session: fresh queue, first card, answer hidden. */
  function start() {
    cancelPause();
    const queue = orderForStudy(getStudyCards(webKey), new Date(), SESSION_SIZE);
    set({ ...OFF, phase: queue.length ? 'card' : 'summary', queue });
  }

  function reveal() {
    if (ref.current.phase === 'card') set({ ...ref.current, revealed: true });
  }

  function rate(grade: Grade) {
    const s = ref.current;
    const card = s.phase === 'card' && s.revealed && !s.pausing ? s.queue[s.index] : undefined;
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
    const nextSession: Session = {
      ...s, queue, index, grew, revealed: false, reviewed: s.reviewed + 1, pausing: false,
      requeued: sendBack ? [...s.requeued, card.id] : s.requeued,
      phase: index < queue.length ? 'card' : 'summary',
    };
    if (after <= before) {
      set(nextSession);
      return;
    }
    // Re-render now (so the web starts the fade), move on once it's done.
    set({ ...s, grew, reviewed: nextSession.reviewed, pausing: true });
    pending.current = nextSession;
    timer.current = setTimeout(() => {
      const next = cancelPause();
      if (next) set(next);
    }, LACE_GROW_MS);
  }

  /** End session: shows the summary (the caller skips it if nothing was rated). */
  function end() {
    const s = cancelPause() ?? ref.current;
    if (s.phase === 'card' || s.phase === 'summary') set({ ...s, phase: 'summary', revealed: false, pausing: false });
  }

  /** Clears everything: queue, position, revealed answer, what grew. */
  function close() {
    cancelPause();
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
    pausing: s.pausing,
    start, reveal, rate, end, close,
  };
}
