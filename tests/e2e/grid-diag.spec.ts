/**
 * Quick AG Grid rendering diagnostic — checks which views show grids on staging.
 *
 * Run:
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL="https://terp-agro-staging-5asc2.ondigitalocean.app" \
 *     npx playwright test tests/e2e/grid-diag.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000); // 2 min — hitting 6 views on staging

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'owner@terpagro.local';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'terp-demo';

// ── Login helper ──────────────────────────────────────────

async function login(page: Page) {
  console.log('[login] Navigating to / ...');
  await page.goto('/');
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForTimeout(3000);
  const navBar = page.getByRole('navigation');
  await expect(navBar).toBeVisible({ timeout: 30_000 });
  console.log('[login] Logged in\n');
}

// ── Grid inspector ────────────────────────────────────────

interface GridInfo {
  exists: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function inspectGrids(page: Page): Promise<GridInfo[]> {
  const wrappers = page.locator('.ag-root-wrapper');
  const count = await wrappers.count();
  const results: GridInfo[] = [];

  for (let i = 0; i < count; i++) {
    const box = await wrappers.nth(i).boundingBox().catch(() => null);
    results.push({
      exists: true,
      x: box?.x ?? -1,
      y: box?.y ?? -1,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    });
  }
  return results;
}

function gridReport(grids: GridInfo[]): string {
  return grids
    .map((g, i) =>
      `  Grid #${i}: exists=${g.exists} height=${g.height} width=${g.width} x=${g.x} y=${g.y}`
    )
    .join('\n');
}

// ── Navigate by URL ───────────────────────────────────────

async function navTo(page: Page, route: string) {
  console.log(`  Navigating to ${route} ...`);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // let React hydrate + AG Grid init
}

// ── Test ──────────────────────────────────────────────────

test('AG Grid rendering diagnostic — all views', async ({ page }) => {
  await login(page);

  const routes = [
    '/inventory',
    '/purchaseOrders',
    '/clients',
    '/contacts',
    '/vendors',
    '/sales',
    '/intake',
  ];

  for (const route of routes) {
    console.log(`\n━━━ ${route} ━━━`);
    await navTo(page, route);
    await page.waitForTimeout(2000);

    const grids = await inspectGrids(page);

    if (grids.length === 0) {
      console.log(`  ❌ No .ag-root-wrapper found in DOM`);
      // Dump parent chain CSS to help debug
      console.log('  Dumping main content container stack...');
      const containers = ['#root', '.app-container', 'main', '.content', '.main-content', '[class*="grid"]', '[class*="page"]'];
      for (const sel of containers) {
        const el = page.locator(sel).first();
        const count = await el.count();
        if (count > 0) {
          const box = await el.boundingBox().catch(() => null);
          console.log(`    ${sel}: box=${JSON.stringify(box)}`);
        } else {
          console.log(`    ${sel}: not found`);
        }
      }
    } else {
      console.log(`  ✅ ${grids.length} grid(s) found:`);
      console.log(gridReport(grids));
      // Flag zero-height grids
      for (let i = 0; i < grids.length; i++) {
        if (grids[i].height === 0) {
          console.log(`  ⚠️  Grid #${i} height is 0 — checking parent chain...`);
          const wrapper = page.locator('.ag-root-wrapper').nth(i);
          // Walk up 4 levels
          for (let level = 1; level <= 4; level++) {
            const parentSel = new Array(level).fill('xpath=..').join('/');
            try {
              const parentId = await wrapper.locator(parentSel).evaluate(el => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                return `tag=${htmlEl.tagName} id=${htmlEl.id} class="${htmlEl.className}" display=${style.display} height=${style.height} overflow=${style.overflow} position=${style.position}`;
              });
              console.log(`    Parent +${level}: ${parentId}`);
            } catch {
              console.log(`    Parent +${level}: (could not inspect)`);
            }
          }
        }
      }
    }
  }

  console.log('\n═══ Diagnostic complete ═══');
});
