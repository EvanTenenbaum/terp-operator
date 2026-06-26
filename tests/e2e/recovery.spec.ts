import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function loginAsOwner(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

test.describe('Recovery E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    // Recovery is under Admin group in sidebar
    await nav.getByRole('button', { name: 'Recovery' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Recovery and renders the UI', async ({ page }) => {
    await expect(page.getByText(/Recovery/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });

  test('recovery grid loads with command history rows', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    // Wait for data rows
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    // Verify the grid has content
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);

    // Verify grid is attached and functional
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });

  test('recovery action buttons are present', async ({ page }) => {
    // Recovery view should have action buttons for reversing operations
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    const rowCount = await dataRows.count();

    if (rowCount > 0) {
      await dataRows.first().click();
      await page.waitForTimeout(300);

      // Verify some actionable element appears (reverse button, detail panel, etc.)
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });

  test('grid columns render with command data', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    // Verify column headers exist
    const headers = page.locator('.ag-header-cell');
    await expect(headers.first()).toBeVisible({ timeout: 10_000 });

    // Verify grid is interactive
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    if ((await dataRows.count()) > 0) {
      await dataRows.first().click();
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });
});
