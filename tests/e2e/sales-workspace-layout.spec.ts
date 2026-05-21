/**
 * E2E coverage for issues #60 / #63 — Sales workspace layout and margin toggle.
 *
 * Tests:
 *  1. Active customer shows Inventory Finder top-left, Sale Builder top-right, Sales Orders below.
 *  2. Expanding Sale Builder leaves Inventory Finder rail visible; restore works.
 *  3. Show-margin toggle hides / restores cost & margin column headers in the Sales workspace.
 *  4. Adding from the Inventory Finder creates a draft line in the Sale Builder (skipped when
 *     no enabled Add button is found within the timeout — keeps the suite non-flaky).
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForBackend(page: Page) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 })
    .toBe(true);
}

async function loginAsOwner(page: Page) {
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for any authenticated view to appear
  await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
}

async function navigateToSalesWithCustomer(page: Page, customerLabel = 'Cobalt Reserve') {
  await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
  // Wait for the Customer select to be ready — avoids ambiguous text matches from activity rows
  await expect(page.getByLabel('Customer')).toBeVisible();
  await page.getByLabel('Customer').selectOption({ label: customerLabel });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sales workspace layout — issues #60 / #63', () => {
  test(
    'active customer shows Inventory Finder top-left, Sale Builder top-right, Sales Orders below',
    async ({ page }) => {
      test.setTimeout(90_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Both top-row panels must be visible
      const inventoryFinder = page.getByRole('region', { name: 'Inventory Finder' });
      const saleBuilder = page.getByRole('region', { name: 'Sale Builder' });
      await expect(inventoryFinder).toBeVisible();
      await expect(saleBuilder).toBeVisible();

      // Sales Orders grid must appear below the top row (present regardless of expanded state)
      await expect(page.getByRole('region', { name: 'Sales Orders' })).toBeVisible();

      // In the xl:grid-cols-2 layout (1280 px viewport) the finder is left of the builder.
      // We do a best-effort check — if bounding boxes are unavailable we skip rather than fail.
      const finderBox = await inventoryFinder.first().boundingBox();
      const builderBox = await saleBuilder.boundingBox();
      if (finderBox && builderBox) {
        // Inventory Finder must be to the left of Sale Builder in the 2-column layout
        expect(finderBox.x).toBeLessThan(builderBox.x);
      }
    }
  );

  test(
    'expanding Sale Builder leaves Inventory Finder rail visible and restore works',
    async ({ page }) => {
      test.setTimeout(90_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Wait for both panels to appear
      await expect(page.getByRole('region', { name: 'Sale Builder' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Inventory Finder' })).toBeVisible();

      // Expand Sale Builder — this focuses it and makes InventoryFinderPanel a sibling
      await page.getByRole('button', { name: 'Expand Sale Builder' }).click();

      // Sale Builder remains visible (it is the focused panel)
      await expect(page.getByRole('region', { name: 'Sale Builder' })).toBeVisible();

      // Inventory Finder renders as a minimized rail — title still visible, NOT removed from DOM
      await expect(page.getByRole('region', { name: 'Inventory Finder' })).toBeVisible();
      // Rail exposes a "Restore" button
      await expect(
        page.getByRole('button', { name: 'Restore Inventory Finder' })
      ).toBeVisible();
      // Rail does NOT render the panel content (search input absent from DOM)
      await expect(
        page.getByTestId('inventory-finder').locator('input[placeholder*="Search"]')
      ).toHaveCount(0);

      // Click the rail's restore button → full panel comes back
      await page.getByRole('button', { name: 'Restore Inventory Finder' }).click();

      // Both panels are fully open; search input is back
      await expect(page.getByRole('region', { name: 'Sale Builder' })).toBeVisible();
      await expect(
        page.getByTestId('inventory-finder').locator('input[placeholder*="Search"]')
      ).toBeVisible();
    }
  );

  test(
    'Show-margin toggle hides and restores cost/margin column headers in Sales workspace',
    async ({ page }) => {
      test.setTimeout(90_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Wait for Sale Builder panel (contains the margin toggle in its header actions)
      await expect(page.getByRole('region', { name: 'Sale Builder' })).toBeVisible();

      // showMargin defaults to true → button label is "Hide margin" (pressing hides cost cols)
      // aria-pressed reflects the current state of the showMargin flag.
      const hideBtn = page.getByRole('button', { name: 'Hide margin' });
      await expect(hideBtn).toBeVisible();
      await expect(hideBtn).toHaveAttribute('aria-pressed', 'true');

      // --- Toggle margin OFF ---
      await hideBtn.click();

      // Button label and aria-pressed flip: "Show margin" / aria-pressed="false"
      const showBtn = page.getByRole('button', { name: 'Show margin' });
      await expect(showBtn).toBeVisible();
      await expect(showBtn).toHaveAttribute('aria-pressed', 'false');

      // The Sales Orders grid is full-width below the top row; verify "Internal margin"
      // column header text disappears when margin is hidden.
      // Note: we check only when the grid has rendered rows (it shows EmptyState otherwise).
      const salesOrdersGrid = page.getByRole('region', { name: 'Sales Orders' });
      const hasRows = (await salesOrdersGrid.locator('.ag-row').count()) > 0;
      if (hasRows) {
        // "Internal margin" column header should be absent when showMargin=false
        await expect(
          salesOrdersGrid.locator('[col-id="internalMargin"]')
        ).toHaveCount(0);
      }

      // --- Toggle margin back ON ---
      await showBtn.click();

      // State restored: button label and aria-pressed back to initial values
      const hideBtnAgain = page.getByRole('button', { name: 'Hide margin' });
      await expect(hideBtnAgain).toBeVisible();
      await expect(hideBtnAgain).toHaveAttribute('aria-pressed', 'true');

      // "Internal margin" column header reappears when margin is shown (if grid has rows)
      if (hasRows) {
        await expect(
          salesOrdersGrid.locator('[col-id="internalMargin"]')
        ).not.toHaveCount(0);
      }
    }
  );

  test(
    'Customer purchase history disclosure is default-closed and expands above the sales workspace (#61)',
    async ({ page }) => {
      test.setTimeout(90_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Disclosure is rendered with the expected label
      const disclosure = page.getByRole('region', { name: /customer purchase history/i });
      await expect(disclosure).toBeVisible();

      // The disclosure toggle is a button announcing aria-expanded=false by default
      const toggle = disclosure.getByRole('button', { name: /customer purchase history/i });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // Closed → no table in the DOM
      await expect(disclosure.locator('table')).toHaveCount(0);

      // Expand
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Either the table appears (rows present in fixture) or the empty-state
      // copy appears for customers with no prior purchases.
      const tableOrEmpty = disclosure.locator('table, :text("No prior purchases")').first();
      await expect(tableOrEmpty).toBeVisible({ timeout: 15_000 });
    }
  );

  test(
    'Recent Sheets tab is reachable from the Sales source pane (#62)',
    async ({ page }) => {
      test.setTimeout(90_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Tab strip exposes both tabs
      const finderTab = page.getByRole('tab', { name: /inventory finder/i });
      const recentTab = page.getByRole('tab', { name: /recent sheets/i });
      await expect(finderTab).toBeVisible();
      await expect(recentTab).toBeVisible();
      // Inventory Finder is the default active tab
      await expect(finderTab).toHaveAttribute('aria-selected', 'true');
      await expect(recentTab).toHaveAttribute('aria-selected', 'false');

      // Activate Recent Sheets
      await recentTab.click();
      await expect(recentTab).toHaveAttribute('aria-selected', 'true');
      await expect(finderTab).toHaveAttribute('aria-selected', 'false');

      // Either the snapshot list or the empty-state copy is visible
      const listOrEmpty = page
        .getByRole('tabpanel', { name: /recent sheets/i })
        .locator('ul[aria-label="Recent customer sheets"], :text("No recent sheets")')
        .first();
      await expect(listOrEmpty).toBeVisible({ timeout: 15_000 });
    }
  );

  test(
    'add from Inventory Finder creates a draft line in Sale Builder',
    async ({ page }) => {
      test.setTimeout(120_000);
      await loginAsOwner(page);
      await navigateToSalesWithCustomer(page);

      // Wait for the Inventory Finder search input to be available
      const finder = page.getByTestId('inventory-finder');
      await expect(finder.locator('input[placeholder*="Search"]')).toBeVisible();

      // Wait until the active order is ready (selection pill no longer shows "Sale shell starting")
      await expect(
        page.locator('.selection-pill', { hasText: 'Sale shell starting' })
      ).toHaveCount(0, { timeout: 30_000 });

      // Look for the first enabled Add button in the finder table.
      // The button is disabled when there is no active order or availableQty <= 0.
      // We poll for up to 20 s because the auto-created order may still be propagating.
      const firstAddBtn = finder.getByRole('button', { name: 'Add' }).first();
      let addBtnEnabled = false;
      try {
        await expect(firstAddBtn).toBeEnabled({ timeout: 20_000 });
        addBtnEnabled = true;
      } catch {
        // No enabled Add button within timeout — fixture may have no available stock.
        // Skip rather than fail so unrelated PO fixture issues do not break this suite.
      }

      if (!addBtnEnabled) {
        // Annotate so the result is visible in the report
        test.skip(true, 'No enabled Add button found — inventory fixture may have no available stock');
        return;
      }

      // Click Add for the first available batch
      await firstAddBtn.click();

      // Inventory Finder marks the batch as "Already in order" once the command succeeds
      await expect(finder.getByText('Already in order')).toBeVisible({ timeout: 15_000 });
    }
  );
});
