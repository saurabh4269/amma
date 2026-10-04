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

async function speak(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Tap and speak/ }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Tap when you have finished/ }).click();
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
  await speak(page);
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
  await speak(page);
  await expect(page.getByText('Did you say:')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.said')).toContainText('Bleeding during pregnancy');
});
