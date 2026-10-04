# Plan v3: AMMA (earlier working name: "Yaay")

A voice companion that gets a pregnant woman and her household to recall the danger signs, agree in advance what they will do, and act on it. It runs offline on the household smartphone and reaches her basic phone by SMS, WhatsApp and calls.

Fourth draft, 4 October 2026. v3 adds sections 16 to 25: helping her describe a symptom, getting to the right facility, community health workers, using the basic phone itself, a first-pregnancy section, known conditions, video, and more open data and tools. Changes in v2 from v1: reasoned from the causal chain; the household plan and the weeks after birth move into the core; Hindi and Marathi as team-checked languages with a route for any Indian or African language; individual developer accounts; clinical content from published official sources; a section written from the judges' side; SDG mapping.

Labels: **[read]** = source opened today; **[summary]** = from a search summary of the source, not the source itself; **[brief]** = from `claude-brief-health-pregnancy.md`; **[unchecked]** = assumption to verify.

## 1. First principles: where a woman is lost

Between a complication and treatment there are five links.

| Link | What the evidence says |
|---|---|
| 1. A sign appears | Haemorrhage and hypertensive disease cause about half of maternal deaths in sub-Saharan Africa (WHO, Lancet Global Health 2025) **[summary]**. About half of deaths after birth happen in the first 24 hours and 66% within the first week (WHO) **[summary]**. |
| 2. She recognises it | Gambian women recalled on average two danger signs; headache and blurred vision were rarely named (2021, n=100) **[read]**. They attend the clinic: about 4 in 5 have 4+ visits (DHS 2019-20) **[summary]**. |
| 3. The household decides | The husband was the final decision maker on antenatal care in a Senegal study **[summary]**. PROMPTS in Kenya raised danger-sign knowledge by 3.6 points and did not change care-seeking for danger signs **[read]**. |
| 4. They can travel | Late arrival from delayed decision and transport persists in The Gambia **[summary]**. |
| 5. The facility treats her | Overcrowded, little time per patient **[brief]**. Mostly outside this tool's reach. |

What follows for the design:

1. **Recall, not exposure.** Sending information moves knowledge a little and behaviour hardly at all. She has to produce the signs from memory, repeatedly.
2. **Knowledge is not the bottleneck by itself; the decision is.** So the household agrees a plan in calm time, she says it aloud, the person who decides hears it, and the app plays it back the moment a sign is present. Plans of the form "if X, then I do Y" roughly double follow-through in general health-behaviour studies **[summary, weak source]**; evidence for birth-preparedness programmes specifically is mixed, and better when family and facility are both involved **[summary]**.
3. **It cannot stop at birth.** The most dangerous week is the one after delivery, and newborn signs matter as much.
4. **It has to fit a shared weekend smartphone and a weekday basic phone** **[brief]**.
5. **Model mistakes must be cheap.** Speech recognition for these languages is weak (section 4), so the model is kept out of the outcome.
6. **The tool measures what it teaches.** Danger-sign recall in The Gambia is known from one survey of 100 women. Every session records which signs were recalled.

## 2. What the product does

**First session: the plan.** By voice and taps she sets: who decides with her, who takes her, which facility, their phone numbers, money set aside. The app says it back as one sentence: "If I have one of these signs, I call [name] and we go to [place]."

**Each week, about five minutes:**

1. **Say it back.** "Which signs mean you go now?" She answers aloud. The model marks which she named; the app replays only the missed ones, with a picture. Missed signs return sooner.
2. **Check.** For each sign, "Do you have this today?" Yes/no buttons. Fixed rules choose the outcome.
3. **Ask.** She says a question. The model matches it to one approved card, plays the question back to confirm, then the answer. Weak match: "Not sure. Ask a person," and it joins her list for the midwife.
4. **Carry over.** A ready-written SMS to her basic phone (and, if she chooses, the person who decides): next visit, signs to watch, who to call.
5. **Clinic card.** One screen for the midwife: weeks, signs reported with dates, her open questions.

**When a sign is "yes":** the app plays her own plan and offers one tap to call or text the people in it.

**Content schedule:** pregnancy signs, then labour, then the six weeks after birth for mother and newborn. Same engine, different cards.

## 3. The safety rule: the model can raise a flag, never clear one

| Step | Who decides | Cost of a model error |
|---|---|---|
| Say it back | Model | A lesson repeated, or asked again next week |
| Ask | Model, then she confirms | A wrong but approved card; the confirm step catches it |
| Symptom mentioned in free speech | Model | Only adds the explicit yes/no question |
| Check outcome | Her answers and fixed rules | None |

- All "no" gives "None of the listed signs today. If you are worried, ask a person." It never says she is fine.
- Everything the app can say is a numbered card with a source. A model may choose a card or abstain. It never writes one.

## 4. What the AI is, and why not something simpler

Closed-set spoken-language understanding on the device: speech in, one of N known meanings or "not sure" out.

