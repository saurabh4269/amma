import type { ContentPack, LanguagePack } from '@yaay/schema';
import { indexPack, type PackIndex } from '@yaay/engine';
import { UI_DEFAULT, type UiKey } from './ui.ts';

export interface Bundle {
  content: ContentPack;
  languages: LanguagePack[];
}

export interface Loaded {
  ix: PackIndex;
  languages: LanguagePack[];
}

export async function loadBundle(): Promise<Loaded> {
  const res = await fetch('packs/bundle.json');
  if (!res.ok) throw new Error(`packs/bundle.json: ${res.status}`);
  const bundle = (await res.json()) as Bundle;
  return { ix: indexPack(bundle.content), languages: bundle.languages };
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
