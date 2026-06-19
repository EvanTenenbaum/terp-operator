# TERP Operator: Unified Customer Journey Map

_Last updated: 2026-06-02_
_Sources: Live codebase (commandBus.ts, commandCatalog.ts, schema.ts, all views), Frontend CJM v2, Backend CJM v2, Feature Reference v2, Original CJM_
_Primary models: Gemini 2.5 Pro (large-context analysis), Claude Opus 4.7 (synthesis review)_

## How to Read This Document

This document has **four layers** per journey:

| Layer | Section | Format |
|-------|---------|--------|
| **User Intent** | "Why they're here" | Narrative — what the operator is trying to accomplish, their mental model, context that triggered the action |
| **UI State** | "What they see" | Exact grid columns, buttons, dialogs, filters — read from view source files |
| **Backend State** | "What happens" | Guards executed, DB writes, state transitions, side effects, Socket.io events — read from commandBus.ts |
| **Gap Inventory** | "What's broken" | TODO comments, missing frontend wiring, known race conditions, open issues |

**Notation:**

- `monospace` = exact command name from `commandCatalog.ts`
- `'quoted'` = exact status string value
- ⛔ = hard server-side guard (throws and blocks)
- ⚠️ = client-side gate (button hidden/disabled)
- 🔀 = branch point
- 🔁 = side effect (auto-created records, queued jobs)
- 🏴 = gap or known issue

---

## Infrastructure Layer

### Command Execution Lifecycle

```
Client (React + tRPC)
  │ useCommandRunner(name, payload, idempotencyKey)
  ▼
tRPC Router (protectedProcedure → session validated)
  │
  ▼
commandBus.executeCommand(ctx, input)
  │
  ├─ 1. IDEMPOTENCY CHECK: INSERT INTO command_journal (status='pending')
  │    ON CONFLICT (idempotencyKey) → return cached or wait (1s max)
  │
  ├─ 2. RBAC CHECK: assertCommandAccess(ctx.user.role, commandName)
  │    (src/server/rbac.ts — server-side, not UI)
  │
  ├─ 3. PAYLOAD VALIDATION: Zod schema.parse(input.payload)
  │
  ├─ 4. PRE-GUARDS: business logic guards (status checks, FK existence, QTY validations)
  │    Each guard throws with exact error message
  │
  ├─ 5. DB TRANSACTION:
  │    ├─ SELECT ... FOR UPDATE (lock rows)
  │    ├─ beforeSnapshot = snapshot of affected rows
  │    ├─ Business logic + DB writes (INSERT/UPDATE/DELETE)
  │    ├─ Auto side-effects (credit queue inserts, consignment triggers, auto-created rows)
  │    ├─ afterSnapshot = snapshot after writes
  │    └─ UPDATE command_journal SET status='ok', beforeSnapshot, afterSnapshot, result
  │
  ├─ 6. JSONL JOURNAL: appendJsonlJournal(entry)
  │    Written to JOURNAL_DIR/YYYY-MM-DD.jsonl
  │
  └─ 7. SOCKET.IO: io.emit('command:completed', {commandId, commandName, actorId, affectedIds})
       Targeted events: emitPickOrderAndQueue(), emitSalesLineEvent()
       Client: invalidates tRPC query cache → AG Grid refreshes → toast appears
```

### Session Management

- **Technology:** express-session + connect-pg-simple (PostgreSQL-backed)
- **Cookie:** `terp_agro_sid`, httpOnly, secure in production, sameSite: 'lax'
- **Max age:** 12 hours
- **Expired session** → redirected to login

### Idempotency Key Lifecycle

- Format: `${commandName}-${uuid}`
- Stored in: `command_journal.idempotencyKey` (UNIQUE constraint)
- Duplicate key detection: atomic `INSERT ... ON CONFLICT DO NOTHING`
- "Pending" entries older than 5 minutes → flipped to `failed`, newcomer retries with new key
- Completed entries: persisted indefinitely (no TTL cleanup — they ARE the audit trail)

### Socket.io Event Flow

- **Global events:** `command:completed` and `command:failed` → broadcast to ALL connected clients via `io.emit()`
- **Targeted events:**
  - `pick:queue` — warehouse pick queue changes
  - `pick:order:${orderId}` — per-order pick state
  - `sales:order:${orderId}:line:changed` — per-order sales line changes

### Credit Engine Mechanics

- **6 signals weighted:** revenueMomentum, cashCollection, profitability, debtAging, repaymentVelocity, tenureDepth
- **Stances** define per-signal weightings (must sum to 100)
- **Queue:** `credit_recompute_queue` table consumed by background worker
- **Trigger points:** `postSalesOrder`, `confirmSalesOrder`, `logPayment`, `allocatePayment`, credit config changes
- **Application:** Only when `customers.creditLimitSource = 'engine'` and `customers.engineEnabled = true`
- **Cap:** `customers.engineMax` limits engine recommendation

### Decimal.js Money Policy (TER-1566)

All monetary accumulation uses Decimal.js at 20-digit precision with ROUND_HALF_UP. Never use native JS floats (`0.1 + 0.2`) for financial math anywhere in the system.

---

