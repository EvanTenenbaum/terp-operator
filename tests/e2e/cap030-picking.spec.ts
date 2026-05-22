/**
 * CAP-030 Playwright smoke tests (TER-1523)
 *
 * Two lightweight checks that the CAP-030 UI surfaces render without crashing:
 *   1. SalesView — "Release for picking" button appears in the order line expansion area.
 *   2. PickView  — /pick route renders the pick queue screen for an owner user.
 *
 * These run against a live local app (`PLAYWRIGHT_SKIP_WEB_SERVER=1`).
 * Start the app first:  pnpm dev
 */

import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

async function loginAsOwner(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the dashboard to confirm login succeeded
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Smoke 1: SalesView — Release for picking button
// ---------------------------------------------------------------------------

test('SalesView: "Release for picking" button is present in line expansion', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  const nav = page.getByRole('navigation');

  // Navigate to Sales
  await nav.getByRole('button', { name: /Sales/ }).click();
  await expect(page.getByText('Sales Orders')).toBeVisible({ timeout: 15_000 });

  // Wait for the grid to load at least one row, then open the order-level panel.
  // The "Sale tray" button opens the expansion/line panel for a selected order.
  const saleRows = page.locator('.ag-center-cols-container .ag-row');
  await expect(saleRows.first()).toBeVisible({ timeout: 20_000 });
  await saleRows.first().click();

  // The line expansion panel should appear.  Give the panel time to render.
  // The "Release for picking" button is rendered for each unreleased order line.
  // We assert the text exists anywhere in the expanded area or buttons area.
  await expect(
    page.getByRole('button', { name: /Release for picking/i }).first()
      .or(page.getByText('Release for picking').first()),
  ).toBeVisible({ timeout: 20_000 });
});

// ---------------------------------------------------------------------------
// Smoke 2: PickView — /pick renders pick queue for an owner
// ---------------------------------------------------------------------------

test('PickView: /pick route renders pick queue screen for owners', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);
  await loginAsOwner(page);

  // Navigate directly to the /pick route
  await page.goto('/pick');

  // The PickView renders either:
  //   a) The "Pick Queue" heading when the queue screen is shown, OR
  //   b) A loading/empty state (QueueScreen still visible with the heading)
  // Owners are NOT redirected by the work-loop guard, so the route renders.
  await expect(
    page.getByRole('heading', { name: /Pick Queue/i })
      .or(page.getByText('Pick Queue'))
      .first(),
  ).toBeVisible({ timeout: 20_000 });
});

// ---------------------------------------------------------------------------
// Smoke 3: PickView — non-warehouse operator is redirected
// ---------------------------------------------------------------------------

test('PickView: sales-lane operator is redirected away from /pick', async ({ page }) => {
  test.setTimeout(60_000);
  await waitForBackend(page);

  // Log in as a sales operator (work_loop=sales)
  await page.goto('/');
  await page.getByLabel('Email').fill('sales@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Allow time for login
  await page.waitForURL('**', { timeout: 15_000 });

  // Navigate to /pick
  await page.goto('/pick');

  // The work-loop guard redirects to dashboard — /pick content should NOT render
  // (The redirect may go to '/' or '/sales' depending on the guard implementation)
  await expect(
    page.getByRole('heading', { name: /Pick Queue/i }),
  ).not.toBeVisible({ timeout: 10_000 });
});
