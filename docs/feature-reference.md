# TERP Operator: Feature Reference

_Last updated: 2026-06-01_
_Source of truth: generated from the live codebase. Update this document when the codebase changes._
_Primary sources: `src/shared/types.ts`, `src/shared/commandCatalog.ts`, `src/server/schema.ts`, `src/server/services/commandBus.ts`, `docs/agent-orientation/domain-concepts.md`, `docs/workflow-gap-audit.md`_

---

## Table of Contents

1. [Overview](#overview)
2. [How to Use This Document](#how-to-use-this-document)
3. [Core Architecture Concepts](#core-architecture-concepts)
   - [Commands](#commands)
   - [RBAC (Roles)](#rbac-roles)
   - [Server State vs UI State](#server-state-vs-ui-state)
   - [Reversals](#reversals)
   - [Command Palette (Cmd+K)](#command-palette-cmdk)
4. [Feature Areas](#feature-areas)
   - [Purchase Orders](#purchase-orders)
   - [Intake (Receiving)](#intake-receiving)
   - [Inventory (Lot Management)](#inventory-lot-management)
   - [Sales Orders](#sales-orders)
   - [Orders (Open Order Book)](#orders-open-order-book)
   - [Fulfillment](#fulfillment)
   - [Payments (Accounts Receivable)](#payments-accounts-receivable)
   - [Vendors / Vendor Bills (Accounts Payable)](#vendors--vendor-bills-accounts-payable)
   - [Clients (Customer Roster)](#clients-customer-roster)
   - [Credit Review](#credit-review)
   - [Matchmaking](#matchmaking)
   - [Referees](#referees)
   - [Processors / Connectors](#processors--connectors)
   - [Reports](#reports)
   - [Closeout](#closeout)
   - [Recovery](#recovery)
   - [Photography](#photography)
   - [Contacts](#contacts)
   - [Dashboard](#dashboard)
   - [Settings](#settings)
   - [Command Palette / Quick Launch](#command-palette--quick-launch)
5. [Cross-Cutting Concerns](#cross-cutting-concerns)
   - [Audit Trail](#audit-trail)
   - [Reversals (Detail)](#reversals-detail)
   - [RBAC — Full Role Matrix](#rbac--full-role-matrix)
   - [Real-time Updates](#real-time-updates)
   - [Known Gaps and Open Issues](#known-gaps-and-open-issues)
6. [Glossary](#glossary)

---

## Overview

TERP Operator is a wholesale cannabis ERP operator console designed for operators who run dense, data-heavy businesses and refuse to give up the spreadsheet operating model. The product is built around three principles: **spreadsheet-native density** (every primary screen is an AG Grid with ≤8 columns, inline edits, and keyboard navigation), **command-driven auditability** (every mutation is a named, typed, idempotent command that writes to a journal before any side effect), and **explicit reversibility** (posted transactions are only undone via compensating reversal commands, never by silent deletion). The primary users are cannabis wholesale operators, sales operators, inventory and warehouse staff, and accounting/payments personnel at the same company.

---

## How to Use This Document

This document is organized in three layers: **Core Architecture Concepts** explains the systemic patterns every engineer and PM must understand before touching any feature; **Feature Areas** covers each screen/workflow with its full lifecycle, commands, status machine, and known nuances; and **Cross-Cutting Concerns** covers audit trails, RBAC, real-time updates, and all known gaps. The **Glossary** at the end defines every domain term found in the codebase and documentation. When in doubt about a term, check the glossary first, then `src/shared/types.ts` and `src/server/db/schema.ts`.

---

## Core Architecture Concepts

### Commands

A **Command** is the only way to mutate application state in TERP Operator. There are 130 named commands in `src/shared/commandCatalog.ts` (the `CommandName` union type). Commands are not REST endpoints — they are typed, named, idempotent operations executed through a centralized command bus implemented in `src/server/services/commandBus.ts` (~7,400 lines; all handler dispatch lives in this one file rather than a per-command directory).

**Catalog coverage.** Of the 130 named commands, ~80% are wired into the operator UI. The remainder are split into two explicit lists exported from `commandCatalog.ts`:

- **`internalOnlyCommandNames` (8)** — backend/admin-only, no UI surface (issue #111): `routeConnectorRequest`, `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `bulkRevertCustomersToEngine`.
- **`pendingFrontendCommandNames` (18)** — backend handler implemented, client-side wiring pending.

The parity audit (`pnpm audit:parity`) tolerates both lists explicitly.

**Full command lifecycle:**

1. **Client** calls `useCommandRunner` hook with a command name, payload, and a client-stamped `idempotencyKey` (formatted as `${commandName}-${uuid}`).
2. **tRPC** routes the call to `src/server/services/commandBus.ts`.
3. **Command Bus** validates the payload with Zod, checks RBAC via `assertCommandAccess`, and checks the idempotency key against `commandJournal`. If a record already exists with the same key and status `ok`, the cached result is returned immediately.
4. **Handler** executes the DB mutation inside a transaction. Before the mutation, a `beforeSnapshot` of affected rows is captured. After, an `afterSnapshot` is captured.
5. **`commandJournal`** row is written with: `commandName`, `idempotencyKey`, `actorId`, `inputPayload`, `beforeSnapshot`, `afterSnapshot`, `result`, `status` (`ok` or `failed`).
6. **JSONL** journal file is appended (on-disk audit trail).
7. **Socket.io** broadcasts a `command:completed` or `command:failed` event to all connected clients.
8. **Client** receives the event, invalidates relevant tRPC query cache, refreshes the grid, and shows a toast notification.

**Key invariants:**
- Commands with duplicate idempotency keys are never double-executed.
- Failed commands still write a journal row with `status: 'failed'`.
- Command payloads are stored verbatim in `commandJournal.inputPayload` for replay-safe retry.

### RBAC (Roles)

User roles are defined in `src/server/schema.ts` as the `role` column on `users`:

| Role | Description |
|------|-------------|
| `owner` | Full access. Can reverse commands, lock/archive periods, and perform all financial operations. |
| `manager` | Most access. Can approve POs, approve vendor bills, schedule payments. Cannot perform period lock/archive. |
| `operator` | Daily operations. Can create orders, log payments, manage intake, run fulfillment. Cannot reverse or close periods. |
| `viewer` | Read-only. Can view all grids but cannot execute any commands. |

RBAC is enforced **server-side** in command handlers via `assertCommandAccess` in `src/server/rbac.ts`. UI-side gating (e.g., hiding buttons for `viewer`) is a convenience, not a security control.

A user's `workLoop` field (`sales`, `intake`, `warehouse`, `operator`) determines which views are surfaced in the default navigation order, but does not restrict access — RBAC role is what matters for permissions.

### Server State vs UI State

**Server state** (data from the database) is managed by **tRPC + TanStack Query**. Every grid reads from a tRPC procedure. On command completion, the Socket.io event triggers query invalidation so the grid refreshes automatically.

**UI state** (drawer open/closed, active view, palette state, focus mode) is managed by **Zustand** in `src/client/store/uiStore.ts`. The drawer has a defined state machine: `closed → peek → standard → wide → focus → standard`. View routing is also tracked in `uiStore` (not via a URL router).

Engineers must not store server data in Zustand, and must not put UI-only state into tRPC. Mixing these causes stale reads and hard-to-reproduce bugs.

### Reversals

A **reversal** is a compensating command that undoes the effects of a previously executed command. It is NOT a delete. Reversals append a new journal entry; they do not remove the original command record.

The `reverseCommandById` command takes the ID of a prior command journal entry, validates that the command is reversible per the `reversalPolicies` in the command catalog, then executes the inverse DB operations (e.g., restoring balance, returning inventory to `live` status, voiding the invoice). Both the original command and the reversal command remain in the journal, linked by `reversedByCommandId`.

Not all commands are reversible. Commands involving external state (e.g., physical shipments sent, real money moved outside the system) may be `terminal`. See the [Reversals (Detail)](#reversals-detail) section for the full list.

### Command Palette (Cmd+K)

The **Command Palette** is a system-wide quick-launch overlay activated by `Cmd+K`. It provides fast keyboard access to the most common operator workflows without navigating to a specific view first.

Quick Launch entries (from `domain-concepts.md`):

| Entry | Action |
|-------|--------|
| `sale` | Opens new Sales Order draft |
| `purchaseOrder` | Opens new Purchase Order draft |
| `receiving` | Opens Intake view ready for a new batch |
| `moneyIn` | Opens Log Payment dialog |
| `moneyOut` | Opens Record Vendor Payment dialog |
| `customerNeed` | Opens Create Customer Need dialog |
| `vendorSupply` | Opens Create Vendor Supply dialog |

View switching is also available via `Cmd+1..N` keyboard shortcuts (defined in `Hotkeys.tsx`).

---

## Feature Areas

---

## Purchase Orders

**Purpose:** Manages the formal ordering process with vendors — creating, approving, and tracking inbound product orders before physical receipt.

**Who uses it:** `operator` and above create and manage POs. `manager` and `owner` approve them. `viewer` can read.

**The flow:**

1. Operator runs `createPurchaseOrder` → PO created with status `draft`, assigned a `poNo`.
2. Operator adds lines: `addPurchaseOrderLine` (one per SKU/lot). Each line starts with status `planned`. Lines can have a fixed `unitCost` or a `costRangeLow`/`costRangeHigh` range.
3. Operator edits lines as needed: `updatePurchaseOrderLine`, `removePurchaseOrderLine` (only while `draft`).
4. Operator runs `finalizePurchaseOrder` → status moves to `finalized`. At this point the PO is locked for review.
5. If changes are needed: `unfinalizePurchaseOrder` → status returns to `draft`.
6. Manager/owner runs `approvePurchaseOrder` → status moves to `approved`. **The handler automatically calls `receivePurchaseOrder` internally**, creating one draft `batch` row per PO line in the Intake view, status `draft`. The operator does NOT run `receivePurchaseOrder` as a separate step.
7. As intake progresses, PO status may reflect `partially_received`.
8. When all lines are received: status moves to `received`.
9. Cancellation: `cancelPurchaseOrder` → status moves to `cancelled`. Only possible if no lines have been received.
10. Prepayments can be recorded at any point after approval: `recordVendorPrepayment`.

**Key nuances:**
- A PO can only be approved from `finalized` status. It cannot be approved directly from `draft`.
- `unfinalizePurchaseOrder` is only available on `finalized` POs, not `approved` ones.
- Once any line is received, the PO cannot be cancelled — it must be handled via inventory adjustments instead.
- Cost can be a fixed `unitCost` OR a range (`costRangeLow`/`costRangeHigh`). The range is used for landed cost tracking downstream in sales.
- `ownershipStatus` on PO lines is propagated to batches: `'C'` = consignment, `'OFC'` = office-owned, `'UNKNOWN'` = not yet determined.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createPurchaseOrder` | Creates a new draft PO. |
| `updatePurchaseOrder` | Updates header fields (vendor, expected date, payment terms, notes). |
| `addPurchaseOrderLine` | Adds a product line to a draft PO. |
| `updatePurchaseOrderLine` | Updates qty, cost, or notes on a PO line. |
| `removePurchaseOrderLine` | Removes a line from a draft PO. |
| `finalizePurchaseOrder` | Locks the PO for approval. Status: `draft` → `finalized`. |
| `unfinalizePurchaseOrder` | Returns a finalized PO to draft for editing. Status: `finalized` → `draft`. |
| `approvePurchaseOrder` | Approves the PO. Status: `finalized` → `approved`. Enables intake. |
| `receivePurchaseOrder` | Creates draft intake batches from an approved PO. |
| `cancelPurchaseOrder` | Cancels the PO (only if no lines received). Status → `cancelled`. |
| `recordVendorPrepayment` | Records a prepayment against an approved PO. |

**Entities touched:** `purchaseOrders`, `purchaseOrderLines`, `vendors`, `batches` (created by `receivePurchaseOrder`).

**Connected features:** Feeds into **Intake** (PO approval triggers intake row creation). Triggers **Vendors/AP** (posting intake creates vendor bills). Affects **Inventory** (received batches become live inventory).

---

## Intake (Receiving)

**Purpose:** Manages the physical receipt and verification of product from vendors — the airlock through which all inventory must pass before it becomes sellable.

**Who uses it:** `operator` and above. Intake is typically the `intake` workLoop role. `manager`/`owner` can post receipts.

**The flow:**

1. `receivePurchaseOrder` (from PO view) creates draft `batches` rows in the intake queue, status `draft`.
2. Alternatively, `createBatch` manually creates a draft batch outside a PO flow.
3. Operator reviews each batch: verifies qty, lot code, category, arrival status.
4. Operator edits as needed: `updateBatch` (fields: batchCode, name, category, qty, unitCost, notes, ownershipStatus, arrivalStatus, etc.).
5. If product has issues: `flagBatch` → adds a validation issue note; status moves to `flagged`. Requires operator attention before posting.
6. If product is being returned: `rejectBatch` → status moves to `returned`; quantity is removed.
7. To bulk-verify all pending rows: `verifyAllIntake`.
8. To post a batch and create live inventory: `postPurchaseReceipt` → batch status moves to `posted`, a `purchaseReceipt` and `purchaseReceiptLine` record are created, a `vendorBill` is created, and batch becomes `live` inventory available for sale.
9. CSV import path: `importBatchesCsv` → bulk-creates draft batches from a CSV file.

**Key nuances:**
- Intake is the **only** path for creating live inventory. `postPurchaseReceipt` is the gate; nothing becomes sellable until it passes through this command.
- `intakeQty` on a batch is **immutable after posting**. It represents what was received. Only `availableQty` changes thereafter through sales/adjustments.
- `flagBatch` does not prevent posting, but leaves a visible marker requiring resolution.
- `rejectBatch` is appropriate for product that is refused at the dock. It sets status to `returned` — no inventory is created.
- `arrivalStatus` tracks physical arrival: `'pending'` (expected but not here), `'arrived'` (physically present), `'cancelled'` (never coming).
- Posting creates a `vendorBill` automatically (for non-consignment batches). This is the Accounts Payable trigger.
- For consignment batches (`ownershipStatus: 'C'`): the vendor bill is not due until the consignment inventory is depleted/sold.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createBatch` | Manually creates a draft intake batch. |
| `updateBatch` | Updates fields on a draft batch. |
| `deleteBatch` | Deletes a draft batch (not yet posted). |
| `flagBatch` | Marks a batch as flagged with a validation note. |
| `rejectBatch` | Marks a batch as returned; removes quantity. |
| `verifyAllIntake` | Bulk-verifies all pending intake rows for a PO. |
| `postPurchaseReceipt` | Posts verified batches → creates live inventory, receipt records, vendor bills. |
| `receivePurchaseOrder` | Creates draft intake batches from an approved PO (initiated from PO view). |
| `importBatchesCsv` | Bulk-creates draft batches from a CSV upload. |

**Entities touched:** `batches`, `purchaseReceipts`, `purchaseReceiptLines`, `vendorBills`, `purchaseOrders`.

**Connected features:** Downstream of **Purchase Orders** (PO approval triggers intake row creation). Creates **Inventory** (posted batches become live lots). Triggers **Vendors/AP** (vendor bills created on posting).

---

## Inventory (Lot Management)

**Purpose:** Manages the lifecycle and attributes of all live inventory lots — quantity, pricing, location, ownership, media, and status.

**Who uses it:** All roles view inventory. `operator` and above can make adjustments and manage media. `manager`/`owner` can perform ownership transfers.

**The flow:**

1. Batches arrive from Intake with status `live` and a populated `availableQty`.
2. As sales orders are confirmed, `reserveInventoryForOrder` decrements `availableQty` and increments `reservedQty`.
3. As sales orders are posted, the reservation converts to a sold allocation; `availableQty` decreases permanently.
4. As inventory is depleted, status moves to `sold` or `depleted`.
5. Operators can manually adjust quantities: `adjustBatchQuantity` (for corrections post-intake).
6. Status management: `setInventoryStatus` moves a batch between statuses (e.g., `live` → `held`, `live` → `damaged`).
7. Location management: `transferInventoryLocation` updates the physical storage location.
8. Ownership transfer: `transferInventoryOwnership` changes `ownershipStatus` (e.g., consignment to office-owned).
9. Pricing: `setBatchPrice` updates `unitPrice`. `setBatchLotInfo` updates lot code and related details.
10. Media: `uploadBatchMedia` → `setBatchMediaRole` → `publishBatchMedia`. Photos/videos move from draft to published. `deleteBatchMedia` removes a media item.
11. Photo tokens: `mintPhotoUploadToken` creates a temporary upload token for mobile photo capture. `revokePhotoUploadToken` revokes it.
12. Aliases: `setItemAlias` sets a customer-facing market name for a catalog item.
13. Tags: `applyTags` applies, removes, or replaces tags on a batch.

**Key nuances:**
- `availableQty` is the source of truth for what can be sold. It is: `intakeQty - reservedQty - soldQty`.
- `intakeQty` never changes after posting. It is the historical received quantity.
- `mediaStatus` tracks photo readiness: `'open'` (no photos), `'ready'` (photos uploaded but not published), `'done'` (photos published). This feeds the Photography workflow.
- `ownershipStatus` values: `'C'` = consignment (vendor owns until sold), `'OFC'` = office-owned (operator purchased outright), `'UNKNOWN'` = unclear.
- The legacy `attachBatchPhoto` command stores a URL string; the new flow uses `uploadBatchMedia` + `setBatchMediaRole` + `publishBatchMedia` for structured media management.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `adjustBatchQuantity` | Manual quantity correction on a posted batch. |
| `setInventoryStatus` | Moves a batch between statuses (live, held, damaged, etc.). |
| `transferInventoryLocation` | Updates the physical location field. |
| `transferInventoryOwnership` | Changes ownershipStatus (C, OFC, UNKNOWN). |
| `setBatchPrice` | Sets the unit price for a batch. |
| `setBatchLotInfo` | Updates lot code and supplemental lot details. |
| `uploadBatchMedia` | Uploads a photo or video for a batch. |
| `setBatchMediaRole` | Sets the role of a media item (e.g., primary_photo). |
| `publishBatchMedia` | Publishes a draft media item, making it visible. |
| `deleteBatchMedia` | Deletes a media item and its associated files. |
| `attachBatchPhoto` | (Legacy) Attaches a photo URL directly to a batch. |
| `mintPhotoUploadToken` | Creates a temporary upload token for mobile photo capture. |
| `revokePhotoUploadToken` | Revokes an active photo upload token. |
| `setItemAlias` | Sets a customer-facing market name alias for a catalog item. |
| `applyTags` | Applies, removes, or replaces tags on a batch. |
| `importBatchesCsv` | Bulk-imports batches from CSV. |

**Entities touched:** `batches`, `batchMedia`, `items`, `inventoryMovements`.

**Connected features:** Fed by **Intake** (posting creates live batches). Feeds **Sales Orders** (available inventory is sourced from batches). Feeds **Photography** (mediaStatus drives the photo workflow). Feeds **Matchmaking** (available lots can satisfy vendor supply records).

---

## Sales Orders

**Purpose:** Manages the complete lifecycle of customer orders from draft through posting and fulfillment handoff.

**Who uses it:** `operator` (sales workLoop) creates and manages orders. `manager`/`owner` can approve exceptions (e.g., below-floor pricing). `viewer` can read.

**The flow:**

1. Operator runs `createSalesOrder` → order created with status `draft`, assigned `orderNo`.
2. Lines added: `addSalesOrderLine` — lines can be sourced from available inventory (`batchId`) or as free-text (unresolved). Line status starts `draft`.
3. Lines edited as needed: `updateSalesOrderLine`, `removeSalesOrderLine`.
4. Delivery window set: `setDeliveryWindow`.
5. Pricing applied: `priceSalesOrder` applies a pricing strategy. Lines receive `unitPrice` values. The sales order itself stays in `'draft'` — there is no `'priced'` order status written to `salesOrders.status` in code.
6. Re-price if needed: `repriceOrder`.
7. Landed cost set (optional): `setLineLandedCost` sets cost range for margin tracking.
8. Below-floor pricing: if any line is priced below floor, `setLineBelowFloorReason` records the reason. `resolveVendorApproval` handles vendor-side approval gate.
9. Customer sheet snapshot: `createCustomerSheetSnapshot` saves a point-in-time view of the sales sheet (customer-facing, hides margin/cost).
10. Inventory reservation: `reserveInventoryForOrder` → reserves qty on batch, line status moves to `reserved`.
11. Confirm: `confirmSalesOrder` → validates credit limit, inventory availability, no duplicate source rows. Order status → `confirmed`. Credit check runs at this point.
12. Post: `postSalesOrder` → order status → `posted`. Creates an `invoice` row. Updates `customer.balance`. Decrements `batches.availableQty`. Credit check runs again immediately before posting. Duplicate source row posting is refused.
13. Cancel: `cancelSalesOrder` → releases inventory reservations, order status → `cancelled`.

**Key nuances:**
- Sales orders **must** be `confirmed` before they can be `posted`. There is no direct `draft` → `posted` path (this is enforced server-side; the adversarial QA finding that exposed this path was fixed).
- Credit checks run at **both** confirm and post time.
- If a line is priced below the floor price, a reason must be recorded before the order can advance.
- Duplicate source rows (same batch line on two different unposted orders) are refused at posting time.
- **Sales order statuses actually written** by handlers: `'draft'`, `'confirmed'`, `'posted'`, `'cancelled'`, `'fulfilled'`, `'reversed'`. The values `'priced'`, `'closed'`, and `'shipped'` are **not** written to `salesOrders.status` anywhere in the codebase — they were never authoritative status values.
- `createCustomerSheetSnapshot` produces a customer-facing version that hides `unitCost` and `internalMargin`. This is intentional — the customer-facing sheet must never show operator margin.
- `allocateOrderToFulfillment` is initiated from the Orders view (post-posting), not the Sales view.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createSalesOrder` | Creates a draft sales order. |
| `addSalesOrderLine` | Adds a line item to a sales order. |
| `updateSalesOrderLine` | Updates qty, price, or display name on a line. |
| `removeSalesOrderLine` | Removes a line from a draft order. |
| `setDeliveryWindow` | Sets the delivery window text. |
| `priceSalesOrder` | Applies a pricing strategy to the order. |
| `repriceOrder` | Re-applies pricing to an already-priced order. |
| `setLineLandedCost` | Sets cost range for a sales line for margin tracking. |
| `setLineBelowFloorReason` | Records reason for pricing a line below floor. |
| `resolveVendorApproval` | Resolves a pending vendor approval for a below-floor line. |
| `reserveInventoryForOrder` | Reserves batch inventory for a confirmed order. |
| `confirmSalesOrder` | Confirms the order; validates credit and inventory. Status → `confirmed`. |
| `postSalesOrder` | Posts the order; creates invoice, updates balance. Status → `posted`. |
| `cancelSalesOrder` | Cancels and releases inventory reservations. Status → `cancelled`. |
| `createCustomerSheetSnapshot` | Saves a customer-facing (no-margin) snapshot of the sales sheet. |
| `applyClientCredit` | Applies a manual credit to a customer's account. |

**Entities touched:** `salesOrders`, `salesOrderLines`, `batches`, `customers`, `invoices`.

**Connected features:** Reads from **Inventory** (batch availability). Writes to **Inventory** (reserves and depletes qty). Creates entries in **Payments/AR** (invoices). Feeds **Orders** (posted orders appear in the open book). Feeds **Fulfillment** (posted orders get pick lists).

---

## Orders (Open Order Book)

**Purpose:** Provides a unified view of all posted-but-not-yet-fulfilled orders — the active work queue for sales and operations.

**Who uses it:** Sales operators track delivery status. Operations coordinators allocate orders to fulfillment from here. `viewer` can read.

**The flow:**

1. A sales order in status `posted` (or `confirmed`) appears in the Orders view.
2. Operator selects an order and runs `allocateOrderToFulfillment` (same as `createPickList`) → creates a `pickLists` row and `fulfillmentLines` for each order line.
3. The order then moves to the **Fulfillment** workflow.
4. Orders remain visible here until status reaches `fulfilled`.

**Key nuances:**
- This is primarily a **read** view with one key action trigger (`allocateOrderToFulfillment`).
- Orders in status `confirmed` that have not yet been posted also appear here (they are "committed but not invoiced").
- There is no `'shipped'` or `'closed'` sales order status written by code. `'fulfilled'` is the terminal success status; `'cancelled'` and `'reversed'` are terminal exits.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `allocateOrderToFulfillment` | Creates a pick list for a posted order; initiates fulfillment. |

**Entities touched:** `salesOrders` (read), `pickLists` (write), `fulfillmentLines` (write).

**Connected features:** Downstream of **Sales Orders** (posted orders flow here). Feeds **Fulfillment** (pick list creation).

---

## Fulfillment

**Purpose:** Manages the physical pick, weigh, and pack process for posted sales orders from pick list creation through marking the order fulfilled.

**Who uses it:** Warehouse operators (`warehouse` workLoop) execute picks and pack. Sales operators and managers track status and release lines.

**The flow:**

1. Pick list created via `allocateOrderToFulfillment` or `createPickList` → `pickLists` row created with status `open`. One `fulfillmentLines` row per order line.
2. Sales operator releases lines for warehouse picking: `releaseLineForPicking` (single) or `releaseLinesForPicking` (bulk). Line `pickStatus` moves from `unreleased` → `released`.
3. Warehouse operator picks the line via the `pick` view (mobile-optimized). Line `pickStatus` → `picking`.
4. Operator runs `recordWeighAndPack` → records `actualQty` and `actualWeight`. Line status → `packed`. Requires positive actual qty AND positive actual weight (enforced server-side after adversarial QA fix).
5. If a line needs to be recalled: `recallLineFromPicking` → `pickStatus` → `recall_pending`.
6. If a line should not be fulfilled: `cancelFulfillmentLine` → `fulfillmentLines.status` → `cancelled`.
7. If a discrepancy or alert arises: `acknowledgeWarehouseAlert`.
8. If picked units need to be returned to inventory: `returnPickedUnits`.
9. Fulfillment line adjustments: `adjustFulfillmentLine`.
10. Labels printed: `printLabels` → marks labels as printed for the pick list.
11. Once all lines are packed: `markOrderFulfilled` → `salesOrders.status` → `fulfilled`. `pickLists.status` → `fulfilled`.

**Key nuances:**
- `recordWeighAndPack` requires BOTH `actualQty > 0` AND `actualWeight > 0`. Packing without weight is rejected server-side.
- The `pick` view (`ViewKey: 'pick'`) is a separate mobile-first UI used by warehouse operators on handheld devices.
- **`pickLists.status` values actually written to the DB:** `'open'` (default at creation) and `'fulfilled'` (on `markOrderFulfilled`). The values `'in_progress'`, `'has_alerts'`, `'ready_to_close'`, and `'closed'` are **derived UI display states** computed in the view layer (`OperationsViews.tsx`) from `fulfillmentLines` data — they are not persisted in the database.
- Discrepancies surface through `fulfillmentLines.warehouseAlerts` (jsonb), not via a pick list status transition.
- Bag manifest CSVs are written to `ARCHIVE_DIR/bag-manifests` for deterministic fulfillment records.
- Labels are available in 4x6 and 2x1 formats (see `printLabels` command).

**Commands involved:**

| Command | Description |
|---------|-------------|
| `allocateOrderToFulfillment` | Creates pick list and fulfillment lines from a posted order. |
| `createPickList` | Alias for allocateOrderToFulfillment. |
| `releaseLineForPicking` | Releases a single fulfillment line to the warehouse pick queue. |
| `releaseLinesForPicking` | Bulk releases multiple lines for picking. |
| `recallLineFromPicking` | Recalls a line from the warehouse queue. pickStatus → `recall_pending`. |
| `recordWeighAndPack` | Records actual qty and weight for a fulfillment line. Line status → `packed`. |
| `adjustFulfillmentLine` | Adjusts fulfillment line details. |
| `cancelFulfillmentLine` | Cancels a fulfillment line. |
| `acknowledgeWarehouseAlert` | Acknowledges an alert on a fulfillment line. |
| `returnPickedUnits` | Returns picked units back to inventory. |
| `printLabels` | Marks labels as printed for a pick list. |
| `markOrderFulfilled` | Marks the sales order and pick list as fulfilled. |

**Entities touched:** `pickLists`, `fulfillmentLines`, `salesOrders`, `salesOrderLines`, `batches`.

**Connected features:** Downstream of **Orders** (pick lists created from posted orders). Feeds **Payments/AR** (fulfilled orders are ready for payment collection). Feeds **Inventory** (returned picked units update availableQty).

---

## Payments (Accounts Receivable)

**Purpose:** Manages all money received from customers — logging payments, allocating them to invoices, handling refunds, and maintaining accurate customer balances.

**Who uses it:** Payments/accounting role (`operator` and above). `manager`/`owner` for refunds and special allocations.

**The flow:**

1. Customer payment arrives. Operator runs `logPayment` → creates a `payments` record with status `posted`. Payment carries: `amount`, `method` (`cash`, `check`, `card`, `crypto`, `wire`), `allocationIntent` (`fifo`, `unapplied`, or `selected_invoice`), optional `bucket`, `reference`, and `notes`.
2. If `allocationIntent` is `fifo`: the system auto-allocates to oldest open invoices in the **same transaction** as `logPayment` (commandBus.ts:3697-3731). If no open invoices exist, the auto-allocation step is skipped gracefully with a toast notification — the payment is logged as unapplied. Prior gap DYN-H3 / issue #26 is **closed**.
3. If `allocationIntent` is `unapplied`: payment sits in unapplied balance, reducing credit usage but not closing specific invoices.
4. If `allocationIntent` is `selected_invoice`: payment is directed at a specific invoice.
5. Manual allocation: `allocatePayment` → links `unappliedAmount` on the payment to `amountPaid` on one or more invoices. Updates `customer.balance`. Creates `paymentAllocations` rows.
6. If allocation was incorrect: `unallocatePayment` → reverses the allocation, returns amount to unapplied.
7. If payment is a refund: `refundPayment` → payment status → `refunded`.
8. Early payment discounts: `applyEarlyPayDiscount` → adjusts the invoice amount.
9. Manual credit: `applyClientCredit` → applies a credit directly to a customer's account.
10. Generic ledger entry: `postTransactionLedgerRow` (internal use for non-standard transactions).

**Key nuances:**
- `logPayment` auto-runs `allocatePayment` in the same transaction when `allocationIntent` is `'fifo'` or `'selected_invoice'`. The implementation degrades gracefully if no open invoices exist. DYN-H3 / issue #26 is closed.
- Unapplied payments reduce the customer's overall credit usage (they count against outstanding balance) but do not close specific invoices.
- `customer.balance` is updated at payment allocation time, not at payment logging time.
- Zero-dollar payments are refused server-side (adversarial QA fix).
- Over-allocation (allocating more than the payment amount) is blocked.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `logPayment` | Records a customer payment. Status: `posted`. |
| `allocatePayment` | Allocates payment amount to specific invoices. |
| `unallocatePayment` | Reverses a payment allocation. |
| `refundPayment` | Marks a payment as refunded. |
| `applyEarlyPayDiscount` | Applies an early payment discount to an invoice. |
| `applyClientCredit` | Applies a manual credit to a customer's account. |
| `postTransactionLedgerRow` | Posts a generic row to the transaction ledger (internal use). |
| `upsertTransactionType` | Creates or updates a transaction type definition. |

**Entities touched:** `payments`, `paymentAllocations`, `invoices`, `customers`, `clientLedgerEntries`.

**Connected features:** Downstream of **Sales Orders** (invoices created at posting). Reads from **Clients** (customer balance and credit). Affects **Credit Review** (payments update credit usage).

---

## Vendors / Vendor Bills (Accounts Payable)

**Purpose:** Manages all money owed to vendors — tracking vendor bills from creation through payment, and managing vendor relationships.

**Who uses it:** Payments/accounting operators. `manager`/`owner` for approval and scheduling.

**The flow:**

1. **Auto-creation:** `postPurchaseReceipt` (in Intake) automatically creates a `vendorBill` with status `'open'` for non-consignment batches.
2. **Manual creation:** `createVendorBill` → creates a bill with status `'open'`.
3. `approveVendorBill` → status: `'open'` → `'approved'`.
4. `scheduleVendorPayment` → sets `scheduledFor` date; status: `approved` → `scheduled`.
5. `recordVendorPayment` → creates a `vendorPayments` record; status: `scheduled` → `paid` (if full) or `partial`. **Vendor payments MUST be scheduled before recording — unscheduled payout recording is rejected.**
6. If partial payment: status stays `partial` until fully paid.
7. If payment needs to be voided: `voidVendorPayment` → `vendorPayments.status` → `void`.
8. For consignment batches: the vendor bill is not due until the consignment inventory is depleted. When consigned inventory is sold, the system triggers the bill to `due`/`approved` status automatically.
9. Vendor record management: `createVendor`, `updateVendor`.

**Key nuances:**
- `recordVendorPayment` will be **rejected** if the bill is not in `scheduled` status. This is a hard server-side guard (fixed via adversarial QA finding; prior behavior allowed unscheduled payouts).
- Zero-dollar vendor payments are refused.
- Vendor payments cannot exceed the open bill balance.
- Consignment depletion is a system-triggered event — when consigned batches are fully sold, the system marks the related vendor bill as due.
- Prepayments against a PO (`recordVendorPrepayment`) are tracked separately from bill payments.
- **`vendorBills.status` values actually written:** `'open'`, `'approved'`, `'scheduled'`, `'paid'`, `'partial'`, `'reversed'`, `'cancelled'`. The value `'created'` is never written. `'voided'` is also not a vendor bill status — `'void'` is the status used on `vendorPayments` (set by `voidVendorPayment`).

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createVendor` | Creates a new vendor record. |
| `updateVendor` | Updates vendor details. |
| `createVendorBill` | Manually creates a vendor bill with status `'open'`. |
| `approveVendorBill` | Approves a vendor bill. Status: `'open'` → `'approved'`. |
| `scheduleVendorPayment` | Schedules a vendor bill for payment. Status: `'approved'` → `'scheduled'`. |
| `recordVendorPayment` | Records payment against a scheduled bill. Bill status → `'paid'` or `'partial'`. |
| `voidVendorPayment` | Voids a vendor payment record (`vendorPayments.status` → `'void'`). |
| `recordVendorPrepayment` | Records a prepayment against an approved PO. |

**Entities touched:** `vendors`, `vendorBills`, `vendorPayments`, `purchaseOrders`, `batches`.

**Connected features:** Fed by **Intake** (posting auto-creates vendor bills). Related to **Purchase Orders** (prepayments). Affects **Closeout** (AP balances must be resolved before period close).

---

## Clients (Customer Roster)

**Purpose:** Manages the customer roster, credit limits, balances, pricing rules, and tags — the operator's complete view of each customer relationship.

**Who uses it:** Sales operators (read + credit check). Managers and owners manage credit limits. All roles can view.

**The flow:**

1. Customers are primarily created via the **Contacts** system (`createContact` + `addContactRole`). The Clients view surfaces the customer-role entities.
2. Credit limit management:
   - `setCustomerCreditLimit` → manually overrides the credit limit.
   - `revertCustomerCreditToEngine` → returns the customer to credit engine management.
   - `snoozeCustomerCreditReminder` → snoozes the stale-manual-limit reminder.
   - `setCustomerEngineMax` → caps the maximum the credit engine can assign.
   - `setCustomerStance` → assigns a credit engine stance (scoring weighting profile).
   - `disableCreditEngineForCustomer` → turns off the credit engine for this customer.
   - `enableCreditEngineForCustomer` → re-enables the credit engine.
   - `bulkRevertCustomersToEngine` → bulk-reverts all eligible manual-credit customers back to engine control.
3. Pricing rules: `setCustomerPricingRule` → sets a custom pricing rule for this customer. Overrides the system default.
4. Tags: `applyTags` → applies, removes, or replaces tags on a customer record.
5. Balance is updated automatically by payment allocations and sales order postings — there is no direct balance-edit command.

**Key nuances:**
- Credit limit has two sources: `'manual'` (set by operator) and `'engine'` (computed by credit engine). The `creditLimitSource` field tracks which is active.
- `customer.balance` reflects outstanding invoices less applied payments. It is not directly editable — it changes via `postSalesOrder` and `allocatePayment`.
- `engineMax` is a ceiling the engine cannot exceed. Even if the engine would assign a higher limit, `engineMax` caps it.
- A `stanceId` points to a `creditEngineStances` record defining signal weightings (payment history, order volume, etc.).

**Commands involved:**

| Command | Description |
|---------|-------------|
| `setCustomerCreditLimit` | Manually sets a customer's credit limit. |
| `revertCustomerCreditToEngine` | Returns credit limit to engine management. |
| `snoozeCustomerCreditReminder` | Snoozes the stale-manual-limit reminder. |
| `setCustomerEngineMax` | Sets the maximum the credit engine can assign. |
| `setCustomerStance` | Assigns a credit engine stance to a customer. |
| `disableCreditEngineForCustomer` | Disables the credit engine for a customer. |
| `enableCreditEngineForCustomer` | Re-enables the credit engine for a customer. |
| `bulkRevertCustomersToEngine` | Bulk-reverts eligible customers back to engine control. |
| `setCustomerPricingRule` | Sets a custom pricing rule for a customer. |
| `applyTags` | Applies/removes/replaces tags on the customer. |

**Entities touched:** `customers`, `invoices` (read), `payments` (read), `creditEngineStances`.

**Connected features:** Feeds **Sales Orders** (credit checks read from here). Fed by **Payments/AR** (balance updated by allocations). Connected to **Credit Review** (credit engine management). Connected to **Contacts** (customer records link to contacts).

---

## Credit Review

**Purpose:** Provides a dedicated screen for managing the credit engine — reviewing which customers have manual vs. engine-managed credit limits, and adjusting engine configuration and stances.

**Who uses it:** `manager` and `owner` for credit decisions. `viewer` for review.

**The flow:**

1. Credit Review view (`credit-review`) surfaces all customers with their `creditLimitSource`, current limit, balance, and engine recommendation.
2. Manager identifies customers with stale manual limits (highlighted by the system).
3. Manager can: set a new manual limit (`setCustomerCreditLimit`), revert to engine (`revertCustomerCreditToEngine`), or snooze the reminder (`snoozeCustomerCreditReminder`) from the UI.
4. Global credit engine configuration: `setCreditEngineConfig` updates engine-wide parameters.
5. Bulk action: `bulkRevertCustomersToEngine` — backend exists; not yet wired into the UI.

**Internal-only Credit Review commands (issue #111).** The following commands have backend handlers but **no UI surface** in the operator console — they are part of `internalOnlyCommandNames` and cannot be invoked from Credit Review today:
- `setCustomerEngineMax`
- `setCustomerStance`
- `disableCreditEngineForCustomer`
- `createCreditEngineStance`
- `updateCreditEngineStance`
- `deleteCreditEngineStance`
- `bulkRevertCustomersToEngine`

Stance management, engine-max overrides, and per-customer engine disable are therefore backend-only operations until frontend wiring is completed.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `setCustomerCreditLimit` | Manually sets a credit limit. |
| `revertCustomerCreditToEngine` | Returns to engine management. |
| `snoozeCustomerCreditReminder` | Snoozes stale limit reminder. |
| `setCustomerEngineMax` | Sets the engine's maximum assignable limit. |
| `setCustomerStance` | Assigns a stance to a customer. |
| `disableCreditEngineForCustomer` | Disables the credit engine for a customer. |
| `enableCreditEngineForCustomer` | Re-enables the credit engine for a customer. |
| `bulkRevertCustomersToEngine` | Bulk-reverts eligible customers to engine control. |
| `createCreditEngineStance` | Creates a new credit engine stance. |
| `updateCreditEngineStance` | Updates an existing stance. |
| `deleteCreditEngineStance` | Deletes a stance. |
| `setCreditEngineConfig` | Updates the global credit engine configuration. |

**Entities touched:** `customers`, `creditEngineStances`.

**Connected features:** Directly linked to **Clients** (same underlying data). Affects **Sales Orders** (credit limits enforced at confirm and post time).

---

## Matchmaking

**Purpose:** Pairs customer product needs with available vendor supply — a structured brokering workflow for connecting buyers and sellers before a PO or sales order is created.

**Who uses it:** Sales operators and managers who broker deals. `viewer` can read.

**The flow:**

1. Customer need created: `createCustomerNeed` → records a customer's request for a specific product type, quantity, and price range.
2. Vendor supply created: `createVendorSupply` → records that a vendor has a specific product available.
3. The matchmaking engine surfaces suggested pairings.
4. Operator reviews a suggested match and either:
   - `acceptMatchmakingMatch` → accepts the pairing; typically triggers a PO creation flow.
   - `dismissMatchmakingMatch` → dismisses the match (not a fit).
   - `reopenMatchmakingMatch` → reopens a previously dismissed or accepted match.
5. Outreach logged: `noteMatchmakingOutreach` → records that the operator contacted a party about the match.
6. Settings: `updateMatchmakingSettings` → adjusts engine parameters.
7. Work queue management: `dismissMatchmakingWorkQueueItem` → snoozes a matchmaking item for 30 days.
8. Updates: `updateCustomerNeed`, `updateVendorSupply` → edit the need/supply record.

**Key nuances:**
- Status lifecycle is enforced server-side via `assertValidNeedStatusTransition` and `assertValidSupplyStatusTransition` (`commandBus.ts:5197-5224`). Valid need transitions: `open → matched | closed`. Valid supply transitions: `open → held_for_match | closed`. Prior DYN-H4 / issue #27 is closed.
- The matchmaking engine is a suggestion system, not an auto-executor. An accepted match does not automatically create a PO — the operator must take that step separately.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createCustomerNeed` | Records a customer's product need. |
| `updateCustomerNeed` | Updates an existing customer need. |
| `createVendorSupply` | Records available vendor supply. |
| `updateVendorSupply` | Updates an existing vendor supply record. |
| `acceptMatchmakingMatch` | Accepts a suggested need/supply pairing. |
| `dismissMatchmakingMatch` | Dismisses a match. |
| `reopenMatchmakingMatch` | Reopens a dismissed or accepted match. |
| `updateMatchmakingSettings` | Updates matchmaking engine settings. |
| `noteMatchmakingOutreach` | Records that outreach was made for a match. |
| `dismissMatchmakingWorkQueueItem` | Snoozes a work queue item for 30 days. |

**Entities touched:** `customerNeeds`, `vendorSupply`, `matchmakingMatches`.

**Connected features:** Leads to **Purchase Orders** (accepted match → PO creation). Reads from **Clients** (customer records). Reads from **Vendors** (vendor records). Reads from **Inventory** (available lots may satisfy supply records).

---

## Referees

**Purpose:** Tracks broker/referee relationships, fee structures, and accrued referee credits for parties who introduce customers or vendors to the business.

**Who uses it:** `manager` and `owner` for setup. `operator` can view. Used by accounting for fee tracking.

**The flow:**

1. Create referee: `createReferee` → creates a referee record.
2. Update: `updateReferee` → edits referee details.
3. Add relationship: `addRefereeRelationship` → defines a fee relationship between a referee and a customer or vendor (percentage, fixed, or hybrid fee structure).
4. Update relationship: `updateRefereeRelationship`.
5. Deactivate relationship: `deactivateRefereeRelationship`.
6. Credits accrue automatically based on sales involving the referee's customers/vendors.
7. Void a credit: `voidRefereeCredit` → voids an accrued referee credit.

> ⚠️ Inferred — verify before relying on this: The fee calculation logic (when credits accrue, at posting vs. payment) was not fully documented in the source files reviewed. Check `src/server/commands/` for the `addRefereeRelationship` and `voidRefereeCredit` handlers to confirm accrual timing.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createReferee` | Creates a new referee record. |
| `updateReferee` | Updates referee details. |
| `addRefereeRelationship` | Adds a fee relationship (%, fixed, or hybrid) to a referee. |
| `updateRefereeRelationship` | Updates an existing referee relationship. |
| `deactivateRefereeRelationship` | Deactivates a referee relationship. |
| `voidRefereeCredit` | Voids an accrued referee credit. |

**Entities touched:** `referees`, `refereeRelationships`, `refereeCredits`.

**Connected features:** Linked to **Clients** (referee → customer relationship). Linked to **Vendors** (referee → vendor relationship). Linked to **Sales Orders** (credits may accrue on posting).

---

## Processors / Connectors

**Purpose:** Manages external integrations (payment processors, data connectors) — providing a review queue where operators approve or reject incoming external requests before any ledger mutation occurs.

**Who uses it:** `operator` and above. `manager`/`owner` for approval decisions.

**The flow:**

1. External connector submits a request to the system (via an external API call).
2. Request appears in the Connectors view as a pending item — it has NOT mutated any ledger data.
3. Operator reviews the request. Three outcomes:
   - `approveConnectorRequest` → approves; the system executes the corresponding internal command.
   - `rejectConnectorRequest` → rejects; request is marked rejected with operator notes.
   - `routeConnectorRequest` → reassigns the request to a different operator queue. Exposed in the UI as a **"Reassign inbound request" button** in `OperationsViews.tsx:2463`. (Earlier documentation describing this as backend-only is incorrect.)
4. Payment processor records: `createPaymentProcessor` → creates a processor record. `updateProcessor` → updates it.
5. Fee tracking: `markUserFeeCollected` → marks a user-facing portion of a processor fee as collected. `updateProcessorFeeStatus` → updates fee status.

**Key nuances:**
- Connectors **never** directly mutate ledgers. Every connector request goes through the operator review queue first. This is a hard architectural rule, not a UX pattern.
- `routeConnectorRequest` is surfaced in the UI as the "Reassign inbound request" button (`OperationsViews.tsx:2463`). Despite being in `internalOnlyCommandNames`, the reassignment surface exists.
- Review history is persisted for every connector request (approved, rejected, and routed).
- Default status for a freshly-arrived connector request is `'open'` (schema default in `schema.ts:481`), not `'pending'`.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `approveConnectorRequest` | Approves an incoming connector request. |
| `rejectConnectorRequest` | Rejects an incoming connector request with operator notes. |
| `routeConnectorRequest` | Routes a connector request to an operator queue (internal). |
| `createPaymentProcessor` | Creates a payment processor/connector record. |
| `updateProcessor` | Updates a payment processor record. |
| `markUserFeeCollected` | Marks a user-facing fee portion as collected. |
| `updateProcessorFeeStatus` | Updates the status of a processor fee. |

**Entities touched:** `connectorRequests`, `paymentProcessors`, `processorFees`.

**Connected features:** Can feed any downstream workflow depending on the request type. Structurally isolated from ledger writes until approved.

---

## Reports

**Purpose:** Provides read-only analytical views over sales, inventory, payments, vendors, and clients — supporting business decision-making without risk of data mutation.

**Who uses it:** All roles. `viewer` is the natural fit. No commands are executed from Reports.

**The flow:**

Reports (`ViewKey: 'reports'`) is a collection of read-only tRPC-powered grids. No commands are available from this view. Reports cover:
- Sales summary (by customer, by product, by period)
- Inventory aging and valuation
- Payment and AR summary
- Vendor and AP summary
- Client balance summary

> ⚠️ Inferred — verify before relying on this: The exact report types available were not individually enumerated in the source files reviewed. Check `src/client/views/ReportsView.tsx` and the corresponding tRPC router for the definitive list of report surfaces.

**Commands involved:** None.

**Entities touched:** All entities (read-only via tRPC query procedures).

**Connected features:** Depends on data from all other feature areas.

---

## Closeout

**Purpose:** Manages the end-of-period archival process — reviewing the period, making final adjustments, locking it from further edits, and producing control-total artifacts.

**Who uses it:** `owner` only (period lock and archive are owner-level operations). `manager` can view.

**The flow:**

1. Owner reviews the period in the Closeout view (`closeout`): checks control totals, open invoices, unallocated payments, and pending vendor bills.
2. Period adjustments: `postPeriodAdjustments` → creates multiple correction journal entries for the period. Any `createCorrectionJournalEntry` can also be used individually.
3. The system enforces that unsafe rows (e.g., open posted orders with no invoice, unresolved errors) must be resolved before close.
4. Lock: `lockPeriod` → prevents any further transactions from being posted to this period. Status-locked.
5. Archive: `archivePeriod` → creates control-total artifacts (CSV, JSONL, PDF files) and marks the period as fully archived.

**Key nuances:**
- Period lock and archive are **irreversible** at the application level. A restore requires offline maintenance.
- The system refuses to lock a period with unsafe rows — each unsafe row must be resolved or explicitly acknowledged.
- Archive produces deterministic artifacts written to `ARCHIVE_DIR`.
- `createCorrectionJournalEntry` is the tool for manual ledger corrections during the adjustment phase.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `postPeriodAdjustments` | Posts multiple correction journal entries for a period. |
| `createCorrectionJournalEntry` | Creates a single manual correction entry in the journal. |
| `lockPeriod` | Locks a period from further transactions. |
| `archivePeriod` | Archives a locked period; creates control-total artifacts. |

**Entities touched:** `periods`, `commandJournal`, `correctionEntries`, `archiveArtifacts`.

**Connected features:** Depends on **all feature areas** being in a clean state. Irreversibly closes the financial period.

---

## Recovery

**Purpose:** Provides tools for finding, reviewing, and undoing past commands — the system's undo/support layer for operator mistakes and data investigation.

**Who uses it:** `manager` and `owner` for reversals. `operator` and support roles can search and view. `viewer` can view the journal.

**The flow:**

1. Operator navigates to Recovery (`recovery`) and searches the command journal by entity, command name, actor, or date.
2. Operator finds a problematic command and previews the reversal: `restoreFromBackupPoint` → a read-only preview showing what the reversal would do (before/after snapshots). Does not execute.
3. Operator executes the reversal: `reverseCommandById` → runs the compensating command, creating a new journal entry with `reversedByCommandId` pointing to the original.
4. If a command failed: `documentCommandFailure` → adds a reason/note to a failed journal entry.
5. Failed command retry: the stored `inputPayload` in the journal allows the operator to re-submit the original command payload (see the `input_payload` column added in the gap closure migration).
6. Support packet export: the Recovery view can generate a support packet (a snapshot-diff showing what happened around a given command). 

**Key nuances:**
- `restoreFromBackupPoint` is **intentionally read-only**. It never executes a restore — it only previews. Full destructive restore requires an offline maintenance operation by the owner.
- `reverseCommandById` only works on commands that are marked reversible in the command catalog. Non-reversible commands (terminal operations) cannot be reversed through the app.
- The `input_payload` column was added in migration `0002_workflow_gap_closure.sql`. Prior commands may not have stored payloads, making retry impossible for those records.
- Reversal is restricted to `manager` and `owner` roles.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `reverseCommandById` | Reverses a previously executed reversible command. |
| `documentCommandFailure` | Adds a reason/note to a failed command journal entry. |
| `restoreFromBackupPoint` | Read-only preview of what a restore would do (does not execute). |
| `createCorrectionJournalEntry` | Creates a manual correction entry (also used in Closeout). |

**Entities touched:** `commandJournal` (primary). All other entities affected by the reversal logic.

**Connected features:** Cross-cutting — can affect any feature area that has reversible commands. Works alongside **Closeout** (correction entries).

---

## Photography

**Purpose:** Manages the media readiness workflow for inventory lots — ensuring that batches have photos published before they are presented in customer-facing contexts.

**Who uses it:** Photographer/readiness role (`operator` workLoop). Sales operators check `mediaStatus` before sending customer sheets.

**The flow:**

1. A batch arrives from Intake with `mediaStatus: 'open'` (no photos).
2. Photographer navigates to Photography view (`photography`) to see all batches needing photos.
3. Photo upload token generated: `mintPhotoUploadToken` → creates a temporary upload token for mobile capture.
4. Photos uploaded via mobile: `uploadBatchMedia` → stores the file.
5. Role set: `setBatchMediaRole` → designates one photo as `primary_photo`.
6. Published: `publishBatchMedia` → `mediaStatus` moves from `open` → `ready` → `done`.
7. If a photo is wrong: `deleteBatchMedia` → removes it.
8. Token revoked if unused: `revokePhotoUploadToken`.

**Key nuances:**
- `mediaStatus` values: `'open'` (no photos), `'ready'` (uploaded but not published), `'done'` (published and visible).
- The legacy `attachBatchPhoto` command stores a URL string and predates the structured media system. New code should use the `uploadBatchMedia` → `setBatchMediaRole` → `publishBatchMedia` flow.
- Only published media is visible to customers/in the customer sheet.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `mintPhotoUploadToken` | Creates a temporary token for mobile photo uploads. |
| `revokePhotoUploadToken` | Revokes an active upload token. |
| `uploadBatchMedia` | Uploads a photo or video for a batch. |
| `setBatchMediaRole` | Sets the role of a media item (e.g., primary_photo). |
| `publishBatchMedia` | Publishes a draft media item. mediaStatus → done. |
| `deleteBatchMedia` | Deletes a media item and its files. |
| `attachBatchPhoto` | (Legacy) Attaches a photo URL directly. |

**Entities touched:** `batches` (`mediaStatus`), `batchMedia`.

**Connected features:** Directly linked to **Inventory** (same batch records). Feeds **Sales Orders** (`mediaStatus: 'done'` signals catalog-ready batches).

---

## Contacts

**Purpose:** Manages a universal identity system for all people and businesses — contacts can hold multiple roles (customer, vendor, referee) and track appointments and communication history.

**Who uses it:** Sales operators for customer contact management. All roles for appointment tracking. `manager`/`owner` for contact role management.

**The flow:**

1. Create contact: `createContact` → creates a universal contact record with `contactKind` (`individual` or `business`).
2. Update: `updateContact` → edits contact details.
3. Add role: `addContactRole` → assigns a role to the contact (e.g., `customer`, `vendor`, `referee`). This is what links a contact to a customer or vendor entity.
4. Link to existing entity: `linkContactToExistingEntity` → links a contact to an existing customer, vendor, etc. (for migrated records).
5. Link to user: `linkContactToUser` → links a contact to a system user account.
6. Archive: `archiveContact` → deactivates the contact.
7. Appointment management:
   - `createAppointment` → schedules an appointment for the contact.
   - `updateAppointment` → edits an appointment.
   - `cancelAppointment` → cancels. Status → `cancelled`.
   - `completeAppointment` → marks completed. Status → `completed`.
8. The `contacts-customer-orders` view provides a cross-reference of contacts and their associated orders.

**Key nuances:**
- **Known planned feature (not yet implemented):** A contact merge/deduplicate workflow is planned but not built. A TODO comment in `ContactsView.tsx` marks where this should be exposed.
- Contacts are the universal identity layer. Customers and vendors are roles applied to contacts, not separate entity types with their own names.
- `appointments.status` values: `'scheduled'`, `'completed'`, `'cancelled'`.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `createContact` | Creates a new universal contact record. |
| `updateContact` | Updates contact details. |
| `archiveContact` | Archives (deactivates) a contact. |
| `addContactRole` | Adds a role (customer, vendor, referee) to a contact. |
| `linkContactToExistingEntity` | Links a contact to an existing customer/vendor entity. |
| `linkContactToUser` | Links a contact to a system user account. |
| `createAppointment` | Creates an appointment for a contact. |
| `updateAppointment` | Updates an appointment. |
| `cancelAppointment` | Cancels an appointment. Status → `cancelled`. |
| `completeAppointment` | Marks an appointment as completed. Status → `completed`. |

**Entities touched:** `contacts`, `appointments`, `contactLedgerEntries`, `customers`, `vendors`.

**Connected features:** Foundation for **Clients** and **Vendors** (roles applied to contacts). Linked to **Referees**.

---

## Dashboard

**Purpose:** Provides the owner/manager daily decision view — KPI cards that drill into source rows, a unified work queue, pending queues, and recent activity for rapid daily triage.

**Who uses it:** `owner` and `manager` primarily. `operator` uses it for work queue navigation. `viewer` for overview.

**The flow:**

1. Dashboard (`dashboard`) loads KPI cards with counts and values for: open orders, outstanding invoices, pending intake, fulfillment queue, etc.
2. KPI cards drill into the relevant source view when clicked.
3. A work queue grid surfaces the day's most urgent items requiring operator action.
4. Queue cards route to the owning view/lane (e.g., an intake queue card navigates to the Intake view).
5. No commands are executed from the dashboard — it is a navigational and situational-awareness surface.

**Key nuances:**
- The work queue query and grid were added during the J01 gap closure. Prior to that fix, queue cards existed but did not navigate to work.
- Dashboard is read-only — all actions happen in the destination views.

> ⚠️ Inferred — verify before relying on this: The exact KPI card definitions and work queue query filters were not individually enumerated in the source files reviewed. Check `src/client/views/DashboardView.tsx` and the tRPC `dashboard` router for the definitive list.

**Commands involved:** None.

**Entities touched:** All entities (read-only via tRPC query procedures).

**Connected features:** Entry point to all feature areas via drill-down navigation.

---

## Settings

**Purpose:** Manages system-level configuration — default pricing rules, transaction type definitions, and credit engine configuration.

**Who uses it:** `owner` for all settings. `manager` may access some settings.

**The flow:**

1. Settings (`settings`) surfaces global configuration options.
2. Default pricing: `setDefaultPricingRule` → sets the system-wide default pricing rule applied when no customer-specific rule exists.
3. Transaction types: `upsertTransactionType` → creates or updates a transaction type definition used by the ledger.
4. Credit engine config: `setCreditEngineConfig` → updates global credit engine parameters.
5. Credit engine stances: `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance` — manage the scoring profiles.

> ⚠️ Inferred — verify before relying on this: The full list of settings surfaces was not individually enumerated. Check `src/client/views/SettingsView.tsx` for the complete settings panel list.

**Commands involved:**

| Command | Description |
|---------|-------------|
| `setDefaultPricingRule` | Sets the system-wide default pricing rule. |
| `upsertTransactionType` | Creates or updates a transaction type definition. |
| `setCreditEngineConfig` | Updates global credit engine configuration. |
| `createCreditEngineStance` | Creates a credit engine stance. |
| `updateCreditEngineStance` | Updates a credit engine stance. |
| `deleteCreditEngineStance` | Deletes a credit engine stance. |

**Entities touched:** `systemConfig`, `transactionTypes`, `creditEngineConfig`, `creditEngineStances`.

**Connected features:** Affects **Sales Orders** (default pricing), **Credit Review** (engine config and stances), **Payments/AR** (transaction types).

---

## Command Palette / Quick Launch

**Purpose:** System-wide keyboard-first shortcut overlay for the most common operator workflows, accessible from any view without navigating away.

**Who uses it:** All roles. Activated with `Cmd+K`.

**Quick Launch Entries:**

| Entry | What it does |
|-------|-------------|
| `sale` | Opens a new Sales Order draft |
| `purchaseOrder` | Opens a new Purchase Order draft |
| `receiving` | Opens the Intake view ready for a new batch |
| `moneyIn` | Opens the Log Payment dialog |
| `moneyOut` | Opens the Record Vendor Payment dialog |
| `customerNeed` | Opens the Create Customer Need dialog |
| `vendorSupply` | Opens the Create Vendor Supply dialog |

**Additional keyboard shortcuts:**
- `Cmd+1..N` — Switch to the Nth view in the nav order (defined in `Hotkeys.tsx`).
- AG Grid native shortcuts: Tab, Enter, Esc, Cmd+C, Cmd+V for inline editing.

**Commands involved:** Initiates but does not directly execute commands — opens the relevant form/dialog for the operator to complete.

---

## Cross-Cutting Concerns

---

### Audit Trail

Every state mutation in TERP Operator is recorded in the `commandJournal` table. This is the canonical audit log.

**`commandJournal` schema:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Unique journal entry ID |
| `commandName` | varchar | The name of the command executed |
| `idempotencyKey` | varchar (unique) | Client-stamped key preventing duplicate execution |
| `actorId` | uuid (fk `users`) | The user who executed the command |
| `actorName` | varchar | Denormalized actor display name at execution time |
| `actorRole` | varchar | Denormalized actor role at execution time |
| `status` | varchar | `pending`, `ok`, or `failed` |
| `inputPayload` | jsonb | The original command payload (stored verbatim for replay-safe retry) |
| `beforeSnapshot` | jsonb | Snapshot of affected rows before the mutation |
| `afterSnapshot` | jsonb | Snapshot of affected rows after the mutation |
| `result` | jsonb | Command execution result data (sensitive values like raw photo tokens are redacted) |
| `affectedIds` | text[] | FK-graph of entity IDs touched by the command (used for Socket.io broadcast targeting) |
| `reason` | text | Operator-supplied reason, when the command captures one |
| `error` | text | Raw error message when `status='failed'` |
| `reversedByCommandId` | uuid (self-referential) | Points to the reversal command entry, if reversed |
| `createdAt` | timestamp | When the command was executed |

A parallel **JSONL journal file** (append-only, on-disk) is written for every command. This provides an offline-readable audit trail independent of the database.

**Reading the journal:** To see everything that happened to a specific entity (e.g., a sales order), search `commandJournal` by the entity ID in `beforeSnapshot`/`afterSnapshot`, or by the `inputPayload` fields containing the entity ID. The Recovery view provides a UI for this search.

---

### Reversals (Detail)

Reversals are compensating commands that undo a prior command's effects. They are **not deletes** — both the original command and the reversal appear in the journal, linked via `reversedByCommandId`.

**How reversals work:**
1. `reverseCommandById` is called with the target journal entry ID.
2. The command bus looks up the command's `reversalPolicy` in the catalog.
3. If reversible: the compensating DB operations are executed (e.g., restore balance, return inventory to `live`, void the invoice).
4. A new `commandJournal` entry is created for the reversal command.
5. The original entry's `reversedByCommandId` is set to the new reversal entry's ID.

**Commands with full reversal support** (confirmed via adversarial QA fix):
- `logPayment` → reversal restores customer balance
- `allocatePayment` → reversal returns payment to unapplied
- `recordVendorPayment` → reversal unwinds vendor payout
- `markOrderFulfilled` → reversal reopens fulfillment
- `approveConnectorRequest` → reversal cancels the approved action
- `createCorrectionJournalEntry` → reversal removes the correction entry
- `postSalesOrder` → reversal voids the invoice and restores balance (strong balance handling)

**Terminal commands** (cannot be reversed through the app):
- `lockPeriod` — period lock is irreversible in the app; requires offline maintenance
- `archivePeriod` — same
- `restoreFromBackupPoint` — preview-only, never executes

> ⚠️ Inferred — verify before relying on this: The complete list of reversible vs. terminal commands is defined in `reversalPolicies` within `src/shared/commandCatalog.ts`. Check that file for the authoritative classification of every command.

---

### RBAC — Full Role Matrix

| Role | Purchase Orders | Intake | Inventory | Sales Orders | Payments | Vendor Bills | Reversals | Period Closeout |
|------|----------------|--------|-----------|-------------|---------|-------------|---------|---------------|
| `viewer` | Read | Read | Read | Read | Read | Read | None | None |
| `operator` | Create, Edit | Create, Post | Adjust, Status | Create, Confirm | Log, Allocate | Read | None | None |
| `manager` | Approve | Approve | All | Post | All AR | Approve, Schedule, Record | Can reverse | None |
| `owner` | All | All | All | All | All | All | Can reverse | Lock, Archive |

**Enforcement:** All RBAC is enforced **server-side** in command handlers via `assertCommandAccess` in `src/server/rbac.ts`. UI-side gating (hiding buttons) is a convenience display feature, NOT a security control.

**Per-command minimum roles (footnote).** The summary matrix above is a coarse approximation. Exact minimum roles per command are defined in `commandCatalog.ts`. Key non-obvious minimums that contradict an "operator can do all daily ops" reading:

- `cancelSalesOrder` requires **`manager`** (not `operator`).
- `adjustBatchQuantity` requires **`manager`**.
- `setInventoryStatus` requires **`manager`**.
- `transferInventoryOwnership` requires **`manager`**.
- `applyClientCredit` requires **`manager`**.
- `repriceOrder` requires **`manager`**.
- `mintPhotoUploadToken` and `revokePhotoUploadToken` require **`manager`**.
- `unallocatePayment`, `refundPayment`, `applyEarlyPayDiscount`, `postTransactionLedgerRow`, `upsertTransactionType` require **`manager`**.

Treat `commandCatalog.ts` as the source of truth, not this summary table.

**workLoop field:** Users have a `workLoop` value (`sales`, `intake`, `warehouse`, `operator`) that customizes the navigation display order, but does NOT restrict command access.

---

### Real-time Updates

TERP Operator uses **Socket.io** to push command results to all connected clients in real time.

**Flow:**
1. Command completes (success or failure) on the server.
2. Server emits a `command:completed` or `command:failed` Socket.io event to all connected clients.
3. Each client receives the event.
4. The relevant tRPC query cache is invalidated.
5. AG Grid refreshes automatically with fresh data.
6. A toast notification appears in the UI.

This means multiple operators can work simultaneously, and each operator's screen reflects what others are doing without manual refresh. The grid update is reactive, not polling.

---

### Known Gaps and Open Issues

The following gaps were identified and documented in `docs/workflow-gap-audit.md`. Each has been addressed in the gap-closure implementation pass, but the notes describe what was found and what was fixed.

---

#### J01: Owner Daily Decision View — Missing Work Queue Navigation

**What was broken:** Dashboard KPI drilldowns existed, but work queues did not navigate to work items, and there was no unified source queue.

**Expected behavior:** Queue cards should route operators to the owning lane (e.g., an intake queue card navigates to the Intake view filtered to the relevant items).

**Fix shipped:** Added dashboard work queue query and grid; queue cards now route operators to the owning view/lane.

**Status:** Closed.

---

#### J02: Fast Inventory Intake — Missing Columns

**What was broken:** Intake grid lacked several workbook-native columns required by the operator workflow bible: source code, intake date, ticket cost, price range, notes, ownership, arrival metadata.

**Expected behavior:** Intake grid should include all columns operators use in their Apple Numbers workflow — full metadata visibility in the grid.

**Fix shipped:** Added schema migration and UI columns for source code, intake date, ticket cost, price range, notes. Duplicate rows preserve metadata.

**Status:** Closed.

---

#### J03: Guided Selling / Sales Sheet — Limited Filters and Non-real Export

**What was broken:** Inventory suggestions in the sales view were customer-only filtered; export was not a real CSV. Category, vendor, tag, price bracket, and aging filters were missing.

**Expected behavior:** Rich multi-dimensional filtering for inventory selection. CSV export should hide cost/margin in customer-facing catalog mode.

**Fix shipped:** Added category, vendor, tag, price bracket, and aging filters. Suggestion reasons include pricing logic. CSV export hides cost/margin in catalog mode.

**Status:** Closed.

---

#### J04: Client Order Posting — Missing Ready/Confirm and Duplicate Source Row Guard

**What was broken:** Posting was guarded against duplicate order posting but not duplicate source rows (same batch on two concurrent orders). The "Ready" action was underexposed.

**Expected behavior:** Explicit Ready/Confirm action required before posting. Duplicate source rows should be refused at posting time.

**Fix shipped:** Added Ready/confirm action, duplicate source-row refusal, `sourceRowKey` tracking, reprice action.

**Status:** Closed.

---

#### J05 / DYN-H3: Payment Logging — FIFO Auto-Allocation Not Executing

**What was broken:** `logPayment` with `allocationIntent='fifo'` did not auto-allocate to open invoices. The UI did not expose the invoice selector, bucket, notes, or reference fields.

**Expected behavior:** When `allocationIntent='fifo'`, the system should allocate the payment to oldest open invoices automatically. If auto-allocation fails, the operator should be shown the invoice selector and prompted to allocate manually.

**Fix shipped:** Added invoice selector, bucket, reference, and notes fields to the payment UI. `logPayment` now auto-executes `allocatePayment` in the same transaction (`commandBus.ts:3697-3731`) when intent is `'fifo'` or `'selected_invoice'`. Auto-allocation gracefully skips with a toast when no open invoices exist; the payment is logged as unapplied.

**Status:** ✅ **Closed.** Issue #26 resolved.

---

#### J06: Vendor Payable — Unscheduled Payout and Missing Consignment Signal

**What was broken:** Vendor payment could be recorded before the bill was scheduled. Consignment inventory depletion did not trigger the vendor bill to become due.

**Expected behavior:** `recordVendorPayment` should refuse if the bill is not scheduled. Consignment depletion should automatically surface the vendor bill as due.

**Fix shipped:** `recordVendorPayment` now requires `scheduled` status. Consigned depleted lots trigger/approve vendor bill due status automatically.

**Status:** Closed.

---

#### J07: Fulfillment and Bagging — Missing Line-Level Controls

**What was broken:** Only pick-list header actions existed. Line-level weigh/pack, bag assignment, actual qty/weight, label printing, and manifest generation were absent.

**Expected behavior:** Full line-level fulfillment workflow with physical pack details captured per line. Bag manifests generated as artifacts.

**Fix shipped:** Added fulfillment line query/grid, pack controls, manual/auto bag code, actual qty/weight fields, 4x6/2x1 label printing, tracking, and manifest CSV generation.

**Status:** Closed.

---

#### J08: Connector Request Review — Missing Reject and Operator Notes

**What was broken:** Approve existed but reject and operator notes were missing. Routing was overexposed as a direct user action.

**Expected behavior:** Full approve/reject workflow with operator notes. Routing should remain a backend/internal behavior.

**Fix shipped:** Added `rejectConnectorRequest` and operator notes. Routing retained as backend behavior with persisted review history.

**Status:** Closed.

---

#### J09: Mistake Recovery — Missing Retry and Support Packet

**What was broken:** Reversal preview existed, but retry was impossible (input payload not stored). Support packet export and snapshot diff were missing.

**Expected behavior:** Full recovery workflow: search commands, preview reversal, retry failed commands, export support packet, view snapshot diff.

**Fix shipped:** `commandJournal.input_payload` now stores original command payload for replay-safe retry. Added search UI, retry failed command, support packet export, correction journal entry, snapshot diff, and restore preview controls.

**Note:** Commands executed before migration `0002_workflow_gap_closure.sql` do not have stored `input_payload`. Retry is not possible for those historical records.

**Status:** Closed for new commands; historical commands pre-migration cannot be retried.

---

#### J10: Archive and Closeout — Missing Adjustment Controls and Control Totals

**What was broken:** Lock/archive existed, but adjustment controls and control-total visibility were thin.

**Expected behavior:** Full adjustment workflow before lock. Explicit control total display. Unsafe rows should be refused at lock time.

**Fix shipped:** Added closeout adjustment controls and explicit control total display. Archive produces CSV/JSONL/PDF artifacts and refuses unsafe rows.

**Status:** Closed.

---

#### DYN-H4 / Issue #27: Matchmaking Status Transitions Unconstrained

**What was broken:** `customer_needs` and `vendor_supply` status transitions had no enforcement. Status could be set to any value without validation.

**Expected behavior:** Defined lifecycle with enforced transitions.

**Fix shipped:** `assertValidNeedStatusTransition` and `assertValidSupplyStatusTransition` implemented in `commandBus.ts:5197-5224`. Valid need transitions: `open → matched | closed`. Valid supply transitions: `open → held_for_match | closed`. Any invalid transition throws server-side.

**Status:** ✅ **Closed.** Issue #27 resolved.

---

#### Planned but Unimplemented: Contact Merge / Deduplicate UI

**What's missing:** The `ContactsView.tsx` contains a TODO comment: "Contact merge UI — when implemented, expose a deduplicate workflow here." There is no deduplication command or UI currently.

**Expected behavior:** A workflow for merging duplicate contact records into a single canonical record.

**Status:** Open — planned but not scheduled.

---

## Glossary

**Allocate / Unallocate** — To tie a customer payment to specific invoice(s) (`allocatePayment`), or to reverse that tie and return the amount to unapplied balance (`unallocatePayment`). FIFO is the default allocation intent.

**Appointment** — A scheduled interaction with a contact. Statuses: `scheduled`, `completed`, `cancelled`. Managed via the Contacts view.

**Archive** — The end-of-period action (`archivePeriod`) that produces control-total artifacts (CSV, JSONL, PDF) and marks the period permanently closed. Irreversible in the app.

**arrivalStatus** — A field on `batches` tracking physical arrival: `'pending'` (expected but not here), `'arrived'` (physically present), `'cancelled'` (never coming).

**Batch** — The atomic unit of sellable inventory. A lot received from a vendor. Carries qty, cost, price, status, photos, and lot metadata. Statuses: `draft`, `ready`, `live`, `posted`, `sold`, `depleted`, `rejected`, `flagged`, `needs_fix`, `returned`.

**Below-Floor Pricing** — When a sales line is priced below the batch's floor price. Requires `setLineBelowFloorReason` and may require `resolveVendorApproval` before the order can advance.

**Closeout** — The end-of-period process: adjustments → lock → archive. Produces control totals and artifacts. Owner-only operation.

**Command** — A typed, named, idempotent mutation. Every state change in TERP Operator goes through the command bus. There are 130 named commands in `src/shared/commandCatalog.ts`.

**Command Bus** — The server-side service (`src/server/services/commandBus.ts`) that validates, executes, and journals commands.

**commandJournal** — The database table that records every command executed: who ran it, what the payload was, what changed (before/after snapshots), and whether it succeeded or failed.

**Connector** — An external integration. Connector requests are held in a review queue and do not mutate the ledger until explicitly approved by an operator.

**Consignment** — An inventory ownership arrangement where the vendor retains ownership until the product is sold. `ownershipStatus: 'C'`. The vendor bill is not due until consignment inventory is depleted.

**Contact** — A universal identity record for any person or business. Can hold multiple roles: customer, vendor, referee. The foundation of the Clients, Vendors, and Referees systems.

**Credit Engine** — An automated system that computes recommended credit limits for customers based on signal weightings (payment history, order volume, etc.). Can be disabled per customer or globally configured via `setCreditEngineConfig`.

**Credit Limit Source** — The `creditLimitSource` field on customers indicates whether the active limit is `'manual'` (operator-set) or `'engine'` (credit engine computed).

**Customer Need** — A record of a customer's product request, used in the Matchmaking workflow. Status lifecycle is enforced server-side: valid transitions are `open → matched | closed`.

**Depleted** — A batch status indicating the batch has no remaining available quantity. Distinct from `sold` (fully sold through sales orders) — `depleted` may include adjustments or transfers.

**Drawer** — The right-side contextual panel in the UI. State machine: `closed → peek → standard → wide → focus → standard`. Managed by Zustand `uiStore`.

**Flagged** — A batch status indicating an operator has flagged it for attention (see `flagBatch`). A flagged batch has a validation issue note but can still be posted.

**Fulfillment** — The physical pick, weigh, and pack process for posted sales orders. Managed via `pickLists` and `fulfillmentLines`.

**idempotencyKey** — A client-stamped unique key (`${commandName}-${uuid}`) sent with every command. Prevents duplicate execution on retries. The command bus returns the cached result for any duplicate key.

**Intake** — The physical receipt and verification of product from a vendor. The airlock through which all inventory must pass before becoming live/sellable. Managed in the `intake` view.

**Invoice** — The financial record created when a sales order is posted. Tracks amount, due date, and payment status. Statuses: `open`, `partial`, `paid`, `reversed`.

**JSONL Journal** — An on-disk append-only log of every command, parallel to the `commandJournal` database table. Provides an offline-readable audit trail.

**Landed Cost** — The total cost of goods including shipping and handling. Set on sales order lines via `setLineLandedCost` for accurate margin tracking.

**Live** — The primary sellable status for inventory batches. A batch must be `live` to appear in the sales inventory selector.

**Lock** — The period lock action (`lockPeriod`) that prevents any further transactions from being posted to a period. Irreversible in the app.

**Manager** — An RBAC role with elevated access. Can approve POs, approve/schedule/record vendor bill payments, and execute reversals. Cannot lock/archive periods.

**matchmaking** — The workflow for pairing customer product needs with available vendor supply. A structured brokering process before a PO or sales order is created.

**mediaStatus** — A field on `batches` tracking photo readiness: `'open'` (no photos), `'ready'` (uploaded but not published), `'done'` (published/catalog-ready).

**Operator** — (1) The human user of TERP Operator (the operator persona). (2) An RBAC role with standard read/write access. Can create orders, log payments, manage intake, and run fulfillment.

**Owner** — The highest RBAC role. Full access including reversals and period lock/archive.

**ownershipStatus** — A field on batches and PO lines indicating product ownership: `'C'` = consignment (vendor-owned until sold), `'OFC'` = office-owned (purchased outright), `'UNKNOWN'` = not yet determined.

**Pick / Pick List** — A warehouse fulfillment work order created from a posted sales order. Managed in `pickLists` and `fulfillmentLines` tables. The `pick` view is the mobile-optimized warehouse UI.

**pickStatus** — A field on `salesOrderLines` tracking warehouse pick state: `unreleased`, `released`, `picking`, `picked`, `recall_pending`.

**Post** — To commit a financial transaction. Posted transactions are generally only undone via a reversal command. Posting a sales order creates an invoice. Posting an intake batch creates live inventory and a vendor bill.

**Processor** — A payment processor or external data connector. Managed in the `processors`/`connectors` view.

**Purchase Order (PO)** — A formal order placed with a vendor. Lifecycle: `draft` → `finalized` → `approved` → (received) → `partially_received` → `received`. Side exits: `cancelled`, `ordered`.

**Quick Launch** — The Cmd+K Command Palette's shortcut entries for the most common operator actions: `sale`, `purchaseOrder`, `receiving`, `moneyIn`, `moneyOut`, `customerNeed`, `vendorSupply`.

**RBAC** — Role-Based Access Control. Roles: `viewer`, `operator`, `manager`, `owner`. Enforced server-side in command handlers.

**Ready** — An operator-set status meaning "this is good to advance to the next stage." Explicit, never implicit.

**Referee** — A broker who introduced a customer or vendor. Tracked with fee structures (percentage, fixed, or hybrid). Managed in the Referees view.

**Reserved** — An inventory quantity state where qty is held against a specific sales order but not yet sold. `reservedQty` on a batch increases; `availableQty` decreases.

**Reversal** — A compensating command that undoes the effects of a previously executed command. Not a delete — both the original and reversal appear in the journal. Only available to `manager` and `owner`.

**Sales Sheet** — A customer-facing view of available inventory showing product, qty, and price but hiding `unitCost` and `internalMargin`. `createCustomerSheetSnapshot` saves a point-in-time version.

**Sales Order** — A customer order. Lifecycle (actual statuses written by code): `'draft'` → `'confirmed'` → `'posted'` → `'fulfilled'`. Side exits: `'cancelled'`, `'reversed'`. The values `'priced'`, `'closed'`, and `'shipped'` are NOT written to `salesOrders.status` anywhere in the codebase.

**Sold** — A batch status indicating all inventory has been sold through posted sales orders.

**Stance** — A credit engine scoring profile (`creditEngineStances`) with specific signal weightings. Assigned to customers via `setCustomerStance`.

**Spreadsheet-Native** — TERP Operator's core design principle: dense grids, ≤8 columns, inline edits, keyboard control. Derived from the operator's preference for Apple Numbers-style workflows.

**Terminal Command** — A command that cannot be reversed through the app (e.g., `lockPeriod`, `archivePeriod`). Requires offline maintenance for recovery.

**tRPC** — The type-safe API layer between the React client and Node.js server. All data queries go through tRPC procedures. Mutations go through the command bus (not directly via tRPC query).

**Unapplied** — A payment state where the payment has been logged but not yet allocated to any specific invoice. Unapplied payments reduce credit usage but don't close invoices.

**Vendor Bill** — Money owed to a vendor. Created automatically on intake receipt posting. Lifecycle (actual statuses): `'open'` → `'approved'` → `'scheduled'` → `'paid'`. Side exits: `'partial'`, `'reversed'`, `'cancelled'`. `'created'` is NOT a vendor bill status; `'void'` is the status on `vendorPayments` (not on `vendorBills`).

**Vendor Supply** — A record of a vendor's available product, used in the Matchmaking workflow. Status lifecycle is enforced server-side: valid transitions are `open → held_for_match | closed`.

**Viewer** — The RBAC role with read-only access to all views. Cannot execute any commands.

**ViewKey** — The TypeScript union type in `src/shared/types.ts` that defines every valid screen in the application. Canonical list: `dashboard`, `reports`, `purchaseOrders`, `intake`, `sales`, `matchmaking`, `orders`, `payments`, `inventory`, `clients`, `vendors`, `fulfillment`, `connectors`, `recovery`, `closeout`, `referees`, `processors`, `credit-review`, `photography`, `contacts`, `contacts-customer-orders`, `settings`, `pick`.

**workLoop** — A field on `users` that customizes their navigation display order: `sales`, `intake`, `warehouse`, `operator`. Does not restrict command access.

**Zustand** — The client-side UI state management library. Manages drawer state, active view, palette state, and focus mode via `useUiStore`. Server data is NOT stored in Zustand.

**decimal.js** — JavaScript library used for all financial math in TERP Operator. Prevents floating-point errors in money calculations. All amounts are accumulated via `Decimal` instances with `ROUND_HALF_UP` rounding at 20-digit precision. Native JS floats must never be used for money math.

**internalOnlyCommandNames** — A list of commands (currently 8) that have a backend handler but no UI surface in the operator console (tracked under issue #111). They cannot be invoked from the operator console today: `routeConnectorRequest`, `setCustomerEngineMax`, `setCustomerStance`, `disableCreditEngineForCustomer`, `createCreditEngineStance`, `updateCreditEngineStance`, `deleteCreditEngineStance`, `bulkRevertCustomersToEngine`. Note: `routeConnectorRequest` is actually surfaced as the "Reassign inbound request" button despite being in this list.

**JOURNAL_DIR** — Environment variable pointing to the directory holding the JSONL command journal file. Separate from `ARCHIVE_DIR`, which holds period archive artifacts and bag manifests.

**pendingFrontendCommandNames** — A list of commands (currently 18) whose backend handlers are implemented but whose client-side wiring is not yet complete. Listed explicitly in `commandCatalog.ts`; tolerated by the parity audit.

**pickReleasedAt** — A timestamp on `salesOrderLines` set when a line is released to the warehouse pick queue. The "released" state is derived from this timestamp being non-null — there is no separate `'released'` status column.

**statusExtended** — A varchar column on `fulfillmentLines` used for the `'recall_pending'` and `'cancelled'` states. It is intentionally separate from `fulfillmentLines.status` so the core pack lifecycle remains a clean state machine while exceptional states attach as a parallel marker.

**warehouseAlerts** — A jsonb column on `fulfillmentLines` tracking alerts (`recall`, `line_cancelled`, `qty_changed`) for coordination between sales operators and the warehouse. Discrepancies surface here rather than via a pick list status transition.

---

_End of TERP Operator Feature Reference_
