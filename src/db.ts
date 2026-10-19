import * as SQLite from 'expo-sqlite';
import { Card as FsrsCard, createEmptyCard } from 'ts-fsrs';

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
  `);
  migrate();
}

// Migrations for installs created before a column existed. Each step checks
// the current schema first, so it is safe to run on every launch.
function migrate() {
  const cols = db.getAllSync<{ name: string }>('PRAGMA table_info(concepts)').map(c => c.name);
  if (!cols.includes('source_id')) {
    db.execSync('ALTER TABLE concepts ADD COLUMN source_id TEXT REFERENCES sources(id) ON DELETE SET NULL');
  }
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
