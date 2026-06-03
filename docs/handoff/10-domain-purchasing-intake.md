# Domain Handoff — Purchasing (CMD-PO) & Intake/Receiving (CMD-INTAKE)

> Ground truth is the code. Every claim below cites `file:line` against commit state on 2026-06-02.
> Primary sources:
> - `src/shared/commandCatalog.ts` (command names, labels, min-role, reversal policy)
> - `src/server/services/commandBus.ts` (handlers + reversal)
> - `src/server/services/poFinalizationReceipts.ts`, `src/server/services/projections/purchaseFinalization.ts`
> - `src/server/schema.ts` (tables)
> - `src/server/routers/queries.ts` (read procs)
> - `src/client/views/IntakeView.tsx`, `src/client/components/*`, `src/client/components/drawerTabs/Po*.tsx`
> - `migrations/0004,0007,0010,0011,0012,0013,0051`
> - `src/shared/paymentTerms.ts`, `src/shared/priceRange.ts`
> - `docs/features/purchase-orders-enhancements-2026-05.md`

---

## 0. Architecture Recap (how PO/intake flows through the bus)

All write-path mutations go through one entry point: `executeCommand(input, user, io)`
(`commandBus.ts:480`). The flow is:

1. **Access gate** — `assertCommandAccess(user, input.name)` (`commandBus.ts:481`) enforces
   `commandMinRole` from the catalog (`commandCatalog.ts:336`).
2. **Atomic idempotency claim** — INSERT a `pending` `command_journal` row with
   `ON CONFLICT (idempotency_key) DO NOTHING RETURNING` (`commandBus.ts:490-508`). The row
   that comes back IS the claim. If zero rows returned, the caller lost the race and either
   replays the cached result or throws the safe message `Command already in progress for this
   idempotency key.` (`commandBus.ts:510-540`).
3. **`beforeSnapshot`** captured from payload entity ids (`commandBus.ts:485`,
   `snapshotByAffectedIds` `commandBus.ts:5838`) — used later by reversal.
4. **Transaction** — `runCommand(tx, name, payload, user, commandId, reason)` dispatches to the
   per-command handler (switch at `commandBus.ts:817`). Handlers run inside one drizzle tx.
5. **Post-commit observers** (best-effort, cannot fail the command): `afterSnapshot` write, JSONL
   audit, socket `command:completed` broadcast to the `authenticated` room (`commandBus.ts:655`),
   and document-snapshot hooks (PO finalization receipt at `commandBus.ts:672`).
