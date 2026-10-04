import type { PlanValue, Profile } from '@yaay/schema';
import type { Effect, PackIndex } from '@yaay/engine';
import type { Words } from './pack.ts';

export function planText(v: PlanValue): string {
  if (v.kind === 'yesno') return v.value ? '✓' : '✕';
  if (v.kind === 'facility') return [v.name, v.phone].filter(Boolean).join(' · ');
  return [v.contact.name, v.contact.phone].filter(Boolean).join(' · ');
}

export function PlanView({ ix, words, profile }: { ix: PackIndex; words: Words; profile: Profile }) {
  const rows = ix.pack.plan.flatMap((s) => {
    const v = profile.plan[s.id];
    return v ? [{ slot: s, v }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <dl class="plan">
      {rows.map(({ slot, v }) => (
        <>
          <dt>{words.card(slot.label)}</dt>
          <dd>{planText(v)}</dd>
        </>
      ))}
    </dl>
  );
}

/** The weekly SMS for her basic phone, filled from the language pack's template. */
export function renderSms(ix: PackIndex, words: Words, profile: Profile, sms: Extract<Effect, { type: 'compose_sms' }>): string {
  const contact = ix.pack.plan.flatMap((s) => {
    const v = profile.plan[s.id];
    return s.callOnUrgent && v && 'contact' in v ? [planText(v)] : [];
  })[0];
  return words
    .template(sms.template, {
      next_visit: sms.data.nextVisit ?? '—',
      signs: sms.data.signLabels.map(words.card).join(', '),
      contact: contact ?? '—',
    })
    .trim();
}
