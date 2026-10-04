import type { LanguagePack, PlanSlot, PlanValue } from '@amma/schema';
import { CHOICE, createSession, outcome, signFact, signsFor, step, type Effect, type Event, type Option, type PackIndex, type SessionState } from '@amma/engine';
import { matchText, normalise } from '@amma/matcher';
import type { Profile } from '@amma/schema';

/**
 * Runs the engine over a channel that only carries text: SMS, or typed WhatsApp.
 * The same session as the app, with numbered replies in place of buttons.
 */

/** What the next inbound message will be read as. Stored with the conversation between messages. */
export type Awaiting =
  | { kind: 'none' }
  | { kind: 'choice'; options: Option[]; listen?: string[]; /** The card that asked the question, so it can be asked again in full. */ asked?: string }
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
        awaiting = { kind: 'choice', options: e.options, listen, asked: said.at(-1) };
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
    // Her own word for an option ("हाँ", "no", "not sure") counts too. The longest label that fits wins,
    // so "not sure" is not read as "no".
    const said = ` ${normalise(trimmed)} `;
    const byWords = awaiting.options
      .map((o) => ({ o, label: normalise(lang.translations[o.card]?.text ?? '') }))
      .filter((x) => x.label && said.includes(` ${x.label} `))
      .sort((a, b) => b.label.length - a.label.length)[0];
    if (byWords) return { type: 'chose', option: byWords.o.id };
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

/**
 * A question asked out of turn. On a text channel she can ask at any point, in the middle of the plan
 * or the check; the answer is one of the fixed cards and the session does not move.
 */
export function askAside(ix: PackIndex, lang: LanguagePack, profile: Profile, body: string): { messages: string[]; said: string[] } | undefined {
  const on = new Set(profile.tracks);
  const asked = ix.pack.questions.filter((q) => q.tracks.length === 0 || q.tracks.some((t) => on.has(t)));
  const hit = matchText(body, lang.lexicon, asked.map((q) => `question:${q.id}`));
  if (hit.kind !== 'accept') return undefined;
  const q = asked.find((x) => `question:${x.id}` === hit.meanings[0]);
  return q ? { messages: [text(ix, lang, q.answer)], said: [q.answer] } : undefined;
}

function askAgain(ix: PackIndex, lang: LanguagePack, a: Awaiting): string {
  if (a.kind === 'choice') return [...(a.asked ? [text(ix, lang, a.asked)] : []), ...a.options.map((o, i) => `${i + 1}. ${text(ix, lang, o.card)}`)].join('\n');
  if (a.kind === 'input') return text(ix, lang, ix.pack.plan.find((s) => s.id === a.slot)?.ask ?? '');
  return '';
}

/** The meanings an outside model may choose between at this point: what the step listens for, plus every question. */
export function candidates(ix: PackIndex, conversation: Conversation): string[] {
  const a = conversation.awaiting;
  const on = new Set(conversation.session.profile.tracks);
  const questions = ix.pack.questions.filter((q) => q.tracks.length === 0 || q.tracks.some((t) => on.has(t))).map((q) => `question:${q.id}`);
  return [...new Set([...(a.kind === 'choice' ? (a.listen ?? []) : []), ...questions])];
}

/**
 * `hint` is a meaning suggested by a language model for words the phrase list did not recognise.
 * It is never acted on directly: a hinted sign or complaint is played back for her to confirm,
 * and a hinted question only brings up that question's fixed answer.
 */
