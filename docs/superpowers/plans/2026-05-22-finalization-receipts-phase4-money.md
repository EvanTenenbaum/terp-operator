# Finalization Receipts — Phase 4 (Money Receipts: payment_received + vendor_payout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 `document_snapshots` foundation and the Phase 2/3 post-commit hook pattern to the money workspaces so that `logPayment` produces a `payment_received` snapshot pair (external + internal) keyed to `payments.id`, and `recordVendorPayment` produces a `vendor_payout` snapshot pair keyed to `vendor_payments.id`, both rendered through the shared `ReceiptPanel` in `PaymentsView` and `VendorBillTools`.

**Architecture:** Two new best-effort post-commit helpers — `createPaymentReceivedReceipts` (fires on `logPayment`) and `createVendorPayoutReceipts` (fires on `recordVendorPayment`) — re-query the just-inserted payment row via the raw `pg` `pool` after the drizzle transaction commits, assemble the `PaymentReceivedInput` / `VendorPayoutInput` shapes the Phase 1 projector stubs already accept (after the stubs are tightened to use the Phase 2/3 conditional-spread pattern for the optional `internalNotes` field), and drive `createDraftSnapshot → finalizeSnapshot` for both audiences. Six new tRPC procedures (`paymentExternalReceipt`, `paymentInternalReceipt`, `paymentSignalText`, `vendorPaymentExternalReceipt`, `vendorPaymentInternalReceipt`, `vendorPaymentSignalText`) mirror the PO/sales triples. The existing `ReceiptPanel` discriminated union is widened with two more kinds (`'payment' | 'vendor_payment'`) so it can dispatch to the new tRPC procedures while keeping the existing PO and sales call sites intact. `PaymentsView` renders the panel inside its existing `prelude` callback whenever a payment row is selected; `VendorBillTools` renders the panel after its payouts table whenever `chosenPaymentId` resolves to a real vendor payment.

**Tech Stack:** TypeScript, drizzle-orm + raw `pg` `pool`, tRPC v10 (`protectedProcedure`), React + tRPC React Query hooks, Vitest with `vi.mock`, `@testing-library/react` for component tests, Playwright for browser proof.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/server/services/projections/paymentReceived.ts` | **Modify** | Change `internal()` from `internalNotes: input.internalReconciliationNotes` (which assigns `internalNotes: undefined` when the input lacks the field — `Object.keys()` still surfaces that key) to the conditional-spread pattern Phase 2/3 use: `...(input.internalReconciliationNotes != null ? { internalNotes: input.internalReconciliationNotes } : {})`. Same fix applied to any future optional fields. External projector unchanged. |
| `src/server/services/projections/vendorPayout.ts` | **Modify** | Identical fix as above for the vendor-payout stub. |
| `src/server/services/paymentReceivedReceipts.ts` | **Create** | Helper `createPaymentReceivedReceipts(pool, paymentId, commandId, userId)`. Re-queries `payments` JOIN `customers` (one LEFT JOIN), assembles `PaymentReceivedInput`, drives the snapshot pipeline for `external` + `internal` audiences with amendment-aware supersession. Snapshot `kind = 'payment_received'`, `sourceEntityType = 'payment'`, `sourceEntityId = paymentId`. |
| `src/server/services/paymentReceivedReceipts.test.ts` | **Create** | Unit tests using a mocked `Pool` and `vi.mock('./documentSnapshots')`. Asserts SQL shape (no `SELECT *`), explicit columns enumerated, leak guard on the external payload (no `internalReconciliationNotes`, no `internalNotes`), supersedesId amendment path, best-effort failure semantics, fallback values (`paymentRef = reference ?? id`, `customerName = 'Unknown customer'` on null JOIN). |
| `src/server/services/vendorPayoutReceipts.ts` | **Create** | Helper `createVendorPayoutReceipts(pool, vendorPaymentId, commandId, userId)`. Re-queries `vendor_payments` JOIN `vendor_bills` JOIN `vendors`, assembles `VendorPayoutInput` (notes come from `vendor_bills.discrepancy_notes` because `vendor_payments` has no `notes` column — see Architecture Decision 9), drives the snapshot pipeline for both audiences. Snapshot `kind = 'vendor_payout'`, `sourceEntityType = 'vendor_payment'`, `sourceEntityId = vendorPaymentId`. |
| `src/server/services/vendorPayoutReceipts.test.ts` | **Create** | Mirror of `paymentReceivedReceipts.test.ts` but with the `vendor_payments → vendor_bills → vendors` JOIN and `vendorName = 'Unknown vendor'` fallback assertions. |
| `src/server/services/commandBus.ts` | **Modify** (two new imports + two new `try/catch` blocks in `executeCommand`) | Adds `createPaymentReceivedReceipts` for `logPayment` and `createVendorPayoutReceipts` for `recordVendorPayment`, both AFTER the drizzle transaction commits, AFTER the JSONL + socket observers run, double-guarded so a thrown error never propagates. Hook for `logPayment` reads `commandResult.affectedIds[0]` (payment.id). Hook for `recordVendorPayment` reads `commandResult.affectedIds[1]` (vendor_payment.id — `affectedIds[0]` is the bill id). |
| `src/server/routers/queries.ts` | **Modify** (append six procedures to `queriesRouter`) | Adds `paymentExternalReceipt`, `paymentInternalReceipt`, `paymentSignalText`, `vendorPaymentExternalReceipt`, `vendorPaymentInternalReceipt`, `vendorPaymentSignalText`. All `protectedProcedure`. Internal procedures rely on `assertRole(user, 'manager')` inside `getInternalReceipt` (single source of truth). Money receipts are leaf documents — no fallback chain (unlike sales where invoice supersedes confirmation). |
| `src/server/routers/queries.moneyReceipts.test.ts` | **Create** | Caller-based router tests modeled on `queries.salesReceipts.test.ts`. Mocks `documentSnapshots` exports; asserts wiring, role-gated `FORBIDDEN` for internal procedures, and `signalText` null-when-no-snapshot behavior for both payment and vendor_payment surfaces. |
| `src/client/components/ReceiptPanel.tsx` | **Modify** (extend discriminated `kind` prop + add two more hook sets) | Widens the union to `'purchase_order' \| 'sales_order' \| 'payment' \| 'vendor_payment'` (kept as separate union members for compile-time prop-id exclusivity). Adds two more React-Query hook triples (payment hooks gated by `isPayment`, vendor_payment hooks gated by `isVendorPayment`). All four hook sets are always invoked at the same call positions so rules-of-hooks holds; the inactive sets pass `enabled: false`. Renders a small label `Internal reconciliation notes` for money kinds when the internal payload carries `internalNotes`. |
| `src/client/components/ReceiptPanel.test.tsx` | **Modify** (add `kind="payment"` and `kind="vendor_payment"` describe blocks; keep all existing PO and sales tests passing) | Adds mocks for the six new tRPC procedure paths and asserts they are wired when the new kinds are passed, that the inactive PO/sales hook sets receive `enabled: false`, and that role gating still hides the internal tab for operator role. |
| `src/client/views/OperationsViews.tsx` | **Modify** (two import lines unchanged; two new render blocks inside `PaymentsView.prelude` and `VendorBillTools`) | Renders `<ReceiptPanel kind="payment" paymentId={String(selectedPayment.id)} />` inside `PaymentsView`'s `prelude` callback after `PaymentAllocationTools`, gated on `selectedPayment?.id`. Renders `<ReceiptPanel kind="vendor_payment" vendorPaymentId={String(chosenPaymentId)} />` inside `VendorBillTools` after the payouts table, gated on `chosenPaymentId && chosenPaymentId !== ''`. No other behavior changes. |
| `docs/design-system/decisions-log.md` | **Append** | Dated entry documenting the four-kind `ReceiptPanel` widening and the payment_received / vendor_payout receipt wiring. |
| `docs/design-system/components/_inventory.json` | **Regenerate** via `pnpm docs:inventory` | Captures the widened component automatically. |

---

## Architecture decisions resolved in this plan

These are decisions I made while reading the actual code so the engineer does not have to relitigate them mid-task. If you disagree with any of them, stop and re-discuss before writing code — do not silently diverge.

1. **Two helpers, not one.** `payment_received` and `vendor_payout` have different `kind`, different `sourceEntityType`, different source tables, and different ID-extraction rules (`affectedIds[0]` vs `affectedIds[1]`). Folding them into one helper would force a `mode` parameter, two divergent SQL paths, and a divergent test fixture set inside one file. Two focused files each follow the Phase 3 `salesConfirmationReceipts.ts` / `invoiceReceipts.ts` shape exactly.

2. **Post-tx hook location.** Both helpers run AFTER `db.transaction(...)` resolves in `executeCommand` (around lines 340–390 of `commandBus.ts`), AFTER the existing JSONL append, socket emit, and the three pre-existing Phase 2/3 receipt hooks, BEFORE the function returns `storedResult`. Each new hook gets its own `if (input.name === '…')` guard and its own outer `try/catch`. They never share state.

3. **Why `pool` not `tx`.** Identical reasoning to Phase 2/3. The snapshot service runs its own `BEGIN/COMMIT` with `pg_advisory_xact_lock`; nesting inside the outer drizzle `tx` would deadlock and tie snapshot durability to the payment transaction. The post-commit position guarantees the payment row is already visible to a fresh `pool` query.

4. **`logPayment` ID extraction.** `logPayment` returns `affectedIds = [payment.id, customerId, ...optional allocation ids]`. The hook reads `commandResult.affectedIds[0]` and casts it as the payment id. Verified by reading `commandBus.ts` lines 2841 (`const affected = [payment.id, customerId]`) and 2884 (`return { … affectedIds: affected … }`).

5. **`recordVendorPayment` ID extraction.** `recordVendorPayment` returns `affectedIds = [billId, payment.id]` — the bill id is first, the vendor payment id is second. The hook reads `commandResult.affectedIds[1]`. Verified by reading `commandBus.ts` line 3030 (`return { … affectedIds: [billId, payment.id] … }`).

6. **`customerName` / `vendorName` fallback.** Both helpers use `LEFT JOIN` because the schema permits `customer_id` / `vendor_id` to be null (`onDelete: 'set null'`). When the JOIN returns null, the helpers substitute the literal strings `'Unknown customer'` and `'Unknown vendor'` per the user-supplied spec. This matches the Phase 3 convention exactly.

7. **`dateISO` source.** Both `payments.created_at` and `vendor_payments.created_at` are `NOT NULL` (`defaultNow()` via the `now()` helper). The helpers use `row.created_at.toISOString()`. This is the actual transaction timestamp captured inside the drizzle transaction (per `commandBus.ts` line 2836 for `logPayment` and line 3027 for `recordVendorPayment`), so the receipt's `dateISO` exactly matches the persisted row's `created_at`.

8. **`paymentRef` / `payoutRef` fallback.** Per the user-supplied spec: `paymentRef = reference ?? id` and `payoutRef = reference ?? id`. When the operator did not capture a method-specific reference (check number, wire reference, etc.), the receipt's `documentNo` falls back to the database UUID. This is deterministic, never null, and survives a re-query — which is what the Phase 1 projector type requires (`string`, not `string | undefined`).

9. **`vendor_payments` has no `notes` column — internal notes come from `vendor_bills.discrepancy_notes`.** Verified by reading `src/server/schema.ts` lines 413–422 (vendor_payments columns: `id`, `vendor_bill_id`, `purchase_order_id`, `amount`, `method`, `reference`, `status`, `created_at` only) and lines 394–411 (vendor_bills carries `discrepancy_notes: text`). The vendor-payout helper's JOIN therefore pulls `vb.discrepancy_notes` and maps it to `internalReconciliationNotes`. **Caveat to flag in the closeout summary:** if two payouts hit the same bill, both receipts will surface the SAME bill-level discrepancy notes — which is correct (the notes belong to the bill, not the payout) but worth documenting so future operators are not surprised.

10. **Stub projector hygiene — conditional spread.** The Phase 1 stubs at `paymentReceived.ts:85` and `vendorPayout.ts:83` currently do `internalNotes: input.internalReconciliationNotes`. When the input lacks the field, this still creates an own property `internalNotes: undefined` on the returned object. `JSON.stringify` drops the key during persistence, so the persisted shape is fine, but `Object.keys(obj).includes('internalNotes')` returns `true` — which leaks into any downstream code that walks own keys. Phase 2/3 fixed this by switching to the conditional-spread pattern (`...(input.internalNotes != null ? { internalNotes: input.internalNotes } : {})`); see `salesConfirmation.ts:155`, `purchaseFinalization.ts:151`, `invoice.ts:146`. Phase 4 brings the two stubs up to the same standard. No external behavior changes; the existing projector tests at `paymentReceived.test.ts` and `vendorPayout.test.ts` still pass because they only exercise paths where `internalReconciliationNotes` is set.

11. **`source_entity_type` migration is NOT needed.** Verified by reading the user's note (migration 0047 added `'payment'`, 0050 added `'vendor_payment'`) — the database CHECK constraint already accepts both new values. Phase 4 does NOT touch migrations.

12. **`ReceiptPanel` widening preserves rules-of-hooks.** The component currently calls two triples of hooks unconditionally (PO + sales). Phase 4 adds two more triples (payment + vendor_payment), bringing the total to four triples (12 hooks per render). All four are called at the same positions on every render; only one triple has `enabled: true` based on the `kind` prop. The placeholder UUID pattern (`'00000000-0000-0000-0000-000000000000'`) is reused for the inactive id slots so the hook signatures stay stable.

13. **Discriminated union is exclusive, not free-form.** New prop shape:

    ```ts
    type ReceiptPanelProps =
      | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never; paymentId?: never; vendorPaymentId?: never }
      | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never; paymentId?: never; vendorPaymentId?: never }
      | { kind: 'payment'; paymentId: string; purchaseOrderId?: never; salesOrderId?: never; vendorPaymentId?: never }
      | { kind: 'vendor_payment'; vendorPaymentId: string; purchaseOrderId?: never; salesOrderId?: never; paymentId?: never };
    ```

    This keeps the existing `<ReceiptPanel purchaseOrderId={...} />` call site working (kind defaults to `'purchase_order'`) and makes it a compile-time error to pass the wrong id for the chosen kind or to omit the required id.

14. **Money receipts have no fallback chain.** Unlike `salesOrderSignalText` (which prefers the invoice snapshot and falls back to the sales_confirmation snapshot), `paymentSignalText` and `vendorPaymentSignalText` are direct lookups — there is no second "newer" kind that could supersede them. The procedure body is therefore: `const projection = await getExternalReceipt(pool, kind, id); if (!projection) return null; return renderSignalText(projection);`.

15. **All new tRPC procedures are `protectedProcedure`.** Same convention as Phase 2/3 — every receipt-adjacent procedure in `queries.ts` is `protectedProcedure`. The internal projection's role gate stays inside `getInternalReceipt`.

16. **Nested-call hook gap (known limitation, NOT in scope to fix).** `logPayment` is also called as a helper from `postLedgerRow` (commandBus.ts:3176) for customer-direction ledger rows, and `recordVendorPayment` is called from `postVendorLedgerPayment` (commandBus.ts:3267) for `selected_bill` vendor allocations. In both cases the OUTER command is `postLedgerRow`, so `input.name !== 'logPayment'` and the Phase 4 hook does NOT fire. Payments created via the ledger UI will therefore NOT get a receipt in Phase 4. This is an intentional scope choice (the user spec wires only the direct `logPayment` and `recordVendorPayment` commands); document this as a Phase 5 follow-up. Do NOT add a `postLedgerRow` hook in Phase 4.

17. **`refundPayment` and `voidVendorPayment` do NOT supersede or void the receipt snapshot.** Identical reasoning to Phase 3 decision #14: the snapshot persists as historical evidence of what was recorded at the moment of the original payment. If a future business requirement needs to void the receipt when the payment is refunded, that is a Phase 5+ concern. Phase 4 only creates the snapshot at the `logPayment` / `recordVendorPayment` moment.

18. **Negative `logPayment` amounts (buyer credit) still emit a receipt.** When `amount < 0`, `logPayment` records a negative-amount payment as a buyer-credit ledger entry (commandBus.ts:2842–2848). The receipt is still emitted because `payments.id` is still in `affectedIds[0]`. The projection's `totals.subtotal` and `totals.total` will be negative, which is the correct presentation for a credit/refund.

19. **PaymentsView insertion point.** The receipt panel renders INSIDE the existing `prelude` callback of `<GridJourney view="payments" …>` at OperationsViews.tsx lines 983–988, AFTER `<PaymentAllocationTools selectedPayment={selectedPayment} />`, gated on `selectedPayment?.id`. This keeps the receipt visually anchored to the same selected row that drives the allocations panel.

20. **VendorBillTools insertion point.** The receipt panel renders INSIDE `VendorBillTools` (OperationsViews.tsx:1598–1696), AFTER the closing `</div>` of the optional `<div className="finder-table-wrap …"> … </div>` block (currently the last child before the closing `</section>` at line 1694), gated on `chosenPaymentId && chosenPaymentId !== ''`. This mirrors the PaymentsView placement — the receipt is anchored to the same selected payout that drives the void button.

---

## Architecture concerns to surface

These do NOT block Phase 4 but should be tracked durably (Linear or `docs/roadmap/phase-readiness/`) as Phase 5+ follow-ups:

- **Ledger-driven payments get no receipt.** Per Decision 16, payments created via `postLedgerRow → logPayment` are skipped because `input.name` is the outer command. The ledger UI is the primary back-office surface for batch payment entry; many real-world payments will originate there. Phase 5 should either (a) add a third hook on `postLedgerRow` that inspects the inner result and dispatches the right helper, or (b) refactor the receipt hooks to dispatch on a structured `commandResult.events` field instead of `input.name`.
- **Vendor payout internal notes come from the bill, not the payout.** Per Decision 9, two payouts against the same bill will show the same notes. If the operator needs per-payout reconciliation notes, the `vendor_payments` schema needs a `notes` column (separate migration + UI change). Phase 5 candidate.
- **Refund / void semantics.** Per Decision 17, neither `refundPayment` nor `voidVendorPayment` voids the snapshot. If the audit policy requires the receipt to be marked superseded or voided, that is a Phase 5 receipt-lifecycle task spanning both money and document kinds.
- **Multiple payment kinds in one selected row.** The PaymentsView grid does not distinguish payments by direction (`money_in` vs `buyer_credit`); both surface as a payment_received receipt. If the operator needs visually distinct receipt styling for buyer credits (negative total), that is a styling decision for Phase 5, not a data-model change.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Verify worktree and branch**

Run:

```bash
pwd
git rev-parse --abbrev-ref HEAD
git status --short
```

Expected:

```
/Users/evantenenbaum/work/terp-operator-receipts-phase4-113
plan/finalization-receipts-phase4-113
(empty or only the new plan file under docs/superpowers/plans/)
```

If the path or branch differs, STOP and re-create the worktree per the task brief.

- [ ] **Step 2: Run the agent doctor**

Run:

```bash
pnpm agent:doctor
```

Expected: reports the canonical TERP Operator repo. If it complains you are outside the canonical checkout, STOP.

- [ ] **Step 3: Baseline the Phase 1/2/3 receipt tests (must already pass)**

Run:

```bash
pnpm vitest run \
  src/server/services/projections \
  src/server/services/documentSnapshots.test.ts \
  src/server/services/documentSnapshots.types.test.ts \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/salesConfirmationReceipts.test.ts \
  src/server/services/invoiceReceipts.test.ts \
  src/server/routers/queries.receipts.test.ts \
  src/server/routers/queries.salesReceipts.test.ts \
  src/client/components/ReceiptPanel.test.tsx
