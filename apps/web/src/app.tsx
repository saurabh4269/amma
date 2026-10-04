import { useEffect, useMemo, useState } from 'preact/hooks';
import { Profile } from '@yaay/schema';
import { ClinicCard } from './clinic-card.tsx';
import { loadBundle, Words, type Loaded } from './pack.ts';
import { Session } from './session.tsx';
import { Setup } from './setup.tsx';
import { Teach } from './teach.tsx';
import { deleteProfile, listProfiles, openProfile, requestPersistence, saveProfile, type ProfileMeta } from './store.ts';

type Screen =
  | { at: 'home' }
  | { at: 'setup' }
  | { at: 'pin'; meta: ProfileMeta; wrong?: boolean }
  | { at: 'person'; profile: Profile; pin?: string }
  | { at: 'session'; profile: Profile; pin?: string }
  | { at: 'card'; profile: Profile; pin?: string }
  | { at: 'teach'; profile: Profile; pin?: string };

const LANG_KEY = 'yaay.lang';

export function App() {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [metas, setMetas] = useState<ProfileMeta[]>([]);
  const [screen, setScreen] = useState<Screen>({ at: 'home' });
  const [langId, setLangId] = useState(() => localStorage.getItem(LANG_KEY) ?? '');

  const refresh = () => listProfiles().then(setMetas);
  useEffect(() => {
    loadBundle().then(setLoaded, (e: unknown) => setError(String(e)));
    void refresh();
    void requestPersistence();
  }, []);

  const words = useMemo(() => {
    if (!loaded) return undefined;
    const active = 'profile' in screen ? screen.profile.lang : langId;
    const lang = loaded.languages.find((l) => l.id === active) ?? loaded.languages[0];
    return lang && new Words(loaded.ix, lang);
  }, [loaded, langId, screen]);

  if (error) return <main class="page"><p class="warn">{error}</p></main>;
  if (!loaded || !words) return <main class="page"><p>…</p></main>;
  const { ix, languages, places } = loaded;
  const home = () => {
    void refresh();
    setScreen({ at: 'home' });
  };

  switch (screen.at) {
    case 'home':
      return (
        <main class="page">
          <header class="top">
            <h1>Yaay</h1>
            <select
              aria-label={words.ui('language')}
              value={words.lang.id}
              onChange={(e) => {
                const v = e.currentTarget.value;
                localStorage.setItem(LANG_KEY, v);
                setLangId(v);
              }}
            >
              {languages.map((l) => <option value={l.id}>{l.name}</option>)}
            </select>
          </header>
          {words.hasUnapprovedContent && <p class="note">{words.ui('draft')}</p>}
          <div class="list">
            {metas.map((m) => (
              <button
                class="big"
                onClick={async () => {
                  if (m.locked) return setScreen({ at: 'pin', meta: m });
                  const p = await openProfile(m.id);
                  if (p) setScreen({ at: 'person', profile: p });
                }}
              >
                {m.locked ? '🔒 ' : ''}{m.label}
              </button>
            ))}
            <button class="big ghost" onClick={() => setScreen({ at: 'setup' })}>＋ {words.ui('add_person')}</button>
          </div>
        </main>
      );

    case 'setup':
      return (
        <Setup
          ix={ix}
          languages={languages}
          words={words}
          onCancel={home}
          onSave={async (draft, pin) => {
            const profile = Profile.parse(draft);
            await saveProfile(profile, pin);
            await refresh();
            setScreen({ at: 'person', profile, pin });
          }}
        />
      );

    case 'pin':
      return (
        <main class="page">
          <h2>{screen.meta.label}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const pin = new FormData(e.currentTarget).get('pin')?.toString() ?? '';
              const p = await openProfile(screen.meta.id, pin);
              setScreen(p ? { at: 'person', profile: p, pin } : { ...screen, wrong: true });
            }}
          >
            <label>{words.ui('pin_enter')}<input name="pin" type="password" inputMode="numeric" autoFocus /></label>
            {screen.wrong && <p class="warn">{words.ui('wrong_pin')}</p>}
            <div class="row">
              <button type="button" class="ghost" onClick={home}>{words.ui('back')}</button>
              <button class="primary">{words.ui('next')}</button>
            </div>
          </form>
        </main>
      );

    case 'person': {
      const { profile, pin } = screen;
      const last = profile.sessions.at(-1);
      return (
        <main class="page">
          <header class="top"><button class="ghost" onClick={home}>‹ {words.ui('back')}</button><h2>{profile.label}</h2></header>
          <p class="muted">{words.ui('last_session')}: {last ? last.date : words.ui('none_yet')}</p>
          <div class="list">
            <button class="big primary" onClick={() => setScreen({ at: 'session', profile, pin })}>▶ {words.ui('start')}</button>
            <button class="big" onClick={() => setScreen({ at: 'card', profile, pin })}>📋 {words.ui('clinic_card')}</button>
            <button class="big" onClick={() => setScreen({ at: 'teach', profile, pin })}>🎤 {words.ui('teach_voice')}</button>
          </div>
          <DeleteButton
            words={words}
            onDelete={async () => {
              await deleteProfile(profile.id);
              home();
            }}
          />
        </main>
      );
    }

    case 'session':
      return (
        <Session
          ix={ix}
          words={words}
          places={places}
          profile={screen.profile}
          onQuit={() => setScreen({ at: 'person', profile: screen.profile, pin: screen.pin })}
          onDone={async (updated) => {
            await saveProfile(updated, screen.pin);
            setScreen({ at: 'person', profile: updated, pin: screen.pin });
          }}
        />
      );

    case 'teach':
      return <Teach ix={ix} words={words} profile={screen.profile} onBack={() => setScreen({ at: 'person', profile: screen.profile, pin: screen.pin })} />;

    case 'card':
      return <ClinicCard ix={ix} words={words} profile={screen.profile} onBack={() => setScreen({ at: 'person', profile: screen.profile, pin: screen.pin })} />;
  }
}

function DeleteButton({ words, onDelete }: { words: Words; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button class="danger-link" onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? words.ui('delete_confirm') : words.ui('delete')}
    </button>
  );
}
