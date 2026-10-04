# AMMA: model card for the on-device speech matcher

## Summary

The matcher did not meet the bar we wrote down before testing. It is shipped as an optional input that always asks her to confirm. Pictures and typing are the dependable route. The outcome of a session never depends on it.

## What it is

- **Encoder:** the encoder half of OpenAI Whisper-tiny. Frozen. Not trained or fine-tuned by us. The decoder is never loaded, so no transcript is produced.
- **Pooling:** the last encoder layer, averaged over the frames that cover real audio (one frame per 20 ms). The vector is scaled to unit length.
- **Matching:** nearest example. For each meaning the step expects, the score is the cosine similarity to that meaning's closest stored example. The top meaning is the guess.
- **Decision:** it never accepts its own guess. It plays the guess back ("Did you say: High fever?") and she taps Yes or No. With no stored example, it does not guess. The pictures open and her tap labels what she said.
- **Learning:** each confirmation or correction stores the vector as an example on her phone. At most 12 examples per meaning are kept; the oldest is dropped. The audio is discarded.
- **Code:** `packages/speech` (features, encoder call, scoring) and `apps/web/src/voice.ts` (recording, storage, confirm rule).

## Sizes

| Part | Size |
|---|---|
| Quantised encoder (`encoder_model_quantized.onnx`, ONNX export by onnx-community, MIT) | 10.1 MB |
| ONNX Runtime Web (WASM) | 14.2 MB |
| Whole built app, including packs and facility lists, before the Hindi and Marathi audio clips | About 26 MB on disk |

Recording is capped at 12 seconds. The model runs on one CPU thread in the browser.

## What was measured, and on what data

**Data:** WolBanking77 audio (CC BY 4.0). 3,204 Wolof clips, 4.3 hours, 177 read sentences, 10 banking and transport intents, 16 speaker ids. It is not health speech. No speaker is known to be pregnant.

**Protocol:** `research/reports/protocol.md`, written before any encoder was run on the data. 50 episodes. In each, 6 speakers give the examples, 4 set the threshold, 6 are tested. No speaker is in two groups. Raw results are in `research/reports/wolbanking77-fewshot.results.json`.

### 1. A new speaker, examples from other speakers (pre-registered)

Whisper-tiny, last layer, nearest example. Macro accuracy on test speakers. Chance is 10%.

| Examples per intent | The sentence may also be among the examples | The sentence is new |
|---|---|---|
| 1 | 30% | 22% |
| 3 | 44% | 32% |
| 5 | 51% | 37% |
| 10 | 63% | 45% |

Whisper-base scored within about one point of tiny in every cell (for example 64% and 47% at 10 examples).

### 2. Can it tell when it is wrong? (pre-registered)

No. With 5 examples per intent and the threshold set on separate speakers for zero errors, the matcher accepted 1.4% of utterances, and 9.4% of those accepted were wrong. The target was exceeded in 46% of episodes.

### 3. Degraded audio (pre-registered, run on Whisper-base only)

Clean examples, degraded queries. Macro accuracy at 10 examples: 64% clean, 61% at telephone bandwidth (8 kHz), 54% with noise at 10 dB. The 8 kHz test only removes content above 4 kHz. It is not a full phone-line simulation.

### 4. The same phrase said by other people (exploratory)

This check was written after the main results had been seen (`research/diagnostics/same_phrase.py`, output `research/reports/same-phrase-diagnostic.json`). It is closer to the product: the phone holds recordings of a phrase, and a new speaker says that phrase. Whisper-tiny, last layer.

| Other speakers who recorded the phrase | Right intent |
|---|---|
| 15 | 91% |
| 5 | 83% |
| 3 | 81% |
| 1 | 58% |

Even with 15 speakers, only 2.9% of utterances could be accepted without asking at 1% error.

### 5. Checks on our own code (`pnpm test`)

- Our feature and pooling code reproduces the research harness vector for the full-precision encoder.
- The quantised encoder's vector has cosine 0.945 with the full-precision one, on one test clip.
- A browser test plays a real Wolof clip into the microphone and checks: first time no guess, second time a question, never an automatic accept.

## The pre-registered bar, and the result

The bar, from `docs/BUILD.md` section 7, written in advance. In short: on held-out speakers, zero danger-sign phrases accepted as a non-danger meaning, while accepting at least 70% of in-scope utterances.

**Result: not met, by a wide margin.** The matcher could accept about 1 to 3% of utterances at low error, not 70%. The 70% figure was our own proposed bar, not an established standard.

The plan said what would follow: recall ships with pictures and typing as the dependable route, with voice as an option. That is what was built.

## Intended use

- An optional way to answer the recall step ("Which signs mean you go now?") and the question step, by voice, on the household smartphone.
- Always followed by her own Yes or No.
- Meant to improve for one woman over weeks as her own confirmed examples build up.

## Out-of-scope use

- Deciding whether she has a danger sign. That comes only from her Yes, No or Not sure taps and a fixed table.
- Accepting any match without confirmation.
- Transcription, diagnosis, or free conversation.
- Phone calls and SMS. The server does not use this model. Typed text is matched against a phrase list, which is not a model. On calls, speech goes to Twilio's own speech-to-text.

## Known limits

- **Not measured:** whether her own stored examples make it better for her. The dataset cannot test that. This is the main claim of the design and it is untested.
- **Not measured:** anything in Hindi or Marathi. Anything on health phrases. Anything on a real low-end phone. Speed and memory on a phone.
- **Not measured:** the effect of quantisation on accuracy. The benchmark numbers above are for the full-precision encoder. The app ships the quantised one.
- **Not measured:** rejecting speech that matches no meaning. Every benchmark utterance belonged to one of the 10 intents. In the app the top guess is always offered once any example exists, even for unrelated speech. She has to say No.
- The benchmark report file (`research/reports/wolbanking77-fewshot.md`) has not been generated. Size and speed results from the benchmark are not in the results file.
- Bias: 16 speaker ids, read speech, one language. The gender field is 1,675 clips male, 1,153 female, 376 unspecified. We did not break results down by sex. Whisper was trained mostly on high-resource languages.
- Shared phone: examples are stored per language, not per woman. Two women on one phone share one set.
- No pack ships examples. A new user starts with none, so the first use of each sign is always a picture tap.
- Never used by a real user.

## What would improve it

A small trained layer on top of the frozen encoder. Frame-by-frame alignment in place of averaging. Recordings of the actual sign phrases from several speakers per language, with consent.

## Final benchmark numbers (added when the run completed)

The full report is `research/reports/wolbanking77-fewshot.md`. Where an earlier section of this card differs, these numbers are the final ones.

- Right intent for a new speaker, by examples per intent (1, 3, 5, 10): 29.5%, 43.6%, 50.9%, 63.3% with Whisper tiny; chance is 10%.
- When the sentence is not among the examples: 21.6% to 46.6% (Whisper base).
- At ten examples, a threshold tuned on the test data accepts 1.6% of clips at 1% error. Calibrated on other speakers for 5% error, it accepts 3.5% and is wrong 10.3% of the time.
- Phone-quality audio costs about 3 points; noise at 10 dB about 10.
- The compressed model is within 0.3 points of the full one.
- The bar set in advance (no danger-to-harmless errors while accepting 70%) was not met. Voice in the app therefore never accepts a match without her confirming it.
- Not measured: out-of-scope speech, health phrases, Hindi, Marathi, a real phone.

