import { describe, expect, it } from 'vitest';
import { indexPack } from '@yaay/engine';
import { referenceLanguage } from '@yaay/pack-tools';
import { fixture } from '../../../packages/engine/test/fixture.ts';
import { buildApp } from '../src/app.ts';
import { SqliteStore } from '../src/store.ts';
import { twilioSignature } from '../src/twilio.ts';

const TOKEN = 'test-token';
const URL = 'https://example.org';

function server() {
  const store = new SqliteStore(':memory:');
  const app = buildApp({
    ix: indexPack(fixture),
    languages: [referenceLanguage(fixture, 'English')],
    store,
    authToken: TOKEN,
    publicUrl: URL,
    today: () => '2026-10-04',
    ratePerMinute: 100,
  });
  app.log.level = 'silent';
  let n = 0;
  const send = async (body: string, over: { from?: string; sid?: string; signature?: string } = {}) => {
    const params = { From: over.from ?? 'whatsapp:+910000000001', Body: body, MessageSid: over.sid ?? `SM${++n}` };
    const res = await app.inject({
      method: 'POST',
      url: '/twilio/message',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': over.signature ?? twilioSignature(TOKEN, `${URL}/twilio/message`, params) },
      payload: new URLSearchParams(params).toString(),
    });
    return { status: res.statusCode, xml: res.body };
  };
  return { store, send };
}

describe('message webhook', () => {
  it('rejects a request that Twilio did not sign', async () => {
    const { send } = server();
    expect((await send('hi', { signature: 'forged' })).status).toBe(403);
  });

  it('explains itself and what it keeps before anything else', async () => {
    const { send, store } = server();
    const first = await send('hello');
    expect(first.xml).toContain('STOP');
    expect(first.xml).toContain('1. English');
    expect(store.get('whatsapp:+910000000001')).toBeUndefined();
  });

  it('runs a session to an urgent outcome and keeps the record but no conversation', async () => {
    const { send, store } = server();
    for (const m of ['hi', '1', 'Asha Tai 9820000000', '0', '1', '2', '1', '2']) await send(m);
    const last = await send('1');
    expect(last.xml).toContain('out_urgent');
    expect(last.xml).toContain('Asha Tai: 9820000000');
    const user = store.get('whatsapp:+910000000001')!;
    expect(user.conversation).toBeUndefined();
    expect(user.profile?.sessions).toHaveLength(1);
    expect(user.profile?.sessions[0]?.level).toBe('urgent');
    expect(JSON.stringify(user)).not.toContain('"hi"');
  });

  it('ignores a repeated delivery of the same message', async () => {
    const { send, store } = server();
    await send('hi');
    await send('1', { sid: 'SMsame' });
    const before = JSON.stringify(store.get('whatsapp:+910000000001'));
    const again = await send('1', { sid: 'SMsame' });
    expect(again.xml).not.toContain('<Message>');
    expect(JSON.stringify(store.get('whatsapp:+910000000001'))).toBe(before);
  });

  it('STOP deletes everything held for the number', async () => {
    const { send, store } = server();
    await send('hi');
    await send('1');
    expect(store.get('whatsapp:+910000000001')).toBeDefined();
    const res = await send('STOP');
    expect(res.xml).toContain('deleted');
    expect(store.get('whatsapp:+910000000001')).toBeUndefined();
  });

  it('keeps two numbers apart', async () => {
    const { send, store } = server();
    await send('hi', { from: '+2210000001' });
    await send('1', { from: '+2210000001' });
    expect(store.get('+2210000001')?.consented).toBe(true);
    expect(store.get('+2210000002')).toBeUndefined();
  });
});