6. **Failure path** (`commandBus.ts:763`) scrubs DB error text (`scrubDatabaseError`), UPDATEs the
   pending row to `failed` (never re-INSERTs — prevents unique-violation leak #24), preserves the
   raw message server-side in `command_journal.error`, and emits `command:failed`.

**Money/qty precision:** all money accumulation uses `Decimal.js` helpers `addMoney/subMoney/
subMoneyMin0/mulMoney/moneyScale` (`commandBus.ts:350-404`) writing `numeric(12,2)`; quantities use
`qtyScale` → 3 dp into `numeric(12,3)`.

**Socket events relevant here:** only `command:completed` / `command:failed` fire for PO/intake
commands (`commandBus.ts:655,807`). The pick-specific events (`pick:queue`, `pick:order:*`,
`sales:order:*:line:changed`) are NOT emitted by PO/intake commands (lists at
`commandBus.ts:732,749`). Peer broadcasts strip the toast (may contain vendor/customer names) and
carry only `{commandId, commandName, actorId, affectedIds}` for cache invalidation.

---

# SECTION A — JOURNEY MAP

## A.1 The PO state machine (canonical lifecycle)

```
draft ──finalize──▶ finalized ──approve──▶ approved ──receivePO──▶ (draft batches) ──postReceipt──▶ received
  ▲                     │                      │
  └──── unfinalize ◀────┘                      └── (auto receive on approve if vendor set)
  │
  └── cancel (only when no line received) ──▶ cancelled
```

Status values written by handlers: `draft`, `finalized`, `approved`, `received`, `cancelled`
(and `updatePurchaseOrder` also permits manual writes of `ordered`/`partially_received`,
`commandBus.ts:1465`). `purchase_orders.status` default is `draft` (`schema.ts:164`).

**Breaking change (May 2026, documented `purchase-orders-enhancements-2026-05.md:166`):** a PO can
no longer go `draft → approved` directly. A mandatory `finalized` step now sits between them
(`commandBus.ts:1670`, `approvePurchaseOrder` requires `status==='finalized'` at
`commandBus.ts:1800`).

### Editability invariant
`assertPurchaseOrderEditable(status)` (`commandBus.ts:5613`) throws for `approved`, `received`,
`cancelled`. So header edits, line add/update/remove are allowed only in `draft` / `finalized`
(and the legacy `ordered` / `partially_received` that `updatePurchaseOrder` can set). This is the
single gate that protects line totals once a PO is locked.

---

## A.2 Happy path — fixed-cost PO end to end

1. **Create PO** (`createPurchaseOrder`, operator). Operator picks a vendor; optionally sets
   `expectedDate`, `paymentTerms`, `prepaymentAmount`, and three note fields. PO is created
   `status='draft'`, `poNo` auto-generated `PO-<base36 ts>-<rand>` (`code()` `commandBus.ts:405`),
   `total=0`. Toast: `Started purchase order PO-… for <vendor>.` (`commandBus.ts:1390`).
2. **Add lines** (`addPurchaseOrderLine`, operator). Each line needs product name, category,
   qty>0, and EITHER a fixed `unitCost>0` OR a cost range. Line `status` becomes `planned` when it
   has a valid cost, else `needs_fix` (`commandBus.ts:1529`). After each add the PO `total` is
   recomputed (`recalcPurchaseOrder`, `commandBus.ts:5595`) using fixed cost or range midpoint.
   Shorthand can auto-decode name/category/tags (`decodeShorthand` `commandBus.ts:6673`).
3. **(optional) Edit / remove lines** (`updatePurchaseOrderLine` / `removePurchaseOrderLine`,
   operator). Removal is blocked once `receivedQty>0` (`commandBus.ts:1658`).
4. **Finalize** (`finalizePurchaseOrder`, operator). Requires `status='draft'`, ≥1 line, and all
   lines pass `purchaseOrderLineIssues` (`commandBus.ts:5619`). Sets `status='finalized'`,
   `finalizedAt=now`. **Post-commit:** emits external+internal `purchase_finalization` document
   snapshots (`poFinalizationReceipts.ts:24`).
5. **Approve** (`approvePurchaseOrder`, **manager**). Requires `status='finalized'`. Re-validates
   lines, sets every line `status='planned'`, PO `status='approved'`, `orderedAt`,
   `orderedBy=user`, recomputes total. **If the PO has a vendor, it auto-calls
   `receivePurchaseOrder` inline** (`commandBus.ts:1831`) — materializing draft intake batches in
   the same transaction. Optional referee-credit accrual if `refereeRelationshipId` present
   (`commandBus.ts:1813`).
6. **Receive → draft intake batches** (`receivePurchaseOrder`, operator — or auto from approve).
   For each not-yet-materialized line with qty>0, creates a `batches` row `status='draft'`,
   `location='Receiving'`, `arrivalStatus='arrived'`, `availableQty=0`, copying line product/cost
   data and inferring ownership from payment terms (`commandBus.ts:1864-1909`).
7. **Verify counts** (operator, in IntakeView). Operator sets actual qty per batch, adds
   discrepancy reasons.
8. **Post receipt** (`postPurchaseReceipt`, operator — single-batch via Verify button, or all via
   `verifyAllIntake`). Creates a `purchase_receipts` row + per-batch `purchase_receipt_lines`,
   flips each batch to `status='posted'` with `availableQty=intakeQty`, writes an
   `inventory_movements` `intake_posted` row, queues a `photography_queue` row, updates PO-line
   `receivedQty`+status, flips the PO to `received`, and generates one `vendor_bills` row per
   vendor (net-terms payable). Toast names the receipt number (`commandBus.ts:1361`).

**End state:** posted inventory available for sale, a posted purchase receipt, and an open vendor
bill flowing into AP (CMD-PAYMENTS / CMD-VENDOR domain).

---

## A.3 Branch scenarios (exhaustive)

### Cost modes (XOR) — fixed vs range
- **Fixed cost:** `unitCost>0`, both range bounds NULL.
- **Cost range:** `unitCost=0`, `costRangeLow>0`, `costRangeHigh>0`, low≤high.
- **Both supplied → error** `Cannot specify both unit cost and cost range.` (`commandBus.ts:1517`).
- **Partial / inverted range → error** `Invalid cost range: low must be <= high and both must be
  positive.` (`commandBus.ts:1521`, `validateCostRange` `priceRange.ts`).
- DB also enforces it: `po_line_cost_exclusivity` CHECK (`0010_po_cost_range.sql`).
- **Range present ⇒ PO total uses midpoint** `(low+high)/2` (`recalcPurchaseOrder`
  `commandBus.ts:5603`). So a range PO's `total` is an *estimate*; the receipt posts at the real
  per-batch `unitCost` later, and `postPurchaseReceipt` then rewrites PO `total` to
  `Σ receivedQty×unitCost` (`commandBus.ts:1315-1323`).
- **Switching modes** (`updatePurchaseOrderLine`): setting a fixed `unitCost>0` clears both range
  columns; setting a valid range zeroes `unitCost`/`unitPrice` (`commandBus.ts:1621-1635`). Keeps
  the XOR invariant intact when an operator flips a line.

### Cost-range exception + finalization + prepayment (feature COMBINATION)
A PO authored with range lines can still be **finalized** (range satisfies
`purchaseOrderLineIssues`, `commandBus.ts:5627`) and **approved**. The PO `total` carried into the
finalization receipt and prepayment limit checks is the *midpoint estimate*. If the operator then
records a **prepayment** up to that estimated `prepaymentAmount`, the cap check
(`amount > po.prepaymentAmount`, `commandBus.ts:1757`) is against the *operator-entered*
`prepaymentAmount`, NOT the computed midpoint total — they are independent fields. After receipt
posting, PO `total` is rewritten to actuals, but the prepayment already recorded is not
re-validated. Edge corner: a range PO whose actual landed cost lands far from midpoint produces a
finalization snapshot/`total` that differs from the eventual posted bill total.

### Payment terms (`src/shared/paymentTerms.ts`)
Enum: `cod | prepay | net_15 | net_30 | net_60 | net_90 | consignment | vendor_terms`. `getTermsDays`
maps `cod`/`prepay`→0, `net_*`→N, `consignment`/`vendor_terms`→vendor's `termsDays`. **Caveat:** the
vendor-bill due date in `postPurchaseReceipt` does NOT call `getTermsDays`; it uses
`vendor.termsDays ?? 14` directly (`commandBus.ts:1351`). So a PO marked `net_90` still bills at the
vendor's default term days — `paymentTerms` currently only drives **ownership inference** at receive
time (below), not bill timing.

### Ownership inference at receive
`receivePurchaseOrder` sets batch `ownershipStatus` (`commandBus.ts:1883-1899`):
- explicit line `ownershipStatus != 'UNKNOWN'` → respected;
- terms `cod`/`prepay`/`net_*` → `OFC` (office owns);
- terms `consignment` → `C` (vendor retains);
- `vendor_terms`/unknown → left as line's value.

### Prepayments (`recordVendorPrepayment`, manager)
- Requires PO `status='approved'` (`commandBus.ts:1756`).
- `amount>0` and `amount ≤ po.prepaymentAmount` (`commandBus.ts:1752,1757`).
- **One prepayment per PO** — second attempt throws `Prepayment already recorded for this purchase
  order.` (`commandBus.ts:1762-1766`).
- Inserts a `vendor_payments` row with `vendorBillId=null` (bill not yet created; linked later),
  `purchaseOrderId`, `status='posted'`. UI: `RecordPrepaymentDialog.tsx` (method wire/check/ach/
  cash/crypto, client-side cap check mirrors server).

### Partial receipts
`receivePurchaseOrder` accepts an optional `lineIds[]` to receive a subset (`commandBus.ts:1848`).
It also **skips lines that already have a non-archived batch** (`linesWithBatches`,
`commandBus.ts:1852-1857`) — so re-running receive is idempotent per line and only materializes new
draft rows. `intakeQueue` recognizes `partially_received`/`ordered` PO statuses
(`queries.ts:1108`) and orders the queue `approved → partially_received → ordered → received`.

### Discrepancies (qty mismatch)
At post time, if a batch's `intakeQty` differs from its PO line's expected `qty`
(`commandBus.ts:1295`), a discrepancy note is composed: `Intake discrepancy: expected X uom,
received Y uom on <date> (<name>)`, optionally suffixed with the operator's free-text reason. These
notes are merged into `purchase_orders.internal_notes` (`commandBus.ts:1308-1312`) and the relevant
vendor bill's `discrepancy_notes` (`commandBus.ts:1342-1355`). Operator reasons come from the
IntakeView "Discrepancy reason" cell (`IntakeView.tsx:476`) and are passed through
`postPurchaseReceipt` payload `discrepancyNotes` keyed by batchId (`IntakeView.tsx:103`). The intake
grid colors qty amber when actual≠expected and the reason cell red when a mismatch lacks a reason
(`IntakeView.tsx:461-489`). Schema column added by `0007_intake_discrepancy_notes.sql`.

### Flag / reject a batch
- **`flagBatch`** (operator): appends `Flagged on <date>: <reason>` to `batches.validation_issues`
  and to PO `internal_notes`; non-destructive (`commandBus.ts:1974`). IntakeView auto-flags qty
  discrepancies during single-batch verify (`IntakeView.tsx:95-100`).
- **`rejectBatch`** (operator): blocked if already `posted` (`commandBus.ts:1934`). Sets batch
  `status='returned'`, `availableQty=0`, appends rejection note; rolls the rejected qty off the PO
  line `receivedQty` and **decrements any unpaid/unvoid vendor bill** by `qty×cost`
  (`subMoneyMin0`, `commandBus.ts:1960-1969`). Terminal (`reversalPolicies.rejectBatch` is
  `terminal`). UI: reason dropdown (over_weight, wrong_product, quality_fail, pricing_dispute,
  paperwork_mismatch, other) in `IntakeView.tsx:522`.

### Verify-all shortcut
`verifyAllIntake` (operator) is a convenience macro over `postPurchaseReceipt`
(`commandBus.ts:1995`): it gathers all `draft/ready/needs_fix` batches on the PO, snaps each
batch's `intakeQty` to the PO-line expected qty when they differ (accept-as-expected,
`commandBus.ts:2006`), clears validation issues, posts the receipt for all of them, and stamps PO
`internal_notes` with `Intake verified on <date> — all items accepted as expected.`. Throws `No
pending intake rows on this purchase order to verify.` when empty. UI: "Verify all" button gated by
a `useConfirm` dialog rendering `VerifyAllPreviewBody` (`IntakeView.tsx:271-292`).

