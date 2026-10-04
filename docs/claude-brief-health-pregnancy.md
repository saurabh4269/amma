# Health track, pregnancy: facts and open questions

Written 4 October 2026 (Asia/Calcutta) for Saurabh Gupta.

This file is context only. It does not say what to build, how to build it, how often anything should happen, which channel to use, or whether one design is better than another. Those choices are open.

Sources of the facts below: the hackathon concept note (local text extract of the PDF), figures computed on 4 October 2026 from files already on disk, and pages and repositories checked the same day. A number is labeled with where it came from. Concept-note claims are not the same as figures computed from the data files.

## What the problem statement is

The competition is the Small AI for Development hackathon, Youth Summit with the Global AI and Digital Summit (Seoul, 19–22 October 2026). Concept note, in collaboration with MIT Club of Northern California and MIT Club of Germany. One entry is one sector. The three sectors are Health (Annex A), Agriculture (Annex B), and Tourism (Annex C). Education and government services are summit topics, not hackathon tracks.

The person in the brief is Noor. She is fictional. She is 38. She farms 2 hectares. At home she speaks a local language. She uses the national language when she needs it. The household has two phones: hers, used for calls, messages, and mobile money, and her daughter's smartphone, which she uses when her daughter is home on weekends. There is no Wi-Fi. They buy 3G bundles. For most of the day she is out and the phone is at the house. The note says her constraints are drawn from World Bank-supported work on primary health care in Solomon Islands, farmers' access to digital advisory and markets in Côte d'Ivoire, and tourism and small operators in The Gambia.

Health scenario, as written in the note. She has a clinic nearby. It is overcrowded. Quality of care is not always good. Doctors are well-meaning and are not always up to date. Patient load and record-keeping mean they cannot give each patient the attention needed.

The problem, as written. Access to primary care in remote catchments is limited by clinician scarcity and no on-site diagnostics. Patients travel long distances. Health workers have limited time per case. Low patient digital literacy compounds both.

The health challenge, as written. Design and demonstrate a Small AI solution that improves one meaningful part of Noor's access to primary care, or a frontline worker's ability to serve her. Examples named in the annex, not as a required pick: screening support, documentation, referral, follow-up, or continuity of care.

What "Small AI" means in the note. One well-defined problem, on a device the user can already use. A basic phone is named as allowed. Less dependence on a data center. The use may be predictive, generative, or agentic. Interfaces named: SMS and voice. The design is governed by the constraint and the problem, not by the size of the model.

Rules that apply to whatever form the entry takes:

- It runs on a device the user already has.
- Its core feature works offline.
- Its model files are small enough to side-load or send over a weak connection.
- At least one interaction is in a local language, by voice or text. The language has to be named. Expect a question about how it would fare in a less-supported language.

Guardrails, as written. A person makes the final call. The tool informs and flags what it is unsure of. It does not act for the user. Avoid hallucinations. Pass/fail: a fail-safe that signposts to a person when the data is not enough ("not sure — ask a person"), and a human stays in the loop. Health entries must say where the data sits, who can read it, and what happens when the phone is lost or shared.

Hard limit in Annex A. The annex lists no medical imaging or diagnosis datasets, because interpreting them is out of bounds. The same annex says the clinical use of AI in low-resource health with the strongest evidence base it knows is image-based screening (chest X-ray computer-aided detection, retinal screening, cervical visual inspection). That sentence is context in the note. It is not a dataset the entry is given.

Other tools the annex itself cites, as the note's sentences, not as our measurements. Zambia and Malawi Mwana: SMS on RapidSMS for infant HIV results and appointment reminders. Uganda mTrac: SMS into the national health information system and stock-out alerts, "over 10 million subscribers" in the note. Broadband Commission estimate in the note: wider mHealth adoption in sub-Saharan Africa could save approximately one million lives over five years against malaria, HIV/AIDS, and perinatal conditions. IFC TechEmerge (Kenya, Uganda, Ethiopia), as the note states it: even strong AI-assisted ECG and diagnostic tools needed 2G/3G, and clinician trust and regulatory acceptance took years. Those TechEmerge sentences were not re-opened at the original source in this pass.

