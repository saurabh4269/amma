import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { contentReport, languageReport, loadContentPack, loadLanguagePack, referenceLanguage } from './index.ts';

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
      return lp;
    });
    if (!languages.some((l) => l.id === pack.refLang)) languages.unshift(referenceLanguage(pack, pack.refLang));
    mkdirSync(dirname(at(out)), { recursive: true });
    writeFileSync(at(out), JSON.stringify({ content: pack, languages }));
    console.log(`wrote ${out}: ${pack.id} ${pack.version} with ${languages.map((l) => l.id).join(', ') || 'no languages'}`);
    break;
  }
  default:
    console.error('usage: validate <content-dir> [lang-dir...] | build <content-dir> <out.json> [lang-dir...]');
    process.exit(2);
}