### Cancel
`cancelPurchaseOrder` (manager): blocked if any line has `receivedQty>0`
(`commandBus.ts:1922`, error directs to intake reversal/correction). Sets PO `status='cancelled'`,
`cancelledAt`, and every line `status='cancelled'`. Terminal.

### Vendor approval (`resolveVendorApproval`) — note on domain placement
`resolveVendorApproval` (manager) is in the catalog/registry list given for this task but it
operates on **sales** order lines (`sales_order_lines.vendor_approval_state`), not purchasing
(`commandBus.ts:2990`). It flips a sales line's `vendorApprovalState` `pending → approved|declined`
(per-line via `lineId`, or all-pending on an order via `orderId`), then refreshes the order's
`vendorApprovalPending` rollup. Included here for completeness because it shares the "vendor
approval" name, but it belongs to CMD-SALES.

---

## A.4 Error states & recovery paths

| Situation | Where blocked | Recovery |
| --- | --- | --- |
| Edit/add/remove line on approved/received/cancelled PO | `assertPurchaseOrderEditable` `commandBus.ts:5613` | `unfinalizePurchaseOrder` only works from `finalized`; an approved PO must be reversed via `reverseCommandById(approvePurchaseOrder)` |
| Approve a non-finalized PO | `commandBus.ts:1800` | finalize first |
| Finalize a PO with no/invalid lines | `commandBus.ts:1686-1690` | fix lines (`purchaseOrderLineIssues`) |
| Remove a received line | `commandBus.ts:1658` | intake reversal/correction |
| Receive an unapproved PO | `commandBus.ts:1846` | approve first |
| Receive a PO with no vendor | `commandBus.ts:1847` | set vendor |
| Post receipt on a non-draft/ready batch | `commandBus.ts:1227` | only draft/ready post |
| Post receipt with batch validation issues | `commandBus.ts:1229` | fix per `batchValidationIssues` `commandBus.ts:7302` |
| Post receipt mixing vendors | `commandBus.ts:1232` | one vendor per receipt |
| Post receipt across >1 PO | `commandBus.ts:1234` | one PO per receipt |
| Prepayment > limit / duplicate / non-approved PO | `commandBus.ts:1756-1766` | adjust amount / single prepayment |
| Reject a posted batch | `commandBus.ts:1934` | use reversal/correction |
| Cancel PO with received product | `commandBus.ts:1922` | reverse intake first |