Risks the annex names. WHO ethics and governance of AI for health: unethical collection of health data, bias, patient safety, cybersecurity. Models trained mostly on high-income data can underperform on the people they are then used for. A confident wrong output where a life is at stake is worse than no output.

Background numbers printed in the concept note, which later public figures do not match. The note says, as of 2024, 2.6 billion people remain offline and internet use is just 27% in low-income countries, and 800 million people lack official ID, and current trends generate only 420 million jobs against 1.2 billion young people reaching working age. A later ITU Facts and Figures 2025 reading in this project is 2.2 billion offline, and low-income internet use 23%. ID4D 2025 is about 800 million without official ID. Jobs: the concept note says 420 million; a Banga line says 400 million. Do not average these.

Dates in the note. Application opens September 2026. Competition weekend 3–4 October 2026. Shortlist 5–6 October. Ignite Talk 21 October 2026. One winning team per sector. One representative per team travels.

What an entry submits, as written. A working prototype (phone app, chatbot, SMS, voice line, or similar; no-code allowed). A clear statement of what the AI is and why it is not the same job as SMS, a spreadsheet, or search. Proof it works on at least one sector.

Judging weights, as written.

- Built solution within the constraints: 25%.
- Development relevance and impact: 20%. Is this a real problem from the sector brief, and does the outcome matter to the person it is built for?
- Data grounding: 15%. Does the tool help address an identified gap in the data, and is the modeling sound?
- Evidence it fits the sector: 15%.
- Clarity, design, inclusivity, and why AI rather than a simpler tool: 15%.
- Scalability, replicability, and what happens next: 10%.
- Responsible AI, data, and safety: pass/fail.

Data rules, as written. Cite sources. The listed datasets are suggestions, not a required list. Two kinds of data: (1) data that shows the problem, with source, year, and country; (2) data the tool is built with, each named with source, license, and size, plus what that data does not cover. What the data does not cover is scored.

Glossary lines that constrain language, not a design. "Fixed list of answers": the complete set of things the tool is allowed to say, because if it can say anything it cannot be checked. "Offline / on-device": the model runs on the user's own phone or hardware. "Store-and-forward": save now, send later.

## Which sector, and that the person is the pregnant woman

The sector for this work is Health, Annex A. One track only.

Inside that track, the person this work is for is the pregnant woman herself, not the clinic worker and not a community health worker. That is a decision already made in this project on 4 October 2026, after reading programmes whose user is the mother against programmes whose user is the worker.

The annex allows either side: her access to care, or a worker's ability to serve her. This project is on her side.

## Why pregnancy, as facts, not as a design

These are the facts that sit next to that decision. They are not an argument for any particular product.

Workforce and maternal mortality, computed 4 October 2026 from World Bank WDI file `WDICSV.csv` inside `WDI_CSV.zip`. Latest non-empty year. Not averaged with other years. Physicians per 1,000 people in 2023: Côte d'Ivoire 0.166, Senegal 0.109, Gambia 0.09, Solomon Islands 0.238. Low-income aggregate 0.341 and least-developed aggregate 0.309 are 2022 in that file, so they are not the same vintage as the 2023 country rates. Nurses and midwives per 1,000 in 2023: Côte d'Ivoire 0.793, Senegal 0.424, Gambia 0.658, Solomon Islands 2.001. Maternal mortality ratio, modeled, per 100,000 live births in 2023: Côte d'Ivoire 359, Senegal 237, Gambia 354, Solomon Islands 123. Low-income aggregate 346 and least-developed aggregate 289 are also 2023 in that file.

Other health series from the same extract, same rule. UHC service coverage index in 2023: Côte d'Ivoire 46, Senegal 48, Gambia 53, Solomon Islands 47. Malaria incidence per 1,000 population at risk in 2024: Côte d'Ivoire 267.95, Senegal 36.78, Gambia 75.44, Solomon Islands 224.28. TB incidence per 100,000 in 2024: Côte d'Ivoire 99, Senegal 132, Gambia 138, Solomon Islands 123.

