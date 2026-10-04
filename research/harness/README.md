# fewshot-intent harness

Few-shot spoken-intent matching without transcription: frozen Whisper encoder -> one pooled vector per
utterance -> nearest prototype / nearest neighbour -> abstain below a threshold. Measured on the audio
portion of WolBanking77 (Wolof, banking/transport intents).

## Reproduce everything

```sh
cd research/harness
uv run fewshot all
```

That one command downloads the dataset (pinned revision, ~490 MB) and the two encoders into
`research/data/`, caches embeddings, runs every experiment, and rewrites

- `research/reports/wolbanking77-fewshot.results.json` (raw results)
- `research/reports/wolbanking77-fewshot.md` (report; tables are generated from the JSON, prose comes
  from `src/fewshot_intent/prose.py`)

CPU only, no ffmpeg. A cold run takes roughly 2 hours on a 12-thread laptop CPU (almost all of it is
encoder forward passes on 30 s padded inputs); a warm run with cached embeddings takes a few minutes.
Splits, noise and sampling are seeded, so the accuracy numbers are deterministic given the same library
versions (`uv.lock`); latency numbers vary with machine load.

Single stages: `uv run fewshot {dataset|grid|robustness|onnx|diagnostics|report}`. Later stages read
what earlier stages wrote to the results JSON.

## Layout

- `src/fewshot_intent/data.py` - download, WAV decoding (soundfile), dataset statistics, degradations
- `src/fewshot_intent/embed.py` - Whisper encoder, pooling over real frames only, embedding cache
- `src/fewshot_intent/evaluate.py` - speaker-held-out episodes, classifiers, risk-coverage metrics
- `src/fewshot_intent/export.py` - ONNX export, int8 quantisation, latency, int8 embeddings
- `src/fewshot_intent/report.py`, `prose.py` - report tables and text
- `../reports/protocol.md` - the protocol, written before any result was seen, with deviations listed
