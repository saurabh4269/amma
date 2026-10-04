import { LOG_MEL_DIMS, whisperLogMel } from './logmel.ts';
import type { Scored } from '@yaay/matcher';

/**
 * Speech to one vector, with no transcript: Whisper's log-mel features, the encoder only,
 * then the mean of the encoder frames that cover real audio. The decoder is never loaded.
 *
 * The ONNX runtime is passed in, so the same code runs in the browser (onnxruntime-web)
 * and on a server or in tests (onnxruntime-node).
 */

export const SAMPLE_RATE = 16_000;
/** 10 ms mel hop, then a stride-2 convolution: one encoder frame per 20 ms of audio. */
const SAMPLES_PER_FRAME = 320;
const MAX_FRAMES = 1500;

/** The few pieces of an ONNX runtime this module needs. Both runtimes provide them. */
export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array | string, options?: object): Promise<OrtSession> };
}
interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;
}

export interface Embedder {
  /** `audio` is mono, 16 kHz, in the range -1..1. Returns a unit-length vector. */
  embed(audio: Float32Array): Promise<Float32Array>;
}

export async function createEmbedder(ort: OrtLike, model: Uint8Array | string): Promise<Embedder> {
  const session = await ort.InferenceSession.create(model);
  return {
    async embed(audio) {
      const out = await session.run({ input_features: new ort.Tensor('float32', whisperLogMel(audio), LOG_MEL_DIMS) });
      const hidden = out.last_hidden_state;
      if (!hidden) throw new Error('encoder returned no last_hidden_state');
      const width = hidden.dims[2]!;
      // Whisper pads every clip to 30 seconds. Averaging over the padding would drown the speech.
      const frames = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(audio.length / SAMPLES_PER_FRAME)));
      const v = new Float32Array(width);
      for (let f = 0; f < frames; f++) for (let d = 0; d < width; d++) v[d]! += hidden.data[f * width + d]!;
      return normalise(v);
    },
  };
}

export function normalise(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export const cosine = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

/** One stored example of a meaning being said. Only the vector is kept; the audio is not. */
export interface Example {
  meaning: string;
  vector: Float32Array;
  speaker: string;
}

/**
 * Nearest-neighbour scores: for each expected meaning, its best-matching example.
 * Returned highest first. What to do with the scores (accept, confirm, abstain) is decided elsewhere.
 */
export function scoreMeanings(query: Float32Array, examples: Example[], expect: string[]): Scored[] {
  const best = new Map<string, number>();
  const wanted = new Set(expect);
  for (const e of examples) {
    if (!wanted.has(e.meaning)) continue;
    const s = cosine(query, e.vector);
    if (s > (best.get(e.meaning) ?? -Infinity)) best.set(e.meaning, s);
  }
  return [...best].map(([meaning, score]) => ({ meaning, score })).sort((a, b) => b.score - a.score);
}

/** Resample by linear interpolation. Good enough for speech going into a mel filterbank. */
export function resampleTo16k(audio: Float32Array, fromRate: number): Float32Array {
  if (fromRate === SAMPLE_RATE) return audio;
  const n = Math.round((audio.length * SAMPLE_RATE) / fromRate);
  const out = new Float32Array(n);
  const step = fromRate / SAMPLE_RATE;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const a = audio[j] ?? 0;
    const b = audio[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}
