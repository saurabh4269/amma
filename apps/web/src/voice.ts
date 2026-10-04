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
export async function voiceAvailable(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    // Offline, the model is in the service worker's store; a network check would wrongly hide the microphone.
    if (typeof caches !== 'undefined' && (await caches.match(MODEL_DIR + MODEL_FILE, { ignoreSearch: true }))) return true;
    return (await fetch(MODEL_DIR + MODEL_FILE, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
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

export interface Recording {
  /** Stop and get the audio, mono at 16 kHz. */
  stop(): Promise<Float32Array>;
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
            const buf = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
            void ctx.close();
            resolve((await speech()).resampleTo16k(buf.getChannelData(0), buf.sampleRate).slice(0, MAX_SECONDS * SAMPLE_RATE));
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
