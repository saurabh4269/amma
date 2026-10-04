import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Profile, type PlacePack } from '@amma/schema';
import type { PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';
import { Session } from './session.tsx';
import { Speaker } from './speaker.ts';
import { onAskAbout, type About } from './ask-bus.ts';

/** What the screen underneath tells the assistant: the pack, the wording, and whose record is open, if any. */
export interface AssistantContext {
  ix: PackIndex;
  words: Words;
  places: PlacePack[];
  profile?: Profile;
  /** Keeps what she described. Absent where saving would clash with a session in progress. */
  save?: (profile: Profile) => void;
}

let current: AssistantContext | undefined;
const listeners = new Set<() => void>();
export function publishAssistant(ctx: AssistantContext | undefined) {
  current = ctx;
  for (const l of listeners) l();
}

/**
 * The microphone on every screen. Tapping it opens the "ask or tell" step on top of whatever she was doing:
 * she can ask a question or describe a problem by voice, picture or typing, then go back exactly where she was.
 * The screen underneath is kept, not rebuilt, so a weekly session in progress is not lost.
 */
export function AssistantShell({ children }: { children: ComponentChildren }) {
  const [, redraw] = useState(0);
  const [asking, setAsking] = useState(false);
  // What she brought up on the screen underneath, if that is why the assistant opened.
  const [about, setAbout] = useState<About>();
  useEffect(() => {
    const l = () => redraw((n) => n + 1);
    listeners.add(l);
    onAskAbout((a) => {
      Speaker.stopAll();
      setAbout(a);
      setAsking(true);
    });
    return () => {
      listeners.delete(l);
      onAskAbout(undefined);
    };
  }, []);
  const ctx = current;
  // Only the ask step: no plan, no recall, no check, and no SMS.
  const askIx = useMemo(() => (ctx ? { ...ctx.ix, pack: { ...ctx.ix.pack, flow: ['open' as const] } } : undefined), [ctx?.ix]);
  const close = () => {
    Speaker.stopAll();
    setAsking(false);
    setAbout(undefined);
  };
  return (
    <>
      <div style={asking ? 'display:none' : undefined}>{children}</div>
      {ctx && !asking && (
        <button class="assistant" aria-label={ctx.words.ui('assistant')} title={ctx.words.ui('assistant')} onClick={() => { Speaker.stopAll(); setAsking(true); }}>
          🎤
        </button>
      )}
      {asking && ctx && askIx && (
        <Session
          mode="ask"
          about={about}
          ix={askIx}
          words={ctx.words}
          places={ctx.places}
          // With no record open, a blank one is used and thrown away.
          profile={ctx.profile ?? Profile.parse({ id: 'assistant', label: '', lang: ctx.words.lang.id, phase: 'pregnant' })}
          onQuit={close}
          onDone={(asked) => {
            // Only what she described is kept. The ask is not a weekly session and must not count as one.
            if (ctx.profile && ctx.save && asked.complaints.length > ctx.profile.complaints.length) {
              ctx.save({ ...ctx.profile, complaints: asked.complaints });
            }
            close();
          }}
        />
      )}
    </>
  );
}
