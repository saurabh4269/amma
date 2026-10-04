import type { Level, Phase, PlanSlot, PlanValue, Profile, Sign } from '@yaay/schema';
import { nextAttribute, raisedSigns, summaryCards, type Attrs } from './clarifier.ts';
import { meaning, parseMeaning, prompt, signsFor, type PackIndex } from './index-pack.ts';
import { outcome, signFact, type Facts } from './rules.ts';
import { dueSigns, gradeSign } from './scheduler.ts';

/** What the matcher understood. It may accept, ask for confirmation, or abstain; it never decides an outcome. */
export type Heard =
  | { kind: 'accept'; meanings: string[] }
  | { kind: 'confirm'; meaning: string }
  | { kind: 'abstain' };

export type Event =
  | { type: 'start' }
  | { type: 'heard'; result: Heard }
  | { type: 'chose'; option: string }
  | { type: 'filled'; value: PlanValue | null };

export interface Option {
  id: string;
  card: string;
  picture?: string;
}

export type Effect =
  | { type: 'say'; cards: string[] }
  | { type: 'listen'; mode: 'recall' | 'open'; expect: string[] }
  | { type: 'choice'; options: Option[] }
  | { type: 'input'; slot: string; kind: PlanSlot['kind'] }
  | { type: 'show_plan' }
  | { type: 'offer_call'; contacts: { slot: string; name: string; phone: string }[] }
  | { type: 'compose_sms'; template: string; data: { level: Level; nextVisit?: string; signLabels: string[] } }
  | { type: 'end' };

type Sub =
  | { node: 'idle' }
  | { node: 'plan'; slots: string[] }
  | { node: 'recall'; taught: string[]; turns: number; abstains: number; confirm?: string }
  | { node: 'check'; queue: string[] }
  | {
      node: 'open';
      turns: number;
      confirm?: string;
      clar?: { complaint: string; attrs: Attrs; asking?: string };
      raised: string[];
    };

export interface SessionState {
  date: string;
  phase: Phase;
  nodeIndex: number;
  profile: Profile;
  facts: Facts;
  due: string[];
  recalled: string[];
  unanswered: number;
  level?: Level;
  sub: Sub;
  ended: boolean;
}

export interface StepResult {
  state: SessionState;
  effects: Effect[];
}

export const CHOICE = { yes: 'yes', no: 'no', unsure: 'unsure', done: 'done' } as const;

export function createSession(profile: Profile, date: string): SessionState {
  return {
    date,
    phase: profile.phase,
    nodeIndex: -1,
    profile: structuredClone(profile),
    facts: {},
    due: [],
    recalled: [],
    unanswered: 0,
    sub: { node: 'idle' },
    ended: false,
  };
}

/** The whole engine: a pure function from (state, event) to (state, effects). */
export function step(ix: PackIndex, prev: SessionState, event: Event): StepResult {
  if (prev.ended) return { state: prev, effects: [] };
  const run = new Run(ix, structuredClone(prev));
  run.handle(event);
  return { state: run.st, effects: run.out };
}

class Run {
  out: Effect[] = [];
  constructor(
    private ix: PackIndex,
    public st: SessionState,
  ) {}

  private say(...cards: string[]) {
    const last = this.out[this.out.length - 1];
    if (last?.type === 'say') last.cards.push(...cards);
    else this.out.push({ type: 'say', cards });
  }
  private p = (role: Parameters<typeof prompt>[1]) => prompt(this.ix, role);
  private opt = (id: keyof typeof CHOICE): Option => ({ id, card: this.p(id) });
  private sign(id: string): Sign {
    const s = this.ix.sign.get(id);
    if (!s) throw new Error(`unknown sign ${id}`);
    return s;
  }

  handle(event: Event) {
    const sub = this.st.sub;
    if (event.type === 'start') {
      if (this.st.nodeIndex === -1) this.advance();
      return;
    }
    switch (sub.node) {
      case 'plan':
        if (event.type === 'filled') this.planFilled(sub, event.value);
        return;
      case 'recall':
        if (event.type === 'heard') this.recallHeard(sub, event.result);
        else if (event.type === 'chose') this.recallChose(sub, event.option);
        return;
      case 'check':
        if (event.type === 'chose') this.checkChose(sub, event.option);
        return;
      case 'open':
        if (event.type === 'heard') this.openHeard(sub, event.result);
        else if (event.type === 'chose') this.openChose(sub, event.option);
        return;
      case 'idle':
        return;
    }
  }

