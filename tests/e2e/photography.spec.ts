import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

test('photography queue is accessible and shows grid', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const nav = page.getByRole('navigation');
  const gridResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('queries.grid') && response.url().includes('photography')
  );
  await nav.getByRole('button', { name: /Photography/ }).click();
  const gridResponse = await gridResponsePromise;
  expect(gridResponse.ok()).toBe(true);

  await expect(page.getByRole('heading', { name: 'Photography Queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Photography Queue \d+ row/ })).toBeVisible();
  await expect(
    page.locator('.ag-root:visible').first().or(page.getByRole('heading', { name: 'No rows yet' }))
  ).toBeVisible();
});

test('mobile upload route is reachable and shows upload UI', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();

  await page.goto('/photography/mobile/batch-1');
  await expect(page.getByRole('heading', { name: 'Mobile Media Upload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take Photo/Video' })).toBeVisible();
});
