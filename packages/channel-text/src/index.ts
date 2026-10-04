import type { LanguagePack, PlanSlot, PlanValue } from '@amma/schema';
import { CHOICE, createSession, step, type Effect, type Event, type Option, type PackIndex, type SessionState } from '@amma/engine';
import { matchText } from '@amma/matcher';
import type { Profile } from '@amma/schema';

/**
 * Runs the engine over a channel that only carries text: SMS, or typed WhatsApp.
 * The same session as the app, with numbered replies in place of buttons.
 */

/** What the next inbound message will be read as. Stored with the conversation between messages. */
export type Awaiting =
  | { kind: 'none' }
  | { kind: 'choice'; options: Option[]; listen?: string[] }
  | { kind: 'input'; slot: string; slotKind: PlanSlot['kind'] };

export interface Conversation {
  session: SessionState;
  awaiting: Awaiting;
}

export interface Turn {
  conversation: Conversation;
  /** Messages to send, in order. */
  messages: string[];
  /** The cards spoken in this turn, in order, for channels that can also send their audio. */
  said: string[];
  ended: boolean;
}

const text = (ix: PackIndex, lang: LanguagePack, card: string) => lang.translations[card]?.text ?? ix.card.get(card)?.ref ?? card;

function render(ix: PackIndex, lang: LanguagePack, effects: Effect[], profile: Profile): { messages: string[]; said: string[]; awaiting: Awaiting; ended: boolean } {
  const lines: string[] = [];
  const said: string[] = [];
  let awaiting: Awaiting = { kind: 'none' };
  let listen: string[] | undefined;
  let ended = false;
  for (const e of effects) {
    switch (e.type) {
      case 'say':
        lines.push(...e.cards.map((c) => text(ix, lang, c)));
        said.push(...e.cards);
        break;
      case 'listen':
        listen = e.expect;
        break;
      case 'choice':
        awaiting = { kind: 'choice', options: e.options, listen };
        lines.push(e.options.map((o, i) => `${i + 1}. ${text(ix, lang, o.card)}`).join('\n'));
        break;
      case 'input':
        awaiting = { kind: 'input', slot: e.slot, slotKind: e.kind };
        break;
      case 'show_plan':
        for (const s of ix.pack.plan) {
          const v = profile.plan[s.id];
          if (v) lines.push(`${text(ix, lang, s.label)}: ${planText(v)}`);
        }
        break;
      case 'offer_call':
        lines.push(...e.contacts.map((c) => `${c.name}: ${c.phone}`));
        break;
      case 'compose_sms':
        // On a text channel the conversation itself is her copy; no second message is composed.
        break;
      case 'end':
        ended = true;
        break;
    }
  }
  return { messages: lines.length ? [lines.join('\n')] : [], said, awaiting, ended };
}

function planText(v: PlanValue): string {
  if (v.kind === 'yesno') return v.value ? '✓' : '✕';
  if (v.kind === 'facility') return [v.name, v.phone].filter(Boolean).join(' ');
  return [v.contact.name, v.contact.phone].filter(Boolean).join(' ');
}

/** "Asha Tai, 98200 00000" becomes a name and a phone. A message with no digits is a name only. */
export function parseContact(body: string): { name: string; phone: string } {
  const m = body.match(/\+?\d[\d\s-]{5,}\d/);
  const phone = m ? m[0].replace(/[\s-]/g, '') : '';
  const name = (m ? body.replace(m[0], '') : body).replace(/[,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, phone };
}

/** Read an inbound message as an engine event, given what was last asked. Undefined means "not understood, ask again". */
export function interpret(body: string, awaiting: Awaiting, lang: LanguagePack): Event | undefined {
  const trimmed = body.trim();
  if (awaiting.kind === 'input') {
    if (trimmed === '0' || trimmed === '') return { type: 'filled', value: null };
    if (awaiting.slotKind === 'yesno') return { type: 'filled', value: { kind: 'yesno', value: trimmed === '1' } };
    const { name, phone } = parseContact(trimmed);
    if (!name) return { type: 'filled', value: null };
    if (awaiting.slotKind === 'facility') return { type: 'filled', value: { kind: 'facility', name, phone: phone || undefined } };
    return { type: 'filled', value: { kind: awaiting.slotKind, contact: { name, phone } } };
  }
  if (awaiting.kind === 'choice') {
    const n = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
    const picked = awaiting.options[n - 1];
    if (picked) return { type: 'chose', option: picked.id };
    if (awaiting.listen) return { type: 'heard', result: matchText(trimmed, lang.lexicon, awaiting.listen) };
    return undefined;
  }
  return undefined;
}

export function begin(ix: PackIndex, lang: LanguagePack, profile: Profile, date: string): Turn {
  const r = step(ix, createSession(profile, date), { type: 'start' });
  const out = render(ix, lang, r.effects, r.state.profile);
  return { conversation: { session: r.state, awaiting: out.awaiting }, messages: out.messages, said: out.said, ended: out.ended };
}

/** Sent in place of a message to ask for the last question again without answering it. */
export const REPEAT = '\u0000';

export function receive(ix: PackIndex, lang: LanguagePack, conversation: Conversation, body: string): Turn {
  const event = body === REPEAT ? undefined : interpret(body, conversation.awaiting, lang);
  if (!event) {
    // Not a number we offered: repeat the choices rather than guess.
    const a = conversation.awaiting;
    const again =
      a.kind === 'choice'
        ? a.options.map((o, i) => `${i + 1}. ${text(ix, lang, o.card)}`).join('\n')
        : a.kind === 'input'
          ? text(ix, lang, ix.pack.plan.find((s) => s.id === a.slot)?.ask ?? '')
          : '';
    return { conversation, messages: again ? [again] : [], said: [], ended: conversation.session.ended };
  }
  const r = step(ix, conversation.session, event);
  const out = render(ix, lang, r.effects, r.state.profile);
  return { conversation: { session: r.state, awaiting: out.awaiting }, messages: out.messages, said: out.said, ended: out.ended };
}

export { CHOICE };
