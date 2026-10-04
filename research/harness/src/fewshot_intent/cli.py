"""CLI: `uv run fewshot all` reproduces every number in reports/wolbanking77-fewshot.md."""
from __future__ import annotations

import argparse
import json
import platform
import time

import numpy as np

from .data import REPORTS_DIR, Clips

RESULTS = REPORTS_DIR / "wolbanking77-fewshot.results.json"
CLFS = ("proto", "nn")


def _load() -> dict:
    return json.loads(RESULTS.read_text()) if RESULTS.exists() else {}


def _save(res: dict) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(res, indent=1, ensure_ascii=False))


def stage_dataset(res, clips):
    res["dataset"] = clips.describe()


def stage_grid(res, clips):
    from .embed import ENCODERS, embed
    from .evaluate import (KS, N_CAL_SPK, N_EPISODES, N_SUPPORT_SPK, N_TEST_SPK, evaluate,
                           make_episodes, selection_score)
    episodes, redraws = make_episodes(clips.meta)
    res["episodes"] = {"n": N_EPISODES, "ks": list(KS), "redraws": redraws,
                       "speakers_support_cal_test": [N_SUPPORT_SPK, N_CAL_SPK, N_TEST_SPK],
                       "splits": [{k: e[k] for k in ("seed", "support_speakers", "cal_speakers", "test_speakers")}
                                  for e in episodes]}
    grid, sel = {}, {}
    for enc in ENCODERS:
        z = embed(clips, enc, "clean")
        for li, layer in enumerate(z["layers"]):
            e = z["emb"][:, li]
            for clf in CLFS:
                key = f"{enc}|{layer}|{clf}"
                grid[key] = evaluate(e, e, clips.meta, episodes, clf)
                sel[key] = selection_score(grid[key])
                print(f"{key:22s} cal-macro(sel)={sel[key]:.4f}", flush=True)
    res["grid"] = grid
    order = {"tiny": 0, "base": 1}

    def rank(key):
        enc, layer, clf = key.split("|")
        li = 99 if layer == "final" else int(layer[1:])
        return (-round(sel[key], 6), order[enc], li, CLFS.index(clf))

    best = sorted(sel, key=rank)[0]
    res["selection"] = {"rule": "max macro accuracy on calibration speakers, condition A, mean over k",
                        "scores": sel, "best": best,
                        "best_per_encoder": {enc: sorted([k for k in sel if k.startswith(enc + "|")], key=rank)[0]
                                             for enc in ENCODERS}}
    print("best:", best, res["selection"]["best_per_encoder"])


def stage_robustness(res, clips):
    from .embed import embed
    from .evaluate import evaluate, make_episodes
    enc, layer, clf = res["selection"]["best"].split("|")
    episodes, _ = make_episodes(clips.meta)
    clean = embed(clips, enc, "clean")
    li = clean["layers"].index(layer)
    rob = {}
    for cond in ("tel8k", "noise10"):
        deg = embed(clips, enc, cond)["emb"][:, li]
        rob[f"{cond}|mismatched"] = evaluate(clean["emb"][:, li], deg, clips.meta, episodes, clf)
        rob[f"{cond}|matched"] = evaluate(deg, deg, clips.meta, episodes, clf)
    res["robustness"] = {"config": res["selection"]["best"], "conditions": rob}


def stage_onnx(res, clips):
    from .embed import embed
    from .evaluate import evaluate, make_episodes
    from .export import export, latency, onnx_embed
    enc, layer, clf = res["selection"]["best"].split("|")
    info = export(enc, layer)
    info["latency"] = latency(enc, info["files"], clips)
    tag = "selected" if "selected" in info["files"] else "full"
    f = info["files"][tag]
    ref = embed(clips, enc, "clean")
    ref = ref["emb"][:, ref["layers"].index(layer)]
    idx = np.random.default_rng(0).choice(clips.n, 200, replace=False)
    e32 = onnx_embed(clips, enc, f["fp32_path"], "onnx-fp32", indices=idx)
    cos = (e32 * ref[idx]).sum(1)
    info["parity_fp32_vs_pytorch"] = {"n": 200, "cos_min": float(cos.min()), "cos_mean": float(cos.mean())}
    e8 = onnx_embed(clips, enc, f["int8_path"], f"onnx-int8-{layer}")
    cos8 = (e8 * ref).sum(1)
    info["int8_vs_pytorch_cosine"] = {"n": int(clips.n), "min": float(cos8.min()), "mean": float(cos8.mean()),
                                      "p05": float(np.percentile(cos8, 5))}
    episodes, _ = make_episodes(clips.meta)
    info["int8_eval"] = evaluate(e8, e8, clips.meta, episodes, clf)
    info["config"] = res["selection"]["best"]
    res["onnx"] = info


def stage_report(res, clips):
    from .report import write_report
    write_report(res)


STAGES = {"dataset": stage_dataset, "grid": stage_grid, "robustness": stage_robustness,
          "onnx": stage_onnx, "report": stage_report}


def main() -> None:
    ap = argparse.ArgumentParser(prog="fewshot", description=__doc__)
    ap.add_argument("stage", choices=["all", *STAGES], help="'all' runs every stage in order")
    args = ap.parse_args()
    import onnxruntime
    import torch
    import transformers
    res = _load()
    clips = Clips()
    res["environment"] = {"python": platform.python_version(), "torch": torch.__version__,
                          "transformers": transformers.__version__, "onnxruntime": onnxruntime.__version__,
                          "cpu": platform.processor() or platform.machine(), "torch_threads": torch.get_num_threads()}
    for name in (STAGES if args.stage == "all" else [args.stage]):
        t = time.time()
        print(f"== {name}", flush=True)
        STAGES[name](res, clips)
        res.setdefault("stage_seconds", {})[name] = round(time.time() - t, 1)
        _save(res)
    print("results:", RESULTS)


if __name__ == "__main__":
    main()