  private advance(): void {
    this.st.nodeIndex += 1;
    this.st.sub = { node: 'idle' };
    const node = this.ix.pack.flow[this.st.nodeIndex];
    switch (node) {
      case 'plan':
        return this.enterPlan();
      case 'track':
        return this.enterTrack();
      case 'recall':
        return this.enterRecall();
      case 'check':
        return this.enterCheck();
      case 'open':
        return this.enterOpen();
      case 'outcome':
        return this.enterOutcome();
      case 'carry':
        return this.enterCarry();
      case undefined:
        return this.finish();
    }
  }

  // ── plan ────────────────────────────────────────────────────────────────
  private enterPlan(): void {
    const slots = this.ix.pack.plan.filter((s) => !this.st.profile.plan[s.id]).map((s) => s.id);
    if (slots.length === 0) return this.advance();
    this.say(this.p('plan_intro'));
    this.st.sub = { node: 'plan', slots };
    this.askSlot(slots[0]!);
  }
  private askSlot(id: string) {
    const slot = this.ix.pack.plan.find((s) => s.id === id)!;
    this.say(slot.ask);
    this.out.push({ type: 'input', slot: slot.id, kind: slot.kind });
  }
  private planFilled(sub: Extract<Sub, { node: 'plan' }>, value: PlanValue | null) {
    const id = sub.slots.shift();
    if (id && value) this.st.profile.plan[id] = value;
    const next = sub.slots[0];
    if (next) return this.askSlot(next);
    this.playPlan();
    this.advance();
  }
  private playPlan() {
    if (Object.keys(this.st.profile.plan).length === 0) return;
    this.say(this.p('plan_playback'));
    this.out.push({ type: 'show_plan' });
  }

  // ── track: one card per session from each track she is on ────────────────
  private enterTrack(): void {
    const { profile, phase } = this.st;
    for (const t of this.ix.pack.tracks) {
      if (!profile.tracks.includes(t.id) || !t.phases.includes(phase)) continue;
      const i = profile.trackProgress[t.id] ?? 0;
      const card = t.cards[i];
      if (!card) continue;
      this.say(this.p('track_intro'), t.label, card);
      profile.trackProgress[t.id] = i + 1;
    }
    this.advance();
  }

  // ── recall ──────────────────────────────────────────────────────────────
  private enterRecall(): void {
    const taught = signsFor(this.ix, this.st.phase, 'teach').map((s) => s.id);
    this.st.due = dueSigns(this.ix, this.st.profile, taught);
    if (this.st.due.length === 0) return this.advance();
    this.st.sub = { node: 'recall', taught, turns: 0, abstains: 0 };
    this.say(this.p('recall_ask'));
    this.listenRecall(taught);
  }
  private listenRecall(taught: string[]) {
    this.out.push({ type: 'listen', mode: 'recall', expect: taught.map(meaning.sign) });
    this.out.push({ type: 'choice', options: [this.opt('done')] });
  }
  private recallHeard(sub: Extract<Sub, { node: 'recall' }>, r: Heard) {
    if (sub.confirm) return; // waiting for yes/no, not speech
    if (r.kind === 'confirm') {
      const m = parseMeaning(r.meaning);
      if (m?.kind === 'sign' && sub.taught.includes(m.id)) {
        sub.confirm = m.id;
        this.say(this.p('did_you_say'), this.sign(m.id).label);
        this.out.push({ type: 'choice', options: [this.opt('yes'), this.opt('no')] });
        return;
      }
      return this.recallTurn(sub, []);
    }
    const signs =
      r.kind === 'accept'
        ? r.meanings.map(parseMeaning).flatMap((m) => (m?.kind === 'sign' && sub.taught.includes(m.id) ? [m.id] : []))
        : [];
    this.recallTurn(sub, signs);
  }
  private recallChose(sub: Extract<Sub, { node: 'recall' }>, option: string) {
    if (sub.confirm) {
      const id = sub.confirm;
      sub.confirm = undefined;
      return this.recallTurn(sub, option === CHOICE.yes ? [id] : []);
    }
    if (option === CHOICE.done) this.finishRecall(sub);
  }
  private recallTurn(sub: Extract<Sub, { node: 'recall' }>, signs: string[]) {
    sub.turns += 1;
    if (signs.length === 0) sub.abstains += 1;
    for (const id of signs) if (!this.st.recalled.includes(id)) this.st.recalled.push(id);
    const lim = this.ix.pack.limits;
    const all = sub.taught.every((id) => this.st.recalled.includes(id));
    if (all || sub.turns >= lim.recallTurns || sub.abstains >= lim.recallAbstains) return this.finishRecall(sub);
    this.say(this.p('recall_more'));
    this.listenRecall(sub.taught);
  }
  private finishRecall(sub: Extract<Sub, { node: 'recall' }>) {
    const { due, recalled, profile } = this.st;
    const missed = due.filter((id) => !recalled.includes(id));
    for (const id of sub.taught) {
      if (recalled.includes(id)) gradeSign(this.ix, profile, id, true);
      else if (due.includes(id)) gradeSign(this.ix, profile, id, false);
    }
    if (missed.length) this.say(this.p('recall_missed'), ...missed.map((id) => this.sign(id).teach));
    else this.say(this.p('recall_all'));
    this.advance();
  }

