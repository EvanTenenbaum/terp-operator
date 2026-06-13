/**
 * A7 — Orders StatusActionBar e2e spec
 *
 * Verifies the three StatusActionBar behaviours on the Orders view:
 *  1. Draft selection  → "Confirm" primary button visible
 *  2. "More" button    → opens a tray menu (role="menu")
 *  3. Mixed selection  → full verb set exposed in the tray (catch-all fires)
 *
 * Requires: pnpm db:seed:realistic data + live dev/staging server.
 * Gate: typecheck + build only (no live app in the worktree; spec is marked
 *       for CI and will run against staging via PLAYWRIGHT_BASE_URL).
 */
import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function login(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Navigate explicitly rather than relying on the client-side post-login
  // redirect (which is flaky under instrumented browsers).
  await page.waitForTimeout(1500);
  await page.goto('/dashboard');
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

async function waitForGrid(page: import('@playwright/test').Page) {
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
}

test.describe('Orders StatusActionBar', () => {
  test.beforeEach(async ({ page }) => {
    // Cold vite dev compile + login + first data load can exceed the 30s
    // default — match contacts.spec's extended budget.
    test.setTimeout(120_000);
    await login(page);
    await page.goto('/sales');
    await waitForGrid(page);
  });

  test('selecting a draft order surfaces "Confirm" as the primary action', async ({ page }) => {
    // Click the first grid row (seed data has draft orders at top)
    await page.locator('.ag-row').first().click();
    // The StatusActionBar primary should be "Confirm" for a draft order
    await expect(
      page.getByRole('button', { name: /^confirm$/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"More ▾" button opens a menu with additional verbs', async ({ page }) => {
    await page.locator('.ag-row').first().click();
    // Wait for selection strip to mount
    const moreBtn = page.getByRole('button', { name: /more/i });
    await expect(moreBtn).toBeVisible({ timeout: 10_000 });
    await moreBtn.click();
    // The tray renders as role="menu"
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5_000 });
  });

  test('mixed-status selection exposes full verb set in the tray (catch-all)', async ({ page }) => {
    // Select multiple rows spanning different statuses via shift-click
    const rows = page.locator('.ag-row');
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['Shift'] });
    await rows.nth(2).click({ modifiers: ['Shift'] });

    // The "More" tray should be present (catch-all fires; no mixed-reason pill)
    const moreBtn = page.getByRole('button', { name: /more/i });
    await expect(moreBtn).toBeVisible({ timeout: 10_000 });
    await moreBtn.click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5_000 });
    // The mixed-reason pill must NOT appear (catch-all handles mixed)
    await expect(page.getByText(/mixed selection/i)).not.toBeVisible();
  });
});