- **Why not a menu:** a menu shows the answers. Recall is what she needs on a weekday with no smartphone, and it cannot be graded without understanding speech.
- **Why not text:** rural illiteracy in Senegal is 62.7% (ANSD 2021) **[summary]**.
- **Why not open speech-to-text:** on Wolof maternal-health speech the best open model was Whisper-medium at 46% word error, 23% after fine-tuning and 31% in field recordings (YUX Design, AfricaNLP 2026) **[read]**. Too large for her phone. For Bambara, the best of 37 models reached 47% in studio conditions **[read]**.
- **Why not generated answers:** they cannot be checked, and a confident wrong answer here is worse than none **[brief]**.

## 5. Modelling

- **Route B (lead):** a frozen small speech encoder turns an utterance into a vector; each meaning is a handful of recorded examples; nearest match wins or it abstains. Prior work: five examples gave F1 0.75 in seen languages and 0.65 in unseen ones (Mazumder et al. 2021) **[read, abstract]**.
- **Route A (comparison):** small speech-to-text, then fuzzy matching on the transcript.
- **Server tier:** larger models for WhatsApp and calls, still choosing cards only.
- **Typed input** on WhatsApp and SMS: a multilingual text encoder with the same nearest-match rule. Hindi and Marathi typed in Latin letters must be handled **[unchecked]**.

Evaluation, written down before results:

- Encoders to compare: Whisper-tiny and -base encoders, mHuBERT-147, AfriHuBERT.
- Test sets: WolBanking77 (263 spoken Wolof sentences, 10 intents, CC BY 4.0) **[read, abstract]**; Fleurs-SLU (spoken topic classification, 102 languages) and INJONGO (intents, 16 African languages including Wolof, text) for breadth **[summary; coverage of Hindi and Marathi unchecked]**; our own Hindi and Marathi recordings.
- Reported: accuracy, share abstained, danger-sign phrases matched to a non-danger card (target zero at the chosen threshold), by language, speaker sex and noise.
- On-device: memory and delay on a low-end Android browser. This bounds model size.

## 6. Languages

A language is a pack: card audio, example recordings per meaning, a word list, a named reviewer. No language name appears in code.

| Stage | Languages | What it proves |
|---|---|---|
| Team-checked | Hindi, Marathi | The whole product works and is verified by speakers |
| Brief language | Wolof | Fit to Senegal and The Gambia; needs a partner reviewer |
| Added without code | Fula (Pulaar) | The pack route works; public speech data exists in Google WAXAL **[read]** and it is spoken in both countries |
| Recordings only | Mandinka, Solomon Islands Pijin, any other | The answer to "a less-supported language": speakers and a recording tool are enough |

- Hindi and Marathi wording comes from the official language editions of India's Mother and Child Protection card where they exist **[unchecked]**, not from our translation.
- Card audio: generated once for Hindi with a hosted voice, then approved clip by clip; recorded by people for Wolof and any language without a good synthetic voice. I did not find Wolof or Marathi in the ElevenLabs list **[summary]**.
- Indian speech resources are strong (IndicVoices, 22 languages, CC BY 4.0) **[summary]**; African ones are thin. The method is chosen to work at the thin end.

## 7. Channels

| Channel | Device | Network | Input | Model runs |
|---|---|---|---|---|
| Web app (PWA) | Smartphone | None after install | Voice, buttons | On the phone |
| WhatsApp | Smartphone | Data | Voice notes, buttons, text | Server |
| SMS | Basic phone | Signal | Number replies, short text | Server |
| Phone call | Basic phone | Signal | Speech, keypad | Server |

- **The offline web app is the core feature for the hackathon rules.** The others extend reach and are described as server-dependent.
- Channels keep separate records (decided).
- Twilio carries WhatsApp, SMS and voice behind one adapter.

**What individual developer accounts allow:**

- WhatsApp Cloud API works without business verification, capped at 250 unique users a day and two numbers; the test number reaches five registered recipients **[summary]**.
- Twilio sandbox and test numbers cover WhatsApp and voice for development.
- SMS inside India needs operator (DLT) registration; a sole proprietor can register with a PAN and one business document **[summary]**. Until then, no India SMS.
- Senegal numbers need local presence; Twilio has no two-way SMS in The Gambia **[summary]**.
- So: all four channels can be shown working and piloted with a small group. A public service needs an institution or partner to hold the registrations. The submission should say this.

## 8. Architecture and engineering standard

- **Engine** (TypeScript, pure): session flow, outcome rules from a decision table, repeat scheduling, card lookup. Same code in the browser and on the server.
- **Packs** (schema-checked, versioned data): content pack per country protocol; language pack per language.
- **Speech:** one model file format for browser (background worker) and server.
- **Channel adapters:** translate channel events to engine events and back.
- **Server:** webhook gateway and a small database keyed by phone number, holding dates, answers and card numbers only.
- **Studio:** web tool to approve cards and record a language pack.
- **Evaluation harness:** runs on every change.

No hardcoding means:

- No card text, rule, threshold, number or language in code.
- Thresholds are produced by the evaluation run and stored with the model version.
- A release is blocked if a danger-sign test phrase maps to a non-danger card, a pack fails its schema, or a card lacks a source.
- Tests for the engine and each adapter; one end-to-end test per channel.
- Hosted services (Twilio, ElevenLabs) sit behind adapters and can be swapped.

Web app limits: one connection to install (the same build will also be packaged for side-loading); must request persistent storage; cannot send SMS or call by itself.

