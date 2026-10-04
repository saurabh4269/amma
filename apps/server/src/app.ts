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
  again: 'Send any message to start a new session. Send START to choose the language again.',
  phase_ask: 'Which is it now?',
  pregnant: 'Pregnant',
  after_birth: 'Baby is born',
  skip: 'Skip',
  voice_note: 'You can also send a voice note. It goes to a speech service to be turned into text and is not kept.',
} as const;

interface TelegramUpdate {
  update_id?: number;
  message?: { chat: { id: number }; text?: string; voice?: { file_id: string } };
  callback_query?: { id: string; data?: string; message?: { message_id?: number; chat: { id: number } } };
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

/** Words that take her back to the language choice. */
const RESTART = /^\s*\/?(start|restart|menu|language)\s*$/i;

const STOP = /^\s*\/?(stop|unsubscribe|बंद|रोको|थांबा)\s*$/i;

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
    // Telegram is sometimes unreachable for a few seconds. A send is tried three times with a short timeout,
    // and a failure is logged, never thrown: one lost reply must not take the server down.
    const api = async (method: string, body: string | FormData, headers?: Record<string, string>): Promise<Response | undefined> => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await tg.fetch(`https://api.telegram.org/bot${tg.token}/${method}`, { method: 'POST', body, headers, signal: AbortSignal.timeout(8000) });
        } catch (e) {
          req.log.warn({ method, attempt, err: String(e) }, 'telegram call failed');
        }
      }
      return undefined;
    };
    const json = (method: string, payload: object) => api(method, JSON.stringify(payload), { 'content-type': 'application/json' });

    let body = update.callback_query?.data ?? update.message?.text ?? '';
    if (update.callback_query) {
      void json('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      // Take the buttons off the message she answered, so an old question cannot be answered twice.
      const answered = update.callback_query.message?.message_id;
      if (answered !== undefined) void json('editMessageReplyMarkup', { chat_id: chat, message_id: answered, reply_markup: { inline_keyboard: [] } });
    }
    const voice = update.message?.voice;
    if (voice && tg.transcribe) {
      try {
        const got = await json('getFile', { file_id: voice.file_id });
        if (!got) throw new Error('telegram unreachable');
        const file = (await got.json()) as { result?: { file_path?: string } };
        const audio = await (await tg.fetch(`https://api.telegram.org/file/bot${tg.token}/${file.result?.file_path}`, { signal: AbortSignal.timeout(15000) })).arrayBuffer();
        const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
        body = await tg.transcribe(new Uint8Array(audio), lang?.locale);
      } catch (e) {
        req.log.error({ err: String(e) }, 'voice note could not be transcribed');
        body = '';
      }
    }

    const firstContact = !cfg.store.get(address)?.consented;
    const out = handle(address, body, 'text');
    const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
    // She is told where a voice note goes at the moment she agrees, in her language.
    if (firstContact && lang && tg.transcribe && out.parts[0]) out.parts[0].text += `\n${ui(lang, 'voice_note')}`;
    for (const [i, part] of out.parts.entries()) {
      // Numbered lines become buttons, so she can tap an answer.
      const last = i === out.parts.length - 1;
      const buttons = last ? [...part.text.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({ text: m[2]!.slice(0, 60), callback_data: m[1]! })) : [];
      // A plan question takes typed or spoken words; it still gets a way out, and yes/no where that is the answer.
      const awaiting = cfg.store.get(address)?.conversation?.awaiting;
      if (last && awaiting?.kind === 'input') {
        const say = (card: string) => lang?.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card;
        if (awaiting.slotKind === 'yesno') buttons.push({ text: say(cfg.ix.pack.prompts.yes!), callback_data: '1' }, { text: say(cfg.ix.pack.prompts.no!), callback_data: '2' });
        buttons.push({ text: ui(lang, 'skip'), callback_data: '0' });
      }
      await json('sendMessage', {
        chat_id: chat,
        text: part.text,
        reply_markup: buttons.length ? { inline_keyboard: buttons.map((b) => [b]) } : undefined,
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

    // "Start over": back to the language choice, mid-session or not. Her plan and history are kept.
    if (RESTART.test(body) && user.consented) {
      user.lang = undefined;
      user.consented = false;
      user.phaseChosen = false;
      user.conversation = undefined;
      cfg.store.put(user);
    }

    // First contact: say what this is and what is kept. Choosing a language is the consent.
    if (!user.consented || !cfg.languages.some((l) => l.id === user.lang)) {
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
      user.phaseChosen = false;
      cfg.store.put(user);
      // Said again in her own language, now that we know it, then the one thing we need to know to begin.
      return { parts: [{ text: ui(picked, 'consent'), lang: picked }, { text: phaseMenu(picked), lang: picked }], said: [], ended: false };
    }
    const chosen = cfg.languages.find((l) => l.id === user.lang)!;

    if (!user.phaseChosen) {
      const answer = body.trim();
      if (answer !== '1' && answer !== '2') return { parts: [{ text: phaseMenu(chosen), lang: chosen }], said: [], ended: false };
      const phase = answer === '1' ? 'pregnant' : 'after_birth';
      user.phaseChosen = true;
      user.profile = Profile.parse({ ...(user.profile ?? { id: address, label: '' }), lang: chosen.id, phase });
      return finishTurn(user, begin(cfg.ix, chosen, user.profile, cfg.today()));
    }

    if (!user.conversation) {
      return finishTurn(user, begin(cfg.ix, chosen, user.profile!, cfg.today()));
    }
    return finishTurn(user, receive(cfg.ix, chosen, user.conversation, body));
  }

  const phaseMenu = (l: LanguagePack) => `${ui(l, 'phase_ask')}\n1. ${ui(l, 'pregnant')}\n2. ${ui(l, 'after_birth')}`;

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
