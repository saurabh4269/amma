# Protocol: few-shot spoken-intent matching on WolBanking77 (audio)

Written 2026-10-04, BEFORE any encoder was run on the data. At the time of writing only
dataset metadata had been inspected (clip counts, intents, speaker ids, durations, text overlap).
No embedding, accuracy or similarity number had been seen. Any later change is listed under
"Deviations" at the bottom, with the reason.

## 1. Data

- Source: Hugging Face `karim155/WolBanking77`, revision `b530b0a641ad4c6fe2881eb3b13a22e77bb39ceb`,
  files `WolBanking77/audio/{train,test}.parquet`. Licence on the dataset card: CC BY 4.0.
- 3,204 WAV clips (16 kHz, mono, PCM16), 10 intents, 16 `user_id` values, 177 distinct sentences
  (read/elicited speech: each sentence is read by many speakers).
- The official train/test split is NOT used: all 16 speakers and 176 of 177 sentences occur on both
  sides, so it measures neither speaker nor sentence generalisation. The two files are pooled.
- `user_id` is taken as the speaker identity (not verifiable by us).

## 2. Encoders and pooling

- `openai/whisper-tiny` and `openai/whisper-base`, encoder only, frozen, fp32, via `transformers`.
- Input: 16 kHz waveform -> Whisper log-mel, padded to 30 s (as the model requires).
- Pooling: mean over only the encoder frames that cover real audio:
  `n_frames = ceil(n_samples / 320)` (20 ms per frame), frames beyond that are discarded.
- Layers (the full small grid, fixed in advance):
  - `L1..Ln`: output of encoder block i (hidden state before the final LayerNorm); n=4 tiny, n=6 base.
  - `final`: `last_hidden_state` (block n followed by the final LayerNorm).
- Every pooled vector is L2-normalised. No centring, whitening or learned projection.

## 3. Episodes (few-shot, speaker-held-out)

For each episode seed s in 0..49 (50 episodes, the same episodes for every configuration):

1. Shuffle the 16 speakers; 6 -> support pool, 4 -> calibration, 6 -> test. No speaker is in more
   than one group. Re-draw (and count the re-draws) if the support pool has fewer than 10 clips of
   any intent, or if calibration or test lacks any intent.
2. For each k in {1, 3, 5, 10}: draw k support clips per intent uniformly without replacement from
   the support pool (10 intents x k clips).
3. Queries: all clips of the calibration speakers (calibration set) and all clips of the test
   speakers (test set).

Two query conditions, both computed on the same episodes:

- **A, speaker-held-out**: all query clips. A query sentence may also appear (spoken by someone
  else) among the support clips.
- **B, speaker- and sentence-held-out**: only query clips whose sentence text is not among that
  episode's support texts. Intents with few sentences (TECHNICAL_VISIT and TRANSFER_MONEY have 2 each,
  OPEN_ACCOUNT 5, BUS_RESERVATION 7) may have no queries left in B at larger k; macro accuracy in B is
  then over the intents that remain, and the mean number of remaining intents is reported.

## 4. Classifiers

- **Prototype-mean**: per intent, mean of its k support vectors, re-normalised; class score = cosine.
- **Nearest-neighbour (NN)**: class score = max cosine over that intent's k support vectors.
- Prediction = arg-max class score. (At k=1 the two are identical.)

## 5. Metrics

Reported as mean, standard deviation and 2.5/97.5 percentiles over the 50 episodes, on TEST speakers.

- Accuracy without abstention: micro (over clips) and macro (mean per-intent recall). Chance for
  macro is 10%; the majority intent (BALANCE) is 22.5% of clips.
