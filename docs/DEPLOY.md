# Deploying the AMMA server

The server is one container: a Fastify app that answers Twilio webhooks, reads the content and language packs baked into the image, and keeps its state in one SQLite file on a volume.

Marks used below: **[checked]** was run on 2026-10-04 on a local Docker 28.5; **[not checked]** is written from Twilio's and the tools' documented behaviour and was not tried against a live account or host.

## 1. Build

From the repo root:

```
docker build -f Dockerfile.server -t amma-server .
```

**[checked]** Builds to about 260 MB. The image holds the server, the five workspace packages it imports, `packs/content` and `packs/lang`. It does not hold `data/`, `research/`, `content-sources/`, `apps/web` or any `.env` file (`.dockerignore` lets in only what the Dockerfile copies).

The packs are copied in at build time. After changing a pack, rebuild.

## 2. Run

```
docker run -d --name amma \
  -p 8080:8080 \
  -v amma-data:/data \
  -e TWILIO_AUTH_TOKEN=your_auth_token \
  -e PUBLIC_URL=https://amma.example.org \
  --restart unless-stopped \
  amma-server

curl http://127.0.0.1:8080/health
# {"ok":true,"pack":"in-mch 0.1.0"}
```

**[checked]** `/health` answers, the container runs as user `node` (uid 1000), the container health check turns `healthy`, and an unsigned POST to `/twilio/message` is refused with 403.