### Reversal (`reverseCommandById`, manager — `commandBus.ts:4666`)
Guards: original must exist, not already reversed, and `status='ok'`
(`commandBus.ts:4670-4672`). Dispatches by `original.commandName`. Reversible PO/intake commands
(`reversalPolicies`, `commandCatalog.ts:474-488`):
- **`finalizePurchaseOrder`** → PO back to `draft`, `finalizedAt=null` (`commandBus.ts:5009`).
- **`unfinalizePurchaseOrder`** → PO back to `finalized`, restore prior `finalizedAt` from
  beforeSnapshot (`commandBus.ts:5015`).
- **`approvePurchaseOrder`** → PO `draft`, `orderedAt=null`; each line recomputed to
  `needs_fix`/`planned` (`commandBus.ts:4729`).
- **`receivePurchaseOrder`** → draft batches → `reversed` (errors if any already `posted`:
  `Reverse the posted purchase receipt before reversing PO receiving.`), PO-line `receivedQty=0`
  `status='planned'`, PO → `approved`, `receivedAt=null` (`commandBus.ts:4739`).
- **`postPurchaseReceipt`** / **`verifyAllIntake`** → batches → `reversed`, generated vendor bills
  → `reversed`, purchase receipts → `reversed` (`commandBus.ts:4753`). Note: the
  `discrepancy_notes` annotation on the bill is intentionally NOT undone (persists as AP audit,
  `commandBus.ts:4721`).
- **`recordVendorPrepayment`** → reverses the vendor payment record (reversible policy).
Terminal PO/intake commands (cannot reverse, must re-author/correct): `createPurchaseOrder`,
`updatePurchaseOrder`, `add/update/removePurchaseOrderLine`, `cancelPurchaseOrder`, `rejectBatch`,
`flagBatch`, `createVendor` (`commandCatalog.ts:475-487`).

---

## A.5 Handoffs to other domains
- **CMD-PAYMENTS / CMD-VENDOR (AP):** `postPurchaseReceipt` emits `vendor_bills` (open, net-terms)
  and `recordVendorPrepayment` emits `vendor_payments`. Bills surface in `relationshipSummary`
  vendor pane (`queries.ts:930`).
- **Inventory (CAP batches):** posting writes `inventory_movements` (`intake_posted`) and makes
  `availableQty` sellable; `adjustBatchQuantity`/`setInventoryStatus`/transfers take over after
  posting.
- **Media (CMD-TAGS / photography):** every posted batch auto-queues a `photography_queue` row
  (`commandBus.ts:1291`).
- **Referees (CMD-MATCHMAKING-adjacent):** `approvePurchaseOrder` may accrue referee credit and
  stamp `referee_relationship_id` / `referee_credit_amount` (`commandBus.ts:1813-1826`).
- **Documents:** `finalizePurchaseOrder` produces external+internal finalization snapshots read by
  `ReceiptPanel` via `purchaseOrder*Receipt` / `PrintHtml` / `SignalText` procs.

---

## A.6 Frontend surfaces (where each feature lives)
- **IntakeView** (`src/client/views/IntakeView.tsx`): master-detail grid. Master rows = POs
  (`intakeQueue`), detail rows = batches. Per-batch Verify/Reject/Add-note/Market-name/Delete
  actions; PO-level "Verify all" + "Preview receipt". CSV import (validate-first) via
  `importBatchesCsv`. Selecting a master row pins drawer entity `po`; selecting a detail row pins
  `lot` (`IntakeView.tsx:143-166`).
- **PO authoring** lives in `OperationsViews.tsx` (per the feature doc; the PO grid + finalize/
  approve/receive primary button + payment-terms/prepayment/notes columns).
- **`RecordPrepaymentDialog.tsx`** — manager prepayment capture.
- **`ReceiptPanel.tsx`** — read-only external/internal/print/signal-text receipt viewer; internal
  tab gated to manager/owner (`ReceiptPanel.tsx:25,35`).
- **`VerifyAllPreviewBody.tsx`** — confirm-dialog preview of pending batches + total committed.
- **PO drawer tabs** (`drawerTabs/Po*.tsx`): `PoLinesTab` (lines), `PoLinkedIntakeTab` (batches),
  `PoVendorTab` (vendor context), `PoHistoryTab` + `PoCommandsTab` (command journal for the PO).

---

# SECTION B — BACKEND SPEC

> For each command: input zod schema · min role · mutation logic · tables/columns written ·
> invariants · idempotency/conflict · projections/receipts · socket events · failure modes.
> All commands share the bus-level idempotency claim (§0). Socket: `command:completed` on success,
> `command:failed` on error, both to the `authenticated` room. None of these emit pick events.

