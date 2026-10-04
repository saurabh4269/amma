# AMMA: responsible AI, data and safety

Short answers first. Details and evidence below. The last section lists what has not been reviewed.

| Question | Answer |
|---|---|
| Is there a fail-safe that sends her to a person? | Yes. A weak or missing match gives "I am not sure about that. Please ask a person: your ASHA, ANM or doctor." A "not sure" on any sign gives "Speak to your ASHA or ANM today." |
| Does a person make the final call? | Yes. The outcome comes only from her own Yes, No or Not sure taps and a fixed table. The tool never calls, texts or travels for her. |
| Can it hallucinate? | For danger signs, the check and the outcome it cannot write text: everything said is one of 256 fixed cards, and a model can only pick a card or abstain. Where no card exists, and only online with her consent, a model writes a short general answer. That text can be wrong. It is fenced by instructions (no medicine, no diagnosis, never "you are fine", always "tell your health worker"), is not checked afterwards, and is shown under a caution saying it is from an AI and not from the booklet. |
| Where does the data sit? | Offline app: on the phone only. Server channels: in one database file on the server, keyed by phone number. |
| Who can read it? | Offline app: anyone who can open the phone, unless she sets a PIN. Server: whoever runs the server. |
| Has a clinician reviewed it? | No. |

## 1. Fail-safe: "not sure, ask a person"

- **Question step.** If nothing matches, the app says the "not sure" card and counts the question. The count appears on the clinic card as "Questions the tool could not answer".
- **Check step.** Each sign has three answers: Yes, No, Not sure. Any "Not sure" ends with "Speak to your ASHA or ANM today."
- **All "No".** The app says "None of the listed danger signs today. Problems can come without warning, so if you are worried, speak to your ASHA or ANM." It never says she is fine. A browser test checks that words like "you are fine" never appear.
- **Voice.** With no stored example the matcher does not guess. With one, it asks "Did you say...?" and waits for Yes or No.
- **Describing a symptom.** The guided questions never name a disease and never say a symptom is harmless. They can only add a yes/no question about a danger sign.
- **Facility finder.** Where no list covers her location, it says so and asks her to type the name. It never claims a clinic is open.

## 2. Human in the loop

The rule: **the model can raise a flag and never clear one.**

| Step | Who decides | Cost of a model error |
|---|---|---|
| Recall | Model guesses, she confirms | A sign repeated next week |
| Ask a question | Model picks a card, she confirms (voice) | A wrong but sourced card |
| Check outcome | Her answers and a fixed table | None |

How this is enforced:

- `pnpm packs:validate` tries every combination of answers. It refuses a content pack if any "yes" on an urgent sign is not urgent, if any "not sure" does not reach a person, or if any health card lacks a source.
- A property test feeds the engine random matcher output and checks that a "yes" from her always ends urgent, and that "none listed" needs every answer to be "no".
- A later "no" never overwrites an earlier "yes" in the same session.
- On an urgent outcome the app shows her plan and offers call and SMS links. She or her family must tap them. The app cannot call or send by itself.
- The family can override the suggested hospital. Local knowledge beats the list.

## 3. Where the data sits and who can read it

### Offline app (the core)

- **What is stored:** a label she chooses, language, due or birth date, next visit date, her phone number, her plan (names and phone numbers of family, health worker, driver; the hospital), sign answers with dates, which signs she recalled, described complaints, a count of unanswered questions.
- **Where:** in the browser's storage on that phone. Nothing is sent anywhere. The app makes no network calls except loading its own files. There is no account and no analytics.
- **Audio:** never stored. Speech is turned into a vector and the audio is dropped.
- **Location:** read once, when she taps "Find places near me". The coordinates are not stored. Only the chosen place, its phone number and distance are kept.
- **PIN:** optional, 4 digits or more. With a PIN the record is encrypted (AES-GCM, key derived from the PIN with PBKDF2, 310,000 rounds). Without a PIN the record is stored in plain form.
- **The setup screen says:** "Anyone who can open this phone can see this record unless you set a PIN." This is shown as text. It is not yet spoken aloud.

Gaps we know about:

- The label is visible on the home screen without the PIN. If she types her name, the name shows.
- Voice examples (vectors, not audio) are stored outside the encrypted record, per language, and are shared by all records on that phone.
- "Delete this record" removes the record. It does not remove the voice examples.
- A short PIN can be guessed by someone with the phone and technical skill.
- The weekly SMS sits in the inbox of her basic phone. Anyone holding that phone can read it. It mentions danger signs. Neutral wording for women who keep an early pregnancy private is planned and not built.

