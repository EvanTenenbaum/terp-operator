/**
 * Durable E2E smoke tests for issue #64 — sale-time cost-range exceptions.
 *
 * Two suites share a session-level login but operate independently:
 *
 * Suite 1 — API-level flow (tRPC fetch helpers, no DOM interaction):
 *   a. queries.reference.availableBatches contains a batch with priceRange.
 *      Skip the whole suite gracefully when the fixture has none.
 *   b. addSalesOrderLine on that batch → salesOrderLines projection returns
 *      unitCostResolved=false and validationIssues includes "Pick landed COGS".
 *   c. setLineLandedCost in-range → unitCostResolved=true, issue cleared.
 *   d. updateSalesOrderLine to price below priceFloor; then
 *      setLineBelowFloorReason vendor_approval_pending → vendorApprovalState=pending.
 *   e. confirmSalesOrder throws with /vendor approval/i in toast.
 *   f. resolveVendorApproval approved.
 *   g. confirmSalesOrder no longer throws for vendor approval (credit-limit or
 *      guardrail failures are acceptable — only the vendor-approval block is
 *      tested here).
 *
 * Suite 2 — SalesView UI smoke (browser interaction):
 *   h. Create a fresh draft order + unresolved range line via API.
 *   i. Navigate to Sales → select customer → Sale Builder auto-selects order.
 *   j. Find "Customer Draft Lines" grid, expand the range line row via chevron.
 *   k. Fill the inline Landed COGS input (reviewer fix replaced the older
 *      window.prompt chain with an inline form: number input + basis select).
 *   l. Click "Pick COGS"; verify the row's Pick COGS control disappears once
 *      unitCostResolved=true (useCommandRunner invalidates salesOrderLines).
 *
 * vendorBills non-mutation: no vendorBill command is issued in either suite.
 * The vendor-bill non-mutation guarantee for the command-level path is already
 * pinned in src/server/services/costRangeExceptions.test.ts.
 */

import { test, expect, type Page } from '@playwright/test';
import type { CommandName } from '../../src/shared/commandCatalog';

// ---------------------------------------------------------------------------
// Helpers (mirrors adversarial-command-contracts.spec.ts patterns)
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
  // Wait for any authenticated view to appear (matches both dashboard headings)
  await page.getByText(/Daily Decision View/).waitFor({ timeout: 30_000 });
}

/** Batched tRPC GET query helper. Returns the raw response array. */
async function trpcQuery(page: Page, path: string, inputValue: unknown = null) {
  return page.evaluate(
    async ({ queryPath, queryInput }) => {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: queryInput } }));
      const response = await fetch(`/trpc/${queryPath}?batch=1&input=${input}`, {
        credentials: 'include'
      });
      return response.json();
    },
    { queryPath: path, queryInput: inputValue }
  );
}