## B.1 `createPurchaseOrder` — operator
- **Schema** `createPurchaseOrderPayloadSchema` (`commandBus.ts:212`): `vendorId` uuid (required);
  optional `expectedDate` str, `paymentTerms` str, `prepaymentAmount` coerced number, `buyerNotes`,
  `internalNotes`, `externalNotes`.
- **Logic** (`commandBus.ts:1370`): verify vendor exists; INSERT `purchase_orders`.
- **Writes** `purchase_orders`: `poNo`(gen), `vendorId`, `expectedDate`, `orderedBy=userId`,
  `paymentTerms` (default `vendor_terms`), `prepaymentAmount` (scaled, default 0.00), three note
  cols, `status='draft'`. `total` defaults 0.
- **Invariants** vendor must exist. **Failure** `Vendor not found.`
- **Reversal** terminal — cancel/edit the draft instead.

## B.2 `updatePurchaseOrder` — operator
- **Schema** ad-hoc (no dedicated zod); reads `purchaseOrderId`|`id` (`commandBus.ts:1450`).
- **Logic** load PO; `assertPurchaseOrderEditable`; conditionally set vendor, expectedDate,
  paymentTerms, prepaymentAmount, 3 notes, and `status` (only `draft|approved|ordered|
  partially_received` allowed, `commandBus.ts:1465`).
- **Writes** `purchase_orders` selected cols + `updatedAt`.
- **Invariant** not editable when approved/received/cancelled; status whitelist on manual set.
- **Failure** `Purchase order not found.` / `…status is not valid for manual update.` Reversal terminal.

## B.3 `addPurchaseOrderLine` — operator
- **Schema** ad-hoc. Reads `purchaseOrderId` (req), `productName|name`, `category`, `qty`,
  `unitCost`, `costRangeLow/High`, `uom`, `subcategory`, `tags`, `sourceCode`, `shorthand`,
  `legacyMarker`/`ownershipStatus`, `notes`, `internalNotes`, `externalNotes`.
- **Logic** (`commandBus.ts:1484`): `SELECT … FOR UPDATE` row-lock on the PO (prevents concurrent
  total-recalc races; snake_case access via bracket notation, `commandBus.ts:1492`);
  `assertPurchaseOrderEditable`; decode shorthand; require name+category; qty>0; cost XOR
  validation; `ensureItem` (auto-SKU if no `itemId`); `ensureTagCatalog`; INSERT line; recalc PO.
- **Writes** `purchase_order_lines` (full column set incl. `costRangeLow/High`, `subcategory`,
  `internalNotes`/`externalNotes`, `unitPrice=unitCost`, `status` = `planned`|`needs_fix`); may
  INSERT `items` and `tag_catalog`; UPDATE `purchase_orders.total`.
- **Invariants** qty>0; XOR cost; `unitCost ≥ 0`; range positive & low≤high.
- **Conflict** PO row lock serializes concurrent line adds.
- **Failures** `Purchase order not found.` / `Product name is required.` / `Category is required.`
  / `Quantity must be greater than zero.` / `Cannot specify both unit cost and cost range.` /
  `Invalid cost range…` / `Unit cost cannot be negative.` Reversal terminal (remove unreceived line).

## B.4 `updatePurchaseOrderLine` — operator
- **Logic** (`commandBus.ts:1564`): load line; `FOR UPDATE` lock parent PO; editability check;
  conditional field updates; qty change blocked below `receivedQty` (`commandBus.ts:1596`); cost
  update path enforces XOR and clears the opposite mode; recompute line `status` from received vs
  qty and cost validity (`commandBus.ts:1640`); recalc PO.
- **Writes** `purchase_order_lines` (changed cols), maybe `tag_catalog`, `purchase_orders.total`.
- **Invariants** editable PO; qty>0 and ≥ receivedQty; XOR cost. Reversal terminal.

## B.5 `removePurchaseOrderLine` — operator
- **Logic** (`commandBus.ts:1646`): load line; lock PO; editability; block if `receivedQty>0`;
  DELETE line; recalc PO.
- **Writes** DELETE `purchase_order_lines`; UPDATE `purchase_orders.total`.
- **Failure** `Received purchase order lines cannot be removed…` Reversal terminal.

## B.6 `finalizePurchaseOrder` — operator
- **Schema** `finalizePurchaseOrderPayloadSchema` (`commandBus.ts:230`): `purchaseOrderId`|`id` uuid.
- **Logic** (`commandBus.ts:1677`): require `status='draft'`; ≥1 line; all lines pass
  `purchaseOrderLineIssues`; set `status='finalized'`, `finalizedAt=now`.
- **Writes** `purchase_orders.status/finalizedAt/updatedAt`.
- **Projection/receipt** post-commit `createPoFinalizationReceipts(pool, poId, commandId, userId)`
  (`commandBus.ts:672`) creates external+internal `document_snapshots` of kind
  `purchase_finalization`. Best-effort: a failure logs but never fails the command. Amendment-aware:
  if a live snapshot exists for `(purchase_order, id, audience)` the new one is created with
  `supersedesId` (`poFinalizationReceipts.ts:133-167`). External projection excludes
  cogs/margin/internalNotes; internal adds them (`purchaseFinalization.ts`).
- **Failures** `Purchase order not found.` / `Only draft purchase orders can be finalized.` / `Add
  at least one product line before finalizing.` / joined line issues. Reversal reversible (→draft).

## B.7 `unfinalizePurchaseOrder` — operator
- **Logic** (`commandBus.ts:1716`): if already `draft` → idempotent no-op success; else require
  `finalized`; set `status='draft'`, `finalizedAt=null`.
