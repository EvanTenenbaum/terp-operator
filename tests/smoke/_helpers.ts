import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

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
 * Credentials come from env vars so CI can rotate them via secrets.
 * After this resolves the authenticated shell ('Owner Daily Decision View') is visible.
 *
 * Note: 45s login wait is intentional. Dev server (Vite HMR) is slow; staging
 * production build is much faster. Set your test.setTimeout accordingly (90s+).
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible({ timeout: 45_000 });
}
