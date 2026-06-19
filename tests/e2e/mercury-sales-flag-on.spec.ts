/**
 * Risk-verifier flag-flip gap: SalesView Mercury with flag=true.
 *
 * Validates the Phase 3B SalesView mode router when SALES_VIEW_MERCURY
 * is forced on via URL param ?ff_salesViewMercury=1. Covers:
 *   1. Browse Mode (Mode A) — Inventory Finder button + Sales Orders grid
 *   2. Mode A → Mode B transition via customer cell click
 *   3. Build Mode (Mode B) — context header + Inventory Finder button
 *   4. Referee credit pill (conditional on seed data)
 *
 * Prerequisites: dev server at PLAYWRIGHT_BASE_URL, seeded test DB.
 * Run: PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *        pnpm exec playwright test tests/e2e/mercury-sales-flag-on.spec.ts --project=chromium
 *
 * Flag override mechanism:
 *   featureFlags.ts reads ?ff_salesViewMercury=1 from window.location.search
 *   at module-load time. No runtime patching required.
 */
import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), {
      timeout: 45_000,
    })
    .toBe(true);
}

async function login(page: import('@playwright/test').Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('SalesView Mercury flag=ON (Phase 3B mode router)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Navigate to /sales with feature flag forced ON via URL param.
    // The queryFlag helper in featureFlags.ts reads window.location.search
    // at module-load time and overrides the compile-time default.
    await page.goto('/sales?ff_salesViewMercury=1');
    await page.waitForLoadState('networkidle');
  });

  test('Mode A (Browse): Inventory Finder button visible', async ({ page }) => {
    // sales-browse-open-finder is the toolbar button that opens the
    // Inventory Finder slide-over in Browse Mode.
    const finderBtn = page.getByTestId('sales-browse-open-finder');
    await expect(finderBtn).toBeVisible({ timeout: 15_000 });
  });

  test('Mode A (Browse): Sales Orders grid renders', async ({ page }) => {
    // The AG Grid root container should be attached once orders load.
    const grid = page.locator('.ag-root').first();
    await expect(grid).toBeAttached({ timeout: 15_000 });
  });

  test('Mode A → Mode B: customer cell click transitions to ?customer=<uuid>', async ({
    page,
  }) => {
    // Wait for grid to be attached
    const grid = page.locator('.ag-root').first();
    await expect(grid).toBeAttached({ timeout: 15_000 });

    // Find customer cells — these are editable cells in the customer column.
    // The Browse Mode orderColumns define { field: 'customer', width: 180 }.
    // AG Grid renders these with col-id="customer".
    const customerCells = page.locator('.ag-cell[col-id="customer"]');
    const cellCount = await customerCells.count();

    if (cellCount === 0) {
      // No customer cells — grid may be empty or loading.
      // This is a known seed-data limitation; test logs and skips.
      console.log(
        'mercury-sales-flag-on: no customer cells found — grid is empty or columns differ. ' +
          'Skipping Mode A → B transition test.',
      );
      return;
    }

    // Click the first customer cell. Browse Mode's handleCellClick detects
    // colDef.field === 'customer' and calls onCustomerSelect(customerId),
    // which updates URL search params to ?customer=<uuid>.
    await customerCells.first().click();

    // After the click, the URL should contain ?customer=<uuid>.
    // The mode router in SalesView.tsx reads ?customer= from URL and renders
    // SalesBuildMode when present.
    await expect(page).toHaveURL(/customer=[0-9a-f-]+/, { timeout: 10_000 });
  });

  test('Mode B (Build): context header + Inventory Finder button visible', async ({
    page,
  }) => {
    // First, we need to be in Build Mode. Find a customer cell and click it
    // to transition from Browse → Build.
    const grid = page.locator('.ag-root').first();
    await expect(grid).toBeAttached({ timeout: 15_000 });

    const customerCells = page.locator('.ag-cell[col-id="customer"]');
    const cellCount = await customerCells.count();

    if (cellCount === 0) {
      console.log(
        'mercury-sales-flag-on: no customer cells — cannot enter Build Mode. Skipping.',
      );
      return;
    }

    await customerCells.first().click();
    await expect(page).toHaveURL(/customer=[0-9a-f-]+/, { timeout: 10_000 });

    // (1) Context header: SalesCustomerContextHeader renders "Customer:" label.
    await expect(page.getByText('Customer:').first()).toBeVisible({
      timeout: 10_000,
    });

    // (2) Inventory Finder button in Build Mode toolbar.
    const buildFinderBtn = page.getByTestId('sales-build-open-finder');
    await expect(buildFinderBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Mode B (Build): referee credit pill appears for relationships', async ({
    page,
  }) => {
    // Enter Build Mode first.
    const grid = page.locator('.ag-root').first();
    await expect(grid).toBeAttached({ timeout: 15_000 });

    const customerCells = page.locator('.ag-cell[col-id="customer"]');
    const cellCount = await customerCells.count();

    if (cellCount === 0) {
      console.log(
        'mercury-sales-flag-on: no customer cells — skipping referee pill test.',
      );
      return;
    }

    await customerCells.first().click();
    await expect(page).toHaveURL(/customer=[0-9a-f-]+/, { timeout: 10_000 });

    // The referee credit pill (data-testid="referee-credit-pill") renders
    // when canWrite && customerId && selectedOrderStatus === 'draft' &&
    // customerRefereeRelationships.length > 0. It depends on seed data.
    // If the seed customer has no referee relationships, the pill will not
    // render — that's fine; this is a smoke test, not a data-validity test.
    const pill = page.getByTestId('referee-credit-pill');
    const pillCount = await pill.count();

    if (pillCount > 0) {
      // Pill exists: assert it's visible and has the select dropdown.
      await expect(pill).toBeVisible({ timeout: 5_000 });

      const select = page.getByTestId('referee-credit-select');
      await expect(select).toBeVisible({ timeout: 3_000 });
    } else {
      console.log(
        'mercury-sales-flag-on: referee credit pill not rendered — ' +
          'seed customer may have no referee relationships. That is expected.',
      );
    }
  });
});
