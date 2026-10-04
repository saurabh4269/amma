# Build plan

Companion to `PLAN.md` (what and why). This file is how. Written 4 October 2026.

Checked on this machine today: Node 24, pnpm 11, Python 3.13, uv, Docker present; no GPU; `ffmpeg` missing; 53 GB free; the folder is not a git repository. Sizes and licenses below marked **[measured]** were read from Hugging Face today; **[unchecked]** are assumptions.

## 1. What gets built

Seven deliverables, in one repository.

| # | Deliverable | What it is |
|---|---|---|
| 1 | Engine | The session logic as a pure library. Same code on the phone and the server. |
| 2 | Packs | Content packs (cards, flows, rules, sources) and language packs (audio, examples, thresholds), as checked data. |
| 3 | Speech matcher | A small on-device model plus a matching method, with a larger server tier. |
| 4 | Offline web app | The installable app: plan, say it back, check, ask, carry over, clinic card. |
| 5 | Channel server | WhatsApp, voice calls and SMS through Twilio, driving the same engine. |
| 6 | Studio | Web tool to review cards and record a language pack, and the command that builds a pack. |
| 7 | Evaluation harness and reports | Benchmarks, release gates, data sheet, model card. |

## 2. Stack

| Part | Choice | Reason |
|---|---|---|
| Repository | pnpm workspaces, TypeScript strict | One language for engine, app and server, so the engine is shared, not ported |
| Schemas | Zod as the source, exported to JSON Schema | Python and the Studio validate against the same definition |
| Web app | Vite, Preact, `vite-plugin-pwa` | Small bundle for low-end phones; Preact is about 3 KB |
| On-device storage | IndexedDB for the record; Cache Storage for packs and model | Works offline; record encrypted with a key from her PIN (WebCrypto) |
| On-device speech | ONNX Runtime Web (WASM) in a background worker | Runs without a GPU; same model file as the server |
| Server | Node, Fastify, `onnxruntime-node`, Postgres, in one Docker image | Same engine and model file; ordinary to host |
| Telephony | Twilio behind a `ChannelProvider` interface | Swappable; sandbox for development |
| Voice generation | ElevenLabs behind a `VoiceProvider` interface, used only at pack-build time | Clips are reviewed and shipped as files |
| Research | Python via uv, PyTorch, Hugging Face `datasets`, ONNX export | Standard; runs on CPU for frozen encoders, on the Prajna cluster for sweeps |
| Tests | Vitest, Playwright (offline and throttled-phone profiles), pytest | Covers logic, the real app offline, and the models |
| CI | GitHub Actions | Runs tests and the release gates on every change |
| Licenses | Apache-2.0 code, CC BY 4.0 content | Meets the digital public goods standard |

## 3. Repository layout

```
packages/
  schema/        pack and record definitions
  engine/        session state machine, rules, repeat scheduler
  matcher/       feature extraction, encoder call, matching, abstain logic (browser + node)
  pack-tools/    CLI: validate, build, calibrate, sign a pack
  providers/     Twilio, ElevenLabs adapters behind interfaces
apps/
  web/           the offline web app
  server/        webhook gateway and channel adapters
  studio/        review and recording tool
packs/
  content/       in-mch (India), sn-mch (Senegal), who-base
  lang/          hi, mr, wo, ff
research/
  harness/       datasets, encoders, metrics, experiment configs
  reports/       generated results, data sheet, model card
docs/            PLAN.md, BUILD.md, OUTREACH.md, protocol, threat model
```

## 4. Engine

A deterministic state machine. One function:

```
step(state, event) -> { state, effects[] }
```

- **Events** come from a channel: session started, utterance matched (meaning, score), utterance not matched, button pressed, timeout.
- **Effects** go to a channel: play card N, listen for one of these meanings, show yes/no, compose SMS from template N, offer call to plan contact, end.
- A channel adapter only renders effects and reports events. The engine never knows whether it is a browser, a WhatsApp chat or a call.
- Because it is pure, every path is testable without audio or network.

**Flows** are data: a small set of node types (say, recall, yes/no, open question, confirm, branch on rule, hand off, end). No general scripting language.

**Outcome rules** are a decision table in the content pack. The pack validator proves two properties for every table: every combination of answers has an outcome, and any "yes" on a danger sign leads to an urgent outcome. A pack that fails cannot be built.

**Repeat scheduling:** each sign sits in a box (Leitner scheme); recalled moves up, missed moves to the first box; box intervals are pack parameters.

## 5. Packs

**Content pack** (per country protocol), in outline:

```
card:     id, kind (sign | outcome | answer | prompt), text per language,
          source {document, page, quoted sentence}, status (from-source | clinician-approved),
          reviewer, date
meaning:  id, the card it leads to, whether it is a danger sign
flow:     nodes and transitions
rules:    decision table
schedule: which signs apply at which stage (pregnancy, labour, after birth, newborn)
```

**Language pack**, in outline:

