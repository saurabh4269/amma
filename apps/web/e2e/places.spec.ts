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
  // The plan keeps where the hospital is, so the phone's map can lead her there.
  await expect(page.locator('.plan a.directions').first()).toHaveAttribute('href', /maps\/dir\/\?api=1&destination=13\.\d+,-14\.\d+/);
});

test('in Mumbai: offers nearby places from the public map and does not claim an official hospital', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 19.07, longitude: 72.87 });
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  await expect(page.locator('.place').first()).toContainText('from a public map, not an official list');
  await expect(page.getByText('Nearest hospital on the official list')).toHaveCount(0);
});

const overpass = /overpass|maps\.mail\.ru/;

test('where no list is installed, it looks on the public map while online', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 28.61, longitude: 77.21 }); // Delhi: outside every installed list
  await page.route(overpass, (route) =>
    route.fulfill({ json: { elements: [
      { type: 'node', id: 1, lat: 28.64, lon: 77.22, tags: { amenity: 'clinic', name: 'Far Clinic' } },
      { type: 'way', id: 2, center: { lat: 28.612, lon: 77.212 }, tags: { amenity: 'hospital', name: 'Near Hospital', phone: '011-000' } },
      { type: 'node', id: 3, lat: 28.6, lon: 77.2, tags: { amenity: 'doctors' } }, // no name: left out
    ] } }));
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  const first = page.locator('.place').first();
  await expect(first).toContainText('Near Hospital');
  await expect(first).toContainText('from a public map, not an official list');
  await expect(page.locator('.place')).toHaveCount(2);
  await first.click();
  await expect(page.getByText('How will you get there?')).toBeVisible();
});

test('when nothing is found anywhere, it says so and she can still type the name', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 28.61, longitude: 77.21 });
  await page.route(overpass, (route) => route.abort());
  await toHospitalStep(page);
  await page.getByRole('button', { name: /Find places near me/ }).click();
  await expect(page.getByText('No place was found near you')).toBeVisible({ timeout: 30_000 });
  await page.locator('input[name=name]').fill('District Hospital');
  await page.locator('button.primary').click();
  await expect(page.getByText('How will you get there?')).toBeVisible();
});

test('when the phone will not share its location, she is told why and can search by name', async ({ page }) => {
  await toHospitalStep(page); // no location permission granted
  await page.getByRole('button', { name: /Find places near me/ }).click();
  await expect(page.locator('.note')).toContainText(/Location/);
  await page.locator('.place-search').fill('bansang');
  await expect(page.locator('.place', { hasText: 'Bansang Hospital' })).toBeVisible();
  await page.locator('.place', { hasText: 'Bansang Hospital' }).click();
  await expect(page.getByText('How will you get there?')).toBeVisible();
});
