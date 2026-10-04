# AMMA: video script

Target length: about 4 minutes. The concept note allows 2 to 5.

The five parts are in the order the concept note asks for. Narration is about 560 words. Read it slowly.

## The one-sentence problem statement

> Because of this tool, a pregnant woman will recognise a danger sign and act on a plan agreed with her family the same day, which she would otherwise do late; we know because women in The Gambia recalled two danger signs on average (2021 survey, 100 women), and in Kenya text messages raised knowledge of danger signs but did not change care-seeking (PROMPTS trial).

## Before recording

Run these once, from the repository root.

```
pnpm install
./fetch-models.sh                 # speech encoder, 10 MB. Without it there is no microphone button
cd apps/web && pnpm packs && pnpm places && pnpm dev
```

- `pnpm places` needs the data handover unpacked at `data/health-transfer/`. Without it, "Find places near me" is not shown and she types the name.
- Open the app in Chrome. Use the phone view in DevTools (the tests use a Pixel 5 profile).
- Set a fake location in DevTools, under More tools, Sensors. Use latitude 19.07, longitude 72.87 (Mumbai) for the main run. Use 13.46, -14.70 (near Bansang, The Gambia) for the one hospital shot.
- Allow the microphone and location when Chrome asks.
- For the airplane-mode shot use the production build, not `pnpm dev`. The browser tests run against `pnpm build && pnpm preview --port 4173`. Load the page once, reload once, then go offline.
- In English the voice is the phone's own text-to-speech voice, and the app says so on screen. Do not hide that line. Hindi and Marathi have synthetic clips (still being generated for Marathi at the time of writing) that no speaker has approved. If you record the demo in Hindi or Marathi, say that.
- Start with a clean browser profile so no records and no voice examples exist.

Screen labels below are the English ones from `apps/web/src/ui.ts` and the content pack.

## Shot list

### Part 1. Problem statement (0:00 to 0:25)

| Time | On screen | Said |
|---|---|---|
| 0:00 | Title card: "AMMA. An offline voice companion for pregnancy and the six weeks after birth." | "This is AMMA." |
| 0:05 | The problem sentence as text, full screen. | "Because of this tool, a pregnant woman will recognise a danger sign and act on a plan agreed with her family the same day. Without it she acts late. We know because women in The Gambia recalled only two danger signs on average. And in Kenya, messages raised knowledge but did not change care-seeking." |

### Part 2. AI capabilities and guardrails (0:25 to 1:05)

| Time | On screen | Said |
|---|---|---|
| 0:25 | Diagram: microphone, "small encoder on the phone", "nearest stored example", "Did you say: high fever?", Yes / No. | "The AI is small and it runs on the phone. It turns her speech into a vector with a ten megabyte encoder. It compares that with examples stored on the phone. Then it asks: did you say this? She answers yes or no." |
| 0:40 | Text: "Why not SMS, a menu, or search?" Three short lines. | "A menu shows the answers, so it cannot test recall. Text needs reading. Open speech-to-text for Wolof gets close to half the words wrong. So we match speech to a fixed list of meanings instead." |
| 0:52 | Text: "The model can raise a flag. It can never clear one." | "The guardrail is simple. The model never decides the outcome. Her own yes, no or not sure answers go into a fixed table. Any yes is urgent. Any not sure goes to a person. Everything the app says is a card with a source. The model picks a card or says: not sure, ask a person." |

### Part 3. Demo, end to end (1:05 to 2:50)

