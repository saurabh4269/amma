"""Builds reports/wolbanking77-fewshot.md from the results JSON.

All numbers are read from the JSON at build time. The prose (reports/_prose/*.md) is hand-written
and contains no measured numbers except where explicitly marked as copied from the tables.
"""
from __future__ import annotations

from .data import REPORTS_DIR

KS = ("1", "3", "5", "10")
TARGETS = ("0.0", "0.01", "0.05")


def pct(x, d=1):
    return "n/a" if x is None else f"{100 * x:.{d}f}"


def ms(s, d=1):
    return f"{pct(s['mean'], d)} ± {pct(s['std'], d)}"


def table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def t_dataset(res):
    d = res["dataset"]
    du = d["duration_s"]
    rows = [
        ["Clips", f"{d['n_clips']} (official files: train {d['n_clips_official_train']}, test {d['n_clips_official_test']})"],
        ["Total audio", f"{du['total_hours']:.2f} h"],
        ["Format", f"WAV {'/'.join(d['subtypes'])}, {', '.join(d['sampling_rates'])} Hz, channels {d['channels']}"],
        ["Clip duration (s)", f"mean {du['mean']:.2f}, median {du['median']:.2f}, min {du['min']:.2f}, p5 {du['p05']:.2f}, p95 {du['p95']:.2f}, max {du['max']:.2f}"],
        ["Intents", d["n_intents"]],
        ["Distinct sentences", f"{d['n_unique_sentences']} (each recorded {d['recordings_per_sentence']['min']}-{d['recordings_per_sentence']['max']} times, median {d['recordings_per_sentence']['median']:.0f})"],
        ["Speaker ids (`user_id`)", d["n_speaker_ids"]],
        ["Speaker ids present in both official splits", d["speakers_in_both_official_splits"]],
        ["Sentences present in both official splits", f"{d['sentences_in_both_official_splits']} of {d['n_unique_sentences']}"],
        ["`gender` field (clips)", ", ".join(f"{k} {v}" for k, v in d["gender_field_clip_counts"].items())],
        ["Licence (dataset card)", "CC BY 4.0"],
    ]
    t1 = table(["Item", "Value"], rows)
    t2 = table(["Intent", "Clips", "Distinct sentences"],
               [[k, v, d["sentences_per_intent"][k]] for k, v in d["clips_per_intent"].items()])
    t3 = table(["user_id", "Clips", "Minutes", "Intents covered", "gender field"],
               [[s["user_id"], s["clips"], s["minutes"], s["intents"], s["gender_field"]] for s in d["speakers"]])
    return t1, t2, t3


def t_headline(res):
    rows = []
    for enc, best in res["selection"]["best_per_encoder"].items():
        _, layer, _ = best.split("|")
        for clf in ("proto", "nn"):
            cell = res["grid"][f"{enc}|{layer}|{clf}"]
            for k in KS:
                a, b = cell[k]["A"], cell[k]["B"]
                rows.append([f"whisper-{enc}", layer, clf, k, ms(a["test_macro"]), ms(a["test_micro"]),
                             f"{pct(a['test_macro']['p2.5'])}-{pct(a['test_macro']['p97.5'])}",
                             ms(b["test_macro"]), ms(b["test_micro"]),
                             f"{b['n_test_intents_mean']:.1f}", f"{b['n_test_mean']:.0f}"])
    return table(["Encoder", "Layer", "Classifier", "k", "A macro acc %", "A micro acc %", "A macro 2.5-97.5 pct",
                  "B macro acc %", "B micro acc %", "B intents left", "B queries/episode"], rows)


def t_grid(res):
    rows = []
    for key, cell in res["grid"].items():
        enc, layer, clf = key.split("|")
        rows.append([f"whisper-{enc}", layer, clf, pct(res["selection"]["scores"][key], 2),
                     *[pct(cell[k]["A"]["test_macro"]["mean"]) for k in KS],
                     *[pct(cell[k]["B"]["test_macro"]["mean"]) for k in KS]])
    return table(["Encoder", "Layer", "Clf", "Selection score (cal speakers) %",
                  *[f"A k={k}" for k in KS], *[f"B k={k}" for k in KS]], rows)