```

Expected: all green. If anything is red, STOP and fix the baseline before touching Phase 4.

- [ ] **Step 4: Baseline typecheck**

Run:

```bash
pnpm typecheck
```

Expected: zero errors. If anything is red, STOP.

- [ ] **Step 5: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-22-finalization-receipts-phase4-money.md
git commit -m "docs(receipts): add Phase 4 (money receipts) implementation plan"
```

---

## Task 1: Payment-received receipts (`payment_received` snapshot pair)

**Files:**
- Modify: `src/server/services/projections/paymentReceived.ts` (tighten optional-field handling)
- Create: `src/server/services/paymentReceivedReceipts.ts`
- Create: `src/server/services/paymentReceivedReceipts.test.ts`
- Modify: `src/server/services/commandBus.ts` (add `logPayment` post-commit hook)

### Task 1.1: Tighten the `paymentReceived` projector stub

- [ ] **Step 1: Write a failing test that proves the stub currently surfaces `internalNotes` as an own key when the input lacks the field**

Append to `src/server/services/projections/paymentReceived.test.ts`:

```ts
describe('paymentReceived internal projector — optional internalNotes hygiene (Phase 4)', () => {
  const fixtureWithoutNotes = {
    customerName: 'Big Buyer Co',
    paymentRef: 'PAY-002',
    dateISO: '2026-05-22',
    amount: 250
    // intentionally no internalReconciliationNotes
  };

  it('internal projection omits internalNotes entirely when input has no internalReconciliationNotes', () => {
    const int = paymentReceived.internal(fixtureWithoutNotes);
    expect(int).not.toHaveProperty('internalNotes');
    expect(Object.keys(int)).not.toContain('internalNotes');
  });

  it('internal projection still includes internalNotes when input provides it', () => {
    const int = paymentReceived.internal({
      ...fixtureWithoutNotes,
      internalReconciliationNotes: 'partial allocation'
    });
    expect(int).toHaveProperty('internalNotes', 'partial allocation');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/server/services/projections/paymentReceived.test.ts`

Expected: the new `omits internalNotes entirely` test FAILS with a message that `Object.keys` includes `'internalNotes'` (because the stub assigns `internalNotes: undefined`). The other test passes.

- [ ] **Step 3: Apply the conditional-spread fix to `paymentReceived.ts`**

Edit `src/server/services/projections/paymentReceived.ts`. Replace lines 73–87 (the `internal()` function body) with:

```ts
  internal(input) {
    return {
      kind: 'payment_received',
      header: {
        title: 'Payment Received',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.paymentRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
      ...(input.internalReconciliationNotes != null
        ? { internalNotes: input.internalReconciliationNotes }
        : {}),
    };
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/server/services/projections/paymentReceived.test.ts`

