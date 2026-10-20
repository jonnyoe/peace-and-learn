import * as SQLite from 'expo-sqlite';
import { Card as FsrsCard, createEmptyCard } from 'ts-fsrs';
import {
  BUBBLES, SAMPLE_CATEGORY, SAMPLE_DOMAIN, SAMPLE_PREFIX, TODOS, sampleId, simulate,
} from './seed/memory';

export const db = SQLite.openDatabaseSync('peace-and-learn.db');

export type Concept = { id: string; title: string; summary: string; domain: string };
export type Link = { from_id: string; to_id: string; type: 'prerequisite' | 'related' };
export type Domain = { name: string; target_weight: number };
export type StudyCard = {
  id: string; concept_id: string; front: string; back: string;
  fsrs: FsrsCard; domain: string; concept_title: string;
};

// Shape returned by the server's /generate endpoint.
// A concept "key" is either an existing concept id or a temporary "new:N" key.
export type Generated = {
  concepts: { key: string; title: string; summary: string }[];
  links: { from: string; to: string; type: 'prerequisite' | 'related' }[];
  cards: { conceptKey: string; front: string; back: string }[];
};

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function initDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS domains (
      name TEXT PRIMARY KEY,
      target_weight REAL NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL REFERENCES domains(name),
      created_at INTEGER NOT NULL
    );
    -- prerequisite: from_id should be understood before to_id
    CREATE TABLE IF NOT EXISTS links (
      from_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      to_id   TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      type    TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, type)
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      fsrs TEXT NOT NULL,
      due INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      card_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      reviewed_at INTEGER NOT NULL
    );
    -- Imported documents (PDF, .txt, .md) split into pages.
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_pages (
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (source_id, page)
    );
    -- Per-web to-do lists. web_id is the centre concept of a nested web,
    -- or NULL for the domain's top-level web. concept_id links a bubble.
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL REFERENCES domains(name) ON DELETE CASCADE,
      web_id TEXT REFERENCES concepts(id) ON DELETE CASCADE,
      concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  migrate();
  seedSampleIfEmpty();
}

