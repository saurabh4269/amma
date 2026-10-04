"""ONNX export (encoder only), int8 dynamic quantisation, latency, parity, int8 embeddings."""
from __future__ import annotations

import copy
import time
import warnings

import numpy as np

from .data import CACHE_DIR, ONNX_DIR, SR, Clips
from .embed import l2, load_encoder, n_real_frames


def _truncated(model, layer: str):
    """Encoder that returns the hidden state of `layer` ('L3', ... or 'final') as last_hidden_state."""
    import torch
    m = copy.deepcopy(model)
    if layer != "final":
        m.layers = torch.nn.ModuleList(list(m.layers)[: int(layer[1:])])
        m.layer_norm = torch.nn.Identity()
    return m.eval()


def export(enc: str, layer: str) -> dict:
    import onnx
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic

    ONNX_DIR.mkdir(parents=True, exist_ok=True)
    _, model = load_encoder(enc)

    class Wrap(torch.nn.Module):
        def __init__(self, e):
            super().__init__()
            self.e = e

        def forward(self, input_features):
            return self.e(input_features).last_hidden_state

    info = {"files": {}, "notes": []}
    n_mels = model.config.num_mel_bins
    dummy = torch.zeros(1, n_mels, 3000)
    variants = {"full": "final"} if layer == "final" else {"selected": layer, "full": "final"}
    for tag, lay in variants.items():
        fp32 = ONNX_DIR / f"whisper-{enc}-encoder-{lay}-fp32.onnx"
        int8 = ONNX_DIR / f"whisper-{enc}-encoder-{lay}-int8.onnx"
        if not fp32.exists():
            w = Wrap(_truncated(model, lay)).eval()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                try:
                    torch.onnx.export(w, (dummy,), str(fp32), input_names=["input_features"],
                                      output_names=["hidden"], opset_version=17, dynamo=False)
                    info["notes"].append(f"{tag}: exported with the TorchScript exporter, opset 17")
                except Exception as ex:  # recorded as a deviation in the report
                    prog = torch.onnx.export(w, (dummy,), input_names=["input_features"],
                                             output_names=["hidden"], dynamo=True)
                    prog.save(str(fp32))
                    info["notes"].append(f"{tag}: TorchScript exporter failed ({type(ex).__name__}); "
                                         f"used the dynamo exporter (its default opset)")
            onnx.checker.check_model(str(fp32))
        if not int8.exists():
            quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8,
                             op_types_to_quantize=["MatMul", "Gemm"])
        m8 = onnx.load(str(int8))
        ops = {}
        for n in m8.graph.node:
            ops[n.op_type] = ops.get(n.op_type, 0) + 1
        info["files"][tag] = {
            "layer": lay, "fp32_path": str(fp32.name), "int8_path": str(int8.name),
            "fp32_bytes": fp32.stat().st_size, "int8_bytes": int8.stat().st_size,
            "opset": int(onnx.load(str(fp32), load_external_data=False).opset_import[0].version),
            "int8_quantised_ops": {k: v for k, v in ops.items() if "Integer" in k or "Quant" in k},
        }
    info["params_full_encoder"] = int(sum(p.numel() for p in model.parameters()))
    return info


def _session(path, threads: int):
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])


def _time(fn, runs=30, warm=5) -> dict:
    for _ in range(warm):
        fn()
    ts = []
    for _ in range(runs):
        t = time.perf_counter()
        fn()
        ts.append((time.perf_counter() - t) * 1000)
    return {"median_ms": float(np.median(ts)), "p90_ms": float(np.percentile(ts, 90)),
            "min_ms": float(np.min(ts)), "runs": runs}


def latency(enc: str, files: dict, clips: Clips) -> dict:
    import torch
    fe, model = load_encoder(enc)
    # a real clip closest to 5.0 s, cut/padded with its own content to exactly 5.0 s
    durs = (clips.meta.duration.to_numpy() / 1000.0)
    i = int(np.argmin(np.abs(durs - 5.0)))
    x = clips.wave(i)
    x = np.resize(x, 5 * SR).astype(np.float32)
    nf = n_real_frames(len(x))
    feats = fe([x], sampling_rate=SR, return_tensors="np").input_features.astype(np.float32)
    out = {"clip_index": i, "clip_seconds": 5.0, "note": "input is padded to 30 s as Whisper requires",
           "logmel_only": _time(lambda: fe([x], sampling_rate=SR, return_tensors="np")), "models": {}}
    for tag, f in files.items():
        for prec in ("fp32", "int8"):
            for th in (1, 4):
                s = _session(ONNX_DIR / f[f"{prec}_path"], th)

                def enc_only():
                    return s.run(None, {"input_features": feats})[0]

                def end_to_end():
                    ff = fe([x], sampling_rate=SR, return_tensors="np").input_features.astype(np.float32)
                    h = s.run(None, {"input_features": ff})[0]
                    return l2(h[0, :nf].mean(0))

                out["models"][f"{tag}/{prec}/threads={th}"] = {
                    "encoder_only": _time(enc_only), "end_to_end": _time(end_to_end)}
    n_threads = torch.get_num_threads()
    for th in (1, 4):
        torch.set_num_threads(th)
        ft = torch.from_numpy(feats)
        out["models"][f"pytorch-full/fp32/threads={th}"] = {
            "encoder_only": _time(lambda: model(ft).last_hidden_state, runs=15, warm=3)}
    torch.set_num_threads(n_threads)
    return out


def onnx_embed(clips: Clips, enc: str, onnx_file: str, tag: str, indices=None, threads: int = 12) -> np.ndarray:
    """Pooled, L2-normalised vectors from an ONNX encoder (clean audio). Cached when over all clips."""
    path = CACHE_DIR / f"emb_{enc}_{tag}.npz"
    if indices is None and path.exists():
        z = np.load(path)["emb"]
        if z.shape[0] == clips.n:
            return z
    from transformers import WhisperFeatureExtractor
    from .embed import ENCODERS
    fe = WhisperFeatureExtractor.from_pretrained(ENCODERS[enc])
    s = _session(ONNX_DIR / onnx_file, threads)
    idx = list(range(clips.n)) if indices is None else list(indices)
    out, t0 = [], time.time()
    for j, i in enumerate(idx):
        x = clips.wave(i)
        f = fe([x], sampling_rate=SR, return_tensors="np").input_features.astype(np.float32)
        h = s.run(None, {"input_features": f})[0]
        out.append(h[0, : n_real_frames(len(x))].mean(0))
        if j % 400 == 0:
            print(f"  [onnx {tag}] {j}/{len(idx)}  {time.time() - t0:.0f}s", flush=True)
    out = l2(np.stack(out)).astype(np.float32)
    if indices is None:
        np.savez(path, emb=out)
    return out
