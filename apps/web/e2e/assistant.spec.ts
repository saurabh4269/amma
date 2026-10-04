import { expect, test } from '@playwright/test';

test('the microphone is on the home screen and answers a question without any record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask AMMA' }).click();
  await expect(page.getByText('Is there anything you want to ask')).toBeVisible();
  // Typing is behind the keyboard button when the microphone works, and already open when it does not.
  await page.locator('.dock .side, input[name=said]').first().waitFor();
  if (!(await page.locator('input[name=said]').isVisible())) await page.locator('.dock .side').first().click();
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

test('a problem she describes when asked something else is taken up by the assistant, then she is back where she was', async ({ page }) => {
  await page.route(/onrender\.com\/health/, (r) => r.fulfill({ json: { ok: true } }));
  await page.route(/onrender\.com\/match/, (r) => r.fulfill({ json: { meaning: 'complaint:pain' }, headers: { 'access-control-allow-origin': '*' } }));
  const advised: unknown[] = [];
  await page.route(/onrender\.com\/advise/, async (r) => {
    advised.push(r.request().postDataJSON());
    await r.fulfill({ json: { text: 'Rest when you can. Tell your health worker about it.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.addInitScript(() => localStorage.setItem('amma.onlineHelp.v3', 'yes'));
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('elsewhere');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Which signs mean you must go to the hospital straight away?')).toBeVisible();

  // Asked to name a danger sign, she says what is wrong with her instead.
  await page.locator('.dock .side, input[name=said]').first().waitFor();
  if (!(await page.locator('input[name=said]').isVisible())) await page.locator('.dock .side').first().click();
  await page.locator('input[name=said]').fill('my back has been aching for days');
  await page.getByRole('button', { name: 'Send' }).click();

  // The assistant opens on it and asks about it; she confirms the whole of it in the summary at the end.
  await expect(page.locator('.top-title')).toBeVisible();
  await expect(page.getByText('Where is the pain?')).toBeVisible();

  // The booklet has no card for back pain. A general answer is shown, set apart and under its caution.
  await page.getByRole('button', { name: 'in the back' }).click();
  await page.getByRole('button', { name: 'mild' }).click();
  await page.getByRole('button', { name: 'since today' }).click();
  await page.locator('.opt-yes').last().click(); // "Is this right?"
  await expect(page.locator('.said').last()).toContainText('I have written this on your card');
  await expect(page.locator('.advice-caution')).toContainText('written by an AI');
  await expect(page.locator('.advice-text')).toContainText('Rest when you can');
  expect(advised[0]).toMatchObject({ summary: 'Pain, in the back, mild, since today', phase: 'pregnant' });
  await page.getByRole('button', { name: /Back/ }).last().click();
  await expect(page.getByText('Which signs mean you must go to the hospital straight away?')).toBeVisible();
});
