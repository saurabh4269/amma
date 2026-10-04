"""Diagnostic: does matching work when the support set contains the SAME phrase said by OTHER people?

The main benchmark asks a harder question (a new sentence of a known intent). The product's case is
closer to this one: a language pack holds recordings of each phrase by a few speakers, and a new
speaker says one of those phrases. A second part asks the speaker-dependent question: do a speaker's
own earlier recordings match her later ones?

This was written after the main grid had been seen, so it is exploratory, not a pre-registered result.
No threshold is tuned on held-out data here; risk-coverage is reported on pooled leave-one-speaker-out
predictions. Uses the embeddings the harness cached (clean audio).

Run from research/harness:  uv run python ../diagnostics/same_phrase.py
"""
import json
from pathlib import Path

import numpy as np

from fewshot_intent.data import CACHE_DIR, REPORTS_DIR, Clips

rng = np.random.default_rng(0)
clips = Clips()
meta = clips.meta
print(list(meta.columns))
text_col = next(c for c in meta.columns if c.lower() in ("sentence", "text", "transcription", "utterance", "question"))
intent_col = next(c for c in meta.columns if c.lower() in ("intent", "label", "category"))
spk = meta["user_id"].to_numpy()
sent = meta[text_col].astype("category").cat.codes.to_numpy()
intent = meta[intent_col].astype("category").cat.codes.to_numpy()
speakers = np.unique(spk)


def unit(x):
    return x / np.linalg.norm(x, axis=1, keepdims=True)


def coverage_at(sim, correct, max_err):
    """Largest share of queries that can be accepted, taking the most similar first, with error <= max_err."""
    order = np.argsort(-sim)
    wrong = np.cumsum(~correct[order])
    n = np.arange(1, len(order) + 1)
    ok = np.nonzero(wrong / n <= max_err)[0]
    return float((ok[-1] + 1) / len(order)) if len(ok) else 0.0


out = {"note": "exploratory; see module docstring", "n_clips": int(len(spk)), "n_speakers": int(len(speakers)), "n_sentences": int(sent.max() + 1)}
for enc in ("tiny", "base"):
    z = np.load(CACHE_DIR / f"emb_{enc}_clean.npz", allow_pickle=True)
    layers = [str(x) for x in z["layers"]]
    for li, layer in enumerate(layers):
        e = unit(z["emb"][:, li, :])
        res = {}
        # Part 1: new speaker, phrases known from k other speakers (k = all, 5, 3, 1).
        for k in ("all", 5, 3, 1):
            sims, ok_sent, ok_int = [], [], []
            for s in speakers:
                q = np.nonzero(spk == s)[0]
                others = speakers[speakers != s]
                keep = others if k == "all" else rng.choice(others, size=k, replace=False)
                sup = np.nonzero(np.isin(spk, keep))[0]
                sim = e[q] @ e[sup].T
                j = sim.argmax(1)
                sims.append(sim.max(1)); ok_sent.append(sent[sup][j] == sent[q]); ok_int.append(intent[sup][j] == intent[q])
            sims, ok_sent, ok_int = map(np.concatenate, (sims, ok_sent, ok_int))
            res[f"new_speaker_k={k}"] = {
                "sentence_acc": round(float(ok_sent.mean()), 4),
                "intent_acc": round(float(ok_int.mean()), 4),
                "intent_coverage_at_1pct_error": round(coverage_at(sims, ok_int, 0.01), 4),
                "intent_coverage_at_5pct_error": round(coverage_at(sims, ok_int, 0.05), 4),
            }
        # Part 2: same speaker. Each clip is matched against that speaker's other clips only.
        sims, ok_sent, ok_int, has_twin = [], [], [], []
        for s in speakers:
            idx = np.nonzero(spk == s)[0]
            if len(idx) < 2:
                continue
            sim = e[idx] @ e[idx].T
            np.fill_diagonal(sim, -1)
            j = sim.argmax(1)
            twin = np.array([(sent[idx] == sent[i]).sum() > 1 for i in idx])
            sims.append(sim.max(1)); ok_sent.append(sent[idx][j] == sent[idx]); ok_int.append(intent[idx][j] == intent[idx]); has_twin.append(twin)
        sims, ok_sent, ok_int, has_twin = map(np.concatenate, (sims, ok_sent, ok_int, has_twin))
        res["same_speaker"] = {
            "clips": int(len(sims)),
            "clips_with_a_second_recording_of_the_same_sentence": int(has_twin.sum()),
            "sentence_acc_on_those": round(float(ok_sent[has_twin].mean()), 4) if has_twin.any() else None,
            "intent_acc_all": round(float(ok_int.mean()), 4),
        }
        out[f"{enc}|{layer}"] = res
        print(enc, layer, json.dumps(res))

(REPORTS_DIR / "same-phrase-diagnostic.json").write_text(json.dumps(out, indent=2))