- **Failure** `Only finalized purchase orders can be returned to draft.` Reversal reversible
  (→finalized, restores prior `finalizedAt`).

## B.8 `approvePurchaseOrder` — MANAGER
- **Logic** (`commandBus.ts:1787`): `FOR UPDATE` lock PO; require `status='finalized'`; ≥1 line;
  all lines valid; set every line `status='planned'`; PO `status='approved'`, `orderedAt`,
  `orderedBy=user`; recalc total; optional referee-credit accrual; **if vendor set, inline-call
  `receivePurchaseOrder`** to materialize draft batches.
- **Writes** `purchase_order_lines.status`, `purchase_orders` (status/orderedAt/orderedBy/total,
  maybe referee cols), and (via receive) `batches` + `items`/`tag_catalog`.
- **Invariants** finalized-before-approve; lines valid.
- **Failures** `Purchase order must be finalized before approval.` / `Add at least one product
  line…` / line issues. Reversal reversible (→draft, lines→needs_fix/planned).

## B.9 `receivePurchaseOrder` — operator (also auto-invoked by approve)
- **Logic** (`commandBus.ts:1842`): require `status ∈ {approved, ordered, partially_received}`;
  require vendor; optional `lineIds[]` subset; skip lines that already have a non-archived batch;
  per line with qty>0, `createBatch(...)` draft intake row; ownership inferred from payment terms.
- **Writes** new `batches` rows (`status='draft'`, `location='Receiving'`,
  `arrivalStatus='arrived'`, `arrivalConfirmed=true`, `availableQty=0`, copied cost/product),
  possibly `items`/`tag_catalog`.
- **Invariants** approved-or-later; vendor present; idempotent per line (no duplicate batches).
- **Failures** `Approve this purchase order before receiving…` / `Choose a vendor…` / `No purchase
  order lines are available to receive.` Reversal reversible (batches→reversed, line receivedQty=0,
  PO→approved).

## B.10 `postPurchaseReceipt` — operator (label "Process intake")
- **Logic** (`commandBus.ts:1223`): load batches by `batchIds`/`selectedIds`; all must exist; all
  `status ∈ {ready, draft}`; none with validation issues; exactly one vendor; ≤1 PO. Build optional
  `discrepancyNotes` map. Compute Decimal total. INSERT `purchase_receipts`. Per batch: INSERT
  `purchase_receipt_lines`, UPDATE batch → `posted` (availableQty=intakeQty, arrivalStatus=arrived,
  validationIssues=[], postedAt, optional discrepancy note appended), INSERT `inventory_movements`
  (`intake_posted`), INSERT `photography_queue`, and if linked PO line: detect qty mismatch → build
  discrepancy note, set line `receivedQty`+`status='received'`. If PO present: set PO `received`/
  `receivedAt`, merge discrepancy notes into `internal_notes`, rewrite PO `total` to
  `Σ receivedQty×unitCost`. Per vendor: INSERT `vendor_bills` (open, due in `vendor.termsDays ?? 14`
  days, `discrepancyNotes`).
- **Writes** `purchase_receipts`, `purchase_receipt_lines`, `batches`, `inventory_movements`,
  `photography_queue`, `purchase_order_lines`, `purchase_orders`, `vendor_bills`.
- **Invariants** shared vendor; ≤1 PO; only draft/ready batches; no validation issues.
- **Failures** see §A.4 table. Reversal reversible (batches/bills/receipts → reversed; discrepancy
  bill annotations retained).

## B.11 `verifyAllIntake` — operator
- **Logic** (`commandBus.ts:1995`): require ≥1 pending batch (`draft/ready/needs_fix`) on the PO;
  snap each batch qty to PO-line expected when differing; clear validation issues; refresh batches;
  delegate to `postPurchaseReceipt`; stamp PO `internal_notes` "all items accepted as expected".
- **Writes** `batches`, then everything `postPurchaseReceipt` writes; `purchase_orders.internalNotes`.
- **Failure** `No pending intake rows on this purchase order to verify.` Reversal reversible (same
  as postPurchaseReceipt).

## B.12 `recordVendorPrepayment` — MANAGER
- **Logic** (`commandBus.ts:1749`): require PO `status='approved'`; `amount>0`;
  `amount ≤ po.prepaymentAmount`; no existing vendor payment for this PO; INSERT `vendor_payments`
  (`vendorBillId=null`, `purchaseOrderId`, `status='posted'`, method default cash).
- **Writes** `vendor_payments`.
- **Invariants** one prepayment per PO; cap by `prepaymentAmount`.
- **Failures** `Purchase order not found.` / `Prepayment can only be recorded on approved purchase
  orders.` / `Prepayment amount cannot exceed <limit>.` / `Prepayment already recorded…` /
  `Prepayment amount must be greater than zero.` Reversal reversible.

## B.13 `cancelPurchaseOrder` — MANAGER
- **Logic** (`commandBus.ts:1917`): block if any line `receivedQty>0`; PO→`cancelled`,
  `cancelledAt`; all lines→`cancelled`.
- **Failure** `Purchase orders with received product cannot be cancelled…` Reversal terminal.

## B.14 `rejectBatch` / `flagBatch` — operator
See §A.3. `rejectBatch` (`commandBus.ts:1928`) requires `reason` (`rejectBatchPayloadSchema`
`commandBus.ts:235`), blocks posted, returns batch, decrements PO line receivedQty and unpaid bills.
`flagBatch` (`commandBus.ts:1974`) appends validation-issue + PO note, non-destructive. Both terminal.

