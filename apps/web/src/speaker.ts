import type { Words } from './pack.ts';

/**
 * Speaks cards in order. A recorded clip is used when the language pack has one;
 * otherwise the phone's own voice reads the wording, which is a development fallback.
 */
export class Speaker {
  private audio?: HTMLAudioElement;
  private token = 0;

  usesDeviceVoice(words: Words, cards: string[]): boolean {
    return cards.some((c) => !words.lang.audio[c]);
  }

  stop() {
    this.token += 1;
    this.audio?.pause();
    this.audio = undefined;
    globalThis.speechSynthesis?.cancel();
  }

  async play(words: Words, cards: string[], onCard?: (index: number) => void): Promise<void> {
    this.stop();
    const mine = this.token;
    for (const [i, id] of cards.entries()) {
      if (mine !== this.token) return;
      onCard?.(i);
      const clip = words.lang.audio[id];
      if (clip) await this.playClip(`packs/${words.lang.id}/${clip.file}`);
      else await this.speak(words.card(id), words.lang.id);
    }
    if (mine === this.token) onCard?.(-1);
  }

  private playClip(url: string): Promise<void> {
    return new Promise((resolve) => {
      const a = new Audio(url);
      this.audio = a;
      a.onended = a.onerror = a.onpause = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  private speak(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = globalThis.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.9;
      u.onend = u.onerror = () => resolve();
      synth.speak(u);
    });
  }
}
