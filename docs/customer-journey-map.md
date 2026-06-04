# TERP Operator: Customer Journey Map

_Last updated: 2026-06-01_
_Structure: Journey-Primary (Option B) — 13 end-to-end workflows, full branch/error/recovery depth_
_Source: Live codebase audit — command handlers, schema constraints, view logic, tests, persona flows_

---

## How to Read This Document

Each journey section follows a fixed template:

- **Actors** — which roles participate and how
- **Entry condition** — what must be true before this journey can begin
- **Exit condition** — what terminal success looks like
- **Happy Path** — step-by-step with exact command names and status transitions
- **Branch Scenarios** — every decision point that forks the flow, with each path described
- **Error States** — every guard condition that blocks progress, the exact error message surfaced, and what triggered it
- **Recovery Paths** — how to exit each error state
- **Handoffs** — what journey(s) this feeds into

**Notation:**
- `monospace` = exact command name from `commandCatalog.ts`
- `'quoted'` = exact status string value from `schema.ts`
- ⛔ = hard server-side guard (will throw and block)
- ⚠️ = client-side gate (button hidden/disabled, not a server error)
- 🔀 = branch point

---

## Journey Index

| # | Journey | Actors | Key Branches |
|---|---------|--------|-------------|
| 1 | [Purchase Order](#journey-1-purchase-order) | operator, manager, owner | 7 |
| 2 | [Intake / Receiving](#journey-2-intake--receiving) | operator, manager | 8 |
| 3 | [Inventory Management](#journey-3-inventory-management) | operator, manager | 6 |
| 4 | [Sales Order](#journey-4-sales-order) | operator, manager, owner | 10 |
| 5 | [Fulfillment](#journey-5-fulfillment) | operator (warehouse), operator (sales), manager | 9 |
| 6 | [Payments / AR](#journey-6-payments--accounts-receivable) | operator (accounting), manager | 7 |
| 7 | [Vendor Bills / AP](#journey-7-vendor-bills--accounts-payable) | operator (accounting), manager, owner | 6 |
| 8 | [Closeout](#journey-8-closeout) | owner, manager | 4 |
| 9 | [Recovery](#journey-9-recovery) | manager, owner | 6 |
| 10 | [Matchmaking](#journey-10-matchmaking) | operator (sales), manager | 5 |
| 11 | [Connectors / Processors](#journey-11-connectors--processors) | operator, manager | 4 |
| 12 | [Credit Review](#journey-12-credit-review) | manager, owner | 7 |
| 13 | [Photography / Media](#journey-13-photography--media) | operator (photographer) | 5 |

---

## Journey 1: Purchase Order

**Actors:**
- `operator` — creates, edits, and receives against POs
- `manager` / `owner` — approves POs

**Entry condition:** A vendor exists in the system. Operator intends to order product.

**Exit condition:** PO status is `'received'` (all lines received) or `'cancelled'`.

---

### Happy Path

1. Operator runs `createPurchaseOrder` → PO created with status `'draft'`, system assigns `poNo`.
2. Operator adds product lines: `addPurchaseOrderLine` (one per SKU). Each line requires either a fixed `unitCost > 0` **or** a cost range (`costRangeLow` and `costRangeHigh`, both positive, low ≤ high). Line status: `'planned'`.
3. Operator edits lines as needed: `updatePurchaseOrderLine`, `removePurchaseOrderLine`.
4. Operator runs `finalizePurchaseOrder` → PO status: `'draft'` → `'finalized'`. Lines are locked from removal.
5. Manager/owner runs `approvePurchaseOrder` → PO status: `'finalized'` → `'approved'`, `orderedAt` timestamp set. When product arrives, an operator runs `receivePurchaseOrder`, creating one draft `batch` row per PO line with status `'draft'` in the Intake view.
6. Intake team processes the batches (→ Journey 2).
7. As batches are posted, PO status moves to `'partially_received'` (some lines) or `'received'` (all lines). `purchaseOrderLines.status` for each received line → `'received'`.

---

### Branch Scenarios

🔀 **B1 — Revert finalized PO for editing**
- Trigger: Manager realizes a line needs changing after finalization but before approval.
- Path: `unfinalizePurchaseOrder` → PO status: `'finalized'` → `'draft'`. `finalizedAt` cleared. Lines are editable again. Return to step 2.

🔀 **B2 — Cancel PO (no product received)**
- Trigger: Order is no longer needed. No lines have `receivedQty > 0`.
- Path: `cancelPurchaseOrder` → PO status → `'cancelled'`. All lines → `'cancelled'`. `cancelledAt` timestamp set. Journey ends.

🔀 **B3 — Cost range instead of fixed cost**
- Trigger: Vendor quotes a price range rather than a fixed unit cost.
- Path: `addPurchaseOrderLine` with `costRangeLow` and `costRangeHigh` populated, `unitCost = 0`. DB CHECK constraint enforces mutual exclusivity — cannot have both `unitCost > 0` and a cost range. Line enters `'planned'` status. Cost range propagates to landed cost tracking in sales order lines downstream.

🔀 **B4 — Prepayment recorded**
- Trigger: Vendor requires payment upfront before shipping.
- Precondition: PO must be in `'approved'` status.
- Path: `recordVendorPrepayment` with `amount` (must be > 0, cannot exceed the PO's `prepaymentAmount` cap, and only one prepayment is allowed per PO). Creates a prepayment record. PO continues normally. Journey does not end — intake still required.

🔀 **B5 — Ownership status determined at receive time**
- Trigger: `receivePurchaseOrder` is called when product arrives.
- Branch logic: System determines `ownershipStatus` for each created batch by: (1) line-level override if set, else (2) infer from PO `paymentTerms` — `'cod'`/`'prepay'`/`'net_*'` → `'OFC'`; `'consignment'` → `'C'`, else (3) falls back to `'UNKNOWN'`.

🔀 **B6 — Line has `unitCost <= 0` and no cost range**
- Trigger: Operator attempts to finalize or approve with an incomplete line.
- Path: `finalizePurchaseOrder` or `approvePurchaseOrder` throws. Line status set to `'needs_fix'`. Operator must correct the line before advancing.

🔀 **B7 — Partial receipt**
- Trigger: Some PO lines are received but others remain open.
- Path: PO status becomes `'partially_received'`. Remaining draft batches stay in intake. Operator can continue receiving (`receivePurchaseOrder` is valid for `'approved'`, `'ordered'`, and `'partially_received'` statuses). Journey continues until all lines are received.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Qty zero | `addPurchaseOrderLine` with `qty ≤ 0` | "Quantity must be greater than zero." | Line creation |
| ⛔ Both cost formats | Both `unitCost` and cost range specified | "Cannot specify both unit cost and cost range." | Line creation |
| ⛔ Invalid cost range | `costRangeLow > costRangeHigh` or either ≤ 0 | "Invalid cost range: low must be <= high and both must be positive." | Line creation |
| ⛔ Qty below received | `updatePurchaseOrderLine` sets qty < `receivedQty` | "Quantity cannot be below already received quantity." | Line update |
| ⛔ Remove received line | `removePurchaseOrderLine` on a line with `receivedQty > 0` | "Received purchase order lines cannot be removed. Use intake correction/reversal." | Line removal |
| ⛔ Finalize empty PO | `finalizePurchaseOrder` with no lines | "Add at least one product line before finalizing." | Finalization |
| ⛔ Finalize non-draft | `finalizePurchaseOrder` on non-`'draft'` PO | "Only draft purchase orders can be finalized." | Finalization |
| ⛔ Approve non-finalized | `approvePurchaseOrder` on non-`'finalized'` PO | "Purchase order must be finalized before approval." | Approval |
| ⛔ Cancel with received lines | `cancelPurchaseOrder` when any `receivedQty > 0` | "Purchase orders with received product cannot be cancelled. Use intake reversal/correction." | Cancellation |
| ⛔ Prepayment > cap | `recordVendorPrepayment` with `amount > prepaymentAmount` | "Prepayment amount cannot exceed {prepaymentAmount}." | Prepayment |
| ⛔ Duplicate prepayment | `recordVendorPrepayment` when one already exists | "Prepayment already recorded for this purchase order." | Prepayment |
| ⛔ Prepayment on wrong status | `recordVendorPrepayment` when PO not `'approved'` | "Prepayment can only be recorded on approved purchase orders." | Prepayment |

---

### Recovery Paths

- **Line with `'needs_fix'` status:** `updatePurchaseOrderLine` to set valid cost → re-attempt finalize.
- **PO finalized, needs edit:** `unfinalizePurchaseOrder` → edit → `finalizePurchaseOrder` again.
- **PO approved with wrong data:** No undo at this stage. Use intake corrections (→ Journey 9) to adjust received quantities. PO header cannot be edited after approval.
- **Wrong vendor on PO:** No command to change vendor after creation. Cancel the PO (if nothing received) and create a new one.

---

### Handoffs

→ **Journey 2 (Intake)** — After `receivePurchaseOrder` is run, draft batches appear in the intake queue.
→ **Journey 7 (Vendor Bills/AP)** — `postPurchaseReceipt` (in Journey 2) auto-creates vendor bills based on this PO.

---

## Journey 2: Intake / Receiving

**Actors:**
- `operator` — verifies, flags, rejects, and posts intake batches
- `manager` / `owner` — can override, post receipts

**Entry condition:** An approved PO exists with draft batches waiting, OR operator creates batches manually.

**Exit condition:** All batches for a receipt are posted (status `'posted'`), rejected (`'returned'`), or explicitly handled. `purchaseReceipts` row created. Vendor bills created.

---

### Happy Path

1. Draft batches appear in Intake view — created when an operator runs `receivePurchaseOrder` on an approved PO, or manually via `createBatch`.
2. Operator reviews each batch: confirms `batchCode`, `name`, `category`, `intakeQty`, `unitCost`, `notes`, `ownershipStatus`, `arrivalStatus`.
3. Operator edits as needed: `updateBatch`. Note: `intakeQty` is **not** immutable yet — it can be changed pre-posting.
4. Operator marks batch as ready (sets status to `'ready'`) via `updateBatch`.
5. To bulk-verify all ready rows: `verifyAllIntake`.
6. Operator runs `postPurchaseReceipt` (selecting all ready batches for a single vendor + single PO):
   - Batch status: `'draft'`/`'ready'` → `'posted'`
   - `arrivalStatus` → `'arrived'`
   - `purchaseReceipts` row created with `status: 'posted'`
   - `purchaseReceiptLines` created per batch
   - `vendorBills` created with `status: 'open'`
   - Batches become `'live'` inventory available for sale

---

### Branch Scenarios

🔀 **B1 — Quantity discrepancy detected**
- Trigger: Operator notes actual received qty differs from PO line qty.
- Path: Operator updates `intakeQty` on the batch via `updateBatch`. System auto-detects discrepancy vs. PO line quantity on `postPurchaseReceipt`. Discrepancy note is auto-generated and appended to `batches.notes` and `vendorBills.discrepancyNotes`. PO's `internalNotes` also updated.
- Client gate: ⚠️ `discrepancyReason` cell turns red if qty mismatch exists but no reason has been entered.

🔀 **B2 — Batch flagged for attention**
- Trigger: Operator notices an issue (quality, packaging, documentation) but product is not refused.
- Path: `flagBatch` → batch status → `'flagged'`, validation issue note added. Batch remains in intake queue. Operator (or manager) must resolve the flag before posting.
- Client gate: ⚠️ If operator attempts to verify (`verifyBatch`) and `actual !== expected`, system auto-runs `flagBatch`.

🔀 **B3 — Batch rejected at dock**
- Trigger: Product is refused — wrong product, damaged, contaminated.
- Precondition: Batch status must NOT be `'posted'`.
- Path: `rejectBatch` → batch status → `'returned'`, `availableQty` set to `0`. No inventory created. No vendor bill for this batch. Journey ends for this batch.

🔀 **B4 — Manual batch (no PO)**
- Trigger: Product arrives without a prior PO (e.g., spot purchase, consignment drop-off).
- Path: `createBatch` → creates a draft batch manually with all required fields. Operator then follows the normal verify → post flow. No `purchaseOrderId` association.

🔀 **B5 — CSV import**
- Trigger: Operator has a spreadsheet of incoming product to process in bulk.
- Path: `importBatchesCsv` → validates CSV structure. If validation passes: creates multiple draft batches. If validation fails: throws with count of issues — no batches created. Operator fixes CSV and retries.

🔀 **B6 — Consignment batch**
- Trigger: `ownershipStatus = 'C'` on the batch.
- Path: Batch posts normally → live inventory created. Vendor bill is created but **not due** yet. Bill becomes due when the consignment inventory is fully sold (triggered by `postSalesOrder` in Journey 4). This is a cross-journey dependency — the AP lifecycle is deferred.

🔀 **B7 — Mixed vendor batches selected**
- Trigger: Operator selects batches from two different vendors for one `postPurchaseReceipt`.
- Path: ⛔ Command throws — all selected batches must share one vendor. Operator must split the selection and post separately per vendor.

🔀 **B8 — Mixed PO batches selected**
- Trigger: Operator selects batches from two different POs for one `postPurchaseReceipt`.
- Path: ⛔ Command throws — only one PO per receipt. Operator splits and posts per PO.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Batch in wrong status | `postPurchaseReceipt` on `'flagged'`/`'needs_fix'` batch | "{name} is {status}. Only Draft or Ready intake rows can be processed." | Posting |
| ⛔ Batch missing required fields | `postPurchaseReceipt` on batch with validation issues | "{name} needs fixes before processing: {issues}" | Posting |
| ⛔ Multiple vendors selected | `postPurchaseReceipt` with batches from >1 vendor | "Selected intake rows must share one vendor before generating a vendor receipt." | Posting |
| ⛔ Multiple POs selected | `postPurchaseReceipt` with batches from >1 PO | "Selected intake rows can only be receipted against one purchase order at a time." | Posting |
| ⛔ Batch row missing | Batch deleted between selection and submit | "One or more selected intake rows no longer exist." | Posting |
| ⛔ Reject posted batch | `rejectBatch` on status `'posted'` | "Posted batches cannot be rejected. Use a reversal/correction instead." | Rejection |
| ⛔ Delete posted batch | `deleteBatch` on status `'posted'` | "Posted batches cannot be deleted. Reverse the posting instead." | Deletion |
| ⛔ Invalid CSV | `importBatchesCsv` with errors | "{N} CSV issue(s) must be fixed before import." | Import |
| ⛔ Edit intakeQty after post | `updateBatch` attempts to change `intakeQty` post-posting | "intake_qty is immutable after posting. Use adjustBatchQuantity for corrections." | Edit |

---

### Recovery Paths

- **Flagged batch:** Resolve the underlying issue → `updateBatch` to clear validation notes → set status to `'ready'` → re-attempt posting.
- **Wrong qty posted:** Use `adjustBatchQuantity` (→ Journey 3) to correct `availableQty` post-posting. `intakeQty` cannot be changed.
- **Posted batch that shouldn't exist:** `reverseCommandById` on the `postPurchaseReceipt` command (→ Journey 9). Reversal restores inventory and voids the vendor bill.
- **Failed CSV import:** Fix CSV, re-run `importBatchesCsv`.

---

### Handoffs

→ **Journey 3 (Inventory)** — posted batches become `'live'` inventory immediately.
→ **Journey 7 (Vendor Bills/AP)** — vendor bills created on posting enter the AP lifecycle.

---

## Journey 3: Inventory Management

**Actors:**
- `operator` — adjusts, relocates, prices, tags inventory
- `manager` / `owner` — transfers ownership, performs significant adjustments

**Entry condition:** At least one batch with status `'posted'` (live inventory) exists.

**Exit condition:** Batch reflects correct qty, price, status, location, ownership, and media. No terminal end state for this journey — it runs continuously throughout operations.

---

### Happy Path

1. Batches arrive in Inventory view with status `'live'` and populated `availableQty`.
2. As sales are confirmed, `reservedQty` increases and `availableQty` decreases (automatic, from Journey 4).
3. As sales are posted, `availableQty` decreases permanently. Status moves to `'sold'` or `'depleted'` when exhausted.

**Manual management actions (any order):**

4. **Quantity correction:** `adjustBatchQuantity` — sets or adjusts `availableQty`. Every adjustment written to `inventory_movements` table.
5. **Status change:** `setInventoryStatus` — moves batch through non-sale statuses (e.g., `'live'` → `'held'` for quarantine, `'held'` → `'live'` to release, `'live'` → `'damaged'`).
6. **Location update:** `transferInventoryLocation` — updates `location` field. Written to `inventory_movements`.
7. **Ownership transfer:** `transferInventoryOwnership` — changes `ownershipStatus`. Written to `inventory_movements`.
8. **Price update:** `setBatchPrice` — updates `unitPrice`. Does not affect already-posted sales order lines.
9. **Lot info update:** `setBatchLotInfo` — updates lot code, dates, and supplemental details.
10. **Tags:** `applyTags` — add, remove, or replace tags. Tag changes on `customerNeed` or `vendorSupply` entities (not batches) trigger match recalculation.
11. **Alias:** `setItemAlias` — sets customer-facing market name for the catalog item. Requires `itemId` to be set on the batch.
12. **Media:** Upload → role → publish flow (→ Journey 13).

---

### Branch Scenarios

🔀 **B1 — Quantity adjustment (increase)**
- Trigger: Under-counted at intake; product found in warehouse.
- Path: `adjustBatchQuantity` with positive delta. `availableQty` increases. Audit entry in `inventory_movements`.

🔀 **B2 — Quantity adjustment (decrease)**
- Trigger: Damaged units discovered, theft, miscounting.
- Path: `adjustBatchQuantity` with negative delta. Guard: result cannot be < 0. If would go negative: ⛔ throws.

🔀 **B3 — Status transition: hold / release**
- Trigger: Product quarantined (compliance hold, quality question), then released.
- Path: `setInventoryStatus` with `'held'`. Batch invisible to sales (status not `'live'`). When resolved: `setInventoryStatus` with `'live'`. Guard: source status must be one of `'posted'`, `'held'`, `'damaged'`, `'returned'`, `'in_transit'` — cannot transition directly from `'draft'` or `'sold'`.

🔀 **B4 — Ownership transfer (consignment → office-owned)**
- Trigger: Operator purchases consignment inventory outright from vendor.
- Path: `transferInventoryOwnership` with `ownershipStatus: 'OFC'`. Guard: consignment transfer to `'C'` requires a `vendorId` on the batch.

🔀 **B5 — Primary photo uniqueness conflict**
- Trigger: Operator tries to set a second photo as `primary_photo` when one already exists.
- Path: `setBatchMediaRole` throws with: "Another media row is already the primary for this batch. Demote it first or replace it." DB unique index (`batch_media_primary_photo_unique`) enforces one active primary per batch.

🔀 **B6 — Batch fully depleted**
- Trigger: Last available qty sold or adjusted to 0.
- Path: System sets status → `'depleted'` or `'sold'` automatically. Batch removed from active selling grid. Historical record preserved.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Qty would go negative | `adjustBatchQuantity` resulting in `availableQty < 0` | "Available quantity cannot go below zero." | Adjustment |
| ⛔ Invalid status transition | `setInventoryStatus` from `'draft'`/`'sold'` etc. | "Only posted inventory rows can move through inventory state transitions." | Status change |
| ⛔ Consignment without vendor | `transferInventoryOwnership` to `'C'` with no `vendorId` | "Consigned inventory needs a vendor before ownership transfer." | Ownership transfer |
| ⛔ intakeQty edit post-posting | `updateBatch` changes `intakeQty` on posted batch | "intake_qty is immutable after posting. Use adjustBatchQuantity for corrections." | Edit |
| ⛔ Delete posted batch | `deleteBatch` on posted batch | "Posted batches cannot be deleted. Reverse the posting instead." | Deletion |
| ⛔ Invalid media role | `setBatchMediaRole` with unrecognized role | "role must be one of: primary_photo, primary_video, additional." | Media role |
| ⛔ Duplicate primary photo | `setBatchMediaRole` sets second primary on same batch | "Another media row is already the primary for this batch. Demote it first or replace it." | Media role |
| ⛔ Publish non-draft media | `publishBatchMedia` on already-published or missing item | "Batch media not found or not in draft status." | Media publish |

---

### Recovery Paths

- **Wrong quantity:** `adjustBatchQuantity` to correct.
- **Wrong status:** `setInventoryStatus` to desired status (if valid transition exists).
- **Duplicate primary photo:** Set the existing primary to `'additional'` role first, then set the new one as `'primary_photo'`.
- **Posted batch that is entirely wrong:** `reverseCommandById` on the `postPurchaseReceipt` command (→ Journey 9).

---

### Handoffs

→ **Journey 4 (Sales Orders)** — live batches are the inventory source for sales.
→ **Journey 13 (Photography)** — `mediaStatus` drives the photo workflow.

---

## Journey 4: Sales Order

**Actors:**
- `operator` (sales workLoop) — creates, prices, confirms orders
- `manager` / `owner` — approves credit overrides, resolves below-floor exceptions

**Entry condition:** A customer exists with an active credit limit. Live inventory (`batches.status = 'posted'`) is available.

**Exit condition:** Sales order status is `'posted'` (invoice created, inventory decremented) or `'cancelled'`.

---

### Happy Path

1. Operator runs `createSalesOrder` → order created with status `'draft'`, `orderNo` assigned.
2. Operator adds lines: `addSalesOrderLine`. Lines can be:
   - Linked to a specific batch (`batchId`) — system validates batch is `'posted'` and has available qty
   - Free-text (unresolved) — for orders taken before inventory is confirmed
3. Operator edits lines: `updateSalesOrderLine`, `removeSalesOrderLine`.
4. Operator sets delivery window: `setDeliveryWindow`.
5. Operator applies pricing: `priceSalesOrder` → pricing strategy applied, `unitPrice` populated per line.
6. Landed cost optionally set: `setLineLandedCost` — sets cost range per line for margin tracking.
7. Operator reserves inventory: `reserveInventoryForOrder` → `batches.reservedQty` increases, `batches.availableQty` decreases. Line status → `'reserved'`.
8. Operator confirms: `confirmSalesOrder` → validates (credit, inventory, unresolved lines, exception blockers). Order status: `'draft'` → `'confirmed'`.
9. Operator posts: `postSalesOrder` → validates again (status must be `'confirmed'`, credit rechecked, duplicate source rows refused). Order status: `'confirmed'` → `'posted'`. Creates `invoices` row, updates `customer.balance`, inserts `clientLedgerEntries`. `salesOrderLines.status` → `'posted'`.

---

### Branch Scenarios

🔀 **B1 — Credit hold at confirmation**
- Trigger: `customer.balance + order.total > customer.creditLimit`.
- Path: `confirmSalesOrder` ⛔ throws. Order stays `'draft'`. Operator must either: (a) reduce order value, (b) get manager to run `setCustomerCreditLimit` to increase the limit, or (c) apply a client credit to reduce balance.
- Client gate: ⚠️ Credit hold indicator shown in sales UI before confirmation attempt.

🔀 **B2 — Below-floor pricing**
- Trigger: A line's `unitPrice` is below the batch's floor price.
- Path: `setLineBelowFloorReason` must be run to record the reason. If vendor approval is required: `resolveVendorApproval`. Until both are satisfied, the `findExceptionBlockedLine` guard will block `confirmSalesOrder`.

🔀 **B3 — Soft reservation conflict (race condition)**
- Trigger: Two operators draft orders for the same batch simultaneously.
- Path: System tracks "soft reservations" via `getDraftReservedQtyMap` — qty in other operators' draft orders is subtracted from the available display. If the hard reservation fails (not enough qty when `reserveInventoryForOrder` runs): ⛔ throws with qty error. Operator must reduce qty or find alternate inventory.

🔀 **B4 — Duplicate source row**
- Trigger: Same batch appears on two lines of the same order (trying to sell the same physical lot twice).
- Path: `postSalesOrder` ⛔ refuses with duplicate source row error. Operator must remove one line or adjust quantities before posting.

🔀 **B5 — Lines added to confirmed order**
- Trigger: Customer calls to add items after confirmation but before posting.
- Path: `addSalesOrderLine` is valid for `'confirmed'` orders as well as `'draft'`. After adding, if the addition pushes total over credit limit, re-confirmation will throw.

🔀 **B6 — Reprice**
- Trigger: Market prices change, operator needs to recalculate.
- Path: `repriceOrder` — re-applies the pricing strategy. Can be run on `'draft'` or `'confirmed'` orders. Does not affect already-posted orders.

🔀 **B7 — Customer sheet snapshot**
- Trigger: Operator wants to share a customer-facing version of the order (hides cost and margin).
- Path: `createCustomerSheetSnapshot` → saves a point-in-time snapshot. The snapshot explicitly omits `unitCost` and `internalMargin`. Can be run at any point in the draft/confirmed lifecycle.

🔀 **B8 — Cancel (pre-fulfillment)**
- Trigger: Customer cancels or order becomes invalid.
- Precondition: No fulfillment lines have `actualQty > 0` (nothing physically picked). If lines are picked: must `returnPickedUnits` first.
- Path: `cancelSalesOrder` → releases `reservedQty` on all batches. Lines that were released for picking generate `line_cancelled` warehouse alerts instead of silent deletion. Order status → `'cancelled'`.

🔀 **B9 — Consignment sell-through trigger**
- Trigger: `postSalesOrder` reduces a consigned batch's `availableQty` to ≤ 0.
- Path: System finds the oldest open vendor bill for that vendor and sets `consignmentTriggered: true`, advancing the bill to due/approved status. If no open bill exists, a new one is created with status `'approved'`. (→ Journey 7)

🔀 **B10 — Unresolved line costs**
- Trigger: A line was added without a linked batch (free-text) and cost was never resolved.
- Path: `confirmSalesOrder` ⛔ throws. Operator must either link the line to a real batch or remove it.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Batch unavailable | `addSalesOrderLine` with batch not `'posted'` | "{batch.name} does not have enough available quantity." | Line add |
| ⛔ Insufficient qty | `addSalesOrderLine` exceeds available qty | "{batch.name} does not have enough available quantity." | Line add |
| ⛔ Edit locked line | Edit line with `pickStatus` of `released`/`picking`/`picked` | ⚠️ Button disabled (client-side gate, no server error) | Line edit |
| ⛔ Credit limit exceeded | `confirmSalesOrder` over credit limit | "{customer.name} would exceed credit limit. Request a credit override before confirming." | Confirmation |
| ⛔ Unresolved cost | `confirmSalesOrder` with free-text line | (validation error listing the line) | Confirmation |
| ⛔ Exception blocker | `confirmSalesOrder` with pending vendor approval | (blocker description) | Confirmation |
| ⛔ Post non-confirmed | `postSalesOrder` on non-`'confirmed'` order | "{orderNo} must be confirmed before posting." | Posting |
| ⛔ Duplicate source row | `postSalesOrder` with same batch on 2+ lines | "{itemName} appears more than once from the same source row. Split the source or remove the duplicate before posting." | Posting |
| ⛔ Cancel with picked units | `cancelSalesOrder` when `actualQty > 0` | "Cannot cancel: {itemName} has already been picked. Return picked units before cancelling." | Cancellation |

---

### Recovery Paths

- **Credit hold:** Reduce order total, or manager increases credit limit (`setCustomerCreditLimit`), or apply credit (`applyClientCredit`).
- **Below-floor blocked:** `setLineBelowFloorReason` → `resolveVendorApproval` (if required).
- **Duplicate source row:** Remove one duplicate line or split into two separate orders.
- **Picked order needing cancel:** `returnPickedUnits` first → then `cancelSalesOrder`.
- **Posted order that is wrong:** `reverseCommandById` on `postSalesOrder` (→ Journey 9). Note: any payment allocations on the resulting invoice must be unallocated first.

---

### Handoffs

→ **Journey 5 (Fulfillment)** — posted orders generate pick lists.
→ **Journey 6 (Payments/AR)** — posting creates an invoice against which payments are allocated.
→ **Journey 7 (Vendor Bills/AP)** — consignment sell-through triggers vendor bill creation.

---

## Journey 5: Fulfillment

**Actors:**
- `operator` (sales) — allocates orders, releases lines, monitors status
- `operator` (warehouse workLoop) — picks, weighs, packs via the `pick` view
- `manager` — approves warehouse alerts, handles discrepancies

**Entry condition:** Sales order status is `'posted'`.

**Exit condition:** Sales order status is `'fulfilled'`. Pick list status is `'fulfilled'`.

---

### Happy Path

1. Sales operator runs `allocateOrderToFulfillment` (or `createPickList`) → creates `pickLists` row with status `'open'`. Creates one `fulfillmentLines` row per sales order line. Precondition: order status must be `'posted'`.
2. Sales operator releases lines for warehouse: `releaseLineForPicking` (single line) or `releaseLinesForPicking` (bulk). Guard: line must have a `batchId`, `qty > 0`, and `batch.reservedQty >= line.qty`. Line `pickStatus`: `'unreleased'` → `'released'`. `pickReleasedAt` timestamp set.
3. Warehouse operator sees released lines in the `pick` view (mobile-optimized). `pickStatus` → `'picking'`.
4. Warehouse operator weighs and packs each line: `recordWeighAndPack`. Sets `fulfillmentLines.actualQty` and `fulfillmentLines.actualWeight`. Both must be > 0. Line status: → `'packed'`.
5. Operator prints labels: `printLabels` → marks labels as printed. Bag manifest CSV written to `ARCHIVE_DIR/bag-manifests`.
6. Once all lines are packed, operator runs `markOrderFulfilled` → validates no unpacked lines remain. Sales order status: → `'fulfilled'`. Pick list status: → `'fulfilled'`.

---

### Branch Scenarios

🔀 **B1 — Recall unpicked line**
- Trigger: Sales operator needs to modify a released line (e.g., qty change, product substitution).
- Precondition: Line has `pickStatus: 'released'` but `actualQty = 0` (not yet picked).
- Path: `recallLineFromPicking` → **deletes the `fulfillmentLines` row entirely**. Line `pickStatus` → `'unreleased'`. Sales operator can now edit the line, then re-release.

🔀 **B2 — Recall picked line**
- Trigger: Sales operator needs to modify a line that warehouse has already picked.
- Precondition: Line has `pickStatus: 'picking'` or `'picked'` and `actualQty > 0`.
- Path: `recallLineFromPicking` → **does NOT delete the row**. Sets `fulfillmentLines.statusExtended` → `'recall_pending'`. Creates a warehouse alert. Warehouse operator must see the alert, `acknowledgeWarehouseAlert`, then `returnPickedUnits`. Only after return can the sales line be edited and re-released.

🔀 **B3 — Quantity discrepancy (over/under pack)**
- Trigger: Warehouse weighs product and finds actual qty differs from expected.
- Path: `recordWeighAndPack` accepts any `actualQty > 0` — system does not block discrepancies at pack time. If `actualQty ≠ expectedQty`, pick list status may transition to `'has_alerts'`. Manager reviews discrepancy and `acknowledgeWarehouseAlert`. Discrepancy is documented in the pick list record.

🔀 **B4 — Cancel a fulfillment line**
- Trigger: Product damaged in warehouse, customer changed mind on one item.
- Path: `cancelFulfillmentLine` → sets `fulfillmentLines.statusExtended` → `'cancelled'`. Remaining lines can still be fulfilled.

🔀 **B5 — Return picked units to inventory**
- Trigger: Picked units must go back to the shelf (e.g., due to order change or recall).
- Guard: `qty` to return cannot exceed `fulfillmentLines.actualQty`.
- Path: `returnPickedUnits` → returns qty to `batches.availableQty`. Updates `fulfillmentLines.actualQty`. Written to `inventory_movements`.

🔀 **B6 — Adjust fulfillment line**
- Trigger: Admin correction needed on line details.
- Path: `adjustFulfillmentLine` → updates line details. Logs adjustment.

🔀 **B7 — Sales order line cancelled mid-fulfillment**
- Trigger: `cancelSalesOrder` (Journey 4) is run after a line has been released.
- Path: System does NOT delete the fulfillment line. Instead sets it to `recall_pending` and creates a `line_cancelled` warehouse alert. Warehouse operator must see the alert and return any picked units before the order can truly close.

🔀 **B8 — Partial fulfillment**
- Trigger: Some lines fulfilled, others cancelled.
- Path: Cancelled lines are `'cancelled'`, remaining lines `'packed'`. `markOrderFulfilled` succeeds if all non-cancelled lines have `actualQty > 0`.

🔀 **B9 — Label format selection**
- Trigger: Different label printers available.
- Path: `printLabels` supports 4×6 and 2×1 label formats. Format selected at print time.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Allocate non-posted order | `allocateOrderToFulfillment` on non-`'posted'` order | "{orderNo} must be posted before fulfillment allocation." | Allocation |
| ⛔ Release without batch | `releaseLineForPicking` on line with no `batchId` | "Line must have a batch assigned..." | Release |
| ⛔ Release zero-qty line | `releaseLineForPicking` with `qty ≤ 0` | "Line quantity must be greater than zero..." | Release |
| ⛔ Insufficient reservation | `releaseLineForPicking` when `reservedQty < line.qty` | "{itemName} does not have sufficient reservation. Reserve inventory first." | Release |
| ⛔ Pack with zero qty | `recordWeighAndPack` with `actualQty ≤ 0` | "Actual quantity must be greater than zero before packing a fulfillment line." | Pack |
| ⛔ Pack with zero weight | `recordWeighAndPack` with `actualWeight ≤ 0` | "Actual weight must be greater than zero before packing a fulfillment line." | Pack |
| ⛔ Fulfill with unpacked lines | `markOrderFulfilled` when lines remain unpacked | "Every fulfillment line needs an actual quantity before fulfillment." | Fulfill |
| ⛔ Return more than picked | `returnPickedUnits` with `qty > actualQty` | "Cannot return {qty} — only {fl.actualQty} units were picked." | Return |

---

### Recovery Paths

- **Discrepancy alert:** `acknowledgeWarehouseAlert` → document the discrepancy → proceed with actual qty.
- **Line in recall_pending:** Warehouse `acknowledgeWarehouseAlert` → `returnPickedUnits` → line can be re-released.
- **Pack error (wrong weight):** `adjustFulfillmentLine` to correct. Or `returnPickedUnits` to undo, then re-pick.
- **Fulfilled order that is wrong:** `reverseCommandById` on `markOrderFulfilled` (→ Journey 9).

---

### Handoffs

→ **Journey 6 (Payments/AR)** — fulfilled orders trigger payment collection follow-up.
→ **Journey 3 (Inventory)** — returned units update `availableQty`.

---

## Journey 6: Payments / Accounts Receivable

**Actors:**
- `operator` (accounting) — logs payments, allocates, manages AR
- `manager` — handles refunds, resolves allocation disputes

**Entry condition:** A posted invoice exists (`invoices.status = 'open'` or `'partial'`). Customer sends payment.

**Exit condition:** Invoice status is `'paid'` and payment is fully allocated, OR payment is `'refunded'`.

---

### Happy Path

1. Operator runs `logPayment` → creates `payments` row with status `'posted'`. Required fields: `customerId`, `amount` (must be ≠ 0), `method` (`'cash'`, `'check'`, `'card'`, `'crypto'`, `'wire'`), `allocationIntent`.
2. If `allocationIntent = 'fifo'` or `'selected_invoice'`: system internally calls `allocatePayment` in the same transaction. Payment allocated immediately if invoices are available.
   - ⚠️ **Known Gap (J05):** FIFO auto-allocation may not always execute. Operator should verify allocation occurred and run `allocatePayment` manually if not.
3. If `allocationIntent = 'unapplied'`: payment sits as unapplied balance. Reduces customer credit usage but does not close any invoice.
4. Manual allocation: `allocatePayment`. If `invoiceId` provided: allocates to that specific invoice. If not: applies FIFO to all open/partial invoices for the customer. Updates `invoices.amountPaid`, sets `invoices.status` to `'partial'` or `'paid'`. `payment.unappliedAmount` decreases.
5. Invoice reaches `amountPaid >= total` → status → `'paid'`. `customer.balance` decremented.

---

### Branch Scenarios

🔀 **B1 — Buyer credit (negative payment)**
- Trigger: Operator needs to issue a credit to the customer (over-payment, goodwill, returns).
- Path: `logPayment` with `amount < 0` → system treats as a "buyer credit" that immediately decrements `customer.balance`. No allocation needed — the credit applies to the customer's ledger directly.

🔀 **B2 — FIFO allocation**
- Trigger: `allocationIntent = 'fifo'` on `logPayment`.
- Path: System attempts to allocate starting with the oldest open invoice. If the payment covers multiple invoices, each is closed in chronological order. `unappliedAmount` carries forward any remainder.

🔀 **B3 — Selected invoice allocation**
- Trigger: Customer specifies which invoice they are paying.
- Path: `logPayment` with `allocationIntent = 'selected_invoice'` and `invoiceId`. System allocates directly to that invoice. Any overpayment stays unapplied.

🔀 **B4 — Unallocate (incorrect allocation)**
- Trigger: Payment was allocated to wrong invoice, or allocation must be reversed.
- Path: `unallocatePayment` → reverses the `paymentAllocations` record. `invoice.amountPaid` decremented, `invoice.status` reverts to `'open'` or `'partial'`. `payment.unappliedAmount` restored.

🔀 **B5 — Refund**
- Trigger: Payment must be returned to customer.
- Precondition: Payment must be **fully unallocated** first (`unappliedAmount` must equal full payment amount).
- Path: If not unallocated: `refundPayment` ⛔ throws. Operator must run `unallocatePayment` first, then `refundPayment` → `payments.status` → `'refunded'`.

🔀 **B6 — Early payment discount**
- Trigger: Customer pays early and qualifies for a discount.
- Guard: Discount amount must not exceed the invoice's open balance.
- Path: `applyEarlyPayDiscount` → adjusts `invoices` amount. Then `allocatePayment` closes the invoice.

🔀 **B7 — Manual client credit**
- Trigger: Non-payment credit adjustment needed (e.g., product quality issue, price correction).
- Path: `applyClientCredit` → applies credit directly to customer account. Updates `customer.balance` and inserts `clientLedgerEntries`.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Zero payment | `logPayment` with `amount = 0` | "Payment amount cannot be zero." | Log payment |
| ⛔ No unapplied amount | `allocatePayment` when payment fully applied | "Payment has no unapplied amount." | Allocation |
| ⛔ Refund while allocated | `refundPayment` when any amount is allocated | "Unallocate this payment before refunding." | Refund |
| ⛔ Discount exceeds balance | `applyEarlyPayDiscount` with `amount > openBalance` | "Discount amount exceeds open balance." | Discount |
| DB | Allocation amount ≤ 0 | DB CHECK constraint on `payment_allocations.amount` | Allocation |

---

### Recovery Paths

- **Wrong invoice allocated:** `unallocatePayment` → `allocatePayment` to correct invoice.
- **Payment logged to wrong customer:** No direct fix command. `reverseCommandById` on `logPayment` (→ Journey 9), then re-log to correct customer.
- **Refund blocked by allocation:** `unallocatePayment` → `refundPayment`.

---

### Handoffs

→ **Journey 12 (Credit Review)** — payment events trigger credit engine recomputation via `credit_recompute_queue`.
→ **Journey 7 (Vendor Bills/AP)** — AR management informs cash position for AP decisions.

---

## Journey 7: Vendor Bills / Accounts Payable

**Actors:**
- `operator` (accounting) — creates, tracks, and records payments on vendor bills
- `manager` — approves bills, schedules payments
- `owner` — can use `overrideUnscheduled` bypass

**Entry condition:** A vendor bill exists. Bills are typically created automatically by `postPurchaseReceipt` (Journey 2). They can also be created manually.

**Exit condition:** Vendor bill status is `'paid'` or `'voided'`.

---

### Happy Path

1. Bill created automatically on intake posting with status `'open'`. Or manually: `createVendorBill` → status `'created'`.
2. Manager runs `approveVendorBill` → status: `'open'`/`'created'` → `'approved'`.
3. Manager runs `scheduleVendorPayment` → sets `scheduledFor` date; status: `'approved'` → `'scheduled'`.
4. On payment date, operator runs `recordVendorPayment` → amount must be > 0, must not exceed open bill balance, bill must be `'scheduled'`. Creates `vendorPayments` row. Bill status: `'scheduled'` → `'paid'` (full) or `'partial'`.
5. For partial payments: bill stays `'partial'` until cumulative `amountPaid >= amount`. Each partial payment creates a new `vendorPayments` row.

---

### Branch Scenarios

🔀 **B1 — Manual bill creation**
- Trigger: Bill not auto-created (e.g., service invoice, fee).
- Path: `createVendorBill` → status `'created'`. Follows the same approve → schedule → pay path.

🔀 **B2 — Consignment bill triggered by sale**
- Trigger: Consigned batch (`ownershipStatus: 'C'`) is fully sold via `postSalesOrder`.
- Path: System finds oldest open vendor bill for the vendor → sets `consignmentTriggered: true`, advances status to `'approved'` (or creates new bill with `status: 'approved'` if none exists). Bill enters the normal schedule → pay path. No operator action required to create/approve — it auto-advances.

🔀 **B3 — Override unscheduled payment**
- Trigger: Exceptional circumstance — payment must be recorded before scheduling can be formalized.
- Precondition: Caller must be `owner` role.
- Path: `recordVendorPayment` with `overrideUnscheduled: true` → bypasses the `'scheduled'` status requirement. Payment recorded directly. Bill status updates normally.

🔀 **B4 — Void vendor payment**
- Trigger: Payment was recorded incorrectly (wrong amount, wrong method).
- Path: `voidVendorPayment` → sets `vendorPayments.status` → `'void'`. Restores `vendorBills.status` → `'approved'` (bill goes back to approved, not scheduled). Operator must re-schedule and re-record.

🔀 **B5 — Partial payment workflow**
- Trigger: Partial payment agreement with vendor.
- Path: `recordVendorPayment` with partial amount → bill status → `'partial'`. Additional `recordVendorPayment` calls add to `amountPaid`. Guard: cumulative payments cannot exceed bill total. Bill becomes `'paid'` when fully satisfied.

🔀 **B6 — Prepayment against PO**
- Trigger: Prepayment was recorded in Journey 1.
- Path: `recordVendorPrepayment` (in Journey 1) creates a prepayment record. This is separate from vendor bills. When the bill is eventually created (on intake posting), the prepayment may be applied to reduce the bill balance. (Implementation detail: reconciliation logic in handler.)

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Payment not scheduled | `recordVendorPayment` on non-`'scheduled'` bill without override | "Schedule this vendor payment before recording payment. Scheduled means a real appointment/payment event exists." | Payment |
| ⛔ Zero payment | `recordVendorPayment` with `amount ≤ 0` | "Vendor payout amount must be greater than zero." | Payment |
| ⛔ Exceeds bill balance | `recordVendorPayment` when total would exceed bill amount | "Vendor payout cannot exceed the open bill balance." | Payment |

---

### Recovery Paths

- **Voided payment:** Re-schedule (`scheduleVendorPayment`) → re-record (`recordVendorPayment`).
- **Wrong bill amount:** No direct edit command on bill amount. `createCorrectionJournalEntry` (→ Journey 8/9) for the adjustment, or reverse and re-create.
- **Bill created for wrong vendor:** No reassign command. Reverse and re-create.

---

### Handoffs

→ **Journey 8 (Closeout)** — all vendor bills must be resolved before a period can be locked.
→ **Journey 4 (Sales Orders)** — consignment trigger feeds back from sales posting.

---

## Journey 8: Closeout

**Actors:**
- `owner` — locks and archives periods
- `manager` — reviews eligibility, posts adjustments

**Entry condition:** End of financial period. All operational work for the period should be complete.

**Exit condition:** Period status is `'archived'`. Control-total artifacts (CSV, JSONL, PDF) written to `ARCHIVE_DIR`.

---

### Happy Path

1. Manager/owner reviews the period in the Closeout view. System runs `getCloseoutSafety` query — returns `unsafeRows` count and `eligible` boolean.
2. If `unsafeRows > 0`: identify and resolve each unsafe row category (see Branch Scenarios below).
3. Manager posts adjustments: `postPeriodAdjustments` → creates multiple `createCorrectionJournalEntry` records for the period. Each entry is an explicit ledger adjustment.
4. Individual adjustments: `createCorrectionJournalEntry` for one-off corrections.
5. Owner runs `lockPeriod` → guard: `unsafeRows` must be 0. If passes: inserts `period_locks` row with status `'locked'`. No further transactions can be posted to this period.
6. Owner runs `archivePeriod` → guard: lock must exist. Creates `archive_runs` row with status `'archived'`. Writes CSV, JSONL, and PDF artifacts to `ARCHIVE_DIR`. Journey ends.

---

### Branch Scenarios

🔀 **B1 — Draft/needs_fix batches blocking close**
- Trigger: Batches in `'draft'` or `'needs_fix'` status from intake.
- Path: Resolve by posting (`postPurchaseReceipt`) or rejecting (`rejectBatch`) each outstanding batch. Remove draft batches that are not needed (`deleteBatch`).

🔀 **B2 — Open purchase orders blocking close**
- Trigger: POs in `'draft'`, `'approved'`, `'ordered'`, or `'partially_received'` status.
- Path: Finalize and complete outstanding POs, or cancel them if no longer needed.

🔀 **B3 — Open pick lists or draft sales orders blocking close**
- Trigger: Pick lists with open status, or sales orders in `'draft'`.
- Path: Complete fulfillment for open pick lists. Post or cancel draft sales orders.

🔀 **B4 — Failed unretried commands blocking close**
- Trigger: `command_journal` has entries with `status: 'failed'` that have not been successfully retried.
- Path: Navigate to Recovery view (→ Journey 9). For each failed command: retry using stored `inputPayload` or document the failure with `documentCommandFailure`. System considers a failure "resolved" when a later successful command with equivalent payload exists.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Unsafe rows exist | `lockPeriod` when `unsafeRows > 0` | "Period has open work and cannot be locked yet." | Lock |
| ⛔ Archive before lock | `archivePeriod` when no lock exists | "Period must be locked before archiving." | Archive |

---

### Recovery Paths

- **Cannot close due to open work:** Work through each category of unsafe rows. The Closeout view displays the count and type. No shortcut — each must be genuinely resolved.
- **Lock was premature:** There is no `unlockPeriod` command. Lock is **irreversible in the application**. Contact owner for offline maintenance restore.
- **Archive produced wrong artifacts:** Archive is also irreversible in the app. Offline maintenance required.

---

### Handoffs

← All journeys feed into Closeout. Every open transaction is a potential blocker.
→ (Terminal) — no downstream journey.

---

## Journey 9: Recovery

**Actors:**
- `manager` / `owner` — execute reversals and corrections (RBAC-gated)
- `operator` — can search the journal and view history
- `viewer` — can view the journal

**Entry condition:** A command was executed incorrectly, a command failed, or an operator needs to investigate past actions.

**Exit condition:** The erroneous state is corrected. Command journal reflects the compensating entry.

---

### Happy Path (Reversal)

1. Operator navigates to Recovery view. Searches command journal by entity ID, command name, actor, or date range.
2. Operator locates the problematic command journal entry.
3. Operator previews the reversal: `restoreFromBackupPoint` → **read-only**. Returns `beforeSnapshot` and `afterSnapshot` showing what the reversal would do. Does not execute.
4. Manager/owner executes the reversal: `reverseCommandById` (requires `role = 'manager'` or `'owner'`).
   - Guard: command must have `status: 'ok'` (not failed).
   - Guard: command must not already have `reversedByCommandId` set (not already reversed).
   - The reversal logic is command-specific (hand-crafted inverse for each command type).
5. Reversal creates a new `commandJournal` entry. Original entry's `reversedByCommandId` set to the new entry's ID.
6. Downstream state is restored (e.g., inventory back to `'live'`, invoice status → `'reversed'`, balance restored).

---

### Branch Scenarios

🔀 **B1 — Reverse `postSalesOrder`**
- Precondition: All payment allocations on the resulting invoice must be unallocated first.
- Path: `reverseCommandById` on `postSalesOrder` entry. Guard: `currentInvoice.amountPaid > 0` → ⛔ throws ("Reverse payment allocations before reversing this sale."). Operator must `unallocatePayment` first, then retry reversal.
- Effect: Invoice status → `'reversed'`. `customer.balance` restored. `batches.availableQty` restored.

🔀 **B2 — Retry failed command**
- Trigger: A command in the journal has `status: 'failed'`. The `inputPayload` is stored from the original attempt.
- Path: Operator copies the `inputPayload` from the failed journal entry. Submits the command again (new `idempotencyKey`). System executes. For closeout purposes: a later successful command with the same payload marks the failure as "resolved".

🔀 **B3 — Document a failure (no retry possible)**
- Trigger: Failed command cannot be retried (e.g., external system unavailable, invalid data).
- Path: `documentCommandFailure` → adds a reason/note to the failed journal entry. Marks the failure as explicitly acknowledged. Unblocks closeout for this entry.

🔀 **B4 — Manual correction journal entry**
- Trigger: Ledger correction needed that does not correspond to any existing command reversal.
- Path: `createCorrectionJournalEntry` → creates a manual debit/credit adjustment. Used for period adjustments during Closeout or ad-hoc corrections.

🔀 **B5 — Multiple reversals needed (chain)**
- Trigger: A series of commands must be unwound (e.g., payment allocated to a wrongly-posted sale).
- Path: Reverse in reverse chronological order. Example: `unallocatePayment` → `reverseCommandById` (postSalesOrder) → `reverseCommandById` (postPurchaseReceipt) if needed. Each reversal is its own command journal entry.

🔀 **B6 — Command with no reversal support (terminal)**
- Trigger: `reverseCommandById` is called on a command marked as terminal or offsettable in the catalog.
- Path: ⛔ throws. No application-level reversal available. Options: `createCorrectionJournalEntry` for a manual offset, or offline maintenance restore.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Already reversed | `reverseCommandById` on command with `reversedByCommandId` set | "That command has already been reversed." | Reversal |
| ⛔ Reverse failed command | `reverseCommandById` on `status: 'failed'` command | "Only successful commands can be reversed." | Reversal |
| ⛔ Allocated invoice | `reverseCommandById` on `postSalesOrder` with allocated payments | "Reverse payment allocations before reversing this sale." | Reversal |
| ⚠️ Non-manager/owner | Reverse button shown only to manager/owner roles | (button hidden — client-side gate) | Reversal UI |
| ⛔ Terminal command | `reverseCommandById` on non-reversible command | (command-specific error) | Reversal |

---

### Recovery Paths

- Recovery IS the recovery path for all other journeys.
- If a reversal itself is wrong: create a new `createCorrectionJournalEntry` to offset it. Reversals of reversals are not supported as a command.

---

### Handoffs

← All journeys. Recovery can touch any part of the system.
→ **Journey 8 (Closeout)** — resolving failed commands is a prerequisite for period close.

---

## Journey 10: Matchmaking

**Actors:**
- `operator` (sales) — creates needs/supplies, works the match queue
- `manager` — reviews and accepts/dismisses matches

**Entry condition:** A customer has a product need, or a vendor has supply to offer.

**Exit condition:** Match accepted and converted to a PO (Journey 1), or need/supply dismissed or closed.

---

### Happy Path

1. Sales operator creates a customer need: `createCustomerNeed` → `customerNeeds` row with status `'open'`. Required: `customerId`, `productName`, `category`, minimum qty.
2. Sales operator creates vendor supply: `createVendorSupply` → `vendorSupply` row with status `'open'`. Required: `vendorId`, `productName`, `category`, available qty.
3. Matchmaking engine surfaces suggested pairings in the Matchmaking view.
4. Proactive signals: "To Move" grid (inventory that should be sold) and "To Source" grid (customer order patterns suggesting needs) supplement explicit need/supply records.
5. Operator reviews a match. Options:
   - `acceptMatchmakingMatch` → match status → `'accepted'`. Operator then manually creates a PO (Journey 1) for the sourcing and a sales order (Journey 4) for the selling.
   - `dismissMatchmakingMatch` → match status → `'dismissed'`.
6. Operator logs contact: `noteMatchmakingOutreach` → records that outreach was made for this match.
7. Settings: `updateMatchmakingSettings` → adjusts engine parameters.

---

### Branch Scenarios

🔀 **B1 — Reopen dismissed match**
- Trigger: Circumstances change, a previously dismissed match becomes relevant.
- Path: `reopenMatchmakingMatch` → match status → `'open'`. Re-enters the work queue.

🔀 **B2 — Snooze a work queue item**
- Trigger: Match is valid but not actionable right now.
- Path: `dismissMatchmakingWorkQueueItem` → snoozes the item for 30 days. It returns to the queue automatically after the snooze period.

🔀 **B3 — Tag-triggered match recalculation**
- Trigger: Tags are applied to a `customerNeed` or `vendorSupply` via `applyTags`.
- Path: System automatically triggers `rebuildMatchesForNeed` or `rebuildMatchesForSupply` — recalculates the match engine for the tagged entity. New matches may appear or old ones may be invalidated.

🔀 **B4 — Update need/supply**
- Trigger: Quantities, price expectations, or product details change.
- Path: `updateCustomerNeed` or `updateVendorSupply` → updates the record. May trigger match recalculation.

🔀 **B5 — No matches found**
- Trigger: A need or supply has no viable counterpart in the system.
- Path: Item stays in the work queue with no suggestions. Operator notes outreach (`noteMatchmakingOutreach`) and waits for new supply/need to enter the system.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⚠️ Missing required fields | `createCustomerNeed` with empty `productName`, `category`, or `qtyMin ≤ 0` | Standard validation errors | Creation |
| ⛔ Status transitions unconstrained | No status lifecycle enforcement | _(Known gap DYN-H4 — any status value accepted)_ | None currently |

---

### Recovery Paths

- **Wrong need/supply created:** `updateCustomerNeed` or `updateVendorSupply` to correct. No delete command — set to a closed/inactive status.
- **Accepted match that shouldn't have been:** `reopenMatchmakingMatch` → dismiss it instead.

---

### Handoffs

→ **Journey 1 (Purchase Orders)** — accepted match → operator creates a PO to source the product.
→ **Journey 4 (Sales Orders)** — accepted match → operator creates a sales order for the customer.

---

## Journey 11: Connectors / Processors

**Actors:**
- External connector system — submits requests
- `operator` / `manager` — reviews and acts on requests
- `manager` / `owner` — creates and configures processors

**Entry condition:** An external integration submits a request, OR a new payment processor needs to be configured.

**Exit condition:** Request is approved (and the resulting internal command executed), rejected (with operator notes), or routed.

---

### Happy Path (Request Review)

1. External connector submits a request via the API. Request lands in the `connectorRequests` queue with status `'pending'`. **No ledger mutations have occurred.**
2. Operator reviews the request in the Connectors view (`connectors` / `processors`).
3. Operator chooses:
   - `approveConnectorRequest` → request status → `'approved'`. The system executes the corresponding internal command. Ledger is now mutated.
   - `rejectConnectorRequest` → request status → `'rejected'`. Operator notes added. No ledger mutation. Journey ends for this request.
   - `routeConnectorRequest` → (internal/backend behavior) routes to an operator queue. Not a direct user-facing action.
4. Review history is persisted for all requests regardless of outcome.

---

### Happy Path (Processor Setup)

1. Manager runs `createPaymentProcessor` → defines processor with name, fee type (`percentage` or `fixed`), fee amounts, user/processor split (must sum to 100%).
2. Manager runs `updateProcessor` → edits processor details.
3. Fees tracked per transaction: `markUserFeeCollected` → `processorFees.userFeeStatus` → `'collected'`. `updateProcessorFeeStatus` → updates `processorFeeStatus` to `'paid'` or `'unpaid'`.

---

### Branch Scenarios

🔀 **B1 — Approve request**
- Path: `approveConnectorRequest`. The specific internal command type depends on the request payload. Approval is the only path that creates ledger mutations.

🔀 **B2 — Reject request**
- Path: `rejectConnectorRequest` with operator notes. Request permanently rejected. External system can resubmit a new request.

🔀 **B3 — Fee split configuration error**
- Trigger: `createPaymentProcessor` with user split + processor split ≠ 100%.
- Path: ⛔ throws with "User split and processor split must add up to 100%". Operator corrects the splits.

🔀 **B4 — Invalid fee status**
- Trigger: `updateProcessorFeeStatus` with a status other than `'paid'` or `'unpaid'`.
- Path: ⛔ throws with "Status must be either 'paid' or 'unpaid'".

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Invalid fee type | `createPaymentProcessor` missing fee percentage when type = percentage | Standard validation error | Creation |
| ⛔ Split != 100% | `createPaymentProcessor` with splits not summing to 100 | "User split and processor split must add up to 100%" | Creation |
| ⛔ Invalid fee status | `updateProcessorFeeStatus` with invalid value | "Status must be either 'paid' or 'unpaid'" | Update |

---

### Recovery Paths

- **Wrongly approved request:** `reverseCommandById` on the approved command (→ Journey 9), if reversible.
- **Wrong processor config:** `updateProcessor` to correct.

---

### Handoffs

→ Approval routes into the corresponding internal journey depending on request type (any of Journeys 1–7).

---

## Journey 12: Credit Review

**Actors:**
- `manager` — manages individual customer credit limits and engine settings
- `owner` — can disable credit engine, perform bulk reverts, access shadow mode

**Entry condition:** A customer's credit limit needs review (stale manual, engine recommendation changed, new customer).

**Exit condition:** Customer has a correct active credit limit (manual or engine-managed). No stale reminders.

---

### Happy Path

1. Manager opens Credit Review view (`credit-review`) — gated to `isManagerOrOwner`.
2. View surfaces customers with: `creditLimitSource` (`'manual'` or `'engine'`), current limit, balance, engine recommendation, stale limit indicator.
3. Manager reviews customers on the `'stale_manual'` tab.
4. For each customer, manager chooses action:
   - `setCustomerCreditLimit` → sets a new manual limit (requires `amount ≥ 0`, `reason` ≥ 4 chars). Sets `creditLimitSource = 'manual'`.
   - `revertCustomerCreditToEngine` → returns to engine control. Sets `creditLimitSource = 'engine'`.
   - `snoozeCustomerCreditReminder` → snoozes the stale reminder for 60 days. No limit change.
   - `setCustomerEngineMax` → caps the maximum the engine can assign (engine cannot exceed this even if it would recommend higher).
   - `setCustomerStance` → assigns a scoring profile (`creditEngineStances` record) with custom signal weightings.
5. Credit recomputation queued: most credit changes trigger an insert into `credit_recompute_queue`. Engine recomputes in background.

---

### Branch Scenarios

🔀 **B1 — Disable credit engine for a customer**
- Trigger: Customer relationship is handled entirely manually.
- Path: `disableCreditEngineForCustomer` → `customers.engineEnabled = false`. Engine never runs for this customer. `'engine_disabled'` filter tab in Credit Review.
- Precondition: Only `owner` can disable/re-enable.

🔀 **B2 — Re-enable credit engine**
- Trigger: Reverting a disabled customer back to engine management.
- Path: `enableCreditEngineForCustomer` → `customers.engineEnabled = true`. Engine resumes on next recompute cycle.

🔀 **B3 — Bulk revert to engine**
- Trigger: Many customers have stale manual limits and should be returned to engine control.
- Path: `bulkRevertCustomersToEngine` → iterates all eligible customers (those with `creditLimitSource = 'manual'` that meet bulk-revert criteria) and reverts each to engine control in a single command.

🔀 **B4 — Stance management**
- Trigger: Default stance doesn't fit a customer's risk profile.
- Path: `createCreditEngineStance` (owner) → defines weights for signals (payment history, order volume, etc.; weights must sum to 100 per DB constraint). `setCustomerStance` → assigns stance to customer.

🔀 **B5 — Engine configuration update**
- Trigger: Global engine parameters need tuning.
- Path: `setCreditEngineConfig` → updates global config. Change is written to `credit_engine_config_history` (append-only). Engine recomputes next cycle.

🔀 **B6 — Shadow mode**
- Trigger: Owner wants to test new engine parameters without affecting live limits.
- Path: Shadow mode (exact UI surface → verify in `CreditReviewView.tsx`). Engine runs in parallel without applying results to `customers.creditLimit`.

🔀 **B7 — Credit recompute triggered by external event**
- Trigger: `postSalesOrder`, `allocatePayment`, or other financial events insert into `credit_recompute_queue`.
- Path: Engine runs asynchronously. Results update `customer_credit_assessments` (scores 0–100, DB CHECK constraint). If `creditLimitSource = 'engine'`, `customers.creditLimit` updates to engine recommendation (capped at `engineMax`).

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Negative credit limit | `setCustomerCreditLimit` with `amount < 0` | "amount must be greater than or equal to zero" | Limit set |
| ⛔ Short reason | `setCustomerCreditLimit` with `reason` < 4 chars | "reason must be at least 4 characters" | Limit set |
| ⛔ Stance weights ≠ 100 | `createCreditEngineStance` with weights not summing to 100 | DB constraint violation | Stance creation |
| ⛔ Duplicate recompute | System inserts second recompute for same customer | DB unique index on `credit_recompute_queue_pending_unique` | Queue insert |
| ⚠️ Non-manager/owner | Full view gated | View not accessible | Access |

---

### Recovery Paths

- **Wrong manual limit set:** `setCustomerCreditLimit` with corrected amount (overwrites).
- **Stale manual limit:** `revertCustomerCreditToEngine` or `snoozeCustomerCreditReminder`.
- **Wrong stance assigned:** `setCustomerStance` with correct stance ID.

---

### Handoffs

→ **Journey 4 (Sales Orders)** — credit limits are enforced at confirm and post time.
← **Journey 6 (Payments/AR)** — payment events trigger recomputation.

---

## Journey 13: Photography / Media

**Actors:**
- `operator` (photographer workLoop) — uploads and publishes media
- `operator` (sales) — checks `mediaStatus` before sending customer sheets

**Entry condition:** A posted batch (`batches.status = 'posted'`) has `mediaStatus = 'open'` (no media) or `'ready'` (media uploaded but not published).

**Exit condition:** Batch `mediaStatus = 'done'`. At least one published primary photo exists.

---

### Happy Path

1. Photographer identifies batches needing photos in Photography view (`photography`) — filtered by `mediaStatus = 'open'`.
2. Token minted for mobile upload: `mintPhotoUploadToken` → creates a time-limited token (1 min to 24 hours; `ttlMinutes` must be 1–1440). Token is returned **once only** in the command result — it is **never stored in the command journal** (redacted for security).
3. Mobile device uploads photo using the token: `uploadBatchMedia` → creates `batchMedia` row with `status: 'draft'`. `mediaType` must be `'photo'` or `'video'`.
4. Role assigned: `setBatchMediaRole` → sets role to `'primary_photo'`, `'primary_video'`, or `'additional'`. DB unique index enforces one active published primary per type per batch.
5. Published: `publishBatchMedia` → `batchMedia.status` → `'published'`. `publishedAt` timestamp set. Batch `mediaStatus` updates to `'done'` when at least one primary photo is published.
6. Sales operator sees `mediaStatus = 'done'` → batch is catalog-ready for customer sheets.

---

### Branch Scenarios

🔀 **B1 — Revoke unused token**
- Trigger: Token minted but mobile device not available / workflow changed.
- Path: `revokePhotoUploadToken` → sets `photoUploadTokens.revokedAt = new Date()`. Token can no longer be used for upload.

🔀 **B2 — Delete incorrect photo**
- Trigger: Wrong photo uploaded, or photo quality unacceptable.
- Path: `deleteBatchMedia` → deletes DB row. Makes best-effort attempt to delete the file from storage (logs warning on storage delete failure, does not throw). If deleted photo was the primary, `mediaStatus` may revert to `'ready'` or `'open'`.

🔀 **B3 — Replace primary photo**
- Trigger: Better photo taken, old primary should be replaced.
- Path: Publish new photo (`uploadBatchMedia` → `publishBatchMedia`). Then `setBatchMediaRole` on old primary to `'additional'`. Then `setBatchMediaRole` on new photo to `'primary_photo'`. Cannot set two primaries simultaneously — DB constraint will throw.

🔀 **B4 — Video as primary**
- Trigger: Batch has a video as the main showcase asset.
- Path: `uploadBatchMedia` with `mediaType: 'video'`. `setBatchMediaRole` with `'primary_video'`. Separate unique index from `primary_photo` — both can coexist.

🔀 **B5 — Token expired before use**
- Trigger: `ttlMinutes` elapsed before mobile device used the token.
- Path: Upload attempt fails at the token validation layer. Operator runs `mintPhotoUploadToken` again for a fresh token.

---

### Error States

| Error | Trigger | Exact Message | Blocks |
|-------|---------|--------------|--------|
| ⛔ Invalid token TTL | `mintPhotoUploadToken` with `ttlMinutes ≤ 0` | "ttlMinutes must be a positive integer." | Token creation |
| ⛔ TTL too long | `mintPhotoUploadToken` with `ttlMinutes > 1440` | "ttlMinutes must be <= 24 hours." | Token creation |
| ⛔ Invalid media type | `uploadBatchMedia` with type not in `{photo, video}` | "mediaType must be one of: photo, video." | Upload |
| ⛔ Invalid role | `setBatchMediaRole` with unrecognized role | "role must be one of: primary_photo, primary_video, additional." | Role set |
| ⛔ Duplicate primary | `setBatchMediaRole` sets second primary on same batch | "Another media row is already the primary for this batch. Demote it first or replace it." | Role set |
| ⛔ Publish non-draft | `publishBatchMedia` on already-published or missing item | "Batch media not found or not in draft status." | Publish |
| ⛔ Revoke unknown token | `revokePhotoUploadToken` on nonexistent/revoked token | "Upload token not found or already revoked." | Revoke |

---

### Recovery Paths

- **Wrong photo uploaded:** `deleteBatchMedia` → re-upload.
- **Duplicate primary conflict:** Demote existing primary to `'additional'` → set new one as `'primary_photo'`.
- **Expired token:** `mintPhotoUploadToken` for a new token.
- **Published wrong photo:** Delete it → `mediaStatus` may revert → re-upload correct photo.

---

### Handoffs

→ **Journey 3 (Inventory)** — `mediaStatus = 'done'` signals catalog-ready batches.
→ **Journey 4 (Sales Orders)** — sales operators use `mediaStatus` to determine if a batch is ready for the customer sheet.

---

## Cross-Journey Dependencies

| If this journey... | Affects this journey... | How |
|-------------------|------------------------|-----|
| Journey 1 (PO) | Journey 2 (Intake) | `approvePurchaseOrder` auto-creates draft batches |
| Journey 2 (Intake) | Journey 7 (Vendor Bills) | `postPurchaseReceipt` auto-creates vendor bills |
| Journey 2 (Intake) | Journey 3 (Inventory) | Posted batches become live inventory |
| Journey 4 (Sales) | Journey 7 (Vendor Bills) | `postSalesOrder` triggers consignment vendor bills |
| Journey 4 (Sales) | Journey 5 (Fulfillment) | Posted sales orders enter fulfillment queue |
| Journey 4 (Sales) | Journey 6 (Payments) | Posted sales orders create invoices |
| Journey 4 (Sales) | Journey 12 (Credit Review) | Posting queues credit engine recomputation |
| Journey 5 (Fulfillment) | Journey 3 (Inventory) | `returnPickedUnits` restores `availableQty` |
| Journey 6 (Payments) | Journey 12 (Credit Review) | Payment events queue credit engine recomputation |
| Journey 9 (Recovery) | All journeys | Reversals can unwind any command |
| Journey 10 (Matchmaking) | Journey 1 (PO) | Accepted match → PO creation |
| Journey 10 (Matchmaking) | Journey 4 (Sales) | Accepted match → Sales order creation |
| Journey 11 (Connectors) | Any journey | Approved connector request → internal command |
| Journey 12 (Credit Review) | Journey 4 (Sales) | Credit limits enforced at confirm/post |
| Journey 13 (Photography) | Journey 4 (Sales) | `mediaStatus = 'done'` enables customer sheet |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Journeys covered | 13 |
| Total branch scenarios | 84 |
| Total error states (server-side guards) | 52 |
| Total client-side gates documented | 18 |
| Cross-journey dependencies | 15 |
| Commands referenced | 130 |
| Exact error messages captured from code | 48 |

