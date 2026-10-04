import type { Card, ContentPack, Sign, SignGroup, Phase, PromptRole } from '@yaay/schema';

/** A content pack with lookups built once. The engine only ever reads from this. */
export interface PackIndex {
  pack: ContentPack;
  card: Map<string, Card>;
  sign: Map<string, Sign>;
  signsByGroup: Map<SignGroup, Sign[]>;
}

export function indexPack(pack: ContentPack): PackIndex {
  const signsByGroup = new Map<SignGroup, Sign[]>();
  for (const s of pack.signs) {
    const list = signsByGroup.get(s.group) ?? [];
    list.push(s);
    signsByGroup.set(s.group, list);
  }
  return {
    pack,
    card: new Map(pack.cards.map((c) => [c.id, c])),
    sign: new Map(pack.signs.map((s) => [s.id, s])),
    signsByGroup,
  };
}

export function signsFor(ix: PackIndex, phase: Phase, use: 'teach' | 'check'): Sign[] {
  const cfg = ix.pack.phases[phase];
  if (!cfg) return [];
  return cfg[use].flatMap((g) => ix.signsByGroup.get(g) ?? []);
}

export function prompt(ix: PackIndex, role: PromptRole): string {
  const id = ix.pack.prompts[role];
  if (!id) throw new Error(`pack ${ix.pack.id} has no card for prompt role ${role}`);
  return id;
}

/** Meaning ids the matcher can return. The prefix says what kind of thing was understood. */
export const meaning = {
  sign: (id: string) => `sign:${id}`,
  question: (id: string) => `question:${id}`,
  complaint: (id: string) => `complaint:${id}`,
};

export function parseMeaning(m: string): { kind: 'sign' | 'question' | 'complaint'; id: string } | undefined {
  const i = m.indexOf(':');
  if (i < 0) return undefined;
  const kind = m.slice(0, i);
  if (kind !== 'sign' && kind !== 'question' && kind !== 'complaint') return undefined;
  return { kind, id: m.slice(i + 1) };
}