## Journey 1: Purchase Order

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `purchaseOrders` |
| **Part of** | `OperationsViews.tsx` |
| **Actors** | `operator` creates/edits; `manager`/`owner` approve |
| **Entry** | Vendor exists; operator intends to order product |
| **Exit** | PO status `'received'` (all lines received) or `'cancelled'` |
| **Commands** | `createPurchaseOrder`, `updatePurchaseOrder`, `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `removePurchaseOrderLine`, `finalizePurchaseOrder`, `unfinalizePurchaseOrder`, `approvePurchaseOrder`, `receivePurchaseOrder`, `cancelPurchaseOrder`, `recordVendorPrepayment` |
| **RBAC** | Create/edit: `operator`. Approve/cancel: `manager`. Prepayment: `manager` |

### Step 1: Create Purchase Order

**User Intent:**
The operator has just gotten off the phone with a vendor. They've negotiated quantities and pricing for an upcoming shipment. The vendor needs a formal PO number so they can start preparing the order. The operator opens the Purchase Orders view to create a new order now, while the details are fresh.

**UI State (what they see):**
- View: `purchaseOrders` in OperationsViews.tsx
- Workspace panel layout with purchase orders grid filtered by status
- Command palette: Cmd+K → "purchaseOrder" creates a new draft

**What they click/type:**
1. Click "Create Purchase Order" button (or Cmd+K → "purchaseOrder")
2. Form opens: select vendor from dropdown, set expected date, payment terms, prepayment amount, notes
3. Click "Create"

**Backend State (what happens):**
- Command: `createPurchaseOrder`
- ⛔ GUARD: vendorId must exist in `vendors` table → throws "Vendor not found."
- DB write: `INSERT INTO purchase_orders` — status='draft', poNo auto-generated
- State transition: `purchase_orders.status`: (new) → `'draft'`
- Journal: afterSnapshot contains the new PO row
- Socket.io: `command:completed` broadcast globally

### Step 2: Add Lines

**User Intent:**
The operator refers to their Apple Numbers workbook or notes from the vendor call. They need to add each SKU as a line item with the negotiated quantity and cost information.

**UI State:**
- Inline AG Grid edit mode on the purchase order lines grid
- Columns: Product (pinned left), Qty, Unit Cost, Cost Range Low, Cost Range High, Category, Notes, Status
- "Add Line" button in the control band

**Backend State:**
- Command: `addPurchaseOrderLine`
- ⛔ GUARD: qty must be > 0 ("Quantity must be greater than zero.")
- ⛔ GUARD: Cannot specify both unitCost AND cost range ("Cannot specify both unit cost and cost range.")
- ⛔ GUARD: If cost range: low ≤ high, both > 0
- DB write: `INSERT INTO purchase_order_lines` — status='planned'

**Cost formats (two options):**
- **Fixed cost:** `unitCost > 0`, `costRangeLow = costRangeHigh = 0`  
- **Range cost:** `unitCost = 0`, `costRangeLow > 0`, `costRangeHigh > 0`, low ≤ high
- 🔀 Mutual exclusivity enforced by DB CHECK constraint

### Step 3: Edit / Remove Lines

**Commands:** `updatePurchaseOrderLine`, `removePurchaseOrderLine`

**Guards:**
- ⛔ Cannot set qty below already-received qty
- ⛔ Cannot remove a line with receivedQty > 0
- ⚠️ Edit buttons disabled if line has receivedQty > 0

### Step 4: Finalize Purchase Order

**User Intent:**
The PO is complete. All lines have correct quantities and costs. The operator needs to lock the PO so it can't be edited accidentally, and hand it off for approval.

**UI State:**
- "Finalize" button in the control band (only visible on `draft` status POs)
- After finalization: line editing is locked, "Finalize" button replaced with "Unfinalize"

**Backend State:**
- Command: `finalizePurchaseOrder`
- ⛔ GUARD: PO must have at least one line ("Add at least one product line before finalizing.")
- ⛔ GUARD: PO must be in `'draft'` status ("Only draft purchase orders can be finalized.")
- ⛔ GUARD: All lines must have valid costs (no `needs_fix` lines)
- 🔀 Lines with `unitCost ≤ 0` and no cost range → status `'needs_fix'`, finalization blocked
- DB write: `UPDATE purchase_orders SET status='finalized', finalizedAt=now()`
- State transition: `draft` → `'finalized'`
- Reversible: `unfinalizePurchaseOrder` returns to `'draft'`

### Step 5: Unfinalize (if needed)

**User Intent:**
The operator notices a mistake — wrong quantity on one line, or the vendor just called with a price change. The PO needs to go back to draft for editing.

**Command:** `unfinalizePurchaseOrder`
- ⛔ GUARD: PO must be in `'finalized'` status
- State transition: `'finalized'` → `'draft'`
- `finalizedAt` cleared

### Step 6: Approve Purchase Order

**User Intent:**
The manager reviews the finalized PO. Everything checks out — vendor, quantities, costs, payment terms. The manager approves the PO to trigger the intake workflow.

**UI State:**
- "Approve" button visible on `'finalized'` POs (gated to manager/owner)
- Referee relationship dropdown (optional — for broker commission tracking)

**Backend State:**
- Command: `approvePurchaseOrder`
- Requires: `manager` role minimum
- ⛔ GUARD: PO must be in `'finalized'` status ("Purchase order must be finalized before approval.")
- ⛔ GUARD: All lines must pass validation
- DB writes:
  - `UPDATE purchase_orders SET status='approved', orderedAt=now(), orderedBy=?`
  - `UPDATE purchase_order_lines SET status='planned'`
  - Calls `recalcPurchaseOrder` to update PO total
- 🔁 SIDE EFFECT: Calls `receivePurchaseOrder` internally → `INSERT INTO batches` for each PO line
  - Batch status: `'draft'`, location: 'Receiving'
  - `ownershipStatus` determined by: line override > PO payment terms > fallback 'UNKNOWN'
- 🔁 SIDE EFFECT: If `refereeRelationshipId` provided → `INSERT INTO referee_credits`
- State transitions:
  - `purchase_orders.status`: `'finalized'` → `'approved'`
  - `batches.status`: (new) → `'draft'`
- Socket.io: `command:completed` broadcast
- Reversible: Returns PO to `'finalized'` (does NOT delete auto-created batches)

### Step 7: Record Prepayment (optional)

**User Intent:**
The vendor requires payment upfront before shipping. The accounting operator records this prepayment against the approved PO.

**Command:** `recordVendorPrepayment`
- ⛔ GUARD: PO must be `'approved'` status
- ⛔ GUARD: Amount must be > 0 and ≤ `prepaymentAmount` cap
- ⛔ GUARD: Only one prepayment per PO (duplicate guard)

### Step 8: PO Progression During Intake

- As intake batches are posted (Journey 2), PO status auto-updates:
  - Some lines received → `'partially_received'`
  - All lines received → `'received'`
  - `purchaseOrderLines.status` → `'received'`

### Branch Scenarios

🔀 **B1 — Cancel PO:** `cancelPurchaseOrder` (manager only)
- ⛔ GUARD: No lines can have `receivedQty > 0`
- ⛔ GUARD: PO cannot be cancelled if anything has been physically received
- State: PO → `'cancelled'`, all lines → `'cancelled'`

🔀 **B2 — Wrong vendor on PO:** No command to change vendor after creation. Cancel and create new.

🔀 **B3 — Line with `'needs_fix'`:** `updatePurchaseOrderLine` to fix → re-attempt finalize.

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Qty zero | `addPurchaseOrderLine` qty ≤ 0 | "Quantity must be greater than zero." |
| ⛔ Both costs | unitCost AND cost range set | "Cannot specify both unit cost and cost range." |
| ⛔ Invalid range | low > high or ≤ 0 | "Invalid cost range: low must be <= high..." |
| ⛔ Below received | update sets qty < receivedQty | "Quantity cannot be below already received quantity." |
| ⛔ Remove received | remove line with receivedQty > 0 | "Received PO lines cannot be removed." |
| ⛔ Empty PO | finalize with no lines | "Add at least one product line before finalizing." |
| ⛔ Wrong status | finalize non-draft | "Only draft purchase orders can be finalized." |
| ⛔ Wrong status | approve non-finalized | "Purchase order must be finalized before approval." |
| ⛔ Cancel with received | cancel when receivedQty > 0 | "POs with received product cannot be cancelled." |
| ⛔ Prepay > cap | amount > prepaymentAmount | "Prepayment exceeds cap." |
| ⛔ Dup prepay | second prepay on same PO | "Prepayment already recorded." |

### Gaps & Open Items

- 🏴 **GAP:** PO reversal doesn't clean up auto-created intake batches — orphaned drafts possible
- ✅ **Complete:** Full PO lifecycle (draft → finalized → approved → received/cancelled)
- ✅ **Complete:** Cost range propagation to landed cost tracking

### Handoffs

→ **Journey 2 (Intake):** `approvePurchaseOrder` auto-creates draft batches
→ **Journey 7 (Vendor Bills/AP):** `postPurchaseReceipt` creates vendor bills
---

## Journey 2: Intake / Receiving

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `intake` |
| **File** | `IntakeView.tsx` (729 lines) |
| **Actors** | `operator` (intake workLoop) processes; `manager`/`owner` post |
| **Entry** | Approved PO with draft batches, OR manual batch creation |
| **Exit** | Batches posted → live inventory created. Vendor bills auto-created. |
| **Commands** | `createBatch`, `updateBatch`, `deleteBatch`, `flagBatch`, `rejectBatch`, `verifyAllIntake`, `postPurchaseReceipt`, `importBatchesCsv` |

### Intake View — UI Detail

From `IntakeView.tsx`:

**Grid columns:**
| Field | Header | Editable |
|-------|--------|----------|
| batchCode | Batch | Yes (inline) |
| name | Name | Yes |
| category | Category | Yes |
| intakeQty | Intake Qty | Yes (pre-post) |
| unitCost | Unit Cost | Yes |
| costRangeLow | Cost Low | Yes |
| costRangeHigh | Cost High | Yes |
| notes | Notes | Yes |
| ownershipStatus | Ownership | Yes |
| arrivalStatus | Arrival | Yes |
| status | Status | No (auto) |

**Toolbar controls:**
- "Post Intake" button (posts selected batches as purchase receipt)
- "Flag Selected" button (marks for attention)
- "Reject Selected" button (rejects at dock)
- "Verify All" button (bulk verifies)
- CSV import area (drag-and-drop)

### Step 1: Review Draft Batches

**User Intent:**
The dock just received a shipment from a vendor. The operator pulls up the Intake view. Draft batches were automatically created when the PO was approved. They verify each batch against the physical product: count, inspect quality, check lot codes, confirm arrival.

**UI State:**
- Intake grid shows all draft batches
- Inline editing on intakeQty, unitCost, notes, arrivalStatus
- Each row's status pill shows `draft` in grey
- Selection: click rows to select for bulk actions

**Backend:**
- Reads: `batches` where status = 'draft', joined with PO and vendor info
- No writes at this stage — purely review

### Step 2: Flag Batch (attention needed)

**User Intent:**
One batch has a minor quality issue — a few damaged units, but the product is still usable. The operator flags it so the manager knows to review it before posting.

**Command:** `flagBatch`
- Appends entry to batch's `validationIssues` array
- Merges note onto parent PO's `internalNotes`
- ⚠️ Does NOT change `batches.status` — stays in current status
- ⚠️ No `'flagged'` status value exists in the system
- ⚠️ No `verifyBatch` command — only bulk `verifyAllIntake` exists

### Step 3: Reject Batch (product refused)

**User Intent:**
A batch contains the wrong product entirely, or it's visibly contaminated. The operator refuses the shipment outright.

**Command:** `rejectBatch`
- ⛔ GUARD: Batch must NOT be `'posted'`
- State transition: `batches.status` → `'returned'`
- `availableQty` → 0
- No inventory created. No vendor bill for this batch.
- Terminal command — cannot be reversed

### Step 4: Verify All Intake

**User Intent:**
All batches look good. The operator wants to bulk-mark everything as ready for posting.

**Command:** `verifyAllIntake`
- Bulk-verifies all pending intake rows

### Step 5: Post Purchase Receipt

**User Intent:**
The operator selects the verified batches and posts them. This is the critical gate — until this moment, nothing has hit inventory or accounting. Posting creates live inventory, generates vendor bills, and triggers the downstream AP workflow.

**Backend State (comprehensive):**
- Command: `postPurchaseReceipt`
- ⛔ GUARD: Only `draft` or `ready` batches can be posted
- ⛔ GUARD: All selected batches must share ONE vendor
- ⛔ GUARD: All selected batches must share ONE PO
- ⛔ GUARD: Each batch must pass validation
- ⛔ GUARD: Batch must not have been deleted between selection and submit

- DB writes (in transaction):
  1. `UPDATE batches SET status='posted', arrivalStatus='arrived'` for each batch
  2. `INSERT INTO purchase_receipts` — status='posted'
  3. `INSERT INTO purchase_receipt_lines` — per batch
  4. `INSERT INTO vendor_bills` — status='open' (one per vendor/receipt combo)
  5. Qty discrepancy detected → auto-generated notes on `batches.notes` and `vendorBills.discrepancyNotes`

- 🔁 SIDE EFFECT: `batches.availableQty` now populated → inventory is live
- 🔁 SIDE EFFECT: Vendor bill enters AP lifecycle (Journey 7)
- State transitions:
  - `batches.status`: `'draft'`/`'ready'` → `'posted'`
  - `batches.arrivalStatus`: → `'arrived'`
  - `purchase_receipts.status`: (new) → `'posted'`
  - `vendor_bills.status`: (new) → `'open'`

- Journal: beforeSnapshot captures batches in pre-posted state
- Socket.io: `command:completed` broadcast → inventory grid refreshes
- Reversible via `reverseCommandById`

### Branch Scenarios

🔀 **B1 — Quantity discrepancy:** `intakeQty` ≠ PO line qty → discrepancy notes auto-generated
🔀 **B2 — Consignment batch:** `ownershipStatus='C'` → vendor bill created but NOT due yet
🔀 **B3 — CSV import:** `importBatchesCsv` → validates structure; all-or-nothing: if any errors, zero batches created
🔀 **B4 — Manual batch (no PO):** `createBatch` → independent batch with all required fields
🔀 **B5 — Mixed vendors/POs:** ⛔ postPurchaseReceipt throws — must split selection

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Wrong status | Post on flagged/needs_fix batch | "{name} is {status}. Only Draft or Ready intake rows can be processed." |
| ⛔ Missing fields | Post with validation issues | "{name} needs fixes: {issues}" |
| ⛔ Multiple vendors | Post mixed-vendor selection | "Selected intake rows must share one vendor..." |
| ⛔ Multiple POs | Post mixed-PO selection | "Selected intake rows can only be receipted against one purchase order..." |
| ⛔ Row deleted | Batch deleted between select and submit | "One or more selected intake rows no longer exist." |
| ⛔ Reject posted | Reject on posted status | "Posted batches cannot be rejected. Use reversal/correction." |
| ⛔ Delete posted | Delete posted batch | "Posted batches cannot be deleted. Reverse the posting instEAD." |
| ⛔ CSV invalid | Import with errors | "{N} CSV issue(s) must be fixed before import." |
| ⛔ Edit intakeQty | Change qty after posting | "intake_qty is immutable after posting. Use adjustBatchQuantity." |

### Gaps & Open Items

- 🏴 **GAP:** `intakeQty` is not immutable pre-posting — can be changed, which may mask intake errors
- 🏴 **GAP:** No per-batch `verifyBatch` command — only bulk `verifyAllIntake`
- ✅ **Complete:** Full intake lifecycle
- ✅ **Complete:** CSV import with validation

### Handoffs

→ **Journey 3 (Inventory):** Posted batches become live
→ **Journey 7 (Vendor Bills/AP):** Bills auto-created on posting
---

## Journey 3: Inventory Management

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `inventory` |
| **Part of** | `OperationsViews.tsx` |
| **Actors** | `operator` adjusts/updates; `manager` qty adjustments + ownership transfers |
| **Entry** | At least one batch with `status='posted'` (live inventory) |
| **Exit** | Continuous — no terminal end state |
| **Commands** | `adjustBatchQuantity`, `setInventoryStatus`, `transferInventoryLocation`, `transferInventoryOwnership`, `setBatchPrice`, `setBatchLotInfo`, `setItemAlias`, `applyTags` + all media commands |

### Inventory View — UI Detail

The inventory view surfaces all live and depleted batches in an AG Grid. Core columns:
- Batch Code (pinned left, linked)
- Name / Product
- Category / Vendor
- Available Qty (live, decremented by sales)
- Reserved Qty (held for open orders)
- Unit Cost / Unit Price
- Status (pill: Live, Held, Damaged, Sold, Depleted)
- Ownership (OFC / C / UNKNOWN)
- Location
- Media Status (Open, Ready, Done)

**Context drawer** shows:
- Batch detail card (lot info, cost, pricing)
- Media panel (photos/videos with role indicators)
- RowCommandHistoryDrawer (audit trail)
- Adjustment controls (qty, status, location, ownership, price, lot info)

### Key Inventory Actions

**Quantity Adjustment:**
- Command: `adjustBatchQuantity` (requires manager!)
- ⛔ GUARD: Result cannot go below 0
- Writes to `inventory_movements` table
- Reversible (offsettable — equal opposite adjustment)

**Status Change:**
- Command: `setInventoryStatus` (requires manager!)
- Valid source statuses: `'posted'`, `'held'`, `'damaged'`, `'returned'`, `'in_transit'`
- Cannot transition from `'draft'` or `'sold'`
- Common transitions: `'live'` → `'held'` (quarantine), `'held'` → `'live'` (release)

**Location Transfer:**
- Command: `transferInventoryLocation` (operator can execute)
- Writes to `inventory_movements`

**Ownership Transfer:**
- Command: `transferInventoryOwnership` (requires manager!)
- ⛔ GUARD: Transfer to `'C'` (consignment) requires `vendorId` on batch
- Writes to `inventory_movements`

**Lot Info Update:**
- Command: `setBatchLotInfo` — lot code, dates, supplemental details

**Item Alias:**
- Command: `setItemAlias` (requires manager!)
- Sets customer-facing market name for the catalog item

**Tags:**
- Command: `applyTags` — add, remove, or replace

### Media Workflow in Inventory

Full photography/media lifecycle managed here (detailed in Journey 13):
1. `uploadBatchMedia` → `batchMedia` row, status='draft'
2. `setBatchMediaRole` → primary_photo / primary_video / additional
3. `publishBatchMedia` → status='published'
4. `deleteBatchMedia` → removes media and files

### Branch Scenarios

🔀 **B1 — Qty increase:** `adjustBatchQuantity` with positive delta → `availableQty` ↑, audit trail
🔀 **B2 — Qty decrease:** Negative delta (damage, theft) → ⛔ blocks if result < 0
🔀 **B3 — Hold/release:** `setInventoryStatus` to `'held'` → batch invisible to sales
🔀 **B4 — Consignment purchase:** `transferInventoryOwnership` to `'OFC'` → vendor paid
🔀 **B5 — Primary photo conflict:** Duplicate primary → ⛔ DB unique index blocks
🔀 **B6 — Depletion:** `availableQty` → 0 → status auto-`'depleted'` or `'sold'`

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Qty negative | adjustBatchQuantity result < 0 | "Available quantity cannot go below zero." |
| ⛔ Bad status transition | setInventoryStatus from draft/sold | "Only posted inventory rows can move through status transitions." |
| ⛔ Consignment no vendor | transferOwnership to C without vendorId | "Consigned inventory needs a vendor before ownership transfer." |
| ⛔ intakeQty immutable | updateBatch on posted batch | "intake_qty is immutable after posting." |
| ⛔ Duplicate primary | setBatchMediaRole second primary | "Another media row is already the primary." |

### Gaps & Open Items

- 🏴 **GAP:** `publishBatchMedia` does NOT update `batches.mediaStatus` — only legacy `attachBatchPhoto` does
- ✅ **Complete:** Inventory adjustments with audit trail (`inventory_movements`)

### Handoffs

→ **Journey 4 (Sales):** Live batches are the inventory source
→ **Journey 13 (Photography):** `mediaStatus` drives the photo workflow
---
## Journey 4: Sales Order

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `sales` |
| **File** | `SalesView.tsx` (1254 lines) + `SalesView.columns.ts` + `SalesView.csvExport.ts` |
| **Actors** | `operator` creates/prices/confirms; `manager` credit overrides, reprice |
| **Entry** | Customer with credit limit; live inventory available |
| **Exit** | Status `'posted'` (invoice created) or `'cancelled'` |
| **Commands** | `createSalesOrder`, `addSalesOrderLine`, `updateSalesOrderLine`, `removeSalesOrderLine`, `priceSalesOrder`, `repriceOrder`, `setLineLandedCost`, `setLineBelowFloorReason`, `resolveVendorApproval`, `reserveInventoryForOrder`, `confirmSalesOrder`, `postSalesOrder`, `cancelSalesOrder`, `setDeliveryWindow`, `createCustomerSheetSnapshot`, `applyClientCredit` |

### Sales View — UI Detail

From `SalesView.tsx` and `SalesView.columns.ts`:

**Sales Order Grid** (the order book):
- Order No (pinned left), Customer, Status, Total, Lines, Date, Delivery Window

**Sales Lines Grid** (when order selected):
- Product (pinned left), Qty, Unit Price, Unit Cost, Margin %, Floor Price, Batch, Pick Status, Status

**Key Filter Dimensions:**
- Customer scope selector
- Status filter (Draft, Confirmed, Posted, Fulfilled)
- Category / Vendor / Tag / Price Bracket / Aging filters (added in J03 gap closure)
- Inventory suggestion panel with customer-only filtered results

**Quick Launch:** Cmd+K → "sale" → creates new draft

### Step 1: Create Sales Order

**User Intent:**
A customer has called or messaged. They want to place an order for specific products. The sales operator opens the Sales view and creates a new order draft, assigning the customer.

**Backend:**
- Command: `createSalesOrder` → status='draft', orderNo assigned
- Terminal command

### Step 2: Add Lines

**User Intent:**
The operator builds the order line by line, matching customer requests to available inventory batches. For each line, they need to find the right batch at the right price.

**Backend:**
- Command: `addSalesOrderLine`
- ⛔ GUARD: If `batchId` provided, batch must be `'posted'` with available qty
- ⛔ GUARD: Cannot exceed `batches.availableQty`
- ⚠️ "Soft reservation" display: other operators' draft orders show reduced available qty
- Lines can be free-text (unresolved) for orders before inventory is confirmed

### Step 3: Price Sales Order

**User Intent:**
The lines are set. The operator applies the pricing strategy to calculate unit prices, margins, and totals for the order.

**Command:** `priceSalesOrder`
- Applies pricing strategy → `unitPrice` populated per line
- Offsettable: `repriceOrder` (manager only) re-applies strategy

### Step 4: Handle Floor Price Exceptions

**User Intent:**
A line is priced below the batch's floor price — this means the operator is selling at a margin lower than the minimum. They need to record WHY and get vendor approval if needed.

**Commands:**
- `setLineBelowFloorReason` → records reason (operator)
- `resolveVendorApproval` → vendor-side sign-off (manager)
- Until both resolved, `findExceptionBlockedLine` guard blocks confirmation

### Step 5: Reserve Inventory

**User Intent:**
The order is taking shape. The operator reserves inventory to prevent another salesperson from selling the same batch units.

**Command:** `reserveInventoryForOrder`
- `batches.reservedQty` ↑, `batches.availableQty` ↓
- Line status → `'reserved'`
- ⛔ GUARD: Must have sufficient available qty (hard lock with `SELECT ... FOR UPDATE`)

### Step 6: Customer Sheet Snapshot

**User Intent:**
The customer wants to see what they're buying before committing. The operator creates a customer-facing version that hides cost and margin data.

**Command:** `createCustomerSheetSnapshot`
- Saves point-in-time snapshot
- Explicitly omits `unitCost` and `internalMargin`
- Terminal command

### Step 7: Confirm Sales Order

**User Intent:**
Everything checks out — pricing is right, inventory is reserved, exceptions are handled. The operator confirms the order, which triggers the formal credit check and locks the order for posting.

**Backend:**
- Command: `confirmSalesOrder`
- ⛔ GUARD: Credit check — `customer.balance + order.total ≤ customer.creditLimit`
  - If exceeded: ⛔ throws with credit limit message
  - Client gate: ⚠️ credit hold indicator shown in UI before attempt
- ⛔ GUARD: All lines must have resolved costs (no unresolved free-text lines)
- ⛔ GUARD: All exception blockers resolved
- State transition: `sales_orders.status`: `'draft'` → `'confirmed'`
- 🔁 SIDE EFFECT: Inserts into `credit_recompute_queue`

**Credit hold resolution:**
- Reduce order value
- Manager increases credit limit (`setCustomerCreditLimit`)
- Apply client credit (`applyClientCredit`) to reduce balance

### Step 8: Post Sales Order

**User Intent:**
The order is confirmed, the customer has committed. The operator posts the order — this creates the invoice, decrements inventory permanently, and updates the customer's balance. This is a point of no return without a formal reversal.

**Backend (one of the most complex commands):**
- Command: `postSalesOrder`
- ⛔ GUARD: Status must be `'confirmed'` ("{orderNo} must be confirmed before posting.")
- ⛔ GUARD: Credit rechecked (re-read with `FOR UPDATE` lock on customer row)
- ⛔ GUARD: All lines must have source batches with sufficient available qty
- ⛔ GUARD: No duplicate source rows (same batch on 2+ lines of same order)

- DB writes (in transaction):
  1. For each line: `UPDATE batches` — decrement `availableQty` and `reservedQty`
  2. `INSERT INTO inventory_movements` — records depletion
  3. `INSERT INTO invoices` — status='open'
  4. `UPDATE customers` — `balance += order.total`
  5. `INSERT INTO client_ledger_entries` — debit entry
  6. `UPDATE sales_orders` — status='posted'
  7. `UPDATE sales_order_lines` — status='posted'
  8. If consignment batch depleted → trigger vendor bill (Journey 7)

- 🔁 SIDE EFFECT: Consignment sell-through → vendor bill due/approved
- 🔁 SIDE EFFECT: Credit recompute queue insert
- State transitions:
  - `sales_orders.status`: `'confirmed'` → `'posted'`
  - `invoices.status`: (new) → `'open'`
  - `sales_order_lines.status`: → `'posted'`

- Reversible: Restores `availableQty`, marks invoice `'reversed'`, reverses ledger entries
- Prerequisite for reversal: All payment allocations on the invoice must be unallocated first

### Step 9: Cancel Sales Order

**User Intent:**
The customer cancels, or the order becomes invalid. The operator cancels the order, releasing reserved inventory back to available.

**Command:** `cancelSalesOrder` (requires manager!)
- ⛔ GUARD: No fulfillment lines with `actualQty > 0` (nothing picked)
- ⛔ GUARD: If lines were released for picking → `line_cancelled` warehouse alert created
- Releases `reservedQty` on all batches
- State: `sales_orders.status` → `'cancelled'`

### Branch Scenarios

🔀 **B1 — Credit hold:** Balance + order > limit → reduce order, increase limit, or apply credit
🔀 **B2 — Below floor:** `setLineBelowFloorReason` + `resolveVendorApproval`
🔀 **B3 — Race condition:** Two operators add lines for same batch → hard check at `reserveInventoryForOrder`
🔀 **B4 — Duplicate source row:** Same batch on 2 lines → `postSalesOrder` ⛔ refuses
🔀 **B5 — Add lines to confirmed:** `addSalesOrderLine` valid on `'confirmed'` orders
🔀 **B6 — Reprice:** `repriceOrder` (manager) on `'draft'` or `'confirmed'` orders
🔀 **B7 — Cancel pre-fulfillment:** No picked units → `cancelSalesOrder` works
🔀 **B8 — Cancel with picked units:** ⛔ blocked → must `returnPickedUnits` first
🔀 **B9 — Consignment sell-through:** Depleted consigned batch → triggers vendor bill
🔀 **B10 — Unresolved costs:** Free-text line → `confirmSalesOrder` ⛔ blocked

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Batch unavailable | addSalesOrderLine batch not posted | "{batch.name} does not have enough available quantity." |
| ⛔ Insufficient qty | addSalesOrderLine exceeds available | Same message |
| ⚠️ Edit locked line | Line with pickStatus released/picking/picked | Button disabled (client-side) |
| ⛔ Credit exceeded | confirmSalesOrder over limit | "{customer.name} would exceed credit limit." |
| ⛔ Unresolved cost | confirmSalesOrder free-text line | Validation listing the line |
| ⛔ Exception blocker | confirmSalesOrder pending approval | Blocker description |
| ⛔ Post non-confirmed | postSalesOrder not confirmed | "{orderNo} must be confirmed before posting." |
| ⛔ Duplicate source | postSalesOrder same batch 2+ lines | "Split the source or remove the duplicate before posting." |
| ⛔ Cancel with picks | cancelSalesOrder actualQty > 0 | "Return picked units before cancelling." |

### Gaps & Open Items

- ✅ **Complete:** Full sales lifecycle with credit checks
- ✅ **Complete:** Floor price exception handling
- ✅ **Complete:** Customer sheet snapshot with cost/margin redaction
- ✅ **Complete:** Soft reservation display prevents double-selling
- ✅ **Complete:** DYN-H3 closed (logPayment auto-allocates)
- 🏴 **GAP:** Credit engine admin surfaces (stances, engineMax, per-customer disable) are internalOnlyCommands (#111)

### Handoffs

→ **Journey 5 (Fulfillment):** Posted orders generate pick lists
→ **Journey 6 (Payments/AR):** Posting creates invoice
→ **Journey 7 (Vendor Bills/AP):** Consignment sell-through triggers bills
→ **Journey 12 (Credit Review):** Posting queues credit engine recompute

---

## Journey 5: Fulfillment

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKeys** | `orders` (allocate), `fulfillment` (manage), `pick` (warehouse mobile) |
| **Files** | `OperationsViews.tsx` (orders/fulfillment), `PickView.tsx` (mobile pick) |
| **Actors** | `operator` (sales) allocates/releases; `operator` (warehouse workLoop) picks/packs; `manager` handles discrepancies |
| **Entry** | Sales order status = `'posted'` |
| **Exit** | Order `'fulfilled'`, pick list `'fulfilled'` |
| **Commands** | `allocateOrderToFulfillment`, `createPickList`, `releaseLineForPicking`, `releaseLinesForPicking`, `recordWeighAndPack`, `adjustFulfillmentLine`, `cancelFulfillmentLine`, `acknowledgeWarehouseAlert`, `returnPickedUnits`, `printLabels`, `markOrderFulfilled`, `recallLineFromPicking` |

### Pick View — UI Detail

From `PickView.tsx`:

**Mobile-optimized view** for warehouse operators on handheld devices. Shows:
- Pick queue grid with order/line details
- Per-line: batch code, product name, expected qty, actual qty/weight entry
- "Pack" button → `recordWeighAndPack`
- Label printing controls (4×6 and 2×1 formats)
- Alert indicators for recalls and discrepancies

### Fulfillment Lifecycle

**Step 1 — Allocate:**
- Command: `allocateOrderToFulfillment` (alias: `createPickList`)
- ⛔ GUARD: Order must be `'posted'` (not draft, not confirmed)
- ⛔ GUARD: Order not already allocated
- DB writes: `INSERT INTO pickLists` (status='open'), `INSERT INTO fulfillmentLines` (one per order line)
- State: `sales_orders.status` → `'fulfillment'`

**Step 2 — Release for Warehouse:**
- Commands: `releaseLineForPicking` (single) / `releaseLinesForPicking` (bulk)
- ⛔ GUARD: Line must have `batchId`, `qty > 0`, `batch.reservedQty >= line.qty`
- State: `fulfillmentLines.pickStatus`: `'unreleased'` → `'released'`
- `pickReleasedAt` timestamp set
- 🔁 SIDE EFFECT: `emitPickOrderAndQueue()` Socket.io event

**Step 3 — Pick (warehouse workLoop):**
- Warehouse operator sees released lines in pick view
- Line status: `'released'` → `'picking'`

**Step 4 — Weigh and Pack:**
- Command: `recordWeighAndPack` (alias: `adjustFulfillmentLine`)
- ⛔ GUARD: `actualQty > 0` ("Actual quantity must be greater than zero")
- ⛔ GUARD: `actualWeight > 0` ("Actual weight must be greater than zero")
- Sets `fulfillmentLines.actualQty` and `fulfillmentLines.actualWeight`
- Line status: `'picking'` → `'packed'`
- Discrepancy detected → surfaces via `fulfillmentLines.warehouseAlerts` (jsonb)

**Step 5 — Recall (if needed):**
- Command: `recallLineFromPicking`
- If `actualQty = 0` (unpicked): **DELETES the fulfillmentLine row entirely**
- If `actualQty > 0` (picked): Sets `statusExtended` → `'recall_pending'`, creates warehouse alert

**Step 6 — Return Picked Units:**
- Command: `returnPickedUnits`
- ⛔ GUARD: `qty ≤ actualQty` ("Cannot return more than picked")
- Restores `batches.availableQty`

**Step 7 — Mark Order Fulfilled:**
- Command: `markOrderFulfilled`
- ⛔ GUARD: All non-cancelled lines must have `actualQty > 0`
- State: `sales_orders.status` → `'fulfilled'`, `pickLists.status` → `'fulfilled'`
- Reversible

### Branch Scenarios

🔀 **B1 — Recall unpicked:** Deletes fulfillmentLine row, line back to `'unreleased'`
🔀 **B2 — Recall picked:** `statusExtended` → `'recall_pending'`, warehouse alert created
🔀 **B3 — Qty discrepancy:** Accepted at pack time; surfaces via warehouseAlerts
🔀 **B4 — Cancel fulfillment line:** `cancelFulfillmentLine` → `statusExtended` → `'cancelled'`
🔀 **B5 — Partial fulfillment:** Cancelled + packed lines both allowed at fulfill
🔀 **B6 — Label formats:** 4×6 and 2×1 options in `printLabels`
🔀 **B7 — Cancel order mid-fulfillment:** Cancelled lines get `line_cancelled` alert

### Pick List Statuses (actual DB values vs. derived display)

**DB values written:** Only `'open'` (at creation) and `'fulfilled'` (at markOrderFulfilled).

**UI display states** (computed in OperationsViews.tsx, NOT persisted):
- `'in_progress'` — some lines released/picking
- `'has_alerts'` — warehouse alerts present
- `'ready_to_close'` — all lines packed

### Gaps & Open Items

- 🏴 **GAP:** `releaseLineForPicking`, `releaseLinesForPicking`, `recallLineFromPicking`, `acknowledgeWarehouseAlert`, `returnPickedUnits`, `cancelFulfillmentLine` are in `pendingFrontendCommandNames` (CAP-030, PR #186)
- 🏴 **GAP:** `pickLists.status` display values (in_progress, has_alerts) are computed UI-side — there is no DB column backing them
- ✅ **Complete:** Full pack workflow with weigh, labels, alerts
- ✅ **Complete:** Recall flow handles both picked and unpicked lines
---

## Journey 6: Payments / Accounts Receivable

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `payments` |
| **Part of** | `OperationsViews.tsx` |
| **Actors** | `operator` (accounting) logs/allocates; `manager` unallocates/refunds/discounts |
| **Entry** | Posted invoice exists (`'open'` or `'partial'`). Customer sends payment. |
| **Exit** | Invoice `'paid'` and payment fully allocated, OR payment `'refunded'` |
| **Commands** | `logPayment`, `allocatePayment`, `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount`, `applyClientCredit`, `postTransactionLedgerRow`, `upsertTransactionType` |

### Step 1: Log Payment

**User Intent:**
A customer payment has arrived — cash, check, wire, or card. The accounting operator opens the Payments view to record it. They know which customer paid, the amount, and the payment method.

**UI State:**
- Cmd+K → "moneyIn" → opens Log Payment dialog
- Form fields: Customer (dropdown), Amount, Method (cash/check/card/crypto/wire), Allocation Intent (fifo/unapplied/selected_invoice), Optional: Bucket, Reference, Notes, Invoice selector

**Backend:**
- Command: `logPayment`
- ⛔ GUARD: `amount ≠ 0` ("Payment amount cannot be zero.")
- `amount < 0` → treated as "buyer credit" → immediately decrements `customer.balance`; no allocation needed
- `amount > 0` with `allocationIntent='fifo'` or `'selected_invoice'`:
  - 🔁 SIDE EFFECT: `allocatePayment` runs in SAME TRANSACTION (commandBus.ts:3697-3731)
  - If no open invoices → auto-allocation gracefully skipped, toast notification shown
  - Prior gap DYN-H3 / issue #26 is CLOSED
- `allocationIntent='unapplied'` → payment logged as unapplied balance; no invoice closed
- DB writes: `INSERT INTO payments` (status='posted')
- 🔁 SIDE EFFECT: Credit recompute queue insert
- Reversible: `reverseCommandById` restores customer balance

### Step 2: Manual Allocation

**User Intent:**
A payment was logged as unapplied, and now the operator needs to apply it to specific invoices.

**Command:** `allocatePayment`
- If `invoiceId` provided → allocates to specific invoice
- If not → FIFO to oldest open/partial invoices
- Updates `invoices.amountPaid` → `'partial'` or `'paid'`
- `payment.unappliedAmount` decreases
- `customer.balance` decremented
- DB CHECK: allocation amount must be > 0
- Reversible

### Step 3: Unallocate (correction needed)

**User Intent:**
The payment was allocated to the wrong invoice. The operator needs to undo the allocation.

**Command:** `unallocatePayment` (requires manager!)
- Reverses the `paymentAllocations` record
- `invoice.amountPaid` decremented, status reverts to `'open'` or `'partial'`
- `payment.unappliedAmount` restored

### Step 4: Refund

**User Intent:**
The payment must be returned to the customer — wrong amount, customer return, goodwill.

**Command:** `refundPayment` (requires manager!)
- ⛔ GUARD: Payment must be FULLY unallocated first (`unappliedAmount` must equal full payment amount)
- ⛔ GUARD: If any allocation exists → "Unallocate this payment before refunding."
- `payments.status` → `'refunded'`
- Terminal command

### Step 5: Early Payment Discount

**User Intent:**
Customer paid early and qualifies for a discount. The operator applies it before allocation.

**Command:** `applyEarlyPayDiscount` (requires manager!)
- ⛔ GUARD: Discount amount ≤ invoice's open balance
- ⛔ GUARD: "Discount amount exceeds open balance."

### Step 6: Client Credit

**User Intent:**
Non-payment credit adjustment needed — product quality issue, price correction.

**Command:** `applyClientCredit` (requires manager!)
- Applies credit directly to customer account
- Updates `customer.balance`, inserts `clientLedgerEntries`

### Branch Scenarios

🔀 **B1 — FIFO allocation:** System allocates to oldest open invoice first
🔀 **B2 — Selected invoice:** `invoiceId` and `allocationIntent='selected_invoice'`
🔀 **B3 — Auto-allocation graceful degradation:** No open invoices → skipped, toast shown
🔀 **B4 — Buyer credit (negative payment):** `logPayment` with amount < 0 → immediate balance reduction
🔀 **B5 — Refund blocked:** Must unallocate first → then refund

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Zero payment | logPayment amount=0 | "Payment amount cannot be zero." |
| ⛔ No unapplied | allocatePayment fully applied | "Payment has no unapplied amount." |
| ⛔ Refund allocated | refundPayment when allocated | "Unallocate this payment before refunding." |
| ⛔ Discount > balance | applyEarlyPayDiscount > openBalance | "Discount amount exceeds open balance." |
| DB | Allocation ≤ 0 | DB CHECK constraint on payment_allocations.amount |

### Gaps & Open Items

- ✅ **Complete:** Full payment lifecycle with auto-allocation (DYN-H3 closed)
- ✅ **Complete:** Buyer credit path (negative payment)

### Handoffs

→ **Journey 12 (Credit Review):** Payment events → credit_recompute_queue
→ **Journey 7 (Vendor Bills/AP):** AR position informs AP decisions

---

## Journey 7: Vendor Bills / Accounts Payable

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `vendors` |
| **Part of** | `OperationsViews.tsx` |
| **Actors** | `operator` creates/tracks; `manager` approves/schedules/records payments |
| **Entry** | Vendor bill exists (auto-created by intake posting or manual) |
| **Exit** | Bill `'paid'` or `'voided'` |
| **Commands** | `createVendor`, `createVendorBill`, `approveVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, `voidVendorPayment` |

