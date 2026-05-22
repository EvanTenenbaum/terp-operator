# Finalization Receipts — Phase 2 (PO Workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 `document_snapshots` foundation into the live operator app so that finalizing a purchase order produces an external and an internal receipt projection, exposes both via tRPC queries, and surfaces them in a `ReceiptPanel` in the PO workspace with a "Copy for Signal" affordance — without modifying `postPurchaseReceipt` semantics or the existing PO finalize transaction.

**Architecture:** A post-commit hook in `executeCommand` invokes a new best-effort helper (`createPoFinalizationReceipts`) that re-queries the just-finalized PO via the raw `pool` (the PO transaction has already committed), assembles a `PurchaseFinalizationInput`, then runs the foundation's `createDraftSnapshot → finalizeSnapshot` pipeline for the `external` and `internal` audiences. Two new tRPC queries (`purchaseOrderExternalReceipt`, `purchaseOrderInternalReceipt`) plus a server-side `purchaseOrderSignalText` query (which calls `renderSignalText` on the server so the renderer stays in one place) feed a new `ReceiptPanel` component rendered under the PO selection summary in `OperationsViews.tsx`. The internal projection is gated by `assertRole(user, 'manager')` inside the existing service (Phase 1) — the panel hides the Internal tab when `me.role` is `operator` or `viewer`.

