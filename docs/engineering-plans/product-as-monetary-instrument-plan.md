# Product as a Monetary Instrument (Barter Settlement) — Engineering Plan

**Status:** Draft for review
**Author:** Agent (planning)
**Date:** 2026-06-25
**Registry anchor:** new capability — propose `CAP-0xx` / command family `CMD-BARTER` (to be assigned in Linear, team `Terpcorp`)
**Branch:** `claude/product-monetary-instrument-plan-fbvql2`

---

## 1. Summary

Today, debts in TERP Operator are settled with **money**: a client pays down their AR balance via `logPayment`/`allocatePayment`; the operator pays down a vendor payable via `recordVendorPayment`. This plan adds the ability to use **physical product (inventory) as the instrument of settlement** instead of cash, in **both directions**:

- **Inbound** — a client hands the operator product to pay down their balance (or to buy something). The operator **receives** inventory; the client's AR balance drops.
- **Outbound** — the operator hands a vendor (or a client) product to settle what the operator owes. The operator **gives up** inventory; the counterparty's bill / the operator's debt drops.

The core difficulty — and the reason this is "far reaching" — is that **a barter transaction is two coupled events that must commit atomically**:

1. an **inventory event** (a batch is created on intake, or quantity is issued out), valued at **cost**; and
2. a **settlement event** (an AR balance or AP bill is reduced), valued at the **agreed settlement amount**;

and when those two values differ, the difference is a **realized gain/loss** that must be journaled. Every existing money invariant, the nightly balance reconciliation, period locks, reversals, receipts, and the credit engine all touch this surface.

This plan reuses the existing primitives (command bus, `clientLedgerEntries`, `vendorBills`/`vendorPayments`, `batches`, `inventoryMovements`, `correctionJournalEntries`, document snapshots, `Decimal.js` money math) rather than inventing a parallel accounting stack.

---

## 2. Decisions captured (from product owner)

| # | Decision | Choice | Consequence in this plan |
|---|----------|--------|--------------------------|
| D1 | First-build scope | **Both directions** | One shared barter-settlement engine; two entry flows (inbound / outbound). |
| D2 | Settlement valuation basis | **Item cost (`unitCost`)** | The product's **cost basis** is the default dollar amount it pays down. Inventory is always carried at cost. |
| D3 | Gain/loss rigor | **Full recognition** | Realized gain/loss is journaled to the existing period-aware correction-journal mechanism; respects period locks. |

### 2.1 Reconciling D2 and D3 (important)

D2 ("value at cost") and D3 ("recognize gain/loss = settlement value − cost basis") only interact in one spot, so we resolve it explicitly instead of asking again:

- **Inventory leg is always carried at cost (`unitCost`).** This is D2 and is non-negotiable accounting — inventory on the books is at cost.
- **The settlement (face) amount defaults to that same cost basis.** So out of the box, *product pays down debt dollar-for-dollar at cost*, and gain/loss is `0`. This honors D2 literally.
- **The settlement amount is overridable to an agreed value.** When the operator records an agreed settlement value that differs from cost basis (e.g., the parties agree the product is "worth" more or less than its recorded cost in the trade), the difference books as a realized gain/loss to the correction journal. This honors D3 and makes the feature usable for real negotiations without a second design pass.

> **Net rule:** `settlementAmount` defaults to `Σ(qty × unitCost)`; `gainLoss = settlementAmount − costBasis`; with the default, `gainLoss = 0`. The full-recognition machinery (D3) is always built; it simply stays dormant until an operator overrides the value.

This is also the most flexible and correct design, so we lose nothing by building it this way.

---

## 3. Current-state recap (what we build on)

Grounded in code as of this branch:

**Money / AR**
- `customers.balance` is a **denormalized running balance**; the **append-only** truth is `clientLedgerEntries` (`kind ∈ {invoice, payment_allocation, credit, down_payment, …}`, signed `amount`, `balanceAfter`). Nightly `reconcileCustomerBalances` (`src/server/services/balanceReconciliation.ts`) audits drift.
- Payments: `payments` (`method ∈ {cash,check,card,crypto,wire}`, `direction`, `category`, `allocationIntent`, `unappliedAmount`) → `paymentAllocations` → `invoices.amountPaid`. Logic in `src/domains/payments/commands.ts` (`logPayment`, `allocatePayment`, `applyClientCredit`).
- Existing **non-cash AR precedents**: `applyClientCredit` (direct balance reduction), negative `logPayment` (`direction='buyer_credit'`, ledger `kind='down_payment'`).

**Money / AP**
- `vendorBills` (`amount`, `amountPaid`, `status`, `consignmentTriggered`) ← created from receipt posting / consignment depletion / manual. `vendorPayments` (`method`, `status`) settle them via `recordVendorPayment`.
- Existing **half-precedent**: `postVendorLedgerPayment` (`src/domains/vendor-management/commands.ts`) already accepts `transactionType ∈ {vendor_product_payment, product_payment, vendor_down_payment}` and writes a fully-paid `vendorBill` + `vendorPayment` — **but it never moves inventory.** This plan completes that idea by coupling the inventory leg.

**Inventory**
- `batches` carry `intakeQty / availableQty / reservedQty`, `unitCost`, `unitPrice`, `ownershipStatus ∈ {C, OFC, UNKNOWN}`, `status`. Quantity-on-hand is the **denormalized `availableQty`** column; `inventoryMovements` is an **append-only audit** (`kind`, `qtyDelta`, `reason`, `commandId`).
- Intake creates batches via `createBatch` — which currently **requires a PO line** (TER-1658). Posting is `postPurchaseReceipt`.
- Issuing inventory out happens today only via sales posting (`postSalesOrder` decrements `availableQty`). There is **no general "issue product to a counterparty" path** — we add one.

**Command bus / infra**
- `executeCommand` → `runCommand` switch; atomic `db.transaction`; idempotency via `command_journal` unique key; `snapshotByAffectedIds` before/after; reversals reconstruct from `beforeSnapshot` (`reversalPolicies` in `src/shared/commandCatalog.ts`).
- `MONEY_MUTATING_COMMANDS` gates the all-or-nothing money cohort in `commands.runBulk`.
- `correctionJournalEntries` (`period 'YYYY-MM'`, signed `amount`, `memo`, `status`) is the existing **period gain/loss / variance** mechanism; `assertPeriodUnlocked` + `periodLocks` enforce closeout.
- Money math: `Decimal.js`, `numeric(12,2)`, helpers `addMoney/subMoney/mulMoney/moneyScale/subMoneyMin0`.
- Receipts: post-commit, non-fatal document snapshots (`createInvoiceReceipts`, `createPaymentReceivedReceipts`, `createVendorPayoutReceipts`, `documentSnapshots.ts`), internal + external audiences.

---

## 4. Conceptual model: the three-leg barter settlement

Every barter settlement, in either direction, is one atomic command producing up to three legs:

```
                 ┌─────────────────────────────────────────────────────┐
                 │           BARTER SETTLEMENT (1 command)              │
                 ├─────────────────────────────────────────────────────┤
   INVENTORY LEG │  receive product (inbound)  OR  issue product (out) │  valued at COST
                 ├─────────────────────────────────────────────────────┤
  SETTLEMENT LEG │  reduce client AR balance   OR  reduce vendor bill  │  valued at SETTLEMENT AMOUNT
                 ├─────────────────────────────────────────────────────┤
  GAIN/LOSS LEG  │  correction-journal entry = settlementAmount − cost │  (zero by default per D2)
                 └─────────────────────────────────────────────────────┘
```

### 4.1 Inbound (client → operator)

The client gives product; the operator forgives part of the client's balance.