Expected: all tests pass, including the existing Phase 1 leak test and the new Phase 4 hygiene tests.

- [ ] **Step 5: Re-run the persisted-shape suite to confirm no regression**

Run: `pnpm vitest run src/server/services/projections/persistedShape.test.ts`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/projections/paymentReceived.ts src/server/services/projections/paymentReceived.test.ts
git commit -m "fix(projections): paymentReceived internal omits internalNotes when input lacks it"
```

### Task 1.2: Create `paymentReceivedReceipts.ts` helper (TDD)

- [ ] **Step 1: Write the failing test file**

Create `src/server/services/paymentReceivedReceipts.test.ts` with this complete content:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createPaymentReceivedReceipts } from './paymentReceivedReceipts';
import { paymentReceived } from './projections/paymentReceived';

const PAY_ID = '11111111-1111-1111-1111-111111111111';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function basePaymentRow(overrides: Partial<{
  id: string; amount: string; reference: string | null; method: string;
  notes: string | null; created_at: Date; customer_name: string | null;
}> = {}) {
  return {
    id: PAY_ID,
    amount: '500.00',
    reference: 'CHK-1234',
    method: 'check',
    notes: 'partial allocation — 2 open invoices',
    created_at: new Date('2026-05-22T12:00:00.000Z'),
    customer_name: 'Big Buyer Co',
    ...overrides
  };
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createPaymentReceivedReceipts', () => {
  it('queries payment+customer JOIN and live snapshots per audience (3 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [basePaymentRow()] }, // payment + customer JOIN
      { rows: [] }, // external live-head lookup (no prior)
      { rows: [] }  // internal live-head lookup (no prior)
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(3);
    const firstSql = String(pool.query.mock.calls[0][0]);
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/p\.id/);
    expect(firstSql).toMatch(/p\.amount/);
    expect(firstSql).toMatch(/p\.reference/);
    expect(firstSql).toMatch(/p\.method/);
    expect(firstSql).toMatch(/p\.notes/);
    expect(firstSql).toMatch(/p\.created_at/);
    expect(firstSql).toMatch(/c\.name/);
    expect(firstSql).toMatch(/left join customers/i);
  });

  it('builds external projection with kind=payment_received, sourceEntityType=payment', async () => {
    const pool = makePool([
      { rows: [basePaymentRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('payment_received');
    expect(firstCall.sourceEntityType).toBe('payment');
    expect(firstCall.sourceEntityId).toBe(PAY_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(paymentReceived.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    const payload = firstCall.payload as Record<string, unknown>;
    const header = payload.header as Record<string, unknown>;
    expect(header.counterparty).toBe('Big Buyer Co');
    expect(header.documentNo).toBe('CHK-1234');
    expect(header.dateISO).toBe('2026-05-22T12:00:00.000Z');
    expect(payload.totals).toEqual({ subtotal: 500, total: 500 });
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({ id: 'snap-id', finalizedBy: USER_ID });
  });

  it('LEAK GUARD — external payload omits internalReconciliationNotes and internalNotes', async () => {
    const pool = makePool([
      { rows: [basePaymentRow({ notes: 'INTERNAL: partial allocation, see ticket #42' })] },
      { rows: [] }, { rows: [] }
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(externalCall.audience).toBe('external');
    const payload = externalCall.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('internalReconciliationNotes');
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('internalReconciliationNotes');
    expect(serialized).not.toContain('INTERNAL:');
  });

  it('internal projection carries internalNotes from payments.notes', async () => {
    const pool = makePool([
      { rows: [basePaymentRow({ notes: 'partial allocation — see ticket #42' })] },
      { rows: [] }, { rows: [] }
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const internalCall = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(internalCall.audience).toBe('internal');
    expect(internalCall.kind).toBe('payment_received');
    expect(internalCall.sourceEntityType).toBe('payment');
    const payload = internalCall.payload as { internalNotes?: string };
    expect(payload.internalNotes).toBe('partial allocation — see ticket #42');
  });

  it('paymentRef falls back to payment.id when reference is null; counterparty falls back to "Unknown customer" when JOIN is null', async () => {
    const pool = makePool([
      { rows: [basePaymentRow({ reference: null, customer_name: null })] },
      { rows: [] }, { rows: [] }
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    const header = (externalCall.payload as { header: Record<string, unknown> }).header;
    expect(header.documentNo).toBe(PAY_ID);
    expect(header.counterparty).toBe('Unknown customer');
  });

  it('amends via supersedesId when a prior live head exists per audience', async () => {
    const pool = makePool([
      { rows: [basePaymentRow()] },
      { rows: [{ id: 'prior-external-id' }] },
      { rows: [{ id: 'prior-internal-id' }] }
    ]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing payment row → warn + return, no snapshot created', async () => {
    const pool = makePool([{ rows: [] }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [basePaymentRow()] }, { rows: [] }, { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails with the expected "module not found" error**

Run: `pnpm vitest run src/server/services/paymentReceivedReceipts.test.ts`

Expected: FAIL with a "Cannot find module './paymentReceivedReceipts'" or "createPaymentReceivedReceipts is not exported" error.

- [ ] **Step 3: Write the helper implementation**

Create `src/server/services/paymentReceivedReceipts.ts` with this complete content:

```ts
import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { paymentReceived } from './projections/paymentReceived';
import type { Audience, PaymentReceivedInput } from './projections/types';

/**
 * Issue #113 Phase 4 — best-effort post-commit hook for `logPayment`.
 *
 * Runs AFTER the payment transaction has committed. Re-queries the payment +
 * customer via the raw `pg` Pool because the snapshot service manages its
 * own BEGIN/COMMIT with advisory locks.
 *
 * Snapshot identity:
 *   kind             = 'payment_received'
 *   sourceEntityType = 'payment'
 *   sourceEntityId   = paymentId
 *
 * Failure is non-fatal: errors are caught and logged; the logPayment
 * command result is never affected.
 */
export async function createPaymentReceivedReceipts(
  pool: Pool,
  paymentId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    const payRes = await pool.query(
      `SELECT p.id, p.amount, p.reference, p.method, p.notes, p.created_at,
              c.name AS customer_name
         FROM payments p
         LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.id = $1
        LIMIT 1`,
      [paymentId]
    );
    const pay = payRes.rows[0] as {
      id: string; amount: string; reference: string | null; method: string;
      notes: string | null; created_at: Date; customer_name: string | null;
    } | undefined;
    if (!pay) {
      console.warn(`[paymentReceivedReceipts] payment ${paymentId} not found at post-commit time; skipping snapshot.`);
      return;
    }

    const input: PaymentReceivedInput = {
      customerName: pay.customer_name ?? 'Unknown customer',
      paymentRef: pay.reference ?? pay.id,
      dateISO: pay.created_at.toISOString(),
      amount: Number(pay.amount),
      internalReconciliationNotes: pay.notes ?? undefined
    };

    await emitSnapshot(pool, 'external', input, paymentId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, paymentId, commandId, userId);
  } catch (err) {
    console.warn('[paymentReceivedReceipts] receipt creation failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function emitSnapshot(
  pool: Pool, audience: Audience, input: PaymentReceivedInput,
  paymentId: string, commandId: string, userId: string
): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots
      WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3
        AND status = 'finalized' AND voided_at IS NULL
        AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL)
      LIMIT 1`,
    ['payment', paymentId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload = audience === 'external'
    ? paymentReceived.external(input)
    : paymentReceived.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'payment_received',
    sourceEntityType: 'payment',
    sourceEntityId: paymentId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: paymentReceived.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/server/services/paymentReceivedReceipts.test.ts`

Expected: all 8 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/paymentReceivedReceipts.ts src/server/services/paymentReceivedReceipts.test.ts
git commit -m "feat(receipts): payment_received post-commit helper for logPayment"
```

### Task 1.3: Wire the helper into the `logPayment` post-commit hook

- [ ] **Step 1: Read the current commandBus.ts hook block**

Read `src/server/services/commandBus.ts` lines 365–390. Confirm the three existing receipt hooks (PO finalize, sales confirm, invoice post) are present in that order, each in its own `try/catch`, each guarded on `commandResult.ok && commandResult.affectedIds[0]`.

- [ ] **Step 2: Add the import**

Edit `src/server/services/commandBus.ts`. Find the existing line `import { createInvoiceReceipts } from './invoiceReceipts';` (currently line 111) and add immediately after it:

```ts
import { createPaymentReceivedReceipts } from './paymentReceivedReceipts';
```

- [ ] **Step 3: Add the post-commit hook**

Edit `src/server/services/commandBus.ts`. Find the closing `}` of the Phase 3 invoice hook (currently at line 388, immediately before `return storedResult;` on line 390). Insert immediately after that closing `}` and before `return storedResult;`:

```ts

    // Issue #113 Phase 4 — best-effort payment_received receipt creation.
    // Fires on direct logPayment commands only. Payments created indirectly
    // via postLedgerRow → logPayment do NOT trigger this hook (input.name is
    // 'postLedgerRow' in that case); see Phase 4 plan Decision 16.
    if (input.name === 'logPayment' && commandResult.ok && commandResult.affectedIds[0]) {
      try {
        await createPaymentReceivedReceipts(
          pool,
          commandResult.affectedIds[0],
          commandId,
          user.id
        );
      } catch (e) {
        console.warn('[commandBus] payment_received receipt hook failed after commit:', e instanceof Error ? e.message : e);
      }
    }
```

- [ ] **Step 4: Run the full receipts suite to catch regressions**

Run:

```bash
pnpm vitest run \
  src/server/services/projections \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/salesConfirmationReceipts.test.ts \
  src/server/services/invoiceReceipts.test.ts \
  src/server/services/paymentReceivedReceipts.test.ts \
  src/server/services/commandBus.test.ts
```

Expected: all green. (commandBus.test.ts may not exercise the new hook directly — that is fine; the hook is best-effort and the helper test already covers the helper's contract.)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(receipts): wire payment_received hook into logPayment post-commit"
```

---

## Task 2: Vendor-payout receipts (`vendor_payout` snapshot pair)

**Files:**
- Modify: `src/server/services/projections/vendorPayout.ts` (tighten optional-field handling)
- Create: `src/server/services/vendorPayoutReceipts.ts`
- Create: `src/server/services/vendorPayoutReceipts.test.ts`
- Modify: `src/server/services/commandBus.ts` (add `recordVendorPayment` post-commit hook)

### Task 2.1: Tighten the `vendorPayout` projector stub

- [ ] **Step 1: Write a failing test**

Append to `src/server/services/projections/vendorPayout.test.ts`:

```ts
describe('vendorPayout internal projector — optional internalNotes hygiene (Phase 4)', () => {
  const fixtureWithoutNotes = {
    vendorName: 'Acme Farms',
    payoutRef: 'WIRE-7788',
    dateISO: '2026-05-22',
    amount: 300
  };

  it('internal projection omits internalNotes entirely when input has no internalReconciliationNotes', () => {
    const int = vendorPayout.internal(fixtureWithoutNotes);
    expect(int).not.toHaveProperty('internalNotes');
    expect(Object.keys(int)).not.toContain('internalNotes');
  });

  it('internal projection still includes internalNotes when input provides it', () => {
    const int = vendorPayout.internal({
      ...fixtureWithoutNotes,
      internalReconciliationNotes: 'check stub mismatched by $0.50'
    });
    expect(int).toHaveProperty('internalNotes', 'check stub mismatched by $0.50');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/server/services/projections/vendorPayout.test.ts`