### Lifecycle

**Step 1 — Bill Created:**
- Auto-creation: `postPurchaseReceipt` → `vendorBills` status='open'
- Manual: `createVendorBill` → status='open'

**Step 2 — Approve:**
- Command: `approveVendorBill` (requires manager!)
- State: `'open'` → `'approved'`

**Step 3 — Schedule:**
- Command: `scheduleVendorPayment` (requires manager!)
- Sets `scheduledFor` date
- State: `'approved'` → `'scheduled'`

**Step 4 — Record Payment:**
- Command: `recordVendorPayment` (requires manager!)
- ⛔ GUARD: Bill must be `'scheduled'` ("Schedule this vendor payment before recording.")
- ⛔ GUARD: `amount > 0` ("Vendor payout amount must be greater than zero.")
- ⛔ GUARD: Cumulative payments cannot exceed bill amount
- State: `'scheduled'` → `'paid'` (full) or `'partial'`
- 🔀 `overrideUnscheduled: true` → bypasses `'scheduled'` requirement
  - **No additional role gate** on override — any manager can pass it

**Step 5 — Void Payment:**
- Command: `voidVendorPayment` (requires manager!)
- `vendorPayments.status` → `'void'`
- Bill reverts to `'approved'` (needs re-scheduling)

### Consignment Trigger Chain

