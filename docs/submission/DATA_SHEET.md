# AMMA: data sheet

Two kinds of data, as the rules ask. License strings are copied as our sources give them. Where a source says "unknown" or states no license, this sheet says the same.

How each figure was checked, using the labels from `docs/PLAN.md`:

- **read**: we opened the source.
- **summary**: taken from a search summary of the source, not the source itself. Treat as unverified.
- **brief**: from the hackathon brief (`docs/claude-brief-health-pregnancy.md`).
- **computed**: we computed it. The script and output are in the repository.

## A. Data that shows the problem

| What it shows | Figure | Source | Year | Country | Checked |
|---|---|---|---|---|---|
| Women recall few danger signs | Two signs recalled on average. Headache and blurred vision rarely named. 100 women | Gambia danger-sign survey, pmc.ncbi.nlm.nih.gov/articles/PMC11122691 | 2021 | The Gambia | read |
| Knowledge alone does not change behaviour | Messages raised danger-sign knowledge by 3.6 points and did not change care-seeking for danger signs | PROMPTS trial, pmc.ncbi.nlm.nih.gov/articles/PMC11835334 | Year not recorded in our notes | Kenya | read |
| They do attend the clinic | About 4 in 5 women have 4 or more antenatal visits | Gambia DHS | 2019-20 | The Gambia | summary |
| Maternal mortality | 354 per 100,000 live births (Gambia), 237 (Senegal), 359 (Côte d'Ivoire), 123 (Solomon Islands) | World Bank WDI, modeled estimate | 2023 | As listed | brief |
| Few clinicians | Physicians per 1,000 people: 0.09 (Gambia), 0.109 (Senegal) | World Bank WDI | 2023 | The Gambia, Senegal | brief |
| Global target missed | 197 maternal deaths per 100,000 against a target of 70 | SDG Report 2026 | 2023 | Global | brief |
| What kills | Haemorrhage and hypertensive disease cause about half of maternal deaths | WHO, Lancet Global Health | 2025 | Sub-Saharan Africa | summary |
| When | About half of deaths after birth are in the first 24 hours, 66% within the first week | WHO postnatal care brief | Year not recorded in our notes | Global | summary |
| Reading is a barrier | Rural illiteracy 62.7% | ANSD | 2021 | Senegal | summary |
| Open speech-to-text is weak | Best open model on Wolof maternal-health speech: 46% word error, 23% after fine-tuning, 31% in field recordings | YUX Design, AfricaNLP 2026 | 2026 | Senegal (Wolof) | read |
| A hospital is far | 81% of people live within 5 km of any listed facility. 28% live within 5 km of a hospital on the official list. Median distance to such a hospital is 13.2 km | Our computation: `research/access/gambia_access.py`, output `research/reports/gambia-access.json`. Inputs: WorldPop grid, Maina list, healthsites.io | Population 2020 | The Gambia | computed |
| India context | 58% with 4 or more visits, 89% facility births, 54% of women have a phone they use | NFHS-5 | Year not recorded in our notes | India | summary |
| Anaemia | 52.2% of pregnant women are anaemic | NFHS-5 | Year not recorded in our notes | India | summary |

Limits of this table:

- The recall figure rests on one survey of 100 women in one country.
- The distance figures are straight lines. The river, roads and seasons are ignored. Real journeys are longer. Only 6 hospitals on the official list have coordinates.
- Rows marked "summary" were not opened at the source.
- We have no data of our own on outcomes. No woman has used the tool.

## B. Data the tool is built with

### B1. Clinical content (content pack `packs/content/in-mch`, version 0.1.0)

Size of what we built from these, 254 cards, of which 167 carry a source quote and page, and 87 are interface wording with no health advice. 32 signs, 20 questions, 12 complaints, 8 tracks. Every source quote is in `content-sources/extracts.md`.

| Source | Year | Used for | License, as recorded in the pack | What it does not cover |
|---|---|---|---|---|
| Mother and Child Protection Card, English. Ministry of Health and Family Welfare and Ministry of Women and Child Development, Government of India | 2018 | Pregnancy and labour danger signs, newborn signs, care cards, urgent wording | "Not stated in the document." Read from a mirror of the file. The government host was unreachable | The Gambia, Senegal, Solomon Islands. Gives the mother only two after-birth signs. Its newborn list omits jaundice. Prints several signs under one picture; we split them, which a clinician should confirm |
| Guidebook for the MCP Card for ANM, ASHA, AWW. Same ministries | 2018 | "Ask a person" and "none listed" wording | "Not stated in the document." | Same as above |
| WHO, Pregnancy, childbirth, postpartum and newborn care: a guide for essential practice, 3rd edition | 2015 | Four of the six after-birth signs for the mother. The "see a health worker soon" signs | "All rights reserved. Permission is needed to reproduce; only short phrases are quoted here for attribution." Permission has not been requested | Indian practice. It is a guide for health workers, adapted here for a woman's ears without clinical review |
| WHO recommendations on maternal and newborn care for a positive postnatal experience | 2022 | Newborn jaundice sign, timing of deaths | CC BY-NC-SA 3.0 IGO. Cards built on it inherit the non-commercial terms | Country-specific schedules |
| Diagnosis and Management of Gestational Diabetes Mellitus, Government of India | 2018 | Diabetes track | "May be reproduced and quoted without permission if distributed free of cost and the source is acknowledged." | Other countries |
| Anemia Mukt Bharat Abhiyaan Operational Guidelines, Government of India | 2026 | Anaemia track | "Not stated in the document." | Other countries |

Not in the content: malaria, HIV, or anything specific to the African packs the plan describes. No content pack exists for The Gambia, Senegal or Solomon Islands. Sources disagree on the after-birth visit schedule; the pack states the Indian ones. No clinician has reviewed any card.

### B2. Language packs (`packs/lang`)

| Pack | Size | Source | License | What it does not cover |
|---|---|---|---|---|
| English (reference wording) | One text per card | Written for this project from the sources above | CC BY 4.0 for our wording. Quoted source text belongs to its publisher | Not checked by a clinician |
| Hindi | Card texts, phrase list for typed input, one audio clip per card (about 4 MB) | Draft written by a language model. Follows the official Hindi card where it has the wording; that card was transcribed from page images | Ours | Not read by a Hindi speaker or a clinician. No dialects. The audio clips are synthetic (ElevenLabs, model eleven_v3; license terms not recorded in our docs) and none is approved by a speaker. No human recordings. No voice examples |
| Marathi | Card texts, phrase list for typed input | Draft written by a language model. No official Marathi edition of the card was found | Ours | Not read by a Marathi speaker or a clinician. No dialects. Synthetic audio clips (same service) were still being generated at the time of writing; none is approved. No human recordings. No voice examples |

There is no Wolof, Fula, Mandinka or Pijin pack. No pack ships recorded speech examples. The only voice examples are the ones each woman makes on her own phone.

### B3. Facility lists (`packs/place`, built by `packages/place-tools`)

| Source | License, from the data manifest | Size | Used for | What it does not cover |
|---|---|---|---|---|
| Maina et al., public health facilities in sub-Saharan Africa (`00_SSA_MFL.xlsx`) | unknown | 98,745 facilities in 50 countries. 103 rows for The Gambia, 1,347 for Senegal. File 5.5 MB | Facility names, levels and coordinates. The "official list" | India, Solomon Islands. Private facilities. 2 Gambian and 91 Senegalese rows have no coordinates. Whether a facility is open or staffed today |
| healthsites.io facility points | ODbL | The Gambia 73 rows, Senegal 1,901 rows | Extra facility points | 39 of 73 Gambian rows and 291 Senegalese rows have no coordinates. Facility level is not confirmed |
| OpenStreetMap health facility points, Maharashtra (Overpass query) | ODbL | 10,599 points. 246 have a phone number | The Maharashtra list | No official list with coordinates was found for India. Nothing is marked as an official hospital. Completeness is unknown |
| WorldPop population grid, The Gambia (`gmb_ppp_2020.tif`) | unknown | 6.1 MB. 2.43 million people | The distance figures in part A | Travel time. It is a modelled grid, not a census of households |
| OpenCelliD cell towers | unknown | 5 rows for The Gambia | Nothing. Too few rows | Coverage. Five rows is a gap in crowd-sourced data, not evidence of no signal. We make no coverage claim |

Built place packs: The Gambia 119 facilities, Senegal 2,050, Maharashtra 10,599. The file the app loads is 2.05 MB. All distances shown are straight lines. No travel-time grid was in the handover. Phone numbers are missing for every Gambian and Senegalese facility.

### B4. Speech model and benchmark data

| Data | License | Size | Used for | What it does not cover |
|---|---|---|---|---|
| Whisper-tiny encoder, ONNX export by onnx-community | MIT | 10.1 MB quantised | The on-device speech encoder. Frozen, not trained by us | See `MODEL_CARD.md`. Whisper's own training data is not documented here |
| ONNX Runtime Web (WASM) | Not recorded in our docs | 14.2 MB | Runs the encoder in the browser | |
| WolBanking77, audio part (Hugging Face `karim155/WolBanking77`, pinned revision) | CC BY 4.0 | 3,204 clips, 4.3 hours, 177 sentences, 10 intents, 16 speaker ids. About 490 MB to download | Measuring the matching method | Health. Pregnant speakers. Spontaneous speech (it is read speech). Out-of-scope utterances. Hindi or Marathi. Speaker identity cannot be verified by us. Gender field: 1,675 clips male, 1,153 female, 376 unspecified |

### B5. Named in the plan but not used in the build

| Data | License | Status |
|---|---|---|
| Mother question-and-answer set, Uganda, 503 pairs | CC0 | Not downloaded. Not in any pack |
| Fleurs-SLU, INJONGO | To check | Not run |
| WAXAL Fula | CC BY-SA 4.0 | Not used. No Fula pack was built |
| YUX Wolof maternal speech set (750 utterances) | No public download found | Not obtained |
| Our own Hindi and Marathi recordings | | Not collected |

## C. The data gap the tool could fill

The Gambian recall figure comes from one survey of 100 women. Each AMMA session records which signs she recalled without help and how many questions no card could answer. Today these stay on her phone and appear on the clinic card. The plan describes sending counts only (no audio, no identity, opt-in). That is not built.