SDG Report 2026, as read in this project, not recomputed here. SDG 3.1 maternal mortality ratio: 197 per 100,000 live births against a target of 70 (2023). SDG 3.8 service coverage index moved from 68 in 2015 to 71 in 2023; 4.6 billion people lacked essential services. SDG 3.c physicians per 10,000: Europe 43.8, sub-Saharan Africa 2.5. Those are global or regional lines. They are not the country rows above.

Facility lists, kept in separate columns. They were not added together. They are not a count of pregnant women. No travel-time surface was built.

- Maina et al. SSA master facility list, sheet `SSA MFL`: 98,745 facilities, 50 countries. Solomon Islands is not in it. Côte d'Ivoire 1,792. Senegal 1,347. Gambia 103.
- healthsites.io rows: Gambia 73, Senegal 1,901, Côte d'Ivoire 2,484, Solomon Islands 15.
- OpenStreetMap, own amenity tags only, extracts dated in the file header 2026-10-02. Hospitals: Côte d'Ivoire 368, Senegal and Gambia together 283 (one file, not split), Solomon Islands 10. Clinics: Côte d'Ivoire 381, Senegal and Gambia together 349, Solomon Islands 5.

World Bank AI Repository, public catalogue read in this project, not a dataset host. List extract: 111 use cases. Health: 12. Ten of those 12 share one triage sentence. Seven are closed computer-vision cases. Tourism: 0. A Nigeria article on the same site reports no average diagnostic gain from LLM assistance for the physicians in that evaluation: https://airepository.worldbank.org/article/does-llm-assistance-improve-healthcare-delivery-evaluation-using-site-physicians-and . Health shelf: https://airepository.worldbank.org/cases?field_sector=4029 .

The imaging examples the annex calls the strongest evidence (CAD4TB, Lunit, qXR, retinal screening) are the cases the annex then puts out of bounds, because it supplies no imaging datasets. Worker-facing tools checked in this project (SMARThealth Pregnancy and SMARThealth GPT) are for community health workers in India, not for the woman.

What this file does not contain. A count of pregnant women in these four countries. A Gambian, Senegalese, Ivorian, or Solomon Islands antenatal protocol. A travel time from a house to a clinic.

## References: programmes and code that were actually checked

Checked 4 October 2026. "Cloned" means a shallow git clone completed. Stars are GitHub `stargazers_count` that day, not a quality score.

Jacaranda PROMPTS. Patient-facing. Two-way SMS. Stage-of-pregnancy messages and an AI helpdesk that can start a referral. Free to the mother. Sign-up at public facilities. https://jacarandahealth.org/prompts/ . Page text that rendered: lifetime cost of a mother on PROMPTS stated as $0.74; 15% of operating costs covered by Kenyan county governments; 3 partnerships with national ministries of health. Impact counters on that page rendered as zero because they did not load. Do not treat those zeros as impact, and do not treat "3 million women" or "about 7% urgent" as verified; this pass did not find those sentences on the pages opened. An August 2024 Jacaranda post says humans still review model replies before they go to mothers. https://jacarandahealth.org/jacaranda-launches-open-source-llm-in-five-african-languages/

UlizaLlama. A model, not the SMS app. Public card `Jacaranda/UlizaLlama`: 7 billion parameters, Swahili and English, from Llama 2, license CC BY-NC-SA 4.0, Hugging Face `lastModified` 2023-11-22. Later cards named on the 2024 post (Swahili, Hausa, Yoruba, Xhosa, Zulu; Llama 3 family, `lastModified` 2024-08-06) are access-restricted. They are not Wolof, Dyula, Mandinka, Pulaar, French, or Bambara. No public repository named PROMPTS. `Jacaranda-Health/rapidpro` is an archived RapidPro fork, about 271 MB, not the pregnancy scripts, not cloned. Weights not downloaded.