def t_abstain(cells: dict, score: str, cond: str):
    """cells: label -> evaluate() output."""
    rows = []
    for label, cell in cells.items():
        for k in KS:
            a = cell[k][cond]["abstention"][score]
            r = [label, k, pct(1 - cell[k][cond]["test_micro"]["mean"])]
            r += [pct(a["oracle_coverage_at_error"][t]["mean"]) for t in TARGETS]
            for t in TARGETS:
                c = a["calibrated"][t]
                r.append(f"{pct(c['coverage']['mean'])} / {pct(c['error_among_accepted_pooled'], 2)} / {pct(c['share_episodes_error_above_target'], 0)}")
            rows.append(r)
    return table(["Config", "k", "Error at 100% coverage %", "Oracle cov @0%", "Oracle cov @1%", "Oracle cov @5%",
                  "Calibrated @0%: cov / err / episodes over", "Calibrated @1%: cov / err / episodes over",
                  "Calibrated @5%: cov / err / episodes over"], rows)


def t_rc(cell, score="maxsim", cond="A"):
    covs = list(cell["1"][cond]["abstention"][score]["risk_at_coverage"].keys())
    rows = [[k, *[pct(cell[k][cond]["abstention"][score]["risk_at_coverage"][c]) for c in covs],
             pct(cell[k][cond]["abstention"][score]["aurc"]["mean"], 2)] for k in KS]
    return table(["k", *[f"cov {float(c):.0%}" for c in covs], "AURC %"], rows)


def t_robust(res):
    base = res["grid"][res["robustness"]["config"]]
    rows = []
    for k in KS:
        c0 = base[k]["A"]
        cal0 = c0["abstention"]["maxsim"]["calibrated"]["0.05"]
        rows.append(["clean", k, ms(c0["test_macro"]), "", ms(c0["test_micro"]), "",
                     pct(c0["abstention"]["maxsim"]["oracle_coverage_at_error"]["0.05"]["mean"]),
                     f"{pct(cal0['coverage']['mean'])} / {pct(cal0['error_among_accepted_pooled'], 2)}"])
    for name, cell in res["robustness"]["conditions"].items():
        for k in KS:
            c, c0 = cell[k]["A"], base[k]["A"]
            cal = c["abstention"]["maxsim"]["calibrated"]["0.05"]
            rows.append([name.replace("|", " "), k, ms(c["test_macro"]),
                         f"{100 * (c['test_macro']['mean'] - c0['test_macro']['mean']):+.1f}",
                         ms(c["test_micro"]),
                         f"{100 * (c['test_micro']['mean'] - c0['test_micro']['mean']):+.1f}",
                         pct(c["abstention"]["maxsim"]["oracle_coverage_at_error"]["0.05"]["mean"]),
                         f"{pct(cal['coverage']['mean'])} / {pct(cal['error_among_accepted_pooled'], 2)}"])
    return table(["Condition", "k", "A macro acc %", "Δ macro (pts)", "A micro acc %", "Δ micro (pts)",
                  "Oracle cov @5%", "Calibrated @5%: cov / err"], rows)


