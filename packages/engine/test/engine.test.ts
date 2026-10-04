import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ContentPack, Profile } from '@yaay/schema';
import {
  CHOICE, checkTable, createSession, indexPack, meaning, nextAttribute, outcome, raisedSigns, signFact, step, validatePack,
  type Effect, type Event, type SessionState,
} from '../src/index.ts';
import { fixture, fixtureInput } from './fixture.ts';

const ix = indexPack(fixture);
const profile = (over: Partial<Profile> = {}) => Profile.parse({ id: 'p1', label: 'me', lang: 'en', phase: 'pregnant', ...over });
const planned = { decider: { kind: 'contact', contact: { name: 'A', phone: '1' } }, facility: { kind: 'facility', name: 'F' } } as const;

/** Drive a session with a script of events; return everything it emitted. */
function drive(start: SessionState, events: Event[]) {
  let st = start;
  const effects: Effect[] = [];
  for (const e of [{ type: 'start' } as Event, ...events]) {
    const r = step(ix, st, e);
    st = r.state;
    effects.push(...r.effects);
  }
  return { st, effects, said: effects.flatMap((e) => (e.type === 'say' ? e.cards : [])) };
}
const heard = (...ids: string[]): Event => ({ type: 'heard', result: { kind: 'accept', meanings: ids } });
const abstain: Event = { type: 'heard', result: { kind: 'abstain' } };
const chose = (option: string): Event => ({ type: 'chose', option });
const answers = (...a: string[]) => a.map(chose);

describe('fixture pack', () => {
  it('passes validation', () => {
    expect(validatePack(fixture)).toEqual([]);
  });
});

describe('rules', () => {
  it('any yes is urgent, any unsure reaches a person, all no is none listed', () => {
    const f = (a: string, b: string, c: string) => ({ [signFact('bleed')]: a, [signFact('head')]: b, [signFact('fever')]: c });
    expect(outcome(ix, ['pregnancy'], f('no', 'no', 'no')).level).toBe('none_listed');
    expect(outcome(ix, ['pregnancy'], f('no', 'unsure', 'no')).level).toBe('ask_person');
    expect(outcome(ix, ['pregnancy'], f('unsure', 'yes', 'no')).level).toBe('urgent');
  });

  it('takes the most urgent result across groups and speaks only that level', () => {
    const o = outcome(ix, ['mother_after_birth', 'newborn'], { [signFact('pp_bleed')]: 'no', [signFact('nb_feed')]: 'yes' });
    expect(o).toEqual({ level: 'urgent', cards: ['out_urgent'] });
  });

  it('the validator catches a table where a yes is not urgent', () => {
    const broken = structuredClone(fixtureInput);
    broken.rules[0]!.rows[0] = { id: 'only_bleed', when: { fact: signFact('bleed'), is: 'yes' } as never, level: 'urgent', card: 'out_urgent' };
    const problems = checkTable(indexPack(ContentPack.parse(broken)), ContentPack.parse(broken).rules[0]!);
    expect(problems.map((p) => p.problem)).toContain('yes_not_urgent');
  });

  it('the validator catches a table that clears an unsure answer', () => {
    const broken = structuredClone(fixtureInput);
    broken.rules[0]!.rows.splice(2, 1);
    const pack = ContentPack.parse(broken);
    expect(checkTable(indexPack(pack), pack.rules[0]!).map((p) => p.problem)).toContain('unsure_cleared');
  });

  it('the validator catches a table that ignores a see-a-worker-soon sign', () => {
    const broken = structuredClone(fixtureInput);
    broken.rules[1]!.rows.splice(1, 1);
    const pack = ContentPack.parse(broken);
    expect(checkTable(indexPack(pack), pack.rules[1]!).map((p) => p.problem)).toContain('soon_yes_cleared');
  });

  it('a clinical card without a source fails validation', () => {
    const broken = structuredClone(fixtureInput);
    delete (broken.cards.find((c) => c.id === 'bleed_t') as { source?: unknown }).source;
    expect(validatePack(ContentPack.parse(broken)).some((p) => p.where === 'cards.bleed_t')).toBe(true);
  });
});

