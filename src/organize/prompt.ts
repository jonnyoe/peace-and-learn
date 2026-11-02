// Organizing a crowded web into groups (docs/knowledge-web-ai-growth.md,
// item 12). The prompt, the JSON schema for grammar-constrained decoding,
// and the checks on what comes back. No React or database here, so it can
// be tested in plain Node.

export const MIN_MEMBERS = 2;     // a group needs at least this many bubbles
export const MAX_GROUPS = 6;
export const TITLE_MAX = 40;      // characters
export const REASON_MAX = 140;

export type OrganizeBubble = { id: string; title: string; summary: string };
export type ProposedGroup = { title: string; reason: string; memberIds: string[] };
export type Proposal = { groups: ProposedGroup[]; leftIds: string[] };

/** Thrown when the model's reply can't be used. message is shown as is. */
export class InvalidProposal extends Error {}

// Two short calls work far better for a small model than one long one:
// 1. name the topics; 2. sort each bubble into one of those topics, where
// the only allowed answers are the topic titles themselves (or "none").

const RULES = `- Topic titles are short noun phrases (1 to 4 words) naming a real shared theme, never a catch-all like "General", "Other" or "Best Practices", and differ from the subject's name.
- A topic's reason is one short sentence, in your own words, saying what its bubbles have in common. Not a list of bubble titles.`;

export const TOPICS_SYSTEM = `You organize a learner's knowledge map. The map shows bubbles (ideas) around a subject. When there are too many, related bubbles are grouped under topics: each topic becomes one new bubble that contains its members.

Read the bubbles and name the topics they fall into. Respond with ONLY a JSON object:
{ "topics": [{ "title": string, "reason": string }] }

Rules
${RULES}
- Pick topics that most bubbles clearly belong to, so that nearly every bubble fits one of them.
- Every topic should have at least 2 bubbles.`;

export const ASSIGN_SYSTEM = `You organize a learner's knowledge map. The bubbles (ideas) of one subject are being sorted into topics that were already chosen.

Respond with ONLY a JSON object that gives, for every bubble in "assign", the title of the topic it belongs to, or "none".

Rules
- Judge each bubble by its meaning: would a teacher file it under that topic?
- Place nearly every bubble; use "none" only for a bubble that fits no topic.`;

/** Short ids (b1, b2, ...) keep the reply small and easy for a small model. */
export function shortIds(bubbles: OrganizeBubble[]): string[] {
  return bubbles.map((_, i) => 'b' + (i + 1));
}

const clip = (s: string, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '\u2026' : t;
};
const safe = (s: string) => s.replace(/["\\]/g, '');

const bubbleList = (bubbles: OrganizeBubble[]) => shortIds(bubbles)
  .map((id, i) => '- ' + id + ': ' + clip(bubbles[i].title, 80) + (bubbles[i].summary ? ' \u2014 ' + clip(bubbles[i].summary, 110) : ''))
  .join('\n');

/**
 * How many topics to ask for, and how many bubbles may stay out, so the
 * web ends up showing 3 to 6 items where possible.
 */
export function targetFor(count: number): { groups: number; left: number } {
  const groups = Math.min(MAX_GROUPS, Math.max(2, Math.ceil(count / 5)));
  return { groups, left: Math.max(1, 6 - groups) };
}

export function topicsMessage(subject: string, bubbles: OrganizeBubble[]): string {
  const t = targetFor(bubbles.length);
  return 'Subject: ' + subject + '\n\nBubbles (' + bubbles.length + '):\n' + bubbleList(bubbles) +
    '\n\nName about ' + t.groups + ' topics.';
}

export type Topic = { title: string; reason: string };

export const topicsSchema = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      minItems: 2,
      maxItems: MAX_GROUPS,
      items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'] },
    },
  },
  required: ['topics'],
};

function parseObject(raw: string): any {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  } catch {
    throw new InvalidProposal('The model\'s answer wasn\'t valid JSON, so nothing was changed.');
  }
}

