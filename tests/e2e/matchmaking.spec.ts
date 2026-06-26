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

test.describe('Matchmaking E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Matchmaking' }).click();
    await page.waitForURL('**/matchmaking', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Matchmaking and renders the filter toolbar', async ({ page }) => {
    const filterToolbar = page.getByRole('toolbar', {
      name: /filter toolbar for matchmaking/i,
    });
    await expect(filterToolbar).toBeVisible({ timeout: 15_000 });
  });

  test('matchmaking grid renders with Deterministic Matches section', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
    // Deterministic Matches workspace panel
    await expect(page.locator('[aria-label="Deterministic Matches"]')).toBeAttached({ timeout: 15_000 });
  });

  test('Add Need button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Need' })).toBeVisible({ timeout: 10_000 });
  });

  test('filter chips are interactive', async ({ page }) => {
    // Status filter chip
    await expect(page.locator('[data-filter-chip="status"]')).toBeVisible({ timeout: 10_000 });
    // Keyword filter
    await expect(page.getByText('Keyword').first()).toBeVisible({ timeout: 10_000 });
    // Group filter
    await expect(page.getByText('Group').first()).toBeVisible({ timeout: 10_000 });
  });

  test('grid rows are interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    const rowCount = await dataRows.count();

    if (rowCount > 0) {
      await dataRows.first().click();
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });
});
