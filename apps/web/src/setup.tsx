import { useState } from 'preact/hooks';
import type { LanguagePack, Phase } from '@amma/schema';
import type { PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';

interface Props {
  ix: PackIndex;
  languages: LanguagePack[];
  words: Words;
  onCancel: () => void;
  onSave: (draft: Record<string, unknown>, pin?: string) => void;
}

export function Setup({ ix, languages, words, onCancel, onSave }: Props) {
  const [lang, setLang] = useState(words.lang.id);
  const [phase, setPhase] = useState<Phase>('pregnant');
  const [tracks, setTracks] = useState<string[]>([]);
  const available = ix.pack.tracks.filter((t) => t.phases.includes(phase));

  return (
    <main class="page">
      <header class="top"><button type="button" class="ghost" onClick={onCancel}>‹ {words.ui('back')}</button><h2>AMMA</h2></header>
      <h2>{words.ui('add_person')}</h2>
      <p class="note">{words.ui('shared_phone')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const text = (k: string) => f.get(k)?.toString().trim() || undefined;
          onSave(
            {
              id: crypto.randomUUID(),
              label: text('label') ?? '—',
              lang,
              phase,
              anchorDate: text('anchor'),
              nextVisit: text('visit'),
              phone: text('phone'),
              tracks: tracks.filter((t) => available.some((a) => a.id === t)),
            },
            text('pin'),
          );
        }}
      >
        <label>{words.ui('label')}<input name="label" required maxLength={30} /></label>
        <label>
          {words.ui('language')}
          <select value={lang} onChange={(e) => setLang(e.currentTarget.value)}>
            {languages.map((l) => <option value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <div class="row">
          {(['pregnant', 'after_birth'] as const).map((p) => (
            <button type="button" class={phase === p ? 'chip on' : 'chip'} onClick={() => setPhase(p)}>
              {p === 'pregnant' ? '🤰' : '👶'} {words.ui(p)}
            </button>
          ))}
        </div>
        <label>{words.ui(phase === 'pregnant' ? 'due_date' : 'birth_date')}<input name="anchor" type="date" /></label>
        <label>{words.ui('next_visit')}<input name="visit" type="date" /></label>
        <label>{words.ui('her_phone')}<input name="phone" type="tel" inputMode="tel" /></label>
        {available.length > 0 && (
          <fieldset>
            <legend>{words.ui('tracks')}</legend>
            {available.map((t) => (
              <label class="check">
                <input
                  type="checkbox"
                  checked={tracks.includes(t.id)}
                  onChange={(e) => setTracks(e.currentTarget.checked ? [...tracks, t.id] : tracks.filter((x) => x !== t.id))}
                />
                {words.card(t.label)}
              </label>
            ))}
          </fieldset>
        )}
        <label>{words.ui('pin')}<input name="pin" type="password" inputMode="numeric" minLength={4} /></label>
        <div class="row">
          <button type="button" class="ghost" onClick={onCancel}>{words.ui('back')}</button>
          <button class="primary">{words.ui('save')}</button>
        </div>
      </form>
    </main>
  );
}
