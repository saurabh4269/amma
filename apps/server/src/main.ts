import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexPack } from '@amma/engine';
import { loadContentPack, loadLanguagePack, referenceLanguage } from '@amma/pack-tools';
import { buildApp } from './app.ts';
import { openAiPick } from './llm.ts';
import { SqliteStore } from './store.ts';

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const contentDir = need('CONTENT_PACK');
const { pack, problems } = loadContentPack(contentDir);
if (!pack || problems.length) throw new Error(`content pack is not valid: ${JSON.stringify(problems.slice(0, 5))}`);

const languages = [];
const languageDirs = new Map<string, string>();
for (const dir of (process.env.LANGUAGE_PACKS ?? '').split(',').filter(Boolean)) {
  const lp = loadLanguagePack(dir, pack);
  if (!lp.pack || lp.problems.length) throw new Error(`${dir} is not valid: ${JSON.stringify(lp.problems.slice(0, 5))}`);
  languages.push(lp.pack);
  languageDirs.set(lp.pack.id, dir);
}
// The reference language is always offered; its own folder, when given, replaces the generated one.
if (!languages.some((l) => l.id === pack.refLang)) languages.unshift(referenceLanguage(pack, 'English'));

// A failed call to an outside service must never stop the server for everyone else.
process.on('unhandledRejection', (reason) => console.error(JSON.stringify({ level: 50, msg: 'unhandled rejection', reason: String(reason) })));

const store = new SqliteStore(process.env.DATABASE_FILE ?? 'amma.sqlite');
const retentionDays = Number(process.env.RETENTION_DAYS ?? 400);
setInterval(() => store.expire(new Date(Date.now() - retentionDays * 86_400_000).toISOString()), 3_600_000).unref();

/** Speech to text through ElevenLabs. Used only for voice notes on channels whose consent message says so. */
async function transcribe(audio: Uint8Array, locale: string | undefined): Promise<string> {
  const form = new FormData();
  form.set('model_id', process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v1');
  if (locale) form.set('language_code', locale.split('-')[0]!);
  // Only the words are wanted: no sound-event tags, no per-word timing, no speaker labels.
  form.set('tag_audio_events', 'false');
  form.set('timestamps_granularity', 'none');
  form.set('diarize', 'false');
  form.set('file', new Blob([audio]), 'voice.oga');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': need('ELEVENLABS_API_KEY') }, body: form, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`speech service answered ${res.status}`);
  return ((await res.json()) as { text?: string }).text ?? '';
}

const app = buildApp({
  ix: indexPack(pack),
  languages,
  store,
  authToken: need('TWILIO_AUTH_TOKEN'),
  // Render tells a service its own public address; elsewhere it must be set.
  publicUrl: (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? need('PUBLIC_URL')).replace(/\/$/, ''),
  today: () => new Date().toISOString().slice(0, 10),
  ratePerMinute: Number(process.env.RATE_PER_MINUTE ?? 20),
  telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_SECRET
    ? {
        token: process.env.TELEGRAM_BOT_TOKEN,
        secret: process.env.TELEGRAM_SECRET,
        fetch,
        transcribe: process.env.ELEVENLABS_API_KEY ? transcribe : undefined,
        clip: (lang, card) => {
          const file = lang.audio[card]?.file;
          const dir = languageDirs.get(lang.id);
          const path = file && dir ? join(dir, file) : undefined;
          return path && existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
        },
      }
    : undefined,
  pick: process.env.OPENAI_API_KEY ? openAiPick({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL ?? 'gpt-6-luna', reasoningEffort: process.env.OPENAI_REASONING_EFFORT }) : undefined,
  speech: process.env.ELEVENLABS_API_KEY
    ? {
        transcribe,
        origins: (process.env.WEB_ORIGINS ?? 'https://amma-mauve.vercel.app,https://amma.heisenbug.in,http://localhost:5173,http://localhost:4173').split(','),
        perHour: Number(process.env.STT_PER_HOUR ?? 60),
        perDay: Number(process.env.STT_PER_DAY ?? 1500),
      }
    : undefined,
  callback: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER
    ? { accountSid: process.env.TWILIO_ACCOUNT_SID, fromNumber: process.env.TWILIO_FROM_NUMBER, fetch, perHour: Number(process.env.CALLBACKS_PER_HOUR ?? 3) }
    : undefined,
});
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 8080) });