  // ── check: her answers, no model ────────────────────────────────────────
  private enterCheck(): void {
    const queue = signsFor(this.ix, this.st.phase, 'check').map((s) => s.id);
    if (queue.length === 0) return this.advance();
    this.st.sub = { node: 'check', queue };
    this.say(this.p('check_intro'));
    this.askSign(queue[0]!);
  }
  private askSign(id: string) {
    this.say(this.sign(id).ask);
    this.out.push({ type: 'choice', options: [this.opt('yes'), this.opt('no'), this.opt('unsure')] });
  }
  private setAnswer(id: string, option: string) {
    const a = option === CHOICE.yes ? 'yes' : option === CHOICE.no ? 'no' : 'unsure';
    // An earlier "yes" is never overwritten: a flag, once raised, stays raised.
    if (this.st.facts[signFact(id)] !== 'yes') this.st.facts[signFact(id)] = a;
  }
  private checkChose(sub: Extract<Sub, { node: 'check' }>, option: string) {
    const id = sub.queue.shift();
    if (id) this.setAnswer(id, option);
    const next = sub.queue[0];
    if (next) return this.askSign(next);
    this.advance();
  }

  // ── open: questions and complaints ──────────────────────────────────────
  private enterOpen(): void {
    this.st.sub = { node: 'open', turns: 0, raised: [] };
    this.say(this.p('open_ask'));
    this.listenOpen();
  }
  private listenOpen() {
    const { questions, complaints } = this.ix.pack;
    const onTracks = new Set(this.st.profile.tracks);
    const expect = [
      ...questions.filter((q) => q.tracks.length === 0 || q.tracks.some((t) => onTracks.has(t))).map((q) => meaning.question(q.id)),
      ...complaints.filter((c) => c.phases.length === 0 || c.phases.includes(this.st.phase)).map((c) => meaning.complaint(c.id)),
    ];
    this.out.push({ type: 'listen', mode: 'open', expect });
    this.out.push({ type: 'choice', options: [this.opt('done')] });
  }
  private continueOpen(sub: Extract<Sub, { node: 'open' }>) {
    sub.turns += 1;
    sub.clar = undefined;
    sub.confirm = undefined;
    if (sub.turns >= this.ix.pack.limits.openTurns) return this.advance();
    this.say(this.p('open_more'));
    this.listenOpen();
  }
  private notSure(sub: Extract<Sub, { node: 'open' }>) {
    this.st.unanswered += 1;
    this.say(this.p('not_sure'));
    this.continueOpen(sub);
  }
  private openHeard(sub: Extract<Sub, { node: 'open' }>, r: Heard) {
    if (sub.confirm || sub.clar || sub.raised.length) return; // waiting for a button
    if (r.kind === 'abstain') return this.notSure(sub);
    const raw = r.kind === 'accept' ? r.meanings[0] : r.meaning;
    const m = raw ? parseMeaning(raw) : undefined;
    const label = m && this.openLabel(m);
    if (!m || !raw || !label) return this.notSure(sub);
    if (r.kind === 'confirm') {
      sub.confirm = raw;
      this.say(this.p('did_you_say'), label);
      this.out.push({ type: 'choice', options: [this.opt('yes'), this.opt('no')] });
      return;
    }
    this.understood(sub, m);
  }
  private openLabel(m: { kind: string; id: string }): string | undefined {
    if (m.kind === 'question') return this.ix.pack.questions.find((q) => q.id === m.id)?.label;
    if (m.kind === 'complaint') return this.ix.pack.complaints.find((c) => c.id === m.id)?.label;
    return undefined;
  }
  private understood(sub: Extract<Sub, { node: 'open' }>, m: { kind: string; id: string }) {
    if (m.kind === 'question') {
      const q = this.ix.pack.questions.find((x) => x.id === m.id)!;
      this.say(q.answer);
      return this.continueOpen(sub);
    }
    sub.clar = { complaint: m.id, attrs: {} };
    this.askClarifier(sub);
  }
  private askClarifier(sub: Extract<Sub, { node: 'open' }>) {
    const clar = sub.clar!;
    const attr = nextAttribute(this.ix, clar.complaint, clar.attrs);
    if (attr) {
      const a = this.ix.pack.attributes.find((x) => x.id === attr)!;
      clar.asking = attr;
      this.say(a.ask);
      this.out.push({ type: 'choice', options: a.options.map((o) => ({ id: o.id, card: o.label, picture: o.picture })) });
      return;
    }
    clar.asking = undefined;
    this.say(this.p('clarify_summary'), ...summaryCards(this.ix, clar.complaint, clar.attrs));
    this.out.push({ type: 'choice', options: [this.opt('yes'), this.opt('no')] });
  }
  private openChose(sub: Extract<Sub, { node: 'open' }>, option: string) {
    if (sub.raised.length) {
      const id = sub.raised.shift()!;
      this.setAnswer(id, option);
      const next = sub.raised[0];
      if (next) return this.askSign(next);
      return this.continueOpen(sub);
    }
    if (sub.confirm) {
      const m = parseMeaning(sub.confirm);
      sub.confirm = undefined;
      if (option === CHOICE.yes && m) return this.understood(sub, m);
      return this.notSure(sub);
    }
    if (sub.clar?.asking) {
      sub.clar.attrs[sub.clar.asking] = option;
      return this.askClarifier(sub);
    }
    if (sub.clar) {
      if (option !== CHOICE.yes) return this.notSure(sub);
      const { complaint, attrs } = sub.clar;
      this.st.profile.complaints.push({ date: this.st.date, complaint, attrs });
      sub.clar = undefined;
      // The clarifier can only add questions. A sign already answered "yes" is not asked again.
      // Only signs checked in this phase are asked: a pregnancy sign has no question to ask after the birth.
      const checked = new Set(signsFor(this.ix, this.st.phase, 'check').map((s) => s.id));
      sub.raised = raisedSigns(this.ix, complaint, attrs).filter((id) => checked.has(id) && this.st.facts[signFact(id)] !== 'yes');
      const first = sub.raised[0];
      if (first) return this.askSign(first);
      return this.continueOpen(sub);
    }
    if (option === CHOICE.done) this.advance();
  }

