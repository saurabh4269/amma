import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { Profile, type LanguagePack } from '@yaay/schema';
import type { PackIndex } from '@yaay/engine';
import { begin, receive, type Turn } from '@yaay/channel-text';
import type { Store, User } from './store.ts';
import { twiml, validSignature } from './twilio.ts';

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
}

/** Wording the server needs before any session exists. Overridable per language under `ui`. */
const SERVER_UI = {
  consent:
    'This service gives pregnancy and newborn information from official health booklets. It does not replace a health worker. It keeps your answers under this phone number and no message text. Send STOP at any time to delete everything.',
  stopped: 'Everything kept for this number has been deleted.',
  again: 'Send any message to start a new session.',
} as const;

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

    return twiml(handle(address, body));
  });

  function handle(address: string, body: string): string[] {
    const user: User = cfg.store.get(address) ?? { address, consented: false };
    const lang = cfg.languages.find((l) => l.id === user.lang);

    if (STOP.test(body)) {
      cfg.store.forget(address);
      return [ui(lang, 'stopped')];
    }

    // First contact: say what this is and what is kept. Choosing a language is the consent.
    if (!user.consented || !lang) {
      const picked = cfg.languages[Number(body.trim()) - 1];
      if (!picked) return [`${SERVER_UI.consent}\n\n${languageMenu()}`];
      user.lang = picked.id;
      user.consented = true;
      user.profile = Profile.parse({ id: address, label: '', lang: picked.id, phase: 'pregnant' });
      return finishTurn(user, begin(cfg.ix, picked, user.profile, cfg.today()));
    }

    if (!user.conversation) {
      return finishTurn(user, begin(cfg.ix, lang, user.profile!, cfg.today()));
    }
    return finishTurn(user, receive(cfg.ix, lang, user.conversation, body));
  }

  function finishTurn(user: User, turn: Turn): string[] {
    if (turn.ended) {
      user.profile = turn.conversation.session.profile;
      user.conversation = undefined;
    } else {
      user.conversation = turn.conversation;
    }
    cfg.store.put(user);
    const lang = cfg.languages.find((l) => l.id === user.lang);
    return turn.ended ? [...turn.messages, ui(lang, 'again')] : turn.messages;
  }

  return app;
}