MomConnect. South African National Department of Health. Free maternal messages by SMS or WhatsApp, plus a helpdesk, for pregnant women and new mothers. https://www.health.gov.za/momconnect/ and https://www.health.gov.za/momconnect-technical-solution/ . Registration paths named on the technical page: WhatsApp, USSD, QR, or a link, and a facility code from a nurse plus an estimated delivery date. Department sentence: since 2014, almost 5 million mothers using public antenatal services have registered, in over 95% of public health facilities. Ada Health said on 5 September 2023 that its symptom assessment was added to the WhatsApp helpdesk. No public source repository found.

askNivi / e-SAATHI. Chat for pregnant and postnatal women in Assam, and also for providers. JMIR protocol: weekly WhatsApp tips and check-ins, prenatal week 10 through postnatal week 15, aligned with National Health Mission and WHO guidance. https://www.researchprotocols.org/2026/1/e81873/ . No product repository found.

SMARThealth Pregnancy / SMARThealth GPT. George Institute. Screening and management of anaemia, diabetes, and hypertension in pregnancy, used by ASHAs in rural India. The chatbot is described as for those workers. https://www.georgeinstitute.org/our-research/research-projects/smarthealth-chatgpt-supporting-community-health-workers-to-provide-guideline-based-maternal-care-in . No public repository found in the search that was run.

Mother question-and-answer set. 503 English pairs from women in a rural and semi-urban area of Uganda. Answers written and checked by medical personnel, then rewritten into English. Authors say it is not a replacement for a doctor. Paper: https://bmcresnotes.biomedcentral.com/articles/10.1186/s13104-025-07230-2 (8 April 2025). Files: Harvard Dataverse, doi:10.7910/DVN/EZLCH3 , license CC0 1.0 from the Dataverse API (the HTML page did not load). Files named by the API: `intents.csv`, `patterns.csv`, `responses.csv`, two JSON files, and a collection-tool PDF. Not downloaded in this pass. It is English. It is not a Gambian or Ivorian protocol.

Cloned repositories, all shallow, all under 200 MB:

- https://github.com/openchlai/ai_maternal_health . README describes a WhatsApp maternal chatbot. The tree has 15 files and zero Python files. `LICENSE` is GPL-3.0. The README says MIT. Last commit 2025-05-08. Stars 0.
- https://github.com/davegerim/AMA-Maternal-Health-Assistant . Flutter app and NestJS backend for Ethiopian mothers, Amharic, with real screens and a local symptom list, and also calls to cloud models (GPT, Whisper, Grok, and others, as the README and code describe). No `LICENSE` file in the repo. Last commit 2025-12-02. Stars 0.
- https://github.com/diyakamboj/carecircle . Next.js maternity web chat. `LICENSE` is MIT. A `.env` is committed with Firebase keys and a database URL. Those values were not copied out. Last commit 2025-05-29. Stars 0.
- https://github.com/kambojananya/carecircle-rag . Flask retrieval service on Azure OpenAI, described as answering from an organisation knowledge base. `LICENSE` is MIT. Two small text files plus a FAISS index. Last commit 2025-01-07. Stars 2.
- https://github.com/mshaheerali12/maternal_RAG-bot . FastAPI app that embeds PDFs with OpenAI and answers in a web page. No `LICENSE` file. The PDFs are third-party journal and trimester files, not a national guideline. Last commit 2026-01-08. Stars 0.

A page titled as a maternal-health RAG bot with voice, https://ijctjournal.org/maternal-health-bot-rag-architecture/ , returned a WordPress critical error. Its methods are unverified.

## References: data that was actually read

Language and speech files on disk, and what they are not.

