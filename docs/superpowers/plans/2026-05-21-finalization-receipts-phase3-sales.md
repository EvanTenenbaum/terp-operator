# Finalization Receipts — Phase 3 (Sales Confirmation + Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 `document_snapshots` foundation and Phase 2 post-commit hook pattern to the Sales workspace so that `confirmSalesOrder` produces a `sales_confirmation` snapshot pair (external + internal) and `postSalesOrder` produces an `invoice` snapshot pair, both rendered through a shared `ReceiptPanel` in `SalesView` with explicit leak guards for `internalMargin`, `unitCost`, `unitCostResolved`, `sourceRowKey`, `legacyMarker`, and `candidateSourceText`.

**Architecture:** Two new best-effort post-commit helpers — `createSalesConfirmationReceipts` (fires on `confirmSalesOrder`) and `createInvoiceReceipts` (fires on `postSalesOrder` and creates an `invoice`-kind snapshot keyed to the freshly inserted `invoices` row) — re-query their entities via the raw `pg` `pool` after the drizzle transaction commits, assemble the `SalesConfirmationInput` / `InvoiceInput` shapes the Phase 1 projectors already accept, and drive `createDraftSnapshot → finalizeSnapshot` for both audiences. Three new tRPC procedures (`salesOrderExternalReceipt`, `salesOrderInternalReceipt`, `salesOrderSignalText`) mirror the PO triple. The existing `ReceiptPanel` is widened with a discriminated `kind` prop so it can dispatch to either entity's tRPC procedures while keeping the existing PO call site intact. `SalesView` renders the panel inside the Sale Builder WorkspacePanel whenever the selected order has status `confirmed`, `posted`, or `fulfilled`.

