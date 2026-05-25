import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// H3 FIX: credentials are NOT optional in CI. If the env vars are missing
// in a CI context, fail fast with a clear error rather than falling back to
// dev defaults, which would mask a secret misconfiguration as a login failure.
//
// In local dev (process.env.CI is unset), the hardcoded defaults are kept so
// developers can run smoke tests without setting env vars.
const IS_CI = Boolean(process.env.CI);
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL;
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD;

if (IS_CI && !TEST_EMAIL) {
  throw new Error(
    '[smoke/_helpers] PLAYWRIGHT_TEST_EMAIL is not set in CI. ' +
    'Add STAGING_TEST_EMAIL to repo secrets and inject as PLAYWRIGHT_TEST_EMAIL in the workflow.'
  );
}
if (IS_CI && !TEST_PASSWORD) {
  throw new Error(
    '[smoke/_helpers] PLAYWRIGHT_TEST_PASSWORD is not set in CI. ' +
    'Add STAGING_TEST_PASSWORD to repo secrets and inject as PLAYWRIGHT_TEST_PASSWORD in the workflow.'
  );
}

const EMAIL = TEST_EMAIL ?? 'owner@terpagro.local';
const PASSWORD = TEST_PASSWORD ?? 'terp-demo';

/**
 * Polls /api/health until the server responds ok.
 * Use at the start of any smoke spec that needs a live backend.
 */
export async function waitForBackend(page: Page): Promise<void> {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

/**
 * Navigates to / and logs in as the owner test account.
 * After this resolves the authenticated shell ('Owner Daily Decision View') is visible.
 *
 * Uses env-var credentials in CI (required — throws on missing). Falls back to
 * dev defaults locally only. Rotate via STAGING_TEST_EMAIL / STAGING_TEST_PASSWORD secrets.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 45_000 });
}
