import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildPlacePack, readPlaceConfig } from './index.ts';

const [dataDir, out, ...configs] = process.argv.slice(2);
if (!dataDir || !out || configs.length === 0) {
  console.error('usage: <data-dir> <out.json> <place.yaml>...');
  process.exit(2);
}
const from = process.env.INIT_CWD ?? process.cwd();
const today = new Date().toISOString().slice(0, 10);
const packs = [];
for (const c of configs) {
  const pack = await buildPlacePack(readPlaceConfig(resolve(from, c)), resolve(from, dataDir), today);
  console.log(`${pack.id}: ${pack.facilities.length} facilities`, pack.report);
  packs.push(pack);
}
mkdirSync(dirname(resolve(from, out)), { recursive: true });
writeFileSync(resolve(from, out), JSON.stringify(packs));
console.log(`wrote ${out}`);
