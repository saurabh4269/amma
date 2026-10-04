# AMMA

An offline voice companion for pregnancy and the six weeks after birth. A woman and her household recall the danger signs, agree what they will do, and act on it. See `docs/PLAN.md` for what and why, and `docs/BUILD.md` for how.

Nothing here has been reviewed by a clinician. The Hindi and Marathi wording is draft text. Do not use it with real patients.

## Layout

| Path | What it is |
|---|---|
| `packages/schema` | Definitions of content packs, language packs and records |
| `packages/engine` | The session state machine, outcome rules, repeat scheduler, symptom clarifier, pack validator |
| `packages/matcher` | Typed-text matching and the accept / confirm / abstain decision |
| `packages/speech` | On-device speech: features, encoder, nearest-example scoring |
| `packages/place-tools` | Builds facility lists from the data handover |
| `packages/channel-text` | The same session over SMS or typed WhatsApp |
| `packages/pack-tools` | Command line: validate and build packs |
| `apps/web` | The offline web app |
| `apps/server` | Webhook server for Twilio text channels |
| `packs/content/in-mch` | India content pack, from the Mother and Child Protection card (2018) and WHO |
| `packs/lang/{en,hi,mr}` | Language packs |
| `content-sources/extracts.md` | Exact quotes and page numbers the cards rest on |
| `research/` | Speech matcher benchmark |

## Commands

```
pnpm install
pnpm test                      # unit and property tests
pnpm typecheck
pnpm packs:validate            # prove the content pack's rules and sources
./fetch-models.sh              # speech encoder for the microphone (optional, 10 MB)
cd apps/web && pnpm packs && pnpm places && pnpm dev   # run the app (places needs data/health-transfer)
cd apps/web && npx playwright test             # browser tests, including offline
```

Server (needs a Twilio account):

```
CONTENT_PACK=packs/content/in-mch LANGUAGE_PACKS=packs/lang/en,packs/lang/hi,packs/lang/mr \
TWILIO_AUTH_TOKEN=... PUBLIC_URL=https://your-host pnpm --filter @amma/server start
```

## The safety rule

The model can raise a flag and never clear one. The outcome comes only from her own yes / no / not sure answers and a decision table. `pnpm packs:validate` tries every combination of answers and refuses a pack in which any "yes" is not urgent, any "not sure" does not reach a person, or any health card lacks a source.