- `postSalesOrder` depletes consignment batch (`ownershipStatus='C'`)
- System finds oldest open vendor bill for vendor → `consignmentTriggered: true`
- Status advances: `'open'` → `'approved'` (auto)
- If no open bill → new bill created with status `'approved'`
- No operator action required

### Branch Scenarios

🔀 **B1 — Manual bill:** `createVendorBill` (not from intake) → status='open'
🔀 **B2 — Consignment trigger:** Fully automated — no operator action
🔀 **B3 — Override unscheduled:** `overrideUnscheduled: true` (manager)
🔀 **B4 — Partial payment:** Additional `recordVendorPayment` calls → status='partial'
🔀 **B5 — Prepayment:** `recordVendorPrepayment` (Journey 1) separate from bill payments

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Not scheduled | record without schedule or override | "Schedule this vendor payment before recording." |
| ⛔ Zero payment | record with amount ≤ 0 | "Vendor payout amount must be greater than zero." |
| ⛔ Exceeds balance | cumulative > bill amount | "Vendor payout cannot exceed the open bill balance." |

### Vendor Bill Statuses (actual DB values)

`'open'`, `'approved'`, `'scheduled'`, `'paid'`, `'partial'`, `'reversed'`, `'cancelled'`

NOT valid vendor bill statuses: `'created'` (never written), `'voided'` (that's on `vendorPayments`)

### Gaps & Open Items

- ✅ **Complete:** Full AP lifecycle with scheduling enforcement
- ✅ **Complete:** Consignment trigger chain
- ✅ **Complete:** `overrideUnscheduled` available for exceptional cases

### Handoffs

→ **Journey 8 (Closeout):** All AP must be resolved before period lock
→ **Journey 4 (Sales):** Consignment trigger feeds back from sales posting

---

## Journey 8: Closeout

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `closeout` |
| **Part of** | `OperationsViews.tsx` |
| **Actors** | `owner` locks/archives; `manager` reviews, posts adjustments |
| **Entry** | End of financial period |
| **Exit** | Period `'archived'` with control-total artifacts in `ARCHIVE_DIR` |
| **Commands** | `postPeriodAdjustments`, `createCorrectionJournalEntry`, `lockPeriod`, `archivePeriod` |

### Lifecycle

**Step 1 — Review:**
- Closeout view surfaces: `getCloseoutSafety` query → `unsafeRows` count, `eligible` boolean
- Unsafe row categories: draft/needs_fix batches, open POs, open pick lists, draft sales orders, failed unretried commands

**Step 2 — Adjustments:**
- `postPeriodAdjustments` → creates multiple correction journal entries
- `createCorrectionJournalEntry` → individual debit/credit adjustments

**Step 3 — Lock:**
- Command: `lockPeriod` (owner only!)
- ⛔ GUARD: `unsafeRows` must be 0 ("Period has open work.")
- DB write: `INSERT INTO period_locks` (status='locked')
- **Irreversible in the app** — no `unlockPeriod` command

**Step 4 — Archive:**
- Command: `archivePeriod` (owner only!)
- ⛔ GUARD: Lock must exist ("Period must be locked before archiving.")
- DB write: `INSERT INTO archive_runs` (status='archived')
- 🔁 SIDE EFFECT: Writes CSV, JSONL, PDF to `ARCHIVE_DIR`
- **Irreversible in the app**

### Branch Scenarios

🔀 **B1 — Draft batches:** Post or reject each outstanding batch
🔀 **B2 — Open POs:** Finalize/complete or cancel
🔀 **B3 — Open pick lists / draft orders:** Complete or cancel
🔀 **B4 — Failed commands:** Retry or `documentCommandFailure`

### Gaps & Open Items

- ✅ **Complete:** Full closeout lifecycle with safety checks
- 🏴 **GAP:** Lock and archive are irreversible — offline maintenance restore required for mistakes
---

## Journey 9: Recovery

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `recovery` |
| **File** | `RecoveryView.tsx` (tested — `RecoveryView.test.tsx`) |
| **Actors** | `manager`/`owner` reverse; `operator` searches/views; `viewer` reads |
| **Entry** | Command was executed incorrectly, command failed, or investigation needed |
| **Exit** | Erroneous state corrected; command journal reflects compensating entry |
| **Commands** | `reverseCommandById`, `documentCommandFailure`, `restoreFromBackupPoint`, `createCorrectionJournalEntry` |

### Recovery View — UI Detail

From `RecoveryView.test.tsx`:

- **Search Grid:** Filterable view of `commandJournal` entries
- Search by: entity ID, command name, actor, date range
- Each row shows: command name, actor, status (ok/failed), timestamp, affected IDs
- Expansion chevron → full snapshot diff

### Core Actions

**Reversal:**
- `restoreFromBackupPoint` — **READ-ONLY** preview (owner only)
  - Returns `beforeSnapshot` + `afterSnapshot` showing what reversal WOULD do
  - Never executes the restore
- `reverseCommandById` — executes compensating command (manager only)
  - ⛔ GUARD: Command must have `status='ok'` (not failed)
  - ⛔ GUARD: Command must not already be reversed (`reversedByCommandId` null)
  - Reversal logic is command-specific (hand-crafted inverse for each command type)
  - Creates new `commandJournal` entry with `reversedByCommandId` pointing to original
  - Only 60 of 135 commands are fully reversible (rest are terminal or offsettable)

**Reversal chain example (postSalesOrder → full unwind):**
```
1. unallocatePayment (all allocations on invoice)
2. reverseCommandById (postSalesOrder)
   → Restores availableQty to batches
   → Invoice status → 'reversed'
   → customer.balance restored
   → Reversing clientLedgerEntries posted
```

**Failed Command Handling:**
- Retry: Copy `inputPayload` from failed journal entry, submit with new `idempotencyKey`
  - ⚠️ Commands before migration `0002_workflow_gap_closure.sql` have no stored payload
- Document: `documentCommandFailure` → adds reason/note; unblocks closeout

**Correction Journal Entry:**
- `createCorrectionJournalEntry` → manual debit/credit for ledger corrections
- Used when no existing command reversal matches the needed adjustment

### Branch Scenarios

🔀 **B1 — Reverse postSalesOrder:** Must unallocate payments first ⛔
🔀 **B2 — Retry failed command:** New idempotencyKey, same payload
🔀 **B3 — Document failure:** No retry possible → explicitly acknowledge
🔀 **B4 — Manual correction:** `createCorrectionJournalEntry` for non-command corrections
🔀 **B5 — Multi-reversal chain:** Reverse in reverse chronological order
🔀 **B6 — Terminal command:** ⛔ reverseCommandById throws — use correction entry or offline restore

### Reversal Policy Summary (from commandCatalog.ts)

| Disposition | Count | Meaning |
|-------------|-------|---------|
| `'reversible'` | 60 | Full undo via `reverseCommandById` |
| `'offsettable'` | 28 | Compensate with another command (manual offset entry, opposite adjustment) |
| `'terminal'` | 47 | Cannot be reversed; requires new operation or correction |
| **Total** | **135** | |

### Gaps & Open Items

- 🏴 **GAP:** Commands pre-migration `0002` have no `inputPayload` — retry impossible
- ✅ **Complete:** Full reversal chain for all reversible commands
- ✅ **Complete:** Read-only restore preview (restoreFromBackupPoint)
- ✅ **Complete:** Support packet export

### Handoffs

→ **Journey 8 (Closeout):** Failed commands must be resolved before period lock
← **All journeys:** Recovery can touch any command in the system

---

## Journey 10: Matchmaking

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `matchmaking` |
| **File** | `MatchmakingView.tsx` |
| **Actors** | `operator` (sales) creates needs/supplies + works match queue; `manager` reviews |
| **Entry** | Customer has product need OR vendor has supply to offer |
| **Exit** | Match accepted → PO created (Journey 1) and sales order (Journey 4), OR dismissed/closed |
| **Commands** | `createCustomerNeed`, `updateCustomerNeed`, `createVendorSupply`, `updateVendorSupply`, `acceptMatchmakingMatch`, `dismissMatchmakingMatch`, `reopenMatchmakingMatch`, `updateMatchmakingSettings`, `noteMatchmakingOutreach`, `dismissMatchmakingWorkQueueItem` |

### Matchmaking View — UI Detail

From `MatchmakingView.tsx`:

- **Triple grid layout:** Customer Needs | Matches | Vendor Supply
- **"To Move" grid:** Inventory that should be sold (proactive suggestion)
- **"To Source" grid:** Customer order patterns suggesting new needs
- **Status lifecycle enforced server-side:**
  - Needs: `open → matched | closed` (commandBus.ts:5197-5224)
  - Supply: `open → held_for_match | closed`

### Lifecycle

**Step 1 — Create Need/Supply:**
- `createCustomerNeed`: customerId, productName, category, qtyMin → status='open'
- `createVendorSupply`: vendorId, productName, category, qty → status='open'

**Step 2 — Match Engine Suggests Pairings:**
- Matchmaking engine pairs needs to supply
- Tag-triggered recalculation: `applyTags` on need/supply → `rebuildMatchesForNeed` / `rebuildMatchesForSupply`

**Step 3 — Accept or Dismiss:**
- `acceptMatchmakingMatch` → status='accepted' → operator creates PO + sales order
- `dismissMatchmakingMatch` → status='dismissed'

**Step 4 — Outreach:**
- `noteMatchmakingOutreach` — records that contact was made

**Step 5 — Snooze:**
- `dismissMatchmakingWorkQueueItem` → snoozes 30 days

### Branch Scenarios

🔀 **B1 — Reopen dismissed:** `reopenMatchmakingMatch` → status='open'
🔀 **B2 — Snooze:** 30-day auto-return to queue
🔀 **B3 — Tag recalculation:** Automatic on tag changes
🔀 **B4 — No matches:** Item stays in queue; operator notes outreach and waits
🔀 **B5 — Update need/supply:** `updateCustomerNeed` / `updateVendorSupply` → may trigger recalculation

### Gaps & Open Items

- ✅ **Complete:** Status lifecycle enforced server-side (DYN-H4 / #27 closed)
- ✅ **Complete:** Tag-triggered match recalculation
- 🏴 **GAP:** Matchmaking engine is suggestion-only — accepted match does NOT auto-create PO

### Handoffs

→ **Journey 1 (Purchase Orders):** Accepted match → operator creates PO
→ **Journey 4 (Sales Orders):** Accepted match → operator creates sales order

---

## Journey 11: Connectors / Processors

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `connectors` / `processors` |
| **Part of** | `OperationsViews.tsx` / `ProcessorsView.tsx` |
| **Actors** | External system submits; `operator`/`manager` reviews; `manager`/`owner` configures |
| **Entry** | External integration submits request, OR processor needs configuration |
| **Exit** | Request approved (ledger mutated) or rejected (no mutation) |
| **Commands** | `approveConnectorRequest`, `rejectConnectorRequest`, `routeConnectorRequest`, `createPaymentProcessor`, `markUserFeeCollected`, `updateProcessorFeeStatus` |

### Key Principle

**External systems NEVER directly mutate ledgers.** Every connector request goes through operator review queue first. Default status on arrival: `'open'` (schema default, not `'pending'`).

### Lifecycle

**Request Review:**
1. External request arrives → `connectorRequests` queue, status='open'
2. Operator reviews → three outcomes:
   - `approveConnectorRequest` → status='approved', internal command executed, ledger mutated
   - `rejectConnectorRequest` → status='rejected', operator notes, no mutation
   - `routeConnectorRequest` → "Reassign inbound request" button (in OperationsViews.tsx:2463)

**Processor Setup:**
- `createPaymentProcessor` (manager): name, fee type, fee amounts, user/processor split
- ⛔ GUARD: Splits must sum to 100% ("User split and processor split must add up to 100%")
- Fee tracking: `markUserFeeCollected`, `updateProcessorFeeStatus`

### Gaps & Open Items

- 🏴 **GAP:** `routeConnectorRequest` is in `internalOnlyCommandNames` but HAS a UI surface (Reassign button)
- ✅ **Complete:** Review queue with full approve/reject/routing
- ✅ **Complete:** Review history persisted for all outcomes

---

## Journey 12: Credit Review

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `credit-review` |
| **File** | `CreditReviewView.tsx` (also `CreditReviewView.creditOps.test.tsx`) |
| **Actors** | `manager` manages limits/stances; `owner` disables engine, bulk reverts |
| **Entry** | Customer credit limit needs review |
| **Exit** | Customer has correct active limit (manual or engine-managed) |
| **Commands** | `setCustomerCreditLimit`, `revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder`, `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `enableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `setCreditEngineConfig`, `bulkRevertCustomersToEngine` |

### Credit Review View — UI Detail

From `CreditReviewView.tsx`:

- **Tabs:** All customers | Engine-managed | Manual | Stale manual | Engine disabled
- **Grid columns:** Customer name, Credit Limit Source, Current Limit, Balance, Engine Recommendation, Stale indicator
- **Actions per row:** Set manual limit, Revert to engine, Snooze reminder, Set stance (backend-only today)
- Full view gated to `isManagerOrOwner`

### Lifecycle

**Manual Limit Management:**
- `setCustomerCreditLimit`: amount ≥ 0, reason ≥ 4 chars → `creditLimitSource='manual'`
- `revertCustomerCreditToEngine` → `creditLimitSource='engine'`
- `snoozeCustomerCreditReminder` → snooze 60 days, no limit change

**Engine Control:**
- `disableCreditEngineForCustomer` (owner only) → `engineEnabled=false`
- `enableCreditEngineForCustomer` (owner only) → `engineEnabled=true`
- `setCustomerEngineMax` (manager) → caps engine recommendation
- `setCustomerStance` (manager) → assigns scoring profile

**Stance Management:**
- `createCreditEngineStance` (owner only) → weights must sum to 100 (DB CHECK)
- `updateCreditEngineStance` (owner)
- `deleteCreditEngineStance` (owner) — only when unused

**Bulk Actions:**
- `bulkRevertCustomersToEngine` (owner only) → all eligible manual-limit customers

**Global Config:**
- `setCreditEngineConfig` (owner only) → append-only history in `credit_engine_config_history`

**Shadow Mode:**
- Engine runs without applying results to `customers.creditLimit`
- For testing new parameters
- Exact UI surface → verify in `CreditReviewView.tsx`

### Gaps & Open Items

- 🏴 **GAP (Issue #111):** 6 commands have no UI surface: `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`
- 🏴 **GAP:** `bulkRevertCustomersToEngine` backend exists; not wired to UI
- 🏴 **GAP:** Shadow mode surface needs verification
- ✅ **Complete:** Credit engine recompute queue triggers on sales/payment events
- ✅ **Complete:** Manual limit management fully surfaced

### Handoffs

→ **Journey 4 (Sales):** Credit limits enforced at confirm and post
← **Journey 6 (Payments/AR):** Payment events trigger recomputation

---

## Journey 13: Photography / Media

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKey** | `photography` |
| **File** | `MediaView.tsx` (tested: `MediaView.test.tsx`) |
| **Actors** | `operator` (photographer) uploads/publishes; `operator` (sales) checks `mediaStatus` |
| **Entry** | Posted batch with `mediaStatus='open'` (no media) or `'ready'` (uploaded not published) |
| **Exit** | Batch `mediaStatus='done'` with at least one published primary photo |
| **Commands** | `mintPhotoUploadToken`, `revokePhotoUploadToken`, `uploadBatchMedia`, `setBatchMediaRole`, `publishBatchMedia`, `deleteBatchMedia`, `attachBatchPhoto` (legacy) |

### Media View — UI Detail

From `MediaView.tsx`:

- **Photography Queue Grid:** Batches filtered by `mediaStatus='open'` or `'ready'`
- **Token management:** Mint upload tokens (1–1440 minute TTL), revoke unused tokens
- **Media gallery:** Per-batch photos/videos with role badges and publish controls

### Lifecycle

**Step 1 — Mint Token:**
- `mintPhotoUploadToken` (manager only!)
- ⛔ GUARD: `ttlMinutes` must be 1–1440 ("ttlMinutes must be a positive integer" / "must be <= 24 hours")
- Token returned ONCE ONLY in command result — REDACTED from command journal (security)

**Step 2 — Upload:**
- `uploadBatchMedia` — creates `batchMedia` row, status='draft'
- ⛔ GUARD: `mediaType` must be `'photo'` or `'video'`

**Step 3 — Set Role:**
- `setBatchMediaRole` — primary_photo / primary_video / additional
- ⛔ GUARD: Only one active published primary per type per batch (DB unique index)

**Step 4 — Publish:**
- `publishBatchMedia` — `batchMedia.status` → `'published'`, `publishedAt` set
- 🏴 **GAP:** Does NOT update `batches.mediaStatus` — only legacy `attachBatchPhoto` does

**Step 5 — Delete:**
- `deleteBatchMedia` — deletes DB row + best-effort file deletion
- If primary deleted → may revert `mediaStatus` to `'ready'`/`'open'`

### Branch Scenarios

🔀 **B1 — Revoke token:** `revokePhotoUploadToken` → sets `revokedAt`
🔀 **B2 — Delete wrong photo:** `deleteBatchMedia` → re-upload
🔀 **B3 — Replace primary:** Demote old primary to `'additional'` → set new as `'primary_photo'`
🔀 **B4 — Video primary:** `mediaType='video'`, `role='primary_video'` — separate index from photo
🔀 **B5 — Expired token:** Upload fails; re-mint token

### Error States

| Error | Trigger | Message |
|-------|---------|---------|
| ⛔ Invalid TTL | ttlMinutes ≤ 0 | "ttlMinutes must be a positive integer." |
| ⛔ TTL too long | ttlMinutes > 1440 | "ttlMinutes must be <= 24 hours." |
| ⛔ Invalid type | mediaType not photo/video | "mediaType must be one of: photo, video." |
| ⛔ Invalid role | unrecognized role | "role must be one of: primary_photo, primary_video, additional." |
| ⛔ Duplicate primary | second primary on batch | "Another media row is already the primary..." |
| ⛔ Publish non-draft | published or missing item | "Batch media not found or not in draft status." |

### Gaps & Open Items

- 🏴 **GAP:** `publishBatchMedia` does NOT update `batches.mediaStatus` — operators must do it separately or use legacy `attachBatchPhoto`
- ✅ **Complete:** Full upload → role → publish → delete lifecycle
- ✅ **Complete:** Token security (once-only return, redacted from journal)

### Handoffs

→ **Journey 3 (Inventory):** `mediaStatus='done'` signals catalog-ready
→ **Journey 4 (Sales):** Sales uses `mediaStatus` for customer sheets
---

## Journey 14: Contacts and Appointments

### Journey Overview

| Field | Value |
|-------|-------|
| **ViewKeys** | `contacts`, `contacts-customer-orders` |
| **File** | `ContactsView.tsx` |
| **Actors** | `operator` creates contacts/appointments; `manager` archives/links; `owner` links to users |
| **Entry** | New person/business to track, OR contact needs appointment |
| **Exit** | Contact record with correct roles and entities. Appointments scheduled/completed/cancelled. |
| **Commands** | `createContact`, `updateContact`, `archiveContact`, `addContactRole`, `linkContactToExistingEntity`, `linkContactToUser`, `createAppointment`, `updateAppointment`, `cancelAppointment`, `completeAppointment` |

### Contacts View — UI Detail

From `ContactsView.tsx`:

- Universal contact grid with `contactKind` ('individual'/'business'), name, email, phone
- Role assignment: customer, vendor, referee, processor
- Entity linking: connect contact to existing customer/vendor/referee
- Appointments sub-grid per contact

### Lifecycle

**Contact Creation:**
- `createContact` → contactKind, name, email, phone → no roles yet
- `addContactRole` (manager!) → link to customer/vendor/referee/processor entity
- `linkContactToExistingEntity` (manager!) → connect to migrated records
- `linkContactToUser` (owner only!) → link to system user account

**Archive:**
- `archiveContact` (manager!)
- ⛔ GUARD: Customer has open/partial invoices
- ⛔ GUARD: Vendor has unpaid bills
- ⛔ GUARD: Referee has active relationships
- ⛔ GUARD: Processor has uncollected fees
- ⛔ GUARD: Already archived

**Appointments:**
- Lifecycle: `createAppointment` → `'scheduled'` → `completeAppointment` → `'completed'`
- Side exit: `cancelAppointment` → `'cancelled'`
- ⛔ GUARD: "Only scheduled appointments can be updated."
- ⛔ GUARD: "Cannot cancel a completed appointment."
- ⛔ GUARD: "Cannot complete a cancelled appointment."

### Branch Scenarios

🔀 **B1 — Archive blocked:** Specific blocker message for each open obligation type
🔀 **B2 — Deduplication (planned):** `contact_merge_candidates` table exists; merge UI NOT built

### Gaps & Open Items

- 🏴 **GAP:** Frontend wiring is `pendingFrontendCommandNames` (CAP-033 / TER-1564, Phase 1)
- 🏴 **GAP:** Contact merge/deduplicate UI not built (TODO in ContactsView.tsx)
- 🏴 **GAP:** Appointments frontend not yet surfaced
- ✅ **Complete:** Backend handlers for all 10 contact/appointment commands
- ✅ **Complete:** Archive guards for open obligations

---

## Cross-Journey Dependencies

| From Journey | To Journey | Mechanism |
|-------------|-----------|-----------|
| 1 (PO) → 2 (Intake) | `approvePurchaseOrder` auto-creates draft batches |
| 2 (Intake) → 7 (Vendor Bills) | `postPurchaseReceipt` auto-creates vendor bills |
| 2 (Intake) → 3 (Inventory) | Posted batches → live inventory |
| 4 (Sales) → 7 (Vendor Bills) | `postSalesOrder` triggers consignment bills |
| 4 (Sales) → 5 (Fulfillment) | Posted orders enter fulfillment |
| 4 (Sales) → 6 (Payments) | Posting creates invoices |
| 4 (Sales) → 12 (Credit Review) | Posting → `credit_recompute_queue` insert |
| 5 (Fulfillment) → 3 (Inventory) | `returnPickedUnits` restores qty |
| 6 (Payments) → 12 (Credit Review) | Payment events → recompute queue |
| 9 (Recovery) → All | Reversals can unwind any command |
| 10 (Matchmaking) → 1 (PO) | Accepted match → PO creation |
| 10 (Matchmaking) → 4 (Sales) | Accepted match → Sales order |
| 11 (Connectors) → Any | Approved request → internal command |
| 12 (Credit Review) → 4 (Sales) | Credit limits enforced at confirm/post |
| 13 (Photography) → 4 (Sales) | `mediaStatus='done'` → customer sheet |

---

## Gap Inventory (Complete)

### Known Gaps — Active

| Gap | Journey | Tracking | Description |
|-----|---------|----------|-------------|
| publishBatchMedia → mediaStatus | J13 | — | Modern upload+publish flow doesn't update `batches.mediaStatus`; only legacy `attachBatchPhoto` does |
| Contact merge UI | J14 | TODO in ContactsView.tsx | Merge/deduplicate workflow not built |
| Credit engine admin surfaces | J12 | Issue #111 | 6 internalOnlyCommands (stances, engineMax, per-customer disable) — no UI |
| bulkRevertCustomersToEngine | J12 | Issue #111 | Backend exists; not wired to UI |
| CAP-030 frontend (PR #186) | J5 | pendingFrontend | releaseLineForPicking, recallLine, acknowledgeAlert, returnPicked, cancelFulfillmentLine |
| TER-1564 / CAP-033 frontend | J14 | pendingFrontend | All contacts/appointment commands — backend complete, UI pending |
| Pre-migration command retry | J9 | Migration gap | Commands before `0002_workflow_gap_closure.sql` have no stored `inputPayload` |
| PO reversal leaves orphan batches | J1 | Reversal gap | `approvePurchaseOrder` reversal doesn't clean up auto-created intake batches |
| pickLists.status derived values | J5 | Schema gap | `in_progress`, `has_alerts`, `ready_to_close` are UI-computed, not DB columns |
| Shadow mode surface | J12 | Verify needed | Exact UI surface needs verification in CreditReviewView.tsx |

### Recently Closed

| Gap | Status | Evidence |
|-----|--------|----------|
| DYN-H3 / #26 — Payments FIFO auto-allocation | ✅ Closed | logPayment auto-executes allocatePayment in same transaction |
| DYN-H4 / #27 — Matchmaking status lifecycle | ✅ Closed | assertValidNeedStatusTransition / assertValidSupplyStatusTransition enforced |

### Phase 7 (Planned, Not Started)

| Item | Description |
|------|-------------|
| Keyboard sweep | All core journeys completable keyboard-first |
| Focus / drawer persistence | Operators expand/minimize context without losing place |
| Vocabulary / drift audit | Vocab-clean copy, no drift from design system |
| Deployment packaging | Self-hosted production build, environment hardening |

---

## Journey Completion Status

| # | Journey | Status | Open Items |
|---|---------|--------|------------|
| 1 | Purchase Order | ✅ Complete | Orphan batch cleanup on reversal |
| 2 | Intake / Receiving | ✅ Complete | — |
| 3 | Inventory Management | ✅ Complete | mediaStatus update gap |
| 4 | Sales Order | ✅ Complete | — |
| 5 | Fulfillment | 🔄 Partial | CAP-030 frontend pending (PR #186) |
| 6 | Payments / AR | ✅ Complete | DYN-H3 closed |
| 7 | Vendor Bills / AP | ✅ Complete | — |
| 8 | Closeout | ✅ Complete | Lock/archive irreversible |
| 9 | Recovery | ✅ Complete | Pre-migration retry gap |
| 10 | Matchmaking | ✅ Complete | DYN-H4 closed |
| 11 | Connectors / Processors | ✅ Complete | — |
| 12 | Credit Review | 🔄 Partial | Issue #111 (6 admin surfaces missing) |
| 13 | Photography / Media | ✅ Complete | mediaStatus gap |
| 14 | Contacts / Appointments | 🔄 Partial | Frontend pending (CAP-033) |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Journeys | 14 |
| Total commands | 135 |
| Reversible commands | 60 |
| Offsettible commands | 28 |
| Terminal commands | 47 |
| RBAC levels: viewer | 1 |
| RBAC levels: operator | ~90 commands |
| RBAC levels: manager | ~35 additional commands |
| RBAC levels: owner | ~10 exclusive commands |
| Error states documented | 60+ |
| Branch scenarios | 86+ |
| Cross-journey dependencies | 15 |
| Known active gaps | 10 |

---

## Command-Level RBAC Summary

**Manager-elevated commands (require `manager` not `operator`):**
`approvePurchaseOrder`, `cancelPurchaseOrder`, `recordVendorPrepayment`, `deleteBatch`, `adjustBatchQuantity`, `setInventoryStatus`, `transferInventoryOwnership`, `cancelSalesOrder`, `applyClientCredit`, `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount`, `postTransactionLedgerRow`, `upsertTransactionType`, `approveVendorBill`, `scheduleVendorPayment`, `recordVendorPayment`, `voidVendorPayment`, `createCorrectionJournalEntry`, `reverseCommandById`, `documentCommandFailure`, `repriceOrder`, `reopenMatchmakingMatch`, `updateMatchmakingSettings`, `setItemAlias`, `createReferee` (+referee commands), `createPaymentProcessor` (+processor commands), `setCustomerCreditLimit`, `revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder`, `setCustomerEngineMax`, `setCustomerStance`, `mintPhotoUploadToken`, `revokePhotoUploadToken`, `resolveVendorApproval`, `setCustomerPricingRule`, `setDefaultPricingRule`, `archiveContact`, `addContactRole`, `linkContactToExistingEntity`

**Owner-exclusive commands:**
`restoreFromBackupPoint`, `postPeriodAdjustments`, `lockPeriod`, `archivePeriod`, `disableCreditEngineForCustomer`, `enableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `setCreditEngineConfig`, `bulkRevertCustomersToEngine`, `linkContactToUser`, `updateProcessor`

---

## Reversal Policy Reference (Complete)

For the full 135-command reversal disposition matrix, see `src/shared/commandCatalog.ts:470-602`.

**Key terminal commands (irreversible in app):**
`createPurchaseOrder`, `cancelPurchaseOrder`, `createSalesOrder`, `cancelSalesOrder`, `lockPeriod`, `archivePeriod`, `restoreFromBackupPoint`, `reverseCommandById`, `documentCommandFailure`, `refundPayment`, `deleteCreditEngineStance`, `bulkRevertCustomersToEngine`, `archiveContact`, `completeAppointment`, `acknowledgeWarehouseAlert`, `cancelFulfillmentLine`, `printLabels` (offsettable), `createPaymentProcessor`, `createVendor`, `setVendorPricingRule` (offsettable)

**Key reversible commands (full undo via reverseCommandById):**
`postPurchaseReceipt`, `finalizePurchaseOrder`, `unfinalizePurchaseOrder`, `approvePurchaseOrder`, `receivePurchaseOrder`, `recordVendorPrepayment`, `verifyAllIntake`, `setInventoryStatus`, `transferInventoryLocation`, `transferInventoryOwnership`, `postSalesOrder`, `logPayment`, `allocatePayment`, `createVendorBill`, `recordVendorPayment`, `markOrderFulfilled`, `approveConnectorRequest`, `routeConnectorRequest`, `createCorrectionJournalEntry`, `postPeriodAdjustments`, `reopenMatchmakingMatch`, `setItemAlias`, `voidRefereeCredit`, `markUserFeeCollected`, `setCustomerCreditLimit`, `revertCustomerCreditToEngine`, `snoozeCustomerCreditReminder`, `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `enableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `setCreditEngineConfig`, `setLineLandedCost`, `setCustomerPricingRule`, `setDefaultPricingRule`, `mintPhotoUploadToken`, `setLineBelowFloorReason`, `resolveVendorApproval`, `releaseLineForPicking`, `releaseLinesForPicking`, `createAppointment`

---

_End of TERP Operator Unified Customer Journey Map_

---

# Part 2: System Components & Deep Mechanics

## A. Pricing Engine Deep Dive

### Resolution Chain (7 levels)

The pricing engine in `src/shared/inventoryPricingShared.ts` resolves the correct pricing rule for a sale line through a 7-level hierarchy:

```
1. Customer subcategory rule     (highest priority)
2. Customer category rule        
3. Customer default              
4. Settings subcategory rule     
5. Settings category rule        
6. Settings default              
7. Fallback 30% markup           (lowest priority)
```

Each level in `resolvePricingRuleEntry()` applies only when the previous level yielded no match. The result carries a `source` field identifying which level matched.

### Fixed-COGS vs Range-COGS Batches

**Fixed-COGS batches** (`unitCost > 0`, no `priceRange`):
- COGS is the primary input
- `applyPricingRule(landedCost, rule)`: dollar basis = `landedCost + rule.amount`, percent basis = `landedCost × (1 + rule.amount)`
- Example: COGS=$100, rule=30% → price=$130, markup=$30, markup%=30%

**Range-COGS batches** (have `priceRange` low–high):
- Price is the primary input (not COGS — COGS is determined AFTER price)
- `markupDollarsFromPrice(price, rule)`: `price × (rule% / (1 + rule%))`
- Derived: COGS = price − markup$, markup% = markup$ / COGS = rule%
- Example: price=$130, rule=30% → markup=$30, COGS=$100, markup%=30% ✓

### Pricing Profiles

From `src/server/services/pricing.ts`:

| Profile | minMarginPct | maxDiscountPct | Trigger |
|---------|-------------|----------------|---------|
| `standard` | 20% | 15% | Default |
| `premium` | 28% | 8% | Strategy = 'premium' OR customer has 'premium' tag |
| `clearance` | 8% | 25% | Strategy = 'clearance' OR customer has 'value' tag |

### Price Evaluation Guardrails

`evaluatePrice(input)` enforces three guardrails:
1. `vendor_floor` — can't price below unitCost
2. `min_margin` — must meet minimum margin percentage
3. `max_discount` — can't discount beyond maximum from basis price

The `minimumUnitPrice` = max(vendorFloor, marginFloor, discountFloor). The `unitPrice` = max(candidate, minimumUnitPrice).

### CategoryPricingEntry Structure

```
CategoryPricingEntry {
  rule?: PricingRuleEntry           // applies when category matches, no subcategory match
  subcategories?: {                 // subcategory → rule mapping
    "indoor": { basis: "percent", amount: 0.35 },
    "outdoor": { basis: "percent", amount: 0.25 }
  }
}
```

Depth is intentionally two levels (category → subcategory). No deeper nesting.

### Old → New Shape Migration

`resolvePricingRuleEntry` transparently upgrades old flat shape `{ basis, amount }` stored directly in categories to the new nested `{ rule: { basis, amount } }` CategoryPricingEntry shape. This means historical customer pricing rules stored in the old format still resolve correctly.

### UI Components

- **PricingPanel.tsx**: Per-customer pricing rule editor. Reads customer's current rule via `relationship.data?.customer?.pricingRule`. Saves via `setCustomerPricingRule`. Shows category/subcategory tree with editable rule entries.
- **DefaultPricingPanel.tsx**: System-wide default pricing rule editor. Saves via `setDefaultPricingRule`. Same category/subcategory tree structure.
- **RelationshipDrawer.tsx**: Surfaces customer pricing rule in the context drawer when viewing a customer relationship.
- **SalesView.tsx**: Shows suggested price per line based on resolved pricing rule. COGS/Margin columns toggle via `showMargin`.

---

## B. Cost Exception System

### Landed Cost Basis

From `src/shared/saleLineCostExceptions.ts`:

| Basis | Meaning | Who Can Use |
|-------|---------|-------------|
| `fixed` | Exact landed cost from intake | Any operator |
| `pick-low` | Use low end of cost range | Any operator |
| `pick-mid` | Use midpoint of cost range | Any operator |
| `pick-high` | Use high end of cost range | Any operator |
| `manual` | Operator-entered value within range | Any operator |
| `override` | Value outside range | Manager/owner only, requires reason |

### Below-Floor Reason Flow

When unit price falls below the floor price, operator must record one of:

| Reason | Meaning | Requires Vendor Approval? | Posts Exception Entry? |
|--------|---------|---------------------------|----------------------|
| `keep_margin` | Acceptable margin despite being below floor | No | No |
| `renegotiate` | Will renegotiate with vendor | No | No |
| `waive_margin` | Deliberately waiving margin | No | Yes (marginWaivedTotal) |
| `take_loss` | Selling at a loss | No | Yes (lossRecognizedTotal) |
| `vendor_approval_pending` | Awaiting vendor sign-off | Yes | No (until resolved) |

### Exception Totals at Post Time

`computeOrderExceptionTotals()` calculates:
- **marginWaivedTotal**: Σ (priceFloor − unitPrice) × qty for `waive_margin` lines
- **lossRecognizedTotal**: Σ (unitCost − unitPrice) × qty for `take_loss` lines (only when selling below COST)
- **vendorApprovalPending**: true if ANY line has `vendor_approval_state = 'pending'`

At `postSalesOrder`, one `correctionJournalEntries` row is inserted per exception line. The variance = max(0, (priceFloor − unitPrice) × qty). For `vendor_approval_pending` lines, a note is appended to the vendor's open bill `discrepancyNotes` (text-only, not reversed on `postSalesOrder` reversal).

### Confirm/Post Blockers

`canConfirmOrPost()` returns the blocking reason (or null if clear) in priority order:
1. `cogs_unresolved` — range batch line never had landed COGS picked
2. `vendor_approval_pending` — vendor approval still pending
3. `vendor_approval_declined` — vendor declined; must reprice or re-request
4. `below_floor_reason_missing` — price below floor, no reason recorded

### UI Components

- **SaleLineExceptionControls.tsx**: Renders the below-floor reason picker + vendor approval controls per line. Shows projected exception state.
- **LandedCostExceptionChip.tsx**: Renders a chip (amber warning pill) in the Sales grid "COGS exception" column. Uses `projectLandedCostException` projection over the latest `setLineLandedCost` command journal entry. Hidden when `showMargin` is false.
- **LANDED_COST_EXCEPTION_REASON_LABELS**: Shared vocabulary for the exception chip and the picker.

---

## C. Sales Sheet System

### Two Modes

From `src/shared/customerSheetSnapshot.ts`:

| Mode | Who Sees It | Fields Included |
|------|------------|-----------------|
| `catalog` | Customer | batchId, batchCode, name, itemAlias, displayName, category, vendor, availableQty, unitPrice, tags |
| `internal` | Operator | All catalog fields + unitCost, estimatedMargin, reason |

### Security Architecture (3 layers)

1. **Write-time sanitization**: `buildCustomerSheetSnapshotRows()` strips non-allowlisted fields before persistence. Only fields in CATALOG_FIELDS or INTERNAL_FIELDS survive.
2. **Read-time privacy**: `getViewerSafeSnapshot()` returns null when a `viewer`-role user requests an `internal` snapshot. Re-runs `buildCustomerSheetSnapshotRows()` on the way out so even historically-polluted stored JSON can't leak cost/margin.
3. **Journal redaction**: `redactCustomerSheetSnapshotJournalPayload()` drops the entire `rows` array from the command journal payload. Contains only: customerId, mode, itemCount, notes, rowsHash (hash digest for idempotency).

### Recent Sheets Panel

From `RecentSheetsPanel.tsx`:
- Surfaces past customer sheet snapshots via `trpc.queries.customerSheetSnapshotById`
- "Add back to draft" button → re-resolves items against live inventory and adds them to the current draft sales order
- Uses batchId from snapshot to find current batch state

### CSV Export (catalog mode)

Sales CSV export hides cost/margin fields in catalog mode — mirrors the on-screen `showMargin` toggle and the snapshot field allowlist.

---

## D. Tag System

From `src/shared/tags.ts`:

### Tag Normalization

`normalizeTagSlug(value)`:
- Trims whitespace
- Lowercases
- Replaces `&` with ` and `
- Replaces all non-alphanumeric characters with `-`
- Strips leading/trailing dashes
- Truncates to 80 characters

### Tag Parsing

`parseTagInput(value)`:
- Accepts: array of strings, pipe-delimited string, comma-delimited string
- Normalizes each tag via `normalizeTagSlug`
- Deduplicates (Set)
- Filters out empty strings

### Tag Applications

The `applyTags` command supports three modes:
- **Add**: appends tags to existing set (deduplication applied)
- **Remove**: removes specified tags
- **Replace**: replaces entire tag set

### Cross-system Impact

- Tags on `customerNeed` or `vendorSupply` → triggers automatic match recalculation via `rebuildMatchesForNeed` / `rebuildMatchesForSupply`
- `customerTags` influence pricing profile selection: `'premium'` → premium profile, `'value'` → clearance profile
- Tags on batches are filterable via array operators in the advanced filter system

---

## E. Advanced Filter System

### Filter Fields

From `src/shared/filterSchemas.ts`:

| Field | Type | SQL Source | Operators |
|-------|------|-----------|-----------|
| `category` | text | `b.category` | equals, not_equals, contains, not_contains, starts_with, ends_with, is_null, is_not_null |
| `subcategory` | text | `b.subcategory` | (same text operators) |
| `location` | text | `b.location` | (same) |
| `status` | text | `b.status` | (same) |
| `brandId` | uuid | `b.brand_id` | equals, not_equals, in, not_in |
| `vendorId` | uuid | `b.vendor_id` | equals, not_equals, in, not_in |
| `unitPrice` | number | `b.unit_price` | equals, not_equals, >, <, >=, <=, between |
| `unitCost` | number | `b.unit_cost` | (same numeric operators) |
| `availableQty` | number | `b.available_qty` | (same) |
| `intakeDate` | date | `b.intake_date` | equals, before, after, between |
| `ageDays` | number (computed) | `DATE_PART('day', NOW() - b.intake_date)::integer` | (same numeric) |
| `tags` | array | `b.tags` | array_contains, array_not_contains, array_contains_all |
| `ownershipStatus` | text | `b.ownership_status` | (same text operators) |

### Filter Groups (recursive)

Filters can be nested into groups:
- Logic: `AND` or `OR`
- Max depth: 5 levels
- Max conditions per group: 50
- Supports mixing field-level conditions with sub-groups

### Saved Filters

`SavedFilterInput` schema:
- `name`: 1–120 characters
- `description`: up to 500 characters (optional)
- `targetView`: inventory, items, purchase_orders, sales_orders, matchmaking, or all
- `filterDefinition`: FilterGroup
- `isGlobal`: boolean (default false)
- Persisted via `trpc.filters.saveFilter`

### UI Components

- **AdvancedFilterBuilder.tsx**: Two-step dropdown — pick a field (grouped: Product, Qty & Price, Date & Age, Status) → enter value (operator selector + field-specific input)
- **SavedFiltersDropdown.tsx**: Load saved presets
- **SavedFiltersManager.tsx**: Name, save, delete saved filters
- **OperatorGrid.tsx**: Filter bar with removable pills + "Add filter" button + "Save current" presets strip

---

## F. Credit Engine Deep Dive

### Architecture

Located at `src/server/services/creditEngine/` with 30+ files organized into:
- **Signals** (6): revenueMomentum, cashCollection, profitability, debtAging, repaymentVelocity, tenureDepth
- **Scoring**: combines weighted signals into a 0–100 score (DB CHECK constraint on `customer_credit_assessments`)
- **Stances**: per-customer scoring profiles with custom signal weightings (must sum to 100)
- **Effective stance**: resolved from customer override → group → global default
- **Orchestrator**: manages recompute queue processing
- **Worker**: background process consuming `credit_recompute_queue`
- **Cold start**: initial credit assessment for new customers with no history
- **Confidence**: scoring confidence level based on data completeness
- **Reconciliation**: validates engine recommendations against manual limits
- **Divergence report**: flags customers where engine recommendation diverges significantly from current limit
- **Reaper**: cleans up stale queue entries
- **Nightly cron**: scheduled daily recompute for all engine-managed customers
- **Input guards**: validation of engine input parameters

### Recompute Triggers

Commands that insert into `credit_recompute_queue`:
- `confirmSalesOrder` 
- `postSalesOrder`
- `logPayment`
- `allocatePayment`
- `setCreditEngineConfig`
- `setCustomerCreditLimit` (manual override may trigger divergence check)

### Shadow Mode

When enabled, credit engine runs computation and writes assessments but does NOT update `customers.creditLimit`. Used for testing new parameters before going live.

### Stale Manual Limits

The Credit Review view highlights customers whose manual credit limit is older than their last engine recommendation, flagged as `'stale_manual'`. Operators can: set new limit, revert to engine, or snooze the reminder for 60 days.

---

## G. Referee / Broker System

### Entity Model

From `src/shared/types.ts` and `src/server/services/refereeCommands.ts`:

- **Referee**: A broker who introduced a customer or vendor
- **Referee Relationship**: Links a referee to a customer or vendor with a fee structure
  - Fee types: `percentage` (of transaction), `fixed` (flat amount), `hybrid` (base + percentage)
- **Referee Credit**: Accrued earnings from transactions involving the referee's customers/vendors

### Fee Accrual

Credits accrue automatically when:
- `approvePurchaseOrder` is called with a `refereeRelationshipId` → `accrueRefereeCredit()`
- The specific amount is calculated based on the relationship's fee structure

### UI Components

- **RefereeDialog.tsx**: Create/edit referee modal (with a11y test suite)
- **RefereeDetailPanel.tsx**: Referee detail with relationships and credit tabs
- **RefereeRelationshipsList.tsx**: Table of all relationships for a referee (with test)
- **RefereeCreditsList.tsx**: Accrued credits history (with test)
- **RefereeRelationshipDialog.tsx**: Add relationship dialog (with a11y test)
- **UpdateRefereeRelationshipDialog.tsx**: Edit relationship (with a11y test)
- **DeactivateRefereeRelationshipDialog.tsx**: Deactivate confirmation (with a11y test)
- **VoidRefereeCreditDialog.tsx**: Void credit confirmation (with a11y test)

---

## H. Processor / Connector Fee System

### Entity Model

From `src/server/services/processorCommands.ts`:

- **Payment Processor**: Represents an external payment processor (e.g., payment gateway)
  - Fee type: `percentage` or `fixed`
  - User/processor split: must sum to 100% (⛔ enforced)
- **Processor Fee**: Per-transaction fee tracking
  - `userFeeStatus`: tracked per transaction
  - `processorFeeStatus`: `'paid'` or `'unpaid'` only

### Commands

| Command | Description | Role |
|---------|-------------|------|
| `createPaymentProcessor` | Creates new processor with fee config | manager |
| `updateProcessor` | Updates processor details | owner |
| `markUserFeeCollected` | Marks user-facing fee as collected | manager |
| `updateProcessorFeeStatus` | Updates fee status (paid/unpaid) | manager |

### UI Components

- **ProcessorDetailPanel.tsx**: Processor detail with fee split display (with test)
- **ProcessorFeesGrid.tsx**: Fee tracking grid showing per-transaction fees (with test)

---

## I. Receipt Infrastructure

### Receipt Types

Each receipt service generates a formatted document (PDF/HTML) recording a specific business event:

| Service | Trigger | Content |
|---------|---------|---------|
| `poFinalizationReceipts` | `finalizePurchaseOrder` | PO finalization record |
| `salesConfirmationReceipts` | `confirmSalesOrder` | Sales confirmation record |
| `invoiceReceipts` | `postSalesOrder` | Customer invoice PDF |
| `paymentReceivedReceipts` | `logPayment` / `allocatePayment` | Payment confirmation |
| `vendorPayoutReceipts` | `recordVendorPayment` | Vendor payment record |

### UI Components

- **ReceiptPanel.tsx**: Displays a receipt record (with test)
- **ReceiptPreviewDrawer.tsx**: Slide-out drawer showing receipt preview
- **ReceiptPreviewOverlay.tsx**: Modal overlay for receipt viewing
- **VerifyAllPreviewBody.tsx**: Preview body shown during intake verification
- **RecordPrepaymentDialog.tsx**: Modal for recording PO prepayment (with a11y test)

---

## J. UI State Machine (uiStore)

From `src/client/store/uiStore.ts` (595 lines):

### Drawer State Machine

```
closed → peek → standard → wide → focus → standard → ...
```

| State | Behavior |
|-------|----------|
| `closed` | Drawer hidden, full grid width |
| `peek` | Drawer slides in ~120px, showing minimal context |
| `standard` | Drawer at ~380px, standard context view |
| `wide` | Drawer at ~580px, expanded detail |
| `focus` | Drawer at full-screen width minus sidebar |

Methods: `toggleDrawer()`, `cycleDrawer()` (closed → peek → standard → wide → standard)

### Route History

Each view navigation records a `RouteHistoryEntry`:
- view: ViewKey (e.g., 'sales', 'inventory')
- entityType: entity context (e.g., 'salesOrder', 'batch')
- entityId: specific entity row ID
- drawerState: DrawerStateName at time of navigation
- activeTab: which tab was open
- timestamp: when navigation occurred

### Additional UI State

- `showMargin`: boolean toggle for cost/margin visibility in sales grid
- Toast queue: `pushToast(message, type)`, auto-dismiss after ~5s
- `quickLaunchMode`: active QuickLaunch selection (sale, purchaseOrder, etc.)
- Focus mode: full-screen distraction-free view for single grid
- Active view: current ViewKey

---

## K. Command Palette & Shell

### Shell Layout

From `Shell.tsx`:
- **Keel** (top bar): App title + IdentityRibbon + FeedbackCapture + health status
- **SideNav**: Vertical navigation ordered by user's workLoop:
  - `sales`: Sales, Orders, Clients, Dashboard, Reports
  - `intake`: Intake, Inventory, Purchase Orders, Dashboard, Reports
  - `warehouse`: Fulfillment, Pick, Intake, Inventory
  - `operator`: Dashboard, Sales, Intake, Inventory, Payments, Recovery
- **Content area**: Current view + ContextDrawer (right side)
- **Bottom bar**: SelectionSummary (when rows selected)

### Command Palette (Cmd+K)

From `CommandPalette.tsx`:
- Trigger: Cmd+K global shortcut
- Quick Launch entries:
  - `sale` → new sales order draft
  - `purchaseOrder` → new purchase order draft
  - `receiving` → intake view ready for new batch
  - `moneyIn` → log payment dialog
  - `moneyOut` → record vendor payment dialog
  - `customerNeed` → create customer need
  - `vendorSupply` → create vendor supply
- Full-text search across commands and views
- Focus trap (fixed in commit b786f21)
- Results ranked by relevance

### Hotkeys (Cmd+1..N)

From `Hotkeys.tsx`:
- Cmd+1..N → switch to Nth view in nav order
- AG Grid native: Tab, Enter, Esc, Cmd+C/V for inline editing

### Identity Ribbon

Shows: user name, role, workLoop assignment. From `IdentityRibbon.tsx`.

---

## L. Core UI Components

### OperatorGrid

The universal AG Grid wrapper (`OperatorGrid.tsx`):
- Wraps AG Grid Enterprise v32 with filter bar, CSV export, pagination
- Accepts column definitions, row data, and optional filter configuration
- Integrated filter chip display (removable pills)
- CSV export with margin hiding in catalog mode

### Context Drawer

Right-side panel (`ContextDrawer.tsx`):
- State machine: closed → peek → standard → wide → focus
- Tab system: switches between related entity views
- Variants:
  - `VendorContextDrawer`: vendor-specific context (vendor details, POs, bills)
  - `RelationshipDrawer`: customer/vendor relationship context (pricing, credit, contact history)
  - `MediaBatchDrawer`: batch media gallery
  - `RowCommandHistoryDrawer`: per-row audit trail (command history for a single entity)

### KpiCard

Dashboard metric card (`KpiCard.tsx`):
- Shows metric label + value + severity indicator
- Clickable for drilldown into source grid
- Severity colors: good (green), watch (amber), bad (red), neutral (grey)

### StatusPill

Status indicator (`StatusPill.tsx`):
- Selection-pill component with semantic variants
- CSS: `.selection-pill`, `.selection-pill.success`, `.selection-pill.warning`, `.selection-pill.danger`
- Used across all views to display entity status

### CountPill

Numeric count indicator (`CountPill.tsx`):
- Small pill with count number (tested)
- Used in nav badges, queue indicators

### ToastCenter

Ephemeral notification system (`ToastCenter.tsx`):
- Top-of-screen stacking
- Auto-dismiss after ~5 seconds
- Types: success, error, warning, info
- Pushed by `useCommandRunner` on command completion

### EmptyState

Grid placeholder (`EmptyState.tsx`):
- Shown when grid has no data
- Customizable title, description, and action button

### SelectionSummary

Bottom bar (`SelectionSummary.tsx`):
- Appears when AG Grid rows are selected
- Shows count of selected rows
- Displays available bulk actions for the selected entity type

### WorkspacePanel

Titled container (`WorkspacePanel.tsx`):
- Wraps a grid or content section
- Header: title, subtitle, optional action buttons
- Used as the primary layout unit in most views

### ExpansionPanel + ExpansionChevronColumn

Collapsible row-detail system:
- `ExpansionChevronColumn`: AG Grid column that toggles row expansion
- `ExpansionPanel`: Content area that appears below an expanded row
- CSS classes: `.expansion-section`, `.expansion-section-header`, `.expansion-section-content`

### QuickLedgerGrid

Payments ledger grid (`QuickLedgerGrid.tsx`):
- Shows payment ledger with allocation status
- Collapse behavior with aria controls (tested)
- Used in Payments view and customer context

### IssueSidecar

Issue tracking side panel (`IssueSidecar.tsx`):
- Tracks known issues linked to entities
- Used for validation issues and exceptions

### ErrorBoundary

React error boundary (`ErrorBoundary.tsx`):
- Catches rendering errors in view components
- Tested with error simulation

### FeedbackCapture

User feedback widget (`FeedbackCapture.tsx`):
- Crikket integration for operator feedback capture
- Embedded in the Keel

### ConfirmRoot

Confirmation dialog wrapper (`ConfirmRoot.tsx`):
- Wraps destructive actions with confirmation step
- Used for cancel, delete, void operations

---

## M. Specialized Panels & Components

### InventoryFinderPanel
Product finder (`InventoryFinderPanel.tsx`):
- Search and browse available inventory
- Additive chip selection (multiple products) — tested
- Compare selection mode — tested
- Filter management (apply, remove, clear) — tested
- UOM/qty display per selection — tested
- Pill removal behavior — tested

### PhotographyQueuePanel
Mobile photo workflow queue (`PhotographyQueuePanel.tsx`):
- Shows batches needing photos (filtered by mediaStatus)
- Token management integration

### SalesSourcePane
Sales inventory browser (`SalesSourcePane.tsx`):
- Browse available inventory for adding to sales orders
- Shows available qty, price, batch info
- Tested

### CustomerPurchaseHistoryPanel
Customer order history (`CustomerPurchaseHistoryPanel.tsx`):
- Grid showing past orders for a customer
- Tested

### RecentSheetsPanel
Past customer sheets (`RecentSheetsPanel.tsx`):
- List of saved snapshots
- "Add back to draft" re-adds items to current order
- Tested

### Media Components
- **MediaBatchDrawer.tsx**: Media gallery for a specific batch — tested
- **MediaList.tsx**: Scrollable media item list
- **MediaUploadMobile.tsx**: Mobile-optimized upload interface — tested

### ContactCreateModal
Contact creation modal (`ContactCreateModal.tsx`):
- Form for creating new contact records
- Supports individual and business contact kinds

---

## N. Known Gaps — Complete Inventory

### Backend Gaps

| ID | Gap | Impact | Tracking |
|----|-----|--------|----------|
| B1 | `publishBatchMedia` doesn't update `batches.mediaStatus` | Modern photo flow leaves mediaStatus='open'; operators must manually update or use legacy path | — |
| B2 | PO reversal leaves orphan intake batches | `approvePurchaseOrder` reversal doesn't clean up auto-created draft batches | — |
| B3 | Pre-migration commands have no `inputPayload` | Commands before migration `0002_workflow_gap_closure.sql` cannot be retried | — |
| B4 | `pickLists.status` display values are UI-computed | `in_progress`, `has_alerts`, `ready_to_close` are not DB columns | — |
| B5 | `routeConnectorRequest` in internalOnlyCommandNames but has UI surface | Misclassification — "Reassign inbound request" button exists | — |
| B6 | Credit engine admin surfaces missing | 6 commands (stances, engineMax, per-customer disable) have no UI | #111 |
| B7 | `bulkRevertCustomersToEngine` no UI | Backend exists; not wired | #111 |
| B8 | `setCustomerPricingRule` not fully surfaced | Individual customer pricing rule editor incomplete | — |
| B9 | `updateVendor` / `updateProcessor` in pendingFrontend | Backend exists; UI pending | CAP-033 / TER-1564 |

### Frontend Gaps

| ID | Gap | Impact | Tracking |
|----|-----|--------|----------|
| F1 | CAP-030 fulfillment frontend | 6 commands in pendingFrontend: releaseLineForPicking, releaseLinesForPicking, recallLineFromPicking, acknowledgeWarehouseAlert, returnPickedUnits, cancelFulfillmentLine | PR #186 |
| F2 | CAP-033 contacts frontend | 12 commands in pendingFrontend: createContact, updateContact, archiveContact, addContactRole, linkContactToExistingEntity, linkContactToUser, createAppointment, updateAppointment, cancelAppointment, completeAppointment, updateVendor, updateProcessor | CAP-033 / TER-1564 |
| F3 | Contact merge/deduplicate UI | `contact_merge_candidates` table exists; merge UI not built | TODO in ContactsView.tsx |
| F4 | Shadow mode surface verification | Need to verify exact UI surface in CreditReviewView.tsx | — |
| F5 | Keyboard sweep (Phase 7) | All core journeys completable keyboard-first | Phase 7 |
| F6 | Focus/drawer persistence (Phase 7) | Operators can expand/minimize context without losing place | Phase 7 |

### Design/Architecture Gaps

| ID | Gap | Impact |
|----|-----|--------|
| D1 | `text-ink` vs `text-zinc-900` inconsistency | Two competing text color conventions coexist |
| D2 | `bg-primary` CSS variable usage | Exists in RefereeRelationshipDialog but not in Tailwind theme |
| D3 | No component for buttons | Buttons are raw `<button>` with semantic classes; no reusable component |

---

## O. Component-to-Journey Matrix

| Component | J1 PO | J2 Intake | J3 Inv | J4 Sales | J5 Fulfill | J6 Pay | J7 AP | J8 Close | J9 Recov | J10 Match | J11 Conn | J12 Credit | J13 Photo | J14 Contact |
|-----------|-------|-----------|--------|----------|------------|--------|-------|----------|----------|-----------|----------|------------|-----------|------------|
| OperatorGrid | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ContextDrawer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| WorkspacePanel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| StatusPill | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ToastCenter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| KpiCard | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| CommandPalette | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| VendorContextDrawer | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | — | — | — | — |
| RelationshipDrawer | — | — | — | ✓ | — | — | — | — | — | — | — | ✓ | — | — |
| InventoryFinderPanel | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — |
| PhotographyQueuePanel | — | — | ✓ | — | — | — | — | — | — | — | — | — | ✓ | — |
| QuickLedgerGrid | — | — | — | — | — | ✓ | — | — | — | — | — | — | — | — |
| RowCommandHistoryDrawer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — |
| AdvancedFilterBuilder | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — |
| SavedFiltersDropdown | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — |
| RefereeDialog | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| ProcessorDetailPanel | — | — | — | — | — | — | — | — | — | — | ✓ | — | — | — |
| PricingPanel | — | — | — | ✓ | — | — | — | — | — | — | — | ✓ | — | — |
| SaleLineExceptionControls | — | — | — | ✓ | — | — | — | — | — | — | — | — | — | — |
| LandedCostExceptionChip | — | — | — | ✓ | — | — | — | — | — | — | — | — | — | — |
| ReceiptPanel | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — |
| SalesSourcePane | — | — | — | ✓ | — | — | — | — | — | — | — | — | — | — |
| RecentSheetsPanel | — | — | — | ✓ | — | — | — | — | — | — | — | — | — | — |
| CustomerPurchaseHistoryPanel | — | — | — | ✓ | — | — | — | — | — | — | — | ✓ | — | — |
| MediaBatchDrawer | — | — | ✓ | — | — | — | — | — | — | — | — | — | ✓ | — |
| SelectionSummary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | — | — |
| EmptyState | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CountPill | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ErrorBoundary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hotkeys | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| IdentityRibbon | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ContactCreateModal | — | — | — | — | — | — | — | — | — | — | — | — | — | ✓ |

---

_End of Part 2: System Components & Deep Mechanics_