- Abstention. Confidence score, primary: the top class score (cosine similarity threshold).
  Secondary: margin = top score minus second-best class score. Both are reported; the primary is the
  one the brief asked for.
  - **Risk-coverage curve (oracle)**: sort test queries by confidence, for coverage c in
    {0.1,...,1.0} report the error among the top-c share. Also AURC (mean selective error over all
    prefixes).
  - **Oracle coverage at error <= 0%, 1%, 5%**: the largest share of test queries that a threshold
    could accept while keeping error among accepted <= target, with the threshold picked on the test
    queries themselves. This is an upper bound, not deployable.
  - **Calibrated coverage at error <= 0%, 1%, 5%** (the deployable number): the threshold is picked
    on the calibration speakers (lowest threshold whose accepted calibration queries have error <=
    target; if none, abstain on everything) and applied unchanged to the test speakers. Report
    realised test coverage, realised test error among accepted (pooled over episodes and per-episode
    mean), and the share of episodes whose realised error exceeded the target.
  Abstention metrics are computed on micro (per-clip) terms, for conditions A and B.

## 6. Model selection (no tuning on test speakers)

The grid is {tiny, base} x {layers above} x {prototype-mean, NN}. The "best configuration" is the one
with the highest macro accuracy on the CALIBRATION speakers, condition A, averaged over the four k
values and the 50 episodes. Ties go to the smaller encoder, then the earlier layer. The per-encoder
best layer is chosen by the same rule. Test numbers for ALL grid cells are reported regardless.
Caveat stated in advance: speakers rotate between roles across episodes, so a speaker used for
calibration in one episode is a test speaker in another. Within an episode the groups are disjoint.

## 7. Robustness (best configuration only)

Same episodes, same metrics, with degraded audio:

- **tel8k**: resample 16 kHz -> 8 kHz -> 16 kHz (soxr HQ). This removes content above 4 kHz; it is
  not a full telephone channel simulation (no 300 Hz high-pass, no codec).
- **noise10**: additive white Gaussian noise at 10 dB SNR, relative to the mean power of the whole
  clip; noise seeded per clip.

Each in two variants: **mismatched** (clean support, degraded calibration+test queries) and
**matched** (support, calibration and test all degraded).

## 8. Size and speed (best encoder)

- Export the encoder (truncated after the selected layer if an intermediate layer is selected, and
  also the full encoder) to ONNX, opset 17, fixed input `(1, 80, 3000)` log-mel.
- int8: onnxruntime dynamic quantisation of MatMul/Gemm weights (QInt8/QUInt8 per ORT default);
  convolutions stay fp32.
- Report file sizes, and CPU latency for one 5.0 s clip (16 kHz), measured end to end
  (log-mel + encoder + pooling) and encoder-only, median and p90 of 30 runs after 5 warm-ups, with
  1 and 4 intra-op threads, onnxruntime CPUExecutionProvider. PyTorch fp32 is timed for reference.
- Parity: cosine between ONNX-fp32 and PyTorch pooled vectors on 200 random clips.
- int8 accuracy: re-embed all 3,204 clean clips with the int8 model and re-run section 3-5 with the
  best configuration (int8 embeddings for support, calibration and test).

## 9. What this protocol cannot show

Banking/transport intents, read speech, 16 speakers, no health content, no pregnant speakers, no
out-of-scope utterances (every query truly belongs to one of the 10 intents, so "abstain" here only
means "avoid a wrong in-scope answer"; rejecting unknown meanings is not measured).

## Deviations

Everything above this line is unchanged from the version written before the first run. Recorded
afterwards:

1. **Layer grid (section 2).** `transformers` does not expose the last encoder block's output before the
   final LayerNorm; its last hidden state already is `final`. `Ln` and `final` were therefore the same
   tensor. The grid actually evaluated is `L1..L(n-1)` plus `final` (4 layers for tiny, 6 for base; 20
   cells, not 24). The first grid run listed the duplicate under both names with identical numbers; the
   duplicate label was dropped and the grid stage re-run from cached vectors. No number changed.
2. **Post-hoc diagnostics.** After the main results were seen, three exploratory checks were added
   (`fewshot diagnostics`): nearest-other-clip composition, 1-NN with the whole support pool as support,
   and support-pool mean-centring. They are reported in a separate, labelled section and were not used
   for model selection or thresholds.
3. **Latency (section 8)** was measured on a machine that was also running a desktop session (1-minute
   load average recorded in the results JSON), not on an idle machine.
4. Section 8: the selected layer was `final`, so only the full encoder was exported.