**Tech Stack:** TypeScript, drizzle-orm + raw `pg` `pool`, tRPC v10 (`protectedProcedure`), React + tRPC React Query hooks, Vitest with `vi.mock`, `@testing-library/react` for component tests, Playwright for browser proof.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/server/services/salesConfirmationReceipts.ts` | **Create** | Helper `createSalesConfirmationReceipts(pool, salesOrderId, commandId, userId)`. Re-queries `sales_orders` + `sales_order_lines` + `customers` (one LEFT JOIN), assembles `SalesConfirmationInput`, drives the snapshot pipeline for `external` + `internal` audiences with amendment-aware supersession. Snapshot `kind = 'sales_confirmation'`, `sourceEntityType = 'sales_order'`. |
| `src/server/services/salesConfirmationReceipts.test.ts` | **Create** | Unit tests using a mocked `Pool` and `vi.mock('./documentSnapshots')`. Asserts SQL shape (no `SELECT *`), explicit columns enumerated, leak guards on the external payload, supersedesId amendment path, best-effort failure semantics. |
| `src/server/services/invoiceReceipts.ts` | **Create** | Helper `createInvoiceReceipts(pool, salesOrderId, commandId, userId)`. Re-queries `sales_orders` + `sales_order_lines` + `customers` AND the just-inserted `invoices` row (most-recent for the order), assembles `InvoiceInput`, drives the snapshot pipeline for both audiences. Snapshot `kind = 'invoice'`, `sourceEntityType = 'invoice'`, `sourceEntityId = invoice.id`. |
| `src/server/services/invoiceReceipts.test.ts` | **Create** | Mirror of `salesConfirmationReceipts.test.ts` but with the additional invoice row query and `invoiceNo` / `dueDateISO` assertions. |
| `src/server/services/commandBus.ts` | **Modify** (two new imports + two new `try/catch` blocks in `executeCommand`) | Adds `createSalesConfirmationReceipts` for `confirmSalesOrder` and `createInvoiceReceipts` for `postSalesOrder`, both AFTER the drizzle transaction commits, AFTER the JSONL + socket observers run, double-guarded so a thrown error never propagates. |
| `src/server/routers/queries.ts` | **Modify** (append three procedures to `queriesRouter`) | Adds `salesOrderExternalReceipt`, `salesOrderInternalReceipt`, `salesOrderSignalText`. All `protectedProcedure`. The internal procedure relies on `assertRole(user, 'manager')` inside `getInternalReceipt` (one source of truth). The signal-text procedure must check BOTH the `invoice` and the `sales_confirmation` live heads (most-recent wins) so the panel emits a meaningful text whether the SO is at `confirmed` or `posted`. |
| `src/server/routers/queries.salesReceipts.test.ts` | **Create** | Caller-based router tests modeled on `queries.receipts.test.ts`. Mocks `documentSnapshots` exports; asserts wiring, role-gated FORBIDDEN, and `signalText` fallthrough behavior (invoice first, then confirmation, then null). |
| `src/client/components/ReceiptPanel.tsx` | **Modify** (discriminated `kind` prop + procedure dispatch) | Adds `kind: 'purchase_order' \| 'sales_order'` (defaults to `'purchase_order'` so the existing call site keeps working) and routes the three React-Query hooks accordingly. Existing rendering, role gating, and Copy for Signal behavior are unchanged. |
| `src/client/components/ReceiptPanel.test.tsx` | **Modify** (add a `kind="sales_order"` test block; keep all existing PO tests passing) | Adds mocks for the three new sales tRPC procedure paths and asserts they are wired when `kind='sales_order'`. |
| `src/client/views/SalesView.tsx` | **Modify** (one new import + one new render block inside the Sale Builder WorkspacePanel) | Renders `<ReceiptPanel kind="sales_order" salesOrderId={String(selectedOrder.id)} />` after the order lines grid when `selectedOrderStatus` is one of `confirmed`, `posted`, `fulfilled`. Minimal — no other behavior changes. |
| `docs/design-system/decisions-log.md` | **Append** | Dated entry documenting the `kind`-discriminated `ReceiptPanel` widening and the invoice / sales-confirmation receipt wiring. |
| `docs/design-system/components/_inventory.json` | **Regenerate** via `pnpm docs:inventory` | Captures the widened component automatically. |

---

## Architecture decisions resolved in this plan

These are decisions I made while reading the actual code so the engineer does not have to relitigate them mid-task. If you disagree with any of them, stop and re-discuss before writing code — do not silently diverge.

1. **Two helpers, not one.** Confirmation and invoice receipts have different `kind`, different `sourceEntityType`, and the invoice variant must re-query a row (`invoices`) that does not exist when confirmation fires. Folding them into one helper would force a `mode` parameter, two divergent SQL paths, and a divergent test fixture set inside one file. Two focused files each follow the Phase 2 PO helper shape exactly.

2. **Post-tx hook location.** Both helpers run AFTER `db.transaction(...)` resolves in `executeCommand` (around lines 286–363 of `commandBus.ts`), AFTER the existing JSONL append and socket emit, BEFORE the function returns `storedResult`. This matches the existing `finalizePurchaseOrder` hook location (line 349 area). Each new hook gets its own `if (input.name === '…')` guard and its own outer `try/catch`. They never share state.

3. **Why `pool` not `tx`.** Identical reasoning to Phase 2. The snapshot service runs its own `BEGIN/COMMIT` with `pg_advisory_xact_lock`; nesting inside the outer drizzle `tx` would deadlock and tie snapshot durability to the SO transaction. The post-commit position guarantees the SO (and, for invoices, the freshly inserted `invoices` row) are already visible to a fresh `pool` query.

4. **Customer name source.** `sales_orders.customer_id → customers.id → customers.name`. One LEFT JOIN. When `customer_id IS NULL` (the schema allows it via `onDelete: 'set null'`), substitute `"Unknown customer"` so the external projection never carries `null` where the type expects `string`.

5. **`dateISO` for sales_confirmation.** `sales_orders` has no `confirmed_at` column (schema lines 292–317). Use `new Date().toISOString()` captured at the moment the post-commit helper runs. This is acceptable because (a) `confirmSalesOrder` writes `updatedAt: new Date()` inside the tx (line 2572), so the time difference is sub-second, and (b) snapshots are amended via `supersedesId` on re-confirmation, so the timestamp tells the truth about when each snapshot was assembled.

6. **`dateISO` and `dueDateISO` for invoice.** The just-inserted `invoices` row carries `created_at` (NOT NULL `defaultNow()`) and `due_date` (NOT NULL — see schema line 363). Use `invoice.created_at.toISOString()` for `dateISO` and `invoice.due_date.toISOString()` for `dueDateISO`. No fallback computation is needed because the column is NOT NULL; if the row is missing, that is a fatal data-integrity failure and we log+return without emitting a snapshot.

7. **Invoice lookup query.** After `postSalesOrder` commits, the helper runs `SELECT id, invoice_no, customer_id, order_id, total, due_date, created_at FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`. This handles the spec-correct case (one invoice per posted order) without requiring the command result to plumb the invoice id through `affectedIds[]`. If a second posting were ever introduced, `LIMIT 1` + `ORDER BY created_at DESC` picks the most recent — which is the one that just committed.

8. **`internalMargin` derivation.** Per the user-supplied field map: `internalMargin = (unit_price - unit_cost) * qty`. Compute it in the helper from the raw `numeric` strings; the projector treats it as an absolute number and divides by `subtotal` to get `marginPct`. When `unit_cost` is `0` (the schema default), `internalMargin = unit_price * qty = subtotal`, which is a 100% margin — that is mathematically correct and the projector handles it.

9. **`productName` source.** `sales_order_lines.display_name` (the customer-facing alias) is preferred for the projection because it is what appears on the customer's offer (CSV exports already use it — see `SalesView.csvExport`). Fallback: `sales_order_lines.item_name`. Use `displayName ?? itemName` for `productName` in BOTH external and internal projections. The internal projection still gets the full diagnostic context via `legacyMarker`, `sourceRowKey`, and `candidateSourceText`; we are NOT hiding the catalog name from the operator.

10. **Per-line `externalNotes`.** `sales_order_lines` has no `notes` / `externalNotes` column. The closest fields (`belowFloorNote`, `landedCostReason`, `unresolvedSourceText`) are all internal-only by intent. The helper therefore passes `externalNotes: undefined` per line. Top-level `externalNotes` comes from `sales_orders.notes` (the per-order note); top-level `internalNotes` stays `undefined` for the confirmation/invoice. This matches the user-supplied field map verbatim.

11. **`candidateSourceText` source.** The schema column is `unresolved_source_text` (varchar). Per the user-supplied field map, this maps to `candidateSourceText` on the projector input. The projector's `internal` function aggregates it into `diagnostics.unresolvedSources`, which is the operator-facing diagnostic surface (Phase 1 projector lines 108–122).

12. **Leak-guard test surface.** Both helper tests MUST construct an input fixture where ALL six leak-guard fields (`internalMargin`, `unitCost`, `unitCostResolved=false`, `sourceRowKey`, `legacyMarker`, `candidateSourceText`) are non-empty and assert that the EXTERNAL `createDraftSnapshot` payload contains NONE of them at line level AND no top-level `internalNotes`, `cogs`, `margin`, or `diagnostics`. This is a runtime re-verification of the projector's allowlist in addition to the projector's own unit tests (Phase 1 already covers the projector; Phase 3 covers the wired pipeline).

13. **Idempotency replay does not re-emit receipts.** Identical to Phase 2 reasoning. A replayed `confirmSalesOrder` or `postSalesOrder` short-circuits at `commandBus.ts` lines 248–280 and returns the cached `CommandResult` without entering the winner path. Receipts were already created on the original successful execution; no second-emit hook on replay.

14. **Unfinalize → re-confirm / re-post.** There is no explicit `unconfirmSalesOrder` or `unpostSalesOrder` command in the current code (unlike POs). The state machine only allows forward transitions plus `cancelSalesOrder`. The helper still implements the amendment path via `supersedesId` because (a) it costs almost nothing, (b) it future-proofs against an `unconfirm` command being added later, and (c) `cancelSalesOrder` does NOT void the receipt — the snapshot persists as an audit record of what was confirmed. If a future command needs to void the receipt, that is a Phase 5+ concern.

15. **`signalText` precedence.** When both an invoice snapshot and a sales_confirmation snapshot exist for the same SO, the `salesOrderSignalText` procedure returns the invoice text (newer, more authoritative — it carries the invoice number and due date). The procedure first calls `getExternalReceipt(pool, 'invoice', invoiceId)` after resolving the latest invoice id for the SO via a small lookup query; if no invoice exists yet (SO is at `confirmed` status), it falls back to `getExternalReceipt(pool, 'sales_order', salesOrderId)` for the confirmation. If neither exists, returns `null`. The `salesOrderExternalReceipt` and `salesOrderInternalReceipt` procedures use the same precedence (invoice first, then confirmation).

16. **`ReceiptPanel` widening is a discriminated union, not a free-form prop.** The new prop shape is:

    ```ts
    type ReceiptPanelProps =
      | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never }
      | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never };
    ```

    This keeps the existing `<ReceiptPanel purchaseOrderId={...} />` call site working (because `kind` defaults to `'purchase_order'`) while making it a compile-time error to pass both ids or to omit the right id for the chosen kind. Inside the component, the `kind === 'sales_order'` branch enables the three sales tRPC queries and disables the PO ones via the React Query `enabled` option so React Query never fires the wrong fetch.

17. **All new tRPC procedures are `protectedProcedure`.** Same convention as Phase 2 — every receipt-adjacent procedure in `queries.ts` is `protectedProcedure`. The internal projection's role gate stays inside `getInternalReceipt`.

18. **SalesView insertion point.** The receipt panel renders INSIDE the existing `<WorkspacePanel panelId="sales:customer-workspace" title="Sale Builder" …>` (lines 541–620 of `SalesView.tsx`), AFTER the `<OperatorGrid …>` line-grid block (ends at line 619), BEFORE the panel's closing tag (line 620). This keeps the receipt visually anchored to the selected sales order, mirroring the way Phase 2 placed the panel under the PO header strip. The render is gated on `['confirmed', 'posted', 'fulfilled'].includes(selectedOrderStatus)` so it never appears for drafts.

---

## Mapping to GH issue #113 acceptance criteria (Phase 3 slice)

| #113 Acceptance criterion | Covered by |
| --- | --- |
| Sales Confirmation workspace with External + Internal receipt views | Tasks 1, 3, 4 (`createSalesConfirmationReceipts` + `salesOrder*Receipt` procedures + `ReceiptPanel` widening + `SalesView` insertion) |
| Invoice receipt via the same pipeline | Task 2 (`createInvoiceReceipts` writes a snapshot whose `sourceEntityType='invoice'` and `kind='invoice'`); Task 3 (procedures prefer the invoice live head when one exists) |
| External strips `internalMargin`, `unitCost`, `unitCostResolved`, `sourceRowKey`, `legacyMarker`, `candidateSourceText` | Tasks 1 + 2 — both helper tests include an explicit leak fixture; the Phase 1 projector already enforces the allowlist (lines 63–82 of `salesConfirmation.ts`, lines 60–80 of `invoice.ts`). |
| Internal projection includes margin / COGS / diagnostics | Phase 1 (already shipped). Phase 3 verifies the wired pipeline produces these via the internal-snapshot assertion in each helper test. |
| Copy for Signal works on a confirmed SO and on a posted SO | Task 3 (`salesOrderSignalText` precedence) + Task 4 (panel re-uses the existing Copy button) |
| Print receipt with internal watermark | **Deferred to Phase 5** — out of scope for Phase 3 per spec §3. |
| Payment received / vendor payout receipts | **Phase 4** — out of scope. |


---

## Task 0: Pre-flight

- [ ] **Step 1: Confirm worktree and branch**

Run:
```bash
git rev-parse --show-toplevel
git status -sb
git log --oneline -3
```

Expected:
- Path ends in `terp-operator-receipts-phase3-113`
- Branch is `plan/finalization-receipts-phase3-113`
- The top commit subjects show the Phase 2 PO work landed (`feat(receipts): … (#113 Phase 2 …)`)

If any of those don't match, STOP and resolve before continuing.

- [ ] **Step 2: Confirm Phase 1 + Phase 2 tests still pass on this branch**

Run:
```bash
pnpm vitest run \
  src/server/services/documentSnapshots.test.ts \
  src/server/services/projections \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/routers/queries.receipts.test.ts \
  src/client/components/ReceiptPanel.test.tsx
```

Expected: all green. If any are red, fix the breakage before starting Phase 3 — the Phase 1 projectors and Phase 2 PO pipeline are load-bearing for everything below.

- [ ] **Step 3: Confirm the live app still builds and typechecks**

Run:
```bash
pnpm typecheck
```

Expected: no errors. If there are pre-existing errors unrelated to receipts, document them; do not fix in this branch.

---

## Task 1: Sales-confirmation post-commit receipt helper

**Files:**
- Create: `src/server/services/salesConfirmationReceipts.ts`
- Create: `src/server/services/salesConfirmationReceipts.test.ts`
- Modify: `src/server/services/commandBus.ts` (one new import + one new `try/catch` block in `executeCommand`)

- [ ] **Step 1: Write the failing test file**

Create `src/server/services/salesConfirmationReceipts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createSalesConfirmationReceipts } from './salesConfirmationReceipts';
import { salesConfirmation } from './projections/salesConfirmation';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function baseSoRow() {
  return {
    id: SO_ID,
    order_no: 'SO-2001',
    customer_id: 'c-1',
    customer_name: 'Acme Buyers',
    total: '300.00',
    notes: 'deliver to dock 3'
  };
}

function baseLineRows() {
  return [
    {
      id: 'sl-1',
      item_name: 'Sunset OG',
      display_name: 'Sunset OG (Tier A)',
      qty: '2',
      unit_price: '100.00',
      unit_cost: '50.00',
      unit_cost_resolved: true,
      source_row_key: 'sheet:row-17',
      unresolved_source_text: null,
      legacy_status_marker: null
    },
    {
      id: 'sl-2',
      item_name: 'Blue Dream',
      display_name: null,
      qty: '1',
      unit_price: '100.00',
      unit_cost: '30.00',
      unit_cost_resolved: false,
      source_row_key: null,
      unresolved_source_text: 'q1-blue-dream-leftover',
      legacy_status_marker: 'sheet:Q1'
    }
  ];
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createSalesConfirmationReceipts', () => {
  it('queries the SO+customer JOIN, the lines, and the existing live snapshots per audience (4 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },     // SO+customer JOIN
      { rows: baseLineRows() },    // lines
      { rows: [] },                // no live external head
      { rows: [] }                 // no live internal head
    ]);

    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(pool.query).toHaveBeenCalledTimes(4);
    const firstSql = String(pool.query.mock.calls[0][0]);
    // Spec §6 rule 3: NO SELECT *, anywhere on external projection paths.
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/so\.order_no/);
    expect(firstSql).toMatch(/c\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/item_name/);
    expect(linesSql).toMatch(/display_name/);
    expect(linesSql).toMatch(/unit_price/);
    expect(linesSql).toMatch(/unit_cost/);
    expect(linesSql).toMatch(/source_row_key/);
    expect(linesSql).toMatch(/unresolved_source_text/);
    expect(linesSql).toMatch(/legacy_status_marker/);
    expect(linesSql).toMatch(/unit_cost_resolved/);
  });

  it('builds the external projection and creates+finalizes one external snapshot (kind=sales_confirmation, sourceEntityType=sales_order)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);

    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('sales_confirmation');
    expect(firstCall.sourceEntityType).toBe('sales_order');
    expect(firstCall.sourceEntityId).toBe(SO_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(salesConfirmation.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();

    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({
      id: 'snap-id',
      finalizedBy: USER_ID
    });
  });

  it('LEAK GUARD — the external payload contains none of internalMargin / unitCost / unitCostResolved / sourceRowKey / legacyMarker / candidateSourceText at line level, and no top-level internalNotes / cogs / margin / diagnostics', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);

    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(externalCall.audience).toBe('external');
    const payload = externalCall.payload as Record<string, unknown>;

    // Top-level: none of these may exist on an external projection.
    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('cogs');
    expect(payload).not.toHaveProperty('margin');
    expect(payload).not.toHaveProperty('diagnostics');

    // Line-level: stringify-scan the entire payload for forbidden keys.
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'internalMargin',
      'unitCost',
      'unitCostResolved',
      'sourceRowKey',
      'legacyMarker',
      'candidateSourceText'
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('builds the internal projection with cogs, margin, and diagnostics derived from the helper fields', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);

    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    expect(secondCreate.kind).toBe('sales_confirmation');
    expect(secondCreate.sourceEntityType).toBe('sales_order');

    const payload = secondCreate.payload as {
      cogs?: { perLine: Array<{ name: string; unitCost?: number }>; total: number };
      margin?: { perLine: Array<{ name: string; marginAbs: number }>; total: number };
      diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
    };
    // COGS: 2*50 + 1*30 = 130
    expect(payload.cogs?.total).toBe(130);
    expect(payload.cogs?.perLine.map((c) => c.unitCost)).toEqual([50, 30]);
    // Margin: line 1 = (100-50)*2 = 100, line 2 = (100-30)*1 = 70, total = 170
    expect(payload.margin?.total).toBe(170);
    expect(payload.margin?.perLine.map((m) => m.marginAbs)).toEqual([100, 70]);
    // Diagnostics: line 1 contributes source_row_key, line 2 contributes
    // candidate-source text + legacy marker (and unit_cost_resolved=false).
    expect(payload.diagnostics?.unresolvedSources ?? []).toEqual(
      expect.arrayContaining(['q1-blue-dream-leftover'])
    );
    expect(payload.diagnostics?.legacyMarkers).toEqual(['sheet:Q1']);
  });

  it('amends existing live snapshots via supersedesId when a prior live head exists per audience', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [{ id: 'prior-external-id' }] },
      { rows: [{ id: 'prior-internal-id' }] }
    ]);

    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing SO row → warn + return, no snapshot created', async () => {
    const pool = makePool([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/server/services/salesConfirmationReceipts.test.ts
```

Expected: failures referencing `Cannot find module './salesConfirmationReceipts'`.

- [ ] **Step 3: Implement the helper**

Create `src/server/services/salesConfirmationReceipts.ts`:

```ts
import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { salesConfirmation } from './projections/salesConfirmation';
import type { Audience, SalesConfirmationInput } from './projections/types';

/**
 * Issue #113 Phase 3 — best-effort post-commit hook for `confirmSalesOrder`.
 *
 * Runs AFTER the SO transaction has committed (see commandBus.ts `executeCommand`).
 * Re-queries the SO + lines + customer via the raw `pg` Pool because the snapshot
 * service is `pg`-native (it manages its own BEGIN/COMMIT with advisory locks
 * — see documentSnapshots.ts finalizeSnapshot). Nesting it under the outer
 * drizzle tx would deadlock the advisory lock against itself.
 *
 * Failure is non-fatal: a thrown SQL error, a missing SO row, or a snapshot
 * service rejection MUST NOT cause the SO command to surface as failed. The
 * SO is already confirmed in the DB before this runs.
 *
 * Handles unconfirm→re-confirm (if such a command is ever added): if a live
 * snapshot already exists for the (sales_order, id, audience) triple, the new
 * snapshot is created with supersedesId set, so the amendment chain reflects
 * the actual operator activity (spec §7).
 *
 * Snapshot identity:
 *   kind                = 'sales_confirmation'
 *   sourceEntityType    = 'sales_order'
 *   sourceEntityId      = salesOrderId
 *
 * External-only leak guard (re-verified by the helper test, even though the
 * projector itself enforces the allowlist at lines 63–82 of
 * src/server/services/projections/salesConfirmation.ts):
 *   • internalMargin
 *   • unitCost
 *   • unitCostResolved
 *   • sourceRowKey
 *   • legacyMarker
 *   • candidateSourceText
 */
export async function createSalesConfirmationReceipts(
  pool: Pool,
  salesOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    // 1. SO header + customer name. Explicit columns — no SELECT *, no
    //    schema leakage (spec §6 rule 3).
    const soRes = await pool.query(
      `SELECT so.id, so.order_no, so.customer_id, so.total, so.notes,
              c.name AS customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = $1
        LIMIT 1`,
      [salesOrderId]
    );
    const so = soRes.rows[0] as {
      id: string;
      order_no: string;
      customer_id: string | null;
      total: string;
      notes: string | null;
      customer_name: string | null;
    } | undefined;
    if (!so) {
      console.warn(
        `[salesConfirmationReceipts] sales order ${salesOrderId} not found at post-commit time; skipping snapshot.`
      );
      return;
    }

    // 2. Lines. Explicit columns again.
    const linesRes = await pool.query(
      `SELECT id, item_name, display_name, qty, unit_price, unit_cost,
              unit_cost_resolved, source_row_key, unresolved_source_text,
              legacy_status_marker
         FROM sales_order_lines
        WHERE order_id = $1
        ORDER BY created_at`,
      [salesOrderId]
    );
    const lineRows = linesRes.rows as Array<{
      id: string;
      item_name: string;
      display_name: string | null;
      qty: string;
      unit_price: string;
      unit_cost: string;
      unit_cost_resolved: boolean;
      source_row_key: string | null;
      unresolved_source_text: string | null;
      legacy_status_marker: string | null;
    }>;

    // 3. Build SalesConfirmationInput. Date is captured at hook-run time
    //    because sales_orders has no `confirmed_at` column (decision §5).
    const dateISO = new Date().toISOString();
    const lines = lineRows.map((l) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      const unitCost = Number(l.unit_cost);
      const subtotal = qty * unitPrice;
      const internalMargin = (unitPrice - unitCost) * qty;
      return {
        productName: l.display_name ?? l.item_name,
        qty,
        unitPrice,
        subtotal,
        externalNotes: undefined,
        internalMargin,
        unitCost,
        unitCostResolved: l.unit_cost_resolved,
        sourceRowKey: l.source_row_key ?? undefined,
        legacyMarker: l.legacy_status_marker ?? undefined,
        candidateSourceText: l.unresolved_source_text ?? undefined
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
    const input: SalesConfirmationInput = {
      customerName: so.customer_name ?? 'Unknown customer',
      soNo: so.order_no,
      dateISO,
      externalNotes: so.notes ?? undefined,
      internalNotes: undefined,
      subtotal,
      total: Number(so.total),
      lines
    };

    // 4. For each audience: find the existing live head (for amendment),
    //    then createDraft + finalize.
    await emitSnapshot(pool, 'external', input, salesOrderId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, salesOrderId, commandId, userId);
  } catch (err) {
    console.warn(
      '[salesConfirmationReceipts] receipt creation failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
  }
}

async function emitSnapshot(
  pool: Pool,
  audience: Audience,
  input: SalesConfirmationInput,
  salesOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  // Look up existing live head for this (SO, audience). Live = finalized,
  // not voided, not superseded. Matches selectLiveRow in documentSnapshots.ts.
  const liveRes = await pool.query(
    `SELECT id
       FROM document_snapshots
      WHERE source_entity_type = $1
        AND source_entity_id   = $2
        AND audience           = $3
        AND status = 'finalized'
        AND voided_at IS NULL
        AND id NOT IN (
          SELECT supersedes_id FROM document_snapshots
           WHERE supersedes_id IS NOT NULL
        )
      LIMIT 1`,
    ['sales_order', salesOrderId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload =
    audience === 'external'
      ? salesConfirmation.external(input)
      : salesConfirmation.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'sales_confirmation',
    sourceEntityType: 'sales_order',
    sourceEntityId: salesOrderId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: salesConfirmation.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/server/services/salesConfirmationReceipts.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Add the commandBus hook**

Open `src/server/services/commandBus.ts`. At line 109 (where `createPoFinalizationReceipts` is imported), add the new import RIGHT BELOW it:

```ts
import { createSalesConfirmationReceipts } from './salesConfirmationReceipts';
```

Then locate the existing PO hook block at lines 342–363:

```ts
    // Issue #113 Phase 2 — best-effort PO finalization receipt creation.
    // Runs AFTER the PO transaction commits and AFTER existing observers
    // (JSONL, socket) so a snapshot failure cannot fail the PO command.
    // ...
    if (input.name === 'finalizePurchaseOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createPoFinalizationReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        console.warn(
          '[commandBus] PO finalization receipt hook failed after commit:',
          e instanceof Error ? e.message : e
        );
      }
    }
