import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-node';
import { cosine, createEmbedder, normalise, resampleTo16k, scoreMeanings, type OrtLike } from '../src/index.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const MODELS = here('../../../data/models/whisper-tiny/');

/** 16-bit mono WAV to floats. The fixture is one clip from WolBanking77 (CC BY 4.0). */
function readWav(path: string): Float32Array {
  const b = readFileSync(path);
  const data = b.indexOf('data', 12, 'latin1');
  const pcm = new Int16Array(b.buffer, b.byteOffset + data + 8, b.readUInt32LE(data + 4) / 2);
  return Float32Array.from(pcm, (x) => x / 32768);
}

describe.skipIf(!existsSync(`${MODELS}encoder_model.onnx`))('embedder against the Python reference', () => {
  const audio = readWav(here('./fixtures/wolof-clip.wav'));
  const reference = Float32Array.from(JSON.parse(readFileSync(here('./fixtures/wolof-clip.tiny-final.json'), 'utf8')) as number[]);

  it('full-precision encoder gives the same vector as the research harness', async () => {
    const e = await createEmbedder(ort as unknown as OrtLike, `${MODELS}encoder_model.onnx`);
    const v = await e.embed(audio);
    expect(v).toHaveLength(384);
    expect(cosine(v, reference)).toBeGreaterThan(0.999);
  }, 60_000);

  it('the 10 MB quantised encoder stays close to it', async () => {
    const e = await createEmbedder(ort as unknown as OrtLike, `${MODELS}encoder_model_quantized.onnx`);
    const sim = cosine(await e.embed(audio), reference);
    console.log(`quantised vs reference cosine: ${sim.toFixed(4)}`);
    expect(sim).toBeGreaterThan(0.9);
  }, 60_000);
});

describe('matching helpers', () => {
  const v = (...x: number[]) => normalise(Float32Array.from(x));
  it('scores each expected meaning by its closest example', () => {
    const examples = [
      { meaning: 'sign:a', vector: v(1, 0, 0), speaker: 's1' },
      { meaning: 'sign:a', vector: v(0.9, 0.1, 0), speaker: 's2' },
      { meaning: 'sign:b', vector: v(0, 1, 0), speaker: 's1' },
      { meaning: 'sign:c', vector: v(0, 0, 1), speaker: 's1' },
    ];
    const scored = scoreMeanings(v(1, 0.05, 0), examples, ['sign:a', 'sign:b']);
    expect(scored.map((s) => s.meaning)).toEqual(['sign:a', 'sign:b']);
    expect(scored[0]!.score).toBeGreaterThan(0.99);
  });
  it('resamples to 16 kHz', () => {
    expect(resampleTo16k(new Float32Array(48_000), 48_000)).toHaveLength(16_000);
  });
});
