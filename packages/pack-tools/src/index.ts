import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ContentPack, LanguagePack } from '@yaay/schema';
import { validatePack, type Problem } from '@yaay/engine';

/** Read every YAML file under a pack folder and merge them: lists are joined, maps are merged. */
export function readPackFolder(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.ya?ml$/.test(name)) merge(out, parse(readFileSync(path, 'utf8')) ?? {}, path);
    }
  };
  visit(dir);
  return out;
}

function merge(into: Record<string, unknown>, from: Record<string, unknown>, path: string) {
  for (const [k, v] of Object.entries(from)) {
    if (k.startsWith('x-')) continue; // scratch space for YAML anchors within one file
    const cur = into[k];
    if (cur === undefined) into[k] = v;
    else if (Array.isArray(cur) && Array.isArray(v)) cur.push(...v);
    else if (isMap(cur) && isMap(v)) Object.assign(cur, v);
    else throw new Error(`${path}: key "${k}" is defined twice with values that cannot be merged`);
  }
}
const isMap = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export interface Loaded<T> {
  pack?: T;
  problems: Problem[];
}

export function loadContentPack(dir: string): Loaded<ContentPack> {
  const parsed = ContentPack.safeParse(readPackFolder(dir));
  if (!parsed.success) {
    return { problems: parsed.error.issues.map((i) => ({ where: i.path.join('.'), message: i.message })) };
  }
  return { pack: parsed.data, problems: validatePack(parsed.data) };
}

/** A language pack is checked against the content pack it translates. */
/**
 * In a language folder a translation may be written as a bare string.
 * It then takes the status named once at the top as `defaultStatus`, so a whole draft is marked as a draft in one place.
 */
function expandShorthand(raw: Record<string, unknown>): Record<string, unknown> {
  const { defaultStatus, ...rest } = raw;
  for (const key of ['translations', 'templates']) {
    const map = rest[key];
    if (!isMap(map)) continue;
    for (const [id, v] of Object.entries(map)) {
      if (typeof v !== 'string') continue;
      if (typeof defaultStatus !== 'string') throw new Error(`${key}.${id} is a bare string but the pack has no defaultStatus`);
      map[id] = { text: v, status: defaultStatus };
    }
  }
  return rest;
}

export function loadLanguagePack(dir: string, content: ContentPack): Loaded<LanguagePack> {
  const parsed = LanguagePack.safeParse(expandShorthand(readPackFolder(dir)));
  if (!parsed.success) {
    return { problems: parsed.error.issues.map((i) => ({ where: i.path.join('.'), message: i.message })) };
  }
  const lp = parsed.data;
  const problems: Problem[] = [];
  if (lp.id === content.refLang) {
    // The reference language takes its wording from the cards; its folder may add phrases and app wording only.
    const ref = referenceLanguage(content, lp.name);
    lp.translations = { ...ref.translations, ...lp.translations };
    lp.templates = { ...ref.templates, ...lp.templates };
  }
  if (lp.content.id !== content.id) problems.push({ where: 'content.id', message: `built for ${lp.content.id}, not ${content.id}` });
  const known = new Set(content.cards.map((c) => c.id));
  for (const c of content.cards) {
    if (!lp.translations[c.id]) problems.push({ where: `translations.${c.id}`, message: 'missing' });
  }
  for (const id of Object.keys(lp.translations)) {
    if (!known.has(id)) problems.push({ where: `translations.${id}`, message: 'no such card in the content pack' });
  }
  for (const t of content.templates) {
    const tr = lp.templates[t.id];
    if (!tr) problems.push({ where: `templates.${t.id}`, message: 'missing' });
    else for (const s of t.slots) if (!tr.text.includes(`{${s}}`)) problems.push({ where: `templates.${t.id}`, message: `slot {${s}} not used` });
  }
  return { pack: lp, problems };
}

/** What a reader needs to know before trusting a language pack. */
export function languageReport(lp: LanguagePack, content: ContentPack) {
  const byStatus: Record<string, number> = {};
  for (const t of Object.values(lp.translations)) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  return {
    cards: content.cards.length,
    translated: Object.keys(lp.translations).length,
    byStatus,
    audioClips: Object.keys(lp.audio).length,
    examples: lp.examples.length,
    speakers: new Set(lp.examples.map((e) => e.speaker)).size,
  };
}

export function contentReport(pack: ContentPack) {
  const byStatus: Record<string, number> = {};
  for (const c of pack.cards) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  return { cards: pack.cards.length, byStatus, signs: pack.signs.length, questions: pack.questions.length, complaints: pack.complaints.length, tracks: pack.tracks.length };
}

/**
 * The reference language needs no folder: its wording is the content pack's own.
 * A card whose wording is exactly the source's words is marked as the official edition.
 */
export function referenceLanguage(content: ContentPack, name: string): LanguagePack {
  return LanguagePack.parse({
    id: content.refLang,
    name,
    content: { id: content.id, version: content.version },
    translations: Object.fromEntries(
      content.cards.map((c) => [c.id, { text: c.ref, status: c.source && c.ref === c.source.quote ? 'official_edition' : 'team_draft' }]),
    ),
    templates: Object.fromEntries(content.templates.map((t) => [t.id, { text: t.ref, status: 'team_draft' }])),
  });
}
