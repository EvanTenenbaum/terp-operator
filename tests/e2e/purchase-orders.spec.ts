import { test, expect } from '@playwright/test';

// Polyfill crypto.randomUUID for non-secure HTTP contexts (e.g. Tailscale).
// Must run via addInitScript BEFORE the page loads any JS modules, because
// ag-grid-enterprise and other deps call crypto.randomUUID() at import time.
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

test.describe('Purchase Orders E2E', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await setupPage(page);
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Purchase Orders' }).click();
    await page.waitForURL('**/purchaseOrders', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Purchase Orders and renders the grid', async ({ page }) => {
    await expect(page.getByText('Purchase Orders').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
  });

  test('clicking a PO row opens the detail slideover', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });

    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    await dataRows.first().click();

    const slideover = page.getByRole('dialog');
    await expect(slideover).toBeVisible({ timeout: 10_000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(slideover).not.toBeVisible({ timeout: 5_000 });
  });

  test('New PO button opens the create workspace', async ({ page }) => {
    const newPoBtn = page.getByRole('main').getByRole('button', { name: 'New PO' });
    await expect(newPoBtn).toBeVisible({ timeout: 10_000 });
    await newPoBtn.click();

    await expect(page.getByText('New PO lines').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Add line row/ })).toBeVisible();
  });

  test('grid rows are keyboard-navigable', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeAttached({ timeout: 15_000 });
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    await dataRows.first().click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