**Tech Stack:** TypeScript, drizzle-orm + raw `pg` `pool`, tRPC v10 (`protectedProcedure`), React + tRPC React Query hooks, Vitest with `vi.mock`, `@testing-library/react` for component tests, Playwright for browser proof.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/server/services/poFinalizationReceipts.ts` | **Create** | The helper `createPoFinalizationReceipts(pool, purchaseOrderId, commandId, userId)`; assembles `PurchaseFinalizationInput` and drives the snapshot service pipeline for both audiences with amendment-aware supersession. Pure server module; no UI imports. |
| `src/server/services/poFinalizationReceipts.test.ts` | **Create** | Unit tests for the helper using a mocked `Pool` and `vi.mock('./documentSnapshots')`. Asserts SQL shape (no `SELECT *`), audience ordering, supersedesId handling for the unfinalize→re-finalize case, and best-effort failure semantics. |
| `src/server/services/commandBus.ts` | **Modify** (one localized edit in `executeCommand`, ~line 339-340 area) | Adds a single `try/catch` block that calls `createPoFinalizationReceipts` for `finalizePurchaseOrder` commands AFTER `db.transaction(...)` resolves and the JSONL/socket side-effects run. Never throws into the caller. |
| `src/server/routers/queries.ts` | **Modify** (append three procedures to `queriesRouter`) | Adds `purchaseOrderExternalReceipt`, `purchaseOrderInternalReceipt`, `purchaseOrderSignalText`. All three are `protectedProcedure`; the Internal one delegates the role gate to `getInternalReceipt` (already calls `assertRole(user, 'manager')` per `documentSnapshots.ts` line 438). |
| `src/server/routers/queries.receipts.test.ts` | **Create** | Caller-based router tests modeled on `queries.recoverySearch.test.ts`. Mocks `documentSnapshots` exports; asserts wiring, role-gated FORBIDDEN, and `signalText` null-passthrough behavior. |
| `src/client/components/ReceiptPanel.tsx` | **Create** | Read-only panel: External / Internal tabs (Internal hidden when role < manager), header + lines + totals rendering, "Copy for Signal" button on External tab, loading + empty state. tRPC hooks only — no direct DB or renderer imports. |
| `src/client/components/ReceiptPanel.test.tsx` | **Create** | jsdom + Testing Library tests. Mocks `trpc` and `useCommandRunner` per the existing `PricingPanel.test.tsx` pattern. Covers loading/empty/external/internal/copy paths and role gating. |
| `src/client/views/OperationsViews.tsx` | **Modify** (one localized insertion inside `PurchaseOrdersView`, around line 759-806) | Renders `<ReceiptPanel purchaseOrderId={selectedPo.id} />` after the PO header strip when `selectedPoStatus === 'finalized'` (or any later status — finalized snapshots persist through `approved/ordered/received`). Minimal: no other behavior changes. |
| `docs/design-system/decisions-log.md` | **Append** | Single dated entry documenting the new `ReceiptPanel` component + the "server-rendered Signal text via tRPC" decision. |
| `docs/design-system/components/_inventory.json` | **Regenerate** via `pnpm docs:inventory` | Captures the new component automatically. |

---

## Architecture decisions resolved in this plan

These are decisions I made while reading the actual code so the engineer does not have to relitigate them mid-task. If you disagree with any of them, stop and re-discuss before writing code — do not silently diverge.

1. **Post-tx hook location.** The receipt creation runs AFTER `db.transaction(...)` resolves in `executeCommand` (around lines 286–340 of `commandBus.ts`), BEFORE the function returns `storedResult` but AFTER the existing JSONL and socket-emit side effects. This keeps the snapshot creation in the same "best-effort downstream observer" position as the JSONL append, which is exactly the semantic the spec asks for ("non-fatal failure = warn + continue").

2. **Why `pool` not `tx`.** The snapshot service uses raw `pg` (`Pool` + `PoolClient`) because `finalizeSnapshot` runs its own `BEGIN/COMMIT` with `pg_advisory_xact_lock` (see `documentSnapshots.ts` lines 208–317). Nesting that inside the outer drizzle `tx` would (a) deadlock the advisory lock against itself and (b) tie snapshot durability to the PO transaction's success. The post-commit position guarantees the PO is already finalized when we ask the DB to read it back.

3. **Re-querying the PO is required, not avoidable.** The drizzle handler `finalizePurchaseOrder` returns only `{ affectedIds: [purchaseOrderId] }` (lines 1147–1152). The helper must do a fresh SELECT to assemble `PurchaseFinalizationInput`. The SQL uses explicit columns (spec §6 rule 3 forbids `SELECT *` on external projection paths, and the audit hook the spec ships with covers both Drizzle and raw SQL).

4. **Vendor name source.** `purchase_orders.vendor_id → vendors.id → vendors.name`. One LEFT JOIN in the PO SELECT picks it up. When `vendor_id IS NULL` (the schema allows it), the helper substitutes the string `"Unknown vendor"` so the external projection never carries `null` where the type expects `string`.

5. **Line subtotal computation.** `purchase_order_lines` has `qty` and `unit_cost` but no stored `subtotal` column (schema lines 177–208). The helper computes `subtotal = qty * unit_cost` per line. `unit_price` is irrelevant for a PO (POs price the buy from the vendor; `unit_cost` is the buy price).

6. **Margin / landed cost / diagnostics on a PO.** A PO at finalization time has no realized margin (that's a Sales/Invoice concern) and Phase 1 landed-cost is not yet wired into POs. Therefore the helper passes per-line `landedCost: undefined`, `margin: undefined`, and surfaces `legacy_marker` into `diagnostics.legacyMarkers` when present. The `purchaseFinalization` projector already handles undefined cogs/margin/diagnostics correctly (lines 84–155 of `purchaseFinalization.ts`).

7. **Idempotency replay does not re-emit receipts.** A replayed `finalizePurchaseOrder` command (same `idempotencyKey`) short-circuits at `commandBus.ts` lines 248–280 and returns the cached `CommandResult` without entering the winner path. Receipts were already created on the original successful execution, so this is correct. We do NOT add a side-effect hook on the replay path.

8. **Unfinalize → re-finalize handling.** The PO state machine permits `finalized → draft → finalized` via `unfinalizePurchaseOrder`. The second finalize would otherwise hit the `finalizeSnapshot` recheck rule that rejects a fresh draft when a live head already exists (`documentSnapshots.ts` lines 269–272). The helper therefore queries for any existing live snapshot per audience BEFORE creating the draft. If one exists, it passes `supersedesId` and the new snapshot amends the old one (predecessor stays `finalized` but ceases to be live — see Phase 1 §7). This is the spec-correct amendment path; do not paper over it with a `try/swallow`.

9. **Why a server-side `signalText` procedure instead of importing the renderer in the client.** `renderSignalText` lives in `src/server/services/documentSnapshots.ts` and the entire `documentSnapshots` module imports server-only `pg`, `assertRole`, and rbac code. Adding the renderer to a shared client/server module is plausible but expands surface area; for Phase 2 the cleanest move is a tiny tRPC `query` that calls `getExternalReceipt` then `renderSignalText` server-side and returns a `string | null`. One source of truth, zero client/server dependency mixing.

10. **All three new tRPC procedures are `protectedProcedure`, not `publicProcedure`.** The task brief mentioned `publicProcedure` for the external receipt query; that is wrong for this app — the operator console has no anonymous routes, and `protectedProcedure` is the project convention (see every other receipt-adjacent procedure in `queries.ts`). The internal projection's role gate is enforced inside `getInternalReceipt` via `assertRole(user, 'manager')`; the procedure does not need a second check.

---

## Mapping to GH issue #113 acceptance criteria

| #113 Acceptance criterion | Covered by |
| --- | --- |
| Purchase order finalization opens or leads to a finalization workspace with External and Internal receipt views | Tasks 3 + 4 (`ReceiptPanel` + wiring in `OperationsViews.tsx`) |
| Internal receipt includes margins/costs/internal notes (Phase 1 projector emits cogs/margin/diagnostics when present) | Tasks 1 + 3 (helper builds the input + panel renders cogs/diagnostics/internalNotes) |
| External receipt is vendor/customer-safe and generated by server-side allowlisted projection | Phase 1 (already shipped). Phase 2 verifies the wired-up path returns no internal fields. |
| Save draft, abandon, finalize, return-to-table state preservation | Task 1 (snapshots created at finalize; draft state lives in `purchase_orders` rows already) |
| Copy external receipt as Signal-friendly text | Tasks 2 + 3 (`purchaseOrderSignalText` query + Copy button) |
| Deep QA evidence includes external-leak tests proving no cost/margin/internal fields in external projections | Task 5 (verification re-runs Phase 1 leak tests + new fixture test in Task 1) |
| Print receipt with internal watermark | **Deferred to Phase 5** — out of scope for Phase 2 per spec §3. Plan does not implement print. |
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
- Path ends in `terp-operator-finalization-receipts-113-resume-20260520`
- Branch is `plan/finalization-receipts-113-resume-20260520`
- Top commit subject is `feat(receipts): Phase 1 shared snapshot foundation (#113)` (commit `86d68a6`)

If any of those don't match, STOP and resolve before continuing.

- [ ] **Step 2: Confirm Phase 1 tests still pass on this branch**

Run:
```bash
pnpm vitest run src/server/services/documentSnapshots.test.ts src/server/services/projections
```

Expected: all green. If any are red, fix the breakage before starting Phase 2 — the foundation is load-bearing for everything below.

---

## Task 1: Post-command receipt creation helper

**Files:**
- Create: `src/server/services/poFinalizationReceipts.ts`
- Create: `src/server/services/poFinalizationReceipts.test.ts`
- Modify: `src/server/services/commandBus.ts` (one new import + one new `try/catch` block in `executeCommand`)

- [ ] **Step 1: Write the failing test file**

Create `src/server/services/poFinalizationReceipts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createPoFinalizationReceipts } from './poFinalizationReceipts';
import { purchaseFinalization } from './projections/purchaseFinalization';

const PO_ID = '11111111-1111-1111-1111-111111111111';
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

function basePoRow() {
  return {
    id: PO_ID,
    po_no: 'PO-1001',
    vendor_id: 'v-1',
    vendor_name: 'Acme Farms',
    finalized_at: new Date('2026-05-21T12:00:00Z'),
    total: '120.50',
    internal_notes: 'paid in cash',
    external_notes: 'net 14'
  };
}

function baseLineRows() {
  return [
    {
      id: 'l-1',
      product_name: 'Sunset OG',
      qty: '2',
      unit_cost: '50.25',
      external_notes: 'Tier A',
      internal_notes: 'leftover from prior week',
      legacy_marker: null
    },
    {
      id: 'l-2',
      product_name: 'Blue Dream',
      qty: '1',
      unit_cost: '20.00',
      external_notes: null,
      internal_notes: null,
      legacy_marker: 'sheet:Q1'
    }
  ];
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createPoFinalizationReceipts', () => {
  it('queries the PO+vendor row, the lines, and the existing live snapshots per audience (4 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },          // PO+vendor JOIN
      { rows: baseLineRows() },         // lines
      { rows: [] },                     // existing external live snapshot id (none)
      { rows: [] }                      // existing internal live snapshot id (none)
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(pool.query).toHaveBeenCalledTimes(4);
    const firstSql = String(pool.query.mock.calls[0][0]);
    // Spec §6 rule 3: NO SELECT *, anywhere on external projection paths,
    // including raw SQL. The PO+vendor query enumerates columns explicitly.
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/po\.po_no/);
    expect(firstSql).toMatch(/v\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/product_name/);
    expect(linesSql).toMatch(/external_notes/);
    expect(linesSql).toMatch(/internal_notes/);
    expect(linesSql).toMatch(/legacy_marker/);
  });

  it('builds the external projection from PurchaseFinalizationInput and creates+finalizes one external snapshot', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] }, // no live external
      { rows: [] }  // no live internal
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    // First snapshot created should be the EXTERNAL audience.
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('purchase_finalization');
    expect(firstCall.sourceEntityType).toBe('purchase_order');
    expect(firstCall.sourceEntityId).toBe(PO_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(purchaseFinalization.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    // Payload is the external projection — no internal_notes, no diagnostics,
    // no cogs, no margin. The projector enforces this; the helper just feeds it.
    expect(firstCall.payload).toEqual(
      purchaseFinalization.external({
        vendorName: 'Acme Farms',
        poNo: 'PO-1001',
        dateISO: '2026-05-21T12:00:00.000Z',
        externalNotes: 'net 14',
        internalNotes: 'paid in cash',
        subtotal: 120.5,
        total: 120.5,
        lines: [
          { productName: 'Sunset OG', qty: 2, unitPrice: 50.25, subtotal: 100.5, externalNotes: 'Tier A', internalNotes: 'leftover from prior week' },
          { productName: 'Blue Dream', qty: 1, unitPrice: 20, subtotal: 20, externalNotes: undefined, internalNotes: undefined, diagnostics: { legacyMarkers: ['sheet:Q1'] } }
        ]
      })
    );
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({
      id: 'snap-id',
      finalizedBy: USER_ID
    });
  });

  it('creates+finalizes the INTERNAL snapshot as the second pair of calls', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(finalizeSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    // Internal projection MUST carry internalNotes and diagnostics.legacyMarkers
    const payload = secondCreate.payload as Record<string, unknown>;
    expect(payload.internalNotes).toBe('paid in cash');
    expect((payload.diagnostics as { legacyMarkers?: string[] })?.legacyMarkers).toContain('sheet:Q1');
  });

  it('amends an existing live snapshot via supersedesId on unfinalize→re-finalize', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [{ id: 'prior-external-id' }] }, // live external head exists
      { rows: [{ id: 'prior-internal-id' }] }  // live internal head exists
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: swallows errors and never throws into the caller', async () => {
    const pool = makePool([]);
    // No queued responses — pool.query default returns empty rows, so PO lookup
    // returns zero rows. The helper detects "PO not found" and logs+returns.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: a thrown error from the snapshot service is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
pnpm vitest run src/server/services/poFinalizationReceipts.test.ts
```

Expected: `Cannot find module './poFinalizationReceipts'` / `createPoFinalizationReceipts is not defined`.

- [ ] **Step 3: Implement the helper**

Create `src/server/services/poFinalizationReceipts.ts`:

```ts
import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { purchaseFinalization } from './projections/purchaseFinalization';
import type { Audience, PurchaseFinalizationInput } from './projections/types';

/**
 * Issue #113 Phase 2 — best-effort post-commit hook for `finalizePurchaseOrder`.
 *
 * Runs AFTER the PO transaction has committed (see commandBus.ts `executeCommand`).
 * Re-queries the PO + lines + vendor via the raw `pg` Pool because the snapshot
 * service is `pg`-native (it manages its own BEGIN/COMMIT with advisory locks
 * — see documentSnapshots.ts finalizeSnapshot). Nesting it under the outer
 * drizzle tx would deadlock the advisory lock against itself.
 *
 * Failure is non-fatal: a thrown SQL error, a missing PO row, or a snapshot
 * service rejection MUST NOT cause the PO command to surface as failed. The
 * PO is already finalized in the DB before this runs.
 *
 * Handles unfinalize→re-finalize: if a live snapshot already exists for the
 * (purchase_order, id, audience) triple, the new snapshot is created with
 * supersedesId set, so the amendment chain reflects the actual operator
 * activity (spec §7).
 */
export async function createPoFinalizationReceipts(
  pool: Pool,
  purchaseOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    // 1. PO header + vendor name. Explicit columns — no SELECT *, no
    //    schema leakage (spec §6 rule 3).
    const poRes = await pool.query(
      `SELECT po.id, po.po_no, po.vendor_id, po.finalized_at, po.total,
              po.internal_notes, po.external_notes,
              v.name AS vendor_name
         FROM purchase_orders po
         LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE po.id = $1
        LIMIT 1`,
      [purchaseOrderId]
    );
    const po = poRes.rows[0] as {
      id: string;
      po_no: string;
      vendor_id: string | null;
      finalized_at: Date | null;
      total: string;
      internal_notes: string | null;
      external_notes: string | null;
      vendor_name: string | null;
    } | undefined;
    if (!po) {
      console.warn(
        `[poFinalizationReceipts] purchase order ${purchaseOrderId} not found at post-commit time; skipping snapshot.`
      );
      return;
    }

    // 2. Lines. Explicit columns again.
    const linesRes = await pool.query(
      `SELECT id, product_name, qty, unit_cost,
              external_notes, internal_notes, legacy_marker
         FROM purchase_order_lines
        WHERE purchase_order_id = $1
        ORDER BY created_at`,
      [purchaseOrderId]
    );
    const lineRows = linesRes.rows as Array<{
      id: string;
      product_name: string;
      qty: string;
      unit_cost: string;
      external_notes: string | null;
      internal_notes: string | null;
      legacy_marker: string | null;
    }>;

    // 3. Build PurchaseFinalizationInput.
    const dateISO = (po.finalized_at ?? new Date()).toISOString();
    const subtotal = lineRows.reduce(
      (sum, l) => sum + Number(l.qty) * Number(l.unit_cost),
      0
    );
    const input: PurchaseFinalizationInput = {
      vendorName: po.vendor_name ?? 'Unknown vendor',
      poNo: po.po_no,
      dateISO,
      externalNotes: po.external_notes ?? undefined,
      internalNotes: po.internal_notes ?? undefined,
      subtotal,
      total: Number(po.total),
      lines: lineRows.map((l) => {
        const qty = Number(l.qty);
        const unitCost = Number(l.unit_cost);
        return {
          productName: l.product_name,
          qty,
          unitPrice: unitCost,
          subtotal: qty * unitCost,
          externalNotes: l.external_notes ?? undefined,
          internalNotes: l.internal_notes ?? undefined,
          // Phase 2 does not surface landed cost or margin for POs — those are
          // Sales-side / Phase 3+ concerns. legacy_marker is the only PO-level
          // diagnostic available at this time.
          diagnostics: l.legacy_marker
            ? { legacyMarkers: [l.legacy_marker] }
            : undefined
        };
      })
    };

    // 4. For each audience: find the existing live head (for amendment),
    //    then createDraft + finalize.
    await emitSnapshot(pool, 'external', input, purchaseOrderId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, purchaseOrderId, commandId, userId);
  } catch (err) {
    console.warn(
      '[poFinalizationReceipts] receipt creation failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
  }
}

async function emitSnapshot(
  pool: Pool,
  audience: Audience,
  input: PurchaseFinalizationInput,
  purchaseOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  // Look up existing live head for this (PO, audience). Live = finalized,
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
    ['purchase_order', purchaseOrderId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload =
    audience === 'external'
      ? purchaseFinalization.external(input)
      : purchaseFinalization.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'purchase_finalization',
    sourceEntityType: 'purchase_order',
    sourceEntityId: purchaseOrderId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: purchaseFinalization.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/server/services/poFinalizationReceipts.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Wire the helper into `executeCommand`**

Open `src/server/services/commandBus.ts`. Add the import near the existing service imports (around line 84, with the other service imports):

```ts
import { createPoFinalizationReceipts } from './poFinalizationReceipts';
```

Then locate the success path in `executeCommand` (lines 286–341). Insert the new hook AFTER the socket-emit `try/catch` and BEFORE `return storedResult;`. The final block in `executeCommand` (around line 339) currently looks like:

```ts
    try {
      io.emit('command:completed', {
        commandId,
        commandName: input.name,
        actorId: user.id,
        affectedIds: commandResult.affectedIds,
        toast: storedResult.toast
      });
    } catch (e) {
      console.warn('[commandBus] socket emit failed after commit:', e instanceof Error ? e.message : e);
    }

    return storedResult;
```

Change it to:

```ts
    try {
      io.emit('command:completed', {
        commandId,
        commandName: input.name,
        actorId: user.id,
        affectedIds: commandResult.affectedIds,
        toast: storedResult.toast
      });
    } catch (e) {
      console.warn('[commandBus] socket emit failed after commit:', e instanceof Error ? e.message : e);
    }

    // Issue #113 Phase 2 — best-effort PO finalization receipt creation.
    // Runs AFTER the PO transaction commits and AFTER existing observers
    // (JSONL, socket) so a snapshot failure cannot fail the PO command.
    // createPoFinalizationReceipts itself catches and logs internally, but
    // we double-guard here so an unexpected synchronous throw still cannot
    // propagate. See src/server/services/poFinalizationReceipts.ts for the
    // amendment-aware logic and the choice of `pool` over `tx`.
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

    return storedResult;
```

- [ ] **Step 6: Typecheck the modified commandBus**

Run:
```bash
pnpm typecheck
```

Expected: no new errors. (`pool` is already imported on line 9.)

- [ ] **Step 7: Re-run the helper test plus Phase 1 tests as a regression bar**

Run:
```bash
pnpm vitest run src/server/services/poFinalizationReceipts.test.ts src/server/services/documentSnapshots.test.ts src/server/services/projections
```

Expected: all green. Phase 1 tests still pass; new Phase 2 unit tests pass.

- [ ] **Step 8: Commit**

Run:
```bash
git add src/server/services/poFinalizationReceipts.ts src/server/services/poFinalizationReceipts.test.ts src/server/services/commandBus.ts
git commit -m "feat(receipts): PO finalization snapshot hook (#113 Phase 2 Task 1)

Best-effort post-commit hook in executeCommand that re-queries the
just-finalized PO via the raw pool, builds PurchaseFinalizationInput,
and runs createDraftSnapshot + finalizeSnapshot for both audiences.
Handles unfinalize→re-finalize via supersedesId. Never throws into
the PO command result."
```

---

## Task 2: tRPC receipt query endpoints

**Files:**
- Modify: `src/server/routers/queries.ts` (append three procedures)
- Create: `src/server/routers/queries.receipts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/queries.receipts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { queriesRouter } from './queries';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const PO_ID = '11111111-1111-1111-1111-111111111111';

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

function makeExternalProjection(): ExternalReceiptProjection {
  return {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
    totals: { subtotal: 100, total: 100 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalProjection(): InternalReceiptProjection {
  return {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
    lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
    totals: { subtotal: 100, total: 100 },
    projectionVersion: 1,
    internalNotes: 'paid in cash',
    __INTERNAL_ONLY__: true
  };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('purchaseOrderExternalReceipt', () => {
  it('returns the projection from getExternalReceipt for the given PO id', async () => {
    const projection = makeExternalProjection();
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('operator');
    const result = await caller.purchaseOrderExternalReceipt({ purchaseOrderId: PO_ID });

    expect(result).toEqual(projection);
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(
      expect.anything(), // pool
      'purchase_order',
      PO_ID
    );
  });

  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.purchaseOrderExternalReceipt({ purchaseOrderId: PO_ID })).toBeNull();
  });
});

describe('purchaseOrderInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    const projection = makeInternalProjection();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);

    const caller = makeCaller('manager');
    expect(await caller.purchaseOrderInternalReceipt({ purchaseOrderId: PO_ID })).toEqual(projection);
  });

  it('throws FORBIDDEN for operator role (assertRole inside getInternalReceipt fires)', async () => {
    // Real service behavior: assertRole(user, "manager") throws TRPCError(FORBIDDEN)
    // for operator. We spy with a passthrough that runs assertRole logic by
    // invoking the actual implementation — but to keep the test isolated we
    // simply make the mock throw the same error the service would throw.
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.purchaseOrderInternalReceipt({ purchaseOrderId: PO_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
  });
});

describe('purchaseOrderSignalText', () => {
  it('returns the rendered signal text when an external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalProjection());

    const caller = makeCaller('operator');
    const result = await caller.purchaseOrderSignalText({ purchaseOrderId: PO_ID });

    expect(result).toBeTypeOf('string');
    expect(result).toContain('Purchase Order PO-1001');
    expect(result).toContain('To: Acme Farms');
    expect(result).toContain('- Sunset OG x 2 @ 50 = 100');
    expect(result).toContain('Total: 100');
    // Plain text only — no HTML tags.
    expect(result).not.toMatch(/<[^>]+>/);
  });

  it('returns null when no external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.purchaseOrderSignalText({ purchaseOrderId: PO_ID })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/server/routers/queries.receipts.test.ts
```

Expected: failures referencing `purchaseOrderExternalReceipt is not a function` / undefined procedures.

- [ ] **Step 3: Add the three procedures**

Open `src/server/routers/queries.ts`.

At the top of the file, with the other service imports (after the `getCloseoutSafety` import on line 7), add:

```ts
import { getExternalReceipt, getInternalReceipt, renderSignalText } from '../services/documentSnapshots';
```

Then append the three procedures to `queriesRouter`. They should go near the existing `relatedCommands` / `paymentAllocationPreview` block (after `receiptPreview` ends at roughly line 484). Find the closing brace of `receiptPreview` and insert after the comma:

```ts
  purchaseOrderExternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
    }),
  purchaseOrderInternalReceipt: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Role gate is enforced inside getInternalReceipt via assertRole(user, 'manager')
      // (see src/server/services/documentSnapshots.ts). We pass ctx.user through
      // unchanged — the service throws TRPCError(FORBIDDEN) when role < manager.
      return getInternalReceipt(pool, ctx.user, 'purchase_order', input.purchaseOrderId);
    }),
  purchaseOrderSignalText: protectedProcedure
    .input(z.object({ purchaseOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'purchase_order', input.purchaseOrderId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/server/routers/queries.receipts.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/queries.ts src/server/routers/queries.receipts.test.ts
git commit -m "feat(receipts): tRPC queries for PO external/internal/signal-text (#113 Phase 2 Task 2)

Three new protectedProcedures on queriesRouter:
  • purchaseOrderExternalReceipt → getExternalReceipt
  • purchaseOrderInternalReceipt → getInternalReceipt (manager+ via assertRole inside service)
  • purchaseOrderSignalText      → renderSignalText(external)

Internal role gate stays inside the service (one source of truth)."
```

---

## Task 3: ReceiptPanel UI component

**Files:**
- Create: `src/client/components/ReceiptPanel.tsx`
- Create: `src/client/components/ReceiptPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/client/components/ReceiptPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const externalQueryMock = vi.fn();
const internalQueryMock = vi.fn();
const signalTextQueryMock = vi.fn();
const meQueryMock = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      purchaseOrderExternalReceipt: { useQuery: (input: unknown, options: unknown) => externalQueryMock(input, options) },
      purchaseOrderInternalReceipt: { useQuery: (input: unknown, options: unknown) => internalQueryMock(input, options) },
      purchaseOrderSignalText: { useQuery: (input: unknown, options: unknown) => signalTextQueryMock(input, options) }
    },
    auth: {
      me: { useQuery: () => meQueryMock() }
    }
  }
}));