export function receive(ix: PackIndex, lang: LanguagePack, conversation: Conversation, body: string, hint?: string, details?: Record<string, string>): Turn {
  const a = conversation.awaiting;
  const same = (messages: string[], said: string[] = []): Turn => ({ conversation, messages, said, ended: conversation.session.ended });
  if (body === REPEAT) {
    const again = askAgain(ix, lang, a);
    return same(again ? [again] : []);
  }
  // Where the step itself listens for questions (the "anything to ask?" step) the engine handles them.
  // Everywhere else a question is answered on the side and the step is asked again.
  const stepListens = a.kind === 'choice' && a.listen?.some((m) => m.startsWith('question:'));
  const isNumber = /^\d+$/.test(body.trim());
  if (!stepListens && !isNumber) {
    const hinted = hint?.startsWith('question:') ? ix.pack.questions.find((q) => `question:${q.id}` === hint) : undefined;
    const aside = askAside(ix, lang, conversation.session.profile, body) ?? (hinted ? { messages: [text(ix, lang, hinted.answer)], said: [hinted.answer] } : undefined);
    if (aside) {
      const again = askAgain(ix, lang, a);
      return same(again ? [...aside.messages, again] : aside.messages, aside.said);
    }
  }
  let event = interpret(body, a, lang);
  // The phrase list did not know her words, but the model suggests one of the meanings this step listens for.
  if (event?.type === 'heard' && event.result.kind === 'abstain' && hint && a.kind === 'choice' && a.listen?.includes(hint)) {
    event = { type: 'heard', result: { kind: 'confirm', meaning: hint } };
  }
  // Details already in her words go with what was heard, so they are not asked for again.
  if (details && event?.type === 'heard' && event.result.kind !== 'abstain') event = { type: 'heard', result: { ...event.result, attrs: details } };
  if (!event) {
    // Not an answer we offered: say so and repeat the question rather than guess.
    const again = askAgain(ix, lang, a);
    return same(again ? [`${lang.ui.not_understood ?? NOT_UNDERSTOOD}\n${again}`] : []);
  }
  const r = step(ix, conversation.session, event);
  const out = render(ix, lang, r.effects, r.state.profile);
  return { conversation: { session: r.state, awaiting: out.awaiting }, messages: out.messages, said: out.said, ended: out.ended };
}

const NOT_UNDERSTOOD = 'I did not understand that. Please choose one of these, or say it another way.';

// ── Something she tells or asks out of turn ────────────────────────────────
// At any point she may describe a problem ("my back hurts") instead of answering what was asked.
// That is handled by the session's own "anything to ask or tell?" step, run on its own beside whatever
// she was doing: the same clarifying questions, the same danger-sign questions, the same rule tables.

const asideIndex = (ix: PackIndex): PackIndex => ({ ...ix, pack: { ...ix.pack, flow: ['open'] } });

/** Every question and complaint she may bring up out of turn. */
export function asideMeanings(ix: PackIndex, profile: Profile, date: string): string[] {
  const a = begin(asideIndex(ix), { translations: {} } as unknown as LanguagePack, profile, date).conversation.awaiting;
  return a.kind === 'choice' ? (a.listen ?? []) : [];
}

/**
 * With no check step, the aside itself must say what her answers mean. The same rule tables decide.
 * With nothing flagged it says nothing: it has not checked her.
 */
function closeAside(ix: PackIndex, lang: LanguagePack, turn: Turn): Turn {
  if (!turn.ended) return turn;
  const st = turn.conversation.session;
  const answered = signsFor(ix, st.phase, 'check').filter((s) => st.facts[signFact(s.id)] !== undefined);
  const groups = [...new Set(answered.map((s) => s.group))];
  const o = groups.length ? outcome(ix, groups, st.facts) : undefined;
  if (!o || o.level === 'none_listed') return turn;
  const lines = o.cards.map((c) => text(ix, lang, c));
  if (o.level === 'urgent') {
    for (const slot of ix.pack.plan) {
      const v = st.profile.plan[slot.id];
      if (v) lines.push(`${text(ix, lang, slot.label)}: ${planText(v)}`);
    }
  }
  return { ...turn, messages: [...turn.messages, lines.join('\n')], said: [...turn.said, ...o.cards] };
}

/** `sure` is true when her own words matched the phrase list; a model's suggestion is played back for her to confirm. */
export function beginAside(ix: PackIndex, lang: LanguagePack, profile: Profile, date: string, meaning: string, sure: boolean, details?: Record<string, string>): Turn {
  const aix = asideIndex(ix);
  const started = step(aix, createSession(profile, date), { type: 'start' });
  const r = step(aix, started.state, { type: 'heard', result: sure ? { kind: 'accept', meanings: [meaning], attrs: details } : { kind: 'confirm', meaning, attrs: details } });
  const out = render(aix, lang, r.effects, r.state.profile);
  return closeAside(ix, lang, { conversation: { session: r.state, awaiting: out.awaiting }, messages: out.messages, said: out.said, ended: out.ended });
}

export function receiveAside(ix: PackIndex, lang: LanguagePack, conversation: Conversation, body: string, hint?: string, details?: Record<string, string>): Turn {
  return closeAside(ix, lang, receive(asideIndex(ix), lang, conversation, body, hint, details));
}

export { CHOICE };