```

IMMEDIATELY AFTER that block (still inside `executeCommand`, before `return storedResult`), insert a parallel block for the sales confirmation:

```ts
    // Issue #113 Phase 3 — best-effort sales-confirmation receipt creation.
    // Runs AFTER the SO transaction commits, AFTER JSONL + socket emit, so a
    // snapshot failure cannot fail the confirmSalesOrder command. The helper
    // catches and logs internally; the outer try/catch double-guards against
    // an unexpected synchronous throw. See src/server/services/salesConfirmationReceipts.ts.
    if (input.name === 'confirmSalesOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createSalesConfirmationReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        console.warn(
          '[commandBus] sales-confirmation receipt hook failed after commit:',
          e instanceof Error ? e.message : e
        );
      }
    }
```

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/salesConfirmationReceipts.ts \
        src/server/services/salesConfirmationReceipts.test.ts \
        src/server/services/commandBus.ts
git commit -m "feat(receipts): post-commit sales_confirmation snapshot hook (#113 Phase 3 Task 1)

createSalesConfirmationReceipts re-queries the SO + customer + lines via
the raw pg pool after the drizzle tx commits, assembles a
SalesConfirmationInput, and drives createDraftSnapshot + finalizeSnapshot
for the external and internal audiences. Best-effort: failures warn but
never propagate into the confirmSalesOrder command result.

External-leak guard: helper test asserts the external payload contains
none of internalMargin / unitCost / unitCostResolved / sourceRowKey /
legacyMarker / candidateSourceText at any nesting level."
```

---

## Task 2: Invoice post-commit receipt helper

**Files:**
- Create: `src/server/services/invoiceReceipts.ts`
- Create: `src/server/services/invoiceReceipts.test.ts`
- Modify: `src/server/services/commandBus.ts` (one new import + one new `try/catch` block in `executeCommand`)

- [ ] **Step 1: Write the failing test file**

