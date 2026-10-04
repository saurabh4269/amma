import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { Profile, type LanguagePack } from '@amma/schema';
import { attributesOf, type PackIndex } from '@amma/engine';
import { askAside, asideMeanings, begin, beginAside, interpret, receive, receiveAside, REPEAT, type Turn } from '@amma/channel-text';
import { matchText, normalise } from '@amma/matcher';
import type { Candidate, Details, Pick } from './llm.ts';
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
  /**
   * Speech to text for the web app when it is online and she has agreed to it.
   * The key for the speech service stays on the server; the browser never sees it.
   */
  /**
   * A language model that picks which known meaning her words are closest to, for words the phrase list
   * does not recognise. Used on the bot, and by the web app when she has agreed. Leave out to switch it off.
   */
  pick?: Pick;
  /** Reads the details of a complaint that are already in her words, so they are not asked again. */
  details?: Details;
  speech?: {
    transcribe: (audio: Uint8Array, locale: string | undefined) => Promise<string>;
    /** Web origins allowed to call it. */
    origins: string[];
    /** Requests allowed per network address per hour, and in total per day, so the service cannot be run up. */
    perHour: number;
    perDay: number;
  };
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
  heard: 'You said:',
  tap_to_confirm: 'Please tap your answer, so a mishearing cannot hide a danger sign.',
  not_heard: 'I could not make out that voice note. Please say it again, or type it.',
  voice_note: 'You can also send a voice note. It goes to a speech service to be turned into text and is not kept.',
  first_this: 'I understood: {topic}. I will help with that now. So that I ask the right questions, tell me one thing first:',
  ai_note: 'When your words are not recognised, they are sent to an AI model (OpenAI) only to work out which listed topic you mean. It does not write the answers. Send STOP if you do not agree.',
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
/**
 * What her free words were taken to mean: a language, her stage, one of the offered answers, or a question or
 * problem from the pack. `sure` is true when her own words matched the phrase list; otherwise a model suggested it.
 */
interface Route {
  id: string;
  sure: boolean;
  /** For a problem: what her words already said about it (where, since when), as option ids. */
  details?: Record<string, string>;
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
  // Recorded speech arrives as raw bytes. Fifteen seconds of compressed speech is well under this limit.
  app.addContentTypeParser(/^audio\/.+/, { parseAs: 'buffer', bodyLimit: 1_500_000 }, (_req, body, done) => done(null, body));
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