## B.15 `resolveVendorApproval` — MANAGER (SALES domain, listed for completeness)
`commandBus.ts:2990`. Schema-less; reads `state ∈ {approved, declined}`, `lineId?`, `orderId?`.
Flips `sales_order_lines.vendor_approval_state`, asserts the sales order is editable, refreshes
`sales_orders.vendor_approval_pending`. Reversible. **Not a purchasing command.**

---

## B.16 Read procs (CMD-PO / CMD-INTAKE)

| Proc | Input | Returns / logic | Source |
| --- | --- | --- | --- |
| `intakeQueue` | none | POs in `approved/partially_received/received/ordered` that have non-archived batches; per-PO aggregates (`expectedTotalQty`, `receivedTotalQty`, `expectedTotal`) + nested `batches[]` with expected vs actual qty/cost; status-ordered | `queries.ts:1096` |
| `purchaseOrderLines` | `purchaseOrderId` | PO lines joined to `items` (sku); ordered by `created_at` | `queries.ts:694` |
| `receiptPreview` | `batchIds[]` (≥1) | preview rows + `total`, validates vendor-uniqueness/status/qty/cost, returns `conflicts[]` and `ok` — read-side mirror of `postPurchaseReceipt` guards | `queries.ts:826` |
| `poContextSignals` | none | market signals: current posted inventory by category/subcategory + 90-day avg/min/max PO unit cost by category (for PO authoring) | `queries.ts:1453` |
| `purchaseOrderExternalReceipt` | `purchaseOrderId` | external finalization projection (`getExternalReceipt`) | `queries.ts:1493` |
| `purchaseOrderInternalReceipt` | `purchaseOrderId` | internal projection; **manager-gated inside `getInternalReceipt`** | `queries.ts:1498` |
| `purchaseOrderSignalText` | `purchaseOrderId` | external projection rendered as signal text | `queries.ts:1506` |
| `purchaseOrderPrintHtml` | `purchaseOrderId`,`audience?` | print HTML of external (default) or internal (manager) projection | `queries.ts:1579` |
| `releaseEligibility` | `orderId` | **SALES/fulfillment** per-line pick-release eligibility — NOT purchasing; listed in task but operates on `sales_order_lines` | `queries.ts:1736` |

`relationshipSummary` (`queries.ts:922`) also surfaces a vendor's POs, bills, vendor payments, and
purchase receipts in the vendor pane.

---

## B.17 Table reference (every column)

### `vendors` (`schema.ts:44`)
`id`, `name`(180,notnull), `alias`(80), `terms_days`(int,default 14), `consignment_default`(bool,
default false), `contact`(text), `notes`(text), `contact_id`(fk contacts, CAP-033), `created_at`,
`updated_at`. PO FK uses `ON DELETE RESTRICT` (migration 0059) so a vendor with POs can't be deleted.

### `purchase_orders` (`schema.ts:155`, base `0004`, evolved `0011/0012/0013`)
`id`, `po_no`(80,unique), `vendor_id`(fk vendors, **restrict**), `status`(32,default `draft`),
`expected_date`, `ordered_at`, `received_at`, `cancelled_at`, `total`(numeric12,2 default 0),
`ordered_by`(fk users,set null), `payment_terms`(32,default `vendor_terms` — `0011`),
`prepayment_amount`(numeric12,2 default 0 — `0012`), `finalized_at`(`0013`), `buyer_notes`,
`internal_notes`, `external_notes`(`0013`), `referee_relationship_id`,
`referee_credit_amount`(numeric12,2), `created_at`, `updated_at`. Indexes: status, vendor_id.

### `purchase_order_lines` (`schema.ts:188`, base `0004`, evolved `0010/0013/0051`)
`id`, `purchase_order_id`(fk PO, **cascade**), `item_id`(fk items,set null), `product_name`(180),
`category`(80), `subcategory`(80 — `0051`), `tags`(text[]), `qty`(numeric12,3),
`received_qty`(numeric12,3 default 0), `uom`(24,default lb), `unit_cost`(numeric12,2),
`unit_price`(numeric12,2), `cost_range_low`(numeric12,2 — `0010`), `cost_range_high`(numeric12,2 —
`0010`), `source_code`(120), `shorthand`(120), `legacy_marker`(120),
`ownership_status`(16,default `UNKNOWN`), `notes`, `internal_notes`(`0013`),
`external_notes`(`0013`), `status`(32,default `planned`), `created_at`, `updated_at`. CHECK
`po_line_cost_exclusivity` enforces fixed-XOR-range (`0010`). Indexes: po_id, status, subcategory.

### `batches` (intake/inventory rows — `schema.ts:222`, PO links from `0004`)
`id`, `item_id`(fk,set null), `vendor_id`(fk,set null), `brand_id`(fk,restrict),
`purchase_order_id`(fk,set null), `purchase_order_line_id`(fk,set null), `batch_code`(80,unique),
`source_code`, `shorthand`, `name`(180), `category`(80), `subcategory`, `brand_alias`,
`vendor_alias`, `tags`(text[]), `intake_qty`(numeric12,3), `available_qty`(numeric12,3),
`reserved_qty`(numeric12,3), `uom`(24,default lb), `unit_cost`(numeric12,2),
`unit_price`(numeric12,2), `location`(120,default vault), `lot_code`, `intake_date`,
`ticket_cost`(numeric12,2), `price_range`, `notes`, `legacy_marker`,
`expiration_date`, `ownership_status`(16,default UNKNOWN), `arrival_confirmed`(bool),
`arrival_status`(32,default pending), `validation_issues`(jsonb string[]),
`media_status`(32,default open), `status`(32,default draft), `sort_id`, `photo_url`, `case_pack`,
`posted_at`, `archived_at`, `created_at`, `updated_at`. Batch statuses seen in PO/intake flow:
`draft`, `ready`, `needs_fix`, `posted`, `returned`, `reversed`.

