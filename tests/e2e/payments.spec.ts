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

test.describe('Payments E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /Payments/ }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Payments and renders the transaction ledger', async ({ page }) => {
    await expect(page.getByText('Transaction Ledger')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Payments \d+ row/ })).toBeVisible({ timeout: 15_000 });
  });

  test('Receiving and Paying tabs are both accessible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Receiving', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Paying', exact: true })).toBeVisible({ timeout: 10_000 });

    // Verify Receiving tab is active by default
    await expect(page.getByRole('button', { name: 'Receiving Ledger' })).toBeVisible({ timeout: 10_000 });

    // Switch to Paying tab
    await page.getByRole('button', { name: 'Paying', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Paying Ledger' })).toBeVisible({ timeout: 10_000 });

    // Switch back to Receiving
    await page.getByRole('button', { name: 'Receiving', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Receiving Ledger' })).toBeVisible({ timeout: 10_000 });
  });

  test('Product payment section renders properly', async ({ page }) => {
    await expect(page.getByText('Product payment').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Payment allocations')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Unallocate' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Apply Early Pay Discount' })).toBeVisible({ timeout: 10_000 });
  });

  test('Payment type buttons are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Types' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('columnheader', { name: 'PO / FIFO / target' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 10_000 });
  });

  test('grid rows are interactive', async ({ page }) => {
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
    const dataRows = page.locator('.ag-row:not(.ag-header-row)');
    await expect(dataRows.first()).toBeVisible({ timeout: 15_000 });

    await dataRows.first().click();
    await expect(page.locator('.ag-root:visible').first()).toBeAttached();
  });
});
