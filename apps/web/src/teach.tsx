import { useEffect, useRef, useState } from 'preact/hooks';
import type { Profile } from '@yaay/schema';
import { meaning, signsFor, type PackIndex } from '@yaay/engine';
import type { Words } from './pack.ts';
import { addExample, embedAudio, loadExamples, startRecording, voiceAvailable, type Recording } from './voice.ts';

/**
 * "Say it after me": she hears each sign's name and says it in her own words.
 * Each recording becomes an example on this phone, so the weekly session can recognise how she speaks.
 * It is also how a language pack's examples are collected from several speakers.
 */
export function Teach({ ix, words, profile, onBack }: { ix: PackIndex; words: Words; profile: Profile; onBack: () => void }) {
  const signs = signsFor(ix, profile.phase, 'teach').filter((s) => s.urgency === 'urgent');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<{ sign: string; state: 'recording' | 'thinking' }>();
  const [ready, setReady] = useState<boolean>();
  const recording = useRef<Recording>();

  const refresh = async () => {
    const c: Record<string, number> = {};
    for (const e of await loadExamples(words.lang.id)) c[e.meaning] = (c[e.meaning] ?? 0) + 1;
    setCounts(c);
  };
  useEffect(() => {
    void voiceAvailable().then(setReady);
    void refresh();
  }, []);

  const tap = async (signId: string) => {
    if (!busy) {
      recording.current = await startRecording();
      setBusy({ sign: signId, state: 'recording' });
    } else if (busy.sign === signId && busy.state === 'recording' && recording.current) {
      setBusy({ sign: signId, state: 'thinking' });
      const audio = await recording.current.stop();
      await addExample(words.lang.id, meaning.sign(signId), await embedAudio(audio), profile.id);
      await refresh();
      setBusy(undefined);
    }
  };

  return (
    <main class="page">
      <header class="top"><button class="ghost" onClick={onBack}>‹ {words.ui('back')}</button><h2>{words.ui('teach_voice')}</h2></header>
      {ready === false && <p class="note">{words.ui('no_voice')}</p>}
      <p class="muted">{words.ui('teach_how')}</p>
      <div class="list">
        {signs.map((s) => {
          const mine = busy?.sign === s.id ? busy.state : undefined;
          return (
            <button class={`big teach ${mine ?? ''}`} disabled={!ready || (busy !== undefined && !mine) || mine === 'thinking'} onClick={() => void tap(s.id)}>
              <span class="pic">{words.picture(s.label)}</span>
              {words.card(s.label)}
              <span class="muted small">{mine === 'recording' ? `⏹ ${words.ui('mic_stop')}` : mine === 'thinking' ? '…' : `🎤 × ${counts[meaning.sign(s.id)] ?? 0}`}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
