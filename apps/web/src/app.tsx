import { useEffect, useMemo, useState } from 'preact/hooks';
import { Profile } from '@amma/schema';
import { ClinicCard, weeksPregnant } from './clinic-card.tsx';
import { loadBundle, loadPlaces, warmLanguage, Words, type Loaded } from './pack.ts';
import { Session } from './session.tsx';
import { Setup } from './setup.tsx';
import { ShareAudio } from './share-audio.tsx';
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

const LANG_KEY = 'amma.lang';

export function App() {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [metas, setMetas] = useState<ProfileMeta[]>([]);
  const [open, setOpen] = useState<Record<string, Profile>>({});
  const [screen, setScreen] = useState<Screen>({ at: 'home' });
  const [langId, setLangId] = useState(() => localStorage.getItem(LANG_KEY) ?? '');

  const refresh = async () => {
    const list = await listProfiles();
    setMetas(list);
    const next: Record<string, Profile> = {};
    for (const m of list) {
      if (m.locked) continue;
      const p = await openProfile(m.id);
      if (p) next[m.id] = p;
    }
    setOpen(next);
  };
  useEffect(() => {
    loadBundle().then((l) => {
      setLoaded(l);
      void loadPlaces().then((places) => setLoaded((cur) => (cur ? { ...cur, places } : cur)));
    }, (e: unknown) => setError(String(e)));
    void refresh();
    void requestPersistence();
  }, []);

  const words = useMemo(() => {
    if (!loaded) return undefined;
    const active = 'profile' in screen ? screen.profile.lang : langId;
    const lang = loaded.languages.find((l) => l.id === active) ?? loaded.languages[0];
    return lang && new Words(loaded.ix, lang);
  }, [loaded, langId, screen]);
  useEffect(() => {
    if (words) warmLanguage(words.lang);
  }, [words?.lang.id]);
  // Pick up a newly installed version, but only from the home screen so no session is lost.
  useEffect(() => {
    const reloadIfIdle = () => {
      if (screen.at === 'home' && (window as unknown as { ammaUpdateReady?: boolean }).ammaUpdateReady) location.reload();
    };
    reloadIfIdle();
    window.addEventListener('amma-update', reloadIfIdle);
    return () => window.removeEventListener('amma-update', reloadIfIdle);
  }, [screen.at]);

  if (error) return <main class="page"><p class="warn">{error}</p></main>;
  if (!loaded || !words) {
    return (
      <main class="page">
        <header class="brand"><Mark /><h1>AMMA</h1></header>
      </main>
    );
  }
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
            <div class="brand"><Mark /><h1>AMMA</h1></div>
            <select
              class="lang"
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
          <section class="hello">
            <h2>{words.ui('home_title')}</h2>
            <p class="muted">{words.ui('home_sub')}</p>
          </section>
          {words.hasUnapprovedContent && <p class="note">{words.ui('draft')}</p>}
          <div class="list">
            {metas.map((m) => {
              const profile = open[m.id];
              return (
                <button
                  class="person"
                  onClick={async () => {
                    if (m.locked) return setScreen({ at: 'pin', meta: m });
                    const p = profile ?? await openProfile(m.id);
                    if (p) setScreen({ at: 'person', profile: p });
                  }}
                >
                  <span class="avatar" aria-hidden="true">{m.label.slice(0, 1)}</span>
                  <span class="person-copy">
                    <span class="person-name">
                      {m.label}
                      {m.locked && <Lock />}
                    </span>
                    <span class="muted small">
                      {profile
                        ? `${previewLine(profile, words)} · ${words.ui('last_session')}: ${profile.sessions.at(-1)?.date ?? words.ui('none_yet')}`
                        : words.ui('pin_enter')}
                    </span>
                  </span>
                </button>
              );
            })}
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
          <header class="top"><button type="button" class="ghost" onClick={home}>‹ {words.ui('back')}</button></header>
          <section class="status">
            <span class="avatar" aria-hidden="true">{screen.meta.label.slice(0, 1)}</span>
            <h2>{screen.meta.label}</h2>
            <p class="muted">{words.ui('pin_enter')}</p>
          </section>
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
          <section class="status">
            {pin && <span class="chip">{words.ui('pin_on')}</span>}
            <p class="headline">{previewLine(profile, words)}</p>
            <p class="muted">{words.ui('last_session')}: {last ? last.date : words.ui('none_yet')}</p>
          </section>
          <button class="big primary" onClick={() => setScreen({ at: 'session', profile, pin })}>▶ {words.ui('start')}</button>
          <div class="actions">
            <button class="action" onClick={() => setScreen({ at: 'card', profile, pin })}>{words.ui('clinic_card')}</button>
            <button class="action" onClick={() => setScreen({ at: 'teach', profile, pin })}>{words.ui('teach_voice')}</button>
            <ShareAudio ix={ix} words={words} profile={profile} />
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

function previewLine(profile: Profile, words: Words): string {
  const phase = words.ui(profile.phase === 'pregnant' ? 'pregnant' : 'after_birth');
  const weeks = profile.phase === 'pregnant' && profile.anchorDate
    ? `${weeksPregnant(profile.anchorDate, new Date())} ${words.ui('weeks')}`
    : '';
  return [phase, weeks].filter(Boolean).join(' · ');
}

function Mark() {
  return (
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M8 20c1.2-6 4.2-10 8-10s6.8 4 8 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="16" cy="13" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
  );
}

function DeleteButton({ words, onDelete }: { words: Words; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button class="danger-link" onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? words.ui('delete_confirm') : words.ui('delete')}
    </button>
  );
}
