import type { ContentPack, LanguagePack, PlacePack } from '@amma/schema';
import { indexPack, type PackIndex } from '@amma/engine';
import { UI_DEFAULT, type UiKey } from './ui.ts';

export interface Bundle {
  content: ContentPack;
  languages: LanguagePack[];
}

export interface Loaded {
  ix: PackIndex;
  languages: LanguagePack[];
  /** Facility lists. Empty when none is installed; the app then asks her to type the place. */
  places: PlacePack[];
}

export async function loadBundle(): Promise<Loaded> {
  const res = await fetch('packs/bundle.json');
  if (!res.ok) throw new Error(`packs/bundle.json: ${res.status}`);
  const bundle = (await res.json()) as Bundle;
  return { ix: indexPack(bundle.content), languages: bundle.languages, places: [] };
}

/** Facility lists are large and only needed at the plan's hospital step, so they load after the first screen. */
export async function loadPlaces(): Promise<PlacePack[]> {
  return fetch('packs/places.json').then((r) => (r.ok ? (r.json() as Promise<PlacePack[]>) : []), () => []);
}

const warmed = new Set<string>();
/**
 * Fetch one language's audio clips quietly, a few at a time, so the service worker keeps them for offline use.
 * Only the language in use is fetched: seven languages of audio would be a long download nobody asked for.
 */
export function warmLanguage(lang: LanguagePack): void {
  if (warmed.has(lang.id) || !navigator.onLine) return;
  warmed.add(lang.id);
  const files = Object.values(lang.audio).map((a) => `packs/${lang.id}/${a.file}`);
  let next = 0;
  const worker = async () => {
    while (next < files.length) await fetch(files[next++]!).then((r) => r.arrayBuffer()).catch(() => undefined);
  };
  for (let i = 0; i < 4; i++) void worker();
}

/** Wording for one language, falling back to the pack's reference text so nothing is ever blank. */
export class Words {
  constructor(
    private ix: PackIndex,
    public lang: LanguagePack,
  ) {}
  card = (id: string): string => this.lang.translations[id]?.text ?? this.ix.card.get(id)?.ref ?? id;
  ui = (key: UiKey): string => this.lang.ui[key] ?? UI_DEFAULT[key];
  picture = (id: string): string | undefined => this.ix.card.get(id)?.picture;
  /** True when any wording she would hear has not been checked by a speaker. */
  get hasDrafts(): boolean {
    return Object.values(this.lang.translations).some((t) => t.status === 'team_draft' || t.status === 'machine_draft');
  }
  get hasUnapprovedContent(): boolean {
    return this.ix.pack.cards.some((c) => c.status === 'from_source');
  }
  template(id: string, slots: Record<string, string>): string {
    const text = this.lang.templates[id]?.text ?? this.ix.pack.templates.find((t) => t.id === id)?.ref ?? '';
    return text.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? '');
  }
}