### `purchase_receipts` (`schema.ts:285`)
`id`, `receipt_no`(80,unique), `vendor_id`(fk,set null), `purchase_order_id`(fk,set null — `0004`),
`status`(32,default `posted`), `total`(numeric12,2 default 0), `created_at`, `updated_at`.

### `purchase_receipt_lines` (`schema.ts:296`)
`id`, `receipt_id`(fk receipts, **cascade**), `batch_id`(fk batches, **cascade**),
`qty`(numeric12,3), `unit_cost`(numeric12,2), `subtotal`(numeric12,2). All notnull.

### `vendor_bills` (`schema.ts:414`, `discrepancy_notes` from `0007`)
`id`, `vendor_id`(fk,set null), `purchase_receipt_id`(fk,set null), `purchase_order_id`(fk,set
null), `bill_no`(80,unique), `amount`(numeric12,2), `amount_paid`(numeric12,2 default 0),
`due_date`(notnull), `status`(32,default `open`), `scheduled_for`, `terms_days`(int,default 14),
`consignment_triggered`(bool), `due_reason`(text), `discrepancy_notes`(text — `0007`),
`created_at`, `updated_at`. Bill statuses touched here: `open` (created), `reversed`,
`paid`/`void` (skipped during reject decrement, `commandBus.ts:1964`).

### `vendor_payments` (`schema.ts:433`, PO link from `0012`)
`id`, `vendor_bill_id`(fk bills, **cascade**, notnull — but prepayment inserts `null` cast,
`commandBus.ts:1770`), `purchase_order_id`(fk PO — `0012`, partial index where not null),
`amount`(numeric12,2), `method`(32,default cash), `reference`(180), `status`(32,default `posted`),
`created_at`.

### Supporting writes
`inventory_movements` (`schema.ts:275`): `batch_id`(cascade), `command_id`, `kind`, `qty_delta`,
`reason`, `created_at` — intake writes kind `intake_posted`. `photography_queue` (`schema.ts:642`)
gets an `open` row per posted batch. `items` / `tag_catalog` auto-created via `ensureItem` /
`ensureTagCatalog`.

---

# RETURN — Summary & Checklist

**Summary.** Purchasing in TERP Operator is a CQRS command-bus workflow with a strict PO state
machine `draft → finalized → approved → received` (with `unfinalize`/`cancel`/reversal escape
hatches), all routed through `executeCommand` with atomic idempotency-key claims, Decimal-precise
money, and best-effort post-commit observers (socket, JSONL, document snapshots). PO lines carry a
fixed-cost-XOR-cost-range model (DB CHECK + app validation; PO `total` uses range midpoints until
real costs post). Approving a PO with a vendor auto-materializes draft intake `batches`; operators
then verify counts (capturing discrepancy reasons that propagate to PO `internal_notes` and vendor
bill `discrepancy_notes`) and `postPurchaseReceipt`, which posts inventory, queues photography,
writes `inventory_movements`, finalizes the PO, and emits per-vendor open `vendor_bills` into AP.
Prepayments (manager, one per approved PO, capped by `prepaymentAmount`) write `vendor_payments`.
Most receipt/intake commands are reversible via `reverseCommandById`; authoring commands are
terminal and corrected by re-authoring. (Note: `resolveVendorApproval` and `releaseEligibility`
appear in the brief but are actually SALES/fulfillment artifacts — documented as such.)

**Commands documented:** createPurchaseOrder · updatePurchaseOrder · addPurchaseOrderLine ·
updatePurchaseOrderLine · removePurchaseOrderLine · finalizePurchaseOrder · unfinalizePurchaseOrder
· approvePurchaseOrder · receivePurchaseOrder · postPurchaseReceipt · verifyAllIntake ·
recordVendorPrepayment · cancelPurchaseOrder · rejectBatch · flagBatch · resolveVendorApproval
(sales, noted) · reverseCommandById (PO/intake branches).

**Tables documented:** vendors · purchase_orders · purchase_order_lines · batches ·
purchase_receipts · purchase_receipt_lines · vendor_bills · vendor_payments · inventory_movements ·
photography_queue (supporting) · items / tag_catalog (auto-created, noted).

**Query procs documented:** intakeQueue · purchaseOrderLines · receiptPreview · poContextSignals ·
purchaseOrderExternalReceipt · purchaseOrderInternalReceipt · purchaseOrderSignalText ·
purchaseOrderPrintHtml · releaseEligibility (sales, noted) · relationshipSummary (vendor pane,
noted).

**Components documented:** IntakeView.tsx (+ buildBatchColumns / BatchRowActions) ·
ReceiptPanel.tsx · VerifyAllPreviewBody.tsx · RecordPrepaymentDialog.tsx · drawerTabs/PoLinesTab ·
PoLinkedIntakeTab · PoVendorTab · PoHistoryTab · PoCommandsTab · (PO authoring in OperationsViews.tsx,
noted).

**Migrations documented:** 0004 (PO base tables + batch/receipt links) · 0007 (intake discrepancy
notes on vendor_bills) · 0010 (cost range + XOR CHECK) · 0011 (payment_terms) · 0012 (prepayment +
vendor_payment→PO link) · 0013 (finalization: finalized_at, external/internal notes) · 0051
(po_line subcategory).

**Projections/services documented:** poFinalizationReceipts.ts (amendment-aware snapshot hook) ·
projections/purchaseFinalization.ts (external/internal allowlists & projectors).
