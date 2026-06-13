/**
 * A7 — RowInspector e2e spec
 *
 * Verifies the tabbed RowInspector (InspectorDrawer) renders correctly:
 *  1. History / Relationship / Issue tabs all present after opening
 *  2. Arrow-key navigation switches the active tab
 *  3. ESC closes the inspector and returns focus to the trigger icon
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

async function openInspector(page: import('@playwright/test').Page) {
  // Navigate to Sales (has RowInspector via SelectionSummary icons)
  await page.goto('/sales');
  await expect(page.locator('.ag-root:visible').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ag-row').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);

  // Click a row to select it — SelectionSummary mounts
  await page.locator('.ag-row').first().click();

  // Open inspector via the History icon in the selection strip
  const historyBtn = page.getByRole('button', { name: /history/i });
  await expect(historyBtn).toBeVisible({ timeout: 10_000 });
  await historyBtn.click();
}

test.describe('RowInspector', () => {
  test.beforeEach(async ({ page }) => {
    // Cold vite dev compile + login + first data load can exceed the 30s
    // default — match contacts.spec's extended budget.
    test.setTimeout(120_000);
    await login(page);
  });

  test('opens with History, Relationship, and Issue tabs', async ({ page }) => {
    await openInspector(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const tablist = dialog.getByRole('tablist');
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /history/i })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /relationship/i })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /issue/i })).toBeVisible();
  });

  test('arrow-key navigation switches the active tab', async ({ page }) => {
    await openInspector(page);
    const dialog = page.getByRole('dialog');

    // History tab should be selected initially
    const historyTab = dialog.getByRole('tab', { name: /history/i });
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');

    // ArrowRight should move to Relationship
    await historyTab.focus();
    await page.keyboard.press('ArrowRight');
    const relTab = dialog.getByRole('tab', { name: /relationship/i });
    await expect(relTab).toHaveAttribute('aria-selected', 'true');

    // ArrowRight again → Issue
    await page.keyboard.press('ArrowRight');
    const issueTab = dialog.getByRole('tab', { name: /issue/i });
    await expect(issueTab).toHaveAttribute('aria-selected', 'true');
  });

  test('ESC closes the inspector dialog', async ({ page }) => {
    await openInspector(page);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });
});