Create `src/server/services/invoiceReceipts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createInvoiceReceipts } from './invoiceReceipts';
import { invoice } from './projections/invoice';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const INV_ID = '44444444-4444-4444-4444-444444444444';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function baseSoRow() {
  return {
    id: SO_ID,
    order_no: 'SO-2001',
    customer_id: 'c-1',
    customer_name: 'Acme Buyers',
    total: '300.00',
    notes: 'net 7'
  };
}

function baseLineRows() {
  return [
    {
      id: 'sl-1',
      item_name: 'Sunset OG',
      display_name: 'Sunset OG (Tier A)',
      qty: '2',
      unit_price: '100.00',
      unit_cost: '50.00',
      unit_cost_resolved: true,
      source_row_key: 'sheet:row-17',
      unresolved_source_text: null,
      legacy_status_marker: null
    },
    {
      id: 'sl-2',
      item_name: 'Blue Dream',
      display_name: null,
      qty: '1',
      unit_price: '100.00',
      unit_cost: '30.00',
      unit_cost_resolved: false,
      source_row_key: null,
      unresolved_source_text: 'q1-blue-dream-leftover',
      legacy_status_marker: 'sheet:Q1'
    }
  ];
}

function baseInvoiceRow() {
  return {
    id: INV_ID,
    invoice_no: 'INV-9001',
    customer_id: 'c-1',
    order_id: SO_ID,
    total: '300.00',
    due_date: new Date('2026-05-28T00:00:00Z'),
    created_at: new Date('2026-05-21T12:00:00Z')
  };
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createInvoiceReceipts', () => {
  it('queries the SO+customer JOIN, the lines, the most-recent invoice, then the live snapshots per audience (5 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },        // SO+customer JOIN
      { rows: baseLineRows() },       // lines
      { rows: [baseInvoiceRow()] },   // most-recent invoice for the order
      { rows: [] },                   // no live external head
      { rows: [] }                    // no live internal head
    ]);

    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(pool.query).toHaveBeenCalledTimes(5);
    const firstSql = String(pool.query.mock.calls[0][0]);
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/so\.order_no/);
    expect(firstSql).toMatch(/c\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/item_name/);
    expect(linesSql).toMatch(/unit_price/);
    expect(linesSql).toMatch(/unit_cost/);
    const invoiceSql = String(pool.query.mock.calls[2][0]);
    expect(invoiceSql).not.toMatch(/select\s+\*/i);
    expect(invoiceSql).toMatch(/invoice_no/);
    expect(invoiceSql).toMatch(/due_date/);
    expect(invoiceSql).toMatch(/order_id\s*=\s*\$1/i);
    expect(invoiceSql).toMatch(/order\s+by\s+created_at\s+desc/i);
    expect(invoiceSql).toMatch(/limit\s+1/i);
  });

  it('builds the external invoice projection (kind=invoice, sourceEntityType=invoice, sourceEntityId=invoice.id) with invoiceNo + dueDateISO', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [baseInvoiceRow()] },
      { rows: [] },
      { rows: [] }
    ]);

    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('invoice');
    expect(firstCall.sourceEntityType).toBe('invoice');
    expect(firstCall.sourceEntityId).toBe(INV_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.projectionVersion).toBe(invoice.projectionVersion);

    const payload = firstCall.payload as {
      header: { documentNo: string; dateISO: string };
      footer?: { reference?: string };
    };
    expect(payload.header.documentNo).toBe('INV-9001');
    expect(payload.header.dateISO).toBe('2026-05-21T12:00:00.000Z');
    expect(payload.footer?.reference).toBe('2026-05-28T00:00:00.000Z');

    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({
      id: 'snap-id',
      finalizedBy: USER_ID
    });
  });

  it('LEAK GUARD — the external invoice payload contains none of the six internal-only line keys and no top-level internalNotes / cogs / margin / diagnostics', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [baseInvoiceRow()] },
      { rows: [] },
      { rows: [] }
    ]);

    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(externalCall.audience).toBe('external');
    const payload = externalCall.payload as Record<string, unknown>;

    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('cogs');
    expect(payload).not.toHaveProperty('margin');
    expect(payload).not.toHaveProperty('diagnostics');

    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'internalMargin',
      'unitCost',
      'unitCostResolved',
      'sourceRowKey',
      'legacyMarker',
      'candidateSourceText'
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('builds the internal invoice projection with cogs, margin, diagnostics — anchored to the invoice id', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [baseInvoiceRow()] },
      { rows: [] },
      { rows: [] }
    ]);

    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    expect(secondCreate.kind).toBe('invoice');
    expect(secondCreate.sourceEntityType).toBe('invoice');
    expect(secondCreate.sourceEntityId).toBe(INV_ID);

    const payload = secondCreate.payload as {
      cogs?: { total: number };
      margin?: { total: number };
      diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
    };
    expect(payload.cogs?.total).toBe(130);
    expect(payload.margin?.total).toBe(170);
    expect(payload.diagnostics?.legacyMarkers).toEqual(['sheet:Q1']);
  });

  it('amends existing live snapshots via supersedesId per audience (keyed by invoice id, not sales-order id)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [baseInvoiceRow()] },
      { rows: [{ id: 'prior-external-id' }] },
      { rows: [{ id: 'prior-internal-id' }] }
    ]);

    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
    // Live-head lookup must filter on source_entity_type='invoice', not 'sales_order'.
    const externalLookupSql = String(pool.query.mock.calls[3][0]);
    const externalLookupParams = pool.query.mock.calls[3][1] as unknown[];
    expect(externalLookupSql).toMatch(/source_entity_type/);
    expect(externalLookupParams[0]).toBe('invoice');
    expect(externalLookupParams[1]).toBe(INV_ID);
  });

  it('best-effort: missing SO row → warn + return, no snapshot created', async () => {
    const pool = makePool([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: missing invoice row → warn + return, no snapshot created', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [] }
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] },
      { rows: baseLineRows() },
      { rows: [baseInvoiceRow()] },
      { rows: [] },
      { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/server/services/invoiceReceipts.test.ts
```

Expected: failures referencing `Cannot find module './invoiceReceipts'`.

- [ ] **Step 3: Implement the helper**

Create `src/server/services/invoiceReceipts.ts`:

```ts
import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { invoice } from './projections/invoice';
import type { Audience, InvoiceInput } from './projections/types';

/**
 * Issue #113 Phase 3 — best-effort post-commit hook for `postSalesOrder`.
 *
 * Runs AFTER the SO transaction has committed (see commandBus.ts `executeCommand`).
 * Re-queries the SO + lines + customer + the just-inserted invoice row via
 * the raw `pg` Pool. Then drives createDraftSnapshot + finalizeSnapshot for
 * both audiences using the invoice projector and the invoice id as the
 * snapshot's source entity.
 *
 * Snapshot identity:
 *   kind                = 'invoice'
 *   sourceEntityType    = 'invoice'
 *   sourceEntityId      = invoice.id
 *
 * Failure is non-fatal in three ways:
 *   1. A thrown SQL error is caught by the outer try/catch and logged.
 *   2. A missing SO row → warn + early return (no snapshot).
 *   3. A missing invoice row → warn + early return (the SO must have one
 *      because postSalesOrder INSERTs it before commit; absence here means
 *      the read raced something destructive, which we do not recover from).
 *
 * The post sales order command itself remains successful — receipts are an
 * observer of the committed state, not a participant in the transaction.
 */
export async function createInvoiceReceipts(
  pool: Pool,
  salesOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    // 1. SO header + customer name.
    const soRes = await pool.query(
      `SELECT so.id, so.order_no, so.customer_id, so.total, so.notes,
              c.name AS customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = $1
        LIMIT 1`,
      [salesOrderId]
    );
    const so = soRes.rows[0] as {
      id: string;
      order_no: string;
      customer_id: string | null;
      total: string;
      notes: string | null;
      customer_name: string | null;
    } | undefined;
    if (!so) {
      console.warn(
        `[invoiceReceipts] sales order ${salesOrderId} not found at post-commit time; skipping snapshot.`
      );
      return;
    }

    // 2. Lines.
    const linesRes = await pool.query(
      `SELECT id, item_name, display_name, qty, unit_price, unit_cost,
              unit_cost_resolved, source_row_key, unresolved_source_text,
              legacy_status_marker
         FROM sales_order_lines
        WHERE order_id = $1
        ORDER BY created_at`,
      [salesOrderId]
    );
    const lineRows = linesRes.rows as Array<{
      id: string;
      item_name: string;
      display_name: string | null;
      qty: string;
      unit_price: string;
      unit_cost: string;
      unit_cost_resolved: boolean;
      source_row_key: string | null;
      unresolved_source_text: string | null;
      legacy_status_marker: string | null;
    }>;

    // 3. Invoice row. Most-recent for this SO. `dueDate` is NOT NULL in
    //    the schema, so we do not need a fallback computation.
    const invRes = await pool.query(
      `SELECT id, invoice_no, customer_id, order_id, total, due_date, created_at
         FROM invoices
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [salesOrderId]
    );
    const inv = invRes.rows[0] as {
      id: string;
      invoice_no: string;
      customer_id: string | null;
      order_id: string;
      total: string;
      due_date: Date;
      created_at: Date;
    } | undefined;
    if (!inv) {
      console.warn(
        `[invoiceReceipts] no invoice row found for sales order ${salesOrderId} at post-commit time; skipping snapshot.`
      );
      return;
    }

    // 4. Build InvoiceInput.
    const lines = lineRows.map((l) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      const unitCost = Number(l.unit_cost);
      const subtotal = qty * unitPrice;
      const internalMargin = (unitPrice - unitCost) * qty;
      return {
        productName: l.display_name ?? l.item_name,
        qty,
        unitPrice,
        subtotal,
        externalNotes: undefined,
        internalMargin,
        unitCost,
        unitCostResolved: l.unit_cost_resolved,
        sourceRowKey: l.source_row_key ?? undefined,
        legacyMarker: l.legacy_status_marker ?? undefined,
        candidateSourceText: l.unresolved_source_text ?? undefined
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
    const input: InvoiceInput = {
      customerName: so.customer_name ?? 'Unknown customer',
      soNo: so.order_no,
      dateISO: inv.created_at.toISOString(),
      externalNotes: so.notes ?? undefined,
      internalNotes: undefined,
      subtotal,
      total: Number(inv.total),
      invoiceNo: inv.invoice_no,
      dueDateISO: inv.due_date.toISOString(),
      lines
    };

    // 5. Emit snapshots for each audience, keyed by the invoice id.
    await emitSnapshot(pool, 'external', input, inv.id, commandId, userId);
    await emitSnapshot(pool, 'internal', input, inv.id, commandId, userId);
  } catch (err) {
    console.warn(
      '[invoiceReceipts] receipt creation failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
  }
}

async function emitSnapshot(
  pool: Pool,
  audience: Audience,
  input: InvoiceInput,
  invoiceId: string,
  commandId: string,
  userId: string
): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id
       FROM document_snapshots
      WHERE source_entity_type = $1
        AND source_entity_id   = $2
        AND audience           = $3
        AND status = 'finalized'
        AND voided_at IS NULL
        AND id NOT IN (
          SELECT supersedes_id FROM document_snapshots
           WHERE supersedes_id IS NOT NULL
        )
      LIMIT 1`,
    ['invoice', invoiceId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload =
    audience === 'external'
      ? invoice.external(input)
      : invoice.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'invoice',
    sourceEntityType: 'invoice',
    sourceEntityId: invoiceId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: invoice.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/server/services/invoiceReceipts.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Add the commandBus hook**

Open `src/server/services/commandBus.ts`. With the `createSalesConfirmationReceipts` import added in Task 1 Step 5, add ONE more import RIGHT BELOW it:

```ts
import { createInvoiceReceipts } from './invoiceReceipts';
```

Then locate the sales-confirmation hook block you added in Task 1 Step 5, and insert IMMEDIATELY AFTER it (still inside `executeCommand`, before `return storedResult`):

```ts
    // Issue #113 Phase 3 — best-effort invoice receipt creation on postSalesOrder.
    // Runs AFTER the SO transaction commits (which is what creates the invoice
    // row in the first place — see commandBus.ts postSalesOrder lines 2678-2681)
    // and AFTER the existing observers. The helper re-queries the invoice via
    // the pool. See src/server/services/invoiceReceipts.ts.
    if (input.name === 'postSalesOrder' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createInvoiceReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        console.warn(
          '[commandBus] invoice receipt hook failed after commit:',
          e instanceof Error ? e.message : e
        );
      }
    }
