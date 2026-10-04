import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { Profile, type LanguagePack } from '@amma/schema';
import type { PackIndex } from '@amma/engine';
import { begin, receive, REPEAT, type Turn } from '@amma/channel-text';
import type { Store, User } from './store.ts';
import { twiml, validSignature, voiceTwiml } from './twilio.ts';

export interface Config {
  ix: PackIndex;
  languages: LanguagePack[];
  store: Store;
  authToken: string;
  /** The public base URL Twilio calls, exactly as configured there. Needed to check signatures. */
  publicUrl: string;
  today: () => string;
  /** Messages allowed per address per minute. */
  ratePerMinute: number;
  /**
   * For "give a missed call and we call you back", which costs her nothing.
   * Leave out to switch the feature off.
   */
  callback?: { accountSid: string; fromNumber: string; fetch: typeof fetch; perHour: number };
  /** A Telegram bot as another text-and-voice channel. Leave out to switch it off. */
  telegram?: TelegramConfig;
}

export interface TelegramConfig {
  token: string;
  /** Telegram repeats this in a header on every update, so updates from anyone else are refused. */
  secret: string;
  fetch: typeof fetch;
  /** Turns a voice note into text. The audio goes to an outside speech service, which the consent message says. */
  transcribe?: (audio: Uint8Array, locale: string | undefined) => Promise<string>;
  /** The bytes of a card's audio clip, if the language pack has one. */
  clip: (lang: LanguagePack, card: string) => Uint8Array | undefined;
}

/** Wording the server needs before any session exists. Overridable per language under `ui`. */
const SERVER_UI = {
  consent:
    'This service gives pregnancy and newborn information from official health booklets. It does not replace a health worker. It keeps your answers under this phone number and no message text. Send STOP at any time to delete everything.',
  stopped: 'Everything kept for this number has been deleted.',
  again: 'Send any message to start a new session.',
  voice_note: 'You can also send a voice note. It goes to a speech service to be turned into text and is not kept.',
} as const;