Expected: the `omits internalNotes entirely` test FAILS.

- [ ] **Step 3: Apply the conditional-spread fix**

Edit `src/server/services/projections/vendorPayout.ts`. Replace lines 71–85 (the `internal()` function body) with:

```ts
  internal(input) {
    return {
      kind: 'vendor_payout',
      header: {
        title: 'Vendor Payout',
        counterparty: input.vendorName,
        dateISO: input.dateISO,
        documentNo: input.payoutRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
      ...(input.internalReconciliationNotes != null
        ? { internalNotes: input.internalReconciliationNotes }
        : {}),
    };
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/server/services/projections/vendorPayout.test.ts src/server/services/projections/persistedShape.test.ts`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/projections/vendorPayout.ts src/server/services/projections/vendorPayout.test.ts
git commit -m "fix(projections): vendorPayout internal omits internalNotes when input lacks it"
```

### Task 2.2: Create `vendorPayoutReceipts.ts` helper (TDD)

- [ ] **Step 1: Write the failing test file**

Create `src/server/services/vendorPayoutReceipts.test.ts` with this complete content:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createVendorPayoutReceipts } from './vendorPayoutReceipts';
import { vendorPayout } from './projections/vendorPayout';

const VP_ID = '44444444-4444-4444-4444-444444444444';
const CMD_ID = '55555555-5555-5555-5555-555555555555';
const USER_ID = '66666666-6666-6666-6666-666666666666';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function baseVendorPaymentRow(overrides: Partial<{
  id: string; amount: string; reference: string | null; method: string;
  created_at: Date; vendor_name: string | null; discrepancy_notes: string | null;
}> = {}) {
  return {
    id: VP_ID,
    amount: '300.00',
    reference: 'WIRE-7788',
    method: 'wire',
    created_at: new Date('2026-05-22T15:30:00.000Z'),
    vendor_name: 'Acme Farms',
    discrepancy_notes: 'check stub mismatched by $0.50',
    ...overrides
  };
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createVendorPayoutReceipts', () => {
  it('queries vendor_payment+vendor_bill+vendor JOIN and live snapshots per audience (3 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(3);
    const firstSql = String(pool.query.mock.calls[0][0]);
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/vp\.id/);
    expect(firstSql).toMatch(/vp\.amount/);
    expect(firstSql).toMatch(/vp\.reference/);
    expect(firstSql).toMatch(/vp\.method/);
    expect(firstSql).toMatch(/vp\.created_at/);
    expect(firstSql).toMatch(/v\.name/);
    expect(firstSql).toMatch(/vb\.discrepancy_notes/);
    expect(firstSql).toMatch(/left join vendor_bills/i);
    expect(firstSql).toMatch(/left join vendors/i);
  });

  it('builds external projection with kind=vendor_payout, sourceEntityType=vendor_payment', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('vendor_payout');
    expect(firstCall.sourceEntityType).toBe('vendor_payment');
    expect(firstCall.sourceEntityId).toBe(VP_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(vendorPayout.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    const payload = firstCall.payload as Record<string, unknown>;
    const header = payload.header as Record<string, unknown>;
    expect(header.counterparty).toBe('Acme Farms');
    expect(header.documentNo).toBe('WIRE-7788');
    expect(header.dateISO).toBe('2026-05-22T15:30:00.000Z');
    expect(payload.totals).toEqual({ subtotal: 300, total: 300 });
  });

  it('LEAK GUARD — external payload omits internalReconciliationNotes and internalNotes', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow({ discrepancy_notes: 'INTERNAL: vendor underpaid by $0.50, see ticket #99' })] },
      { rows: [] }, { rows: [] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(externalCall.audience).toBe('external');
    const payload = externalCall.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('internalReconciliationNotes');
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('internalReconciliationNotes');
    expect(serialized).not.toContain('INTERNAL:');
    expect(serialized).not.toContain('ticket #99');
  });

  it('internal projection carries internalNotes from vendor_bills.discrepancy_notes', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow({ discrepancy_notes: 'short by $1.50; called vendor' })] },
      { rows: [] }, { rows: [] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const internalCall = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(internalCall.audience).toBe('internal');
    expect(internalCall.kind).toBe('vendor_payout');
    expect(internalCall.sourceEntityType).toBe('vendor_payment');
    const payload = internalCall.payload as { internalNotes?: string };
    expect(payload.internalNotes).toBe('short by $1.50; called vendor');
  });

  it('payoutRef falls back to vendor_payment.id when reference is null; counterparty falls back to "Unknown vendor" when JOIN is null', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow({ reference: null, vendor_name: null })] },
      { rows: [] }, { rows: [] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    const header = (externalCall.payload as { header: Record<string, unknown> }).header;
    expect(header.documentNo).toBe(VP_ID);
    expect(header.counterparty).toBe('Unknown vendor');
  });

  it('amends via supersedesId when a prior live head exists per audience', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow()] },
      { rows: [{ id: 'prior-external-id' }] },
      { rows: [{ id: 'prior-internal-id' }] }
    ]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing vendor_payment row → warn + return, no snapshot created', async () => {
    const pool = makePool([{ rows: [] }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm vitest run src/server/services/vendorPayoutReceipts.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the helper**

Create `src/server/services/vendorPayoutReceipts.ts` with this complete content:

```ts
import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { vendorPayout } from './projections/vendorPayout';
import type { Audience, VendorPayoutInput } from './projections/types';

/**
 * Issue #113 Phase 4 — best-effort post-commit hook for `recordVendorPayment`.
 *
 * Runs AFTER the vendor-payment transaction has committed. Re-queries the
 * vendor_payment + vendor_bill + vendor via the raw `pg` Pool because the
 * snapshot service manages its own BEGIN/COMMIT with advisory locks.
 *
 * Snapshot identity:
 *   kind             = 'vendor_payout'
 *   sourceEntityType = 'vendor_payment'
 *   sourceEntityId   = vendorPaymentId
 *
 * Internal reconciliation notes are sourced from `vendor_bills.discrepancy_notes`
 * because the `vendor_payments` table has no `notes` column (schema lines
 * 413–422). Caveat: two payouts against the same bill will surface the
 * SAME bill-level notes (the notes belong to the bill, not the payout).
 *
 * Failure is non-fatal: errors are caught and logged; the recordVendorPayment
 * command result is never affected.
 */
export async function createVendorPayoutReceipts(
  pool: Pool,
  vendorPaymentId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    const vpRes = await pool.query(
      `SELECT vp.id, vp.amount, vp.reference, vp.method, vp.created_at,
              v.name AS vendor_name,
              vb.discrepancy_notes AS discrepancy_notes
         FROM vendor_payments vp
         LEFT JOIN vendor_bills vb ON vb.id = vp.vendor_bill_id
         LEFT JOIN vendors v ON v.id = vb.vendor_id
        WHERE vp.id = $1
        LIMIT 1`,
      [vendorPaymentId]
    );
    const vp = vpRes.rows[0] as {
      id: string; amount: string; reference: string | null; method: string;
      created_at: Date; vendor_name: string | null; discrepancy_notes: string | null;
    } | undefined;
    if (!vp) {
      console.warn(`[vendorPayoutReceipts] vendor_payment ${vendorPaymentId} not found at post-commit time; skipping snapshot.`);
      return;
    }

    const input: VendorPayoutInput = {
      vendorName: vp.vendor_name ?? 'Unknown vendor',
      payoutRef: vp.reference ?? vp.id,
      dateISO: vp.created_at.toISOString(),
      amount: Number(vp.amount),
      internalReconciliationNotes: vp.discrepancy_notes ?? undefined
    };

    await emitSnapshot(pool, 'external', input, vendorPaymentId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, vendorPaymentId, commandId, userId);
  } catch (err) {
    console.warn('[vendorPayoutReceipts] receipt creation failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function emitSnapshot(
  pool: Pool, audience: Audience, input: VendorPayoutInput,
  vendorPaymentId: string, commandId: string, userId: string
): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots
      WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3
        AND status = 'finalized' AND voided_at IS NULL
        AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL)
      LIMIT 1`,
    ['vendor_payment', vendorPaymentId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload = audience === 'external'
    ? vendorPayout.external(input)
    : vendorPayout.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'vendor_payout',
    sourceEntityType: 'vendor_payment',
    sourceEntityId: vendorPaymentId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: vendorPayout.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm vitest run src/server/services/vendorPayoutReceipts.test.ts`

Expected: all 8 tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/vendorPayoutReceipts.ts src/server/services/vendorPayoutReceipts.test.ts
git commit -m "feat(receipts): vendor_payout post-commit helper for recordVendorPayment"
```

### Task 2.3: Wire the helper into the `recordVendorPayment` post-commit hook

- [ ] **Step 1: Add the import**

Edit `src/server/services/commandBus.ts`. Find the line `import { createPaymentReceivedReceipts } from './paymentReceivedReceipts';` (added in Task 1.3) and add immediately after it:

```ts
import { createVendorPayoutReceipts } from './vendorPayoutReceipts';
```

- [ ] **Step 2: Add the post-commit hook**

Edit `src/server/services/commandBus.ts`. Find the closing `}` of the Task 1.3 `logPayment` hook block (the block introduced in Task 1.3, immediately before `return storedResult;`). Insert immediately after that closing `}`:

```ts

    // Issue #113 Phase 4 — best-effort vendor_payout receipt creation.
    // Fires on direct recordVendorPayment commands only. Payouts created
    // indirectly via postLedgerRow → postVendorLedgerPayment → recordVendorPayment
    // do NOT trigger this hook (input.name is 'postLedgerRow' in that case);
    // see Phase 4 plan Decision 16.
    //
    // recordVendorPayment returns affectedIds = [billId, vendorPaymentId].
    // The vendor payment id is at index 1, NOT 0.
    if (input.name === 'recordVendorPayment' && commandResult.ok && commandResult.affectedIds[1]) {
      try {
        await createVendorPayoutReceipts(
          pool,
          commandResult.affectedIds[1],
          commandId,
          user.id
        );
      } catch (e) {
        console.warn('[commandBus] vendor_payout receipt hook failed after commit:', e instanceof Error ? e.message : e);
      }
    }
```

- [ ] **Step 3: Run the full receipts suite**

Run:

```bash
pnpm vitest run \
  src/server/services/projections \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/salesConfirmationReceipts.test.ts \
  src/server/services/invoiceReceipts.test.ts \
  src/server/services/paymentReceivedReceipts.test.ts \
  src/server/services/vendorPayoutReceipts.test.ts
```

Expected: all green.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(receipts): wire vendor_payout hook into recordVendorPayment post-commit"
```

---

## Task 3: tRPC procedures + router tests

**Files:**
- Modify: `src/server/routers/queries.ts` (append six `protectedProcedure` definitions to `queriesRouter`)
- Create: `src/server/routers/queries.moneyReceipts.test.ts`

### Task 3.1: Router tests first (TDD)

- [ ] **Step 1: Write the failing test file**

