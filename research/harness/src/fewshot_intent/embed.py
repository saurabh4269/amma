"""Frozen Whisper encoder -> one pooled vector per clip and per layer, cached on disk."""
from __future__ import annotations

import math
import os
import time

import numpy as np

from .data import CACHE_DIR, HF_DIR, SR, Clips, degrade

os.environ.setdefault("HF_HOME", str(HF_DIR))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

ENCODERS = {"tiny": "openai/whisper-tiny", "base": "openai/whisper-base"}
SAMPLES_PER_FRAME = 320  # 10 ms mel hop x conv stride 2 = 20 ms per encoder frame


def n_real_frames(n_samples: int) -> int:
    return min(1500, max(1, math.ceil(n_samples / SAMPLES_PER_FRAME)))


def layer_names(n_layers: int) -> list[str]:
    # transformers exposes hidden_states = [embeddings, block 1, ..., block n-1, LayerNorm(block n)]:
    # the last block's output is only available after the final LayerNorm ("final").
    return [f"L{i}" for i in range(1, n_layers)] + ["final"]


def load_encoder(enc: str):
    import torch
    from transformers import WhisperFeatureExtractor, WhisperModel
    fe = WhisperFeatureExtractor.from_pretrained(ENCODERS[enc])
    model = WhisperModel.from_pretrained(ENCODERS[enc]).get_encoder().eval()
    torch.set_grad_enabled(False)
    return fe, model


def l2(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def embed(clips: Clips, enc: str, condition: str = "clean", batch: int = 8) -> dict:
    """Returns {'emb': (N, n_layers+1, D) L2-normalised float32, 'layers': [...]}; cached."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"emb_{enc}_{condition}.npz"
    if path.exists():
        z = np.load(path, allow_pickle=False)
        if z["emb"].shape[0] == clips.n:
            return {"emb": z["emb"], "layers": [str(s) for s in z["layers"]]}
    import torch
    fe, model = load_encoder(enc)
    names = layer_names(len(model.layers))
    out = np.zeros((clips.n, len(names), model.config.d_model), dtype=np.float32)
    t0 = time.time()
    for s in range(0, clips.n, batch):
        idx = range(s, min(s + batch, clips.n))
        waves = [degrade(clips.wave(i), condition, i) for i in idx]
        feats = fe(waves, sampling_rate=SR, return_tensors="pt").input_features
        r = model(feats, output_hidden_states=True)
        hs = list(r.hidden_states[1:])  # L1..L(n-1), final (= last_hidden_state)
        assert len(hs) == len(names) and torch.equal(hs[-1], r.last_hidden_state)
        for b, i in enumerate(idx):
            nf = n_real_frames(len(waves[b]))
            for li, h in enumerate(hs):
                out[i, li] = h[b, :nf].mean(0).numpy()
        if (s // batch) % 25 == 0:
            print(f"  [{enc}/{condition}] {s + len(idx)}/{clips.n}  {time.time() - t0:.0f}s", flush=True)
    out = l2(out).astype(np.float32)
    np.savez(path, emb=out, layers=np.array(names))
    return {"emb": out, "layers": names}