Twilio only calls HTTPS addresses you can reach from the internet, so put the container behind something that terminates TLS (a platform's built-in HTTPS, Caddy, nginx, or a tunnel as in section 7). **[not checked]** on any hosting platform.

Keep it to one running copy. SQLite is a single file and the rate limits are held in memory, so two copies would not share them.

## 3. Environment variables

| Name | Required | Default in the image | What it is |
|---|---|---|---|
| `TWILIO_AUTH_TOKEN` | yes | none | The Twilio account's Auth Token. Used to check every webhook's signature and to place callbacks. |
| `PUBLIC_URL` | yes | none | The public base address Twilio calls, for example `https://amma.example.org`. No trailing slash. Must match what is typed into Twilio exactly (scheme, host, port), or every request is refused as badly signed. |
| `CONTENT_PACK` | yes | `/app/packs/content/in-mch` | Folder of the content pack. |
| `LANGUAGE_PACKS` | no | `/app/packs/lang/en,/app/packs/lang/hi,/app/packs/lang/mr` | Comma-separated language pack folders. |
| `DATABASE_FILE` | no | `/data/amma.sqlite` | The SQLite file. Keep it on the `/data` volume. |
| `PORT` | no | `8080` | Port the server listens on inside the container. |
| `TWILIO_ACCOUNT_SID` | no | none | With `TWILIO_FROM_NUMBER`, switches on the missed-call callback. |
| `TWILIO_FROM_NUMBER` | no | none | The Twilio number callbacks are placed from, as `+91…`. |
| `CALLBACKS_PER_HOUR` | no | `3` | Most callbacks placed to one number in an hour. |
| `RETENTION_DAYS` | no | `400` | A number not heard from for this many days is deleted. Checked once an hour. |
| `RATE_PER_MINUTE` | no | `20` | Most text messages answered per number per minute. |

The server stops at start-up with a plain message if a required value is missing or a pack is not valid.

## 4. Pointing Twilio at it

In the Twilio console, on the phone number (or WhatsApp sender), set each address with method **HTTP POST**:

| For | Twilio setting | Address |
|---|---|---|
| SMS and WhatsApp text | "A message comes in" | `PUBLIC_URL/twilio/message` |
| A call the server should answer and talk through | "A call comes in" | `PUBLIC_URL/twilio/voice` |
| A missed call the server should refuse and ring back | "A call comes in" | `PUBLIC_URL/twilio/missed` |

A number has one "A call comes in" setting, so one number is either an answer-the-call number (`/twilio/voice`) or a missed-call number (`/twilio/missed`). The callback itself is sent to `/twilio/voice` by the server; nothing more needs setting for it.

**Signature checking needs the account's Auth Token.** Twilio signs webhooks with the Auth Token of the account (or subaccount) that owns the number. An API key and its secret can call Twilio's API but cannot be used to check a webhook signature. If `TWILIO_AUTH_TOKEN` holds an API key secret, every webhook gets 403 `bad signature`. The same 403 appears when `PUBLIC_URL` differs from the address in the console, or when a proxy changes the address. If the Auth Token is rotated in Twilio, update the variable and restart.

The callback also signs in to Twilio's API with `TWILIO_ACCOUNT_SID` and this same Auth Token, so the SID must be the account's own (`AC…`), not an API key SID (`SK…`).

**[not checked]** No live Twilio account was used. The signature code is covered by the repo's unit tests only.

## 5. What Twilio limits

All of this section is **[not checked]** here; confirm in the Twilio console and docs before relying on it, as the rules change.

**Trial account**

- It can call and message only numbers you have verified in the console. Anyone else gets nothing.
- You must get a Twilio number first (the trial credit covers one). Not every country's numbers are open to trial accounts.
- Trial text messages start with "Sent from your Twilio trial account -". Trial calls play a short trial notice before the server's words.
- Upgrading the account removes these three limits.

**WhatsApp: sandbox or approved sender**

- The sandbox is for testing. Each phone must first send the join code ("join some-words") to the shared sandbox number, and the membership lapses after about three days. Set the sandbox's "When a message comes in" address to `PUBLIC_URL/twilio/message`.
- For real use you need your own WhatsApp sender: a number registered through Twilio with a Meta business account, with the display name approved. This takes days.
- The server only replies to messages she sends, which falls inside WhatsApp's 24-hour reply window. It never opens a conversation, so no message templates are needed.

**SMS in India**

- Sending SMS to Indian numbers needs DLT registration with an Indian operator: the organisation (entity), the sender header, and each message template must be registered, and messages that do not match a registered template are blocked. An unregistered sender is replaced or dropped.
- AMMA's replies vary with her answers, which fits DLT templates poorly. For India, plan on WhatsApp and voice first, and treat SMS as needing separate work and an Indian legal entity.
- Twilio does not offer Indian numbers that receive SMS to every account; check what number types are on offer before planning on inbound SMS.

**Voice**

- Speech is recognised for Hindi, Marathi and English. Key presses work in any language.
- A missed-call callback is an outbound call you pay for. `CALLBACKS_PER_HOUR` caps it per number.

## 6. Where data lives and how to delete it

Everything kept is in the one SQLite file, `/data/amma.sqlite`, on the `amma-data` volume. Two tables: `users` (one row per channel address: language, consent, profile, the session in progress) and `messages` (Twilio message ids, to ignore repeat deliveries). No message text and no audio is stored. The logs leave out request bodies.

One phone number can have up to three rows, one per channel: `+91…` (SMS), `whatsapp:+91…`, and `voice:+91…`.

- **She deletes her own:** sending or saying STOP (also `unsubscribe`, `बंद`, `रोको`, `थांबा`) removes the row for that channel at once.
- **Automatic:** rows not touched for `RETENTION_DAYS` are removed, checked hourly.
- **One number, by hand** **[checked]**:

  ```
  docker exec amma node -e "
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.env.DATABASE_FILE);
    const n='+919800000000';
    console.log(db.prepare('DELETE FROM users WHERE address IN (?,?,?)').run(n,'whatsapp:'+n,'voice:'+n).changes,'rows deleted');"
  ```

- **Everything:** `docker stop amma && docker rm amma && docker volume rm amma-data`.
- **Backup:** copy the file out with `docker cp amma:/data/amma.sqlite ./amma-backup.sqlite`. A backup is personal data too; delete it on the same schedule. **[not checked]**

Twilio keeps its own logs of messages and calls, including message text, on its side. Deleting here does not delete there; set message redaction or delete logs in the Twilio console. **[not checked]**

## 7. Testing from a laptop with a tunnel

Twilio must reach the server from the internet. A tunnel gives a laptop a public HTTPS address. **[not checked]**

1. Start a tunnel to port 8080, either:
   - `cloudflared tunnel --url http://localhost:8080` (no account needed; prints a `https://….trycloudflare.com` address), or
   - `ngrok http 8080` (needs a free account; prints a `https://….ngrok-free.app` address).
2. Start the server with that address as `PUBLIC_URL`:

   ```
   docker run --rm -p 8080:8080 -v amma-data:/data \
     -e TWILIO_AUTH_TOKEN=your_auth_token \
     -e PUBLIC_URL=https://the-address-the-tunnel-printed \
     amma-server
   ```

   Without Docker: `CONTENT_PACK=packs/content/in-mch LANGUAGE_PACKS=packs/lang/en,packs/lang/hi,packs/lang/mr TWILIO_AUTH_TOKEN=… PUBLIC_URL=… pnpm --filter @amma/server start` from the repo root.
3. Put `https://the-address/twilio/message` (and `/twilio/voice` or `/twilio/missed`) into the Twilio console as in section 4.
4. Send a message from a verified phone.

Free tunnel addresses change on every start. Each time: update `PUBLIC_URL`, restart the server, and update the addresses in Twilio. All three must match or the signature check refuses the request.
