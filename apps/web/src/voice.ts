import { get, set } from 'idb-keyval';
import type { Heard } from '@amma/engine';
import type { Embedder, Example, OrtLike } from '@amma/speech';

const SAMPLE_RATE = 16_000;
/** The speech code and the ONNX runtime are loaded only when the microphone is first used. */
const speech = () => import('@amma/speech');

/**
 * Voice on the phone itself. Her speech becomes a vector and is compared with examples
 * stored on this phone; no audio is kept and nothing leaves the device.
 *
 * The benchmark on Wolof showed the small encoder picks the right meaning most of the time
 * but cannot tell when it is wrong. So a voice match is never accepted on its own: the app
 * plays its best guess back and she says yes or no. Each time she confirms, or corrects it
 * by tapping the picture, the vector is stored as an example of her own words.
 */

const MODEL_DIR = 'models/whisper-tiny/';
const MODEL_FILE = 'encoder_model_quantized.onnx';
const MAX_SECONDS = 12;
const MAX_EXAMPLES_PER_MEANING = 12;

type StoredExample = { meaning: string; vector: number[]; speaker: string };
const storeKey = (lang: string) => `voice-examples:${lang}`;

let embedder: Promise<Embedder> | undefined;

/** True when the model files are installed with the app. Without them the mic button is not shown. */
export type VoiceStatus = 'ready' | 'unsupported' | 'no_model';

/** Whether the microphone can be used here, and if not, why, so the app can say so instead of hiding the button. */
export async function voiceStatus(): Promise<VoiceStatus> {
  // In-app browsers (opened from a chat app) and pages not served over HTTPS do not get a microphone.
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'unsupported';
  try {
    // Offline, the model is in the service worker's store; a network check would wrongly report it missing.
    if (typeof caches !== 'undefined' && (await caches.match(MODEL_DIR + MODEL_FILE, { ignoreSearch: true }))) return 'ready';
    return (await fetch(MODEL_DIR + MODEL_FILE, { method: 'HEAD' })).ok ? 'ready' : 'no_model';
  } catch {
    return 'no_model';
  }
}

export async function voiceAvailable(): Promise<boolean> {
  return (await voiceStatus()) === 'ready';
}

function loadEmbedder(): Promise<Embedder> {
  embedder ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1; // more than one thread needs cross-origin isolation headers a static host may not send
    const model = await fetch(MODEL_DIR + MODEL_FILE).then((r) => r.arrayBuffer());
    return (await speech()).createEmbedder(ort as unknown as OrtLike, new Uint8Array(model));
  })();
  return embedder;
}

export interface Recorded {
  /** Mono at 16 kHz, for the model on the phone. */
  audio: Float32Array;
  /** As recorded, for the online speech service when she has agreed to it. */
  blob: Blob;
}
export interface Recording {
  stop(): Promise<Recorded>;
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  const limit = setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_SECONDS * 1000);
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          clearTimeout(limit);
          stream.getTracks().forEach((t) => t.stop());
          try {
            const ctx = new AudioContext();
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
            void ctx.close();
            resolve({ blob, audio: (await speech()).resampleTo16k(buf.getChannelData(0), buf.sampleRate).slice(0, MAX_SECONDS * SAMPLE_RATE) });
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        };
        if (recorder.state === 'recording') recorder.stop();
        else recorder.onstop?.(new Event('stop'));
      }),
  };
}

export async function loadExamples(lang: string): Promise<Example[]> {
  const stored = (await get<StoredExample[]>(storeKey(lang))) ?? [];
  return stored.map((e) => ({ ...e, vector: Float32Array.from(e.vector) }));
}

/** Remember how she said it. The oldest example of a meaning is dropped once there are enough. */
export async function addExample(lang: string, meaning: string, vector: Float32Array, speaker: string): Promise<void> {
  const all = (await get<StoredExample[]>(storeKey(lang))) ?? [];
  const same = all.filter((e) => e.meaning === meaning);
  const rest = all.filter((e) => e.meaning !== meaning);
  await set(storeKey(lang), [...rest, ...same.slice(-(MAX_EXAMPLES_PER_MEANING - 1)), { meaning, vector: [...vector], speaker }]);
}

/** Her speech as a vector. The audio itself is dropped as soon as this returns. */
export async function embedAudio(audio: Float32Array): Promise<Float32Array> {
  return (await loadEmbedder()).embed(audio);
}

export interface Listened {
  vector: Float32Array;
  /** Always a question to confirm, or an abstention. Never an acceptance. */
  heard: Heard;
}

export async function understand(audio: Float32Array, examples: Example[], expect: string[]): Promise<Listened> {
  const vector = await embedAudio(audio);
  const top = (await speech()).scoreMeanings(vector, examples, expect)[0];
  return { vector, heard: top ? { kind: 'confirm', meaning: top.meaning } : { kind: 'abstain' } };
}

// ── Online listening ───────────────────────────────────────────────────────
// With a connection, and only if she has agreed, her recording is sent to a speech service through our
// server and comes back as text. It understands free speech far better than the small model on the phone.
// Without a connection, or if she said no, everything stays on the phone as before.

const SPEECH_URL = (import.meta.env.VITE_SPEECH_URL as string | undefined) ?? 'https://amma-server.onrender.com';
// The key carries a version: what she is asked to agree to changed when the language model was added.
const CONSENT_KEY = 'amma.onlineHelp.v2';
export type OnlineChoice = 'yes' | 'no' | undefined;

export const onlineChoice = (): OnlineChoice => {
  const v = localStorage.getItem(CONSENT_KEY);
  return v === 'yes' || v === 'no' ? v : undefined;
};
export const setOnlineChoice = (v: 'yes' | 'no') => localStorage.setItem(CONSENT_KEY, v);

/** The free server sleeps when idle; a nudge when the app opens means her first words are not lost to a slow start. */
export function wakeSpeechServer(): void {
  if (onlineChoice() === 'yes' && navigator.onLine) void fetch(`${SPEECH_URL}/health`).catch(() => undefined);
}

/** Her words as text, or undefined when the service cannot be reached in time: the caller then falls back to the phone. */
export async function transcribeOnline(blob: Blob, locale: string): Promise<string | undefined> {
  if (!navigator.onLine) return undefined;
  try {
    const res = await fetch(`${SPEECH_URL}/stt?lang=${encodeURIComponent(locale)}`, {
      method: 'POST',
      headers: { 'content-type': blob.type.split(';')[0] || 'audio/webm' },
      body: blob,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { text?: string }).text?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Words the phrase list did not recognise: ask the language model, through our server, which of the
 * expected meanings she meant. It can only return one of those meanings or nothing, and the caller
 * plays the suggestion back for her to confirm.
 */
export async function matchOnline(text: string, lang: string, expect: string[]): Promise<string | undefined> {
  if (!navigator.onLine || onlineChoice() !== 'yes' || !text.trim()) return undefined;
  try {
    const res = await fetch(`${SPEECH_URL}/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang, expect }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return undefined;
    const { meaning } = (await res.json()) as { meaning?: string | null };
    return meaning && expect.includes(meaning) ? meaning : undefined;
  } catch {
    return undefined;
  }
}