  // Speech to text for the web app. Nothing is stored: the audio goes to the speech service and the text comes back.
  const sttHits = new Map<string, { hour: number; count: number }>();
  let sttDay = { day: 0, count: 0 };
  const allowOrigin = (origin: string | undefined) => (origin && cfg.speech?.origins.includes(origin) ? origin : undefined);
  app.options('/stt', async (req, reply) => {
    const origin = allowOrigin(req.headers.origin);
    if (!origin) return reply.code(403).send();
    return reply.headers({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }).code(204).send();
  });
  app.post('/stt', async (req, reply) => {
    const speech = cfg.speech;
    if (!speech) return reply.code(404).send();
    const origin = allowOrigin(req.headers.origin);
    if (!origin) return reply.code(403).send({ error: 'origin not allowed' });
    void reply.headers({ 'access-control-allow-origin': origin, vary: 'origin' });
    const hour = Math.floor(Date.now() / 3_600_000);
    const day = Math.floor(hour / 24);
    if (sttDay.day !== day) sttDay = { day, count: 0 };
    const seen = sttHits.get(req.ip);
    const used = seen?.hour === hour ? seen.count : 0;
    if (used >= speech.perHour || sttDay.count >= speech.perDay) return reply.code(429).send({ error: 'too many requests' });
    sttHits.set(req.ip, { hour, count: used + 1 });
    sttDay.count += 1;
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'no audio' });
    try {
      const locale = typeof (req.query as { lang?: string }).lang === 'string' ? (req.query as { lang: string }).lang : undefined;
      const text = (await speech.transcribe(new Uint8Array(audio), locale)).trim();
      req.log.info({ stt: true, chars: text.length }, 'speech transcribed'); // length only, never the words
      return { text };
    } catch (e) {
      req.log.error({ err: String(e) }, 'speech service failed');
      return reply.code(502).send({ error: 'speech service failed' });
    }
  });

  /** The label of a meaning, in the reference wording and in her language, for the model to choose between. */
  const describe = (meaning: string, lang: LanguagePack | undefined): Candidate | undefined => {
    const [kind, id] = [meaning.slice(0, meaning.indexOf(':')), meaning.slice(meaning.indexOf(':') + 1)];
    const card =
      kind === 'sign' ? cfg.ix.sign.get(id)?.label
      : kind === 'question' ? cfg.ix.pack.questions.find((q) => q.id === id)?.label
      : kind === 'complaint' ? cfg.ix.pack.complaints.find((c) => c.id === id)?.label
      : undefined;
    if (!card) return undefined;
    const ref = cfg.ix.card.get(card)?.ref ?? '';
    const own = lang?.translations[card]?.text;
    return { id: meaning, label: own && own !== ref ? `${ref} / ${own}` : ref };
  };
  /** Ask the model, but only among meanings that exist in the pack; any failure simply means "no suggestion". */
  const suggest = async (text: string, meanings: string[], lang: LanguagePack | undefined, log: { warn: (o: object, m: string) => void }, extra: Candidate[] = [], asked?: string): Promise<string | undefined> => {
    if (!cfg.pick) return undefined;
    const list = [...extra, ...meanings.flatMap((m) => describe(m, lang) ?? [])];
    try {
      const id = await cfg.pick(text, list, lang?.name ?? cfg.ix.pack.refLang, asked);
      // Whatever the model is, its answer counts only if it was one of the things it was offered.
      return list.some((c) => c.id === id) ? id : undefined;
    } catch (e) {
      log.warn({ err: String(e) }, 'model suggestion failed');
      return undefined;
    }
  };

  /** What her words already say about the problem she named. Any failure simply means nothing is pre-filled. */
  const detailsOf = async (text: string, meaning: string, lang: LanguagePack | undefined, log: { warn: (o: object, m: string) => void }): Promise<Record<string, string> | undefined> => {
    const named = cfg.ix.pack.complaints.find((c) => `complaint:${c.id}` === meaning);
    if (!cfg.details || !named) return undefined;
    const say = (card: string) => {
      const ref = cfg.ix.card.get(card)?.ref ?? card;
      const own = lang?.translations[card]?.text;
      return own && own !== ref ? `${ref} / ${own}` : ref;
    };
    // The same problem may be a separate entry before and after the birth; the details of both are read.
    const ids = new Set(cfg.ix.pack.complaints.filter((c) => c.label === named.label).flatMap((c) => attributesOf(cfg.ix, c.id)));
    const list = cfg.ix.pack.attributes.filter((a) => ids.has(a.id)).map((a) => ({ id: a.id, question: say(a.ask), options: a.options.map((o) => ({ id: o.id, label: say(o.label) })) }));
    try {
      return await cfg.details(text, say(named.label), list, lang?.name ?? cfg.ix.pack.refLang);
    } catch (e) {
      log.warn({ err: String(e) }, 'reading details failed');
      return undefined;
    }
  };

  /**
   * What did she mean? Wherever she is, her words may be an answer to what was asked, or something else entirely:
   * a problem she wants to describe, or a question. The phrase list is tried first; the model only when it does not know.
   * Whatever comes back is one id from a fixed list. A model's suggestion never clears a danger sign (see the caller).
   */
  const understand = async (address: string, body: string, log: { warn: (o: object, m: string) => void }): Promise<Route | undefined> => {
    const t = body.trim();
    if (!t || /^\/?\d+$/.test(t) || STOP.test(t) || RESTART.test(t)) return undefined;
    const user = cfg.store.get(address);
    const lang = cfg.languages.find((l) => l.id === user?.lang);
    const say = (card: string) => cfg.ix.card.get(card)?.ref ?? card;
    const profile = user?.conversation?.session.profile ?? user?.profile ?? Profile.parse({ id: address, label: '', lang: lang?.id ?? cfg.ix.pack.refLang, phase: 'pregnant' });
    const tell = asideMeanings(cfg.ix, profile, cfg.today());
    const extra: Candidate[] = [];
    let listen: string[] = [];
    let asked: string | undefined;
    if (!user?.consented || !lang) {
      const n = normalise(t);
      const named = cfg.languages.find((l) => normalise(l.name) === n || l.id === n);
      if (named) return { id: `lang:${named.id}`, sure: true };
      extra.push(...cfg.languages.map((l) => ({ id: `lang:${l.id}`, label: `She wants to use this language: ${l.name}` })));
      asked = 'Which language do you want to use?';
    } else if (!user.phaseChosen) {
      extra.push({ id: 'phase:pregnant', label: 'She is pregnant now' }, { id: 'phase:after_birth', label: 'Her baby has already been born' });
      asked = 'Are you pregnant now, or has the baby been born?';
    } else {
      const a = (user.aside ?? user.conversation)?.awaiting;
      if (a?.kind === 'choice') {
        // Her own word for one of the answers needs no help.
        if (interpret(t, { kind: 'choice', options: a.options }, lang)) return undefined;
        listen = a.listen ?? [];
        extra.push(...a.options.map((o) => ({ id: `option:${o.id}`, label: `Her answer to what she was asked is: ${say(o.card)}` })));
        asked = a.asked ? say(a.asked) : undefined;
      } else if (a?.kind === 'input') {
        // She is being asked for a name and a number. Those are hers and her family's, and are not sent to a model:
        // only a longer sentence with no number in it, which is more likely a problem she is describing, is looked at.
        if (/\d{4,}/.test(t) || t.split(/\s+/).length < 4) return undefined;
        extra.push({ id: 'answer:name', label: 'She is answering with the name of a person or a place, or a phone number, or saying she has nobody' });
        asked = say(cfg.ix.pack.plan.find((p) => p.id === a.slot)?.ask ?? '');
      }
    }
    const meanings = [...new Set([...listen, ...tell])];
    if (lang) {
      const hit = matchText(t, lang.lexicon, meanings);
      if (hit.kind === 'accept' && hit.meanings[0]) return { id: hit.meanings[0], sure: true, details: await detailsOf(t, hit.meanings[0], lang, log) };
    }
    const id = await suggest(t, meanings, lang, log, extra, asked);
    return id ? { id, sure: false, details: await detailsOf(t, id, lang, log) } : undefined;
  };

  // For the web app: which of these meanings did she mean? Same limits and same pages as /stt.
  app.options('/match', async (req, reply) => {
    const origin = allowOrigin(req.headers.origin);
    if (!origin) return reply.code(403).send();
    return reply.headers({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }).code(204).send();
  });
  app.post('/match', async (req, reply) => {
    if (!cfg.pick || !cfg.speech) return reply.code(404).send();
    const origin = allowOrigin(req.headers.origin);
    if (!origin) return reply.code(403).send({ error: 'origin not allowed' });
    void reply.headers({ 'access-control-allow-origin': origin, vary: 'origin' });
    const hour = Math.floor(Date.now() / 3_600_000);
    const day = Math.floor(hour / 24);
    if (sttDay.day !== day) sttDay = { day, count: 0 };
    const seen = sttHits.get(req.ip);
    const used = seen?.hour === hour ? seen.count : 0;
    if (used >= cfg.speech.perHour || sttDay.count >= cfg.speech.perDay) return reply.code(429).send({ error: 'too many requests' });
    sttHits.set(req.ip, { hour, count: used + 1 });
    sttDay.count += 1;
    const body = req.body as { text?: unknown; lang?: unknown; expect?: unknown };
    if (typeof body?.text !== 'string' || !Array.isArray(body.expect) || body.expect.length > 80) return reply.code(400).send({ error: 'bad request' });
    const lang = cfg.languages.find((l) => l.id === body.lang);
    const meaning = await suggest(body.text, body.expect.filter((m): m is string => typeof m === 'string'), lang, req.log);
    req.log.info({ match: true, found: Boolean(meaning) }, 'model asked'); // whether it found one, never the words
    // For a problem, what her words already said about it, so the app does not ask again.
    const attrs = meaning ? await detailsOf(body.text, meaning, lang, req.log) : undefined;
    return { meaning: meaning ?? null, attrs: attrs ?? {} };
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

    // She sees straight away that the bot is working on it, instead of a silent wait.
    const busy = (action: 'typing' | 'record_voice') => void json('sendChatAction', { chat_id: chat, action });
    busy('typing');

    let body = update.callback_query?.data ?? update.message?.text ?? '';
    if (update.callback_query) {
      void json('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      // Take the buttons off the message she answered, so an old question cannot be answered twice.
      const answered = update.callback_query.message?.message_id;
      if (answered !== undefined) void json('editMessageReplyMarkup', { chat_id: chat, message_id: answered, reply_markup: { inline_keyboard: [] } });
    }
    const voice = update.message?.voice;
    // What the speech service made of her voice note. It is shown back at the top of the reply, so she can see it before the bot acts on it.
    let echo = '';
    if (voice && tg.transcribe) {
      const known = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
      let heard: string;
      try {
        const got = await json('getFile', { file_id: voice.file_id });
        if (!got) throw new Error('telegram unreachable');
        const file = (await got.json()) as { result?: { file_path?: string } };
        const audio = await (await tg.fetch(`https://api.telegram.org/file/bot${tg.token}/${file.result?.file_path}`, { signal: AbortSignal.timeout(15000) })).arrayBuffer();
        heard = (await tg.transcribe(new Uint8Array(audio), known?.locale)).trim();
      } catch (e) {
        req.log.error({ err: String(e) }, 'voice note could not be transcribed');
        heard = '';
      }
      // How long the transcript was, never what it said.
      req.log.info({ voiceNote: true, chars: heard.length }, 'voice note handled');
      if (!heard) {
        // Nothing usable was heard: say so and leave the session where it was, rather than treat silence as an answer.
        await json('sendMessage', { chat_id: chat, text: ui(known, 'not_heard') });
        return { ok: true };
      }
      echo = `🎤 ${ui(known, 'heard')} "${heard}"`;
      // A danger-sign question may be answered "yes" by voice, because that only raises a flag.
      // A spoken "no" or "not sure" could be a mishearing that clears one, so it must be tapped.
      const waiting = cfg.store.get(address)?.conversation?.awaiting;
      const isSignQuestion = waiting?.kind === 'choice' && waiting.options.some((o) => o.id === 'unsure');
      if (known && waiting && isSignQuestion) {
        const event = interpret(heard, waiting, known);
        if (event?.type === 'chose' && event.option !== 'yes') {
          const say = (card: string) => known.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card;
          await json('sendMessage', {
            chat_id: chat,
            text: `${echo}\n\n${ui(known, 'tap_to_confirm')}`,
            reply_markup: { inline_keyboard: [waiting.options.map((o, i) => ({ text: say(o.card), callback_data: String(i + 1) }))] },
          });
          return { ok: true };
        }
      }
      body = heard;
    }

    const firstContact = !cfg.store.get(address)?.consented;
    const route = await understand(address, body, req.log);
    // A model reading her words as "no" or "not sure" could clear a danger sign by mistake, so that answer must be tapped.
    const now = cfg.store.get(address);
    const waiting = (now?.aside ?? now?.conversation)?.awaiting;
    if (route && !route.sure && route.id.startsWith('option:') && route.id !== 'option:yes' && waiting?.kind === 'choice' && waiting.options.some((o) => o.id === 'yes')) {
      const known = cfg.languages.find((l) => l.id === now?.lang);
      const say = (card: string) => known?.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card;
      await json('sendMessage', {
        chat_id: chat,
        text: `${echo ? `${echo}\n\n` : ''}${ui(known, 'tap_to_confirm')}`,
        reply_markup: { inline_keyboard: [waiting.options.map((o, i) => ({ text: say(o.card), callback_data: String(i + 1) }))] },
      });
      return { ok: true };
    }
    const out = handle(address, body, 'text', route);
    const lang = cfg.languages.find((l) => l.id === cfg.store.get(address)?.lang);
    // She is told where a voice note goes at the moment she agrees, in her language.
    // Said in the very first message (in English, before a language is chosen) and again in her language once it is.
    if (firstContact && tg.transcribe && out.parts[0]) out.parts[0].text += `\n${ui(lang, 'voice_note')}`;
    if (firstContact && cfg.pick && out.parts[0]) out.parts[0].text += `\n${ui(lang, 'ai_note')}`;
    if (echo && out.parts[0]) out.parts[0].text = `${echo}\n\n${out.parts[0].text}`;

    // The cards' audio goes up while the text is being sent, so her wait is the longer of the two, not the sum.
    // The clips are plain MP3 and play back to back when joined. A voice message plays in the chat like her own;
    // if Telegram will not take it as one, it is sent as an audio file.
    const clips = lang ? out.said.flatMap((card) => tg.clip(lang, card) ?? []) : [];
    const audioForm = (field: 'voice' | 'audio') => {
      const form = new FormData();
      form.set('chat_id', String(chat));
      form.set(field, new Blob(clips, { type: 'audio/mpeg' }), 'amma.mp3');
      if (field === 'audio') form.set('title', 'AMMA');
      return form;
    };

    for (const [i, part] of out.parts.entries()) {
      // Numbered lines become buttons, so she can tap an answer.
      const last = i === out.parts.length - 1;
      const numbered = last ? [...part.text.matchAll(/^(\d+)\. (.+)$/gm)] : [];
      const buttons = numbered.map((m) => ({ text: m[2]!.slice(0, 60), callback_data: m[1]! }));
      // When every option fits on its button, the same list is not also written out above the buttons.
      const question = part.text.replace(/^\d+\. .+$\n?/gm, '').trim();
      const text = numbered.length && question && numbered.every((m) => m[2]!.length <= 60) ? question : part.text;
      // A plan question takes typed or spoken words; it still gets a way out, and yes/no where that is the answer.
      const awaiting = cfg.store.get(address)?.conversation?.awaiting;
      if (last && awaiting?.kind === 'input') {
        const say = (card: string) => lang?.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card;
        if (awaiting.slotKind === 'yesno') buttons.push({ text: say(cfg.ix.pack.prompts.yes!), callback_data: '1' }, { text: say(cfg.ix.pack.prompts.no!), callback_data: '2' });
        buttons.push({ text: ui(lang, 'skip'), callback_data: '0' });
      }
      // Short answers sit side by side; long ones get a row each so they can be read.
      const short = buttons.length <= 3 && buttons.every((b) => b.text.length <= 14);
      await json('sendMessage', {
        chat_id: chat,
        text,
        reply_markup: buttons.length ? { inline_keyboard: short ? [buttons] : buttons.map((b) => [b]) } : undefined,
      });
    }
    if (clips.length) {
      busy('record_voice');
      const sent = await api('sendVoice', audioForm('voice'));
      if (!sent?.ok) await api('sendAudio', audioForm('audio'));
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

  function handle(address: string, body: string, channel: 'text' | 'voice', route?: Route): Reply {
    const user: User = cfg.store.get(address) ?? { address, consented: false };
    const lang = cfg.languages.find((l) => l.id === user.lang);
    // A question or a problem from the pack, as opposed to an answer to what was asked.
    const meant = route && /^(question|complaint|sign):/.test(route.id) ? route : undefined;

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
      user.aside = undefined;
      user.pending = undefined;
      user.pendingDetails = undefined;
      cfg.store.put(user);
    }

    // First contact: say what this is and what is kept. Choosing a language is the consent.
    if (!user.consented || !cfg.languages.some((l) => l.id === user.lang)) {
      const picked = cfg.languages[Number(body.trim()) - 1] ?? cfg.languages.find((l) => route?.id === `lang:${l.id}`);
      if (!picked) {
        // She began by saying what is wrong. It is remembered (the meaning, not her words) and taken up once she has chosen.
        if (meant) {
          user.pending = meant.id;
          user.pendingDetails = meant.details;
          cfg.store.put(user);
        }
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
      const phase = answer === '1' || route?.id === 'phase:pregnant' ? 'pregnant' : answer === '2' || route?.id === 'phase:after_birth' ? 'after_birth' : undefined;
      if (!phase) {
        if (!meant) return { parts: [{ text: phaseMenu(chosen), lang: chosen }], said: [], ended: false };
        user.pending = meant.id;
        user.pendingDetails = meant.details;
        cfg.store.put(user);
        return { parts: [{ text: `${ui(chosen, 'first_this').replace('{topic}', topic(meant.id, chosen))}\n${phaseMenu(chosen)}`, lang: chosen }], said: [], ended: false };
      }
      user.phaseChosen = true;
      user.profile = Profile.parse({ ...(user.profile ?? { id: address, label: '' }), lang: chosen.id, phase });
      // What she said before she was asked anything comes first; the weekly session can wait.
      if (user.pending) {
        // The same problem can be a different entry before and after the birth; the one for her stage is used.
        const was = cfg.ix.pack.complaints.find((c) => `complaint:${c.id}` === user.pending);
        const fits = was && was.phases.length && !was.phases.includes(phase) ? cfg.ix.pack.complaints.find((c) => c.label === was.label && (c.phases.length === 0 || c.phases.includes(phase))) : was;
        const m = was ? (fits ? `complaint:${fits.id}` : undefined) : user.pending;
        const details = user.pendingDetails;
        user.pending = undefined;
        user.pendingDetails = undefined;
        if (!m) return finishTurn(user, begin(cfg.ix, chosen, user.profile, cfg.today()));
        return asideTurn(user, beginAside(cfg.ix, chosen, user.profile, cfg.today(), m, false, details));
      }
      return finishTurn(user, begin(cfg.ix, chosen, user.profile, cfg.today()));
    }

    // A model's reading of her words as one of the offered answers is passed on as that answer's number.
    const answerOf = (awaiting: Turn['conversation']['awaiting']) => {
      const i = route?.id.startsWith('option:') && awaiting.kind === 'choice' ? awaiting.options.findIndex((o) => `option:${o.id}` === route.id) : -1;
      return i >= 0 ? String(i + 1) : body;
    };
    if (user.aside) return asideTurn(user, receiveAside(cfg.ix, chosen, user.aside, answerOf(user.aside.awaiting), meant?.id, meant?.details));

    const conv = user.conversation;
    const stepListens = conv?.awaiting.kind === 'choice' && Boolean(meant && conv.awaiting.listen?.includes(meant.id));
    // She described a problem instead of answering: deal with it now, then come back to where she was.
    if (meant && !meant.id.startsWith('question:') && !stepListens) {
      return asideTurn(user, beginAside(cfg.ix, chosen, conv?.session.profile ?? user.profile!, cfg.today(), meant.id, meant.sure, meant.details));
    }
    if (!conv) {
      // Between sessions she can still ask a question and get its card, without a new session starting.
      const hinted = meant ? cfg.ix.pack.questions.find((q) => `question:${q.id}` === meant.id) : undefined;
      const said = (card: string) => chosen.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card;
      const aside = askAside(cfg.ix, chosen, user.profile!, body) ?? (hinted ? { messages: [said(hinted.answer)], said: [hinted.answer] } : undefined);
      if (aside) return { parts: [...aside.messages, ui(chosen, 'again')].map((text) => ({ text, lang: chosen })), said: aside.said, ended: false };
      return finishTurn(user, begin(cfg.ix, chosen, user.profile!, cfg.today()));
    }
    return finishTurn(user, receive(cfg.ix, chosen, conv, answerOf(conv.awaiting), meant?.id, meant?.details));
  }

  /** The name of a question or problem from the pack, in her language. */
  function topic(meaning: string, l: LanguagePack): string {
    const id = meaning.slice(meaning.indexOf(':') + 1);
    const card = meaning.startsWith('sign:') ? cfg.ix.sign.get(id)?.label
      : meaning.startsWith('question:') ? cfg.ix.pack.questions.find((q) => q.id === id)?.label
      : cfg.ix.pack.complaints.find((c) => c.id === id)?.label;
    return card ? (l.translations[card]?.text ?? cfg.ix.card.get(card)?.ref ?? card) : meaning;
  }

  /** One turn of something she brought up out of turn. When it is finished she is taken back to where she was. */
  function asideTurn(user: User, turn: Turn): Reply {
    const lang = cfg.languages.find((l) => l.id === user.lang)!;
    if (!turn.ended) {
      user.aside = turn.conversation;
      cfg.store.put(user);
      return { parts: turn.messages.map((text) => ({ text, lang })), said: turn.said, ended: false };
    }
    // Only what she described is kept. This was not a weekly session and is not recorded as one.
    const complaints = turn.conversation.session.profile.complaints;
    if (user.profile) user.profile = { ...user.profile, complaints };
    if (user.conversation) user.conversation.session.profile.complaints = complaints;
    user.aside = undefined;
    cfg.store.put(user);
    const back = user.conversation ? receive(cfg.ix, lang, user.conversation, REPEAT).messages : [ui(lang, 'again')];
    return { parts: [...turn.messages, ...back].map((text) => ({ text, lang })), said: turn.said, ended: false };
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
