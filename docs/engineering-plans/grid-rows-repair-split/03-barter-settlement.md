# Plan 3 — Product as a Monetary Instrument (Barter Settlement)

**Type:** New money-mutating capability
**State:** 📄 Engineering plan only — no code
**Source doc:** `docs/engineering-plans/product-as-monetary-instrument-plan.md` (on `codex/grid-rows-repair-20260624`) — carry to `main` with Phase 0.
**Registry anchor:** propose new `CAP-0xx` / command family `CMD-BARTER` in Linear (team `Terpcorp`).

---

## 1. What this is

Let **physical product (inventory) settle debt instead of cash**, in both directions:

- **Inbound** — a client hands over product to pay down their AR balance. Operator
  **receives** inventory; client balance drops.
- **Outbound** — operator hands a vendor (or client) product to settle what's owed.
  Operator **gives up** inventory; counterparty's bill / operator's debt drops.

The reason it's far-reaching: a barter settlement is **two coupled events that must
commit atomically** — an inventory event (valued at **cost**) and a settlement event
(valued at the **agreed settlement amount**) — and any difference is a **realized
gain/loss** that must be journaled. It touches every money invariant, nightly balance
reconciliation, period locks, reversals, receipts, and the credit engine.

It reuses existing primitives (command bus, `clientLedgerEntries`,
`vendorBills`/`vendorPayments`, `batches`, `inventoryMovements`,
`correctionJournalEntries`, document snapshots, `Decimal.js`) — no parallel accounting stack.

## 2. Product decisions already locked (do not re-ask)

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | First-build scope | **Both directions** | One shared engine, two entry flows. |
| D2 | Valuation basis | **Item cost (`unitCost`)** | `settlementAmount` defaults to `Σ(qty×unitCost)`; default gain/loss = 0. |
| D3 | Gain/loss rigor | **Full recognition** | Override → `correctionJournalEntries`, period-aware. |
| D4 | Inbound intake | **Real barter PO + receipt** (not PO-less batch) | Reuses intake path; creates a `vendorBill` netted against AR. Needs customer↔vendor identity. |
| D5 | Consigned (`C`) outbound | **Blocked in v1** | Reject; guide to `transferInventoryOwnership`→`OFC` first. |
| D6 | Over-settlement inbound | **Allowed → buyer credit** | Reuse `buyer_credit`/unapplied semantics. |
| D7 | Who may override value | **`manager`+, reason required** | Override is the only thing creating gain/loss → gated + justified. |
| D8 | Tax forms (1099-B) | **Not needed** | Auditable records only. |

**Net rule (D2+D3):** `settlementAmount` defaults to cost basis ⇒ `gainLoss = 0`; the
full-recognition machinery is always built but dormant until a manager overrides the value.

## 3. The three-leg model

Every settlement = one atomic command, up to three legs:

```
INVENTORY LEG   receive (inbound) OR issue (outbound)   → valued at COST
SETTLEMENT LEG  reduce client AR  OR reduce vendor bill → valued at SETTLEMENT AMOUNT
GAIN/LOSS LEG   correction-journal = settlementAmount − cost  (zero by default)
```

