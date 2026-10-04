import { describe, expect, it } from 'vitest';
import { decideHeard, matchText, normalise } from '../src/index.ts';

const lexicon = {
  'sign:bleed': ['bleeding', 'खून बहना', 'रक्तस्राव'],
  'sign:head': ['bad headache', 'सिर दर्द'],
  'question:food': ['what should i eat'],
};
const expect3 = Object.keys(lexicon);

describe('matchText', () => {
  it('finds several meanings in the order she said them', () => {
    expect(matchText('Bad headache, and bleeding too', lexicon, expect3)).toEqual({ kind: 'accept', meanings: ['sign:head', 'sign:bleed'] });
  });
  it('matches Devanagari phrases', () => {
    expect(matchText('मुझे सिर दर्द है', lexicon, expect3)).toEqual({ kind: 'accept', meanings: ['sign:head'] });
  });
  it('treats spelling variants of the same Devanagari word as one', () => {
    expect(matchText('तेज़ सिर दर्द', lexicon, expect3)).toEqual({ kind: 'accept', meanings: ['sign:head'] });
    expect(normalise('हाँ')).toBe(normalise('हां'));
  });
  it('matches whole words only', () => {
    expect(matchText('nosebleedingly', lexicon, expect3)).toEqual({ kind: 'abstain' });
  });
  it('only returns meanings that were expected', () => {
    expect(matchText('bleeding', lexicon, ['sign:head'])).toEqual({ kind: 'abstain' });
  });
  it('abstains on empty or unknown text', () => {
    expect(matchText('  ', lexicon, expect3)).toEqual({ kind: 'abstain' });
    expect(matchText('the weather is fine', lexicon, expect3)).toEqual({ kind: 'abstain' });
  });
  it('normalises case, punctuation and Latin accents', () => {
    expect(normalise('  Fièvre!!  ')).toBe('fievre');
  });
});

describe('decideHeard', () => {
  const t = { accept: 0.8, confirm: 0.6 };
  it('accepts, asks to confirm, or abstains by threshold', () => {
    expect(decideHeard([{ meaning: 'a', score: 0.9 }, { meaning: 'b', score: 0.5 }], t)).toEqual({ kind: 'accept', meanings: ['a'] });
    expect(decideHeard([{ meaning: 'a', score: 0.7 }], t)).toEqual({ kind: 'confirm', meaning: 'a' });
    expect(decideHeard([{ meaning: 'a', score: 0.3 }], t)).toEqual({ kind: 'abstain' });
    expect(decideHeard([], t)).toEqual({ kind: 'abstain' });
  });
});