/** Batched tRPC mutation helper. Returns { status, json } raw. */
async function runTrpcCommand(
  page: Page,
  name: CommandName,
  payload: Record<string, unknown>,
  reason = 'issue-64 E2E smoke'
) {
  return page.evaluate(
    async ({ commandName, commandPayload, commandReason }) => {
      const body = {
        0: {
          json: {
            name: commandName,
            payload: commandPayload,
            reason: commandReason,
            idempotencyKey: `${commandName}-${(crypto as { randomUUID: () => string }).randomUUID()}`
          }
        }
      };
      const response = await fetch('/trpc/commands.run?batch=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, json: await response.json() };
    },
    { commandName: name, commandPayload: payload, commandReason: reason }
  );
}

/** Extracts the CommandResult JSON from a batched tRPC mutation response. */
function commandData(response: Awaited<ReturnType<typeof runTrpcCommand>>) {
  return response.json[0]?.result?.data?.json as Record<string, unknown> | undefined;
}

// Shared fixture types used in both suites.
interface RefBatch {
  id: string;
  priceRange: string | null;
  availableQty: string;
  name: string;
  unitPrice: string;
}
interface RefCustomer {
  id: string;
  name: string;
}
interface SalesOrderLine {
  id: string;
  unitCostResolved: boolean;
  landedCostBasis: string | null;
  validationIssues: string[];
  priceFloor: string | null;
  vendorApprovalState: string;
  belowFloorReason: string | null;
  unitPrice: string;
}

// ---------------------------------------------------------------------------
// Suite 1: API-level cost-range exception flow
// ---------------------------------------------------------------------------

test.describe('issue #64: cost-range exception API flow', () => {
  /**
   * Single long test that walks the full exception lifecycle so that
   * intermediate state is shared without cross-test coupling or fixtures.
   */
  test(
    'range batch line unresolved → set COGS → vendor-approval gate → resolve → confirm unblocked',
    async ({ page }) => {
      test.setTimeout(120_000);
      await loginAsOwner(page);

      // ── Step a: discover a range-priced available batch ───────────────────
      const refResp = await trpcQuery(page, 'queries.reference');
      const refData = refResp[0]?.result?.data?.json as {
        availableBatches: RefBatch[];
        customers: RefCustomer[];
      };
      const rangeBatch = refData.availableBatches.find(
        (b) => b.priceRange && b.priceRange.includes('-') && Number(b.availableQty) >= 1
      );
      if (!rangeBatch) {
        test.skip(true, 'No range-priced posted batch with available stock — skipping #64 flow');
        return;
      }
      const customer =
        refData.customers.find((c) => c.name === 'Cobalt Reserve') ?? refData.customers[0];
      expect(customer, 'Need at least one customer in the fixture').toBeDefined();

      // ── Step b: create order + add range line ─────────────────────────────
      const createData = commandData(
        await runTrpcCommand(page, 'createSalesOrder', { customerId: customer.id })
      );
      expect(createData?.ok).toBe(true);
      const orderId = String((createData?.affectedIds as string[])[0]);

      const addData = commandData(
        await runTrpcCommand(page, 'addSalesOrderLine', {
          orderId,
          batchId: rangeBatch.id,
          qty: 1,
          unitPrice: Number(rangeBatch.unitPrice)
        })
      );
      expect(addData?.ok).toBe(true);

      // ── Step b (verify): salesOrderLines projection ───────────────────────
      const linesAfterAdd = (
        (await trpcQuery(page, 'queries.salesOrderLines', { orderId }))[0]?.result?.data?.json
      ) as SalesOrderLine[];

      expect(linesAfterAdd, 'salesOrderLines should return rows').toBeDefined();
      expect(linesAfterAdd.length).toBeGreaterThanOrEqual(1);
      const line = linesAfterAdd[0];

      // Core issue #64 invariant: range batch line starts unresolved.
      expect(line.unitCostResolved).toBe(false);
      expect(
        line.validationIssues.some((issue) => issue.includes('Pick landed COGS')),
        'validationIssues must contain "Pick landed COGS"'
      ).toBe(true);

      // ── Step c: setLineLandedCost in range ────────────────────────────────
      const [rangeLow, rangeHigh] = rangeBatch.priceRange!.split('-').map(Number);
      const inRangeCost = Math.round(((rangeLow + rangeHigh) / 2) * 100) / 100;

      const landedData = commandData(
        await runTrpcCommand(page, 'setLineLandedCost', {
          lineId: line.id,
          landedCost: inRangeCost,
          basis: 'manual'
        })
      );
      expect(landedData?.ok).toBe(true);

      // Verify projection after COGS resolution.
      const linesAfterLanded = (
        (await trpcQuery(page, 'queries.salesOrderLines', { orderId }))[0]?.result?.data?.json
      ) as SalesOrderLine[];
      const resolvedLine = linesAfterLanded.find((l) => l.id === line.id);

      expect(resolvedLine?.unitCostResolved).toBe(true);
      expect(resolvedLine?.landedCostBasis).toBe('manual');
      expect(
        (resolvedLine?.validationIssues ?? []).some((issue) => issue.includes('Pick landed COGS')),
        '"Pick landed COGS" issue must be cleared after setLineLandedCost'
      ).toBe(false);

      // ── Step d: price below floor → setLineBelowFloorReason ──────────────
      // priceFloor is the batch's unitPrice captured at line-add time.
      const priceFloor = Number(resolvedLine?.priceFloor ?? rangeBatch.unitPrice);
      const belowFloorPrice = Math.max(0.01, priceFloor - 10);

      const updateData = commandData(
        await runTrpcCommand(page, 'updateSalesOrderLine', {
          lineId: line.id,
          unitPrice: belowFloorPrice
        })
      );
      expect(updateData?.ok).toBe(true);

      const belowFloorData = commandData(
        await runTrpcCommand(page, 'setLineBelowFloorReason', {
          lineId: line.id,
          reason: 'vendor_approval_pending',
          note: 'Issue #64 E2E smoke — vendor contact required.'
        })
      );
      expect(belowFloorData?.ok).toBe(true);

      // Verify projection: vendorApprovalState=pending.
      const linesAfterBelowFloor = (
        (await trpcQuery(page, 'queries.salesOrderLines', { orderId }))[0]?.result?.data?.json
      ) as SalesOrderLine[];
      const pendingLine = linesAfterBelowFloor.find((l) => l.id === line.id);
      expect(pendingLine?.vendorApprovalState).toBe('pending');
      expect(pendingLine?.belowFloorReason).toBe('vendor_approval_pending');

      // ── Step e: confirmSalesOrder must fail with vendor approval message ──
      const confirmBlockedData = commandData(
        await runTrpcCommand(page, 'confirmSalesOrder', { orderId })
      );
      expect(confirmBlockedData?.ok).toBe(false);
      expect(
        String(confirmBlockedData?.toast ?? ''),
        'Blocked confirm must cite vendor approval'
      ).toMatch(/vendor approval/i);

      // ── Step f: resolveVendorApproval approved ───────────────────────────
      // owner role ≥ manager (roleRank: owner=3 > manager=2), so this is allowed.
      const resolveData = commandData(
        await runTrpcCommand(page, 'resolveVendorApproval', {
          lineId: line.id,
          state: 'approved'
        })
      );
      expect(resolveData?.ok).toBe(true);

      // ── Step g: confirmSalesOrder no longer blocked by vendor approval ────
      // Credit-limit or pricing-guardrail failures are acceptable — only the
      // vendor-approval block is under test here.
      const confirmUnblockedData = commandData(
        await runTrpcCommand(page, 'confirmSalesOrder', { orderId })
      );
      const unblockedToast = String(confirmUnblockedData?.toast ?? '');
      expect(
        unblockedToast,
        'After vendor approval resolved, confirm must not mention vendor approval'
      ).not.toMatch(/vendor approval/i);
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 2: SalesView "Pick COGS" UI smoke
// ---------------------------------------------------------------------------

test.describe('issue #64: SalesView Pick COGS UI smoke', () => {
  test(
    'expanding a range-line in Customer Draft Lines shows Pick COGS and fires setLineLandedCost',
    async ({ page }) => {
      test.setTimeout(120_000);
      await loginAsOwner(page);

      // ── Setup: create a fresh order with an unresolved range line via API ─
      // We go through the API so the test is self-contained and the fresh
      // draft becomes the newest, thus the auto-selected workspaceOrder.
      const refResp = await trpcQuery(page, 'queries.reference');
      const refData = refResp[0]?.result?.data?.json as {
        availableBatches: RefBatch[];
        customers: RefCustomer[];
      };
      const rangeBatch = refData.availableBatches.find(
        (b) => b.priceRange && b.priceRange.includes('-') && Number(b.availableQty) >= 1
      );
      if (!rangeBatch) {
        test.skip(true, 'No range-priced posted batch available — skipping UI smoke');
        return;
      }
      const customer =
        refData.customers.find((c) => c.name === 'Cobalt Reserve') ?? refData.customers[0];
      expect(customer, 'Need at least one customer in fixture').toBeDefined();

      const createData = commandData(
        await runTrpcCommand(page, 'createSalesOrder', { customerId: customer.id })
      );
      expect(createData?.ok).toBe(true);
      const orderId = String((createData?.affectedIds as string[])[0]);

      const addData = commandData(
        await runTrpcCommand(page, 'addSalesOrderLine', {
          orderId,
          batchId: rangeBatch.id,
          qty: 1,
          unitPrice: Number(rangeBatch.unitPrice)
        })
      );
      expect(addData?.ok).toBe(true);

      // ── Navigate to Sales → select customer ──────────────────────────────
      await page.getByRole('navigation').getByRole('button', { name: /Sales/ }).click();
      await expect(page.getByLabel('Customer')).toBeVisible({ timeout: 15_000 });
      await page.getByLabel('Customer').selectOption({ label: customer.name });

      // ── Wait for Sale Builder panel ───────────────────────────────────────
      const saleBuilder = page.getByRole('region', { name: 'Sale Builder' });
      await expect(saleBuilder).toBeVisible({ timeout: 20_000 });

      // ── Wait for Customer Draft Lines AG Grid with at least one row ───────
      // The Sale Builder contains the OperatorGrid for order lines.
      // We locate it via the first ag-root-wrapper inside the panel.
      const draftLinesGrid = saleBuilder.locator('.ag-root-wrapper').first();
      await expect(draftLinesGrid).toBeVisible({ timeout: 20_000 });

      await expect
        .poll(async () => draftLinesGrid.locator('.ag-row').count(), { timeout: 30_000 })
        .toBeGreaterThanOrEqual(1);

      // ── Find expansion chevron for the range line ─────────────────────────
      // Every line in this freshly-created order is ours; pick the first chevron.
      const chevron = draftLinesGrid.locator('.expansion-chevron-cell').first();
      await expect(chevron).toBeVisible({ timeout: 15_000 });
      await expect(chevron).toHaveAttribute('aria-expanded', 'false');

      // ── Expand row ────────────────────────────────────────────────────────
      await chevron.click();
      await expect(chevron).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 });

      // ── Locate inline exception controls (reviewer fix replaced window.prompt) ─
      const expansionPanel = draftLinesGrid.locator('.expansion-panel').first();
      await expect(expansionPanel).toBeVisible({ timeout: 10_000 });
      const landedCostInput = expansionPanel.getByLabel(/landed cogs/i).first();
      await expect(landedCostInput).toBeVisible({ timeout: 10_000 });
      const pickCogsBtn = expansionPanel.getByRole('button', { name: 'Pick COGS' });
      await expect(pickCogsBtn).toBeVisible({ timeout: 10_000 });

      // ── Fill the inline Landed COGS form with an in-range value ──────────
      const [rangeLow, rangeHigh] = rangeBatch.priceRange!.split('-').map(Number);
      const inRangeCost = String(Math.round(((rangeLow + rangeHigh) / 2) * 100) / 100);
      await landedCostInput.fill(inRangeCost);
      // Basis defaults to 'manual'; leave it alone.

      // ── Click "Pick COGS" — submits the inline form ──────────────────────
      await pickCogsBtn.click();

      // ── Verify command completed: button disappears once unitCostResolved=true ─
      // useCommandRunner calls queryClient.invalidateQueries() on success,
      // which refetches salesOrderLines and removes the button for the
      // resolved line.
      await expect(pickCogsBtn).not.toBeVisible({ timeout: 25_000 });
    }
  );
});