```
audio:      one clip per card (Opus), with who recorded or which voice generated it, and who approved it
examples:   recordings per meaning, with speaker id, sex, consent reference
prototypes: vectors computed from the examples by the build command
thresholds: accept / confirm / abstain levels computed by the build command
lexicon:    word list with spelling variants (for typed input and route A)
manifest:   versions, model version it was built against, hashes, signature
```

**The build command** (`pack build`) does the work that would otherwise be hand-tuned:

1. Validates against the schema; refuses cards without a source.
2. Encodes audio; checks every card has a clip.
3. Runs the encoder over the examples and stores prototypes.
4. Calibrates thresholds by holding out each speaker in turn, against a set of out-of-scope speech, and writes them with the measured error rates.
5. Refuses to build if any danger-sign example is accepted as a non-danger meaning at those thresholds.
6. Hashes and signs the manifest.

Adding a language is: record in the Studio, run the build command, read its report.

## 6. Speech matcher

**Pipeline on the phone:** microphone, end-of-speech detection, 16 kHz mono, log-mel features, encoder, pooled vector, compare with the pack's prototypes, then accept, confirm ("Did you say…?") or abstain.

**Encoder candidates and what the license check found:**

| Encoder | Size | License | Can ship? |
|---|---|---|---|
| Whisper-tiny encoder | about 10 MB quantized **[unchecked]** (decoder alone is 30.5 MB **[measured]**) | MIT | Yes |
| Whisper-base encoder | about 20 MB quantized **[unchecked]** (decoder 53.3 MB **[measured]**) | MIT | Yes |
| mHuBERT-147 | 377.5 MB full precision **[measured]** | CC BY-NC-SA 4.0 **[measured]** | No: non-commercial. Comparison only |
| AfriHuBERT | 377.6 MB **[measured]** | "cc", unclear **[measured]** | Not until clarified |

So the shippable on-device candidates are the Whisper encoders, optionally with a small projection layer we train on open multilingual speech and release ourselves. The two HuBERT models tell us how much accuracy we give up.

**The hard part: the recall step.** She may name several signs in one breath. Three designs, to be measured:

1. One sign per turn: "Tell me one sign." then "Another?" Simplest and most robust; slower for her.
2. Sliding windows over a long utterance, each window matched.
3. Query-by-example search: align each example against the utterance frame by frame (dynamic time warping). Language-independent and well studied for low-resource languages.

**Server tier:** larger models are allowed. For typed text, a multilingual text encoder (multilingual-e5-small is 118 MB quantized **[measured]**, so server only). For calls, audio arrives at telephone quality (8 kHz), which must be evaluated separately. Twilio's built-in speech recognition does not cover Wolof **[unchecked]**, so calls stream audio to our own matcher and use the keypad for yes/no.

## 7. Evaluation and gates

**Datasets, confirmed public and ungated today [measured]:** `karim155/WolBanking77`, `WueNLP/sib-fleurs`, `masakhane/InjongoIntent`. Plus our own Hindi and Marathi recordings.

**Experiment grid:** encoder × pooling × examples per meaning (1, 3, 5, 10) × language × audio condition (clean, noisy, 8 kHz).

**Metrics:** accuracy on accepted items; share abstained; wrong-meaning accepts; danger-sign phrases accepted as non-danger; latency and peak memory on a throttled phone profile.

**Decision point at the end of the speech milestone.** Written in advance so the result cannot be bent:

- If, on held-out speakers, the matcher reaches zero danger-to-non-danger accepts with at least 70% of in-scope utterances accepted, route B ships as designed.
- If it only reaches that with one-sign-per-turn, we ship that interaction.
- If it does not reach it, the recall step ships as picture recognition with voice as an option, and the submission says so. The check and plan steps do not depend on the model.

The 70% figure is my proposed bar, not an established standard.

**Release gates in CI:** all tests pass; every pack builds; no danger-sign test phrase maps to a non-danger card; app shell and pack sizes within budget.

## 8. Offline web app

**Screens:** setup (language, stage of pregnancy, PIN, consent spoken aloud), plan, weekly session (say it back, check, ask), outcome, carry-over, clinic card, settings.

**Design rules:** every element has audio; no step depends on reading; two large targets per screen at most; pictures for each sign; works one-handed.

**Offline:** app shell precached; packs and model fetched once, verified against manifest hashes, stored in Cache Storage; persistent storage requested; integrity checked at each start with a clear repair path.

**Budgets:** app shell under 200 KB compressed; model plus one language pack under 40 MB; response to an utterance under 2 seconds on a 2 GB Android phone. These are targets to be measured, and the model choice bends to them.

**Hand-offs:** `sms:` link with the message filled in; `tel:` link to plan contacts.

**Later:** the same build wrapped as an installable file for side-loading.

## 9. Channel server