```

Note: `commandResult.affectedIds[0]` for `postSalesOrder` is the sales order id (see line 2632 of `commandBus.ts` — `affected = [orderId]` is the seed). The helper takes the SO id and looks up the invoice by `order_id`.

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/invoiceReceipts.ts \
        src/server/services/invoiceReceipts.test.ts \
        src/server/services/commandBus.ts
git commit -m "feat(receipts): post-commit invoice snapshot hook (#113 Phase 3 Task 2)

createInvoiceReceipts re-queries the SO + customer + lines + the
just-inserted invoice row via the raw pg pool after postSalesOrder
commits. Builds InvoiceInput (extends SalesConfirmationInput with
invoiceNo + dueDateISO), then drives createDraftSnapshot +
finalizeSnapshot keyed on the invoice id (sourceEntityType='invoice').

Same external-leak guard as Task 1 — verified at runtime in the helper
test for all six forbidden line keys."
```

---

## Task 3: Three new tRPC procedures for sales receipts

**Files:**
- Modify: `src/server/routers/queries.ts` (append three procedures to `queriesRouter`)
- Create: `src/server/routers/queries.salesReceipts.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/server/routers/queries.salesReceipts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { queriesRouter } from './queries';
import { pool } from '../db';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const INV_ID = '44444444-4444-4444-4444-444444444444';

function makeUser(role: Role = 'manager'): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role,
    workLoop: null
  };
}

function makeCaller(role: Role = 'manager') {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role)
  });
}

function makeExternalConfirmation(): ExternalReceiptProjection {
  return {
    kind: 'sales_confirmation',
    header: { title: 'Sales Confirmation', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'SO-2001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalConfirmation(): InternalReceiptProjection {
  return {
    kind: 'sales_confirmation',
    header: { title: 'Sales Confirmation', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'SO-2001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 },
    projectionVersion: 1,
    cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
    margin: { perLine: [{ name: 'Sunset OG', marginAbs: 100, marginPct: 50 }], total: 100 },
    __INTERNAL_ONLY__: true
  };
}

function makeExternalInvoice(): ExternalReceiptProjection {
  return {
    kind: 'invoice',
    header: { title: 'Invoice', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'INV-9001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
    totals: { subtotal: 200, total: 200 },
    footer: { reference: '2026-05-28T00:00:00.000Z' },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalInvoice(): InternalReceiptProjection {
  return {
    ...makeExternalInvoice(),
    __EXTERNAL_PROJECTED__: undefined as unknown as never,
    cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
    __INTERNAL_ONLY__: true
  } as InternalReceiptProjection;
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('salesOrderExternalReceipt', () => {
  it('returns the invoice external projection when the invoice live head exists (invoice wins over confirmation)', async () => {
    // Helper that resolves the latest invoice id for the SO — stubbed via pool.query spy.
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: INV_ID }],
      rowCount: 1
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const invoiceProjection = makeExternalInvoice();
    const getExt = vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(invoiceProjection);

    const caller = makeCaller('operator');
    const result = await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID });

    expect(result).toEqual(invoiceProjection);
    expect(getExt).toHaveBeenCalledWith(expect.anything(), 'invoice', INV_ID);
    invoiceLookup.mockRestore();
  });

  it('falls back to the sales_confirmation external projection when no invoice exists yet', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const confirmation = makeExternalConfirmation();
    const getExt = vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(confirmation);

    const caller = makeCaller('operator');
    const result = await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID });

    expect(result).toEqual(confirmation);
    expect(getExt).toHaveBeenCalledWith(expect.anything(), 'sales_order', SO_ID);
    invoiceLookup.mockRestore();
  });

  it('returns null when neither an invoice nor a confirmation snapshot exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);

    const caller = makeCaller('operator');
    expect(await caller.salesOrderExternalReceipt({ salesOrderId: SO_ID })).toBeNull();
    invoiceLookup.mockRestore();
  });
});

describe('salesOrderInternalReceipt', () => {
  it('returns the invoice internal projection for manager+ when an invoice exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: INV_ID }],
      rowCount: 1
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const projection = makeInternalInvoice();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('manager');
    expect(await caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).toEqual(projection);
    invoiceLookup.mockRestore();
  });

  it('falls back to the sales_confirmation internal projection when no invoice exists yet', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    const projection = makeInternalConfirmation();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('manager');
    expect(await caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).toEqual(projection);
    invoiceLookup.mockRestore();
  });

  it('throws FORBIDDEN for operator role (assertRole inside getInternalReceipt fires)', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: INV_ID }],
      rowCount: 1
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.salesOrderInternalReceipt({ salesOrderId: SO_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
    invoiceLookup.mockRestore();
  });
});

describe('salesOrderSignalText', () => {
  it('renders the invoice external projection when an invoice live head exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: INV_ID }],
      rowCount: 1
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalInvoice());

    const caller = makeCaller('operator');
    const result = await caller.salesOrderSignalText({ salesOrderId: SO_ID });

    expect(result).toBeTypeOf('string');
    expect(result).toContain('Invoice INV-9001');
    expect(result).toContain('To: Acme Buyers');
    expect(result).toContain('Total: 200');
    expect(result).not.toMatch(/<[^>]+>/);
    invoiceLookup.mockRestore();
  });

  it('falls back to the confirmation external projection when no invoice exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalConfirmation());

    const caller = makeCaller('operator');
    const result = await caller.salesOrderSignalText({ salesOrderId: SO_ID });

    expect(result).toContain('Sales Confirmation SO-2001');
    invoiceLookup.mockRestore();
  });

  it('returns null when neither a confirmation nor an invoice snapshot exists', async () => {
    const invoiceLookup = vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as unknown as Awaited<ReturnType<typeof pool.query>>);
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);

    const caller = makeCaller('operator');
    expect(await caller.salesOrderSignalText({ salesOrderId: SO_ID })).toBeNull();
    invoiceLookup.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/server/routers/queries.salesReceipts.test.ts
```

Expected: failures referencing `caller.salesOrderExternalReceipt is not a function` (or similar undefined-procedure errors).

- [ ] **Step 3: Add the three procedures and the shared invoice-lookup helper**

Open `src/server/routers/queries.ts`. The existing `getExternalReceipt`, `getInternalReceipt`, `renderSignalText` import (line 8) is already there. We do NOT need new imports.

Locate the existing block at lines 992-1011 (the three `purchaseOrder*` procedures). IMMEDIATELY AFTER `purchaseOrderSignalText` ends (line 1011, just before the closing `});` of `queriesRouter`), insert the three new procedures plus a small inline helper:

```ts
  salesOrderExternalReceipt: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Invoice wins over confirmation when both exist (decision §15).
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getExternalReceipt(pool, 'invoice', invoiceId);
        if (fromInvoice) return fromInvoice;
      }
      return getExternalReceipt(pool, 'sales_order', input.salesOrderId);
    }),
  salesOrderInternalReceipt: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Role gate is enforced inside getInternalReceipt via assertRole(user, 'manager').
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getInternalReceipt(pool, ctx.user, 'invoice', invoiceId);
        if (fromInvoice) return fromInvoice;
      }
      return getInternalReceipt(pool, ctx.user, 'sales_order', input.salesOrderId);
    }),
  salesOrderSignalText: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const invoiceId = await latestInvoiceIdForOrder(input.salesOrderId);
      if (invoiceId) {
        const fromInvoice = await getExternalReceipt(pool, 'invoice', invoiceId);
        if (fromInvoice) return renderSignalText(fromInvoice);
      }
      const fromConfirmation = await getExternalReceipt(pool, 'sales_order', input.salesOrderId);
      if (!fromConfirmation) return null;
      return renderSignalText(fromConfirmation);
    }),
```

Then, OUTSIDE the `queriesRouter` block (after the closing `});` of `queriesRouter`, but before `type ReplaceTable = ...` at line 1014), add the small helper function:

```ts
/**
 * Issue #113 Phase 3 — resolve the most recent invoice id for a sales order.
 * Returns null when the SO has no invoice (i.e., it is still at `confirmed`
 * status or earlier). Used by the salesOrder* receipt procedures to decide
 * whether to load an invoice or a sales_confirmation snapshot.
 */
async function latestInvoiceIdForOrder(salesOrderId: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT id
       FROM invoices
      WHERE order_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [salesOrderId]
  );
  const row = res.rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/server/routers/queries.salesReceipts.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Re-run the Phase 2 router tests to confirm no regression**

Run:
```bash
pnpm vitest run src/server/routers/queries.receipts.test.ts
```

Expected: 5 tests still green.

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/queries.ts src/server/routers/queries.salesReceipts.test.ts
git commit -m "feat(receipts): tRPC procedures for sales_order external/internal/signal (#113 Phase 3 Task 3)

Three new protectedProcedures on queriesRouter:
  • salesOrderExternalReceipt → invoice live head first, fallback to confirmation
  • salesOrderInternalReceipt → same precedence, manager+ gate via assertRole
  • salesOrderSignalText      → renderSignalText on whichever external head wins

Shared latestInvoiceIdForOrder helper resolves the most-recent invoice
id per SO. When the SO is still at confirmed status (no invoice yet),
the procedures fall back to the sales_confirmation snapshot."
```

---

## Task 4: Widen ReceiptPanel with kind prop + wire into SalesView

