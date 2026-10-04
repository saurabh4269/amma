import { expect, test, type Page } from '@playwright/test';

async function addPerson(page: Page, lang: string, label: string) {
  await page.goto('/');
  await page.getByRole('combobox').selectOption(lang);
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill(label);
  await page.locator('input[name=phone]').fill('9000000001');
  await page.locator('button.primary').click();
}

test('a full session in Hindi: plan, recall, a "yes", the urgent outcome, and the clinic card', async ({ page }) => {
  await addPerson(page, 'hi', 'नूर');
  await page.getByText('इस हफ़्ते की बातचीत शुरू करें').click();

  // The plan: who decides, then skip the rest.
  await expect(page.getByText('परिवार में आपके साथ फ़ैसला कौन करता है')).toBeVisible();
  await page.locator('input[name=name]').fill('सुनीता');
  await page.locator('input[name=phone]').fill('9820000000');
  await page.locator('button.primary').click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'छोड़ें' }).click();

  // Recall: pictures stay hidden until asked for. A helper types what she said.
  await expect(page.getByText('किन लक्षणों का मतलब है')).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(0);
  await page.locator('input[name=said]').fill('खून आना');
  await page.getByRole('button', { name: 'भेजें' }).click();
  await expect(page.getByText('क्या कोई और है?')).toBeVisible();
  await page.getByRole('button', { name: 'बस इतना ही' }).click();

  // She is told the signs she missed, but not the one she said.
  await expect(page.getByText('दौरे पड़ना खतरे का लक्षण है')).toBeVisible();
  await expect(page.getByText('गर्भावस्था के दौरान खून आना खतरे का लक्षण है')).toHaveCount(0);

  // Check: nine signs. "Yes" to the fourth (headache), "no" to the rest.
  for (let i = 0; i < 9; i++) {
    await page.locator(i === 3 ? '.opt-yes' : '.opt-no').click();
  }
  await page.getByRole('button', { name: 'बस इतना ही' }).click();

  // Urgent outcome: her plan is shown and one tap calls the person in it.
  await expect(page.getByText('आपको खतरे का एक लक्षण है। तुरन्त नज़दीकी उचित अस्पताल जाएँ')).toBeVisible();
  await expect(page.getByText('आज बताए गए खतरे के लक्षणों में से कोई नहीं')).toHaveCount(0);
  await expect(page.locator('a.call')).toHaveAttribute('href', 'tel:9820000000');
  await expect(page.locator('a[href^="sms:9000000001"]')).toBeVisible();
  await page.locator('button.primary').click();

  await page.getByText('अस्पताल के लिए कार्ड').click();
  await expect(page.getByText('सिरदर्द और धुंधला दिखाई देना')).toBeVisible();
  await expect(page.getByText('1 / 11')).toBeVisible(); // recalled one of eleven taught signs
});

test('after the birth, mother and newborn signs are asked, and all "no" never says she is fine', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').selectOption('en');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('after');
  await page.getByRole('button', { name: /Baby is born/ }).click();
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'That is all' }).click();
  await expect(page.getByText('Mother: since last time, have you had excessive bleeding?')).toBeVisible();
  for (let i = 0; i < 21; i++) await page.locator('.opt-no').click();
  await page.getByRole('button', { name: 'That is all' }).click();
  await expect(page.getByText('None of the listed danger signs today.')).toBeVisible();
  await expect(page.getByText(/you are fine|healthy|nothing wrong/i)).toHaveCount(0);
});

test('a PIN-locked record cannot be opened with the wrong PIN', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('locked');
  await page.locator('input[name=pin]').fill('4321');
  await page.locator('button.primary').click();
  await expect(page.getByText('Start this week’s session')).toBeVisible(); // saved and opened
  await page.goto('/');
  await page.getByText('locked').click();
  await page.locator('input[name=pin]').fill('0000');
  await page.locator('button.primary').click();
  await expect(page.locator('.warn')).toBeVisible();
  await page.locator('input[name=pin]').fill('4321');
  await page.locator('button.primary').click();
  await expect(page.getByText('Start this week’s session')).toBeVisible();
});

test('works with no network after the first visit', async ({ page, context }) => {
  await addPerson(page, 'mr', 'ऑफलाइन');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the service worker take control of the page
  await context.setOffline(true);
  await page.reload();
  await page.getByText('ऑफलाइन').click();
  await page.getByText('या आठवड्याचे सत्र सुरू करा').click();
  await expect(page.getByText('आधी, आणीबाणीसाठी तुमची योजना करूया')).toBeVisible();
});