interface TelegramUpdate {
  update_id?: number;
  message?: { chat: { id: number }; text?: string; voice?: { file_id: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

/** One piece of a reply, with the language it is in so a call can speak it with the right voice. */
interface Part {
  text: string;
  lang?: LanguagePack;
}
interface Reply {
  parts: Part[];
  /** Cards spoken in this turn, for channels that send audio as well. */
  said: string[];
  /** The session finished: a call can hang up. */
  ended: boolean;
}
const DEFAULT_LOCALE = 'en-IN';

const STOP = /^\s*(stop|unsubscribe|बंद|रोको|थांबा)\s*$/i;

export function buildApp(cfg: Config): FastifyInstance {
  const app = Fastify({ logger: { level: 'info', redact: ['req.body', 'req.headers["x-twilio-signature"]'] } });
  void app.register(formbody);
  const hits = new Map<string, { minute: number; count: number }>();
  const ui = (lang: LanguagePack | undefined, key: keyof typeof SERVER_UI) => lang?.ui[key] ?? SERVER_UI[key];
  const languageMenu = () => cfg.languages.map((l, i) => `${i + 1}. ${l.name}`).join('\n');

  app.get('/health', async () => ({ ok: true, pack: `${cfg.ix.pack.id} ${cfg.ix.pack.version}` }));

  app.post('/twilio/message', async (req, reply) => {
    const params = req.body as Record<string, string>;
    if (!validSignature(cfg.authToken, `${cfg.publicUrl}/twilio/message`, params, req.headers['x-twilio-signature'] as string | undefined)) {
      return reply.code(403).send('bad signature');
    }
    const { From: address, Body: body = '', MessageSid: sid } = params;
    if (!address || !sid) return reply.code(400).send('missing From or MessageSid');
    reply.type('text/xml');
    // Twilio retries on timeouts; answering a repeat would advance the session twice.
    if (!cfg.store.firstTime(sid)) return twiml([]);

    const minute = Math.floor(Date.now() / 60_000);
    const hit = hits.get(address);
    if (hit && hit.minute === minute && hit.count >= cfg.ratePerMinute) return twiml([]);
    hits.set(address, { minute, count: hit?.minute === minute ? hit.count + 1 : 1 });

    return twiml(handle(address, body, 'text').parts.map((p) => p.text));
  });

  // Phone calls. The same session, spoken; she answers by key press or by speaking.
  // Twilio turns her speech into text for Hindi, Marathi and English. It has no Wolof.
  app.post('/twilio/voice', async (req, reply) => {
    const params = req.body as Record<string, string>;
    const url = `${cfg.publicUrl}/twilio/voice`;
    if (!validSignature(cfg.authToken, url, params, req.headers['x-twilio-signature'] as string | undefined)) {
      return reply.code(403).send('bad signature');
    }
    // On a call we placed, she is the "To" number; on a call she placed, the "From".
    const her = params.Direction === 'outbound-api' ? params.To : params.From;
    if (!her) return reply.code(400).send('missing caller');
    // A separate record from the same number's text conversation: channels are kept apart.
    const address = `voice:${her}`;
    const first = params.Digits === undefined && params.SpeechResult === undefined;
    const known = cfg.store.get(address);
    const out = first && known?.conversation ? repeatLast(known) : handle(address, params.Digits ?? params.SpeechResult ?? '', 'voice');
    const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
    reply.type('text/xml');
    return voiceTwiml(
      out.parts.map((p) => ({ text: p.text, locale: p.lang?.locale ?? lang?.locale ?? DEFAULT_LOCALE })),
      { action: url, listenLocale: lang?.locale ?? DEFAULT_LOCALE, hangup: out.ended },
    );
  });

  // Telegram: typed text, button presses and voice notes in; text, buttons and the cards' audio out.
  app.post('/telegram/hook', async (req, reply) => {
    const tg = cfg.telegram;
    if (!tg) return reply.code(404).send();
    if (req.headers['x-telegram-bot-api-secret-token'] !== tg.secret) return reply.code(403).send('bad secret');
    const update = req.body as TelegramUpdate;
    // Telegram resends an update until it gets a 200; answering a repeat would advance the session twice.
    if (update.update_id === undefined || !cfg.store.firstTime(`tg:${update.update_id}`)) return { ok: true };
    const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chat === undefined) return { ok: true };
    const address = `telegram:${chat}`;
    const api = (method: string, body: string | FormData, headers?: Record<string, string>) =>
      tg.fetch(`https://api.telegram.org/bot${tg.token}/${method}`, { method: 'POST', body, headers });
    const json = (method: string, payload: object) => api(method, JSON.stringify(payload), { 'content-type': 'application/json' });

    let body = update.callback_query?.data ?? update.message?.text ?? '';
    if (update.callback_query) void json('answerCallbackQuery', { callback_query_id: update.callback_query.id });
    const voice = update.message?.voice;
    if (voice && tg.transcribe) {
      try {
        const file = (await (await json('getFile', { file_id: voice.file_id })).json()) as { result?: { file_path?: string } };
        const audio = await (await tg.fetch(`https://api.telegram.org/file/bot${tg.token}/${file.result?.file_path}`)).arrayBuffer();
        const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
        body = await tg.transcribe(new Uint8Array(audio), lang?.locale);
      } catch (e) {
        req.log.error({ err: String(e) }, 'voice note could not be transcribed');
        body = '';
      }
    }
    if (body === '/start') body = '';

    const firstContact = !cfg.store.get(address)?.consented;
    const out = handle(address, body, 'text');
    const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
    // She is told where a voice note goes at the moment she agrees, in her language.
    if (firstContact && lang && tg.transcribe && out.parts[0]) out.parts[0].text += `\n${ui(lang, 'voice_note')}`;
    for (const [i, part] of out.parts.entries()) {
      // Numbered lines become buttons, so she can tap an answer.
      const numbers = i === out.parts.length - 1 ? [...part.text.matchAll(/^(\d+)\. (.+)$/gm)] : [];
      await json('sendMessage', {
        chat_id: chat,
        text: part.text,
        reply_markup: numbers.length ? { inline_keyboard: numbers.map((m) => [{ text: m[2]!.slice(0, 60), callback_data: m[1] }]) } : undefined,
      });
    }
    // The same cards as one audio message: the clips are plain MP3 and play back to back when joined.
    if (lang) {
      const clips = out.said.flatMap((card) => tg.clip(lang, card) ?? []);
      if (clips.length) {
        const form = new FormData();
        form.set('chat_id', String(chat));
        form.set('audio', new Blob(clips, { type: 'audio/mpeg' }), 'amma.mp3');
        form.set('title', 'AMMA');
        await api('sendAudio', form);
      }
    }
    return { ok: true };
  });

  // Missed call: refuse the call so she is not charged, then ring her back.
  const callbacks = new Map<string, { hour: number; count: number }>();
  app.post('/twilio/missed', async (req, reply) => {
    const params = req.body as Record<string, string>;
    if (!validSignature(cfg.authToken, `${cfg.publicUrl}/twilio/missed`, params, req.headers['x-twilio-signature'] as string | undefined)) {
      return reply.code(403).send('bad signature');
    }
    reply.type('text/xml');
    const rejected = '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';
    const cb = cfg.callback;
    if (!cb || !params.From) return rejected;
    // Calling back costs money; a number that rings again and again is not called without limit.
    const hour = Math.floor(Date.now() / 3_600_000);
    const seen = callbacks.get(params.From);
    if (seen && seen.hour === hour && seen.count >= cb.perHour) return rejected;
    callbacks.set(params.From, { hour, count: seen?.hour === hour ? seen.count + 1 : 1 });
    const res = await cb.fetch(`https://api.twilio.com/2010-04-01/Accounts/${cb.accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${cb.accountSid}:${cfg.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: params.From, From: cb.fromNumber, Url: `${cfg.publicUrl}/twilio/voice`, Method: 'POST' }).toString(),
    });
    if (!res.ok) req.log.error({ status: res.status }, 'callback could not be placed');
    return rejected;
  });

  /** She called back in the middle of a session: say where we were instead of treating silence as an answer. */
  function repeatLast(user: User): Reply {
    const lang = cfg.languages.find((l) => l.id === user.lang);
    const turn = receive(cfg.ix, lang!, user.conversation!, REPEAT);
    return { parts: turn.messages.map((text) => ({ text, lang })), said: [], ended: false };
  }

  function handle(address: string, body: string, channel: 'text' | 'voice'): Reply {
    const user: User = cfg.store.get(address) ?? { address, consented: false };
    const lang = cfg.languages.find((l) => l.id === user.lang);

    if (STOP.test(body)) {
      cfg.store.forget(address);
      return { parts: [{ text: ui(lang, 'stopped'), lang }], said: [], ended: true };
    }

    // First contact: say what this is and what is kept. Choosing a language is the consent.
    if (!user.consented || !lang) {
      const picked = cfg.languages[Number(body.trim()) - 1];
      if (!picked) {
        if (channel === 'voice') {
          // On a call each language announces itself in its own voice; the explanation follows once she has chosen.
          return { parts: cfg.languages.map((l, i) => ({ text: (l.ui.press_for ?? `${l.name}: {n}`).replace('{n}', String(i + 1)), lang: l })), said: [], ended: false };
        }
        return { parts: [{ text: `${SERVER_UI.consent}\n\n${languageMenu()}` }], said: [], ended: false };
      }
      user.lang = picked.id;
      user.consented = true;
      user.profile = Profile.parse({ id: address, label: '', lang: picked.id, phase: 'pregnant' });
      const reply = finishTurn(user, begin(cfg.ix, picked, user.profile, cfg.today()));
      // Said again in her own language, now that we know it.
      return { ...reply, parts: [{ text: ui(picked, 'consent'), lang: picked }, ...reply.parts] };
    }

    if (!user.conversation) {
      return finishTurn(user, begin(cfg.ix, lang, user.profile!, cfg.today()));
    }
    return finishTurn(user, receive(cfg.ix, lang, user.conversation, body));
  }

  function finishTurn(user: User, turn: Turn): Reply {
    if (turn.ended) {
      user.profile = turn.conversation.session.profile;
      user.conversation = undefined;
    } else {
      user.conversation = turn.conversation;
    }
    cfg.store.put(user);
    const lang = cfg.languages.find((l) => l.id === user.lang);
    const texts = turn.ended ? [...turn.messages, ui(lang, 'again')] : turn.messages;
    return { parts: texts.map((text) => ({ text, lang })), said: turn.said, ended: turn.ended };
  }

  return app;
}