**Files:**
- Modify: `src/client/components/ReceiptPanel.tsx` (discriminated `kind` prop + procedure dispatch; default path unchanged)
- Modify: `src/client/components/ReceiptPanel.test.tsx` (add sales-mode block; keep all PO tests passing)
- Modify: `src/client/views/SalesView.tsx` (one new import + one new render block inside Sale Builder)
- Modify: `docs/design-system/decisions-log.md` (append one dated entry)
- Regenerate: `docs/design-system/components/_inventory.json` via `pnpm docs:inventory`

- [ ] **Step 1: Extend the ReceiptPanel test file with sales-mode coverage**

Open `src/client/components/ReceiptPanel.test.tsx`. The existing mock surface (lines 5–21 of the current file) only exposes the three `purchaseOrder*` procedures. REPLACE the `vi.mock('../api/trpc', …)` block at the top of the file with this widened version (keeping all the existing PO mocks intact and adding three new sales mocks):

```tsx
const externalQueryMock = vi.fn();
const internalQueryMock = vi.fn();
const signalTextQueryMock = vi.fn();
const salesExternalQueryMock = vi.fn();
const salesInternalQueryMock = vi.fn();
const salesSignalTextQueryMock = vi.fn();
const meQueryMock = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      purchaseOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => externalQueryMock(input, options) },
      purchaseOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => internalQueryMock(input, options) },
      purchaseOrderSignalText: { useQuery: (input: unknown, options?: unknown) => signalTextQueryMock(input, options) },
      salesOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesExternalQueryMock(input, options) },
      salesOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesInternalQueryMock(input, options) },
      salesOrderSignalText: { useQuery: (input: unknown, options?: unknown) => salesSignalTextQueryMock(input, options) }
    },
    auth: {
      me: { useQuery: () => meQueryMock() }
    }
  }
}));
```

Then in the `beforeEach` block (around line 41), add reset calls for the three new mocks:

```tsx
beforeEach(() => {
  externalQueryMock.mockReset();
  internalQueryMock.mockReset();
  signalTextQueryMock.mockReset();
  salesExternalQueryMock.mockReset();
  salesInternalQueryMock.mockReset();
  salesSignalTextQueryMock.mockReset();
  meQueryMock.mockReset();
  meQueryMock.mockReturnValue({ data: { role: 'manager' } });
});
```

At the END of the file (after the last `describe(...)` block closes), APPEND a new sales-mode describe block. The fixtures here mirror Task 3's `salesOrderExternalReceipt` invoice-precedence expectation — the panel does not care which underlying snapshot won; it just renders whatever the procedure returned.

```tsx
const SO_ID = '99999999-9999-9999-9999-999999999999';

const externalInvoiceProjection = {
  kind: 'invoice',
  header: { title: 'Invoice', counterparty: 'Acme Buyers', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'INV-9001' },
  lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 100, subtotal: 200 }],
  totals: { subtotal: 200, total: 200 },
  footer: { reference: '2026-05-28T00:00:00.000Z' },
  projectionVersion: 1
};

const internalInvoiceProjection = {
  ...externalInvoiceProjection,
  internalNotes: undefined,
  cogs: { perLine: [{ name: 'Sunset OG', unitCost: 50 }], total: 100 },
  margin: { perLine: [{ name: 'Sunset OG', marginAbs: 100, marginPct: 50 }], total: 100 }
};

describe('ReceiptPanel — sales_order mode', () => {
  it('routes to the sales tRPC procedures when kind="sales_order"', () => {
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'Invoice INV-9001\nTo: Acme Buyers', isLoading: false });
    // PO mocks return undefined so the panel must not depend on them.
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);

    // Sales hooks were called with the sales-order id; PO hooks were never asked to fetch.
    expect(salesExternalQueryMock).toHaveBeenCalled();
    expect(salesExternalQueryMock.mock.calls[0][0]).toEqual({ salesOrderId: SO_ID });
    expect(salesSignalTextQueryMock).toHaveBeenCalled();

    // The PO hooks were called (React Query hooks must be called unconditionally
    // per the rules of hooks), but their `enabled` option must be false so no
    // network request fires.
    expect(externalQueryMock).toHaveBeenCalled();
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(internalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(signalTextQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });

    // Rendered content reflects the sales projection.
    expect(screen.getByText('Acme Buyers')).toBeInTheDocument();
    expect(screen.getByText('INV-9001')).toBeInTheDocument();
  });

  it('hides the Internal tab in sales_order mode for operator role', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: null, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);

    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('copies the sales signal text when Copy is clicked in sales_order mode', () => {
    salesExternalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: 'Invoice INV-9001\nTo: Acme Buyers', isLoading: false });
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<ReceiptPanel kind="sales_order" salesOrderId={SO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Invoice INV-9001\nTo: Acme Buyers');
  });

  it('still passes existing PO tests with the existing prop shape (no kind specified)', () => {
    // Smoke: render with the legacy PO shape; the panel must work as before.
    externalQueryMock.mockReturnValue({ data: externalInvoiceProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalInvoiceProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<ReceiptPanel purchaseOrderId="po-1" />);

    // PO hooks fired with enabled (no enabled override → enabled=true by default).
    expect(externalQueryMock).toHaveBeenCalled();
    expect(externalQueryMock.mock.calls[0][0]).toEqual({ purchaseOrderId: 'po-1' });
    // Sales hooks were called but disabled.
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
  });
});
```

- [ ] **Step 2: Run the widened tests to verify they fail at compile/runtime**

Run:
```bash
pnpm vitest run src/client/components/ReceiptPanel.test.tsx
```

Expected: failures along the lines of `Property 'kind' does not exist on type ReceiptPanelProps` AND the sales tests fail because the panel doesn't dispatch yet.

- [ ] **Step 3: Widen the panel implementation**

Open `src/client/components/ReceiptPanel.tsx`. REPLACE the entire file with the widened version below. The visible UI (`ReceiptBody`, the tabs, the Copy button, the leak-aware rendering of `internalNotes`/`cogs`/`margin`/`diagnostics`) is byte-identical to Phase 2 — only the prop type and the query dispatch change.

```tsx
import { useState } from 'react';
import { trpc } from '../api/trpc';

type TabAudience = 'external' | 'internal';

/**
 * Issue #113 Phase 2 + Phase 3 — read-only finalization receipt viewer.
 *
 * Discriminated prop: pass `purchaseOrderId` (default `kind='purchase_order'`)
 * for PO receipts or `kind='sales_order'` + `salesOrderId` for sales/invoice
 * receipts. The TypeScript union guarantees a caller cannot pass both ids or
 * omit the right id for the chosen kind.
 *
 * Internally the panel always issues both sets of React Query hooks (PO and
 * sales) because the rules of hooks require unconditional calls — the
 * inactive set passes `enabled: false` so React Query never actually fetches.
 *
 * "Copy for Signal" pulls the server-rendered plain-text string from the
 * matching `*SignalText` procedure so the renderer stays in one place.
 */
export type ReceiptPanelProps =
  | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never }
  | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never };

export function ReceiptPanel(props: ReceiptPanelProps) {
  const kind = props.kind ?? 'purchase_order';
  const isPo = kind === 'purchase_order';
  const isSo = kind === 'sales_order';

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<TabAudience>('external');

  // Stable placeholder ids so disabled hooks still get a valid uuid-shaped input.
  const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
  const poId = isPo ? (props.purchaseOrderId as string) : PLACEHOLDER_UUID;
  const soId = isSo ? (props.salesOrderId as string) : PLACEHOLDER_UUID;

  // PO hook set.
  const poExternalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery(
    { purchaseOrderId: poId },
    { enabled: isPo }
  );
  const poInternalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId: poId },
    { enabled: isPo && isManagerOrOwner }
  );
  const poSignalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery(
    { purchaseOrderId: poId },
    { enabled: isPo }
  );

  // Sales hook set.
  const soExternalQuery = trpc.queries.salesOrderExternalReceipt.useQuery(
    { salesOrderId: soId },
    { enabled: isSo }
  );
  const soInternalQuery = trpc.queries.salesOrderInternalReceipt.useQuery(
    { salesOrderId: soId },
    { enabled: isSo && isManagerOrOwner }
  );
  const soSignalTextQuery = trpc.queries.salesOrderSignalText.useQuery(
    { salesOrderId: soId },
    { enabled: isSo }
  );

  const externalQuery = isPo ? poExternalQuery : soExternalQuery;
  const internalQuery = isPo ? poInternalQuery : soInternalQuery;
  const signalTextQuery = isPo ? poSignalTextQuery : soSignalTextQuery;

  const externalReceipt = externalQuery.data ?? null;
  const internalReceipt = internalQuery.data ?? null;

  const isLoading = externalQuery.isLoading || signalTextQuery.isLoading;
  const showEmpty = !isLoading && !externalReceipt && !internalReceipt;

  async function copySignalText() {
    const text = signalTextQuery.data;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard rejected — fall back is the user retrying after permission grant */
    }
  }

  const projection = audience === 'external' ? externalReceipt : internalReceipt;

  return (
    <section data-testid="receipt-panel" className="inline-panel" aria-label="Finalization receipt">
      <header className="control-band">
        <div role="tablist" aria-label="Receipt audience">
          <button
            type="button"
            role="tab"
            data-testid="receipt-tab-external"
            aria-selected={audience === 'external'}
            className={audience === 'external' ? 'primary-button compact-action' : 'secondary-button compact-action'}
            onClick={() => setAudience('external')}
          >
            External
          </button>
          {isManagerOrOwner ? (
            <button
              type="button"
              role="tab"
              data-testid="receipt-tab-internal"
              aria-selected={audience === 'internal'}
              className={audience === 'internal' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setAudience('internal')}
            >
              Internal
            </button>
          ) : null}
        </div>
        {audience === 'external' ? (
          <button
            type="button"
            data-testid="receipt-copy-signal"
            className="secondary-button compact-action"
            onClick={copySignalText}
            disabled={!signalTextQuery.data}
            title="Copy plain-text receipt for Signal"
          >
            Copy for Signal
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. Finalize the {isPo ? 'PO' : 'sale'} to produce one.</p>
      ) : projection ? (
        <ReceiptBody audience={audience} projection={projection} />
      ) : (
        <p className="page-subtitle">No {audience} receipt available.</p>
      )}
    </section>
  );
}

interface ReceiptLineLike {
  name: string;
  qty: number;
  unitPrice?: number;
  subtotal: number;
  notes?: string;
}

interface ProjectionLike {
  header: { title: string; counterparty: string; dateISO: string; documentNo: string };
  lines: ReceiptLineLike[];
  totals: { subtotal: number; adjustments?: number; total: number };
  footer?: { terms?: string; reference?: string };
  internalNotes?: string;
  cogs?: { perLine: Array<{ name: string; unitCost?: number; landedCost?: number }>; total: number };
  margin?: { perLine: Array<{ name: string; marginAbs: number; marginPct: number }>; total: number };
  diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
}

function ReceiptBody({ audience, projection }: { audience: TabAudience; projection: ProjectionLike }) {
  return (
    <div className="view-stack">
      {audience === 'internal' ? (
        <div className="selection-pill warning">INTERNAL — DO NOT SEND</div>
      ) : null}
      <div className="drawer-fact-row">
        <span>{projection.header.title}</span>
        <strong>{projection.header.documentNo}</strong>
      </div>
      <div className="drawer-fact-row">
        <span>To</span>
        <strong>{projection.header.counterparty}</strong>
      </div>
      <div className="drawer-fact-row">
        <span>Date</span>
        <strong>{projection.header.dateISO}</strong>
      </div>
      <table className="finder-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Subtotal</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {projection.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td>{l.qty}</td>
              <td>{l.unitPrice ?? '-'}</td>
              <td>{l.subtotal}</td>
              <td>{l.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="drawer-fact-row"><span>Subtotal</span><strong>{projection.totals.subtotal}</strong></div>
      {projection.totals.adjustments != null ? (
        <div className="drawer-fact-row"><span>Adjustments</span><strong>{projection.totals.adjustments}</strong></div>
      ) : null}
      <div className="drawer-fact-row"><span>Total</span><strong>{projection.totals.total}</strong></div>
      {projection.footer?.terms ? (
        <div className="drawer-fact-row"><span>Terms</span><strong>{projection.footer.terms}</strong></div>
      ) : null}
      {projection.footer?.reference ? (
        <div className="drawer-fact-row"><span>Ref</span><strong>{projection.footer.reference}</strong></div>
      ) : null}

      {audience === 'internal' && projection.internalNotes ? (
        <div className="inline-panel">
          <div className="section-title">Internal notes</div>
          <p>{projection.internalNotes}</p>
        </div>
      ) : null}
      {audience === 'internal' && projection.cogs ? (
        <div className="inline-panel">
          <div className="section-title">COGS</div>
          {projection.cogs.perLine.map((c, i) => (
            <div key={i} className="drawer-fact-row">
              <span>{c.name}</span>
              <strong>{c.landedCost ?? c.unitCost ?? '-'}</strong>
            </div>
          ))}
          <div className="drawer-fact-row"><span>Total COGS</span><strong>{projection.cogs.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.margin ? (
        <div className="inline-panel">
          <div className="section-title">Margin</div>
          {projection.margin.perLine.map((m, i) => (
            <div key={i} className="drawer-fact-row">
              <span>{m.name}</span>
              <strong>{m.marginAbs} ({m.marginPct}%)</strong>
            </div>
          ))}
          <div className="drawer-fact-row"><span>Total margin</span><strong>{projection.margin.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.diagnostics ? (
        <div className="inline-panel">
          <div className="section-title">Diagnostics</div>
          {projection.diagnostics.unresolvedSources?.length ? (
            <div className="drawer-fact-row">
              <span>Unresolved sources</span>
              <strong>{projection.diagnostics.unresolvedSources.join(', ')}</strong>
            </div>
          ) : null}
          {projection.diagnostics.legacyMarkers?.length ? (
            <div className="drawer-fact-row">
              <span>Legacy markers</span>
              <strong>{projection.diagnostics.legacyMarkers.join(', ')}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

Note: the only behavior change in the rendered tree is the new `Ref` row (line 178 area) — surfaced when `footer.reference` is set (which the invoice projection uses for the due-date ISO). The Phase 2 PO projector does not set `footer.reference`, so the existing PO render is byte-equivalent.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/client/components/ReceiptPanel.test.tsx
```

