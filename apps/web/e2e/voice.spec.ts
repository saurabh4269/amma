import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// The speech model is fetched by ./fetch-models.sh and is not committed; without it there is no microphone button.
test.skip(!existsSync('public/models/whisper-tiny/encoder_model_quantized.onnx'), 'speech model not installed');

// A real Wolof clip is played into the browser as if it were the microphone.
const clip = resolve('../../packages/speech/test/fixtures/wolof-clip.wav');
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${clip}`] },
  permissions: ['microphone'],
});

/** Tap the microphone, answer the one-time question about online help if it comes up, and let the clip play. */
async function speak(page: import('@playwright/test').Page, consent?: 'yes' | 'no') {
  await page.getByRole('button', { name: /Tap and speak/ }).click();
  if (consent) await page.locator(`.online-${consent}`).click();
  await expect(page.locator('.mic.recording')).toContainText('Listening');
  await page.waitForTimeout(2500);
  // It stops by itself when she goes quiet; if the clip is still talking, she taps.
  await page.locator('.mic.recording').click({ timeout: 2000 }).catch(() => undefined);
}

test('the phone learns her words from her own correction, and after that asks before believing itself', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('voice');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Which signs mean you must go to the hospital straight away?')).toBeVisible();

  // First time: nothing to compare with, so it does not guess. The pictures open and her tap labels what she said.
  await speak(page, 'no');
  await expect(page.locator('.tile').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Did you say:')).toHaveCount(0);
  await page.locator('.tile', { hasText: 'High fever' }).click();

  // Second time: it has one example. It plays its guess back as a question; it does not accept it by itself.
  await speak(page);
  await expect(page.getByText('Did you say:')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.said')).toContainText('High fever');
  await page.locator('.opt-yes').click();
  await expect(page.getByText('Is there another one?')).toBeVisible();
});

test('"teach the phone my voice" stores an example per sign, which the session then uses', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('teach');
  await page.locator('button.primary').click();
  await page.getByText('Teach the phone my voice').click();
  const sign = page.locator('.teach', { hasText: 'Bleeding during pregnancy' });
  await expect(sign).toContainText('× 0');
  await sign.click();
  await page.waitForTimeout(2500);
  await sign.click();
  await expect(sign).toContainText('× 1', { timeout: 30_000 });

  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await speak(page, 'no');
  await expect(page.getByText('Did you say:')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.said')).toContainText('Bleeding during pregnancy');
});

test('online listening: asked first, then free speech is understood, shown back, and remembered for offline', async ({ page }) => {
  let calls = 0;
  await page.route(/onrender\.com\/health/, (r) => r.fulfill({ json: { ok: true } }));
  await page.route(/onrender\.com\/advise/, (r) => r.fulfill({ json: { text: null }, headers: { 'access-control-allow-origin': '*' } }));
  await page.route(/onrender\.com\/stt/, (r) => {
    calls += 1;
    return r.fulfill({ json: { text: 'since yesterday I have a high fever' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('online');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();

  // She is asked once, on her first tap of the microphone. Nothing is sent until she has agreed.
  await expect(page.locator('.online-ask')).toHaveCount(0);
  await speak(page, 'no');
  await expect(page.locator('.tile').first()).toBeVisible({ timeout: 30_000 }); // the phone alone could not tell
  expect(calls).toBe(0);

  await page.locator('.online-toggle').click();
  await speak(page);
  await expect(page.locator('.heard')).toContainText('since yesterday I have a high fever', { timeout: 30_000 });
  await expect(page.getByText('Is there another one?')).toBeVisible();
  expect(calls).toBe(1);

  // Turned off again: the next recording stays on the phone, which has now learnt this phrase from her.
  await page.locator('.online-toggle').click();
  await speak(page);
  await expect(page.getByText('Did you say:')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.said')).toContainText('High fever');
  expect(calls).toBe(1);
});

test('words the phrase list does not know: the model suggests, and it only counts once she says yes', async ({ page }) => {
  const asked: { text: string; expect: string[] }[] = [];
  await page.route(/onrender\.com\/health/, (r) => r.fulfill({ json: { ok: true } }));
  await page.route(/onrender\.com\/advise/, (r) => r.fulfill({ json: { text: null }, headers: { 'access-control-allow-origin': '*' } }));
  await page.route(/onrender\.com\/stt/, (r) => r.fulfill({ json: { text: 'my skull has been throbbing since morning' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.route(/onrender\.com\/match/, async (r) => {
    asked.push(r.request().postDataJSON() as { text: string; expect: string[] });
    await r.fulfill({ json: { meaning: 'sign:headache' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('model');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();

  // The consent names both services before anything is sent.
  await page.getByRole('button', { name: /Tap and speak/ }).click();
  await expect(page.locator('.online-ask')).toContainText('OpenAI');
  await expect(page.locator('.online-ask')).toContainText('ElevenLabs');
  await page.locator('.online-yes').click();
  await page.waitForTimeout(2500);
  await page.locator('.mic.recording').click({ timeout: 2000 }).catch(() => undefined);
  await expect(page.locator('.heard')).toContainText('my skull has been throbbing', { timeout: 30_000 });
  await expect(page.getByText('Did you say:')).toBeVisible();
  await expect(page.locator('.said')).toContainText('Headache and blurring of vision');
  expect(asked[0]!.text).toBe('my skull has been throbbing since morning');
  expect(asked[0]!.expect).toContain('sign:headache');

  // She says no: it is not counted, and she is asked again.
  await page.locator('.opt-no').click();
  await expect(page.getByText('Is there another one?')).toBeVisible();
  await page.getByRole('button', { name: 'That is all' }).click();
  await expect(page.locator('.said')).toContainText('Headache and blurring of vision are danger signs'); // replayed as missed
});
