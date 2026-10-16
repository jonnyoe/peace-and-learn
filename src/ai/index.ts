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

/**
 * Generates a draft from material. On device, long text is split into parts;
 * concepts found in earlier parts are passed to later ones, so the draft links
 * to itself as well as to the existing deck.
 */
export async function generate(
  text: string, domain: string, known: KnownConcept[], onStatus: (s: string) => void,
): Promise<Generated> {
  if (getEngine() === 'cloud') {
    onStatus('Sending to server…');
    return validate(await generateCloud(text, domain, known), known.map(k => k.id));
  }

  cancelled = false;
  // Small models have small context windows: cap what we send.
  const parts = chunk(text, 3500);
  const draft: Generated = { concepts: [], links: [], cards: [] };

  for (let i = 0; i < parts.length; i++) {
    const prefix = `p${i + 1}:`;
    const knownNow: KnownConcept[] = [
      ...draft.concepts.map(c => ({ id: c.key, title: c.title, domain })),
      ...known,
    ].slice(0, 60);

    const label = parts.length > 1 ? `Part ${i + 1} of ${parts.length}. ` : '';
    const raw = await generateLocal(getModelId(), parts[i], domain, knownNow, s => onStatus(label + s));

    if (cancelled) throw new Error('Stopped.');

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

  if (!draft.cards.length) throw new Error('The model did not return usable cards. Try a shorter passage or a larger model.');
  return draft;
}
