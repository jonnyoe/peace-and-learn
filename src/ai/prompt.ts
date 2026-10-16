import type { Generated } from '../db';

export type KnownConcept = { id: string; title: string; domain: string };

// Shared by the on-device model and the cloud server.
export const SYSTEM = `You turn study material into a knowledge graph and spaced-repetition flashcards.

Respond with ONLY a JSON object in this shape:
{
  "concepts": [{ "key": string, "title": string, "summary": string }],
  "links":    [{ "from": string, "to": string, "type": "prerequisite" | "related" }],
  "cards":    [{ "conceptKey": string, "front": string, "back": string }]
}

Concepts
- Extract 3 to 8 distinct, reusable ideas from the material. Titles are short noun phrases.
- Summaries are one plain sentence.
- New concepts use keys "new:1", "new:2", and so on.
- If the material covers a concept the learner already knows, do not duplicate it.
  Use that concept's id as the key.

Links
- "prerequisite" means "from" should be understood before "to".
- "related" means the ideas illuminate each other.
- Link new concepts to known ones when there is a genuine connection. Never invent weak links.
- Keys in links must be a new key you defined or a known concept id.

Cards
- One idea per card. The front is a question that forces recall.
- Backs are short: under 25 words.
- 1 to 3 cards per concept. Prefer "why" and "how" questions where the material supports it.
- Every card's conceptKey must match a concept key.`;

export function userMessage(text: string, domain: string, known: KnownConcept[]) {
  const list = known.length
    ? known.map(c => `- id: ${c.id} | ${c.title} (${c.domain})`).join('\n')
    : '(none yet)';
  return `Subject: ${domain}\n\nConcepts the learner already knows:\n${list}\n\nMaterial:\n"""\n${text}\n"""`;
}

// JSON schema used for grammar-constrained decoding on device,
// so even a small model can't produce malformed JSON.
export const SCHEMA = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' } },
        required: ['key', 'title', 'summary'],
      },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string', enum: ['prerequisite', 'related'] },
        },
        required: ['from', 'to', 'type'],
      },
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { conceptKey: { type: 'string' }, front: { type: 'string' }, back: { type: 'string' } },
        required: ['conceptKey', 'front', 'back'],
      },
    },
  },
  required: ['concepts', 'links', 'cards'],
};

export function parseJson(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
}

// Drops anything that points at a concept that doesn't exist.
export function validate(g: any, knownIds: string[]): Generated {
  const concepts = (g.concepts ?? []).filter((c: any) => c?.key && c?.title);
  const keys = new Set<string>([...concepts.map((c: any) => c.key), ...knownIds]);
  return {
    concepts,
    links: (g.links ?? []).filter((l: any) =>
      keys.has(l.from) && keys.has(l.to) && l.from !== l.to && ['prerequisite', 'related'].includes(l.type)),
    cards: (g.cards ?? []).filter((c: any) => keys.has(c.conceptKey) && c.front && c.back),
  };
}

// Splits long material on paragraph boundaries so small models stay within context.
export function chunk(text: string, maxChars: number): string[] {
  const paras = text.split(/\n\s*\n/);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > maxChars) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
    while (cur.length > maxChars) { out.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
