import type { SourcePage } from '../db';
import { chunk } from '../ai/prompt';

// Same part size generate() uses for pasted text.
export const PART_CHARS = 3500;

export type Part = { text: string; pages: number[] };

/**
 * Groups consecutive pages into parts of up to PART_CHARS so each part records
 * which pages it covers. A page longer than that becomes several parts.
 * Pages with no text are skipped.
 */
export function planParts(pages: SourcePage[], max = PART_CHARS): Part[] {
  const out: Part[] = [];
  let cur: Part | null = null;
  for (const p of pages) {
    const text = p.text.trim();
    if (!text) continue;
    if (text.length > max) {
      if (cur) { out.push(cur); cur = null; }
      chunk(text, max).forEach(t => out.push({ text: t, pages: [p.page] }));
      continue;
    }
    if (cur && cur.text.length + 2 + text.length > max) { out.push(cur); cur = null; }
    cur = cur ? { text: cur.text + '\n\n' + text, pages: [...cur.pages, p.page] } : { text, pages: [p.page] };
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Pages fully covered by the first `completed` parts. Empty pages count as
 * covered up to the first page that wasn't reached.
 */
export function pagesCovered(pages: SourcePage[], parts: Part[], completed: number): number[] {
  const lastPart = new Map<number, number>();
  parts.forEach((pt, i) => pt.pages.forEach(pg => lastPart.set(pg, i)));
  const done: number[] = [];
  for (const p of pages) {
    const last = lastPart.get(p.page);
    if (last === undefined) { done.push(p.page); continue; }
    if (last >= completed) break;
    done.push(p.page);
  }
  return done;
}

/** Rough generation time for the selected parts, as display text. */
export function estimate(parts: number, engine: 'local' | 'cloud'): string {
  if (!parts) return '';
  if (engine === 'cloud') return 'about a minute on the server';
  // README: one to a few minutes per ~3,500-character part on device.
  const lo = parts, hi = parts * 3;
  return `roughly ${lo}–${hi} min on this device`;
}

export const rangeLabel = (start: number, end: number) =>
  start === end ? `Page ${start}` : `Pages ${start}–${end}`;
