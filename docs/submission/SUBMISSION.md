# AMMA: submission summary

**What it is.** An offline voice companion for pregnancy and the six weeks after birth. Sector: Health (Annex A). User: the pregnant woman and her household.

**The problem, in the required form.** Because of this tool, a pregnant woman will recognise a danger sign and act on a plan agreed with her family the same day, which she would otherwise do late; we know because women in The Gambia recalled two danger signs on average (2021 survey, 100 women), and in Kenya text messages raised knowledge of danger signs but did not change care-seeking (PROMPTS trial).

**What the AI is.** A 10 MB speech encoder on the phone matches what she says to a fixed list of meanings and asks her to confirm. It never decides the outcome. Why not a simpler tool: a menu shows the answers, so it cannot test recall; text needs reading; open speech-to-text for Wolof gets about half the words wrong.

**State of the build, plainly.** Works offline in English, Hindi and Marathi. Drafts only: not reviewed by a clinician or a native speaker. Never tested with real users. Server channels tested only against simulated requests. No Wolof content yet.

Other documents: `VIDEO_SCRIPT.md`, `DATA_SHEET.md`, `MODEL_CARD.md`, `RESPONSIBLE_AI.md`.

## Judging criteria, evidence, and weakest point

| Criterion | Evidence in the repository | Weakest point |
|---|---|---|
| **Built solution within the constraints, 25%** | Offline web app in `apps/web`: plan, recall, check, ask, urgent outcome with call and SMS links, clinic card, after-birth mode, PIN lock. Runs with no network after the first visit (browser test in `apps/web/e2e/session.spec.ts`). Built app installs at about 40 MB: a 10.1 MB speech model, a 14 MB runtime, about 15 MB of card audio in three languages, and 2 MB of facility lists. Languages named: Hindi and Marathi. One engine (`packages/engine`) shared by app and server. `pnpm test`: 56 tests pass in 6 files. 9 browser tests pass in `apps/web/e2e`, including offline use and a real Wolof clip played in as the microphone. | Needs one connection to install. Never run on a real low-end phone. Spoken output is computer-made clips in English, Hindi and Marathi that no speaker has approved; the app says so on screen. The setup and plan steps need typing. Server channels (`apps/server`) have never sent a real message or call. |
| **Development relevance and impact, 20%** | The five-link chain from sign to treatment in `docs/PLAN.md` section 1. The design targets recall and the household decision, not information alone. Covers the first week after birth, when most deaths happen. Fits the brief's shared smartphone and weekday basic phone. | No outcome evidence of our own. No user has tried it. The content is Indian; the brief's countries have no content pack. |
| **Data grounding, 15%** | `DATA_SHEET.md` lists every source with license, size and gaps. New figure computed from the data handover: 81% of Gambians live within 5 km of a facility but 28% within 5 km of a listed hospital (`research/reports/gambia-access.json`). A pre-registered speech benchmark on Wolof (`research/reports/protocol.md`). Each session records signs recalled, which is data that exists today from one survey of 100 women. | Distances are straight lines. Benchmark data is banking speech, not health. No speech from pregnant women. Several problem figures come from search summaries, not the source. Recall counts stay on the phone; sharing them is not built. |
| **Evidence it fits the sector, 15%** | It is the voice form of the booklet the Indian ministry already prints. Every health card stores its source document, page and quoted sentence (`content-sources/extracts.md`). After-birth sessions follow the ASHA home-visit days. The health worker is in the plan by name. Precedents: PROMPTS, MomConnect, Mobile Kunji. | No clinician review. No health worker or ministry has seen it. No testing in Senegal, The Gambia or Solomon Islands. |
| **Clarity, design, inclusivity, why AI, 15%** | One-sentence case: recall cannot be graded without understanding her speech. Session steps have pictures, spoken text and large buttons. Honest result: the matcher missed its bar, so it always confirms and pictures are the dependable route (`MODEL_CARD.md`). | The AI is the weakest part of the build. With pictures and typing as the main route, a judge may ask how much the AI adds today. Hindi and Marathi wording is a machine draft. |
| **Scalability and what next, 10%** | A language is a data pack; no language name is in code. A country protocol is a content pack. Facility lists build from open data with one command (The Gambia 119, Senegal 2,050, Maharashtra 10,599 facilities). No cost per woman offline. Next steps are named: clinician review, speaker review, recordings of sign phrases, a recall study with ethics approval. | Only one content pack and three language packs exist. The recording tool (Studio) is not built. We are individual developers; public SMS and WhatsApp service needs an institution to hold the registrations. Some source licenses are unstated or restrictive. |
| **Responsible AI, data, safety, pass/fail** | Fail-safe: "not sure, ask a person". The outcome comes only from her answers and a fixed table; the pack validator refuses any pack where a "yes" is not urgent (`pnpm packs:validate`). Fixed list of 254 cards; the model cannot write text. Data stays on the phone, optional PIN with encryption, no audio kept. Server: consent first, STOP deletes. See `RESPONSIBLE_AI.md`. | Content is not clinician approved, and the app says so on screen. Without a PIN the record is readable by anyone who opens the phone. Voice examples are not deleted with a record. |

## How to check it yourself

```
pnpm install
pnpm test                 # 56 tests
pnpm packs:validate       # proves the rules and sources of the content pack
./fetch-models.sh         # speech encoder, 10 MB, optional
cd apps/web && pnpm packs && pnpm places && pnpm dev
```

`pnpm places` needs the data handover at `data/health-transfer/`, which is not in the repository.

## What we do not claim

- That the tool reduces deaths or changes care-seeking. We claim only what it records: signs recalled, plans made, sessions done.
- That the voice matcher is accurate.
- That it is ready for real patients.