1. **Inventory leg:** create a new **owned (`OFC`) batch** from the received product, `unitCost = agreed per-unit cost`, `availableQty = qty`. Movement `kind='barter_intake'`. (No PO, no vendor bill — see §6.1.)
2. **Settlement leg:** reduce `customers.balance` by `settlementAmount`; append `clientLedgerEntries kind='product_settlement'` (signed negative); optionally allocate to specific open invoices (reuse the `allocatePayment` allocation logic) so AR aging stays correct.
3. **Gain/loss leg:** because the inbound product is **booked into inventory at its settlement value**, inbound has **no immediate P&L** (cost basis ≡ settlement amount by construction). Gain/loss is deferred to the eventual resale via the normal sales margin path. *(This is the standard treatment and is consistent with D2/D3.)*

### 4.2 Outbound (operator → vendor or client)

The operator gives product; the counterparty's claim is reduced.

1. **Inventory leg:** issue `qty` from one or more existing batches (`availableQty -= qty`, guard ≥ 0). Movement `kind='barter_issue'`. **Cost basis = `Σ(qty × batch.unitCost)`** of the issued batches.
2. **Settlement leg:**
   - Vendor: reduce a `vendorBill` (reuse `recordVendorPayment` with `method='product'`), or create a fully-paid bill for ad-hoc settlements (reuse the `postVendorLedgerPayment` path).
   - Client (operator owes a client, e.g. refund/credit): reduce balance / issue a buyer credit.
3. **Gain/loss leg:** `gainLoss = settlementAmount − costBasis`. With D2 default (`settlementAmount = costBasis`) this is `0`. If the operator overrode the settlement value, post a `correctionJournalEntries` row (`memo='barter gain/loss …'`) for the current period (after `assertPeriodUnlocked`).

---

## 5. Data model changes

### 5.1 New tables (barter as a first-class document)

We add a header + lines so a settlement is auditable as one document and reversible as one unit, mirroring the receipt/sales-order shape.

