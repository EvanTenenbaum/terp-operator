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

    // Register pageerror listener BEFORE navigation — errors during initial
    // load are captured from the first byte, not just after the await chain.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // Either the login form or authenticated nav must be visible — not a crash/blank screen
    await expect(
      page.locator('input[type="email"], [role="navigation"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // M7 FIX: use load state + brief buffer instead of a fixed 1.5s wait.
    // waitForLoadState('load') fires after the main document and synchronous
    // resources finish loading. We explicitly avoid 'networkidle' because
    // socket.io connections keep the network permanently non-idle.
    // The 1.5s wait after load gives async React/tRPC chunks time to evaluate
    // and throw any runtime errors before we check the error array.
    await page.waitForLoadState('load');
    await page.waitForTimeout(1_500);
    expect(errors, `Unexpected JS errors on load: ${errors.join('; ')}`).toHaveLength(0);
  });
});
