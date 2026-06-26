import { test, expect } from '@playwright/test';

async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (typeof crypto !== 'undefined' && !(crypto as Record<string, unknown>).randomUUID) {
      (crypto as Record<string, unknown>).randomUUID = function randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };
    }
  });
}

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

async function loginAsOwner(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.describe('Sales Build E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
  });

  test('Sales Browse mode renders the Sales Orders region and grid', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForURL('**/sales', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });

  test('New Sale and Sale tray buttons are visible', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForURL('**/sales', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'New Sale' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Sale tray' })).toBeVisible({ timeout: 15_000 });
  });

  test('Sales view grid renders data rows', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForURL('**/sales', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 20_000 });

    await dataRows.first().click();
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
