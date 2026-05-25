import { test, expect } from '@playwright/test';

test.describe('health', () => {
  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('app shell loads without JS crash', async ({ page }) => {
    test.setTimeout(30_000);

    // AQA fix: register pageerror listener BEFORE navigation so errors during
    // initial page load are captured, not just errors fired after the await chain.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // Either the login form or authenticated nav must be visible — not a crash/blank screen
    await expect(
      page.locator('input[type="email"], [role="navigation"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // Give any immediately-queued async errors a moment to propagate.
    // Note: waitForLoadState('networkidle') is intentionally NOT used here —
    // socket.io connections keep the network non-idle indefinitely, causing a hang.
    await page.waitForTimeout(1_500);
    expect(errors, `Unexpected JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
  });
});