/** Topics from the first call: titles clipped, made safe, without repeats. */
export function parseTopics(raw: string): Topic[] {
  const json = parseObject(raw);
  const seen = new Set<string>();
  const topics: Topic[] = [];
  for (const t of Array.isArray(json?.topics) ? json.topics.slice(0, MAX_GROUPS) : []) {
    const title = clip(safe(String(t?.title ?? '')), TITLE_MAX);
    if (!title || title.toLowerCase() === 'none' || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    topics.push({ title, reason: clip(String(t?.reason ?? ''), REASON_MAX) });
  }
  if (topics.length < 1) throw new InvalidProposal('The model didn\'t name any topics, so nothing was changed.');
  return topics;
}

/**
 * Keys of "assign": the short id plus the bubble's title, so the model sees
 * which bubble it is deciding on right where it decides.
 */
export function assignKeys(bubbles: OrganizeBubble[]): string[] {
  return shortIds(bubbles).map((id, i) => id + ' ' + clip(safe(bubbles[i].title).replace(/\n/g, ' '), 40));
}

export function assignMessage(subject: string, bubbles: OrganizeBubble[], topics: Topic[]): string {
  return 'Subject: ' + subject + '\n\nTopics:\n' + topics.map(t => '- ' + t.title + ': ' + t.reason).join('\n') +
    '\n\nBubbles:\n' + bubbleList(bubbles);
}

/** One required key per bubble, in list order; answers are topic titles or "none". */
export function assignSchema(bubbles: OrganizeBubble[], topics: Topic[]) {
  const keys = assignKeys(bubbles);
  const answer = { type: 'string', enum: [...topics.map(t => t.title), 'none'] };
  return {
    type: 'object',
    properties: {
      assign: {
        type: 'object',
        properties: Object.fromEntries(keys.map(k => [k, answer])),
        required: keys,
        additionalProperties: false,
      },
    },
    required: ['assign'],
  };
}

/** Builds the groups reply (see parseProposal) from the topics and the assignments. */
export function combine(topics: Topic[], assignRaw: string): string {
  const json = parseObject(assignRaw);
  const assign = json?.assign && typeof json.assign === 'object' ? json.assign : {};
  return JSON.stringify({
    groups: topics.map(t => ({
      title: t.title, reason: t.reason,
      // Keys are "b3 Title"; the short id is the first word.
      members: Object.keys(assign).filter(k => assign[k] === t.title).map(k => k.split(' ')[0]),
    })),
  });
}

/**
 * Turns the model's reply into a proposal, or throws InvalidProposal.
 * Repairs small slips (unknown or repeated ids, a group left with one
 * member, too long a title) and drops groups that can't be repaired; a reply
 * that isn't JSON, or leaves no usable group, is invalid.
 */
export function parseProposal(raw: string, bubbles: OrganizeBubble[]): Proposal {
  const json = parseObject(raw);
  if (!json || !Array.isArray(json.groups)) {
    throw new InvalidProposal('The model\'s answer had no list of groups, so nothing was changed.');
  }
  const byShort = new Map(shortIds(bubbles).map((s, i) => [s, bubbles[i].id]));
  const real = new Set(bubbles.map(b => b.id));
  const used = new Set<string>();
  const titles = new Set<string>();
  const groups: ProposedGroup[] = [];
  for (const g of json.groups.slice(0, MAX_GROUPS)) {
    const title = clip(String(g?.title ?? ''), TITLE_MAX);
    if (!title || titles.has(title.toLowerCase())) continue;
    const ids: string[] = [];
    for (const m of Array.isArray(g?.members) ? g.members : []) {
      const id = byShort.get(String(m)) ?? (real.has(String(m)) ? String(m) : undefined);
      if (id && !used.has(id) && !ids.includes(id)) ids.push(id);
    }
    if (ids.length < MIN_MEMBERS) continue;
    ids.forEach(id => used.add(id));
    titles.add(title.toLowerCase());
    groups.push({ title, reason: clip(String(g?.reason ?? ''), REASON_MAX), memberIds: ids });
  }
  if (!groups.length) {
    throw new InvalidProposal('The model didn\'t suggest any usable groups (each needs at least 2 bubbles), so nothing was changed.');
  }
  const leftIds = bubbles.map(b => b.id).filter(id => !used.has(id));
  if (groups.length === 1 && !leftIds.length) {
    throw new InvalidProposal('The model put every bubble into one group, which wouldn\'t organize anything. Nothing was changed.');
  }
  return { groups, leftIds };
}

/** Items the web would show after applying: groups plus bubbles left out. */
export const shownAfter = (p: { groups: ProposedGroup[] }, total: number) =>
  p.groups.length + total - p.groups.reduce((n, g) => n + g.memberIds.length, 0);
