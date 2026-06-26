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

test.describe('Sales Browse E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Sales Browse mode and renders the grid', async ({ page }) => {
    // Sales Browse mode is default (no ?customer param)
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Sales Orders \d+ row/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('Inventory Finder opens from Sales Browse', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });

    // Open the Inventory Finder
    const finder = page.getByTestId('inventory-finder');
    await expect(finder.getByText('Inventory Finder')).toBeVisible({ timeout: 10_000 });

    // Verify Finder has search input
    await expect(finder.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 10_000 });

    // Type a search query
    await finder.locator('input[placeholder*="Search"]').fill('flower');
    await expect(finder.getByText(/search: flower/i)).toBeVisible({ timeout: 10_000 });

    // Verify category dropdown exists
    await expect(finder.getByLabel('Finder category')).toBeVisible();

    // Close the finder
    await page.keyboard.press('Escape');
    await expect(finder.getByText('Inventory Finder')).toBeVisible();
  });

  test('Sale tray opens from a selected order row', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });

    // Wait for grid rows
    const saleRows = page.locator('.ag-center-cols-container .ag-row');
    await expect(saleRows.first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);

    // Click a sale row
    await saleRows.first().click();

    // Sale tray button should be visible
    await expect(page.getByRole('button', { name: 'Sale tray' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Sale tray' }).click();

    // Expansion panel should show Reserve button
    await expect(page.getByRole('button', { name: 'Reserve' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('grid rows are visible and interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    // Click first row
    await dataRows.first().click();
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