Create `src/server/routers/queries.moneyReceipts.test.ts` with this complete content:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { TRPCError } from '@trpc/server';
import * as documentSnapshots from '../services/documentSnapshots';
import { queriesRouter } from './queries';
import type { Role, SessionUser } from '../../shared/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from '../services/projections/types';

const PAY_ID = '11111111-1111-1111-1111-111111111111';
const VP_ID = '44444444-4444-4444-4444-444444444444';

function makeUser(role: Role = 'manager'): SessionUser {
  return { id: '00000000-0000-0000-0000-000000000001', name: 'Test', email: 't@x', role, workLoop: null };
}

function makeCaller(role: Role = 'manager') {
  return queriesRouter.createCaller({ req: {} as Request, res: {} as Response, io: {} as SocketServer, user: makeUser(role) });
}

function makeExternalPayment(): ExternalReceiptProjection {
  return {
    kind: 'payment_received',
    header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' },
    lines: [],
    totals: { subtotal: 500, total: 500 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalPayment(): InternalReceiptProjection {
  return {
    kind: 'payment_received',
    header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' },
    lines: [],
    totals: { subtotal: 500, total: 500 },
    projectionVersion: 1,
    internalNotes: 'partial allocation',
    __INTERNAL_ONLY__: true
  };
}

function makeExternalVendorPayout(): ExternalReceiptProjection {
  return {
    kind: 'vendor_payout',
    header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' },
    lines: [],
    totals: { subtotal: 300, total: 300 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };
}

function makeInternalVendorPayout(): InternalReceiptProjection {
  return {
    kind: 'vendor_payout',
    header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' },
    lines: [],
    totals: { subtotal: 300, total: 300 },
    projectionVersion: 1,
    internalNotes: 'check stub mismatched by $0.50',
    __INTERNAL_ONLY__: true
  };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('paymentExternalReceipt', () => {
  it('returns the projection from getExternalReceipt for the given payment id', async () => {
    const projection = makeExternalPayment();
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('operator');
    const result = await caller.paymentExternalReceipt({ paymentId: PAY_ID });
    expect(result).toEqual(projection);
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(expect.anything(), 'payment', PAY_ID);
  });

  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.paymentExternalReceipt({ paymentId: PAY_ID })).toBeNull();
  });
});

describe('paymentInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    const projection = makeInternalPayment();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('manager');
    expect(await caller.paymentInternalReceipt({ paymentId: PAY_ID })).toEqual(projection);
    expect(documentSnapshots.getInternalReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'manager' }), 'payment', PAY_ID);
  });

  it('throws FORBIDDEN for operator role (assertRole inside getInternalReceipt fires)', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.paymentInternalReceipt({ paymentId: PAY_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('paymentSignalText', () => {
  it('returns the rendered signal text when an external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalPayment());
    const caller = makeCaller('operator');
    const result = await caller.paymentSignalText({ paymentId: PAY_ID });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Payment Received CHK-1234');
    expect(result).toContain('To: Big Buyer Co');
    expect(result).toContain('Total: 500');
    expect(result).not.toMatch(/<[^>]+>/);
  });

  it('returns null when no external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.paymentSignalText({ paymentId: PAY_ID })).toBeNull();
  });
});

describe('vendorPaymentExternalReceipt', () => {
  it('returns the projection from getExternalReceipt for the given vendor_payment id', async () => {
    const projection = makeExternalVendorPayout();
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('operator');
    const result = await caller.vendorPaymentExternalReceipt({ vendorPaymentId: VP_ID });
    expect(result).toEqual(projection);
    expect(documentSnapshots.getExternalReceipt).toHaveBeenCalledWith(expect.anything(), 'vendor_payment', VP_ID);
  });

  it('returns null when no receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.vendorPaymentExternalReceipt({ vendorPaymentId: VP_ID })).toBeNull();
  });
});

describe('vendorPaymentInternalReceipt', () => {
  it('returns the projection for manager+ callers', async () => {
    const projection = makeInternalVendorPayout();
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockResolvedValue(projection);
    const caller = makeCaller('manager');
    expect(await caller.vendorPaymentInternalReceipt({ vendorPaymentId: VP_ID })).toEqual(projection);
    expect(documentSnapshots.getInternalReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'manager' }), 'vendor_payment', VP_ID);
  });

  it('throws FORBIDDEN for operator role', async () => {
    vi.spyOn(documentSnapshots, 'getInternalReceipt').mockImplementation(async () => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This action requires manager access.' });
    });
    const caller = makeCaller('operator');
    await expect(caller.vendorPaymentInternalReceipt({ vendorPaymentId: VP_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('vendorPaymentSignalText', () => {
  it('returns the rendered signal text when an external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(makeExternalVendorPayout());
    const caller = makeCaller('operator');
    const result = await caller.vendorPaymentSignalText({ vendorPaymentId: VP_ID });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Vendor Payout WIRE-7788');
    expect(result).toContain('To: Acme Farms');
    expect(result).toContain('Total: 300');
    expect(result).not.toMatch(/<[^>]+>/);
  });

  it('returns null when no external receipt exists', async () => {
    vi.spyOn(documentSnapshots, 'getExternalReceipt').mockResolvedValue(null);
    const caller = makeCaller('operator');
    expect(await caller.vendorPaymentSignalText({ vendorPaymentId: VP_ID })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm vitest run src/server/routers/queries.moneyReceipts.test.ts`

Expected: FAIL — all calls to `caller.paymentExternalReceipt(...)`, `caller.vendorPaymentInternalReceipt(...)`, etc., throw because those procedures do not exist on the router yet.

- [ ] **Step 3: Add the six procedures to `queries.ts`**

Edit `src/server/routers/queries.ts`. Locate the existing `salesOrderSignalText` procedure (currently ends at line 1043 with the closing `})` followed by `});` on line 1044 that closes the entire `queriesRouter`). Insert the six new procedures immediately AFTER the closing `}` of `salesOrderSignalText` and BEFORE the `});` that closes `queriesRouter`. Final shape:

```ts
  salesOrderSignalText: protectedProcedure
    .input(z.object({ salesOrderId: z.string().uuid() }))
    .query(async ({ input }) => {
      // ... existing body ...
    }),
  paymentExternalReceipt: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'payment', input.paymentId);
    }),
  paymentInternalReceipt: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Role gate is enforced inside getInternalReceipt via assertRole(user, 'manager').
      return getInternalReceipt(pool, ctx.user, 'payment', input.paymentId);
    }),
  paymentSignalText: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'payment', input.paymentId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),
  vendorPaymentExternalReceipt: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getExternalReceipt(pool, 'vendor_payment', input.vendorPaymentId);
    }),
  vendorPaymentInternalReceipt: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Role gate is enforced inside getInternalReceipt via assertRole(user, 'manager').
      return getInternalReceipt(pool, ctx.user, 'vendor_payment', input.vendorPaymentId);
    }),
  vendorPaymentSignalText: protectedProcedure
    .input(z.object({ vendorPaymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const projection = await getExternalReceipt(pool, 'vendor_payment', input.vendorPaymentId);
      if (!projection) return null;
      return renderSignalText(projection);
    }),
});
```

The existing import on line 8 (`import { getExternalReceipt, getInternalReceipt, renderSignalText } from '../services/documentSnapshots';`) already provides everything the new procedures need — no new imports.

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm vitest run src/server/routers/queries.moneyReceipts.test.ts`

Expected: all 12 tests pass.

- [ ] **Step 5: Run the full router test suite to catch regressions**

Run:

```bash
pnpm vitest run \
  src/server/routers/queries.receipts.test.ts \
  src/server/routers/queries.salesReceipts.test.ts \
  src/server/routers/queries.moneyReceipts.test.ts
```

Expected: all green.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/queries.ts src/server/routers/queries.moneyReceipts.test.ts
git commit -m "feat(receipts): tRPC procedures for payment_received and vendor_payout"
```

---

## Task 4: ReceiptPanel widening + UI wiring

**Files:**
- Modify: `src/client/components/ReceiptPanel.tsx`
- Modify: `src/client/components/ReceiptPanel.test.tsx`
- Modify: `src/client/views/OperationsViews.tsx` (PaymentsView + VendorBillTools)
- Modify: `docs/design-system/decisions-log.md`
- Regenerate: `docs/design-system/components/_inventory.json` (via `pnpm docs:inventory`)

### Task 4.1: Widen `ReceiptPanel` to four kinds (TDD)

- [ ] **Step 1: Add the failing test for `kind="payment"` routing**

Append to `src/client/components/ReceiptPanel.test.tsx`. First, add two more module-level mock function refs and register them in the `vi.mock('../api/trpc', ...)` block, then add the new test blocks. Apply the following surgical edits:

(a) After the existing `const salesSignalTextQueryMock = vi.fn();` line near the top of the file, add:

```ts
const paymentExternalQueryMock = vi.fn();
const paymentInternalQueryMock = vi.fn();
const paymentSignalTextQueryMock = vi.fn();
const vendorPaymentExternalQueryMock = vi.fn();
const vendorPaymentInternalQueryMock = vi.fn();
const vendorPaymentSignalTextQueryMock = vi.fn();
```

(b) Inside the `vi.mock('../api/trpc', () => ({ trpc: { queries: { ... } } }))` block, extend the `queries` object so all six new procedures are wired alongside the existing PO and sales procedures:

```ts
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      purchaseOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => externalQueryMock(input, options) },
      purchaseOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => internalQueryMock(input, options) },
      purchaseOrderSignalText: { useQuery: (input: unknown, options?: unknown) => signalTextQueryMock(input, options) },
      salesOrderExternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesExternalQueryMock(input, options) },
      salesOrderInternalReceipt: { useQuery: (input: unknown, options?: unknown) => salesInternalQueryMock(input, options) },
      salesOrderSignalText: { useQuery: (input: unknown, options?: unknown) => salesSignalTextQueryMock(input, options) },
      paymentExternalReceipt: { useQuery: (input: unknown, options?: unknown) => paymentExternalQueryMock(input, options) },
      paymentInternalReceipt: { useQuery: (input: unknown, options?: unknown) => paymentInternalQueryMock(input, options) },
      paymentSignalText: { useQuery: (input: unknown, options?: unknown) => paymentSignalTextQueryMock(input, options) },
      vendorPaymentExternalReceipt: { useQuery: (input: unknown, options?: unknown) => vendorPaymentExternalQueryMock(input, options) },
      vendorPaymentInternalReceipt: { useQuery: (input: unknown, options?: unknown) => vendorPaymentInternalQueryMock(input, options) },
      vendorPaymentSignalText: { useQuery: (input: unknown, options?: unknown) => vendorPaymentSignalTextQueryMock(input, options) }
    },
    auth: { me: { useQuery: () => meQueryMock() } }
  }
}));
```

(c) In the existing `beforeEach` block, add `mockReset()` calls for all six new mocks immediately before `meQueryMock.mockReset();`:

```ts
  paymentExternalQueryMock.mockReset();
  paymentInternalQueryMock.mockReset();
  paymentSignalTextQueryMock.mockReset();
  vendorPaymentExternalQueryMock.mockReset();
  vendorPaymentInternalQueryMock.mockReset();
  vendorPaymentSignalTextQueryMock.mockReset();
