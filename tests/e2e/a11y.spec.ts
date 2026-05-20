// #34 — axe-playwright CI gate.
//
// Loads the three views with the densest set of unlabelled controls
// surfaced by the manual a11y sweep (dashboard, matchmaking, inventory)
// and asserts zero critical/serious WCAG 2.1 AA violations. This is the
// CI gate — if a regression introduces a new unlabelled input, the build
// fails here.
//
// To run locally: `pnpm exec playwright test tests/e2e/a11y.spec.ts`
// To list: `pnpm exec playwright test tests/e2e/a11y.spec.ts --list`
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/dashboard', '/matchmaking', '/inventory'] as const;

for (const route of ROUTES) {
  test(`a11y: ${route} has zero critical/serious WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(route);
    // Wait for the route to mount any AG Grid surface (best-effort — if no
    // grid renders for this view we still proceed against whatever IS in
    // the DOM).
    await page
      .waitForSelector('.ag-root, h1, [role="main"]', { timeout: 10_000 })
      .catch(() => {});

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    // Helpful failure message: dump the first few selectors so CI logs are
    // actionable.
    if (blocking.length) {
      const summary = blocking
        .map((v) => `  - [${v.impact}] ${v.id}: ${v.help}\n    nodes: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
        .join('\n');
      throw new Error(`Found ${blocking.length} blocking a11y violation(s) on ${route}:\n${summary}`);
    }
    expect(blocking).toEqual([]);
  });
}
