"""Speaker-held-out few-shot episodes, prototype / NN classification, abstention metrics.

Implements reports/protocol.md sections 3-6. Nothing here depends on test results.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

KS = (1, 3, 5, 10)
N_EPISODES = 50
N_SUPPORT_SPK, N_CAL_SPK, N_TEST_SPK = 6, 4, 6
TARGETS = (0.0, 0.01, 0.05)
COVERAGES = tuple(round(0.1 * i, 1) for i in range(1, 11))
SCORES = ("maxsim", "margin")
CONDS = ("A", "B")


def make_episodes(meta: pd.DataFrame, n_episodes: int = N_EPISODES) -> tuple[list[dict], int]:
    intents = sorted(meta.intent.unique())
    y = meta.intent.map({c: i for i, c in enumerate(intents)}).to_numpy()
    spk = meta.user_id.to_numpy()
    speakers = np.array(sorted(meta.user_id.unique()))
    assert len(speakers) == N_SUPPORT_SPK + N_CAL_SPK + N_TEST_SPK
    episodes, redraws = [], 0
    for seed in range(n_episodes):
        rng = np.random.default_rng(seed)
        while True:
            p = rng.permutation(speakers)
            sup_s, cal_s, test_s = (p[:N_SUPPORT_SPK], p[N_SUPPORT_SPK:N_SUPPORT_SPK + N_CAL_SPK],
                                    p[N_SUPPORT_SPK + N_CAL_SPK:])
            pool = np.flatnonzero(np.isin(spk, sup_s))
            cal = np.flatnonzero(np.isin(spk, cal_s))
            test = np.flatnonzero(np.isin(spk, test_s))
            ok = (np.bincount(y[pool], minlength=len(intents)).min() >= max(KS)
                  and np.bincount(y[cal], minlength=len(intents)).min() >= 1
                  and np.bincount(y[test], minlength=len(intents)).min() >= 1)
            if ok:
                break
            redraws += 1
        support = {}
        for k in KS:
            support[k] = np.concatenate(
                [rng.choice(pool[y[pool] == c], size=k, replace=False) for c in range(len(intents))])
        episodes.append({"seed": seed, "support": support, "pool": pool, "cal": cal, "test": test,
                         "support_speakers": [int(s) for s in sup_s],
                         "cal_speakers": [int(s) for s in cal_s],
                         "test_speakers": [int(s) for s in test_s]})
    return episodes, redraws


def class_scores(sup: np.ndarray, sup_y: np.ndarray, qry: np.ndarray, n_cls: int, clf: str) -> np.ndarray:
    if clf == "proto":
        protos = np.stack([sup[sup_y == c].mean(0) for c in range(n_cls)])
        protos /= np.linalg.norm(protos, axis=1, keepdims=True)
        return qry @ protos.T
    if clf == "nn":
        sims = qry @ sup.T
        return np.stack([sims[:, sup_y == c].max(1) for c in range(n_cls)], axis=1)
    raise ValueError(clf)


def _risk_prefix(conf: np.ndarray, wrong: np.ndarray):
    order = np.argsort(-conf, kind="stable")
    w = wrong[order].astype(np.float64)
    risk = np.cumsum(w) / np.arange(1, len(w) + 1)
    return order, risk


def oracle_coverage(conf, wrong, target) -> float:
    if len(conf) == 0:
        return float("nan")
    _, risk = _risk_prefix(conf, wrong)
    ok = np.flatnonzero(risk <= target + 1e-12)
    return float((ok[-1] + 1) / len(conf)) if len(ok) else 0.0


def calibrated_threshold(conf, wrong, target) -> float:
    if len(conf) == 0:
        return float("inf")
    order, risk = _risk_prefix(conf, wrong)
    ok = np.flatnonzero(risk <= target + 1e-12)
    return float(conf[order][ok[-1]]) if len(ok) else float("inf")


def rc_curve(conf, wrong) -> tuple[list[float], float]:
    if len(conf) == 0:
        return [float("nan")] * len(COVERAGES), float("nan")
    _, risk = _risk_prefix(conf, wrong)
    n = len(conf)
    pts = [float(risk[max(1, int(round(c * n))) - 1]) for c in COVERAGES]
    return pts, float(risk.mean())


def _acc(pred, y, n_cls):
    correct = pred == y
    present = [c for c in range(n_cls) if (y == c).any()]
    macro = float(np.mean([correct[y == c].mean() for c in present])) if present else float("nan")
    micro = float(correct.mean()) if len(y) else float("nan")
    return micro, macro, len(present)


def _stats(v) -> dict:
    a = np.asarray(v, dtype=np.float64)
    a = a[~np.isnan(a)]
    if len(a) == 0:
        return {"mean": None, "std": None, "p2.5": None, "p97.5": None, "n": 0}
    return {"mean": float(a.mean()), "std": float(a.std(ddof=1)) if len(a) > 1 else 0.0,
            "p2.5": float(np.percentile(a, 2.5)), "p97.5": float(np.percentile(a, 97.5)), "n": int(len(a))}


def _l2(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def evaluate(e_sup: np.ndarray, e_qry: np.ndarray, meta: pd.DataFrame, episodes: list[dict],
             clf: str, center: bool = False) -> dict:
    """e_sup / e_qry: (N, D) L2-normalised vectors used for support and for cal/test queries.

    center=True is a POST-HOC exploratory variant (not in the protocol): subtract the mean vector of
    the episode's support-pool speakers (unlabelled, no query data) and re-normalise.
    """
    intents = sorted(meta.intent.unique())
    n_cls = len(intents)
    y = meta.intent.map({c: i for i, c in enumerate(intents)}).to_numpy()
    text = meta.text.to_numpy()
    out = {}
    for k in KS:
        rec = {c: {"test_micro": [], "test_macro": [], "cal_micro": [], "cal_macro": [],
                   "n_test": [], "n_test_intents": [],
                   **{f"rc_{s}": [] for s in SCORES}, **{f"aurc_{s}": [] for s in SCORES},
                   **{f"oracle_{s}_{t}": [] for s in SCORES for t in TARGETS},
                   **{f"calcov_{s}_{t}": [] for s in SCORES for t in TARGETS},
                   **{f"calerr_{s}_{t}": [] for s in SCORES for t in TARGETS},
                   **{f"calacc_{s}_{t}": [] for s in SCORES for t in TARGETS},
                   **{f"calwrong_{s}_{t}": [] for s in SCORES for t in TARGETS}} for c in CONDS}
        for ep in episodes:
            si = ep["support"][k]
            sup_texts = set(text[si])
            mu = e_sup[ep["pool"]].mean(0) if center else None
            e_s = _l2(e_sup[si] - mu) if center else e_sup[si]
            parts = {}
            for name in ("cal", "test"):
                qi = ep[name]
                e_q = _l2(e_qry[qi] - mu) if center else e_qry[qi]
                sc = class_scores(e_s, y[si], e_q, n_cls, clf)
                pred = sc.argmax(1)
                srt = np.sort(sc, axis=1)
                conf = {"maxsim": srt[:, -1], "margin": srt[:, -1] - srt[:, -2]}
                novel = np.array([t not in sup_texts for t in text[qi]])
                parts[name] = (pred, y[qi], conf, novel)
            for c in CONDS:
                r = rec[c]
                sel = {}
                for name in ("cal", "test"):
                    pred, yy, conf, novel = parts[name]
                    m = np.ones(len(yy), bool) if c == "A" else novel
                    sel[name] = (pred[m], yy[m], {s: conf[s][m] for s in SCORES})
                    micro, macro, n_int = _acc(pred[m], yy[m], n_cls)
                    r[f"{name}_micro"].append(micro)
                    r[f"{name}_macro"].append(macro)
                    if name == "test":
                        r["n_test"].append(int(m.sum()))
                        r["n_test_intents"].append(n_int)
                cp, cy, cconf = sel["cal"]
                tp, ty, tconf = sel["test"]
                cw, tw = cp != cy, tp != ty
                for s in SCORES:
                    pts, aurc = rc_curve(tconf[s], tw)
                    r[f"rc_{s}"].append(pts)
                    r[f"aurc_{s}"].append(aurc)
                    for t in TARGETS:
                        r[f"oracle_{s}_{t}"].append(oracle_coverage(tconf[s], tw, t))
                        thr = calibrated_threshold(cconf[s], cw, t)
                        acc = tconf[s] >= thr
                        n_acc, n_wrong = int(acc.sum()), int((acc & tw).sum())
                        r[f"calcov_{s}_{t}"].append(n_acc / len(ty) if len(ty) else float("nan"))
                        r[f"calerr_{s}_{t}"].append(n_wrong / n_acc if n_acc else float("nan"))
                        r[f"calacc_{s}_{t}"].append(n_acc)
                        r[f"calwrong_{s}_{t}"].append(n_wrong)
        out[str(k)] = {}
        for c in CONDS:
            r = rec[c]
            d = {"test_micro": _stats(r["test_micro"]), "test_macro": _stats(r["test_macro"]),
                 "cal_micro": _stats(r["cal_micro"]), "cal_macro": _stats(r["cal_macro"]),
                 "n_test_mean": float(np.mean(r["n_test"])),
                 "n_test_intents_mean": float(np.mean(r["n_test_intents"])),
                 "per_episode": {"test_micro": r["test_micro"], "test_macro": r["test_macro"]},
                 "abstention": {}}
            for s in SCORES:
                rc = np.array(r[f"rc_{s}"], dtype=np.float64)
                a = {"risk_at_coverage": {str(cv): float(np.nanmean(rc[:, j])) for j, cv in enumerate(COVERAGES)},
                     "aurc": _stats(r[f"aurc_{s}"]), "oracle_coverage_at_error": {}, "calibrated": {}}
                for t in TARGETS:
                    a["oracle_coverage_at_error"][str(t)] = _stats(r[f"oracle_{s}_{t}"])
                    errs = np.array(r[f"calerr_{s}_{t}"], dtype=np.float64)
                    n_acc, n_wrong = sum(r[f"calacc_{s}_{t}"]), sum(r[f"calwrong_{s}_{t}"])
                    a["calibrated"][str(t)] = {
                        "coverage": _stats(r[f"calcov_{s}_{t}"]),
                        "error_among_accepted_per_episode": _stats(errs),
                        "error_among_accepted_pooled": (n_wrong / n_acc) if n_acc else None,
                        "accepted_total": int(n_acc), "wrong_total": int(n_wrong),
                        "share_episodes_error_above_target": float(np.mean(np.nan_to_num(errs, nan=0.0) > t + 1e-12)),
                        "share_episodes_accepting_nothing": float(np.mean(np.array(r[f"calacc_{s}_{t}"]) == 0)),
                    }
                d["abstention"][s] = a
            out[str(k)][c] = d
    return out


def selection_score(cell: dict) -> float:
    """Protocol section 6: macro accuracy on calibration speakers, condition A, mean over k."""
    return float(np.mean([cell[str(k)]["A"]["cal_macro"]["mean"] for k in KS]))