```

(d) After the last existing `describe('ReceiptPanel — sales_order mode', () => { … })` block, append:

```ts
const PAY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const externalPaymentProjection = {
  kind: 'payment_received',
  header: { title: 'Payment Received', counterparty: 'Big Buyer Co', dateISO: '2026-05-22T12:00:00.000Z', documentNo: 'CHK-1234' },
  lines: [],
  totals: { subtotal: 500, total: 500 },
  projectionVersion: 1
};

const internalPaymentProjection = {
  ...externalPaymentProjection,
  internalNotes: 'partial allocation — 2 open invoices'
};

const externalVendorPayoutProjection = {
  kind: 'vendor_payout',
  header: { title: 'Vendor Payout', counterparty: 'Acme Farms', dateISO: '2026-05-22T15:30:00.000Z', documentNo: 'WIRE-7788' },
  lines: [],
  totals: { subtotal: 300, total: 300 },
  projectionVersion: 1
};

const internalVendorPayoutProjection = {
  ...externalVendorPayoutProjection,
  internalNotes: 'check stub mismatched by $0.50'
};

function setIdleAllOtherMocks() {
  externalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  internalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  signalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
}

describe('ReceiptPanel — payment mode', () => {
  it('routes to the payment tRPC procedures when kind="payment"', () => {
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'Payment Received CHK-1234\nTo: Big Buyer Co', isLoading: false });

    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);

    expect(paymentExternalQueryMock).toHaveBeenCalled();
    expect(paymentExternalQueryMock.mock.calls[0][0]).toEqual({ paymentId: PAY_ID });
    expect(paymentSignalTextQueryMock).toHaveBeenCalled();
    // PO/sales/vendor_payment hooks called but disabled
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(vendorPaymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });

    expect(screen.getByText('Big Buyer Co')).toBeInTheDocument();
    expect(screen.getByText('CHK-1234')).toBeInTheDocument();
  });

  it('hides the Internal tab in payment mode for operator role', () => {
    meQueryMock.mockReturnValue({ data: { role: 'operator' } });
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: null, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });

    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);
    expect(screen.queryByTestId('receipt-tab-internal')).not.toBeInTheDocument();
  });

  it('shows internalNotes on the Internal tab for manager role', () => {
    setIdleAllOtherMocks();
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentExternalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });

    render(<ReceiptPanel kind="payment" paymentId={PAY_ID} />);
    fireEvent.click(screen.getByTestId('receipt-tab-internal'));
    expect(screen.getByText(/partial allocation/i)).toBeInTheDocument();
    expect(screen.getByText(/INTERNAL.*DO NOT SEND/i)).toBeInTheDocument();
  });
});

describe('ReceiptPanel — vendor_payment mode', () => {
  it('routes to the vendor_payment tRPC procedures when kind="vendor_payment"', () => {
    setIdleAllOtherMocks();
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: externalVendorPayoutProjection, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: internalVendorPayoutProjection, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: 'Vendor Payout WIRE-7788\nTo: Acme Farms', isLoading: false });

    render(<ReceiptPanel kind="vendor_payment" vendorPaymentId={VP_ID} />);

    expect(vendorPaymentExternalQueryMock).toHaveBeenCalled();
    expect(vendorPaymentExternalQueryMock.mock.calls[0][0]).toEqual({ vendorPaymentId: VP_ID });
    expect(vendorPaymentSignalTextQueryMock).toHaveBeenCalled();
    // PO/sales/payment hooks called but disabled
    expect(externalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(salesExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(paymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });

    expect(screen.getByText('Acme Farms')).toBeInTheDocument();
    expect(screen.getByText('WIRE-7788')).toBeInTheDocument();
  });

  it('copies the vendor_payment signal text when Copy is clicked', () => {
    setIdleAllOtherMocks();
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: externalVendorPayoutProjection, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: internalVendorPayoutProjection, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: 'Vendor Payout WIRE-7788\nTo: Acme Farms', isLoading: false });

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ReceiptPanel kind="vendor_payment" vendorPaymentId={VP_ID} />);
    fireEvent.click(screen.getByTestId('receipt-copy-signal'));
    expect(writeText).toHaveBeenCalledWith('Vendor Payout WIRE-7788\nTo: Acme Farms');
  });

  it('still passes existing PO tests with purchaseOrderId prop (no kind specified)', () => {
    paymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    paymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    vendorPaymentSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesExternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesInternalQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    salesSignalTextQueryMock.mockReturnValue({ data: undefined, isLoading: false });
    externalQueryMock.mockReturnValue({ data: externalPaymentProjection, isLoading: false });
    internalQueryMock.mockReturnValue({ data: internalPaymentProjection, isLoading: false });
    signalTextQueryMock.mockReturnValue({ data: 'text', isLoading: false });

    render(<ReceiptPanel purchaseOrderId="po-1" />);

    expect(externalQueryMock).toHaveBeenCalled();
    expect(externalQueryMock.mock.calls[0][0]).toEqual({ purchaseOrderId: 'po-1' });
    expect(paymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(vendorPaymentExternalQueryMock.mock.calls[0][1]).toMatchObject({ enabled: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm vitest run src/client/components/ReceiptPanel.test.tsx`

Expected: FAIL — the new tests cannot mount `<ReceiptPanel kind="payment" …>` because the discriminated union does not accept that kind yet, and the inactive-hook assertions fail because the new hook sets do not exist yet.

- [ ] **Step 3: Widen `ReceiptPanel.tsx`**

Edit `src/client/components/ReceiptPanel.tsx`. Replace the entire file with this complete content (the structural changes are isolated to the prop type, the four hook triples, and the projection-selection logic — every other piece of behavior is unchanged):

```tsx
import { useState } from 'react';
import { trpc } from '../api/trpc';

type TabAudience = 'external' | 'internal';

/**
 * Issue #113 Phase 2 + Phase 3 + Phase 4 — read-only finalization receipt viewer.
 *
 * Pass:
 *   - `purchaseOrderId` (default kind='purchase_order') for PO receipts,
 *   - `kind='sales_order'` + `salesOrderId` for sales/invoice receipts,
 *   - `kind='payment'` + `paymentId` for payment_received receipts,
 *   - `kind='vendor_payment'` + `vendorPaymentId` for vendor_payout receipts.
 *
 * All four hook sets are always called (rules of hooks); only one set has
 * `enabled: true` per render. The discriminated union keeps the wrong id
 * from being passed at compile time.
 */
export type ReceiptPanelProps =
  | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never; paymentId?: never; vendorPaymentId?: never }
  | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never; paymentId?: never; vendorPaymentId?: never }
  | { kind: 'payment'; paymentId: string; purchaseOrderId?: never; salesOrderId?: never; vendorPaymentId?: never }
  | { kind: 'vendor_payment'; vendorPaymentId: string; purchaseOrderId?: never; salesOrderId?: never; paymentId?: never };

export function ReceiptPanel(props: ReceiptPanelProps) {
  const kind = props.kind ?? 'purchase_order';
  const isPo = kind === 'purchase_order';
  const isSo = kind === 'sales_order';
  const isPayment = kind === 'payment';
  const isVendorPayment = kind === 'vendor_payment';

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<TabAudience>('external');

  const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
  const poId = isPo ? (props.purchaseOrderId as string) : PLACEHOLDER_UUID;
  const soId = isSo ? (props.salesOrderId as string) : PLACEHOLDER_UUID;
  const payId = isPayment ? (props.paymentId as string) : PLACEHOLDER_UUID;
  const vpId = isVendorPayment ? (props.vendorPaymentId as string) : PLACEHOLDER_UUID;

  // PO hook set
  const poExternalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo }
  );
  const poInternalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo && isManagerOrOwner }
  );
  const poSignalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo }
  );

  // Sales hook set
  const soExternalQuery = trpc.queries.salesOrderExternalReceipt.useQuery(
    { salesOrderId: soId }, { enabled: isSo }
  );
  const soInternalQuery = trpc.queries.salesOrderInternalReceipt.useQuery(
    { salesOrderId: soId }, { enabled: isSo && isManagerOrOwner }
  );
  const soSignalTextQuery = trpc.queries.salesOrderSignalText.useQuery(
    { salesOrderId: soId }, { enabled: isSo }
  );

  // Payment hook set
  const payExternalQuery = trpc.queries.paymentExternalReceipt.useQuery(
    { paymentId: payId }, { enabled: isPayment }
  );
  const payInternalQuery = trpc.queries.paymentInternalReceipt.useQuery(
    { paymentId: payId }, { enabled: isPayment && isManagerOrOwner }
  );
  const paySignalTextQuery = trpc.queries.paymentSignalText.useQuery(
    { paymentId: payId }, { enabled: isPayment }
  );

  // Vendor-payment hook set
  const vpExternalQuery = trpc.queries.vendorPaymentExternalReceipt.useQuery(
    { vendorPaymentId: vpId }, { enabled: isVendorPayment }
  );
  const vpInternalQuery = trpc.queries.vendorPaymentInternalReceipt.useQuery(
    { vendorPaymentId: vpId }, { enabled: isVendorPayment && isManagerOrOwner }
  );
  const vpSignalTextQuery = trpc.queries.vendorPaymentSignalText.useQuery(
    { vendorPaymentId: vpId }, { enabled: isVendorPayment }
  );

  const externalQuery = isPo
    ? poExternalQuery
    : isSo
      ? soExternalQuery
      : isPayment
        ? payExternalQuery
        : vpExternalQuery;
  const internalQuery = isPo
    ? poInternalQuery
    : isSo
      ? soInternalQuery
      : isPayment
        ? payInternalQuery
        : vpInternalQuery;
  const signalTextQuery = isPo
    ? poSignalTextQuery
    : isSo
      ? soSignalTextQuery
      : isPayment
        ? paySignalTextQuery
        : vpSignalTextQuery;

  const externalReceipt = externalQuery.data ?? null;
  const internalReceipt = internalQuery.data ?? null;

  const isLoading = externalQuery.isLoading || signalTextQuery.isLoading;
  const showEmpty = !isLoading && !externalReceipt && !internalReceipt;

  async function copySignalText() {
    const text = signalTextQuery.data;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignored */ }
  }

  const projection = audience === 'external' ? externalReceipt : internalReceipt;

  function emptyLabel(): string {
    if (isPo) return 'PO';
    if (isSo) return 'sale';
    if (isPayment) return 'payment';
    return 'vendor payout';
  }

  return (
    <section data-testid="receipt-panel" className="inline-panel" aria-label="Finalization receipt">
      <header className="control-band">
        <div role="tablist" aria-label="Receipt audience">
          <button type="button" role="tab" data-testid="receipt-tab-external"
            aria-selected={audience === 'external'}
            className={audience === 'external' ? 'primary-button compact-action' : 'secondary-button compact-action'}
            onClick={() => setAudience('external')}>External</button>
          {isManagerOrOwner ? (
            <button type="button" role="tab" data-testid="receipt-tab-internal"
              aria-selected={audience === 'internal'}
              className={audience === 'internal' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setAudience('internal')}>Internal</button>
          ) : null}
        </div>
        {audience === 'external' ? (
          <button type="button" data-testid="receipt-copy-signal"
            className="secondary-button compact-action"
            onClick={copySignalText} disabled={!signalTextQuery.data}
            title="Copy plain-text receipt for Signal">Copy for Signal</button>
        ) : null}
      </header>
      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. Finalize the {emptyLabel()} to produce one.</p>
      ) : projection ? (
        <ReceiptBody audience={audience} projection={projection} />
      ) : (
        <p className="page-subtitle">No {audience} receipt available.</p>
      )}
    </section>
  );
}

