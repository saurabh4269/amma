import type { PlanValue, Profile } from '@amma/schema';
import { useState } from 'preact/hooks';
import { signsFor, type Effect, type PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';

export function planText(v: PlanValue): string {
  if (v.kind === 'yesno') return v.value ? '✓' : '✕';
  if (v.kind === 'facility') return [v.name, v.phone, v.km === undefined ? undefined : `${v.km} km`].filter(Boolean).join(' · ');
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

/** Phone numbers of the people to call when a sign is urgent, in plan order, without repeats. */
export function alertPhones(ix: PackIndex, profile: Profile): string[] {
  const phones = ix.pack.plan.flatMap((s) => {
    const v = profile.plan[s.id];
    return s.callOnUrgent && v && 'contact' in v && v.contact.phone ? [v.contact.phone] : [];
  });
  return [...new Set(phones)];
}

/** The message for the people in her plan when she has a danger sign: which signs, and where they are going. */
export function renderAlert(ix: PackIndex, words: Words, profile: Profile, facts: Record<string, string>): string | undefined {
  if (!ix.pack.templates.some((t) => t.id === 'urgent_alert')) return undefined;
  const yes = signsFor(ix, profile.phase, 'check').filter((s) => facts[`sign:${s.id}`] === 'yes');
  const facilitySlot = ix.pack.plan.find((s) => s.kind === 'facility');
  const facility = facilitySlot && profile.plan[facilitySlot.id];
  return words
    .template('urgent_alert', {
      name: profile.label,
      signs: yes.map((s) => words.card(s.label)).join(', '),
      // With no hospital in the plan, the plan's own word for it is used ("Hospital").
      facility: facility && facility.kind === 'facility' ? facility.name : facilitySlot ? words.card(facilitySlot.label) : '',
    })
    .trim();
}

/**
 * Ways to send a piece of text, so that something works on every device:
 * the phone's SMS app, WhatsApp, the share menu where there is one, and copy as the fallback.
 */
export function SendText({ words, text, phones, label }: { words: Words; text: string; phones: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  const encoded = encodeURIComponent(text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be refused; selecting the text lets her copy it by hand.
      const sel = getSelection();
      const node = document.querySelector('.sms.current');
      if (sel && node) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(node);
        sel.addRange(range);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div class="send">
      <p class="sms current">{text}</p>
      <a class="big send-sms" href={`sms:${phones.join(',')}?body=${encoded}`}>✉ {label}</a>
      <div class="row">
        <a class="action send-wa" href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {typeof navigator.share === 'function' && (
          <button class="action send-share" onClick={() => void navigator.share({ text }).catch(() => undefined)}>{words.ui('share')}</button>
        )}
        <button class="action send-copy" onClick={() => void copy()}>{copied ? `✓ ${words.ui('copied')}` : words.ui('copy')}</button>
      </div>
    </div>
  );
}
