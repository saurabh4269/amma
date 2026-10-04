import type { Words } from './pack.ts';

/**
 * Speaks cards in order. A recorded clip is used when the language pack has one;
 * otherwise the phone's own voice reads the wording, which is a development fallback.
 */
export class Speaker {
  private audio?: HTMLAudioElement;
  private token = 0;
  private static all = new Set<Speaker>();

  constructor() {
    Speaker.all.add(this);
  }

  /** Silence every screen, for when the assistant opens on top of whatever was speaking. */
  static stopAll() {
    for (const s of Speaker.all) s.stop();
  }

  usesDeviceVoice(words: Words, cards: string[]): boolean {
    return cards.some((c) => !words.lang.audio[c]);
  }

  /** True when a clip she is about to hear was computer-made and nobody has approved it. */
  usesUnapprovedVoice(words: Words, cards: string[]): boolean {
    return cards.some((c) => {
      const clip = words.lang.audio[c];
      return clip?.voice.kind === 'synthetic' && !clip.approvedBy;
    });
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
      // A clip that cannot be played (not downloaded yet and no network) falls back to the phone's own voice,
      // so a card is never silent.
      const played = clip ? await this.playClip(`packs/${words.lang.id}/${clip.file}`) : false;
      if (!played && mine === this.token) await this.speak(words.card(id), words.lang.locale ?? words.lang.id);
    }
    if (mine === this.token) onCard?.(-1);
  }

  /** Resolves true when the clip played to the end or was stopped by her, false when it could not be played. */
  private playClip(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const a = new Audio(url);
      this.audio = a;
      a.onended = a.onpause = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
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
