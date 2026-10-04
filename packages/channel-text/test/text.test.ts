import { describe, expect, it } from 'vitest';
import { LanguagePack, Profile } from '@amma/schema';
import { indexPack } from '@amma/engine';
import { fixture } from '../../engine/test/fixture.ts';
import { begin, parseContact, receive, type Turn } from '../src/index.ts';

const ix = indexPack(fixture);
const lang = LanguagePack.parse({
  id: 'en',
  name: 'English',
  content: { id: 'fixture', version: '0.0.1' },
  translations: { p_yes: { text: 'Yes', status: 'team_draft' }, p_no: { text: 'No', status: 'team_draft' }, p_unsure: { text: 'Not sure', status: 'team_draft' } },
  lexicon: { 'sign:bleed': ['bleeding'], 'sign:head': ['headache'], 'question:food': ['what to eat'] },
});
const profile = Profile.parse({ id: 'p', label: 'x', lang: 'en', phase: 'pregnant' });

function talk(replies: string[]): Turn[] {
  const turns = [begin(ix, lang, profile, '2026-10-04')];
  for (const r of replies) turns.push(receive(ix, lang, turns.at(-1)!.conversation, r));
  return turns;
}

describe('text channel', () => {
  it('runs a whole session by numbered replies and typed words', () => {
    const turns = talk([
      'Asha Tai, 98200 00000', // who decides
      '0', // skip the facility
      'bleeding and headache', // recall, typed
      '1', // done
      '2', '2', '1', // no, no, yes
      '1', // nothing to ask
    ]);
    const last = turns.at(-1)!;
    expect(last.ended).toBe(true);
    expect(last.conversation.session.level).toBe('urgent');
    expect(last.conversation.session.profile.plan.decider).toEqual({ kind: 'contact', contact: { name: 'Asha Tai', phone: '9820000000' } });
    expect(last.conversation.session.recalled).toEqual(['bleed', 'head']);
    expect(last.messages.join('\n')).toContain('Asha Tai: 9820000000');
  });

  it('numbers the choices it offers', () => {
    const turns = talk(['0', '0', '1']);
    expect(turns.at(-1)!.messages[0]).toMatch(/1\. Yes\n2\. No\n3\. Not sure/);
  });

  it('repeats the choices when the reply is not one of them, and changes nothing', () => {
    const turns = talk(['0', '0', '1']);
    const before = turns.at(-1)!;
    const after = receive(ix, lang, before.conversation, 'maybe?');
    expect(after.conversation).toBe(before.conversation);
    expect(after.messages[0]).toMatch(/^1\. /);
  });

  it('words that match nothing during recall count as not understood, never as a sign', () => {
    const turns = talk(['0', '0', 'the weather is fine']);
    expect(turns.at(-1)!.conversation.session.recalled).toEqual([]);
  });

  it('takes her own word for an answer, and does not hear "not sure" as "no"', () => {
    const turns = talk(['0', '0', '1', 'yes', 'No.', 'I am not sure']);
    const facts = turns.at(-1)!.conversation.session.facts;
    expect([facts['sign:bleed'], facts['sign:head'], facts['sign:fever']]).toEqual(['yes', 'no', 'unsure']);
  });

  it('splits a name from a phone number', () => {
    expect(parseContact('Sunita 9820000000')).toEqual({ name: 'Sunita', phone: '9820000000' });
    expect(parseContact('+221 77 123 45 67, Awa')).toEqual({ name: 'Awa', phone: '+221771234567' });
    expect(parseContact('PHC Wada')).toEqual({ name: 'PHC Wada', phone: '' });
  });
});
