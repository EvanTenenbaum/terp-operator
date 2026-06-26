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

test.describe('Sales Browse E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Sales/ }).click();
    await page.waitForURL('**/sales', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Sales Browse mode and renders the grid', async ({ page }) => {
    // Sales Browse mode is default (no ?customer param)
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });

  test('Inventory Finder is present on Sales Browse', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });

    // Wait for the sidebar panels to settle, then look for the Finder
    await page.waitForTimeout(2000);
    const finderButton = page.getByTestId('inventory-finder');
    await expect(finderButton).toBeAttached({ timeout: 15_000 });
  });

  test('Sale tray opens from a selected order row', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Sales Orders' }).first()).toBeVisible({ timeout: 15_000 });

    const saleRows = page.locator('.ag-center-cols-container .ag-row');
    await expect(saleRows.first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await saleRows.first().click();

    await expect(page.getByRole('button', { name: 'Sale tray' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Sale tray' }).click();

    // Expansion panel
    await expect(page.getByRole('button', { name: 'Reserve' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('grid rows are visible and interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    await dataRows.first().click();
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