### Server channels (SMS, typed WhatsApp, calls)

- **What is stored:** the phone number, language, the same session record as above, and the state of an unfinished conversation. No message text. No audio. Request bodies are removed from logs.
- **Where:** one SQLite file on whoever hosts the server.
- **Who can read it:** the server operator. Twilio carries every message and call. On calls, her speech goes to Twilio's speech-to-text. That is a third party.
- **Retention:** records not heard from are deleted after a set number of days (default 400, configurable).
- **Separation:** the call record and the text record of the same number are kept apart. The phone app record is separate from both.

## 4. Lost or shared phone

- **Shared phone** (the brief's case: the daughter's smartphone). Each woman is a separate record. A PIN locks a record. The phone's owner can still see that a record exists and its label. The app sends no notifications, so nothing shows on the lock screen.
- **Lost phone.** Nothing is in a cloud, so nothing leaks from a server and nothing can be restored. With a PIN the record is encrypted. Without one, whoever opens the phone can read it. She rebuilds the record from her paper card and a new first session.
- **Health worker's phone.** Several women can be stored as separate records, each with its own PIN. This is the same mechanism; no extra worker features are built.

## 5. Consent on server channels

- First contact gets this message before anything else: "This service gives pregnancy and newborn information from official health booklets. It does not replace a health worker. It keeps your answers under this phone number and no message text. Send STOP at any time to delete everything."
- Choosing a language is treated as consent. The message is then repeated in that language.
- STOP (also in Hindi and Marathi) deletes everything held for that number.
- Limits: requests not signed by Twilio are rejected. Messages are rate-limited per number. Missed-call callbacks are capped per hour.
- Weak points: consent by picking a language is thin. The consent text does not yet say that Twilio processes her speech on calls. The Hindi and Marathi consent wording is an unreviewed draft.

## 6. Bias and language limits

- **Languages with content:** English, Hindi, Marathi. The Hindi and Marathi wording is a machine draft. No speaker has read it. The app shows a notice on the home screen: "Draft wording, not yet checked by a speaker or a clinician."
- **No Wolof content.** The speech benchmark used Wolof audio. There is no Wolof, Fula or Mandinka pack. The brief's countries (The Gambia, Senegal, Solomon Islands) have facility lists (The Gambia, Senegal) but no content pack.
- **Speech model.** Trained by others, mostly on high-resource languages. Our test used 16 speakers of read Wolof banking phrases. No health speech, no pregnant speakers, no Hindi, no Marathi. Results were not broken down by sex. It missed its bar. See `MODEL_CARD.md`.
- **Spoken output.** Hindi has one synthetic clip per card, made once with a hosted voice service (ElevenLabs) and shipped as files. Marathi clips were still being generated at the time of writing. Each clip is marked synthetic and none has been approved by a speaker. English, and any card without a clip, uses the phone's own text-to-speech voice, and the app says so on screen. The quality of that voice depends on the phone and was not tested. No human voice has been recorded.
- **Typed input** is matched against a phrase list. Spelling variants and Hindi or Marathi typed in Latin letters are not handled beyond what is in the list.
- **Literacy.** The setup form and the plan step need typing. A helper is assumed. Pictures are emoji, not tested drawings.
- **Content bias.** The cards follow the Indian government card and WHO. Splitting the card's grouped signs into single questions was our judgment.
- **Facility data.** Maharashtra comes from a public map only. Public and private facilities are not told apart. Distances are straight lines.

## 7. What has NOT been reviewed or tested

- **No clinician** has reviewed any card, rule or question. Every health card has status "from published source", not "clinician approved". The README says: do not use it with real patients.
- **No native speaker** has read the Hindi or Marathi wording.
- **No real user** has tried it. Not a pregnant woman, not a family, not a health worker.
- **No ethics review.** No recordings of real pregnant women have been collected. That would need approval and consent.
- **Server channels** have been tested only against simulated Twilio requests. No real SMS, WhatsApp message or call has been sent. Voice notes on WhatsApp are not built.
- **No real low-end phone** test. Speed, memory and offline text-to-speech are unmeasured there.
- **Licenses.** The Indian card states no license. WHO's 2015 guide is all rights reserved and permission has not been requested. The Maina facility list license is unknown in our data manifest.
- **No security review** of the app or server.

Before any field use the plan requires: clinician approval of the pack, speaker review of each language, and ethics approval for a study.
