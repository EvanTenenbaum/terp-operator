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

test.describe('Purchase Orders E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Purchase Orders' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Purchase Orders and renders the grid', async ({ page }) => {
    await expect(page.getByText('Purchase Orders').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Recent purchase orders \d+ row/ })).toBeVisible({ timeout: 15_000 });
  });

  test('clicking a PO row opens the detail slideover', async ({ page }) => {
    const grid = page.locator('.ag-root:visible').first();
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500); // let AG Grid finish rendering

    await dataRows.first().click();

    const slideover = page.getByRole('dialog');
    await expect(slideover).toBeVisible({ timeout: 10_000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(slideover).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });

  test('New PO button is visible and functional', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('button', { name: 'New PO' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('main').getByRole('button', { name: 'New PO' }).click();
    await expect(page.getByText('New PO lines').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Add line row/ })).toBeVisible();
  });

  test('grid rows are keyboard-navigable', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    await dataRows.first().click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
