#!/usr/bin/env sh
# Fetch the speech encoder (Whisper tiny, MIT licence, ONNX export by onnx-community) and place the
# quantised copy where the web app serves it. The model is not committed.
set -eu
cd "$(dirname "$0")"
M=data/models/whisper-tiny
mkdir -p "$M" apps/web/public/models/whisper-tiny
for f in encoder_model_quantized.onnx encoder_model.onnx; do
  [ -s "$M/$f" ] || curl -fsSL -o "$M/$f" "https://huggingface.co/onnx-community/whisper-tiny/resolve/main/onnx/$f"
done
cp "$M/encoder_model_quantized.onnx" apps/web/public/models/whisper-tiny/
ls -la apps/web/public/models/whisper-tiny
