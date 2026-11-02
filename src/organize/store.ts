import { bubbleStats } from '../knowledge';
import { db, effectiveCards, getSetting, getWeb, newId, setSetting, WebKey } from '../db';
import { MOTIFS, motifFor } from '../web/motifs';
import { MIN_MEMBERS, ProposedGroup } from './prompt';

// Applying and undoing an organize (docs/knowledge-web-ai-growth.md, item
// 12). Each group becomes a new bubble in the web, with its own web inside;
// the members move into it, taking their cards, nested webs and to-dos
// along. Only the latest organize can be undone.

export const SUGGEST_ABOVE = 6;  // more bubbles than this: suggest organizing

type UndoData = {
  groups: string[];                                   // concept ids created
  moves: { id: string; from: string | null; to: string }[];
  links: { from_id: string; to_id: string; type: string }[]; // strands added
};

const webSetting = (key: WebKey) => 'organize_dismissed:' + key.domain + '/' + (key.parentId ?? '');

/** True when the web is crowded and the suggestion wasn't dismissed at this size or more. */
export function shouldSuggest(key: WebKey, count: number): boolean {
  if (count <= SUGGEST_ABOVE) return false;
  const dismissedAt = Number(getSetting(webSetting(key)) ?? '0');
  return count > dismissedAt;
}

/** "Not now": hide the suggestion until the web gets more bubbles. */
export function dismissSuggestion(key: WebKey, count: number) {
  setSetting(webSetting(key), String(count));
}

/** Show the suggestion again (after new cards land in this web). */
export function resetSuggestion(key: WebKey) {
  setSetting(webSetting(key), '0');
}

/**
 * Applies groups to a web. Groups with fewer than MIN_MEMBERS bubbles
 * (after the user removed some) or no title are skipped. Returns the number
 * of groups made. Replaces any earlier undo.
 */
export function applyOrganize(key: WebKey, groups: ProposedGroup[]): number {
  const web = getWeb(key);
  if (!web) throw new Error('This web no longer exists.');
  const shown = new Set(web.nodes.map(n => n.id));
  const usable = groups
    .map(g => ({ ...g, title: g.title.trim(), memberIds: g.memberIds.filter(id => shown.has(id)) }))
    .filter(g => g.title && g.memberIds.length >= MIN_MEMBERS);
  if (!usable.length) return 0;

  const undo: UndoData = { groups: [], moves: [], links: [] };
  const groupOf = new Map<string, string>();
  const created = new Map(web.nodes.map(n => [n.id, n]));
  // Motifs already in this web, so new group bubbles look different.
  const taken = new Set(web.nodes.map(n => motifFor(n.pattern, n.id)));

  db.withTransactionSync(() => {
    for (const g of usable) {
      const id = newId();
      const at = Math.min(...g.memberIds.map(m => db.getFirstSync<{ t: number }>('SELECT created_at AS t FROM concepts WHERE id = ?', m)?.t ?? Date.now()));
      const motif = MOTIFS.find(m => !taken.has(m)) ?? motifFor(null, id);
      taken.add(motif);
      // The group sits where its first member sat in the ring.
      db.runSync(
        'INSERT INTO concepts (id, title, summary, domain, created_at, parent_id, pattern) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, g.title, g.reason, key.domain, at, key.parentId, JSON.stringify({ motif }));
      undo.groups.push(id);
      for (const m of g.memberIds) {
        db.runSync('UPDATE concepts SET parent_id = ? WHERE id = ?', id, m);
        undo.moves.push({ id: m, from: key.parentId, to: id });
        groupOf.set(m, id);
        created.delete(m);
      }
    }

    // Strands: one between members of different groups (or a member and a
    // bubble left out) now runs between the bubbles that hold them. Strands
    // inside a group still show in the group's web.
    const ids = web.nodes.map(n => n.id);
    const seen = new Set(web.edges.map(e => [e.from_id, e.to_id].sort().join('|')));
    for (const e of web.edges) {
      if (!ids.includes(e.from_id) || !ids.includes(e.to_id)) continue;
      const a = groupOf.get(e.from_id) ?? e.from_id, b = groupOf.get(e.to_id) ?? e.to_id;
      if (a === b || (a === e.from_id && b === e.to_id)) continue;
      const k = [a, b].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      db.runSync('INSERT OR IGNORE INTO links (from_id, to_id, type) VALUES (?, ?, ?)', a, b, 'related');
      undo.links.push({ from_id: a, to_id: b, type: 'related' });
    }

    // A group's lace so far follows what it holds.
    const cardsOf = effectiveCards(key.domain);
    for (const id of undo.groups) {
      db.runSync('UPDATE concepts SET lace_peak = ? WHERE id = ?', bubbleStats(cardsOf(id), new Date()).lace, id);
    }

    db.runSync('DELETE FROM organize_undo');
    db.runSync('INSERT INTO organize_undo (id, domain, web_id, data, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(), key.domain, key.parentId, JSON.stringify(undo), Date.now());
  });
  return usable.length;
}

/** The web whose latest organize can still be undone, if it is this one. */
export function canUndo(key: WebKey): boolean {
  return !!db.getFirstSync('SELECT 1 FROM organize_undo WHERE domain = ? AND web_id IS ?', key.domain, key.parentId);
}

/**
 * Puts the web back as it was before the latest organize: members return,
 * the added strands and the group bubbles go. To-dos added to a group's web
 * move to this web. Returns false if there is nothing to undo here.
 */
export function undoOrganize(key: WebKey): boolean {
  const row = db.getFirstSync<{ data: string }>('SELECT data FROM organize_undo WHERE domain = ? AND web_id IS ?', key.domain, key.parentId);
  if (!row) return false;
  const u: UndoData = JSON.parse(row.data);
  db.withTransactionSync(() => {
    for (const m of u.moves) db.runSync('UPDATE concepts SET parent_id = ? WHERE id = ? AND parent_id = ?', m.from, m.id, m.to);
    for (const l of u.links) db.runSync('DELETE FROM links WHERE from_id = ? AND to_id = ? AND type = ?', l.from_id, l.to_id, l.type);
    for (const g of u.groups) {
      // Anything else that ended up inside the group comes back out too.
      db.runSync('UPDATE concepts SET parent_id = ? WHERE parent_id = ?', key.parentId, g);
      db.runSync('UPDATE todos SET web_id = ? WHERE web_id = ?', key.parentId, g);
      db.runSync('UPDATE todos SET concept_id = NULL WHERE concept_id = ?', g);
      db.runSync('DELETE FROM concepts WHERE id = ?', g);
    }
    db.runSync('DELETE FROM organize_undo');
  });
  return true;
}