```ts
// src/server/schema.ts
export const barterSettlements = pgTable('barter_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementNo: varchar('settlement_no', { length: 80 }).notNull().unique(), // code('BARTER')
  direction: varchar('direction', { length: 16 }).notNull(),     // 'inbound' | 'outbound'
  counterpartyType: varchar('counterparty_type', { length: 16 }).notNull(), // 'customer' | 'vendor'
  customerId: uuid('customer_id').references(() => customers.id),  // set when AR side
  vendorId: uuid('vendor_id').references(() => vendors.id),        // set when AP side
  settlementAmount: numeric('settlement_amount', { precision: 12, scale: 2 }).notNull(),
  costBasis: numeric('cost_basis', { precision: 12, scale: 2 }).notNull(),
  gainLoss: numeric('gain_loss', { precision: 12, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 24 }).notNull().default('posted'), // 'posted' | 'reversed'
  commandId: uuid('command_id'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const barterSettlementLines = pgTable('barter_settlement_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementId: uuid('settlement_id').notNull().references(() => barterSettlements.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').references(() => batches.id),     // inbound: created batch; outbound: source batch
  productName: varchar('product_name', { length: 180 }).notNull(),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  lineSettlementAmount: numeric('line_settlement_amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Optional join table when an inbound settlement is allocated to specific invoices,
// or an outbound settlement to specific vendor bills:
export const barterSettlementAllocations = pgTable('barter_settlement_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementId: uuid('settlement_id').notNull().references(() => barterSettlements.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  vendorBillId: uuid('vendor_bill_id').references(() => vendorBills.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 5.2 Extensions to existing tables / enums

- `paymentMethodSchema` (`src/shared/schemas.ts`) and `vendorPayments.method`: add **`'product'`** (in-kind). This lets the existing payment/vendor-payment rows and receipts represent the money leg without a parallel structure.
- `clientLedgerEntries.kind`: add **`'product_settlement'`** (inbound AR reduction) and **`'product_settlement_reversal'`**.
- `inventoryMovements.kind`: add **`'barter_intake'`**, **`'barter_issue'`**, and their `'*_reversal'` forms.
- `correctionJournalEntries`: add nullable **`source_type`** (`'barter_settlement'`) and **`source_id`** (settlement id) and **`command_id`** columns so gain/loss rows are traceable and reversible. *(Currently this table has no FK/command linkage; needed for clean reversal.)*
- `customerBalanceReconciliation` / `moneyInvariants`: extend coverage (see §9).

### 5.3 Migration

One Drizzle migration under `migrations/` (next sequential number) creating the three tables + the enum/column additions, plus `NOT VALID` CHECK constraints consistent with existing money invariants:

- `barter_settlements_amounts_chk`: `settlement_amount >= 0 AND cost_basis >= 0`
- `barter_settlement_lines_qty_chk`: `qty > 0 AND unit_cost >= 0`
- `barter_settlement_allocations_amount_chk`: `amount > 0`
- `gain_loss = settlement_amount - cost_basis` enforced in app layer (not a generated column, to keep parity with the existing app-maintained pattern).

Follow the repo's existing migration + `schema.ts` parity workflow (`pnpm db:migrate`, `pnpm audit:self`).

---

## 6. Command design

Two new commands sharing one service (`src/domains/barter/commands.ts`), registered through the standard recipe (catalog name → label → RBAC → reversal policy → money-mutating set → `runCommand` switch → domain re-export → tests):

| Command | Direction | Effects |
|---|---|---|
| `settleDebtWithProduct` | **inbound** | create owned batch (intake), reduce client balance (+ optional invoice allocation), header/lines, receipt |
| `payWithProduct` | **outbound** | issue product from batch(es), reduce vendor bill / client credit, gain/loss journal, header/lines, receipt |

> Alternative considered: a single `recordBarterSettlement` with a `direction` field. Rejected for first build — two commands keep RBAC, reversal guidance, validation, and receipts cleaner and match the codebase's "specific command" idiom. They still call one shared service.

### 6.1 Inbound intake without a PO

`createBatch` currently **mandates a PO line** (TER-1658). Inbound barter has no PO. Options, in preference order:

1. **Add a barter-aware intake path** in the barter service that inserts a `batches` row directly (status `posted`, `ownershipStatus='OFC'`, `purchaseOrderId=NULL`, `purchaseOrderLineId=NULL`) and writes the `barter_intake` movement — **bypassing the PO requirement deliberately**, with validation that `unitCost` and `qty` are present. *(Recommended — least surprising, no fake PO data.)*
2. Synthesize a hidden "barter source" PO per settlement. Rejected — pollutes PO reporting and vendor analytics.

We must audit every query/closeout assumption that "a posted batch has a PO" (e.g., `closeout.ts` blockers, parity audits, receipt projections) and make `purchaseOrderId` nullability explicit there.

### 6.2 Catalog wiring (`src/shared/commandCatalog.ts`)

- `commandNames`: add both names.
- `commandLabels`: "Settle client debt with product", "Pay with product".
- `commandMinRole`: **`manager`** (non-cash settlement is sensitive; matches `applyClientCredit`).
- `reversalPolicies`: `offsettable` with guidance (see §7).
- `MONEY_MUTATING_COMMANDS`: **add both** — they mutate balances/bills, so they join the all-or-nothing money cohort in `runBulk`.
- `commandFamilies`: new `Barter` family (or fold into `Payments`).

### 6.3 Atomicity & concurrency

All legs run inside the single `db.transaction` opened by `executeCommand`. Reuse the established locking discipline:
- `SELECT … FOR UPDATE` on the `customers` row (inbound) / `vendorBills` row (outbound) before mutating balances.
- `SELECT … FOR UPDATE` on each source `batches` row (outbound) before decrementing `availableQty`; re-check `availableQty >= qty` under lock.
- `assertPeriodUnlocked(period)` before writing the gain/loss correction entry.
- `snapshotByAffectedIds` must include the new tables — add `barterSettlements`/lines to the `tablePairs` and the relevant ids to `collectIds` so before/after snapshots and reversals work.

---

## 7. Reversal semantics

The command bus reverses by restoring `beforeSnapshot`. Barter is harder because the inventory may have moved on:

- **Outbound reversal** (return issued product): restore `availableQty` on source batches, restore the vendor bill `amountPaid`/`status`, reverse the gain/loss journal row (new offsetting `correctionJournalEntries` row, respecting period lock), mark settlement `reversed`. Generally safe.
- **Inbound reversal** is dangerous if the **received batch was already (partly) resold**. Guard: refuse reversal when `batch.availableQty < batch.intakeQty` (i.e., some has left) — require an explicit offsetting settlement instead. Encode this in `reversalPolicies` guidance: *"Offsettable. If the received product has been sold, reverse the downstream sale first or post an offsetting outbound settlement."*
- Period locks: if the settlement's period is locked, reversal must be blocked (consistent with existing closeout rules).

---

## 8. The flows, end to end

### 8.1 Inbound — `settleDebtWithProduct`
```
payload: { customerId, lines:[{productName, qty, unitCost, category?, brandId?, vendorId?}],
           settlementAmount?, allocationIntent?: 'fifo'|'selected_invoice'|'unapplied', invoiceId?, reason }
