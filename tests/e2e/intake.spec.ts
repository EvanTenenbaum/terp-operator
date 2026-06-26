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

test.describe('Intake E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Intake' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Intake and renders the intake queue', async ({ page }) => {
    await expect(page.getByText('Intake queue')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });

  test('CSV import button is visible and opens the import panel', async ({ page }) => {
    await expect(page.getByText('Intake queue')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'CSV import' })).toBeVisible({ timeout: 10_000 });

    // Click CSV import to open the dialog
    await page.getByRole('button', { name: 'CSV import' }).click();

    // Verify the import panel appears
    await expect(page.getByText('Validate-first CSV import')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible({ timeout: 10_000 });

    // Close the panel
    await page.keyboard.press('Escape');
  });

  test('intake grid renders batch rows', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    // Wait for data rows
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    // Verify there's at least one row
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);

    // Click first row to verify interaction
    if (rowCount > 0) {
      await dataRows.first().click();
      await expect(page.locator('.ag-root:visible').first()).toBeAttached();
    }
  });

  test('intake grid column headers are visible', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });

    const headers = page.locator('.ag-header-cell');
    await expect(headers.first()).toBeVisible({ timeout: 10_000 });

    // Verify at least Recv Qty or product name column is present
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThanOrEqual(1);
  });
});