// Migrations for installs created before a column existed. Each step checks
// the current schema first, so it is safe to run on every launch.
//
// Knowledge web (docs/knowledge-web-spec.md), mapped onto the existing tables:
// - A domain is a top-level web. center_id is its centre bubble (NULL for
//   older subjects: the web then shows the subject name in the centre).
//   title is the display name, category the label above it ("Psychology").
// - A concept is a bubble. parent_id is the bubble whose nested web it sits
//   in (NULL = the domain's top-level web). A concept "has a web inside"
//   when other concepts point at it; that web's centre is the concept itself.
// - links are the strands. pattern is the bubble's lace motif as JSON.
function migrate() {
  const columns = (table: string) =>
    db.getAllSync<{ name: string }>('PRAGMA table_info(' + table + ')').map(c => c.name);

  const concepts = columns('concepts');
  if (!concepts.includes('source_id')) {
    db.execSync('ALTER TABLE concepts ADD COLUMN source_id TEXT REFERENCES sources(id) ON DELETE SET NULL');
  }
  if (!concepts.includes('parent_id')) {
    db.execSync('ALTER TABLE concepts ADD COLUMN parent_id TEXT REFERENCES concepts(id) ON DELETE SET NULL');
  }
  if (!concepts.includes('pattern')) {
    db.execSync('ALTER TABLE concepts ADD COLUMN pattern TEXT');
  }

  const domains = columns('domains');
  if (!domains.includes('title')) db.execSync('ALTER TABLE domains ADD COLUMN title TEXT');
  if (!domains.includes('category')) db.execSync('ALTER TABLE domains ADD COLUMN category TEXT');
  if (!domains.includes('center_id')) {
    db.execSync('ALTER TABLE domains ADD COLUMN center_id TEXT REFERENCES concepts(id) ON DELETE SET NULL');
  }

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_concepts_parent ON concepts(domain, parent_id);
    CREATE INDEX IF NOT EXISTS idx_todos_web ON todos(domain, web_id);
  `);
}

// ---------- FSRS state (de)serialization ----------
const toJson = (c: FsrsCard) => JSON.stringify(c);
const fromJson = (s: string): FsrsCard => {
  const c = JSON.parse(s);
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
};

// ---------- Concepts / graph ----------
export function getConceptIndex(): { id: string; title: string; domain: string }[] {
  return db.getAllSync('SELECT id, title, domain FROM concepts ORDER BY created_at DESC LIMIT 300');
}

export function getGraph(): { concepts: Concept[]; links: Link[]; cardCounts: Record<string, number> } {
  const concepts = db.getAllSync<Concept>('SELECT id, title, summary, domain FROM concepts ORDER BY domain, title');
  const links = db.getAllSync<Link>('SELECT from_id, to_id, type FROM links');
  const rows = db.getAllSync<{ concept_id: string; n: number }>(
    'SELECT concept_id, COUNT(*) AS n FROM cards GROUP BY concept_id');
  const cardCounts: Record<string, number> = {};
  rows.forEach(r => (cardCounts[r.concept_id] = r.n));
  return { concepts, links, cardCounts };
}

// Saves an AI draft. Keys that match existing concept ids attach to the old
// concept; anything else becomes a new concept. This is how the web grows.
// When the draft came from an imported document, `source` tags new concepts
// with it and marks the pages that were covered as done.
export function saveGenerated(
  g: Generated, domain: string, keepCard: (i: number) => boolean,
  source?: { id: string; pages: number[] },
) {
  const existing = new Set(db.getAllSync<{ id: string }>('SELECT id FROM concepts').map(r => r.id));
  const idFor: Record<string, string> = {};
  const now = Date.now();

  db.withTransactionSync(() => {
    db.runSync('INSERT OR IGNORE INTO domains (name, target_weight) VALUES (?, 1)', domain);

    for (const c of g.concepts) {
      if (existing.has(c.key)) { idFor[c.key] = c.key; continue; }
      const id = newId();
      idFor[c.key] = id;
      db.runSync('INSERT INTO concepts (id, title, summary, domain, created_at, source_id) VALUES (?, ?, ?, ?, ?, ?)',
        id, c.title, c.summary ?? '', domain, now, source?.id ?? null);
    }
    const resolve = (k: string) => idFor[k] ?? (existing.has(k) ? k : undefined);

    for (const l of g.links) {
      const a = resolve(l.from), b = resolve(l.to);
      if (a && b && a !== b) {
        db.runSync('INSERT OR IGNORE INTO links (from_id, to_id, type) VALUES (?, ?, ?)', a, b, l.type);
      }
    }

    g.cards.forEach((card, i) => {
      const conceptId = resolve(card.conceptKey);
      if (!conceptId || !keepCard(i)) return;
      const f = createEmptyCard(new Date());
      db.runSync('INSERT INTO cards (id, concept_id, front, back, fsrs, due) VALUES (?, ?, ?, ?, ?, ?)',
        newId(), conceptId, card.front, card.back, toJson(f), f.due.getTime());
    });

    if (source) {
      for (const p of source.pages) {
        db.runSync('UPDATE source_pages SET done = 1 WHERE source_id = ? AND page = ?', source.id, p);
      }
    }
  });
}

// ---------- Imported sources ----------
export type Source = {
  id: string; title: string; kind: string; page_count: number; created_at: number; done_count: number;
};
export type SourcePage = { page: number; text: string; done: number };

export function addSource(title: string, kind: string, pages: string[]): string {
  const id = newId();
  db.withTransactionSync(() => {
    db.runSync('INSERT INTO sources (id, title, kind, page_count, created_at) VALUES (?, ?, ?, ?, ?)',
      id, title, kind, pages.length, Date.now());
    pages.forEach((text, i) =>
      db.runSync('INSERT INTO source_pages (source_id, page, text) VALUES (?, ?, ?)', id, i + 1, text));
  });
  return id;
}

export function getSources(): Source[] {
  return db.getAllSync<Source>(`
    SELECT s.*, COALESCE(SUM(p.done), 0) AS done_count
    FROM sources s LEFT JOIN source_pages p ON p.source_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC`);
}

export function getSource(id: string): Source | null {
  return getSources().find(s => s.id === id) ?? null;
}

export function getSourcePages(id: string, start: number, end: number): SourcePage[] {
  return db.getAllSync<SourcePage>(
    'SELECT page, text, done FROM source_pages WHERE source_id = ? AND page BETWEEN ? AND ? ORDER BY page',
    id, start, end);
}

// The next `count` pages starting at the first unfinished one.
export function nextUnfinishedRange(id: string, count = 5): { start: number; end: number; allDone: boolean } {
  const total = db.getFirstSync<{ n: number }>('SELECT page_count AS n FROM sources WHERE id = ?', id)?.n ?? 0;
  const first = db.getFirstSync<{ page: number }>(
    'SELECT page FROM source_pages WHERE source_id = ? AND done = 0 ORDER BY page LIMIT 1', id)?.page;
  if (first === undefined) return { start: 1, end: Math.max(1, Math.min(count, total)), allDone: true };
  return { start: first, end: Math.min(first + count - 1, total), allDone: false };
}

// ---------- Reviewing ----------
export function getDueCards(now = new Date()): StudyCard[] {
  const rows = db.getAllSync<any>(`
    SELECT cards.*, concepts.domain AS domain, concepts.title AS concept_title
    FROM cards JOIN concepts ON concepts.id = cards.concept_id
    WHERE cards.due <= ? ORDER BY cards.due`, now.getTime());
  return rows.map(r => ({ ...r, fsrs: fromJson(r.fsrs) }));
}

// Every card regardless of due date, for practice sessions.
export function getAllCards(): StudyCard[] {
  const rows = db.getAllSync<any>(`
    SELECT cards.*, concepts.domain AS domain, concepts.title AS concept_title
    FROM cards JOIN concepts ON concepts.id = cards.concept_id`);
  return rows.map(r => ({ ...r, fsrs: fromJson(r.fsrs) }));
}

export function countCards(): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM cards')?.n ?? 0;
}

/**
 * Makes every card new again and due now, and clears review history.
 * Cards, concepts, links, domains and sources are kept. Returns the card count.
 */
export function resetAllProgress(now = new Date()): number {
  const empty = toJson(createEmptyCard(now));
  let n = 0;
  db.withTransactionSync(() => {
    n = db.runSync('UPDATE cards SET fsrs = ?, due = ?', empty, now.getTime()).changes;
    db.runSync('DELETE FROM reviews');
  });
  return n;
}

export function saveReview(cardId: string, next: FsrsCard, rating: number) {
  db.withTransactionSync(() => {
    db.runSync('UPDATE cards SET fsrs = ?, due = ? WHERE id = ?', toJson(next), next.due.getTime(), cardId);
    db.runSync('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)', cardId, rating, Date.now());
  });
}

// ---------- Balance ----------
export function getDomains(): Domain[] {
  return db.getAllSync<Domain>('SELECT name, target_weight FROM domains ORDER BY name');
}

export function setDomainWeight(name: string, weight: number) {
  db.runSync('UPDATE domains SET target_weight = ? WHERE name = ?', Math.max(0, weight), name);
}

// ---------- Settings ----------
export function getSetting(key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}


// ---------- Knowledge web ----------
// A bubble's lace style. Today a motif name from the spec's library; the
// AI-growth addendum later stores a full recipe in the same column.
export type Pattern = { motif: string; params?: Record<string, number> };

export type WebNode = {
  id: string; title: string; summary: string; domain: string;
  parent_id: string | null; pattern: Pattern | null;
  childCount: number; // bubbles in this bubble's own web (0 = none)
};

// Identifies a web: a domain's top-level web (parentId null) or the web
// inside the concept parentId.
export type WebKey = { domain: string; parentId: string | null };

export type TopWeb = { name: string; title: string; category: string | null; center_id: string | null };

export type WebView = {
  key: WebKey;
  title: string;
  category: string | null;      // shown first in the breadcrumb
  breadcrumb: { key: WebKey; title: string }[]; // parent webs, outermost first
  center: WebNode | null;       // null: older subject without a centre bubble
  nodes: WebNode[];             // the bubbles around the centre
  edges: Link[];                // strands between bubbles of this web
};

export type Todo = {
  id: string; domain: string; web_id: string | null; concept_id: string | null;
  concept_title: string | null; text: string; done: boolean; created_at: number;
};

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const placeholders = (n: number) => new Array(n).fill('?').join(', ');

type NodeRow = Omit<WebNode, 'pattern' | 'childCount'> & { pattern: string | null };
const NODE_COLS = 'id, title, summary, domain, parent_id, pattern';

function parsePattern(s: string | null): Pattern | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function getNodeRow(id: string): NodeRow | null {
  return db.getFirstSync<NodeRow>('SELECT ' + NODE_COLS + ' FROM concepts WHERE id = ?', id);
}

export function listWebs(): TopWeb[] {
  return db.getAllSync<{ name: string; title: string | null; category: string | null; center_id: string | null }>(
    'SELECT name, title, category, center_id FROM domains ORDER BY name')
    .map(d => ({ ...d, title: webTitle(d.name, d.title, d.center_id) }));
}

function webTitle(name: string, title: string | null, centerId: string | null): string {
  if (title) return title;
  const center = centerId ? getNodeRow(centerId) : null;
  return center?.title ?? capitalize(name);
}

/** One web: its centre, the bubbles around it, strands and breadcrumb. */
export function getWeb(key: WebKey): WebView | null {
  const domain = db.getFirstSync<{ name: string; title: string | null; category: string | null; center_id: string | null }>(
    'SELECT name, title, category, center_id FROM domains WHERE name = ?', key.domain);
  if (!domain) return null;

  let centerRow: NodeRow | null;
  let rows: NodeRow[];
  if (key.parentId) {
    centerRow = getNodeRow(key.parentId);
    if (!centerRow) return null;
    rows = db.getAllSync<NodeRow>(
      'SELECT ' + NODE_COLS + ' FROM concepts WHERE parent_id = ? ORDER BY created_at, title', key.parentId);
  } else {
    centerRow = domain.center_id ? getNodeRow(domain.center_id) : null;
    rows = db.getAllSync<NodeRow>(
      'SELECT ' + NODE_COLS + ' FROM concepts WHERE domain = ? AND parent_id IS NULL AND id IS NOT ? ' +
      'ORDER BY created_at, title', key.domain, domain.center_id);
  }

  const all = centerRow ? [centerRow, ...rows] : rows;
  const ids = all.map(r => r.id);
  const counts: Record<string, number> = {};
  let edges: Link[] = [];
  if (ids.length) {
    db.getAllSync<{ parent_id: string; n: number }>(
      'SELECT parent_id, COUNT(*) AS n FROM concepts WHERE parent_id IN (' + placeholders(ids.length) + ') GROUP BY parent_id',
      ...ids).forEach(r => (counts[r.parent_id] = r.n));
    edges = db.getAllSync<Link>(
      'SELECT from_id, to_id, type FROM links WHERE from_id IN (' + placeholders(ids.length) + ') ' +
      'AND to_id IN (' + placeholders(ids.length) + ')', ...ids, ...ids);
  }
  const toNode = (r: NodeRow): WebNode => ({ ...r, pattern: parsePattern(r.pattern), childCount: counts[r.id] ?? 0 });

  // Walk up through parent bubbles to build the breadcrumb.
  const breadcrumb: { key: WebKey; title: string }[] = [];
  let up = key.parentId ? centerRow!.parent_id : null;
  let guard = 0;
  while (up && guard++ < 32) {
    const p = getNodeRow(up);
    if (!p) break;
    breadcrumb.unshift({ key: { domain: key.domain, parentId: p.id }, title: p.title });
    up = p.parent_id;
  }
  const topTitle = webTitle(domain.name, domain.title, domain.center_id);
  if (key.parentId) breadcrumb.unshift({ key: { domain: key.domain, parentId: null }, title: topTitle });

  return {
    key,
    title: key.parentId ? centerRow!.title : topTitle,
    category: domain.category,
    breadcrumb,
    center: centerRow ? toNode(centerRow) : null,
    nodes: rows.map(toNode),
    edges,
  };
}

/**
 * A web's to-dos: its own, plus any to-do linked to a bubble shown in it.
 * So a to-do linked to Working memory shows in Working memory's web (centre)
 * and in Memory's web (where Working memory is a bubble). Open items first.
 */
export function getTodos(key: WebKey): Todo[] {
  const web = getWeb(key);
  const visible = web ? [web.center, ...web.nodes].filter(Boolean).map(n => n!.id) : [];
  const linked = visible.length ? ' OR t.concept_id IN (' + placeholders(visible.length) + ')' : '';
  return db.getAllSync<any>(
    'SELECT t.*, c.title AS concept_title FROM todos t LEFT JOIN concepts c ON c.id = t.concept_id ' +
    'WHERE (t.domain = ? AND t.web_id IS ?)' + linked + ' ORDER BY t.done, t.created_at',
    key.domain, key.parentId, ...visible).map(t => ({ ...t, done: !!t.done }));
}

export function addTodo(key: WebKey, text: string, conceptId: string | null = null): string {
  const id = newId();
  db.runSync('INSERT INTO todos (id, domain, web_id, concept_id, text, done, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    id, key.domain, key.parentId, conceptId, text, Date.now());
  return id;
}

export function setTodoDone(id: string, done: boolean) {
  db.runSync('UPDATE todos SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

export function deleteTodo(id: string) {
  db.runSync('DELETE FROM todos WHERE id = ?', id);
}

// ---------- Sample subject ("Memory") ----------
// Added automatically only on an empty database, and never again once the
// user removes it. Everything it adds has an id starting with "sample-".

export function hasSample(): boolean {
  return !!db.getFirstSync('SELECT 1 FROM concepts WHERE id = ?', sampleId('memory'));
}

function seedSampleIfEmpty() {
  const webs = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM domains')?.n ?? 0;
  if (webs === 0 && getSetting('sample_removed') !== '1') addSample();
}

/** Adds the Memory sample (bubbles, nested webs, strands, cards with history, to-dos). */
export function addSample(now = new Date()) {
  if (hasSample()) return;
  const t0 = now.getTime();
  db.withTransactionSync(() => {
    db.runSync('INSERT OR IGNORE INTO domains (name, target_weight) VALUES (?, 1)', SAMPLE_DOMAIN);

    const center = BUBBLES.find(b => !b.parent)!.slug;
    BUBBLES.forEach((b, i) => {
      const id = sampleId(b.slug);
      // Bubbles around the subject's centre live in the top-level web, so
      // their parent_id is NULL; deeper ones point at their web's centre.
      const parentId = b.parent && b.parent !== center ? sampleId(b.parent) : null;
      // created_at only orders bubbles around their centre.
      db.runSync(
        'INSERT INTO concepts (id, title, summary, domain, created_at, parent_id, pattern) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, b.title, b.summary, SAMPLE_DOMAIN, t0 + i, parentId, JSON.stringify({ motif: b.motif }));
      // Strand from the web's centre to each bubble around it.
      if (b.parent) {
        db.runSync('INSERT OR IGNORE INTO links (from_id, to_id, type) VALUES (?, ?, ?)', sampleId(b.parent), id, 'related');
      }
      b.cards.forEach(([front, back], j) => {
        const cardId = sampleId('card-' + b.slug + '-' + (j + 1));
        const { card, reviews } = simulate(b.target, now);
        db.runSync('INSERT INTO cards (id, concept_id, front, back, fsrs, due) VALUES (?, ?, ?, ?, ?, ?)',
          cardId, id, front, back, toJson(card), card.due.getTime());
        reviews.forEach(r => db.runSync('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)',
          cardId, r.rating, r.at.getTime()));
      });
    });

    // After the concepts exist, because center_id is a foreign key.
    db.runSync(
      'UPDATE domains SET title = COALESCE(title, ?), category = COALESCE(category, ?), ' +
      'center_id = COALESCE(center_id, ?) WHERE name = ?',
      'Memory', SAMPLE_CATEGORY, sampleId('memory'), SAMPLE_DOMAIN);

    TODOS.forEach((t, i) => db.runSync(
      'INSERT INTO todos (id, domain, web_id, concept_id, text, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      sampleId('todo-' + t.slug), SAMPLE_DOMAIN, t.web ? sampleId(t.web) : null,
      t.bubble ? sampleId(t.bubble) : null, t.text, t.done ? 1 : 0, t0 + i));

    setSetting('sample_removed', '0');
  });
}

/**
 * Removes everything the sample added. Your own concepts are kept, even in
 * the "memory" subject: ones nested under a sample bubble move to the top
 * level. The subject itself goes only if nothing of yours is left in it.
 */
export function removeSample(): number {
  let n = 0;
  const like = SAMPLE_PREFIX + '%';
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM reviews WHERE card_id LIKE ?', like);
    db.runSync('DELETE FROM todos WHERE id LIKE ?', like);
    // Cascades to the sample's cards and links.
    n = db.runSync('DELETE FROM concepts WHERE id LIKE ?', like).changes;
    db.runSync(
      'DELETE FROM domains WHERE name = ? AND NOT EXISTS (SELECT 1 FROM concepts WHERE domain = ?) ' +
      'AND NOT EXISTS (SELECT 1 FROM todos WHERE domain = ?)', SAMPLE_DOMAIN, SAMPLE_DOMAIN, SAMPLE_DOMAIN);
    setSetting('sample_removed', '1');
  });
  return n;
}
