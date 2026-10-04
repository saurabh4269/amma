import { useState } from 'preact/hooks';
import type { Profile } from '@amma/schema';
import { signsFor, type PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';

/**
 * Hand the danger-sign clips to the phone's share menu, so they can go by Bluetooth
 * or memory card to her basic phone and be replayed there with no network.
 * Only shown when the language pack has recorded clips.
 */
export function ShareAudio({ ix, words, profile }: { ix: PackIndex; words: Words; profile: Profile }) {
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const signs = signsFor(ix, profile.phase, 'teach').filter((s) => s.urgency === 'urgent' && words.lang.audio[s.teach]);
  if (signs.length === 0) return null;

  const send = async () => {
    setState('working');
    try {
      const files = await Promise.all(
        signs.map(async (s, i) => {
          const blob = await (await fetch(`packs/${words.lang.id}/${words.lang.audio[s.teach]!.file}`)).blob();
          // Numbered so a basic phone's music player keeps them in order.
          return new File([blob], `${String(i + 1).padStart(2, '0')}-${s.id}.mp3`, { type: 'audio/mpeg' });
        }),
      );
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
      } else {
        // No share menu (a desktop browser): save the files instead.
        for (const f of files) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          URL.revokeObjectURL(a.href);
        }
      }
      setState('idle');
    } catch (e) {
      // Closing the share menu without choosing is not a failure.
      setState(e instanceof DOMException && e.name === 'AbortError' ? 'idle' : 'failed');
    }
  };

  return (
    <>
      <button class="action wide" disabled={state === 'working'} onClick={() => void send()}>{words.ui('send_audio')} ({signs.length})</button>
      {state === 'failed' && <p class="warn">{words.ui('send_audio_failed')}</p>}
    </>
  );
}