- FLORES-200 tar at `datasets/FLORES-NLLB/flores200_dataset.tar.gz`, 25,585,843 bytes. Filenames present include `wol_Latn` (Wolof), `dyu_Latn` (Dyula), `bam_Latn` (Bambara), `fra_Latn`, `eng_Latn`, as dev and devtest. A filename filter did not show Fulah or Mandinka. This is translation benchmark text. It is not medical text and not pregnancy speech.
- Mozilla Common Voice on disk: one archive, Fang scripted speech, `common-voice-scripted-speech-27.0-fang.tar.gz`, 208,540,489 bytes. Not Wolof, Dyula, or French pregnancy audio.
- FLEURS metadata zip, 64,825,504 bytes, 306 TSV files, no audio.
- MASSIVE 1.1 is on disk as an intent-labelled utterance set. It is not a pregnancy corpus.
- IndicVoices was not downloaded. Hugging Face login was not completed.

Health access files on disk.

- WDI country series above.
- healthsites.io CSVs for Gambia, Senegal, Côte d'Ivoire, Solomon Islands.
- Maina workbook `00_SSA_MFL.xlsx`.
- OpenStreetMap extracts for Côte d'Ivoire, Senegal+Gambia (one file), and Solomon Islands.
- WorldPop Gambia 2020 population grid was described with `gdalinfo` only. No access-time layer was computed from it.
- WHO Global Health Observatory: a catalogue plus 50 rows of one workforce indicator were pulled, not a full history.
- Service Delivery Indicators and DHS microdata were not downloaded. DHS returned HTTP 403. Uganda SDI Health 2013 needs a licensed application that was not submitted. IHME download links go to a login that was not completed.
- OpenCelliD cell-tower file is on disk (`cell_towers.csv.gz`, 119,277,006 bytes). It was not turned into a "no signal here" map for these countries in the health note.
- Global Findex microdata: a few country CSV extracts were downloaded (not a pregnancy file). Enterprise Surveys access was still under review.

Not on disk, and not invented. A local antenatal protocol in Wolof, Mandinka, Pulaar, French, Dyula, or a Solomon Islands language. Pregnancy speech in those languages. A travel-time-to-facility raster. A staffed helpdesk behind any of the cloned repos.

## Questions the brief asks, left open

These are the questions. This file does not answer them with a design.

- Which one part of her access to primary care is the entry about: screening support, documentation, referral, follow-up, continuity of care, or something else the annex's problem statement still covers?
- Who is the user in the demo: Noor, a worker who serves her, or both? This project has already chosen the pregnant woman. The annex still allows the worker side.
- What is the AI, in the sense the judging sheet asks: pattern recognition, text, speech, generation, or something else, and what does it do that SMS, a spreadsheet, or search would not?
- Which local language is named, and what happens in a language with even less text and speech?
- Where does the data sit, who can read it, and what happens if the phone is lost or shared, given that one phone in the household story is already shared?
- What is the fail-safe when the input is outside what the tool can support?
- Which cited figures are "the problem is real," and which files are "what the tool is built from," including license, size, and what they do not cover?
- The annex says image interpretation is out of bounds and also says imaging has the strongest evidence it knows. How is an entry that does not read images still answering the health problem the annex describes?

## Questions the data leaves open

- The physician and maternal-mortality rows are national. They are not a clinic, not a village, and not a count of pregnant women.
- Facility counts from Maina, healthsites.io, and OpenStreetMap disagree because they are different lists. Senegal and Gambia are not separated in the OpenStreetMap health counts.
- No travel time was computed. The brief asks about distance. This project does not have that number.
- The Mother set is the only public question-and-answer file found with a CC0 license and clinician-checked answers. It is Uganda and English. Using its sentences as if they were Gambian, Ivorian, or Solomon Islands guidance is not supported by the file.
- FLORES can be used to check a translation. It cannot supply a medical sentence.
- Common Voice on disk is Fang. It cannot stand in for Wolof, Dyula, or French pregnancy speech.
- PROMPTS, MomConnect, and e-SAATHI are running services. Their message text, facility codes, and language packs were not obtained, and no product repository was found to clone.
- UlizaLlama's public license is non-commercial, its languages are not the languages in the FLORES files named above, and the weights were not downloaded.
- None of the five cloned repositories is a Gambian, Senegalese, Ivorian, or Solomon Islands tool. One has no application code. One has no license file. One has secrets in a committed env file. Two call a cloud model for the answer.