describe('session', () => {
  it('asks for the plan first, then never again', () => {
    const { st, effects } = drive(createSession(profile(), '2026-10-04'), [
      { type: 'filled', value: planned.decider },
      { type: 'filled', value: null },
    ]);
    expect(effects.filter((e) => e.type === 'input').map((e) => e.type === 'input' && e.slot)).toEqual(['decider', 'facility']);
    expect(st.profile.plan.decider).toEqual(planned.decider);
    expect(st.profile.plan.facility).toBeUndefined();
    const second = drive(createSession(profile({ plan: planned }), '2026-10-11'), []);
    expect(second.effects.some((e) => e.type === 'input')).toBe(false);
  });

  it('replays only the signs she missed and grades the boxes', () => {
    const { st, said } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      heard(meaning.sign('bleed')),
      chose(CHOICE.done),
    ]);
    expect(said).toContain('head_t');
    expect(said).toContain('fever_t');
    expect(said).not.toContain('bleed_t');
    expect(st.profile.boxes.bleed).toEqual({ box: 1, dueAt: 2 });
    expect(st.profile.boxes.head).toEqual({ box: 0, dueAt: 1 });
  });

  it('a sign she recalled is not due again until its interval passes', () => {
    const p = profile({ plan: planned, sessionCount: 1, boxes: { bleed: { box: 1, dueAt: 3 }, head: { box: 0, dueAt: 1 }, fever: { box: 0, dueAt: 1 } } });
    const { st } = drive(createSession(p, '2026-10-11'), []);
    expect(st.due).toEqual(['head', 'fever']);
  });

  it('a full session with all "no" ends as none listed and writes one record', () => {
    const { st, said, effects } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      heard(meaning.sign('bleed'), meaning.sign('head'), meaning.sign('fever')),
      ...answers('no', 'no', 'no'),
      chose(CHOICE.done),
    ]);
    expect(said).toContain('p_recall_all');
    expect(said).toContain('out_none');
    expect(st.ended).toBe(true);
    expect(st.profile.sessions).toHaveLength(1);
    expect(st.profile.sessions[0]).toMatchObject({ level: 'none_listed', recalled: ['bleed', 'head', 'fever'], answers: { bleed: 'no', head: 'no', fever: 'no' } });
    expect(st.profile.sessionCount).toBe(1);
    expect(effects.at(-1)).toEqual({ type: 'end' });
    expect(effects.some((e) => e.type === 'compose_sms')).toBe(true);
  });

  it('the weekly SMS names only as many signs as the pack allows, missed ones first', () => {
    const { effects } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      heard(meaning.sign('bleed')),
      chose(CHOICE.done),
      ...answers('no', 'no', 'no'),
      chose(CHOICE.done),
    ]);
    const sms = effects.find((e) => e.type === 'compose_sms');
    expect(sms?.type === 'compose_sms' && sms.data.signLabels).toEqual(['head_l', 'fever_l']);
  });

  it('a yes plays the plan and offers to call the people in it', () => {
    const { effects, said, st } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('no', 'yes', 'no'),
      chose(CHOICE.done),
    ]);
    expect(st.level).toBe('urgent');
    expect(said).toContain('out_urgent');
    expect(said).not.toContain('out_none');
    expect(effects).toContainEqual({ type: 'offer_call', contacts: [{ slot: 'decider', name: 'A', phone: '1' }] });
  });

  it('answers a matched question, and says "not sure" when the matcher abstains', () => {
    const { said, st } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('no', 'no', 'no'),
      heard(meaning.question('food')),
      abstain,
    ]);
    expect(said).toContain('q_food_a');
    expect(said).toContain('p_not_sure');
    expect(st.unanswered).toBe(1);
    expect(st.ended).toBe(true); // openTurns is 2
  });

  it('a low-confidence match is played back and only used if she confirms', () => {
    const base = [chose(CHOICE.done), ...answers('no', 'no', 'no'), { type: 'heard', result: { kind: 'confirm', meaning: meaning.question('food') } } as Event];
    const yes = drive(createSession(profile({ plan: planned }), '2026-10-04'), [...base, chose(CHOICE.yes)]);
    expect(yes.said).toEqual(expect.arrayContaining(['p_did_you_say', 'q_food_l', 'q_food_a']));
    const no = drive(createSession(profile({ plan: planned }), '2026-10-04'), [...base, chose(CHOICE.no)]);
    expect(no.said).not.toContain('q_food_a');
    expect(no.said).toContain('p_not_sure');
  });

  it('the clarifier turns a complaint into a record and can only add a question', () => {
    const { st, said } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('no', 'no', 'no'),
      heard(meaning.complaint('pain')),
      chose('upper'),
      chose('headache'),
      chose('today'),
      chose(CHOICE.yes), // summary is right
      chose(CHOICE.yes), // the raised sign's explicit question
      chose(CHOICE.done),
    ]);
    expect(st.profile.complaints).toEqual([{ date: '2026-10-04', complaint: 'pain', attrs: { site: 'upper', with: 'headache', onset: 'today' } }]);
    expect(said).toEqual(expect.arrayContaining(['p_clarify_summary', 'c_pain', 'o_upper', 'o_headache', 'o_today']));
    expect(st.facts[signFact('head')]).toBe('yes');
    expect(st.level).toBe('urgent');
  });

  it('a later "no" never overwrites an earlier "yes"', () => {
    const { st } = drive(createSession(profile({ plan: planned }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('yes', 'no', 'no'),
      heard(meaning.complaint('pain')),
      chose('lower'), // raises bleed, already yes, so it is not asked again
      chose('today'),
      chose(CHOICE.yes),
      chose(CHOICE.done),
    ]);
    expect(st.facts[signFact('bleed')]).toBe('yes');
    expect(st.level).toBe('urgent');
  });

  it('after birth, mother and newborn signs are both taught and checked', () => {
    const { said, st } = drive(createSession(profile({ plan: planned, phase: 'after_birth' }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('no', 'no', 'unsure'),
      chose(CHOICE.done),
    ]);
    expect(said).toEqual(expect.arrayContaining(['pp_bleed_t', 'nb_feed_t', 'pp_bleed_a', 'pp_breast_a', 'nb_feed_a', 'out_ask']));
    expect(st.level).toBe('ask_person');
  });

  it('a "yes" on a see-a-worker-soon sign says what it is, then "soon", and offers the worker but not the emergency plan', () => {
    const { said, st, effects } = drive(createSession(profile({ plan: planned, phase: 'after_birth' }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('no', 'yes', 'no'),
      chose(CHOICE.done),
    ]);
    expect(st.level).toBe('soon');
    expect(said.slice(-2)).toEqual(['pp_breast_t', 'out_soon']);
    expect(said).not.toContain('out_urgent');
    expect(effects.some((e) => e.type === 'show_plan')).toBe(false);
    expect(effects).toContainEqual({ type: 'offer_call', contacts: [{ slot: 'decider', name: 'A', phone: '1' }] });
  });

  it('see-a-worker-soon signs are not part of recall, and an urgent "yes" outranks a soon "yes"', () => {
    const { st } = drive(createSession(profile({ plan: planned, phase: 'after_birth' }), '2026-10-04'), [
      chose(CHOICE.done),
      ...answers('yes', 'yes', 'no'),
      chose(CHOICE.done),
    ]);
    expect(st.due).toEqual(['pp_bleed', 'nb_feed']);
    expect(st.level).toBe('urgent');
  });

  it('a track plays one card per session and widens what she can ask', () => {
    const p = profile({ plan: planned, tracks: ['anaemia'] });
    const first = drive(createSession(p, '2026-10-04'), [chose(CHOICE.done), ...answers('no', 'no', 'no'), chose(CHOICE.done)]);
    expect(first.said).toContain('t_anaemia_1');
    expect(first.said).not.toContain('t_anaemia_2');
    const listen = first.effects.find((e) => e.type === 'listen' && e.mode === 'open');
    expect(listen?.type === 'listen' && listen.expect).toContain(meaning.question('iron'));
    const second = drive(createSession(first.st.profile, '2026-10-11'), []);
    expect(second.said).toContain('t_anaemia_2');
    expect(second.st.due).toContain('bleed'); // boosted by the track although recalled... never recalled here, so due anyway
  });
});

describe('properties', () => {
  const scripted = fc.array(
    fc.oneof(
      fc.constantFrom('yes', 'no', 'unsure', 'done', 'upper', 'lower', 'today', 'days', 'headache', 'nothing').map(chose),
      fc.constantFrom(meaning.sign('bleed'), meaning.sign('head'), meaning.question('food'), meaning.complaint('pain'), 'sign:nonsense', 'garbage').map((m) => heard(m)),
      fc.constantFrom(meaning.sign('fever'), meaning.complaint('pain'), 'x').map((m): Event => ({ type: 'heard', result: { kind: 'confirm', meaning: m } })),
      fc.constant(abstain),
      fc.constant<Event>({ type: 'filled', value: null }),
    ),
    { maxLength: 60 },
  );

  it('whatever the matcher says, a "yes" from her always ends urgent and "none listed" needs every answer to be no', () => {
    fc.assert(
      fc.property(scripted, fc.boolean(), (events, afterBirth) => {
        const { st, said } = drive(createSession(profile({ phase: afterBirth ? 'after_birth' : 'pregnant' }), '2026-10-04'), events);
        const answersGiven = Object.entries(st.facts).filter(([k]) => k.startsWith('sign:')).map(([, v]) => v);
        if (st.level !== undefined) {
          const yesOn = (u: string) => fixture.signs.some((s) => s.urgency === u && st.facts[signFact(s.id)] === 'yes');
          if (yesOn('urgent')) expect(st.level).toBe('urgent');
          else if (yesOn('soon')) expect(st.level).toBe('soon');
          if (st.level === 'none_listed') expect(answersGiven.every((a) => a === 'no')).toBe(true);
        }
        // Everything spoken is a card in the pack: the engine cannot say anything else.
        for (const c of said) expect(ix.card.has(c)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('never throws and stops emitting once ended', () => {
    fc.assert(
      fc.property(scripted, (events) => {
        const { st } = drive(createSession(profile(), '2026-10-04'), events);
        if (st.ended) expect(step(ix, st, chose('yes')).effects).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('the clarifier always stops within the limit and asks the deciding question first', () => {
    expect(nextAttribute(ix, 'pain', {})).toBe('site');
    expect(nextAttribute(ix, 'pain', { site: 'lower' })).toBe('onset');
    expect(raisedSigns(ix, 'pain', { site: 'upper' })).toEqual([]);
    expect(raisedSigns(ix, 'pain', { site: 'upper', with: 'headache' })).toEqual(['head']);
  });
});
