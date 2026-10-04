import type { ClarifierRow } from '@yaay/schema';
import type { PackIndex } from './index-pack.ts';

export type Attrs = Record<string, string>;

/** Rows for this complaint that the answers so far have not ruled out. */
export function liveRows(ix: PackIndex, complaint: string, attrs: Attrs): ClarifierRow[] {
  return ix.pack.clarifier.filter(
    (r) =>
      r.complaint === complaint &&
      Object.entries(r.when).every(([attr, allowed]) => attrs[attr] === undefined || allowed.includes(attrs[attr])),
  );
}

/** Signs whose explicit question must be asked given what is known. A row counts only when fully satisfied. */
export function raisedSigns(ix: PackIndex, complaint: string, attrs: Attrs): string[] {
  const out = new Set<string>();
  for (const r of ix.pack.clarifier) {
    if (r.complaint !== complaint) continue;
    const satisfied = Object.entries(r.when).every(([attr, allowed]) => {
      const v = attrs[attr];
      return v !== undefined && allowed.includes(v);
    });
    if (satisfied) for (const s of r.raises) out.add(s);
  }
  return [...out];
}

const key = (signs: string[]) => [...signs].sort().join(',');

/**
 * How much asking `attr` would tell us about which signs get raised:
 * the entropy, in bits, of the split it makes over the still-possible rows.
 * Computed from the table itself, so the question order is neither written by hand nor learned.
 */
function gain(ix: PackIndex, rows: ClarifierRow[], attr: string): number {
  const attribute = ix.pack.attributes.find((a) => a.id === attr);
  if (!attribute || rows.length === 0) return 0;
  const buckets = new Map<string, number>();
  for (const opt of attribute.options) {
    const k = key(
      rows.filter((r) => !r.when[attr] || r.when[attr].includes(opt.id)).flatMap((r) => r.raises),
    );
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const n = attribute.options.length;
  let h = 0;
  for (const c of buckets.values()) h -= (c / n) * Math.log2(c / n);
  return h;
}

/**
 * The next attribute to ask about, or undefined when done.
 * Attributes that can change which signs are raised come first, most informative first;
 * then the ones the pack wants on the clinic card. Stops at the pack's question limit.
 */
export function nextAttribute(ix: PackIndex, complaint: string, attrs: Attrs): string | undefined {
  if (Object.keys(attrs).length >= ix.pack.limits.clarifierQuestions) return undefined;
  const rows = liveRows(ix, complaint, attrs);
  const deciding = [...new Set(rows.flatMap((r) => Object.keys(r.when)))].filter((a) => attrs[a] === undefined);
  let best: string | undefined;
  let bestGain = 0;
  for (const a of deciding) {
    const g = gain(ix, rows, a);
    if (g > bestGain) {
      best = a;
      bestGain = g;
    }
  }
  if (best) return best;
  const describe = ix.pack.complaints.find((c) => c.id === complaint)?.describe ?? [];
  return describe.find((a) => attrs[a] === undefined) ?? deciding[0];
}

/** Cards that, played in order, say the complaint back to her. */
export function summaryCards(ix: PackIndex, complaint: string, attrs: Attrs): string[] {
  const c = ix.pack.complaints.find((x) => x.id === complaint);
  if (!c) return [];
  const cards = [c.label];
  for (const [attr, value] of Object.entries(attrs)) {
    const opt = ix.pack.attributes.find((a) => a.id === attr)?.options.find((o) => o.id === value);
    if (opt) cards.push(opt.label);
  }
  return cards;
}