  // ── outcome ─────────────────────────────────────────────────────────────
  private enterOutcome(): void {
    const groups = this.ix.pack.phases[this.st.phase]!.check;
    const o = outcome(this.ix, groups, this.st.facts);
    this.st.level = o.level;
    this.say(...o.cards);
    if (o.level === 'urgent') {
      this.playPlan();
      const contacts = this.ix.pack.plan.flatMap((s) => {
        const v = this.st.profile.plan[s.id];
        if (!s.callOnUrgent || !v || !('contact' in v)) return [];
        return [{ slot: s.id, name: v.contact.name, phone: v.contact.phone }];
      });
      if (contacts.length) this.out.push({ type: 'offer_call', contacts });
    }
    this.advance();
  }

  // ── carry over to the basic phone ───────────────────────────────────────
  private enterCarry(): void {
    const template = this.ix.pack.templates[0];
    if (template) {
      const watch = this.st.due.filter((id) => !this.st.recalled.includes(id));
      const signLabels = (watch.length ? watch : this.st.due).slice(0, this.ix.pack.limits.smsSigns).map((id) => this.sign(id).label);
      this.out.push({
        type: 'compose_sms',
        template: template.id,
        data: { level: this.st.level ?? 'none_listed', nextVisit: this.st.profile.nextVisit, signLabels },
      });
    }
    this.advance();
  }

  private finish(): void {
    const { profile, facts } = this.st;
    const answers: Record<string, 'yes' | 'no' | 'unsure'> = {};
    for (const [k, v] of Object.entries(facts)) {
      if (k.startsWith('sign:') && (v === 'yes' || v === 'no' || v === 'unsure')) answers[k.slice(5)] = v;
    }
    profile.sessions.push({
      date: this.st.date,
      phase: this.st.phase,
      due: this.st.due,
      recalled: this.st.recalled,
      answers,
      level: this.st.level ?? 'none_listed',
      unanswered: this.st.unanswered,
    });
    profile.sessionCount += 1;
    this.st.ended = true;
    this.out.push({ type: 'end' });
  }
}
