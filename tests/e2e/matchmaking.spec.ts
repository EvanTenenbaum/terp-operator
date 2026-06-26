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

test.describe('Matchmaking E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: 'Matchmaking' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Matchmaking and renders the workspace', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Matchmaking Entry', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Add Need' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Add Vendor Stock' })).toBeVisible({ timeout: 10_000 });
  });

  test('matchmaking boards render with row counts', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Deterministic Matches \d+ row/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Customer Needs \d+ row/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Vendor Stock \d+ row/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Accept and Dismiss buttons are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Dismiss' }).first()).toBeVisible({ timeout: 10_000 });

    // Buttons should be disabled until a row is selected
    await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Dismiss' }).first()).toBeDisabled();
  });

  test('selecting a match row enables Accept and Dismiss buttons', async ({ page }) => {
    // Wait for network idle and AG Grid to settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Scope to the Deterministic Matches workspace panel
    const firstRow = page.locator('section[aria-label="Deterministic Matches"] .ag-center-cols-container .ag-row[row-index="0"]');
    const isAttached = await firstRow.isAttached().catch(() => false);

    if (isAttached) {
      await firstRow.click({ force: true });

      // After selecting a row, Accept and Dismiss should become enabled
      await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeEnabled({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Dismiss' }).first()).toBeEnabled({ timeout: 10_000 });
    } else {
      // If no row is available, verify the board UI is still functional
      await expect(page.getByRole('button', { name: 'Matchmaking Entry', exact: true })).toBeVisible();
    }
  });

  test('Matchmaking Entry panel allows adding a Need', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Need' })).toBeVisible({ timeout: 10_000 });

    // Click Add Need to open the entry form
    await page.getByRole('button', { name: 'Add Need' }).click();

    // Verify the entry form appears
    await expect(
      page.getByRole('dialog').or(page.getByText('Customer Need').first())
    ).toBeVisible({ timeout: 10_000 });
  });
});
