import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The facility lists are built locally from the data handover (`pnpm places`); without them this file has nothing to test.
test.skip(!existsSync('public/packs/places.json'), 'place packs not built');

async function toHospitalStep(page: Page) {
  await page.goto('/');
  await page.locator('button.big.ghost').click();
  await page.locator('input[name=label]').fill('place');
  await page.locator('button.primary').click();
  await page.getByText('Start this week’s session').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Which hospital will you go to?')).toBeVisible();
}

test('near Bansang, The Gambia: offers nearby places and the nearest listed hospital, and saves the choice with its distance', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 13.46, longitude: -14.70 });
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  const hospital = page.locator('.place', { hasText: 'Nearest hospital on the official list' });
  await expect(hospital).toContainText('Bansang Hospital');
  await expect(hospital).toContainText('straight line');
  await hospital.click();
  await expect(page.getByText('How will you get there?')).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.plan')).toContainText('Bansang Hospital');
  await expect(page.locator('.plan')).toContainText('km');
});

test('in Mumbai: offers nearby places from the public map and does not claim an official hospital', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 19.07, longitude: 72.87 });
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  await expect(page.locator('.place').first()).toContainText('from a public map, not an official list');
  await expect(page.getByText('Nearest hospital on the official list')).toHaveCount(0);
});

test('where no list is installed, it says so and lets her type', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 28.61, longitude: 77.21 }); // Delhi: outside every installed list
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  await expect(page.getByText('No facility list is installed for where you are')).toBeVisible();
  await page.locator('input[name=name]').fill('District Hospital');
  await page.locator('button.primary').click();
  await expect(page.getByText('How will you get there?')).toBeVisible();
});