## 9. Clinical content

- Sources: WHO guidance; India's Mother and Child Protection card (2018 revision); Senegal's mother-and-child booklet. I have search summaries of the last two and need the documents **[summary]**.
- Each card stores its source document, page and the sentence it rests on.
- Each card has a status: "from published source" or "clinician approved". The app shows which.
- **My view:** published sources are enough to build and to demonstrate. They are not enough to put in front of real pregnant women, because turning a booklet into spoken cards and rules involves judgment a clinician should check. The plan keeps a clinician review as a gate before any field use, and the outreach asks for one.

## 10. Data sheet

**Shows the problem:** WDI maternal mortality and workforce rows **[brief]**; Gambia recall survey 2021; Gambia DHS 2019-20; NFHS-5 (India: 58% with 4+ visits, 89% facility births, 54% of women with a phone they use, 46.6% rural) **[summary]**; WHO causes and timing of maternal death; PROMPTS trial.

**Built with:**

| Data | Use | License | Does not cover |
|---|---|---|---|
| Official booklets and WHO guidance | Signs, card wording | To check | The Gambia, Solomon Islands |
| Mother Q&A set, Uganda, 503 pairs **[brief]** | Which questions women ask | CC0 | West Africa, India |
| WolBanking77, Fleurs-SLU, INJONGO | Testing the matching method | CC BY 4.0 / to check | Health; pregnant speakers |
| WAXAL Fula | Fula pack | CC BY-SA 4.0 **[read]** | Health speech |
| Our Hindi and Marathi recordings | Examples and test set | Ours, with consent | Dialects, real users |

Not available: the YUX Wolof maternal set (750 utterances) has no public download that I found **[unchecked]**; the outreach asks for it. WAXAL has no Wolof.

**The data gap the tool fills:** which signs women recall, by language and place, and which questions no approved card answers. Counts only, no audio, no identity, opt-in, sent when a connection exists.

## 11. Privacy, shared and lost phones

- Offline app: everything on the phone, no account, audio discarded after matching, no name in the record.
- The phone is the daughter's; the app says aloud at setup that she can see the record.
- Early pregnancy is often kept private in The Gambia **[read]**: nothing on the lock screen; neutral SMS wording available.
- Lost phone: nothing in a cloud; optional PIN; the record is rebuilt from her paper card.
- Server channels: keyed by phone number; a hosted speech service means her audio leaves for a third party, so consent wording comes first, and audio is not kept.
- Recording real pregnant women for research needs ethics approval and consent. Until then, volunteer speakers.

## 12. From the judges' side

| Criterion | What we show | Where we are weakest |
|---|---|---|
| Built within constraints, 25% | Full session in airplane mode on a cheap phone; pack and model size; the SMS on a basic phone | Web app needs one connection to install |
| Development relevance, 20% | The five-link chain; recall of two signs; knowledge without a plan did not change care-seeking | No outcome evidence of our own |
| Data grounding, 15% | Data sheet with gaps stated; a benchmark nobody has run; recall counts as new data | No speech from pregnant women yet |
| Fits the sector, 15% | It is the voice form of the booklet ministries already print; PROMPTS and MomConnect as precedent | No user testing in Senegal or The Gambia |
| Clarity and why AI, 15% | One sentence: recall cannot be graded without understanding her speech | Must work live, in real time |
| Scale and what next, 10% | Language packs; Hindi, Marathi, Wolof, Fula; open license; no cost per user offline | Individual developers, no institution yet |
| Responsible AI, pass/fail | Fixed list, abstain, she decides, data on the phone | Content not yet clinician approved; must be stated |

What a World Bank reviewer will ask, and the answer the product should give:

- **Who runs it after you?** A ministry or NGO owns the packs; the code is open and meets the digital public goods standard (open license, open standards, privacy, do no harm) **[summary]**.
- **Does it fit country systems?** Content is the national booklet; the clinic card and the counts are shaped to feed the facility record later.
- **What does it cost?** Offline: nothing per woman after install. Server channels: per message; PROMPTS reports $0.74 per mother over her time on the service **[brief]**.
- **Is it "small AI"?** The Bank's own description is practical applications on everyday devices such as phones **[summary]**. A model of tens of megabytes on a shared phone is that.
- **Where is the evidence?** Stated plainly: a measured benchmark now, a recall study next, no claim on deaths.

## 13. Sustainable Development Goals

| Target | Connection | What we can measure |
|---|---|---|
| 3.1 maternal mortality (197 per 100,000 against 70) **[brief]** | Recognition and decision delays | Signs recalled; plan made |
| 3.2 newborn deaths | Newborn danger signs in the weeks after birth | Newborn signs recalled |
| 3.7 access to reproductive health information | Information in her language, by voice | Sessions completed |
| 3.8 universal health coverage | Use of antenatal and postnatal visits | Visits kept (self-reported) |
| 5.b technology for women | Works on a shared phone and a basic phone | Use by women without their own smartphone |
| 10.2 inclusion | Low literacy, minority languages | Languages served |
| 17.18 data | Recall and unanswered-question counts | Counts by language and place |

The claim is on the intermediate measures in the right-hand column. The tool does not claim to reduce deaths.

