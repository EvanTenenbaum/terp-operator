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
  await nav.getByRole('button', { name: /Photography/ }).click();
  await expect(page.getByText('Photography Queue')).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();
});
