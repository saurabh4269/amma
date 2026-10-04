import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio signs each webhook: HMAC-SHA1 over the full URL followed by every
 * POST parameter name and value, sorted by name, keyed with the account's auth token.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function validSignature(authToken: string, url: string, params: Record<string, string>, given: string | undefined): boolean {
  if (!given) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The reply Twilio expects: one <Message> per text to send back. */
export function twiml(messages: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${messages.map((m) => `<Message>${escapeXml(m)}</Message>`).join('')}</Response>`;
}

export interface Spoken {
  text: string;
  /** Speech locale such as `hi-IN`. */
  locale: string;
}

/**
 * The reply for a phone call: speak each part, then wait for a key press or for speech.
 * If the caller stays silent the call comes back to the same address, which repeats the question.
 */
export function voiceTwiml(parts: Spoken[], opts: { action: string; listenLocale: string; hangup: boolean }): string {
  const says = parts.map((p) => `<Say language="${p.locale}">${escapeXml(p.text)}</Say>`).join('');
  if (opts.hangup) return `<?xml version="1.0" encoding="UTF-8"?><Response>${says}<Hangup/></Response>`;
  const action = escapeXml(opts.action);
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Gather input="dtmf speech" language="${opts.listenLocale}" action="${action}" method="POST" timeout="7" speechTimeout="auto" finishOnKey="#">${says}</Gather>` +
    `<Redirect method="POST">${action}</Redirect></Response>`
  );
}
