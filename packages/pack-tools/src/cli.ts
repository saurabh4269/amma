import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { contentReport, languageReport, loadContentPack, loadLanguagePack, referenceLanguage } from './index.ts';
import { elevenLabs, speakPack } from './voice.ts';

const [cmd, ...args] = process.argv.slice(2);
// pnpm runs scripts from the package folder; resolve paths from where the user typed the command.
const from = process.env.INIT_CWD ?? process.cwd();
const at = (p: string) => resolve(from, p);

function fail(problems: { where: string; message: string }[]): never {
  for (const p of problems) console.error(`  ${p.where}: ${p.message}`);
  console.error(`${problems.length} problem(s). Not built.`);
  process.exit(1);
}

function content(dir: string) {
  const { pack, problems } = loadContentPack(at(dir));
  if (!pack || problems.length) fail(problems);
  return pack;
}

switch (cmd) {
  case 'validate': {
    const pack = content(args[0] ?? '.');
    console.log(`${pack.id} ${pack.version} is valid.`, contentReport(pack));
    for (const dir of args.slice(1)) {
      const { pack: lp, problems } = loadLanguagePack(at(dir), pack);
      if (!lp || problems.length) fail(problems);
      console.log(`${lp.id} is valid.`, languageReport(lp, pack));
    }
    break;
  }
  case 'build': {
    const [dir, out, ...langs] = args;
    if (!dir || !out) throw new Error('usage: build <content-dir> <out.json> [lang-dir...]');
    const pack = content(dir);
    // A language folder that does not exist yet is skipped, so the app can be built before every pack is written.
    const languages = langs.filter((l) => existsSync(at(l))).map((l) => {
      const { pack: lp, problems } = loadLanguagePack(at(l), pack);
      if (!lp || problems.length) fail(problems);
      // Card audio travels beside the bundle, one folder per language.
      if (existsSync(join(at(l), 'audio'))) cpSync(join(at(l), 'audio'), join(dirname(at(out)), lp.id, 'audio'), { recursive: true });
      return lp;
    });
    if (!languages.some((l) => l.id === pack.refLang)) languages.unshift(referenceLanguage(pack, pack.refLang));
    mkdirSync(dirname(at(out)), { recursive: true });
    writeFileSync(at(out), JSON.stringify({ content: pack, languages }));
    console.log(`wrote ${out}: ${pack.id} ${pack.version} with ${languages.map((l) => l.id).join(', ') || 'no languages'}`);
    break;
  }
  case 'speak': {
    const [dir, langDir] = args;
    if (!dir || !langDir) throw new Error('usage: speak <content-dir> <lang-dir>');
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
    const pack = content(dir);
    const { pack: lp, problems } = loadLanguagePack(at(langDir), pack);
    // Stale or missing clips are exactly what this command repairs; anything else must be fixed first.
    const blocking = problems.filter((p) => !p.where.startsWith('audio.'));
    if (!lp || blocking.length) fail(blocking);
    const provider = elevenLabs({ apiKey, voiceId: process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL', model: process.env.ELEVENLABS_MODEL ?? 'eleven_v3' });
    const r = await speakPack(pack, lp, at(langDir), provider);
    console.log(`${lp.id}: made ${r.made} clips, kept ${r.kept}.${r.stoppedBy ? ` Stopped: ${r.stoppedBy}` : ''}`);
    break;
  }
  default:
    console.error('usage: validate <content-dir> [lang-dir...] | build <content-dir> <out.json> [lang-dir...]');
    process.exit(2);
}
