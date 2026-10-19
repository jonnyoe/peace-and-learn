import { Generated, getSetting } from '../db';
import { generateLocal, stopGenerating } from './local';
import { generateCloud } from './cloud';
import { chunk, KnownConcept, parseJson, validate } from './prompt';

export type Engine = 'local' | 'cloud';

let cancelled = false;
export async function cancel() {
  cancelled = true;
  await stopGenerating();
}

export const getEngine = (): Engine => (getSetting('engine') as Engine) ?? 'local';
export const getModelId = () => getSetting('model') ?? 'qwen3-1.7b';

// A draft plus how far generation got. When the user taps Stop, the cards from
// the parts that finished are kept: `stopped` is true and `partsCompleted`
// says how many parts made it.
export type Draft = Generated & { stopped: boolean; partsCompleted: number; partsTotal: number };

/**
 * Generates a draft from material. On device, long text is split into parts;
 * concepts found in earlier parts are passed to later ones, so the draft links
 * to itself as well as to the existing deck.
 *
 * `input` is either raw text (split here) or parts that are already split,
 * for example page-aligned parts from an imported document.
 * `label` prefixes progress, e.g. "Pages 3–5" gives "Pages 3–5: part 2 of 6".
 */
export async function generate(
  input: string | string[], domain: string, known: KnownConcept[], onStatus: (s: string) => void,
  label?: string,
): Promise<Draft> {
  const text = Array.isArray(input) ? input.join('\n\n') : input;

  if (getEngine() === 'cloud') {
    onStatus(label ? `${label}: sending to server…` : 'Sending to server…');
    const g = validate(await generateCloud(text, domain, known), known.map(k => k.id));
    const n = Array.isArray(input) ? input.length : 1;
    return { ...g, stopped: false, partsCompleted: n, partsTotal: n };
  }

  cancelled = false;
  // Small models have small context windows: cap what we send.
  const parts = Array.isArray(input) ? input : chunk(text, 3500);
  const draft: Generated = { concepts: [], links: [], cards: [] };
  let completed = 0;

  for (let i = 0; i < parts.length; i++) {
    if (cancelled) break;
    const prefix = `p${i + 1}:`;
    const knownNow: KnownConcept[] = [
      ...draft.concepts.map(c => ({ id: c.key, title: c.title, domain })),
      ...known,
    ].slice(0, 60);

    const tag = label
      ? `${label}: part ${i + 1} of ${parts.length}. `
      : parts.length > 1 ? `Part ${i + 1} of ${parts.length}. ` : '';
    let raw: string;
    try {
      raw = await generateLocal(getModelId(), parts[i], domain, knownNow, s => onStatus(tag + s));
    } catch (e) {
      if (cancelled) break;
      throw e;
    }

    // A part interrupted by Stop is incomplete: drop it, keep earlier parts.
    if (cancelled) break;
    completed = i + 1;

    let g: Generated;
    try {
      g = validate(parseJson(raw), knownNow.map(k => k.id));
    } catch {
      continue; // skip a part the model garbled rather than failing the whole import
    }

    // Give this part's "new:N" keys a unique prefix so parts don't collide.
    const rename = (k: string) => (k.startsWith('new:') ? prefix + k.slice(4) : k);
    const knownIds = new Set(knownNow.map(k => k.id));
    draft.concepts.push(...g.concepts.filter(c => !knownIds.has(c.key)).map(c => ({ ...c, key: rename(c.key) })));
    g.links.forEach(l => draft.links.push({ ...l, from: rename(l.from), to: rename(l.to) }));
    g.cards.forEach(c => draft.cards.push({ ...c, conceptKey: rename(c.conceptKey) }));
  }

  if (cancelled) {
    if (!draft.cards.length) throw new Error('Stopped before any cards were finished.');
    return { ...draft, stopped: true, partsCompleted: completed, partsTotal: parts.length };
  }
  if (!draft.cards.length) throw new Error('The model did not return usable cards. Try a shorter passage or a larger model.');
  return { ...draft, stopped: false, partsCompleted: parts.length, partsTotal: parts.length };
}
