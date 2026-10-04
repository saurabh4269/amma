import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import type { ContentPack, LanguagePack } from '@amma/schema';
import { wordingHash } from './index.ts';

/**
 * Card audio is made once, when a pack is built, and shipped as files. Nothing is synthesised
 * while she is listening, so the list of things the app can say stays fixed and works offline.
 * A generated clip is marked synthetic and unapproved until a speaker has listened to it.
 */
export interface VoiceProvider {
  /** Recorded in each clip so a listener knows what made it. */
  id: string;
  speak(text: string, lang: string): Promise<Uint8Array>;
}

export class QuotaError extends Error {}

export function elevenLabs(opts: { apiKey: string; voiceId: string; model: string; fetch?: typeof fetch }): VoiceProvider {
  const doFetch = opts.fetch ?? fetch;
  return {
    id: `elevenlabs:${opts.model}:${opts.voiceId}`,
    async speak(text, lang) {
      const res = await doFetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_22050_32`, {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: opts.model, language_code: lang.split('-')[0] }),
      });
      if (res.status === 401 || res.status === 402 || res.status === 429) throw new QuotaError(`${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (!res.ok) throw new Error(`voice service answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

export interface SpeakResult {
  made: number;
  kept: number;
  stoppedBy?: string;
}

/**
 * Make a clip for every card that has none, or whose wording changed. Clips already made are kept,
 * so the command can be run again after a pause or a quota limit and continues where it stopped.
 */
export async function speakPack(content: ContentPack, lp: LanguagePack, langDir: string, provider: VoiceProvider, parallel = 3): Promise<SpeakResult> {
  mkdirSync(join(langDir, 'audio'), { recursive: true });
  const audio = { ...lp.audio };
  const todo = content.cards.filter((c) => {
    const text = lp.translations[c.id]?.text;
    return text !== undefined && audio[c.id]?.of !== wordingHash(text);
  });
  const save = () =>
    writeFileSync(
      join(langDir, 'audio.yaml'),
      `# Written by \`pack-tools speak\`. Add approvedBy to a clip once a speaker has listened to it.\n${stringify({ audio })}`,
    );
  let made = 0;
  let stoppedBy: string | undefined;
  const queue = [...todo];
  const worker = async () => {
    for (let card = queue.shift(); card && !stoppedBy; card = queue.shift()) {
      const text = lp.translations[card.id]!.text;
      try {
        const bytes = await provider.speak(text, lp.locale ?? lp.id);
        const file = `audio/${card.id}.mp3`;
        writeFileSync(join(langDir, file), bytes);
        audio[card.id] = { file, voice: { kind: 'synthetic', by: provider.id }, of: wordingHash(text) };
        made += 1;
        if (made % 10 === 0) save();
      } catch (e) {
        if (!(e instanceof QuotaError)) throw e;
        stoppedBy = e.message;
      }
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  save();
  return { made, kept: content.cards.length - todo.length, stoppedBy };
}