- **Inbound** (D4): create+receive a **barter PO** against the counterparty's vendor
  identity (auto-provisioned via contacts/CAP-033) → owned `OFC` batches + a `vendorBill`
  for cost basis → **net that bill against the client's AR** (`clientLedgerEntries
  kind='product_settlement'`, contra `vendorPayment` `method='product'`, cash = 0).
- **Outbound**: issue qty from existing batches (`availableQty -= qty`, guard ≥0, movement
  `kind='barter_issue'`, reject consigned per D5) → reduce vendor bill (`recordVendorPayment`/
  `postVendorLedgerPayment` with `method='product'`) or client credit → gain/loss journal.

## 4. Data model changes (§5 of source doc)

**New tables:** `barter_settlements` (header: direction, counterparty, settlementAmount,
costBasis, gainLoss, valueOverridden, overrideReason, PO/receipt/bill provenance, status),
`barter_settlement_lines` (batch, qty, unitCost, lineSettlementAmount),
`barter_settlement_allocations` (optional invoice/bill targeting).

**Enum/column additions:** `paymentMethodSchema` + `vendorPayments.method` += `'product'`;
`clientLedgerEntries.kind` += `'product_settlement'` / `'product_settlement_reversal'`;
`inventoryMovements.kind` += `'barter_issue'` / `'barter_issue_reversal'` (inbound reuses
the receipt movement); `correctionJournalEntries` += nullable `source_type` / `source_id`
/ `command_id` for traceable, reversible gain/loss.

**Migration:** one Drizzle migration (next sequential) + `schema.ts` parity; `NOT VALID`
CHECKs (`settlement_amount >= 0 AND cost_basis >= 0`; `qty > 0 AND unit_cost >= 0`;
allocation `amount > 0`); `gain_loss = settlement_amount − cost_basis` enforced in app layer.

## 5. Commands (standard recipe)

Two commands, one shared service `src/domains/barter/commands.ts`:

| Command | Direction | Effects |
|---|---|---|
| `settleDebtWithProduct` | inbound | barter PO+receipt → owned batch + bill; net bill vs AR (+ optional invoice allocation); header/lines; receipt |
| `payWithProduct` | outbound | issue product from batch(es); reduce vendor bill / client credit; gain/loss journal; header/lines; receipt |

Catalog wiring (`src/shared/commandCatalog.ts`): add names; labels; `commandMinRole =
manager`; `reversalPolicies = offsettable` with guidance; **add both to
`MONEY_MUTATING_COMMANDS`**; new `Barter` family. Atomicity: all legs in the single
`executeCommand` transaction; `SELECT … FOR UPDATE` on customer/bill/batch rows;
`assertPeriodUnlocked` before gain/loss; add the new tables to `snapshotByAffectedIds`
`tablePairs` + `collectIds`.

## 6. Reversal semantics (the hard part — §7 of source)

- **Outbound reversal:** restore `availableQty`, restore bill `amountPaid`/`status`,
  offset the gain/loss row (respect period lock), mark `reversed`. Generally safe.
- **Inbound reversal:** must unwind AR netting, contra `vendorPayment`/`vendorBill`,
  receipt, PO, **and** the received inventory — dangerous if the batch was already (partly)
  resold. **Guard:** refuse when `batch.availableQty < batch.intakeQty`, or when the
  barter PO/receipt was amended downstream. Prefer **offsetting entries over hard reversal**
  once any downstream activity exists. Period-locked settlements block reversal.

## 7. Invariants / reconciliation / credit (§9 of source)

- Balance reconciliation: signed `product_settlement` ledger entries keep
  `SUM(amount) == customers.balance` automatically — add a drift=0 test.
- Money invariants: add the new CHECKs + a test that `gain_loss = settlement − cost` for every settlement.
- Inventory non-negativity: existing `available_qty >= 0` CHECK + app `FOR UPDATE` re-check.
- Credit engine: confirm `enqueueCustomerRecompute` fires for inbound settlements.
- Closeout: include barter settlements + gain/loss in control totals / period archive.

## 8. Phased delivery (each independently shippable, TDD-first)

- **Phase 0 — Schema & migration.** Tables, enum/column additions, CHECKs, `schema.ts`
  parity, snapshot/`collectIds` wiring. *(No behavior.)*
- **Phase 1 — Outbound vendor barter.** `payWithProduct` for vendor bills (highest reuse,
  lowest novelty — best first slice): inventory issue, gain/loss journal, reversal, receipts, tests.
- **Phase 2 — Inbound client barter.** `settleDebtWithProduct`: **customer↔vendor identity
  resolution** (§6.1 — isolate this bridge), barter PO create+receive, AP↔AR netting +
  optional allocation, over-settlement→buyer credit, reversal guard, receipts, tests.
- **Phase 3 — Outbound client / refund-in-kind + partial barter+cash** via `runBulk` composition.
- **Phase 4 — Invariants, reconciliation tests, closeout/archive inclusion, credit-engine
  signal verification, UI polish, impact preview.**

Phase 2 (identity bridge + AP↔AR netting) carries the most cross-cutting risk.

## 9. Test matrix (§11 of source) — must cover

Resold-then-reverse blocked; outbound over-issue rejected under lock; override
above/below cost → correct signed gain/loss in correct period (blocked if locked); inbound
allocation FIFO vs selected-invoice vs unapplied + over-settlement→buyer credit; consigned
outbound rejected (D5); idempotency replay (no double inventory move / duplicate PO);
full reversal restores balances+bills+inventory+PO and offsets gain/loss; multi-line/
multi-batch rounding sums exactly (`Decimal.js`); reconciliation drift = 0; vendor-identity
auto-provision creates exactly one (reuses existing); override gating (non-manager rejected,
manager-without-reason rejected).

## 10. Key risks

Customer↔vendor identity bridge (don't double-count vendor analytics; tag barter
POs/bills) · inventory valuation drift (read resolved landed cost, not stale `unitCost`) ·
reversal after downstream movement · period locks vs gain/loss timing · credit-engine
limit inflation from large settlements. Tax/regulatory out of scope by D8.

## 11. Definition of done (v1)

All four phases shipped TDD-first with coverage met; the §9 test matrix green; money
invariants and nightly reconciliation pass with barter activity present; reversal guards
proven; receipts (internal + external) generated; routes through CLAUDE.md gates
(design review → plan review → execution choice) and **Full Gate QA** (money-mutating,
operator-critical) with adversarial cross-model review.