import { ReceiptPanel } from './ReceiptPanel';

const PO_ID = '11111111-1111-1111-1111-111111111111';

const externalProjection = {
  kind: 'purchase_finalization',
  header: { title: 'Purchase Order', counterparty: 'Acme Farms', dateISO: '2026-05-21T00:00:00.000Z', documentNo: 'PO-1001' },
  lines: [{ name: 'Sunset OG', qty: 2, unitPrice: 50, subtotal: 100 }],
  totals: { subtotal: 100, total: 100 },
  projectionVersion: 1
};

const internalProjection = {
  ...externalProjection,
  internalNotes: 'paid in cash',
  cogs: { perLine: [{ name: 'Sunset OG', landedCost: 40 }], total: 80 }
};

beforeEach(() => {
  externalQueryMock.mockReset();
  internalQueryMock.mockReset();
  signalTextQueryMock.mockReset();
  meQueryMock.mockReset();
  meQueryMock.mockReturnValue({ data: { role: 'manager' } });
});

describe('ReceiptPanel', () => {
  it('shows loading state while the external query is pending', () => {
    externalQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByTestId('receipt-panel')).toBeInTheDocument();
    expect(screen.getByText(/Loading receipt/i)).toBeInTheDocument();
  });

  it('shows empty state when no receipt has been finalized yet', () => {
    externalQueryMock.mockReturnValue({ data: null, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByText(/No receipt generated yet/i)).toBeInTheDocument();
  });

  it('renders the external projection on the External tab by default', () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'Purchase Order PO-1001\nTo: Acme Farms', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.getByTestId('receipt-tab-external')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Acme Farms')).toBeInTheDocument();
    expect(screen.getByText('Sunset OG')).toBeInTheDocument();
    // External tab must NOT show internalNotes / cogs.
    expect(screen.queryByText(/paid in cash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/landedCost/i)).not.toBeInTheDocument();
  });

  it('switches to the internal tab and shows internal-only fields when role is manager', () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-tab-internal'));
    expect(screen.getByTestId('receipt-tab-internal')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/paid in cash/i)).toBeInTheDocument();
    expect(screen.getByText(/INTERNAL.*DO NOT SEND/i)).toBeInTheDocument();
  });

  it('hides the Internal tab when role is operator', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: null, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('copies the signal text via navigator.clipboard.writeText when Copy is clicked', async () => {
    externalQueryMock.mockReturnValue({ data: externalProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'Purchase Order PO-1001\nTo: Acme Farms', isLoading: false });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReceiptPanel purchaseOrderId={PO_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Purchase Order PO-1001\nTo: Acme Farms');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run src/client/components/ReceiptPanel.test.tsx
```

Expected: `Cannot find module './ReceiptPanel'`.

- [ ] **Step 3: Implement the component**

Create `src/client/components/ReceiptPanel.tsx`:

```tsx
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { trpc } from '../api/trpc';

interface ReceiptPanelProps {
  purchaseOrderId: string;
}

type Audience = 'external' | 'internal';

/**
 * Issue #113 Phase 2 — read-only finalization receipt viewer for a PO.
 *
 * The panel fetches both audiences via tRPC (Internal returns null /
 * throws FORBIDDEN for non-manager users — we hide the tab and skip the
 * query for those roles to avoid noisy error toasts).
 *
 * "Copy for Signal" pulls the server-rendered plain-text string from
 * trpc.queries.purchaseOrderSignalText so the renderer stays in one place.
 */
export function ReceiptPanel({ purchaseOrderId }: ReceiptPanelProps) {
  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<Audience>('external');

  const externalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery({ purchaseOrderId });
  const internalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId },
    { enabled: isManagerOrOwner }
  );
  const signalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery({ purchaseOrderId });

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
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy for Signal
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. Finalize the PO to produce one.</p>
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

function ReceiptBody({ audience, projection }: { audience: Audience; projection: ProjectionLike }) {
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

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run src/client/components/ReceiptPanel.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/components/ReceiptPanel.tsx src/client/components/ReceiptPanel.test.tsx
git commit -m "feat(receipts): ReceiptPanel external/internal tabs + copy-for-signal (#113 Phase 2 Task 3)

Read-only panel that fetches both audiences via tRPC. Internal tab is
hidden for non-manager roles (mirrors the server-side assertRole gate
in getInternalReceipt). Copy for Signal pulls the server-rendered
plain-text string from purchaseOrderSignalText."
```

---

## Task 4: Wire ReceiptPanel into PurchaseOrdersView

**Files:**
- Modify: `src/client/views/OperationsViews.tsx` (one new import + one new render block in `PurchaseOrdersView`)

- [ ] **Step 1: Add the import**

Open `src/client/views/OperationsViews.tsx`. With the other component imports near the top (after `import { PhotographyQueuePanel } ...` on line 8), add:

```tsx
import { ReceiptPanel } from '../components/ReceiptPanel';
```

- [ ] **Step 2: Render ReceiptPanel under the PO selection summary**

Locate the `PurchaseOrdersView` block where `selectedPo` is rendered (around lines 759–806). Inside the `{selectedPo ? (` block, AFTER the `<section className="po-header-strip" …>` block (ends ~line 778) and BEFORE the `<OperatorGrid …>` for the lines (line 779), insert the panel. The current code reads:

```tsx
      {selectedPo ? (
        <>
          <section className="po-header-strip" aria-label="Selected purchase order summary">
            ...
          </section>
          <OperatorGrid
            view="purchaseOrders"
            title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
            ...
```

Change it to:

```tsx
      {selectedPo ? (
        <>
          <section className="po-header-strip" aria-label="Selected purchase order summary">
            ...
          </section>
          {['finalized', 'approved', 'ordered', 'partially_received', 'received'].includes(selectedPoStatus) ? (
            <ReceiptPanel purchaseOrderId={String(selectedPo.id)} />
          ) : null}
          <OperatorGrid
            view="purchaseOrders"
            title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
            ...
```

(Only the inserted three lines are new; do not touch the `<section …>` content or the `<OperatorGrid>` block.)

The status whitelist includes `approved`/`ordered`/`partially_received`/`received` because once a PO is finalized, its receipts persist through the rest of the lifecycle — they should keep displaying even after the operator advances the PO past `finalized`.

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): render ReceiptPanel in PurchaseOrdersView when PO is finalized (#113 Phase 2 Task 4)

Single-component insertion under the PO header strip for any PO at or
past 'finalized' status. No other behavior changes."
```

---

## Task 5: Documentation + design-system bookkeeping

**Files:**
- Modify: `docs/design-system/decisions-log.md` (append one dated entry)
- Regenerate: `docs/design-system/components/_inventory.json` via `pnpm docs:inventory`

- [ ] **Step 1: Append the decision-log entry**

Open `docs/design-system/decisions-log.md`. Append at the bottom:

```markdown
## 2026-05-21 — ReceiptPanel + server-rendered Signal text (#113 Phase 2)

**New component:** `src/client/components/ReceiptPanel.tsx` — read-only finalization receipt viewer with `external` / `internal` tabs, an "INTERNAL — DO NOT SEND" marker on the internal tab, and a "Copy for Signal" affordance on the external tab. Used in `OperationsViews.PurchaseOrdersView` under the PO header strip whenever the selected PO is at or past `finalized` status.

**Convention:** The signal-text renderer (`renderSignalText` in `src/server/services/documentSnapshots.ts`) is exposed via a dedicated tRPC query `queries.purchaseOrderSignalText` rather than imported into the client. Rationale: `documentSnapshots.ts` imports server-only `pg` and rbac code; copying the renderer into a shared module expands surface area unnecessarily. The tRPC indirection keeps the renderer in one place and lets us extend it (formatting, locale, watermark) without client redeploys.

**Convention:** Role-gated tRPC procedures should let the underlying service throw `TRPCError(FORBIDDEN)` via `assertRole(...)` rather than gating in the procedure body. `queries.purchaseOrderInternalReceipt` follows this pattern by passing `ctx.user` directly into `getInternalReceipt`. Single source of truth for the gate.
```

- [ ] **Step 2: Regenerate the component inventory**

Run:
```bash
pnpm docs:inventory
```

Expected: `docs/design-system/components/_inventory.json` is updated to include `ReceiptPanel`.

- [ ] **Step 3: Commit**

```bash
git add docs/design-system/decisions-log.md docs/design-system/components/_inventory.json
git commit -m "docs(design-system): record ReceiptPanel + server-rendered Signal text decision (#113)"
```

---

## Task 6: Full verification

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
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/documentSnapshots.test.ts \
  src/server/services/projections \
  src/server/routers/queries.receipts.test.ts \
  src/client/components/ReceiptPanel.test.tsx
```

Expected: all suites green.

- [ ] **Step 3: Run the broader unit test suite to catch regressions**

Run:
```bash
pnpm vitest run
```

Expected: all green. If pre-existing failures unrelated to receipts exist, list them but do not fix them in this branch.

- [ ] **Step 4: Browser proof — finalize a PO and confirm the receipt panel**

Set up the live local app (terminal session, separate from the test run):

```bash
pnpm dev
```

Then in a second terminal start Playwright in headed mode against `http://127.0.0.1:5173` and:

1. Sign in as a `manager` (or `owner`) user.
2. Navigate to **Purchase Orders**.
3. Create a new draft PO with at least one line that has `qty > 0` and `unitCost > 0`, plus an `internalNotes` value (e.g., `"paid in cash"`) and an `externalNotes` value (e.g., `"net 14"`).
4. Click **Finalize PO**.
5. Confirm the PO row status flips to `finalized`.
6. Confirm the `<ReceiptPanel data-testid="receipt-panel">` block appears under the PO header strip.
7. Confirm the External tab is selected by default and shows the vendor name, the line, the totals, and the externalNotes (terms) — but does NOT show `"paid in cash"`.
8. Click the **Internal** tab. Confirm the "INTERNAL — DO NOT SEND" pill is visible and that the internal notes string `"paid in cash"` appears.
9. Switch back to External. Click **Copy for Signal**. Paste the clipboard contents into a scratch file or the browser address bar and confirm:
   - It is plain text (no HTML tags).
   - It contains `Purchase Order <PO-NO>`, `To: <vendor>`, the line, and `Total: <total>`.
   - It does NOT contain the string `paid in cash`.
10. Sign out and sign back in as an `operator` (role lower than manager). Reopen the same finalized PO and confirm:
    - The Internal tab is NOT rendered.
    - The Copy for Signal button still works on the External tab.

Capture a screenshot of the External tab (manager) and the Internal tab (manager) and a screenshot of the operator-role view. Save them under `docs/superpowers/completion/2026-05-21-finalization-receipts-phase2/` with descriptive names (`receipt-external-manager.png`, `receipt-internal-manager.png`, `receipt-external-operator.png`).

- [ ] **Step 5: Browser proof — unfinalize → re-finalize (amendment path)**

Still in the live app:

1. On the same PO, click **Unfinalize** (visible in the row expansion when status is `finalized`).
2. Confirm the PO returns to `draft` status and the ReceiptPanel disappears (no longer past `finalized`).
3. Edit one line — change `qty` or `unitCost`. Save.
4. Click **Finalize PO** again.
5. Confirm a ReceiptPanel reappears with the new totals (proves the post-commit hook fired AGAIN and the amendment-via-`supersedesId` path worked instead of erroring out on the live-head invariant).

Optional check from a DB shell (`psql` against the dev database):

```sql
SELECT id, status, audience, supersedes_id, finalized_at
  FROM document_snapshots
 WHERE source_entity_type = 'purchase_order'
   AND source_entity_id = '<that-PO-id>'
 ORDER BY finalized_at;
```

Expected: 4 rows total — 2 originals (one per audience, no `supersedes_id`) and 2 amendments (one per audience, `supersedes_id` pointing at the matching original). All four are `status = 'finalized'`. The amendment rows are the live heads (no other row points to them via `supersedes_id`).

- [ ] **Step 6: Write the closeout note**

Create `docs/superpowers/completion/2026-05-21-finalization-receipts-phase2.md`:

```markdown
# Finalization Receipts — Phase 2 (PO Workspace) Closeout

**QA tier:** Deep QA (per spec §1; persisted data mutations + projection-leak surface).

**Reviewer pass:** `risk-verifier` (canonical Deep QA closeout). Stack a `cross-reviewer` only if the first pass flagged a runtime concern.

**Commands run:**
- `pnpm typecheck` → clean
- `pnpm vitest run` (full suite) → all green
- `pnpm vitest run` against the 5 new/touched files → all green
- Live browser proof on `http://127.0.0.1:5173` as `manager` and `operator`
- DB inspection of `document_snapshots` rows after unfinalize→re-finalize

**Spec coverage** (acceptance criteria from issue #113):
- [x] PO finalization opens to a finalization workspace with External/Internal tabs → ReceiptPanel wired into PurchaseOrdersView
- [x] Internal includes margins/costs/internal notes and is marked INTERNAL → "INTERNAL — DO NOT SEND" pill in ReceiptPanel
- [x] External is generated by server-side allowlisted projection → uses Phase 1 `purchaseFinalization.external` + `getExternalReceipt`
- [x] Save draft, finalize, return-to-table work → PO state machine unchanged; snapshots only fire on finalize
- [x] Copy external receipt as Signal-friendly text → tRPC `purchaseOrderSignalText` + Copy button + clipboard write
- [x] Deep QA evidence of no external leaks → unit test asserts `paid in cash` is not in external projection (Task 1); browser screenshot confirms manager External tab has no internal notes
- [ ] Print receipt with internal watermark → DEFERRED to Phase 5 per spec §3 (not in this scope)
- [ ] Payment received / vendor payout receipts → DEFERRED to Phase 4

**Adversarial score:** ≥ 90/100 required for Deep QA per global gate. Baseline 100, no reducers applied if all checks above are clean.

**Screenshots:** see `docs/superpowers/completion/2026-05-21-finalization-receipts-phase2/`

**Remaining non-blockers:**
- Phase 5: print HTML rendering + watermark
- Phase 3+: sales finalization receipts
- (none identified during browser proof — update if any surface)
```

- [ ] **Step 7: Commit and push the closeout note**

```bash
git add docs/superpowers/completion/2026-05-21-finalization-receipts-phase2.md docs/superpowers/completion/2026-05-21-finalization-receipts-phase2/
git commit -m "docs(receipts): Phase 2 closeout + browser proof artifacts (#113)"
```

- [ ] **Step 8: Update the Linear issue and link the PR**

When the PR is opened, include in the body:
- Linear issue ID for the Phase 2 sub-issue (if one exists) or a link to issue #113 acceptance criteria.
- Path to the closeout note.
- Tier (Deep QA) and adversarial score.
- Browser screenshots inline.

---

## Self-Review Notes (writing-plans skill compliance)

Run through the post-write checklist from the writing-plans skill.

**Spec coverage:** every Phase 2 spec requirement (commandBus wiring, tRPC queries, finalization workspace UI, finalize emits snapshot, postPurchaseReceipt NOT invoked, browser proof) has at least one task above. The "no auto-post" rule is satisfied implicitly because the helper never calls `postPurchaseReceipt` — it only writes `document_snapshots` rows. Print + watermark are explicitly deferred to Phase 5 with rationale tied to spec §3.

**Placeholder scan:** no `TBD`, no `implement later`, no `similar to Task N`, no "add appropriate error handling" — every step has either code or an explicit command. The amendment-path step in Task 1 shows the full SQL needed to find the live head; the commandBus edit shows the exact before/after snippet rather than a hand-wave.

**Type consistency:** `createPoFinalizationReceipts` is the same name across the helper file, the helper test, the commandBus call site, and the closeout summary. The tRPC procedure names (`purchaseOrderExternalReceipt`, `purchaseOrderInternalReceipt`, `purchaseOrderSignalText`) match in the router, the router test, and the React component. The component name `ReceiptPanel` matches across the component file, its test, the OperationsViews import, the decision log entry, and the design-system inventory regeneration step.
