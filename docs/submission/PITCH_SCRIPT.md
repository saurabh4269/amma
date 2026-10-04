# AMMA: script for presenting to the judges

About five minutes. Spoken lines are in quotation blocks. Everything else is what to show or do. The same script works for the 2 to 5 minute video the concept note asks for: it covers the five required parts in the required order.

Every number here is in the README with its source. Do not round up or add claims.

## Before you start

1. Open https://amma-mauve.vercel.app on the phone you will present from. Close the tab and open it again so it runs the newest version.
2. Turn the phone's Location on. Allow location for the site when it asks.
3. Open https://amma-server.onrender.com/health in a browser tab two minutes before. The bot's server sleeps when idle and takes up to a minute to wake.
4. Open the Telegram bot (t.me/worldbank42_bot) and send `/start` once so it is awake. Leave it on the language menu.
5. On the home screen choose Hindi once, wait about ten seconds, then switch back to English. This downloads the Hindi audio so it plays in airplane mode.
6. Delete any old records on the home screen so the demo starts clean.
7. Have airplane mode one swipe away.
8. If two people present: one speaks, one holds the phone.

## The script

### 1. The opening (0:00 to 0:20)

Show: the phone, held up, on the AMMA home screen.

> "Amma means mother. This is for a woman like Noor. She is 38, she farms, and she is pregnant. Her clinic is close, but it is crowded, and she gets a few minutes. She goes home without knowing which signs mean: go back now."

### 2. The problem, in one sentence (0:20 to 1:00)

Show: the chain diagram in the README, or just speak.

> "Because of this tool, a pregnant woman will recognise a danger sign and act on a plan agreed with her family the same day, which she would otherwise do late."

> "We know this is the gap for two reasons. In The Gambia, four in five women attend antenatal care, yet in a 2021 survey women could recall only two danger signs on average. And in Kenya, a trial with six thousand women found that text messages raised knowledge of danger signs, but did not change whether women sought care. So knowing is not enough. The family has to have decided, in advance, what they will do."

### 3. The demo (1:00 to 3:15)

Keep talking while you tap. Do not wait for the audio to finish; it can keep playing under your voice.

**Add her (10 seconds).** Tap "Add a person". Type "Noor". Tap Save.

> "This runs on the family's smartphone. No account. Her record stays on this phone."

**The plan (30 seconds).** Tap "Start this week's session". Type a name and number for who decides with her. Tap Next. Tap Skip twice (who goes with her, her health worker). At "Which hospital will you go to?", tap "Find places near me".

> "The first time, the family makes a plan while everyone is calm. Who decides with her. Who takes her. And which hospital."

> "It suggests places near her, and it shows the nearest hospital separately, because for bleeding or fits the nearest clinic is the wrong place to go. When we computed this for The Gambia, 81 percent of people live within five kilometres of some facility, but only 28 percent within five kilometres of a hospital."

Tap a hospital. Skip transport and money.

**Say it back (25 seconds).** At "Which signs mean you must go to the hospital straight away?", tap "Show pictures" and tap one sign. Then tap "That is all".

> "Every week it asks her to say the danger signs. She can speak, tap a picture, or a helper can type. It then repeats only the ones she missed. A leaflet tells her the signs. This makes her remember them."

**The check (20 seconds).** Tap No, No, No, then **Yes** on "headache or blurred vision", then No to the rest. Tap "That is all".

> "Then one question per sign. Yes, no, or not sure. Headache and blurred vision are the signs of pre-eclampsia, and the ones women most often do not know."

**The urgent screen (30 seconds).** Scroll slowly.

> "She said yes. It tells her to go to the hospital now. It plays back the plan her own family made. One tap calls her husband. One tap sends them this message: which sign, and which hospital they are going to. And there are directions to that hospital."

> "If every answer had been no, it would say: none of the listed signs today, and if you are worried, ask your health worker. It never tells her she is fine."

Tap Finish. Tap "Card for the clinic".

> "And this is what she shows the midwife. What she reported, and when. The few minutes at the clinic start from here."

**Offline and language (20 seconds).** Turn on airplane mode. Go back to the home screen, change the language to Hindi, add a new person (any name), and tap Start. A record keeps the language it was created in, so the Hindi session needs its own record.

> "Airplane mode. It still works, and it still speaks. Hindi, Marathi, and drafts in French, Swahili, Hausa and Wolof. It also continues after the birth, for the mother and the baby, because that is when most deaths happen."

Turn airplane mode off.

**Her basic phone (10 seconds).** Show the "Send the danger-sign audio to her basic phone" button and the Telegram bot.

> "On weekdays the smartphone is away. So the signs go to her basic phone as audio over Bluetooth, and the same session runs as a chat. This one is live on Telegram."