| Time | Screen and exact taps | Said |
|---|---|---|
| 1:05 | Home screen. Show the draft notice under the title. Tap **Add a person**. | "The phone is shared, so each woman is a record. The app says the wording is a draft." |
| 1:10 | Setup form. Type a name in **A name or word for this record**. Leave **Pregnant** selected. Set **Expected date of birth** and **Next clinic visit**. Type a number in **Her own phone number**. Tick **Low blood (anaemia)** under **What the nurse has told her**. Type a 4-digit **PIN**. Tap **Save**. | "She sets her due date and her basic phone number. A PIN locks the record." |
| 1:22 | Person screen. Tap **Start this week's session**. | "The first session makes the plan, with the family." |
| 1:25 | "Who in the family decides with you..." Type a name and phone. Tap **Next**. Repeat for "Who will go with you" and "Who is your ASHA or ANM". | "Who decides. Who goes with her. Her health worker." |
| 1:35 | "Which hospital will you go to?" Tap **Find places near me**. A list appears, each row marked "km in a straight line, not by road" and "from a public map, not an official list". Tap one. | "The hospital comes from a list stored on the phone. For Maharashtra that list is the public map, and the app says so." |
| 1:42 | Cut to the same step with the Bansang location. Show the row marked **Nearest hospital on the official list**. Cut back. | "In The Gambia it also shows the nearest listed hospital, which is often not the nearest clinic." |
| 1:48 | "How will you get there?" Type a driver name and phone, **Next**. "Has the family set some money aside?" Tap the tick. The plan plays back. | "Transport. Money set aside. The plan is read back." |
| 1:55 | Recall step: "Which signs mean you must go to the hospital straight away? Tell me one." No pictures are showing. Tap **Tap and speak**, say "high fever", tap **Tap when you have finished**. The pictures open. Tap **High fever**. | "Now recall. No pictures, because seeing them is not remembering. First time, the phone has no example of her voice. It does not guess. Her tap teaches it." |
| 2:07 | "Is there another one?" Tap **Tap and speak**, say "high fever" again, stop. Screen shows "Did you say: High fever". Tap **Yes**. | "Second time it asks before it believes itself." |
| 2:13 | Type `bleeding` in **Or type here**, tap **Send**. Then tap **That is all**. The missed signs are read out with pictures. | "A helper can type. Pictures always work. It replays only the signs she missed." |
| 2:20 | Check step: "Now I will ask about each sign." Tap **No** three times. On "have you had a headache, or has your vision been blurred?" tap **Yes**. Tap **No** for the remaining five. | "Then the check. Nine signs. Yes, no, or not sure." |
| 2:28 | "Is there anything you want to ask?" Type `iron`, **Send**. The answer card plays. Type `can I eat papaya`, **Send**. Screen shows "I am not sure about that. Please ask a person: your ASHA, ANM or doctor." Tap **That is all**. | "She asks about iron tablets and gets the booklet's answer. She asks something the cards do not cover. It says: not sure, ask a person." |
| 2:38 | Urgent outcome. The page changes colour. "You have a danger sign. Go to the nearest appropriate hospital immediately." Her plan is shown. Point at the **Call** buttons and the SMS text. Tap **Send SMS** to show the message filled in. Go back, tap **Finish**. | "One yes, and the outcome is urgent. Her plan appears. One tap calls the people in it. The text message goes to her basic phone for the weekdays." |
| 2:45 | Person screen. Tap **Card for the clinic**. Show weeks, the sign with its date, the unanswered question count, "Signs recalled without help", and the plan. | "The midwife gets one screen." |
| 2:48 | Home, **Add a person**, tap **Baby is born**, **Save**. Start a session. Tap **Skip** six times, then **That is all**. Show the first mother question ("Mother: since last time, have you had excessive bleeding?"). Tap **No** until a baby question shows. | "After the birth it asks about the mother and the baby." |

### Part 4. The gap, her day, and the stack (2:50 to 3:30)

| Time | On screen | Said |
|---|---|---|
| 2:50 | Production build in the browser. Turn on airplane mode (or DevTools, Network, Offline). Reload. Open the record with the PIN. Start a session. | "Airplane mode. It still opens and still runs. Nothing leaves the phone." |
| 3:00 | Timeline: weekend, daughter's smartphone, five minutes. Weekdays, her basic phone, the SMS. Clinic day, the card. | "This fits her week. At the weekend her daughter's smartphone is home. Five minutes. On weekdays she has the text message on her own phone. At the clinic she shows the card." |
| 3:12 | Stack slide: TypeScript engine shared by app and server. Preact offline web app. Whisper-tiny encoder with ONNX Runtime Web. Packs as checked data. Twilio webhook server. 56 automated tests. | "One engine in TypeScript, used by the app and the server. Content and languages are data packs. A pack is refused if any yes is not urgent or any card has no source. The app installs at about 25 megabytes. A server version for SMS and calls exists. It has only been tested with simulated requests." |
| 3:24 | Text: "Limits". Four lines: not reviewed by a clinician; Hindi and Marathi are machine drafts; never tested with real users; no Wolof content yet. | "The limits. No clinician has reviewed it. The Hindi and Marathi are drafts. No real user has tried it. There is no Wolof content yet." |

### Part 5. Your take (3:30 to 4:00)

This part must be in your own words. The draft below only uses facts from the project.

| Time | On screen | Said |
|---|---|---|
| 3:30 | Presenter on camera, or the benchmark table. | "Localizing AI, to me, means starting from what the phone and the language can really do. We measured a small model on Wolof speech. It did not meet the bar we wrote down in advance. So we did not ship it as the judge. We made it ask, and we made pictures the dependable route." |
| 3:45 | Text: "A language is a pack. Speakers and a recorder are enough." | "It also means the language is not in the code. A language is a pack of words and recordings. People who speak it can make one and check it. And it means saying what has not been checked. Local means it works there, and local people can correct it." |
| 3:58 | End card: AMMA, repository link. | |

## Things not to say in the video

- Do not say the voice matcher is accurate. It missed its bar. See `MODEL_CARD.md`.
- Do not say the tool reduces deaths. The plan claims only recall, plans made, and sessions done.
- Do not say it works in Wolof. The speech benchmark used Wolof audio. There is no Wolof content or language pack.
- Do not say SMS, WhatsApp or calls work live. The server passes its tests against simulated Twilio requests only.
- Do not say the wording is from the official Hindi or Marathi card. The packs are machine drafts that no speaker has read.
