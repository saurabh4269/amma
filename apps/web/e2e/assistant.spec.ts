import { expect, test } from '@playwright/test';

test('the microphone is on the home screen and answers a question without any record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask AMMA' }).click();
  await expect(page.getByText('Is there anything you want to ask')).toBeVisible();
  await page.locator('input[name=said]').fill('how do I take the iron tablets');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.said')).toContainText('Take one tablet of iron folic acid a day');
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.locator('button.big.ghost')).toBeVisible(); // back on the home screen
});

test('opened in the middle of the check, it answers and returns to the same question with nothing lost', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('mid');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'That is all' }).click();
  await page.locator('.opt-no').click(); // answered the first sign; now on the second
  await expect(page.getByText('have you been breathless')).toBeVisible();

  await page.getByRole('button', { name: 'Ask AMMA' }).click();
  await page.locator('.tile', { hasText: 'When can a doctor check me?' }).click();
  await expect(page.locator('.said').last()).toContainText('9th day of the month');
  await page.getByRole('button', { name: /Back/ }).last().click();

  await expect(page.getByText('have you been breathless')).toBeVisible(); // exactly where she was
  await page.locator('.opt-yes').click();
  for (let i = 0; i < 7; i++) await page.locator('.opt-no').click();
  await page.getByRole('button', { name: 'That is all' }).click();
  await expect(page.getByText('You have a danger sign.')).toBeVisible();
});

test('a problem described to the assistant can raise a danger sign and bring up her plan, and is kept for the clinic', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('tell');
  await page.locator('button.primary').click();
  await page.getByRole('button', { name: 'Ask AMMA' }).click();
  await page.locator('.tile', { hasText: 'Bleeding' }).click();
  await page.getByRole('button', { name: 'since today' }).click();
  await page.locator('.opt-yes').click(); // "Is this right?"
  await page.locator('.opt-yes').click(); // "Since last time, have you had any bleeding?"
  await page.getByRole('button', { name: 'That is all' }).click();
  await expect(page.locator('.said')).toContainText('You have a danger sign.');
  await page.locator('button.primary').last().click(); // Finish
  await page.getByText('Card for the clinic').click();
  await expect(page.locator('.card')).toContainText('Bleeding, since today');
  // Asking is not a weekly session.
  await expect(page.getByText('No session yet. After the first session')).toBeVisible();
});
