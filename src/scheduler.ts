import { fsrs, generatorParameters, Rating, Grade } from 'ts-fsrs';
import { Domain, StudyCard } from './db';

export const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
export { Rating };

export function rate(card: StudyCard, grade: Grade) {
  return scheduler.next(card.fsrs, new Date(), grade).card;
}

/**
 * Builds today's session from due cards, interleaved across domains.
 * Each slot goes to the domain furthest below its target share, so a
 * 50/30/20 balance shows up as mixed cards, not three separate blocks.
 */
export function buildSession(due: StudyCard[], domains: Domain[], limit = 40): StudyCard[] {
  const byDomain = new Map<string, StudyCard[]>();
  due.forEach(c => byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]));

  const weight = (d: string) => domains.find(x => x.name === d)?.target_weight ?? 1;
  const active = [...byDomain.keys()].filter(d => weight(d) > 0);
  const total = active.reduce((s, d) => s + weight(d), 0) || 1;
  const served: Record<string, number> = {};
  const session: StudyCard[] = [];

  while (session.length < limit) {
    const open = active.filter(d => byDomain.get(d)!.length > 0);
    if (!open.length) break;
    const n = session.length + 1;
    const gap = (d: string) => weight(d) / total - (served[d] ?? 0) / n;
    const pick = open.reduce((best, d) => (gap(d) > gap(best) ? d : best));
    session.push(byDomain.get(pick)!.shift()!);
    served[pick] = (served[pick] ?? 0) + 1;
  }
  return session;
}
