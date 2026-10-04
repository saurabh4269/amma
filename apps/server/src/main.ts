import { indexPack } from '@amma/engine';
import { loadContentPack, loadLanguagePack, referenceLanguage } from '@amma/pack-tools';
import { buildApp } from './app.ts';
import { SqliteStore } from './store.ts';

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const contentDir = need('CONTENT_PACK');
const { pack, problems } = loadContentPack(contentDir);
if (!pack || problems.length) throw new Error(`content pack is not valid: ${JSON.stringify(problems.slice(0, 5))}`);

const languages = [referenceLanguage(pack, 'English')];
for (const dir of (process.env.LANGUAGE_PACKS ?? '').split(',').filter(Boolean)) {
  const lp = loadLanguagePack(dir, pack);
  if (!lp.pack || lp.problems.length) throw new Error(`${dir} is not valid: ${JSON.stringify(lp.problems.slice(0, 5))}`);
  languages.push(lp.pack);
}

const store = new SqliteStore(process.env.DATABASE_FILE ?? 'amma.sqlite');
const retentionDays = Number(process.env.RETENTION_DAYS ?? 400);
setInterval(() => store.expire(new Date(Date.now() - retentionDays * 86_400_000).toISOString()), 3_600_000).unref();

const app = buildApp({
  ix: indexPack(pack),
  languages,
  store,
  authToken: need('TWILIO_AUTH_TOKEN'),
  publicUrl: need('PUBLIC_URL'),
  today: () => new Date().toISOString().slice(0, 10),
  ratePerMinute: Number(process.env.RATE_PER_MINUTE ?? 20),
  callback: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER
    ? { accountSid: process.env.TWILIO_ACCOUNT_SID, fromNumber: process.env.TWILIO_FROM_NUMBER, fetch, perHour: Number(process.env.CALLBACKS_PER_HOUR ?? 3) }
    : undefined,
});
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 8080) });