def t_onnx(res):
    o = res["onnx"]
    t1 = table(["Model", "Layer output", "fp32 size (MB)", "int8 size (MB)", "Quantised ops in int8 graph"],
               [[tag, f["layer"], f"{f['fp32_bytes'] / 1e6:.2f}", f"{f['int8_bytes'] / 1e6:.2f}",
                 ", ".join(f"{k}×{v}" for k, v in f["int8_quantised_ops"].items()) or "none"]
                for tag, f in o["files"].items()])
    rows = []
    for name, m in o["latency"]["models"].items():
        e2e = m.get("end_to_end")
        rows.append([name, f"{m['encoder_only']['median_ms']:.0f}", f"{m['encoder_only']['p90_ms']:.0f}",
                     f"{e2e['median_ms']:.0f}" if e2e else "n/a", f"{e2e['p90_ms']:.0f}" if e2e else "n/a"])
    t2 = table(["Model / precision / threads", "Encoder median ms", "Encoder p90 ms",
                "End-to-end median ms", "End-to-end p90 ms"], rows)
    base = res["grid"][o["config"]]
    rows = []
    for k in KS:
        a0, a8 = base[k]["A"], o["int8_eval"][k]["A"]
        b0, b8 = base[k]["B"], o["int8_eval"][k]["B"]
        c0 = a0["abstention"]["maxsim"]["calibrated"]["0.05"]
        c8 = a8["abstention"]["maxsim"]["calibrated"]["0.05"]
        rows.append([k, ms(a0["test_macro"]), ms(a8["test_macro"]),
                     f"{100 * (a8['test_macro']['mean'] - a0['test_macro']['mean']):+.1f}",
                     pct(b0["test_macro"]["mean"]), pct(b8["test_macro"]["mean"]),
                     f"{pct(c0['coverage']['mean'])} / {pct(c0['error_among_accepted_pooled'], 2)}",
                     f"{pct(c8['coverage']['mean'])} / {pct(c8['error_among_accepted_pooled'], 2)}"])
    t3 = table(["k", "A macro % PyTorch fp32", "A macro % ONNX int8", "Δ (pts)", "B macro % fp32", "B macro % int8",
                "Calibrated @5% fp32: cov / err", "Calibrated @5% int8: cov / err"], rows)
    return t1, t2, t3


def write_report(res: dict) -> None:
    prose_dir = REPORTS_DIR / "_prose"
    tpl = (prose_dir / "report.template.md").read_text()
    ds1, ds2, ds3 = t_dataset(res)
    best = res["selection"]["best"]
    per_enc = {f"whisper-{e} {b.split('|')[1]} {b.split('|')[2]}": res["grid"][b]
               for e, b in res["selection"]["best_per_encoder"].items()}
    o1, o2, o3 = t_onnx(res)
    env = res["environment"]
    subs = {
        "DATASET_TABLE": ds1, "INTENT_TABLE": ds2, "SPEAKER_TABLE": ds3,
        "HEADLINE_TABLE": t_headline(res), "GRID_TABLE": t_grid(res),
        "BEST": best.replace("|", " / "), "REDRAWS": str(res["episodes"]["redraws"]),
        "ABSTAIN_MAXSIM_A": t_abstain(per_enc, "maxsim", "A"),
        "ABSTAIN_MAXSIM_B": t_abstain(per_enc, "maxsim", "B"),
        "ABSTAIN_MARGIN_A": t_abstain(per_enc, "margin", "A"),
        "RC_MAXSIM_A": t_rc(res["grid"][best], "maxsim", "A"),
        "RC_MARGIN_A": t_rc(res["grid"][best], "margin", "A"),
        "ROBUST_TABLE": t_robust(res),
        "ONNX_SIZE_TABLE": o1, "ONNX_LATENCY_TABLE": o2, "ONNX_INT8_TABLE": o3,
        "ONNX_NOTES": "; ".join(res["onnx"]["notes"]) or "ONNX files were already present (cached)",
        "PARITY": f"min cosine {res['onnx']['parity_fp32_vs_pytorch']['cos_min']:.6f}, mean {res['onnx']['parity_fp32_vs_pytorch']['cos_mean']:.6f} over {res['onnx']['parity_fp32_vs_pytorch']['n']} clips",
        "INT8_COS": f"mean {res['onnx']['int8_vs_pytorch_cosine']['mean']:.4f}, 5th percentile {res['onnx']['int8_vs_pytorch_cosine']['p05']:.4f}, min {res['onnx']['int8_vs_pytorch_cosine']['min']:.4f} over {res['onnx']['int8_vs_pytorch_cosine']['n']} clips",
        "LOGMEL_MS": f"{res['onnx']['latency']['logmel_only']['median_ms']:.0f}",
        "ENV": f"Python {env['python']}, torch {env['torch']}, transformers {env['transformers']}, onnxruntime {env['onnxruntime']}",
        "STAGE_SECONDS": ", ".join(f"{k} {v:.0f} s" for k, v in res.get("stage_seconds", {}).items()),
    }
    for k, v in subs.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    (REPORTS_DIR / "wolbanking77-fewshot.md").write_text(tpl)
    print("report:", REPORTS_DIR / "wolbanking77-fewshot.md")