## 14. Order of work

1. **Foundations.** Repository, pack schemas, engine with tests; obtain the source documents and build card lists; send the outreach.
2. **Speech research.** Harness, encoder benchmark, Hindi and Marathi recordings, model and threshold.
3. **Offline web app** in Hindi and Marathi: plan, say it back, check, ask, carry over, clinic card.
4. **Server channels:** WhatsApp, then calls, then SMS.
5. **Studio and packs:** Fula as the first pack added without code; Wolof when a reviewer is found.
6. **After-birth and newborn content.**
7. **Field study,** with ethics approval and a clinician-approved pack.

## 15. Open points

1. License: Apache-2.0 for code. Content derived from WHO's antenatal kit must carry WHO's non-commercial share-alike license (section 24); our own content CC BY.
2. Should the weekly SMS also go to the person who decides and to her health worker, if she chooses? I suggest yes.
3. The name needs a Wolof speaker's check, and a neutral name for other languages.
4. Which district in Maharashtra, and which in Senegal or The Gambia, do we build the first place packs for (section 18)?

## 16. One spine, and where each addition hangs

The product stays one chain: **recognise, describe, decide, get there, be heard at the clinic.** The concept note asks for one well-defined problem and judges ask whether an entry "adds other constraints", so every addition has to attach to that chain or wait.

| Addition | Link it strengthens | Kind | When |
|---|---|---|---|
| Helping her describe a symptom | Recognise, be heard | New capability | Core |
| Nearest suitable facility, travel time, transport number | Get there | New data | Core |
| Health worker in the plan and a worker mode | Decide, be heard | New capability | Core, small |
| Audio cards sent to the basic phone | Recognise (weekdays) | New capability | Core, small |
| First pregnancy and myths | Recognise | Content only | Content milestone |
| Known conditions (anaemia, diabetes, blood pressure, age over 35) | Recognise | Content only | Content milestone |
| Entitlements (free transport, free delivery) | Decide, get there | Content only | Content milestone |
| Video | Recognise | Optional media | Later |
| Blood pressure cuff over Bluetooth | Recognise | Hardware she does not own | Not now |

## 17. Helping her describe a symptom

**The need.** She says "I don't feel right" or "it hurts here". The midwife has minutes. A clear account is worth more to both than a guess.

**What it does.** A short guided conversation that turns a vague complaint into a defined one:

