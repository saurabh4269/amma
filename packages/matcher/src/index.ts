import type { Heard } from '@amma/engine';

/** Lowercase, strip accents and punctuation, collapse spaces. Works for Latin and Devanagari text. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, (m) => (/[ऀ-ॿ]/.test(m) ? m : '')) // keep Devanagari vowel signs, drop Latin accents
    .normalize('NFC')
    // Speech services and typists differ on these marks: "तेज़" and "तेज", "हाँ" and "हां" are the same word.
    .replace(/\u093C/g, '')
    .replace(/\u0901/g, '\u0902')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

/**
 * Typed-text matching against a language pack's phrase list.
 * A meaning is accepted when one of its phrases appears as whole words in the text.
 * Used for SMS and WhatsApp text, and for development without a microphone.
 */
export function matchText(text: string, lexicon: Record<string, string[]>, expect: string[]): Heard {
  const hay = ` ${normalise(text)} `;
  if (hay.trim() === '') return { kind: 'abstain' };
  const found: { meaning: string; at: number }[] = [];
  for (const m of expect) {
    let first = -1;
    for (const phrase of lexicon[m] ?? []) {
      const needle = normalise(phrase);
      if (!needle) continue;
      const at = hay.indexOf(` ${needle} `);
      if (at >= 0 && (first < 0 || at < first)) first = at;
    }
    if (first >= 0) found.push({ meaning: m, at: first });
  }
  if (found.length === 0) return { kind: 'abstain' };
  found.sort((a, b) => a.at - b.at);
  return { kind: 'accept', meanings: found.map((f) => f.meaning) };
}

/** Scores for each candidate meaning, highest first, as produced by a speech matcher. */
export interface Scored {
  meaning: string;
  score: number;
}

/**
 * Turn scores into a decision using thresholds that the pack build measured.
 * Above `accept`: use it. Between `confirm` and `accept`: play it back and ask. Below: abstain.
 */
export function decideHeard(scored: Scored[], thresholds: { accept: number; confirm: number }): Heard {
  const top = scored[0];
  if (!top || top.score < thresholds.confirm) return { kind: 'abstain' };
  if (top.score < thresholds.accept) return { kind: 'confirm', meaning: top.meaning };
  return { kind: 'accept', meanings: scored.filter((s) => s.score >= thresholds.accept).map((s) => s.meaning) };
}
