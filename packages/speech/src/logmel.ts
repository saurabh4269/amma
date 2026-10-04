/**
 * Whisper's input features, written out so the phone does not need a large library for them:
 * 30 seconds of audio at 16 kHz, a 25 ms Hann window every 10 ms, 80 mel bands, log10,
 * clipped to 8 below the loudest value and rescaled. Checked against the reference
 * implementation by the embedder test.
 */
const N_FFT = 400;
const HOP = 160;
const N_MELS = 80;
const SAMPLE_RATE = 16_000;
const N_SAMPLES = 30 * SAMPLE_RATE;
const N_FRAMES = N_SAMPLES / HOP; // 3000
const N_BINS = N_FFT / 2 + 1; // 201
const FLOOR = 1e-10;

const hzToMel = (f: number) => (f < 1000 ? (3 * f) / 200 : 15 + (Math.log(f / 1000) * 27) / Math.log(6.4));
const melToHz = (m: number) => (m < 15 ? (200 * m) / 3 : 1000 * Math.exp(((m - 15) * Math.log(6.4)) / 27));

/** Triangular mel filters, Slaney scale and Slaney area normalisation. */
function melFilters(): Float32Array[] {
  const lo = hzToMel(0);
  const hi = hzToMel(SAMPLE_RATE / 2);
  const points = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(lo + ((hi - lo) * i) / (N_MELS + 1)));
  return Array.from({ length: N_MELS }, (_, m) => {
    const [a, b, c] = [points[m]!, points[m + 1]!, points[m + 2]!];
    const norm = 2 / (c - a);
    const row = new Float32Array(N_BINS);
    for (let k = 0; k < N_BINS; k++) {
      const f = (k * SAMPLE_RATE) / N_FFT;
      row[k] = Math.max(0, Math.min((f - a) / (b - a), (c - f) / (c - b))) * norm;
    }
    return row;
  });
}

let tables: { window: Float32Array; cos: Float32Array; sin: Float32Array; mel: Float32Array[] } | undefined;
function getTables() {
  if (tables) return tables;
  const window = Float32Array.from({ length: N_FFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT));
  const cos = new Float32Array(N_FFT);
  const sin = new Float32Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / N_FFT);
    sin[i] = Math.sin((2 * Math.PI * i) / N_FFT);
  }
  return (tables = { window, cos, sin, mel: melFilters() });
}

/** Returns the features as one array of 80 x 3000 values, row by row. */
export function whisperLogMel(audio: Float32Array): Float32Array {
  const { window, cos, sin, mel } = getTables();
  const n = Math.min(audio.length, N_SAMPLES);
  // The clip sits at the start of 30 s of silence, and the whole thing is mirrored by half a window at each end.
  const half = N_FFT / 2;
  const sample = (i: number): number => {
    let j = i - half;
    if (j < 0) j = -j;
    return j < n ? audio[j]! : 0;
  };
  const out = new Float32Array(N_MELS * N_FRAMES).fill(Math.log10(FLOOR));
  // Frames that only see silence keep the floor value, so only frames touching the clip are computed.
  const lastFrame = Math.min(N_FRAMES - 1, Math.ceil((n + half) / HOP));
  const frame = new Float32Array(N_FFT);
  const power = new Float32Array(N_BINS);
  let max = -Infinity;
  for (let t = 0; t <= lastFrame; t++) {
    for (let i = 0; i < N_FFT; i++) frame[i] = sample(t * HOP + i) * window[i]!;
    for (let k = 0; k < N_BINS; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0, p = 0; i < N_FFT; i++, p = (p + k) % N_FFT) {
        re += frame[i]! * cos[p]!;
        im -= frame[i]! * sin[p]!;
      }
      power[k] = re * re + im * im;
    }
    for (let m = 0; m < N_MELS; m++) {
      const row = mel[m]!;
      let e = 0;
      for (let k = 0; k < N_BINS; k++) e += row[k]! * power[k]!;
      const v = Math.log10(Math.max(e, FLOOR));
      out[m * N_FRAMES + t] = v;
      if (v > max) max = v;
    }
  }
  const floor = Math.max(max, Math.log10(FLOOR)) - 8;
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i]!, floor) + 4) / 4;
  return out;
}

export const LOG_MEL_DIMS = [1, N_MELS, N_FRAMES];