Expected: all 10 tests pass (6 original + 4 new sales-mode tests).

- [ ] **Step 5: Wire ReceiptPanel into SalesView**

Open `src/client/views/SalesView.tsx`. With the other component imports at the top (after `import { SaleLineExceptionControls } …` on line 10), add:

```tsx
import { ReceiptPanel } from '../components/ReceiptPanel';
```

Locate the Sale Builder `<WorkspacePanel>` block (starts ~line 541, closes ~line 620). The render currently ends with the `<OperatorGrid …>` at lines 597–619. INSIDE the WorkspacePanel, AFTER the closing `</div>` of the grid wrapper (the `<div className="mt-3">` block that wraps OperatorGrid closes at line 619), BEFORE the WorkspacePanel's closing `</WorkspacePanel>` tag at line 620, insert:

```tsx
            {['confirmed', 'posted', 'fulfilled'].includes(selectedOrderStatus) && selectedOrder ? (
              <div className="mt-3">
                <ReceiptPanel kind="sales_order" salesOrderId={String(selectedOrder.id)} />
              </div>
            ) : null}
```

The status whitelist matches the Phase 3 acceptance: `confirmed` → `sales_confirmation` snapshot is visible; `posted`/`fulfilled` → `invoice` snapshot wins per the procedure precedence. Drafts and cancelled orders never show the panel.

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 7: Run the broader UI test suite to catch regressions**

Run:
```bash
pnpm vitest run src/client/components src/client/views
```

Expected: green. If a test that touches `SalesView` was depending on the absence of `ReceiptPanel`, the only failure should be the line count or grid structure changing — adjust the test expectation, do not gut the new rendering.

- [ ] **Step 8: Update decisions log**

Open `docs/design-system/decisions-log.md`. Append at the bottom (the outer fence below uses 4 backticks so the inner ```ts block nests cleanly; paste the inner content as-is — the 4-backtick outer fence is just to display the entry verbatim in this plan):

````markdown
## 2026-05-21 — ReceiptPanel `kind` discriminator + Sales/Invoice wiring (#113 Phase 3)

**Widened component:** `src/client/components/ReceiptPanel.tsx` now accepts a discriminated `kind` prop:

```ts
type ReceiptPanelProps =
  | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never }
  | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never };
```

Backward compatible — existing `<ReceiptPanel purchaseOrderId={...} />` call sites keep working because `kind` defaults to `'purchase_order'`. The component issues both PO and sales hook sets unconditionally (rules of hooks) and toggles the inactive set via React Query's `enabled` option, so only one network round-trip per audience actually fires.

**Convention:** When a panel must dispatch between two parallel tRPC endpoints, prefer a discriminated-union prop type + `enabled: false` on the inactive hooks over conditional rendering of two near-identical panels. Keeps the visible markup in one place.

**Convention:** Sales receipt procedures resolve "which snapshot wins" inside the procedure (invoice live head first, then sales_confirmation fallback). The panel does not encode that precedence — it just renders whatever the procedure returned. One source of truth for the precedence rule.

**Convention:** `ReceiptPanel` renders inside the `Sale Builder` WorkspacePanel in `SalesView` (after the order lines grid). It is gated by `['confirmed', 'posted', 'fulfilled'].includes(selectedOrderStatus)` so drafts and cancelled orders never render a receipt.
````

- [ ] **Step 9: Regenerate the component inventory**

Run:
```bash
pnpm docs:inventory
```

Expected: `docs/design-system/components/_inventory.json` is regenerated. The `ReceiptPanel` entry should still be present (it was added in Phase 2); only its line count / hash may change.

- [ ] **Step 10: Commit**

```bash
git add src/client/components/ReceiptPanel.tsx \
        src/client/components/ReceiptPanel.test.tsx \
        src/client/views/SalesView.tsx \
        docs/design-system/decisions-log.md \
        docs/design-system/components/_inventory.json
git commit -m "feat(receipts): widen ReceiptPanel with sales_order kind + wire into SalesView (#113 Phase 3 Task 4)

ReceiptPanel now accepts a discriminated kind prop and dispatches its
three React Query hooks to either the PO or the sales tRPC procedures.
Inactive set passes enabled:false so React Query never fires the wrong
fetch. Existing PO call site keeps working (kind defaults to
'purchase_order').

SalesView renders the panel inside the Sale Builder WorkspacePanel when
the selected order is at confirmed, posted, or fulfilled status. The
sales procedures decide whether to surface an invoice or a sales
confirmation snapshot (invoice wins when both exist).

Decisions-log + design-system inventory updated."
```

---

## Task 5: Full verification

This is the proof-gate task. Do not skip steps.

- [ ] **Step 1: Typecheck the whole repo**

Run:
```bash
pnpm typecheck
```

Expected: no errors. If there are pre-existing errors unrelated to this work, document them and continue; otherwise fix.

- [ ] **Step 2: Run every test touched or added by this work**

Run:
```bash
pnpm vitest run \
  src/server/services/documentSnapshots.test.ts \
  src/server/services/projections \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/salesConfirmationReceipts.test.ts \
  src/server/services/invoiceReceipts.test.ts \
  src/server/routers/queries.receipts.test.ts \
  src/server/routers/queries.salesReceipts.test.ts \
  src/client/components/ReceiptPanel.test.tsx
```

Expected: all suites green. 7 + 8 = 15 new unit tests in the helper suites, 9 new tests in the router suite, 4 new tests in the panel suite — plus the existing Phase 1 + Phase 2 suites still green.

- [ ] **Step 3: Run the broader unit test suite to catch regressions**

Run:
```bash
pnpm vitest run
```

Expected: all green. If pre-existing failures unrelated to receipts exist, list them but do not fix them in this branch.

- [ ] **Step 4: Browser proof — confirm a sales order and verify the confirmation receipt**

Set up the live local app (terminal session, separate from the test run):

```bash
pnpm dev
```

Then in a second terminal start Playwright in headed mode (or use the dev browser directly) against `http://127.0.0.1:5173` and:

1. Sign in as a `manager` (or `owner`) user.
2. Navigate to **Sales**.
3. Pick or create a customer with a non-empty credit limit and a healthy balance.
4. Start a new sale shell, add at least one line that has:
   - `qty > 0`, `unitPrice > 0`, `unitCost > 0` (so internal margin is meaningful).
   - For one line, leave `unitCostResolved = false` and set a `sourceRowKey` or a `legacy_status_marker` so the diagnostics block has something to display.
