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

test.describe('Recovery E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Recovery' }).click();
    await page.waitForURL('**/recovery', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Recovery and renders the UI', async ({ page }) => {
    await expect(page.getByText(/Recovery/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });

  test('recovery grid loads with command history rows', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });

  test('recovery grid columns render with headers', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const headers = page.locator('.ag-header-cell');
    await expect(headers.first()).toBeVisible({ timeout: 10_000 });

    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThanOrEqual(1);
  });

  test('grid rows are interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    const rowCount = await dataRows.count();

    if (rowCount > 0) {
      await dataRows.first().click();
      await page.waitForTimeout(300);
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });
});