1. She speaks. The model returns the few most likely complaints from a fixed list (pain, bleeding, swelling, fever, fluid, breathing, dizziness, vomiting, burning urine, baby's movement, and so on).
2. If nothing matches, she taps a body picture.
3. The app asks a few follow-up questions from a fixed bank: where exactly, since when, how strong (picture scale), what else came with it. Pictures and audio, buttons to answer.
4. It says the result back: "Strong pain high in the belly since yesterday, with headache. Is that right?"
5. That sentence goes on the clinic card. If the account touches a danger sign, the explicit yes/no question for that sign follows, and the usual rules apply.

**Where the AI is.** Two places: matching her words to candidate complaints, and choosing the next question. The next question is the one that best separates the remaining possibilities, computed from the decision table in the content pack, so the order is neither hand-written nor learned from data we do not have.

**What it is not.** It never names a disease. It never says the symptom is harmless. It ends with her own words made clear, and who to tell.

**Sources.** WHO's machine-readable antenatal guideline (the SMART guidelines digital adaptation kit, with a decision-support section and a FHIR guide) **[summary]**; WHO's pregnancy and childbirth care guide. Picture-based questionnaires give assessments equivalent to written ones for low-literacy users **[summary]**.

**How it is tested.** Every path through the table is walked automatically: each ends within a set number of questions, and every path that includes a danger sign reaches the urgent outcome.

## 18. Getting there: facility and travel data

**Status, plainly.** I have read the concept note's dataset list. I have not downloaded or queried any of these databases yet. The brief describes files "on disk", but they are not on this laptop; I searched for them.

| Source (from the concept note unless marked) | What it gives | What it does not give |
|---|---|---|
| healthsites.io / OpenStreetMap | Facility locations, some names and types | Completeness: The Gambia has 73 rows against 103 in Maina **[brief]** |
| Maina et al. | 98,745 public facilities in sub-Saharan Africa with type | India, Solomon Islands; private facilities |
| Malaria Atlas Project travel time | Minutes to nearest hospital or clinic, walking-only and motorised, about 1 km grid, 2019, CC BY 4.0 **[summary]** | A route; today's road or river conditions |
| AccessMod (WHO) | A tool to model access ourselves | It is software, not data |
| Service Delivery Indicators | Staff absence, equipment, drugs, from sample surveys | Any named clinic today; Senegal's was a 2010 pilot **[summary]** |
| DHS Service Provision Assessment | Readiness by facility type; Senegal ran it yearly from 2012 **[summary]** | Open download: needs registration **[brief]** |
| DHIS2 | Where a clinic record would land | Patient-facing data |
| India (added) | Government facility registries with facility level **[summary]**; OpenStreetMap | A confirmed open, geocoded download: still to find **[unchecked]** |

**The honest limit.** No open dataset says whether a clinic is open or staffed today. "Availability" can only be approximated by facility level, a phone number to call ahead, and what the household itself notes after each visit.

**What we build.** A "place pack" per district, made by a build command from these sources:

- At setup she picks her village (or the phone's location is used once).
- The app stores the nearest facilities by level, with distance, modelled travel time on foot and by vehicle, phone number, and what that level can handle.
- For bleeding or fits, the nearest clinic may be the wrong first stop. Where facility level is known, the plan names the nearest one that can handle an emergency.
- The family confirms or overrides the suggestion. Local knowledge beats the dataset.
- Emergency transport goes in the plan: in India, 102 and 108, with transport free for pregnant women under the JSSK scheme **[summary]**.
- Works offline once stored. An offline map (single-file map tiles) is optional.

**Why it matters.** In rural Senegal families could not raise the 10,000 CFA for the health-post ambulance, and only 62% of health posts could use a vehicle **[summary]**. In rural Gambia transport and cost delays were the main contributors to perinatal deaths **[summary]**. This is why "money set aside" is a line in her plan.

## 19. Community health workers

**Who they are.** India: ASHAs. They are paid per task; the home-based newborn schedule is visits on days 3, 7, 14, 21, 28 and 42, with ₹250 per newborn on completion **[summary]**. In one survey 92% reported heavy workload and 70% delayed payment **[summary]**. Senegal: the bajenu gox, about 8,600 volunteer "neighbourhood godmothers" since 2009 **[summary]**. The Gambia: village health workers and community birth companions **[summary]**.

**What already works for them.** A phone job aid for ASHAs in Gujarat raised two home visits in the first week from 22.9% to 32.4% in a randomised trial (ImTeCHO) **[summary]**. Mobile Academy trains ASHAs by phone call; 145,116 had graduated at one count **[summary]**. Mobile Kunji in Bihar gave workers a deck of picture cards, each linked to a recorded message **[summary]**. Our tool is close to Mobile Kunji placed in the woman's own home.

**What we take from this.**

1. **The worker is the "person" in "ask a person".** She is in the plan by name and number; one tap calls her; the weekly SMS can go to her if the woman chooses.
2. **The calendar follows the worker's schedule.** After birth, sessions fall on the home-visit days and say "your ASHA should visit today; these are the newborn signs". In India the 9th of each month is the free doctor check-up day (PMSMA) **[summary]**.
3. **Worker mode.** The same app on the worker's phone, with several women as separate profiles behind a PIN. She plays the cards in the woman's language during a visit and runs the recall and check with her. Every sentence carries its source, so she is never the one inventing the advice. That is what makes it more trustworthy for both.
4. **Worker training.** The recall engine with a worker pack drills the signs, in the manner of Mobile Academy.

It does not replace the government's own worker apps or registers. It does not send a woman's data to a worker without her choosing to.

## 20. Using the basic phone itself

| Feature | Use | Reliable? |
|---|---|---|
| Bluetooth or memory card | The smartphone sends the audio cards to her basic phone; she replays them on weekdays with no network. Maharashtra's HealthPhone project preloaded memory cards the same way **[summary]** | Yes. The web app hands files to the phone's share menu |
| Calls | The call channel. Add "missed call, we call back" so it costs her nothing | Yes |
| Speed dial and contacts | Plan contacts saved to keys: hold 2 for the health worker | Yes |
| SMS inbox | Her weekday copy of the plan | Yes |
| Camera | A photo of her paper card to show at the clinic. No reading of images by the tool: the concept note rules image interpretation out | Storage only |
| Smart feature phones (JioPhone) | A lighter web version without the on-device model | To test **[unchecked]** |

On the smartphone: location once, to build her facility list; camera to scan a code that installs a pack.

**Not now: a Bluetooth blood pressure cuff.** A web app can read one. But she does not own one, and in the BUMP trials self-monitoring in pregnancy did not lead to earlier detection or better control **[summary]**. The record can hold the numbers the nurse wrote on her card, without the tool judging them.

## 21. First pregnancy and myths

- A track switched on at setup: what to expect by month, what is normal, what is not, how to prepare.
- **Myth cards.** In rural Varanasi 70% of pregnant women avoided certain foods, papaya most often, and the beliefs did not vary with education **[summary]**. In The Gambia, Fula women are traditionally barred from several nutrient-rich foods in pregnancy **[summary]**.
- Format: "Many people say X. The health booklet says Y. If unsure, ask [health worker]." Respectful, never mocking, and played for the family too, since elders often enforce these rules.
- She can ask by voice ("Can I eat papaya?") and the matcher finds the card.
- Each myth card needs an official source for the correction. Without one it does not ship. Some beliefs have a real basis and need a clinician's wording.

## 22. Known conditions

- At setup, and after each clinic visit, she or her helper marks what the nurse has told her or written on her card. The tool never infers a condition.
- Tracks: anaemia, diabetes in pregnancy, high blood pressure, age over 35, twins, previous caesarean; malaria and HIV for the African packs.
- Each track adds cards (what it means, what to do daily, extra visits) and raises the repeat priority of the related danger signs.
- Scale: 52.2% of pregnant women in India are anaemic (NFHS-5); one national survey found raised blood sugar in 22.4% of pregnant women; pregnancy hypertension in 10 to 16% **[summary]**.
- Noor is 38. The age track applies to the brief's own persona.
- Sources: India's national guidelines for diabetes in pregnancy and anaemia; WHO.

## 23. Video

- The case for it: 94% of women in the Gambian survey wanted video teaching **[read]**.
- Sources that publish for this audience: Global Health Media Project (many languages; has its own terms for download use), Medical Aid Films (476 films, 36 languages, free to download) **[summary]**. I could not confirm Hindi, Marathi or Wolof editions, nor an official Indian health ministry channel **[unchecked]**.
- Rules: only named publishers on an approved list; a person attaches each video to a card; the tool never searches YouTube by itself; terms checked per source.
- Delivery: an optional layer of a language pack, downloaded on a connection or passed by Bluetooth or memory card. A YouTube link needs data, so it can only ever be an extra.

## 24. More open tools and data

| Tool or data | License | Use |
|---|---|---|
| WHO antenatal digital adaptation kit and FHIR guide | CC BY-NC-SA 3.0 IGO **[summary]** | Source for decision tables and data names; content built on it inherits the non-commercial license |
| Community Health Toolkit | AGPL-3.0 **[summary]** | Reference for worker flows; not copied into our code |
| OpenSRP FHIR Core | Apache-2.0 **[summary]** | Reference; possible clinic-side partner |
| FHIR | Open standard | Format of the clinic card, so a facility system can read it |
| Single-file map tiles (PMTiles) with MapLibre | Open **[summary]** | Offline map |
| Valhalla | MIT **[summary]** | Our own travel times from OpenStreetMap roads, as a check on the modelled grid |
| MAMA message library | Free on application **[summary]** | Stage-based message wording |
| OpenCelliD | **[brief]** | Whether calls and SMS are realistic where she lives |
| Mozilla Common Voice | CC0 | Give our recordings back, as the concept note suggests |

## 25. What I advise against

- Reading any image for health (ruled out by the note).
- Letting the tool pick videos or advice from the open web.
- A blood pressure cuff feature now.
- Claiming the tool knows whether a clinic is open.
- Presenting all of this as the pitch. The pitch is one sentence, in the note's own form: because of this tool, a pregnant woman will recognise a danger sign and act on a plan agreed with her family the same day, which she would otherwise do late; we know because women in The Gambia recall two signs on average and knowledge alone did not change care-seeking in Kenya.

## 26. After the birth

Most care stops at delivery, and most deaths do not. WHO's 2022 postnatal guideline notes that most maternal and newborn deaths occur in the first three days after birth, with another rise in the second week **[read, extract]**.

What the product does after the birth, all built into the India pack:

- **Two sets of signs, taught and checked together.** Six for the mother (heavy bleeding, high fever, fits, severe headache with blurred vision, fast or difficult breathing, calf or chest pain) and eight for the baby (not feeding, convulsions, fast breathing, chest pulling in, hot, cold, little or no movement, yellow palms and soles). The most urgent result across both is the one spoken.
- **Sessions on the home-visit days:** 1, 3, 7, 14, 21, 28 and 42.
- **Care cards, one per session:** the check-up days, iron and calcium for six months, a clean pad, keeping the baby warm, only mother's milk, keeping sick people away, someone near her for the first 24 hours.
- **Questions she can ask:** when to start breastfeeding, what to feed the baby, bathing, the cord, a very small baby.
- **Describing a problem:** her own pain, bleeding, fever, breathing; the baby's feeding, breathing, temperature.
- **Tracks that carry over:** anaemia (tablets for 180 days after delivery) and diabetes (sugar test six weeks after the birth).
- **Entitlements:** free treatment and transport for a sick baby up to one year.

Limits found while sourcing this:

- The Indian card gives the mother only two after-birth signs. The other four rest on WHO's 2015 guide, which is "all rights reserved"; the pack quotes a few words for attribution and permission has not been requested.
- The Indian card's newborn list omits jaundice; it is added from WHO 2022.
- WHO's "see a health worker soon" tier (breast problems, urine problems, wound infection, low mood) is not in the pack yet. The engine treats every sign as "go now"; a second tier needs a rule change and a clinician's view.
- Family planning, immunisation dates and birth registration are not yet in the pack.
- Sources disagree on the visit schedule (card: days 1, 3, 7 and week 6; ASHA home visits: 3, 7, 14, 21, 28, 42; WHO: 24 hours, 48 to 72 hours, 7 to 14 days, week six). The pack states the Indian ones.

## 27. What the data handover gave us

The handover (4 October 2026) was verified against its checksums and unpacked to `data/health-transfer/`, which is not committed. Licenses are quoted from its manifest; where the manifest says "unknown", so do we.

**Built from it:** facility lists ("place packs") for The Gambia (119 facilities) and Senegal (2,050), from the Maina list (license: unknown in the manifest) and healthsites.io (ODbL). The app's "find places near me" uses them offline.

**Computed from it** (`research/access/gambia_access.py`, WorldPop 2020 grid, 2.43 million people):

| Straight-line distance to… | Within 5 km | Within 10 km | Median | 90% of people within |
|---|---|---|---|---|
| Any listed facility | 81% | 96% | 2.3 km | 7.2 km |
| A hospital on the official list (6 with coordinates) | 28% | 44% | 13.2 km | 47 km |

This is the number the brief said it did not have, with a limit: these are straight lines. The river, roads and seasons are ignored, so real journeys are longer.

What it means for the product: a clinic is near for most Gambians; a hospital is not. For bleeding or fits, "the nearest facility" and "the nearest hospital" are different answers, which is why the plan step shows both.

**What the handover could not give:**

- **Cell coverage.** The cell-tower file has five rows for The Gambia. That is a gap in the crowd-sourced data, not evidence of no signal, so no coverage claim is made.
- **India.** No Indian facility list, map extract or cell-tower rows. The clinic finder says so when she is in India and asks her to type the name.
- **Travel time.** No travel-time grid was included. Road routing from the OpenStreetMap extracts is possible and not yet done.
- **Half the public-map points for The Gambia** (39 of 73) have no coordinates and are left out.
- **Financial inclusion surveys** for the brief's countries: only six unrelated countries were present.

## 28. What the speech measurements say, and what we built on them

The benchmark has finished. Full report: `research/reports/wolbanking77-fewshot.md`; protocol written before any result: `research/reports/protocol.md`. My extra same-phrase check (`research/diagnostics/same_phrase.py`) is exploratory and was written after the first results were seen.

Data: WolBanking77 audio, 3,204 Wolof clips, 177 read sentences, 10 banking and transport intents, 16 speaker ids, CC BY 4.0. Not health speech, not pregnant speakers, no out-of-scope audio. Encoder: Whisper tiny or base, frozen, last layer, averaged over the real frames. Speakers in the test are never in the examples.

**Pre-registered result: the matcher does not work as an unconfirmed classifier.** Share of clips given the right intent, 50 speaker-held-out runs, chance is 10%:

| Examples per intent | Whisper tiny | Whisper base | Base, sentence not among the examples |
|---|---|---|---|
| 1 | 29.5% | 29.4% | 21.6% |
| 3 | 43.6% | 44.4% | 32.8% |
| 5 | 50.9% | 51.9% | 37.9% |
| 10 | 63.3% | 63.9% | 46.6% |

- **Confidence is unusable.** With ten examples, a threshold tuned on the test data itself accepts only 1.6% of clips at 1% error. A threshold calibrated on other speakers for 5% error accepts 3.5% and is still wrong 10.3% of the time.
- **Noise and phone lines hurt.** Phone-quality audio costs about 3 points; noise at 10 dB costs about 10.
- **The compressed model is as good as the full one** (within 0.3 points), so the 10 MB file is the right one to ship.
- **Tiny and base are indistinguishable**, so the smaller is used.

**Exploratory, after the fact:** when the examples include the same phrases said by other people, it behaves like a phrase matcher: 91% right with 15 other speakers, 81 to 87% with 3 to 5, 58% with one. The benchmark's own after-the-fact check (all clips from six other speakers) gives 85%.

**Against the bar written in advance** (zero danger-to-harmless errors while accepting 70%): not met, by a wide margin. So, as the plan said, recall ships with pictures and typing as the dependable route and voice as an option.

**What was built:**

- Voice never accepts a match by itself. It plays its best guess back ("Did you say: high fever?") and she answers yes or no.
- With no example to compare against, it does not guess. The pictures open, and her tap labels what she just said.
- Every confirmation or correction stores that vector as an example of her own words, on her phone. Audio is not kept. Over weeks the phone learns how she says each sign.
- A language pack can still ship examples from a few speakers; the measurements say three to five speakers per phrase give roughly four in five right before any personal learning.
- Size: 10 MB quantised encoder plus a 14 MB runtime. The quantised encoder's vector differs slightly from the full one (cosine 0.945 on the test clip); the benchmark found the compressed model's accuracy within 0.3 points.
- The feature computation is our own short implementation, checked to reproduce the research harness's vector (cosine above 0.999).

**Not measured:** whether her own stored examples make it better for her (the dataset cannot test that), anything on Hindi or Marathi, anything on a real low-end phone.

**What would improve it:** a small trained layer on top of the frozen encoder, frame-by-frame alignment in place of averaging, and recordings of the actual sign phrases from several speakers per language.

## Sources opened today

- Gambia danger-sign survey: https://pmc.ncbi.nlm.nih.gov/articles/PMC11122691
- PROMPTS trial: https://pmc.ncbi.nlm.nih.gov/articles/PMC11835334/
- Wolof maternal-health speech recognition: https://aclanthology.org/2026.africanlp-main.27/
- Bambara speech recognition benchmark: https://aclanthology.org/2026.africanlp-main.26.pdf
- WolBanking77: https://arxiv.org/abs/2509.19271
- Few-shot keyword spotting: https://arxiv.org/abs/2104.01454
- Fleurs-SLU: https://arxiv.org/abs/2501.06117
- INJONGO: https://arxiv.org/abs/2502.09814
- WAXAL: https://huggingface.co/datasets/google/WaxalNLP
- Causes of maternal death: https://pubmed.ncbi.nlm.nih.gov/40064189/
- Postnatal care brief (timing of deaths): https://www.who.int/publications/i/item/WHO-RHR-15-05
- Kilkari trial: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9288869/
- Early pregnancy non-disclosure, The Gambia: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10207755/
- Male involvement review: https://jech.bmj.com/content/69/6/604
- Birth preparedness implementation review: https://bmcpregnancychildbirth.biomedcentral.com/track/pdf/10.1186/s12884-017-1448-8
- WHO home-based records: https://www.who.int/publications/i/item/9789241550352
- Gambia DHS 2019-20: https://dhsprogram.com/pubs/pdf/FR369/FR369.pdf
- Senegal booklet (JICA): https://www.jica.go.jp/french/publications/jica_world/c8h0vm0000emsw5a-att/1901_02.pdf
- India MCP card: https://iec.unicef.in/document/mother-and-child-protection-card
- NFHS-5 summary: https://www.downtoearth.org.in/blog/economy/what-does-nfhs-5-data-tell-us-about-state-of-women-empowerment-in-india-80920
- IndicVoices: https://arxiv.org/html/2403.01926v1
- World Bank Digital Progress and Trends Report 2025: https://openknowledge.worldbank.org/items/8f5d2cb9-92d4-42fd-a4ad-fa538f081488
- World Bank 1.5 billion health target: https://www.worldbank.org/en/news/press-release/2024/04/18/expanding-health-services-to-1-5-billion-people
- Digital public goods standard: https://www.digitalpublicgoods.net/blog/setting-a-standard-for-digital-public-goods
- WhatsApp without verification: https://blueticks.co/blog/whatsapp-api-without-meta-verification
- India DLT registration: https://www.enablex.io/insights/a-step-by-step-guide-to-dlt-registration/
- Twilio, The Gambia: https://www.twilio.com/en-us/guidelines/gm/sms
- ElevenLabs languages: https://elevenlabs.io/docs/overview/models
- Concept note (local PDF): /home/saurabh/Downloads/tmp/file(3).pdf
- Malaria Atlas Project travel time: https://developers.google.com/earth-engine/datasets/catalog/projects_malariaatlasproject_assets_accessibility_accessibility_to_healthcare_2019_walking_only
- Home-based newborn care schedule: https://hbnc-hbyc.mohfw.gov.in/AboutUs/aboutHBNC
- ImTeCHO trial: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6812744/
- ASHA challenges survey: https://chwcentral.org/resources/assessing-challenges-and-sources-of-dissatisfaction-among-accredited-social-health-activists-employees/
- Bajenu gox: https://afro.who.int/pt/node/20325
- Gambia community health workers: https://www.unicef.org/gambia/stories/hospital-ward-village-no-mother-goes-alone
- Mobile Kunji: https://www.defindia.org/files/2013/08/CaseStudy2-2B-MobileKunji.pdf
- HealthPhone: https://www.defindia.org/files/2013/08/CaseStudy4-2B-HealthPhone.pdf
- Kilkari and Mobile Academy evaluation: https://nhsrcindia.org/sites/default/files/2024-01/Kilkari%20and%20Mobile%20Academy%20Evaluation%20Report%202022-23.pdf
- WHO antenatal digital adaptation kit: https://www.who.int/publications/i/item/9789240020306
- WHO antenatal FHIR guide: https://build.fhir.org/ig/WorldHealthOrganization/smart-anc/Library-ANCDT01.html
- Senegal transport barrier: https://www.lshtm.ac.uk/research/centres/march-centre/news/102566/women-giving-birth-senegal-reaching-health-facility-may-be-first-hurdle-it
- Gambia transport delays: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3135215/
- India ambulance and entitlements: https://main.mohfw.gov.in/sites/default/files/23Chapter.pdf
- BUMP trials: https://www.oxfordsparks.ox.ac.uk/news/neither-detection-nor-control-of-high-blood-pressure-improved-by-self-monitoring-during-pregnancy/
- Anaemia, NFHS-5: https://factly.in/nfhs-5-data-assam-mp-rajasthan-and-up-account-for-half-the-districts-with-share-of-anaemic-pregnant-women-above-national-average
- Diabetes in pregnancy, India: https://thesouthfirst.com/news/one-in-four-pregnant-women-in-south-india-lives-with-gestational-diabetes/
- Pregnancy hypertension incidence: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6461222/
- Food taboos, Varanasi: https://imsear.searo.who.int/items/f2b2c98c-4073-4d5c-9ddb-359f2d963915
- Food taboos, Africa: https://pmc.ncbi.nlm.nih.gov/articles/PMC4729178
- Global Health Media Project: https://globalhealthmedia.org/
- Medical Aid Films: https://www.glowm.com/maf
- Community Health Toolkit: https://docs.communityhealthtoolkit.org/reference-apps/anc
- OpenSRP FHIR Core: https://github.com/opensrp/fhircore
- Protomaps: https://protomaps.com/
- Web Share API: https://web.dev/articles/web-share
- MAMA messages: https://global.comminit.com/node/9304665
- Senegal SDI: https://openknowledge.worldbank.org/entities/publication/466e709e-b9a2-5eac-b819-41bf7e5ee66f/full
- Senegal SPA: https://dhsprogram.com/pubs/pdf/SPA18/SPA18.eng.pdf