### 4. Where the AI is, and why not something simpler (3:15 to 4:00)

Show: the "may / may never" table in the README.

> "The AI has one job: to understand what she says. It is a ten megabyte speech model that runs on the phone with no network."

> "Why not a menu or an SMS? Because a menu shows her the answers. What she needs is to have them in her head, and you cannot check that without understanding her. And she may not read."

> "The rule is: the model can raise a flag, never clear one. Everything it can say is one of 254 numbered cards, each tied to a quote and page in an official health booklet. The result comes only from her own yes or no. And before any content can be built, a checker tries every combination of answers and refuses it if a single yes is not treated as urgent."

### 5. What we measured, honestly (4:00 to 4:30)

> "We tested the speech model on three thousand Wolof recordings, with the pass mark written down before we ran it. It failed. With ten examples per phrase it was right 63 percent of the time, and it could not tell when it was wrong."

> "So we changed the design. Voice never decides anything. It plays its guess back, 'Did you say high fever?', and she confirms. Pictures and typing always work. We would rather show you a model that knows its limits than one that sounds confident."

### 6. Limits and what is next (4:30 to 4:50)

> "What this is not, yet. No clinician has reviewed the content. No native speaker has reviewed the translations or the voices. It has not been used by a real patient. The content is from India's national card; Senegal and The Gambia need their own."

> "Next: clinical review, a recall study against that baseline of two signs, and a Senegalese pack with Wolof recorded by people."

### 7. Our take on localizing AI (4:50 to 5:10)

Say this in your own words. A starting point:

> "For us, localizing AI is not translating an app. It is starting from what she already has, the booklet her ministry already prints, the phone her daughter already owns, the health worker she already trusts, and making the AI small enough to fit inside that. A language should be something a community can add with a few recordings, not something they wait for a company to support."

> "AMMA. Thank you."

## If you only have two minutes

Keep sections 1 and 2 (40 seconds), the plan, the check and the urgent screen from the demo (55 seconds), and one sentence each from sections 4, 5 and 6 (25 seconds).

## If something breaks during the demo

| Problem | What to do |
|---|---|
| The site looks old or slow | Close the tab and reopen it |
| "Find places near me" finds nothing | Use the search box under it and type part of a hospital's name, or type the name by hand |
| No sound | Tap "Replay". Check the phone is not on silent |
| The bot does not answer | Open the health link, wait, send the message again. Say: "it is on a free server that sleeps" |
| The microphone guesses wrong | That is the point of section 5: tap No, then tap the picture |

## Questions judges are likely to ask

**"Is this safe? What if it tells her the wrong thing?"**
The outcome never comes from the model. It comes from her own yes, no or not sure, through a rule table that is checked exhaustively before any pack can be built. The model can only add a question or say "not sure, ask a person". But the content itself has not had clinical review, and it must not be used with patients until it has.

**"Why do you need AI at all?"**
For two things a menu cannot do: checking that she can recall the signs unprompted, and turning "it hurts here" into a clear description. Today the model is weak, so both are confirmed by her. The session still works with pictures alone.

**"Your benchmark failed. Why should we believe in this?"**
Because the product does not depend on it. The check, the plan and the outcome use no model. The benchmark told us how much to trust voice, and we built to that. It also showed the path: with the same phrases recorded by three to five other speakers, it was right about four times in five, so recording the real sign phrases is the next step. That last result is exploratory.

**"What about a language with almost no data?"**
A language is a folder: the wording, the audio, and a few recordings per phrase. No transcription model is needed. Wolof shows the limit honestly: we have draft text but no voice, because the voice service does not support it, so it needs people to record it.

**"Where is her data? What if the phone is shared or lost?"**
On the phone only. No account and no server. Audio is discarded after matching. An optional PIN encrypts the record. The app says aloud that anyone who can open the phone can see it. On the chat channels, answers are kept under the phone number, no message text is kept, and STOP deletes everything.

**"How is this different from MomConnect or PROMPTS?"**
Those send messages from a server and have a staffed helpdesk. They need a network and reading. AMMA runs offline, by voice, and adds the two things the PROMPTS trial suggests are missing: recall, and a plan the family has agreed.

**"Does it work in Senegal or The Gambia today?"**
The app, the clinic finder and the session do. The health content does not: it is India's national card. We could not obtain Senegal's booklet. That is the first thing to fix for those countries.

**"What does it cost to run?"**
The offline app costs nothing per woman after it is installed. The audio was generated once. The chat channels cost per message and need a host.

**"Who would own this?"**
A ministry or an NGO owns its content and language packs. The code is open under Apache 2.0.

**"What would you do with more time?"**
Clinical review first. Then a recall study: signs recalled before and after four weekly sessions, against the published baseline of two.