```
1. Validate (Zod), `requiredId(customerId)`, lines non-empty, qty>0, unitCost≥0.
2. `costBasis = Σ mulMoney(qty, unitCost)`; `settlementAmount = payload.settlementAmount ?? costBasis` (D2 default).
3. For each line: insert owned `batches` row (§6.1) + `inventoryMovements kind='barter_intake'`.
4. Lock customer; `balance = subMoney(balance, settlementAmount)`; insert `clientLedgerEntries kind='product_settlement'` (amount `-settlementAmount`, `balanceAfter`).
5. If `allocationIntent` set, run allocation against open invoices (reuse `allocatePayment` core) → `barterSettlementAllocations` + `invoices.amountPaid`.
6. Insert `barterSettlements` (gainLoss = 0 inbound) + lines.
7. `affectedIds = [settlementId, customerId, ...batchIds, ...invoiceIds]`.
8. Post-commit: `createBarterReceipts` (internal + external snapshots).

### 8.2 Outbound — `payWithProduct`
```
payload: { counterpartyType:'vendor'|'customer', vendorId?|customerId?,
           lines:[{batchId, qty}], settlementAmount?, vendorBillId?|allocationIntent?, reason }
```
1. Validate; resolve counterparty.
2. Lock each source batch; check `availableQty >= qty`; `costBasis = Σ mulMoney(qty, batch.unitCost)`.
3. `settlementAmount = payload.settlementAmount ?? costBasis` (D2 default); `gainLoss = subMoney(settlementAmount, costBasis)`.
4. Decrement `batches.availableQty`; insert `inventoryMovements kind='barter_issue'` (qtyDelta negative).
5. Settle: vendor → `recordVendorPayment`/`postVendorLedgerPayment` path with `method='product'`; customer → reduce balance / buyer credit.
6. If `gainLoss != 0`: `assertPeriodUnlocked`; insert `correctionJournalEntries` (`source_type='barter_settlement'`, `source_id`, `command_id`, `memo`).
7. Insert `barterSettlements` + lines; `affectedIds` includes settlement, counterparty bill/customer, batches, journal entry.
8. Post-commit receipts (vendor payout style).

### 8.3 Partial barter + cash
Kept **composable**: the product leg is one barter command; any cash remainder is the existing `logPayment`/`recordVendorPayment`. When they must be atomic, submit them together through `commands.runBulk` (both are in `MONEY_MUTATING_COMMANDS`, so they commit/rollback as a cohort). No new "mixed tender" command needed for v1.

---

## 9. Invariants, reconciliation, and the credit engine

- **Balance reconciliation** (`balanceReconciliation.ts`): `clientLedgerEntries kind='product_settlement'` carries a signed `amount`, so `SUM(amount)` continues to equal `customers.balance` automatically. Add a unit test asserting an inbound settlement keeps drift = 0.
- **Money invariants** (`moneyInvariants` / migration CHECKs): add the new CHECK constraints (§5.3). Add an invariant test that `gain_loss = settlement_amount − cost_basis` for every settlement.
- **Inventory non-negativity:** the existing `batches … available_qty >= 0` CHECK already guards outbound over-issue; the app-level `FOR UPDATE` re-check gives a friendly error before hitting it.
- **Credit engine** (`src/server/services/creditEngine/`): non-cash settlements reduce balances and therefore feed debt-aging/utilization signals. Confirm the credit recompute enqueue (as in `allocatePayment`) is triggered for inbound settlements so assessments stay fresh.
- **Closeout** (`closeout.ts`): add barter settlements to control totals / archive exports; ensure an open/unposted settlement (none expected — they post atomically) doesn't block, and that gain/loss entries are included in the period archive.

---

## 10. Receipts & UI

**Receipts** (`src/server/services/` + `documentSnapshots.ts`): new `createBarterReceipts` producing internal (full: cost basis, gain/loss, batch refs) and external (counterparty-facing: "product accepted as payment — $X applied") snapshots, wired as post-commit hooks in `commandBus.ts` next to the other receipt hooks.

**UI** (tRPC + client):
- Inbound: from a customer's AR / balance view, "Accept product as payment" → line editor (product, qty, unit cost, optional agreed value, optional target invoice).
- Outbound: from a vendor bill / payables view, "Pay with product" → pick batch(es) + qty, optional agreed value, preview cost basis & gain/loss.
- A **preview/impact** string (the schema already has `impactPreview` on payments) showing balance-after, inventory effect, and gain/loss before commit.
- Surface settlements in entity timelines and the Recovery/command views (reversible via existing reversal UI).

---

## 11. Edge cases to cover in tests

1. Inbound where received product is later resold, then someone tries to reverse → blocked with guidance.
2. Outbound over-issue (qty > availableQty) → rejected under lock.
3. Settlement amount overridden above/below cost → correct signed gain/loss, correct period, blocked if period locked.
4. Inbound allocation to specific invoice vs FIFO vs unapplied; over-settlement beyond outstanding balance → produces a buyer credit / unapplied amount (reuse existing semantics) rather than negative invoice.
5. Consigned (`ownershipStatus='C'`) product used outbound → must settle/ု trigger the consignment vendor bill correctly (do not give away product you don't own free-and-clear without flagging). Recommend **blocking outbound barter of `C` inventory** in v1, or requiring ownership transfer first.
6. Idempotency: same `idempotencyKey` replays the stored result, no double inventory move.
7. Reversal restores balances, bills, inventory, and offsets the gain/loss entry.
8. Multi-line / multi-batch settlements; rounding (`Decimal.js`) across many lines sums exactly.
9. Reconciliation cron drift = 0 after settlements.

---

## 12. Phased delivery (work breakdown)

Each phase is independently shippable and testable (TDD-first per repo policy; coverage per `.coverage-thresholds.json`).

- **Phase 0 — Schema & migration.** Tables, enum/column additions, CHECK constraints, `schema.ts` parity, snapshot/`collectIds` wiring. *(No behavior yet.)*
- **Phase 1 — Outbound vendor barter.** `payWithProduct` for vendor bills (builds on existing `recordVendorPayment` / `postVendorLedgerPayment`), inventory issue, gain/loss journal, reversal, receipts, tests. *(Highest reuse, lowest novelty — good first slice.)*
- **Phase 2 — Inbound client barter.** `settleDebtWithProduct`, PO-less intake path (§6.1), AR reduction + optional allocation, reversal guard, receipts, tests. *(Introduces the PO-less intake, the riskier piece — isolate it.)*
- **Phase 3 — Outbound client / refund-in-kind + partial barter+cash via `runBulk`.**
- **Phase 4 — Invariants, reconciliation tests, closeout/archive inclusion, credit-engine signal verification, UI polish, impact preview.**

Estimated: each phase ~1 focused work unit; Phase 0/2 carry the most cross-cutting risk.

---

## 13. Risks & far-reaching dependencies

- **PO-less intake (TER-1658) regression risk** — the assumption "posted batch ⇒ has a PO" is embedded in closeout, parity audits, and projections. Must be swept (§6.1). *High.*
- **Inventory valuation drift** — if outbound cost basis is taken from `unitCost` but a batch's cost was itself an override/exception, ensure we read the resolved landed cost, not a stale column. *Medium.*
- **Reversal after downstream movement** — inbound product resold, outbound product was consigned. Guards required. *Medium.*
- **Period locks vs gain/loss** — gain/loss must land in the correct open period; late reversals into locked periods must be blocked. *Medium.*
- **Tax/regulatory** — barter is generally taxable at fair value and may carry 1099-B/barter-exchange reporting obligations. v1 ensures **auditable records** (settlement docs, gain/loss journal, receipts) but does **not** generate tax forms. Flag for finance. *Document, out of scope.*
- **Credit engine feedback** — non-cash balance reductions influence credit limits; verify no unintended limit inflation from large barter settlements. *Low/Medium.*

---

## 14. Out of scope (v1) / future

- **Multi-party netting** — using a client's inbound product to directly settle a *different* vendor's bill in one document (A owes us / we owe B → net). v1 handles this as two sequential settlements sharing the same received batch.
- **Mixed-tender single command** — handled via `runBulk` composition for now.
- **Tax form generation** (1099-B / barter exchange statements).
- **FMV/appraisal workflow** — v1 uses cost basis with optional manual override; no formal appraisal capture.

---

## 15. Open questions for finance/product

1. **Consigned product outbound (edge #5):** block entirely in v1, or allow with an automatic ownership-transfer + consignment-bill settlement? *(Plan assumes block.)*
2. **Over-settlement inbound:** if product value exceeds what the client owes, create a buyer credit (assumed) or refuse?
3. **Who can override the settlement value** away from cost — `manager` (assumed) or a higher role, and does an override require a reason code (recommended)?
4. **Tax reporting:** confirm v1 "auditable records only" is acceptable and no form generation is required this cycle.

---

## Appendix A — Key files to touch

| Concern | File |
|---|---|
| Schema + migration | `src/server/schema.ts`, `migrations/00xx_*.sql` |
| Catalog (names/labels/RBAC/reversal/money-set/families) | `src/shared/commandCatalog.ts` |
| Shared payment enum | `src/shared/schemas.ts` |
| Barter service (new) | `src/domains/barter/commands.ts`, `src/domains/barter/index.ts` |
| Command dispatch + snapshot wiring | `src/server/services/commandBus.ts` |
| Reuse: AR allocation | `src/domains/payments/commands.ts` |
| Reuse: AP settlement | `src/domains/vendor-management/commands.ts`, `recordVendorPayment` |
| Reuse: intake | `src/domains/intake/commands.ts` |
| Gain/loss journal | `correctionJournalEntries` (+ `assertPeriodUnlocked`) |
| Reconciliation | `src/server/services/balanceReconciliation.ts` |
| Invariants | `src/server/services/moneyInvariants*.ts` |
| Receipts (new) | `src/server/services/barterReceipts.ts`, `src/shared/documentSnapshots.ts` |
| Closeout/archive | `src/server/services/closeout.ts` |
| Router + UI | `src/server/routers/*`, `src/client/*` |
| Tests | `src/server/services/commandBus.barter*.test.ts`, domain tests |