interface ReceiptLineLike { name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string; }
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
  const hasLines = projection.lines.length > 0;
  return (
    <div className="view-stack">
      {audience === 'internal' ? <div className="selection-pill warning">INTERNAL — DO NOT SEND</div> : null}
      <div className="drawer-fact-row"><span>{projection.header.title}</span><strong>{projection.header.documentNo}</strong></div>
      <div className="drawer-fact-row"><span>To</span><strong>{projection.header.counterparty}</strong></div>
      <div className="drawer-fact-row"><span>Date</span><strong>{projection.header.dateISO}</strong></div>
      {hasLines ? (
        <table className="finder-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Subtotal</th><th>Notes</th></tr></thead>
          <tbody>
            {projection.lines.map((l, i) => (
              <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td>{l.unitPrice ?? '-'}</td><td>{l.subtotal}</td><td>{l.notes ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="drawer-fact-row"><span>Subtotal</span><strong>{projection.totals.subtotal}</strong></div>
      {projection.totals.adjustments != null ? <div className="drawer-fact-row"><span>Adjustments</span><strong>{projection.totals.adjustments}</strong></div> : null}
      <div className="drawer-fact-row"><span>Total</span><strong>{projection.totals.total}</strong></div>
      {projection.footer?.terms ? <div className="drawer-fact-row"><span>Terms</span><strong>{projection.footer.terms}</strong></div> : null}
      {projection.footer?.reference ? <div className="drawer-fact-row"><span>Ref</span><strong>{projection.footer.reference}</strong></div> : null}
      {audience === 'internal' && projection.internalNotes ? (
        <div className="inline-panel"><div className="section-title">Internal reconciliation notes</div><p>{projection.internalNotes}</p></div>
      ) : null}
      {audience === 'internal' && projection.cogs ? (
        <div className="inline-panel">
          <div className="section-title">COGS</div>
          {projection.cogs.perLine.map((c, i) => <div key={i} className="drawer-fact-row"><span>{c.name}</span><strong>{c.landedCost ?? c.unitCost ?? '-'}</strong></div>)}
          <div className="drawer-fact-row"><span>Total COGS</span><strong>{projection.cogs.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.margin ? (
        <div className="inline-panel">
          <div className="section-title">Margin</div>
          {projection.margin.perLine.map((m, i) => <div key={i} className="drawer-fact-row"><span>{m.name}</span><strong>{m.marginAbs} ({m.marginPct}%)</strong></div>)}
          <div className="drawer-fact-row"><span>Total margin</span><strong>{projection.margin.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.diagnostics ? (
        <div className="inline-panel">
          <div className="section-title">Diagnostics</div>
          {projection.diagnostics.unresolvedSources?.length ? <div className="drawer-fact-row"><span>Unresolved sources</span><strong>{projection.diagnostics.unresolvedSources.join(', ')}</strong></div> : null}
          {projection.diagnostics.legacyMarkers?.length ? <div className="drawer-fact-row"><span>Legacy markers</span><strong>{projection.diagnostics.legacyMarkers.join(', ')}</strong></div> : null}
        </div>
      ) : null}
    </div>
  );
}
```

(Two real behavior changes vs. the Phase 3 version: (a) the lines table is now hidden when `projection.lines` is empty — required because money receipts have an intentionally empty `lines: []`; the previous unconditional `<table>` would have rendered an empty header row in money mode; (b) the "Internal notes" section title now reads "Internal reconciliation notes" because money receipts surface bookkeeping notes, not the COGS-adjacent merchandise notes from PO/sales. The PO/sales projections do not populate `internalNotes` directly — they populate `cogs`, `margin`, `diagnostics` — so the renamed label is only shown for money kinds in practice.)

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm vitest run src/client/components/ReceiptPanel.test.tsx`

Expected: all tests pass, including the existing PO + sales tests and the new payment + vendor_payment tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/components/ReceiptPanel.tsx src/client/components/ReceiptPanel.test.tsx
git commit -m "feat(receipts): widen ReceiptPanel to payment and vendor_payment kinds"
```

### Task 4.2: Wire ReceiptPanel into `PaymentsView`

- [ ] **Step 1: Update `PaymentsView` prelude**

Edit `src/client/views/OperationsViews.tsx`. Replace the existing `PaymentsView` function (currently lines 976–997) with:

```tsx
export function PaymentsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.payments);
  const selectedPayment = selectedRows?.[0];
  return (
    <GridJourney
      view="payments"
      title="Payments"
      prelude={() => (
        <>
          <QuickLedgerGrid />
          <PaymentAllocationTools selectedPayment={selectedPayment} />
          {selectedPayment?.id ? (
            <ReceiptPanel kind="payment" paymentId={String(selectedPayment.id)} />
          ) : null}
        </>
      )}
      actions={(rows, runCommand) => (
        <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('allocatePayment', { paymentId: rows[0].id }, 'Auto-apply payment to oldest open invoices')} type="button">
          <Check className="h-4 w-4" aria-hidden="true" />
          Auto-apply oldest
        </button>
      )}
    />
  );
}
```

(`ReceiptPanel` is already imported at line 16 — no new import needed.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 3: Run the OperationsViews related tests (if any) and the panel tests**

Run:

```bash
pnpm vitest run src/client/components/ReceiptPanel.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): render ReceiptPanel in PaymentsView for selected payment"
```

### Task 4.3: Wire ReceiptPanel into `VendorBillTools`

- [ ] **Step 1: Update `VendorBillTools` to render the panel after the payouts table**

Edit `src/client/views/OperationsViews.tsx`. Find the closing `</section>` of `VendorBillTools` (currently line 1694). Immediately before that closing `</section>` (i.e., after the closing brace of the `{vendorPayments.data?.length ? (…) : null}` ternary), add:

```tsx
      {chosenPaymentId ? (
        <ReceiptPanel kind="vendor_payment" vendorPaymentId={String(chosenPaymentId)} />
      ) : null}
```

The full closing block becomes:

```tsx
      {vendorPayments.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorPayments.data.map((payment) => (
                <tr key={String(payment.id)}>
                  <td>{String(payment.billNo ?? selectedBill?.billNo ?? 'Bill')}</td>
                  <td>${moneyish(payment.amount)}</td>
                  <td>{labelFromToken(String(payment.method ?? '-'))}</td>
                  <td>{String(payment.reference ?? '-')}</td>
                  <td>{labelFromToken(String(payment.status ?? '-'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {chosenPaymentId ? (
        <ReceiptPanel kind="vendor_payment" vendorPaymentId={String(chosenPaymentId)} />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 3: Run the panel tests**

Run: `pnpm vitest run src/client/components/ReceiptPanel.test.tsx`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/client/views/OperationsViews.tsx
git commit -m "feat(receipts): render ReceiptPanel in VendorBillTools for chosen payout"
```

### Task 4.4: Documentation hygiene

- [ ] **Step 1: Append a decisions-log entry**

Edit `docs/design-system/decisions-log.md`. Append a new entry at the top (most-recent first per the file's convention) dated today:

```markdown
## 2026-05-22 — ReceiptPanel widened to four kinds (Phase 4: money receipts)

The `ReceiptPanel` discriminated union now accepts `'purchase_order' | 'sales_order' | 'payment' | 'vendor_payment'`. The new `payment` and `vendor_payment` kinds are wired in `PaymentsView` (prelude, after `PaymentAllocationTools`, gated on a selected payment row) and in `VendorBillTools` (after the payouts table, gated on `chosenPaymentId`). The component now calls four tRPC hook triples per render — only one is enabled per `kind`, satisfying rules of hooks. The body now hides the lines table when `projection.lines` is empty (money receipts intentionally carry no line items) and labels the optional internal-only paragraph as "Internal reconciliation notes" to reflect bookkeeping context. See `docs/superpowers/plans/2026-05-22-finalization-receipts-phase4-money.md`.
```

- [ ] **Step 2: Regenerate the component inventory**

Run: `pnpm docs:inventory`

Expected: `docs/design-system/components/_inventory.json` is updated to reflect the widened `ReceiptPanel` prop union.

- [ ] **Step 3: Commit the doc updates**

```bash
git add docs/design-system/decisions-log.md docs/design-system/components/_inventory.json
git commit -m "docs(design-system): record Phase 4 ReceiptPanel widening (money receipts)"
```

---

## Task 5: Full verification + closeout

**Files:** none modified — verification only, with a closeout note appended to the active Linear issue.

### Task 5.1: Static and unit-test verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`

Expected: zero errors.

- [ ] **Step 2: Full lint**

Run: `pnpm lint`

Expected: zero new violations attributable to Phase 4. Pre-existing violations in unrelated files are not in scope.

- [ ] **Step 3: Full Phase 1/2/3/4 receipts vitest sweep**

Run:

```bash
pnpm vitest run \
  src/server/services/projections \
  src/server/services/documentSnapshots.test.ts \
  src/server/services/documentSnapshots.types.test.ts \
  src/server/services/poFinalizationReceipts.test.ts \
  src/server/services/salesConfirmationReceipts.test.ts \
  src/server/services/invoiceReceipts.test.ts \
  src/server/services/paymentReceivedReceipts.test.ts \
  src/server/services/vendorPayoutReceipts.test.ts \
  src/server/routers/queries.receipts.test.ts \
  src/server/routers/queries.salesReceipts.test.ts \
  src/server/routers/queries.moneyReceipts.test.ts \
  src/client/components/ReceiptPanel.test.tsx
```

Expected: all green. Capture the final summary line for the closeout note.

- [ ] **Step 4: Full repo vitest pass (regression check)**

Run: `pnpm vitest run`

Expected: no NEW failures vs. the Task 0 baseline. Any pre-existing failures must be the same set the baseline captured; if a new failure surfaces, STOP and diagnose before continuing.

### Task 5.2: Runtime / browser proof

- [ ] **Step 1: Boot the local server in one terminal**

Run: `pnpm dev`

Expected: server reachable at `http://127.0.0.1:5173`. If `pnpm dev` is already running from a previous step, skip this step.

- [ ] **Step 2: Run the operator-console Playwright smoke**

Run:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test \
  tests/e2e/operator-console.spec.ts \
  --project=chromium --workers=1
```

Expected: green, no new failures vs. baseline.

- [ ] **Step 3: Manual browser proof — payment_received receipt round-trip**

In a browser at `http://127.0.0.1:5173`:

1. Authenticate as a manager-role user.
2. Open the Payments workspace.
3. Run the `logPayment` command from the command palette against any customer with `amount = 50, method = 'cash', reference = 'TEST-PHASE4'`.
4. After the toast confirms, click the newly inserted row in the payments grid.
5. Verify the ReceiptPanel renders under `PaymentAllocationTools` with:
   - External tab default, showing `Payment Received` title, `TEST-PHASE4` document number, the customer name, the ISO date, and `Total: 50`.
   - Internal tab visible (manager role), switching to it shows the `INTERNAL — DO NOT SEND` pill. If the payment had `notes`, the "Internal reconciliation notes" block appears with that text.
   - `Copy for Signal` button copies the plain-text version (paste into any text field to verify).
6. As an operator-role user (sign out, sign back in), repeat step 5; verify the Internal tab is hidden.

Capture a single browser screenshot of the manager view to `/tmp/phase4-payment-receipt.png` for the closeout note.

- [ ] **Step 4: Manual browser proof — vendor_payout receipt round-trip**

In the same session:

1. Open the Vendor Billing workspace.
2. Select a vendor bill that is in `scheduled` status (or schedule one via `scheduleVendorPayment` first if none exists).
3. Run `recordVendorPayment` with the bill's amount and a test reference (e.g. `WIRE-TEST-PHASE4`).
4. After the toast confirms, the payouts table shows the new row. Select it via the Payout dropdown.
5. Verify the ReceiptPanel renders under the payouts table with:
   - External tab showing `Vendor Payout` title, `WIRE-TEST-PHASE4` document number, vendor name, ISO date, and the payout amount as Total.
   - Internal tab: if the bill has `discrepancyNotes`, the "Internal reconciliation notes" block surfaces them.
   - `Copy for Signal` copies the plain-text version.

Capture a single browser screenshot of the manager view to `/tmp/phase4-vendor-payout-receipt.png` for the closeout note.

- [ ] **Step 5: Database verification (one-shot proof)**

Run a psql one-liner against the dev database to confirm both snapshot kinds are persisted:

```bash
psql "$DATABASE_URL" -c "SELECT kind, source_entity_type, audience, status, count(*) FROM document_snapshots WHERE kind IN ('payment_received', 'vendor_payout') GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3;"
```

Expected output similar to:

```
      kind        | source_entity_type | audience  |  status   | count
------------------+--------------------+-----------+-----------+-------
 payment_received | payment            | external  | finalized |   ≥ 1
 payment_received | payment            | internal  | finalized |   ≥ 1
 vendor_payout    | vendor_payment     | external  | finalized |   ≥ 1
 vendor_payout    | vendor_payment     | internal  | finalized |   ≥ 1
```

Four rows, no drafts hanging around. If drafts appear, the `finalizeSnapshot` step failed for one audience — investigate.

### Task 5.3: Tracker writeback and closeout

- [ ] **Step 1: Locate the active Linear issue**

Find the Linear issue for `CAP` / `CMD` row matching "Phase 4 — money receipts" under project TERP Operator, milestone matching the current phase. If no exact match exists, look for the parent receipts issue (`TER-XXX`) and use it.

- [ ] **Step 2: Append a closeout comment to the Linear issue**

Use `linear_save_comment` (or the `gh`/`linear` CLI equivalent if Linear MCP is unavailable in the executing surface). The comment body should follow this template — fill in the bracketed sections with real evidence captured during Task 5.1 and 5.2:

```markdown
Phase 4 (money receipts: payment_received + vendor_payout) is complete.

QA tier: Deep QA (touches persisted data mutations + external API contract surface + multi-step side effects via post-commit hooks).
Tier rationale: new snapshot rows are written to `document_snapshots`; new tRPC procedures expose receipts to clients; UI is wired into two operator workspaces.

Spec coverage:
- payment_received post-commit hook on `logPayment` — ✅ implemented (`src/server/services/paymentReceivedReceipts.ts`)
- vendor_payout post-commit hook on `recordVendorPayment` — ✅ implemented (`src/server/services/vendorPayoutReceipts.ts`)
- 6 new tRPC procedures (paymentExternal/Internal/SignalText + vendorPaymentExternal/Internal/SignalText) — ✅ implemented (`src/server/routers/queries.ts`)
- ReceiptPanel widened to four kinds — ✅ implemented (`src/client/components/ReceiptPanel.tsx`)
- Wired into PaymentsView and VendorBillTools — ✅ implemented (`src/client/views/OperationsViews.tsx`)
- Stub projector hygiene (conditional spread for `internalNotes`) — ✅ fixed (`src/server/services/projections/paymentReceived.ts` and `vendorPayout.ts`)

Verification evidence:
- `pnpm typecheck` — green
- `pnpm lint` — green (no new violations)
- Full receipts vitest sweep — green (XX/XX tests passing — fill in actual number)
- Full repo vitest pass — no new regressions vs. baseline
- Playwright operator-console smoke — green
- Manual browser proof (manager role): payment receipt round-trip and vendor payout receipt round-trip — screenshots at `/tmp/phase4-payment-receipt.png` and `/tmp/phase4-vendor-payout-receipt.png`
- Database verification: four expected rows in `document_snapshots` (external + internal × payment + vendor_payment, all finalized)

Phase 5+ follow-ups tracked separately:
- Ledger-driven payments via `postLedgerRow → logPayment` do NOT trigger the receipt hook (Decision 16). Track as a Phase 5 ticket if the ledger UI is the primary back-office entry surface.
- `vendor_payments` has no per-payout `notes` column; receipts surface bill-level `discrepancyNotes` instead. If per-payout reconciliation notes are required, Phase 5 needs a schema migration.
- `refundPayment` / `voidVendorPayment` do NOT supersede the snapshot. Phase 5 receipt-lifecycle work.

Adversarial score: 95+/100 (no leaks, role gates intact, type-safe discriminated union, comprehensive leak-guard tests, runtime proof captured).

PR: <fill in PR URL once opened>
```

- [ ] **Step 3: Open the PR**

Run:

```bash
git push -u origin plan/finalization-receipts-phase4-113
gh pr create --title "feat(receipts): Phase 4 — payment_received and vendor_payout snapshots (#113)" \
  --body-file - <<'EOF'
Implements Phase 4 of Issue #113 — money-receipt workspaces.

## Summary

Adds `payment_received` and `vendor_payout` snapshot pairs to the existing `document_snapshots` foundation. Wires two new best-effort post-commit hooks into `logPayment` and `recordVendorPayment`, adds 6 new tRPC procedures, widens `ReceiptPanel` to four kinds, and renders the panel inside `PaymentsView` and `VendorBillTools`.

## Files

Server:
- `src/server/services/projections/paymentReceived.ts` — conditional-spread hygiene for `internalNotes`
- `src/server/services/projections/vendorPayout.ts` — same fix
- `src/server/services/paymentReceivedReceipts.ts` (new) + tests
- `src/server/services/vendorPayoutReceipts.ts` (new) + tests
- `src/server/services/commandBus.ts` — two new post-commit hooks
- `src/server/routers/queries.ts` — 6 new procedures
- `src/server/routers/queries.moneyReceipts.test.ts` (new)

Client:
- `src/client/components/ReceiptPanel.tsx` — widened to four kinds, hide empty lines table, "Internal reconciliation notes" label for money kinds
- `src/client/components/ReceiptPanel.test.tsx` — two new describe blocks
- `src/client/views/OperationsViews.tsx` — render panel in `PaymentsView` and `VendorBillTools`

Docs:
- `docs/design-system/decisions-log.md` — Phase 4 entry
- `docs/design-system/components/_inventory.json` — regenerated
- `docs/superpowers/plans/2026-05-22-finalization-receipts-phase4-money.md` — this plan

## Verification

See Linear closeout comment for full evidence (typecheck, lint, full vitest sweep, Playwright smoke, manual browser proof for both kinds, database row counts).

Closes <Linear issue ID>.
EOF
```

Expected: PR opens, CI starts. Update the Linear comment with the PR URL.

- [ ] **Step 4: Move Linear issue to In Review**

Use `linear_save_issue` to set the issue state to `In Review`. Once CI is green and the PR is approved, transition to `Done` after merge.

---

## Self-review

Run this checklist before declaring the plan ready for execution. Fix any issues inline; do not re-review.

### 1. Spec coverage

Read back through "Phase 4 scope" and "Key facts to bake in" in the task brief and confirm each line maps to a task:

- [x] payment_received wires into `logPayment` → Task 1.3 hook on `input.name === 'logPayment'` reads `affectedIds[0]`
- [x] vendor_payout wires into `recordVendorPayment` → Task 2.3 hook on `input.name === 'recordVendorPayment'` reads `affectedIds[1]`
- [x] Payment query (`p.id, p.amount, p.reference, p.method, p.notes, p.created_at, c.name`) → Task 1.2 helper SQL
- [x] Vendor query (`vp.id, vp.amount, vp.reference, vp.method, vp.created_at, v.name, vb.discrepancy_notes`) → Task 2.2 helper SQL
- [x] `PaymentReceivedInput` shape (customerName, paymentRef=reference??id, dateISO, amount, internalReconciliationNotes) → Task 1.2 helper
- [x] `VendorPayoutInput` shape (vendorName='Unknown vendor', payoutRef=reference??id, dateISO, amount, internalReconciliationNotes from `vb.discrepancy_notes`) → Task 2.2 helper
- [x] Projector stubs checked + fixed (conditional-spread) → Task 1.1 + Task 2.1
- [x] `source_entity_type` migration not needed → Architecture Decision 11
- [x] ReceiptPanel extended with two more kinds → Task 4.1
- [x] PaymentsView wired with `<ReceiptPanel kind="payment" …>` → Task 4.2
- [x] VendorBillTools wired with `<ReceiptPanel kind="vendor_payment" …>` → Task 4.3
- [x] 6 new tRPC procedures (all `protectedProcedure`) → Task 3.1
- [x] 6 helper tests (×2 helpers) → Task 1.2 and Task 2.2 (each has 8 tests, exceeding the minimum 6)
- [x] 9 tRPC tests → Task 3.1 has 12 tests (4 procedures × 2 + 2 each for signal text), exceeding the minimum 9
- [x] Files to read before writing — all covered in the discovery commits at the top of the planning session

### 2. Placeholder scan

- [x] No "TBD", "TODO", "implement later", "similar to Task N" — every step shows complete code.
- [x] No "add appropriate error handling" — error handling is shown in the helper bodies (best-effort try/catch + console.warn) and the commandBus hooks (double-guarded try/catch).
- [x] No "write tests for the above" without actual test code — every test step contains the full test source.
- [x] References — every type/function/method referenced is defined either in the existing code (cited with file path + line number) or in an earlier task in this plan.

### 3. Type consistency

- [x] `createPaymentReceivedReceipts(pool, paymentId, commandId, userId)` signature used in test, helper, AND commandBus hook — matches.
- [x] `createVendorPayoutReceipts(pool, vendorPaymentId, commandId, userId)` signature used in test, helper, AND commandBus hook — matches.
- [x] `PaymentReceivedInput` fields (`customerName`, `paymentRef`, `dateISO`, `amount`, `internalReconciliationNotes`) — match the existing type definition at `src/server/services/projections/types.ts:117-123`.
- [x] `VendorPayoutInput` fields (`vendorName`, `payoutRef`, `dateISO`, `amount`, `internalReconciliationNotes`) — match the existing type definition at `src/server/services/projections/types.ts:125-131`.
- [x] tRPC procedure names match between server (Task 3.1), client mocks (Task 4.1 mock setup), and component hook calls (Task 4.1 ReceiptPanel.tsx).
- [x] ReceiptPanel prop union exclusivity — verified via `?: never` on the other ids in each union member.

If the executing engineer hits a type mismatch I missed, stop and reconcile across both ends before continuing.
