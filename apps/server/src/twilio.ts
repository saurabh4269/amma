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