- One webhook gateway. Twilio signatures verified; handlers idempotent; rate limits per number.
- **WhatsApp:** voice note in, decoded, matched; reply is the card's audio clip plus buttons. Typed text goes to the text matcher.
- **Calls:** card audio played; keypad for yes/no; speech streamed to the matcher.
- **SMS:** numbered replies for the check; short text to the text matcher; plain-text cards.
- First contact on any channel is a consent message; "stop" is honoured everywhere.
- Database holds phone number, dates, answers, card numbers. No audio kept. Retention period is a configuration value.
- Logs carry no message content.

## 10. Studio

- Card review: source sentence beside the card, approve or return with a note; approval changes the card's status.
- Recording: shows each card and each example prompt, records in the browser, checks level and length, collects spoken consent.
- Export: a language pack folder ready for the build command.

## 11. Milestones and what "done" means

| # | Milestone | Done when |
|---|---|---|
| M0 | Foundations | Repository with CI; schemas; engine passing tests for a full session in memory; source documents obtained; India and WHO card lists drafted with sources; outreach sent |
| M1 | Speech research | Harness reproduces from one command; grid run on the three public sets; Hindi and Marathi recordings collected; report written; decision point resolved |
| M2 | Pack tools | A Hindi pack builds from raw recordings with computed thresholds and a build report |
| M3 | Offline web app | Full session in Hindi and Marathi in airplane mode on a low-end Android phone, within budgets; Playwright offline suite green |
| M4 | Channel server | The same session over WhatsApp, a call and SMS in the Twilio sandbox, end-to-end tests green |
| M5 | Studio and more languages | Fula pack built with no code change; Wolof pack built once a reviewer exists |
| M6 | After birth and newborn | Content pack extended; no engine change needed |
| M7 | Submission and study | Demo, data sheet, model card, statement of limits; study protocol ready for ethics review |

M0 and M1 run in parallel. M3 can start on a stub matcher as soon as M0 is done.

## 12. Risks

| Risk | What we do |
|---|---|
| The matcher is not accurate enough | Decision point in section 7; the product still works without it |
| Speech in a phone browser is too slow | Measure in M1 on a real low-end phone before building the app around it |
| No Wolof reviewer | Wolof pack stays marked unreviewed; Fula and Hindi carry the language argument |
| No clinician | Cards stay "from published source"; no field use |
| Too few speakers for Hindi and Marathi | Build report shows speaker count; thresholds get more conservative with fewer speakers |
| Scope: seven deliverables | Milestones are ordered so each one leaves something that works alone |

## 13. What I need from you

1. Go-ahead on the stack in section 2.
2. A GitHub repository (name, public or private).
3. `ffmpeg` installed (`sudo apt install ffmpeg`).
4. Accounts when we reach them: Hugging Face token, Twilio, a Meta developer app, ElevenLabs.
5. A low-end Android phone for testing (2 GB RAM if possible).
6. Speakers for Hindi and Marathi: ideally ten or more, both sexes, about 20 minutes each.
7. Whether I may use the Prajna cluster for the larger runs.

## 14. Additions for plan v3

New parts, mapped to sections 17 to 23 of `PLAN.md`.

| Part | Where it lives | What it is |
|---|---|---|
| Clarifier | `packages/engine` plus content pack tables | Complaint list, question bank and decision table as data. Next question chosen by how well it separates the remaining rows of the table. Property tests walk every path |
| Top-k matching | `packages/matcher` | Returns several candidate meanings with scores, not one |
| Place packs | `packages/place-tools`, `packs/place/` | Build command: facility lists (healthsites, Maina, an Indian registry) joined with the travel-time grid, cut to one district, written as a small file with sources and dates per row |
| Offline map (optional) | `apps/web` | Single-file map tiles for the district |
| Profiles and worker mode | `apps/web`, `packages/schema` | Several women on one phone, each record encrypted under its own PIN |
| Send to basic phone | `apps/web`, `packages/pack-tools` | Pack build also writes plain audio files in a format old phones play; the app hands them to the share menu |
| Tracks | Content packs | First pregnancy, myths, conditions, entitlements, after birth. A track is a tagged set of cards plus schedule rules; no engine change |
| Media layer | Language packs | Optional video per card, with publisher, license and who attached it |
| Missed-call callback | `apps/server` | A missed call to the service number triggers a call back |
| Clinic card as FHIR | `packages/engine` | The summary also exported in the open health record format |

Milestone changes:

| # | Change |
|---|---|
| M0 | Also: download and inspect the facility and travel-time sources; pick the first two districts; find an open Indian facility list |
| M2 | Also: place-pack build command, with one Maharashtra district and one in Senegal or The Gambia |
| M3 | Also: clarifier, facility suggestions in the plan, send-to-basic-phone |
| M5 | Also: worker mode |
| M6 | Becomes "content tracks": after birth and newborn, first pregnancy and myths, conditions, entitlements |
| M8 (new) | Video layer |

Two things to settle before M2: which districts, and whether an open geocoded Indian facility list exists. If it does not, the Indian place pack starts from OpenStreetMap and says so.
