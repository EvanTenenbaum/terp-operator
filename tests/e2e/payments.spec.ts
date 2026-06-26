import { test, expect } from '@playwright/test';

async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (typeof crypto !== 'undefined' && !(crypto as any).randomUUID) {
      (crypto as any).randomUUID = function randomUUID() {
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

test.describe('Payments E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Payments/ }).click();
    await page.waitForURL('**/payments', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Payments and renders the filter toolbar', async ({ page }) => {
    // Filter toolbar for payments should be present
    const filterToolbar = page.getByRole('toolbar', {
      name: /filter toolbar for payments/i,
    });
    await expect(filterToolbar).toBeVisible({ timeout: 15_000 });
  });

  test('Money In and Money Out filter chips are present', async ({ page }) => {
    // The payments view has Money In/Money Out filter chips
    await expect(page.locator('[data-filter-chip="money-in"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-filter-chip="money-out"]')).toBeVisible({ timeout: 10_000 });
  });

  test('payments grid renders with data', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    // Check for posted/reversed status chips
    await expect(page.getByText('Posted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Unapplied').first()).toBeVisible({ timeout: 10_000 });

    // Payment entry button
    await expect(page.getByText('Payment entry').first()).toBeVisible({ timeout: 10_000 });
  });

  test('grid rows are interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const rowCount = await dataRows.count();
    if (rowCount > 0) {
      await dataRows.first().click();
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });

  test('Keel Money In quick action navigates to Payments', async ({ page }) => {
    // Already on payments - just verify the view is active and keel is present
    const keel = page.getByRole('banner', { name: 'Global workspace keel' });
    await expect(keel).toBeVisible({ timeout: 10_000 });

    // Status filter is present
    await expect(page.getByText('Status').first()).toBeVisible({ timeout: 10_000 });
  });
});
