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
export function saveGenerated(g: Generated, domain: string, keepCard: (i: number) => boolean) {
  const existing = new Set(db.getAllSync<{ id: string }>('SELECT id FROM concepts').map(r => r.id));
  const idFor: Record<string, string> = {};
  const now = Date.now();

  db.withTransactionSync(() => {
    db.runSync('INSERT OR IGNORE INTO domains (name, target_weight) VALUES (?, 1)', domain);

    for (const c of g.concepts) {
      if (existing.has(c.key)) { idFor[c.key] = c.key; continue; }
      const id = newId();
      idFor[c.key] = id;
      db.runSync('INSERT INTO concepts (id, title, summary, domain, created_at) VALUES (?, ?, ?, ?, ?)',
        id, c.title, c.summary ?? '', domain, now);
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
  });
}

// ---------- Reviewing ----------
export function getDueCards(now = new Date()): StudyCard[] {
  const rows = db.getAllSync<any>(`
    SELECT cards.*, concepts.domain AS domain, concepts.title AS concept_title
    FROM cards JOIN concepts ON concepts.id = cards.concept_id
    WHERE cards.due <= ? ORDER BY cards.due`, now.getTime());
  return rows.map(r => ({ ...r, fsrs: fromJson(r.fsrs) }));
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