5. Set an order-level `notes` value (e.g., `"deliver to dock 3"`).
6. Click **Price + Confirm** (this fires `priceSalesOrder` then `confirmSalesOrder`).
7. Confirm the order row status flips to `confirmed`.
8. Confirm the `<ReceiptPanel data-testid="receipt-panel">` block appears INSIDE the Sale Builder, below the order lines grid.
9. Confirm the External tab is selected by default and shows:
   - Title `Sales Confirmation`
   - Customer name (counterparty)
   - The lines with `displayName ?? itemName`, qty, unit, subtotal
   - The `notes` value as the `Terms` row
10. Confirm the External tab does NOT show any of: a numeric COGS / margin / `unit cost`, the string `"sheet:Q1"` (legacy marker), the source row key, the unresolved-source text, or any "INTERNAL" warning pill.
11. Click the **Internal** tab. Confirm the "INTERNAL — DO NOT SEND" pill is visible, plus the COGS / Margin / Diagnostics blocks with the data from Step 4.
12. Switch back to External. Click **Copy for Signal**. Paste into a scratch file and confirm:
    - It is plain text (no HTML tags).
    - It contains `Sales Confirmation <SO-NO>`, `To: <customer>`, the line(s), and `Total: <total>`.
    - It does NOT contain any internal-only values.

- [ ] **Step 5: Browser proof — post the sales order and verify the invoice receipt**

Still in the live app, against the same SO from Step 4:

1. Click **Reserve** (the flow Phase 2's "Price + Confirm" button does NOT do; you need an explicit reserve step before posting). Then click **Post Sale** (or whatever the current UI label is for the next action after `confirmed` — runs `postSalesOrder`).
2. Confirm the SO row status flips to `posted`.
3. Confirm an `INV-…` invoice number appears in the customer ledger / invoice list.
4. Re-open the same SO. Confirm the ReceiptPanel:
   - Now renders an **Invoice** projection (header title `Invoice`, `documentNo` = the invoice number).
   - Shows a `Ref` row with the due date ISO string.
   - Externally still strips all six internal-only line keys (re-check).
5. Click **Internal** and confirm COGS / Margin / Diagnostics reflect the posted invoice (numbers should match Step 4's confirmation since posting does not change line cost/price).
6. Click **Copy for Signal** on External. Confirm the text begins with `Invoice <INV-NO>`, not `Sales Confirmation`, proving the invoice precedence in the procedure.

- [ ] **Step 6: Browser proof — operator role visibility**

1. Sign out and sign back in as an `operator` (role lower than manager).
2. Reopen the same posted SO. Confirm:
   - The ReceiptPanel still renders.
   - The Internal tab is NOT rendered.
   - The Copy for Signal button still works on the External tab.

Capture screenshots of: External tab (manager, confirmed status), Internal tab (manager, confirmed status), External tab (manager, posted status with invoice), Internal tab (manager, posted), and External tab (operator). Save under `docs/superpowers/completion/2026-05-21-finalization-receipts-phase3/` with descriptive names:
- `receipt-sales-confirmation-external-manager.png`
- `receipt-sales-confirmation-internal-manager.png`
- `receipt-invoice-external-manager.png`
- `receipt-invoice-internal-manager.png`
- `receipt-invoice-external-operator.png`

- [ ] **Step 7: DB inspection — verify snapshot rows exist with correct identity**

From a `psql` shell against the dev database (substitute the actual SO id and invoice id observed in the browser proof):

```sql
SELECT id, kind, source_entity_type, source_entity_id, audience,
       status, supersedes_id, finalized_at
  FROM document_snapshots
 WHERE (source_entity_type = 'sales_order'  AND source_entity_id = '<SO-id>')
    OR (source_entity_type = 'invoice'      AND source_entity_id = '<INV-id>')
 ORDER BY finalized_at;
```

Expected: 4 rows total — 2 with `kind='sales_confirmation'`, `source_entity_type='sales_order'` (one per audience) AND 2 with `kind='invoice'`, `source_entity_type='invoice'` (one per audience). All `status='finalized'`. The first pair has `supersedes_id IS NULL`; the second pair likewise has `supersedes_id IS NULL` (the invoice is a different entity, not an amendment of the confirmation).

- [ ] **Step 8: Browser proof — re-confirm path emits an amendment**

In the live app, on a fresh SO that you only confirm (do NOT post):

1. Confirm the SO. ReceiptPanel shows the confirmation.
2. Cancel the order, then start a new SO for the same customer (the codebase has no `unconfirmSalesOrder` command, so the re-confirm test uses a fresh order).
3. ALTERNATIVE — verify by running `confirmSalesOrder` twice on the same SO via the JSON tRPC tool (if available) or directly via psql by setting `status='draft'`, re-running `pnpm exec command:run confirmSalesOrder`, and confirming the second hook fires.

DB inspection after the second confirm:

```sql
SELECT id, audience, supersedes_id, finalized_at
  FROM document_snapshots
 WHERE source_entity_type='sales_order' AND source_entity_id='<SO-id>'
 ORDER BY finalized_at;
```

Expected: 4 rows for that SO. The two newer rows have `supersedes_id` pointing at the matching older row of the same audience. The newer two are the live heads. All four are `status='finalized'`.

(If the codebase does not yet expose a way to re-trigger `confirmSalesOrder` on an already-confirmed SO, document this as a verification gap in the closeout note — the unit-level supersession test in `salesConfirmationReceipts.test.ts` Step 1 still proves the helper's behavior.)

- [ ] **Step 9: Write the closeout note**

Create `docs/superpowers/completion/2026-05-21-finalization-receipts-phase3.md`:

```markdown
# Finalization Receipts — Phase 3 (Sales Confirmation + Invoice) Closeout

**QA tier:** Deep QA (per spec §1 + the global Deep QA gate — persisted data mutations, projection-leak surface, money-relevant workflow).

**Reviewer pass:** `risk-verifier` (canonical Deep QA closeout). Stack a `cross-reviewer` only if the first pass flags a runtime concern.

**Commands run:**
- `pnpm typecheck` → clean
- `pnpm vitest run` (full suite) → all green
- `pnpm vitest run` against the 8 receipt-related files → all green
- Live browser proof on `http://127.0.0.1:5173` as `manager` and `operator`
- DB inspection of `document_snapshots` rows after confirm and post

**Spec coverage** (Phase 3 slice of issue #113):
- [x] confirmSalesOrder wired to draft + finalize snapshots → `createSalesConfirmationReceipts` hook in `executeCommand`
- [x] postSalesOrder wired to invoice snapshots → `createInvoiceReceipts` hook in `executeCommand`
- [x] Invoice receipt via the same pipeline → invoice projector + `sourceEntityType='invoice'`
- [x] Leak guards for internalMargin / unitCost / unitCostResolved / sourceRowKey / legacyMarker / candidateSourceText → runtime test in both helper suites + projector's existing allowlist
- [x] Receipt visible in Sales workspace for confirmed/posted/fulfilled → `SalesView` insertion under the Sale Builder WorkspacePanel
- [x] Manager-only Internal tab → server-side `assertRole` inside `getInternalReceipt` + client-side `isManagerOrOwner` gate
- [x] Copy for Signal → `salesOrderSignalText` procedure with invoice-first precedence
- [ ] Print receipt with internal watermark → DEFERRED to Phase 5
- [ ] Payment received / vendor payout receipts → DEFERRED to Phase 4

**Adversarial score:** ≥ 90/100 (Deep QA floor). Baseline 100, no reducers applied if all checks above are clean.

**Screenshots:** see `docs/superpowers/completion/2026-05-21-finalization-receipts-phase3/`.

**Remaining non-blockers:**
- Phase 4: payment_received / vendor_payout projector implementations + UI hooks
- Phase 5: print HTML rendering + watermark
- If re-confirm round-trip cannot be exercised in the live UI (no `unconfirmSalesOrder` command exists), note the verification gap; unit-level supersession test still proves the path.
```

- [ ] **Step 10: Commit and push the closeout note**

```bash
git add docs/superpowers/completion/2026-05-21-finalization-receipts-phase3.md \
        docs/superpowers/completion/2026-05-21-finalization-receipts-phase3/
git commit -m "docs(receipts): Phase 3 closeout + browser proof artifacts (#113)"
```

- [ ] **Step 11: Update the Linear issue and link the PR**

When the PR is opened, include in the body:
- The Linear issue ID for the Phase 3 sub-issue (if one exists) or a link to the #113 acceptance criteria.
- Path to the closeout note.
- Tier (Deep QA) and adversarial score.
- Browser screenshots inline.

PR title pattern: `feat(receipts): Phase 3 — sales confirmation + invoice receipts (#113)`.

---

## Self-Review Notes (writing-plans skill compliance)

Run through the post-write checklist from the writing-plans skill.

**Spec coverage:** every Phase 3 requirement from §3 of the issue spec has at least one task above. `confirmSalesOrder` and `postSalesOrder` wiring → Tasks 1 + 2. Invoice projector wiring with explicit invoice identity → Task 2. Leak guards on the six forbidden line keys → runtime test in Task 1 Step 1 and Task 2 Step 1, plus the projector's existing allowlist enforcement. The "no auto-post" rule is preserved because neither helper calls `postSalesOrder` — they only write `document_snapshots` rows. Print + watermark deferred to Phase 5 with rationale tied to spec §3.

**Placeholder scan:** no `TBD`, no `implement later`, no `similar to Task N`, no "add appropriate error handling" — every step has either code or an explicit command. The amendment-path step in Task 1 shows the full SQL needed to find the live head; the commandBus edits show the exact before/after snippets; the tRPC procedure block shows the complete dispatch logic including the small `latestInvoiceIdForOrder` helper.

**Type consistency:** `createSalesConfirmationReceipts` and `createInvoiceReceipts` are the same names across the helper files, the helper tests, the commandBus call sites, and the closeout summary. The tRPC procedure names (`salesOrderExternalReceipt`, `salesOrderInternalReceipt`, `salesOrderSignalText`) match in the router, the router test, and the React component. `ReceiptPanelProps`, `kind`, `purchaseOrderId`, and `salesOrderId` match between the component file, its test, and the SalesView call site. `SalesConfirmationInput` / `InvoiceInput` match the Phase 1 projector types verbatim. `sourceEntityType='sales_order'` (confirmation) vs `sourceEntityType='invoice'` (invoice) is consistent across helpers, tests, and procedure precedence logic.

**Cross-task references:** Task 1 Step 5 introduces the import + hook block; Task 2 Step 5 references it explicitly so the engineer doesn't accidentally duplicate the import line. Task 4 references the prior Phase 2 ReceiptPanel mocks so the engineer keeps the existing PO tests passing while widening the mock surface.
