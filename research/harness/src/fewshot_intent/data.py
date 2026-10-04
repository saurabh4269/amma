"""WolBanking77 audio portion: download (pinned revision), load, describe, degrade."""
from __future__ import annotations

import io
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import soundfile as sf

REPO = "karim155/WolBanking77"
REVISION = "b530b0a641ad4c6fe2881eb3b13a22e77bb39ceb"
FILES = [
    "WolBanking77/audio/train.parquet",
    "WolBanking77/audio/test.parquet",
    "WolBanking77/audio/questions.csv",
    "WolBanking77/audio/responses.csv",
]
SR = 16000

RESEARCH_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = RESEARCH_DIR / "data"
REPORTS_DIR = RESEARCH_DIR / "reports"
DS_DIR = DATA_DIR / "wolbanking77" / "audio"
CACHE_DIR = DATA_DIR / "cache"
HF_DIR = DATA_DIR / "hf_cache"
ONNX_DIR = DATA_DIR / "onnx"


def download() -> None:
    DS_DIR.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        dst = DS_DIR / Path(f).name
        if dst.exists() and dst.stat().st_size > 0:
            continue
        url = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/{f}"
        print(f"downloading {url}")
        tmp = dst.with_suffix(dst.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(dst)


class Clips:
    """All clips (official train+test pooled), in a fixed order: train rows then test rows."""

    def __init__(self) -> None:
        download()
        frames, self._bytes = [], []
        for split in ("train", "test"):
            t = pq.read_table(DS_DIR / f"{split}.parquet").to_pandas()
            self._bytes += [a["bytes"] for a in t["audio"]]
            t["file"] = [a["path"] for a in t["audio"]]
            t["official_split"] = split
            frames.append(t.drop(columns=["audio"]))
        self.meta = pd.concat(frames, ignore_index=True)
        self.n = len(self.meta)

    def wave(self, i: int) -> np.ndarray:
        x, sr = sf.read(io.BytesIO(self._bytes[i]), dtype="float32", always_2d=False)
        assert sr == SR and x.ndim == 1, (sr, x.shape)
        return x

    def describe(self) -> dict:
        m = self.meta
        infos = [sf.info(io.BytesIO(b)) for b in self._bytes]
        dur = np.array([i.frames / i.samplerate for i in infos])
        tr, te = m[m.official_split == "train"], m[m.official_split == "test"]
        per_spk = m.groupby("user_id").agg(
            clips=("text", "size"), gender=("gender", lambda s: "/".join(sorted(set(s)))),
            intents=("intent", "nunique"))
        per_spk["minutes"] = pd.Series(dur, index=m.index).groupby(m.user_id).sum() / 60
        return {
            "repo": REPO, "revision": REVISION, "license_on_card": "cc-by-4.0",
            "n_clips": int(self.n),
            "n_clips_official_train": int(len(tr)), "n_clips_official_test": int(len(te)),
            "sampling_rates": {str(k): int(v) for k, v in pd.Series([i.samplerate for i in infos]).value_counts().items()},
            "channels": sorted({int(i.channels) for i in infos}),
            "subtypes": sorted({i.subtype for i in infos}),
            "duration_s": {"total_hours": float(dur.sum() / 3600), "mean": float(dur.mean()),
                           "median": float(np.median(dur)), "min": float(dur.min()),
                           "p05": float(np.percentile(dur, 5)), "p95": float(np.percentile(dur, 95)),
                           "max": float(dur.max())},
            "n_intents": int(m.intent.nunique()),
            "clips_per_intent": {k: int(v) for k, v in m.intent.value_counts().items()},
            "sentences_per_intent": {k: int(v) for k, v in m.groupby("intent").text.nunique().items()},
            "n_unique_sentences": int(m.text.nunique()),
            "recordings_per_sentence": {"min": int(m.groupby("text").size().min()),
                                        "median": float(m.groupby("text").size().median()),
                                        "max": int(m.groupby("text").size().max())},
            "n_speaker_ids": int(m.user_id.nunique()),
            "speakers_in_both_official_splits": int(len(set(tr.user_id) & set(te.user_id))),
            "sentences_in_both_official_splits": int(len(set(tr.text) & set(te.text))),
            "gender_field_clip_counts": {k: int(v) for k, v in m.gender.value_counts().items()},
            "speakers": [{"user_id": int(u), "clips": int(r.clips), "gender_field": r.gender,
                          "intents": int(r.intents), "minutes": round(float(r.minutes), 1)}
                         for u, r in per_spk.sort_values("clips", ascending=False).iterrows()],
        }


def degrade(x: np.ndarray, condition: str, clip_index: int) -> np.ndarray:
    if condition == "clean":
        return x
    if condition == "tel8k":
        import soxr
        y = soxr.resample(soxr.resample(x, SR, 8000, quality="HQ"), 8000, SR, quality="HQ")
        y = y[: len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
        return y.astype(np.float32)
    if condition == "noise10":
        rng = np.random.default_rng(100_000 + clip_index)
        p = float(np.mean(x.astype(np.float64) ** 2)) + 1e-12
        noise = rng.standard_normal(len(x)) * np.sqrt(p / 10 ** (10 / 10))
        return (x + noise).astype(np.float32)
    raise ValueError(condition)
