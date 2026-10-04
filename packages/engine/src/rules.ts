import { LEVELS, type Cond, type Level, type RuleRow, type RuleTable, type SignGroup } from '@amma/schema';
import type { PackIndex } from './index-pack.ts';

export type Facts = Record<string, string>;
export const signFact = (id: string) => `sign:${id}`;

export function holds(ix: PackIndex, cond: Cond, facts: Facts): boolean {
  if ('fact' in cond) return facts[cond.fact] === cond.is;
  if ('anySign' in cond) {
    const signs = ix.signsByGroup.get(cond.anySign.group) ?? [];
    const { is, urgency } = cond.anySign;
    return signs.some((s) => (urgency === undefined || s.urgency === urgency) && facts[signFact(s.id)] === is);
  }
  if ('all' in cond) return cond.all.every((c) => holds(ix, c, facts));
  if ('any' in cond) return cond.any.some((c) => holds(ix, c, facts));
  return !holds(ix, cond.not, facts);
}

export function decide(ix: PackIndex, table: RuleTable, facts: Facts): RuleRow | undefined {
  return table.rows.find((r) => r.when === undefined || holds(ix, r.when, facts));
}

export const levelRank = (l: Level) => LEVELS.indexOf(l);
export const moreUrgent = (a: Level, b: Level) => (levelRank(a) <= levelRank(b) ? a : b);

export interface Outcome {
  level: Level;
  /** One card per group that produced a result, most urgent first. */
  cards: string[];
}

/** Evaluate every table for the groups being checked and keep the most urgent result. */
export function outcome(ix: PackIndex, groups: SignGroup[], facts: Facts): Outcome {
  const hits: RuleRow[] = [];
  for (const g of groups) {
    const table = ix.pack.rules.find((t) => t.group === g);
    if (!table) throw new Error(`no rule table for group ${g}`);
    const row = decide(ix, table, facts);
    if (!row) throw new Error(`rule table ${g} has no row for these answers`);
    hits.push(row);
  }
  hits.sort((a, b) => levelRank(a.level) - levelRank(b.level));
  const top = hits[0];
  if (!top) throw new Error('no groups to evaluate');
  // Only the cards at the most urgent level are spoken: a "none listed" must never follow a "go now".
  return { level: top.level, cards: [...new Set(hits.filter((h) => h.level === top.level).map((h) => h.card))] };
}

export interface TableProblem {
  group: SignGroup;
  problem: 'no_outcome' | 'yes_not_urgent' | 'soon_yes_cleared' | 'unsure_cleared' | 'too_many_signs';
  facts?: Facts;
}

const ANSWERS = ['yes', 'no', 'unsure'] as const;
/** 3^13 assignments is about 1.6 million, which runs in a second or two. Beyond that, split the group. */
export const MAX_SIGNS_PER_GROUP = 13;

/**
 * Prove four properties of a table by trying every combination of answers:
 * every combination has an outcome; a "yes" on an urgent sign gives an urgent outcome;
 * a "yes" on a see-a-worker-soon sign gives at least "soon"; and any "unsure" never
 * gives "none listed" (an unsure answer must reach a person).
 */
export function checkTable(ix: PackIndex, table: RuleTable): TableProblem[] {
  const signs = ix.signsByGroup.get(table.group) ?? [];
  if (signs.length > MAX_SIGNS_PER_GROUP) return [{ group: table.group, problem: 'too_many_signs' }];
  const problems: TableProblem[] = [];
  const seen = new Set<string>();
  const report = (problem: TableProblem['problem'], facts: Facts) => {
    if (seen.has(problem)) return; // one counterexample per kind is enough to act on
    seen.add(problem);
    problems.push({ group: table.group, problem, facts: { ...facts } });
  };
  const facts: Facts = {};
  const walk = (i: number, urgentYes: boolean, soonYes: boolean, anyUnsure: boolean) => {
    const s = signs[i];
    if (!s) {
      const row = decide(ix, table, facts);
      if (!row) report('no_outcome', facts);
      else if (urgentYes && row.level !== 'urgent') report('yes_not_urgent', facts);
      else if (soonYes && levelRank(row.level) > levelRank('soon')) report('soon_yes_cleared', facts);
      else if (anyUnsure && row.level === 'none_listed') report('unsure_cleared', facts);
      return;
    }
    for (const a of ANSWERS) {
      facts[signFact(s.id)] = a;
      const yes = a === 'yes';
      walk(i + 1, urgentYes || (yes && s.urgency === 'urgent'), soonYes || (yes && s.urgency === 'soon'), anyUnsure || a === 'unsure');
    }
  };
  walk(0, false, false, false);
  return problems;
}
