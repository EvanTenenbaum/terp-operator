# 13 — Domain: Fulfillment + Picking (CMD-FULFILLMENT / CAP-030)

> Ground truth: source code at the cited `file:line`. This is the warehouse-side workflow that
> takes a **posted** sales order, releases its lines to a mobile pick queue, lets a warehouse
> picker weigh/pack each bag, prints labels + a bag manifest, and marks the order fulfilled —
> handing off to Money (invoicing already created at post time). It also covers the sales↔warehouse
> coordination surface: recalls, returns, line cancellation, and warehouse alerts.

Key files:
- Command schemas/handlers: `src/server/services/commandBus.ts`
- Command catalog (names/labels/roles/reversal): `src/shared/commandCatalog.ts`
- Tables: `src/server/schema.ts` (`pickLists` L444, `fulfillmentLines` L459, `salesOrderLines` pick cols L358-359)
- Migration: `migrations/0052_pick_released_warehouse_alerts.sql`
- Query procs: `src/server/routers/queries.ts` (`pickQueue` L1641, `pickListWithLines` L1680, `releaseEligibility` L1736, `fulfillmentLines` L1010, `workQueue` L527)
- Socket emitters: `src/server/sockets.ts`; consumer `src/client/context/SocketContext.tsx`
- Client: `src/client/views/PickView.tsx`, `components/pick/{QueueScreen,PickListScreen,PickLineScreen}.tsx`, `hooks/usePickWorkLoopGuard.ts`
- RBAC: `src/server/rbac.ts`

---

## A) JOURNEY MAP

### Cast / entry points
- **Sales operator** (work-loop `sales`) finishes pricing/posting an order, then **releases** lines
  to the warehouse. Lives in `SalesView`; calls `releaseLineForPicking` / `releaseLinesForPicking`.
- **Warehouse picker** (operator with `workLoop === 'warehouse'`, or any manager/owner) works the
  mobile `/pick` route (`PickView.tsx`). The route is gated by `usePickWorkLoopGuard`
  (`src/client/hooks/usePickWorkLoopGuard.ts:14`): managers/owners always allowed; viewers always
  redirected to `/dashboard`; operators redirected unless `workLoop === 'warehouse'`.

### Handoff IN (from Sales)
A sales order must be **posted** before fulfillment artifacts can exist:
- `markOrderFulfilled` rejects unless `order.status === 'posted'` (`commandBus.ts:4043`).
- `allocateOrderToFulfillment` (alias `createPickList`) rejects unless posted (`commandBus.ts:3611`).
- `releaseLineForPicking` does **not** itself check order status, but requires the SOL to have an
  item, a `batchId`, `qty > 0`, no fatal validation issues, and a batch reservation `>= qty`
  (`commandBus.ts:4070-4081`). Reservation comes from the upstream `reserveInventoryForOrder`/post path.
- Invoices/`payment_received` receipts are already produced at **post** time (see post-sales hooks at
  `commandBus.ts:702-718`), so picking does not create money artifacts — it just gates them physically.

### Happy path (the spine)
1. **Release lines for picking.** Sales selects one or more SOLs and runs
   `releaseLineForPicking` (single) or `releaseLinesForPicking` (bulk array). Each release:
   stamps `pick_released_at`/`pick_released_by` on the SOL, lazy-creates the order's `pick_lists`
   row if absent, and lazy-creates one `fulfillment_lines` row per released SOL
   (`commandBus.ts:4060-4116`). Idempotent: a second release of an already-released line is a no-op
   (`:4066`). After commit, the bus emits `pick:queue` + `pick:order:{orderId}` + a
   `sales:order:{orderId}:line:changed` event (`commandBus.ts:732-760`).
2. **Pick queue.** Picker opens `/pick` → `QueueScreen` driven by `pickQueue`
   (`queries.ts:1641`), polled every 30s and live-refreshed by the `pick:queue` socket event.
   Only **open** pick lists that still have at least one released, un-picked (`actual_qty = 0`),
   non-cancelled fulfillment line appear (`queries.ts:1662-1670`). Rows are sorted oldest-released-first.
3. **Pick list.** Tap a queue row → `PickListScreen` via `pickListWithLines` (`queries.ts:1680`),
   polled every 10s. Each line carries a derived `pickStatus`
   (`released | picking | picked | recall_pending | cancelled | recalled`, `queries.ts:1711-1718`)
   and an `alertCount`. PickView subscribes to the order socket room on selection
   (`PickView.tsx:32-37`).
4. **Pick line (weigh / scan / confirm).** Tap a line → `PickLineScreen`. Picker enters **actual qty**,
   **actual weight (required, > 0)**, and a **bag barcode** (manual entry or `BarcodeDetector` camera
   scan; gracefully degrades to manual when unsupported — `PickLineScreen.tsx:57-80`). "Mark picked"
   validates weight client-side (`:84-90`) then runs `recordWeighAndPack`
   (`{fulfillmentLineId, actualQty, actualWeight, bagCode}`). Server sets FL `status = 'packed'`,
   stamps a `bagCode` (auto-generates `BAG-…` if blank), rewrites the bag manifest, and returns the
   `orderId` so the bus emits a `pick:order:{orderId}` refresh (`commandBus.ts:4017-4035`, `:738-740`).
5. **Auto-advance.** On success, `PickView.handleLinePicked` jumps to the next non-packed,
   non-cancelled line, or returns to the list if all are done (`PickView.tsx:117-132`).
6. **Print labels.** `printLabels` marks `labels_printed = true`, stores `label_format` (default `4x6`),
   and rewrites the manifest (`commandBus.ts:4312-4318`). NOTE: no UI button wires this in the mobile
   pick flow today — it is a command-bus / API capability (see Edge cases).
7. **Mark fulfilled (handoff OUT).** When every line is packed/cancelled, `PickListScreen` shows the
   "Complete Order" CTA (`PickListScreen.tsx:111-127`) → `markOrderFulfilled({orderId})`. Server requires
   posted status + an existing pick list + every FL `actual_qty > 0`, then sets pick list `status='fulfilled'`,
   order `status='fulfilled'`/`packed=true`/`fulfilledAt=now`, all SOLs `packed=true`, and rewrites the
   manifest (`commandBus.ts:4038-4053`). Picker is returned to the queue (`PickView.tsx:134-141`).

### Branches & alternate flows

**Recall a released line (sales-initiated).** `recallLineFromPicking` has two paths
(`commandBus.ts:4144-4195`):
- **Nothing picked** (`actual_qty = 0`): deletes the fulfillment line; if the pick list becomes empty
  it deletes the pick list too; clears `pick_released_at/by` on the SOL. The line silently leaves the
  queue.
- **Already picked/packed** (`actual_qty > 0`): does **not** delete the FL. Sets
  `status_extended = 'recall_pending'` and appends a `recall` warehouse alert. Still clears the SOL
  `pick_released_at/by` so sales can re-release later (which reuses the same FL with its pending alerts).
- Idempotent: recalling a not-released line is a no-op (`:4148`).
- **Picker-side trigger.** The picker can also invoke `recallLineFromPicking` via the **Hold** action
  on `PickLineScreen` (`PickLineScreen.tsx:105-113`) — used when the picker needs sales to confirm a
  quantity before continuing.

**Warehouse alert acknowledgement.** When a recalled-but-picked line (or a sales-side
`line_cancelled` push, below) leaves an alert on a FL, the picker is **interrupted**: `PickView`
derives `activeInterrupt` from the first non-acknowledged alert (`PickView.tsx:71-101`), and
`PickLineScreen` renders a non-dismissable full-screen `alertdialog` (focus-trapped, Escape blocked —
`:169-196`). "Acknowledge & Continue" runs `acknowledgeWarehouseAlert({fulfillmentLineId, alertIndex})`,
which splices that alert out and, if none remain, clears `status_extended` (`commandBus.ts:4201-4226`).

**Return picked units.** `returnPickedUnits({fulfillmentLineId, qty})` decrements FL `actual_qty`,
restores batch `available_qty` (+qty) and `reserved_qty` (−qty, floored at 0), and writes an
`inventory_movements` row of `kind='pick_return'` (`commandBus.ts:4231-4264`). Cannot return more than
was picked (`:4237`).

**Cancel a fulfillment line.** `cancelFulfillmentLine({fulfillmentLineId})` first calls
`returnPickedUnits` for the full `actual_qty` if anything was picked, then releases any remaining
batch reservation up to the SOL qty, then sets `status_extended='cancelled'`
(`commandBus.ts:4271-4309`). Idempotent (`:4275`). Cancelled lines drop out of `pickQueue` and are
non-tappable in `PickListScreen` (`PickListScreen.tsx:82`).

**Adjust a fulfillment line.** `adjustFulfillmentLine` is a thin alias that re-invokes
`recordWeighAndPack` with a different toast (`commandBus.ts:944-945`) — i.e. correcting qty/weight is
just another weigh-and-pack write.

### Sales↔warehouse coordination edges (CAP-030, TER-1494)
- **Cancelling a posted sales order while lines are out.** `cancelSalesOrder`
  (`commandBus.ts:3323-3365`) **blocks** if any released line has been picked (`actual_qty > 0`,
  FL not cancelled) — "Return picked units before cancelling." For released-but-unpicked lines it
  pushes a `line_cancelled` warehouse alert and sets the FL `status_extended='recall_pending'`
  (`:3341-3351`) so the warehouse pulls the bag. It also releases reservations for every batch-bound line.

### Error states & recovery
- **Weigh/pack guards:** server rejects `actualQty <= 0` or `actualWeight <= 0`
  (`commandBus.ts:4026-4027`); client mirrors the weight guard inline (`PickLineScreen.tsx:84-90`).
- **Mark fulfilled too early:** "Every fulfillment line needs an actual quantity before fulfillment."
  (`commandBus.ts:4047-4048`).
- **Release ineligible line:** descriptive throws for missing item/batch/qty/validation/reservation
  (`commandBus.ts:4070-4081`); `releaseEligibility` (`queries.ts:1736`) surfaces the same reasons
  pre-flight so sales sees why a line can't release without attempting the command.
- **Bulk release:** `releaseLinesForPicking` runs sequentially and is **not** atomic across lines at
  the application level — but the whole command executes inside one DB transaction, so any throw rolls
  back the batch. Empty/invalid `lineIds` throws (`commandBus.ts:4123`).
- **DB error scrubbing:** all command failures route through `scrubDatabaseError` and update (not
  re-insert) the journal row, emitting only the scrubbed toast to the `authenticated` room
  (`commandBus.ts:763-812`).
- **Reversal/undo:** only `markOrderFulfilled` has an explicit inverse in `reverseCommandById`
  (pick→`open`, order→`posted`, clears `fulfilledAt` — `commandBus.ts:4949-4957`). Catalog dispositions
  (`commandCatalog.ts:526-588`) define guidance for the rest: `recordWeighAndPack`/`adjustFulfillmentLine`/
  `printLabels`/`returnPickedUnits` are **offsettable** (re-record/reprint), release commands are
  **reversible** via `recallLineFromPicking`, and recall/ack/cancel are **terminal**.

### Feature combinations & edge cases
- **Partial picks:** `actual_qty` may differ from `expected_qty`; `recordWeighAndPack` accepts any
  positive qty/weight. The UI shows `Exp X · Got Y` (`PickListScreen.tsx:103-105`). No server check
  forces actual==expected.
- **Over/under weight:** weight is free-form `numeric(12,3)`, only required to be `> 0`. No tolerance
  band is enforced anywhere — over/under weight packs successfully.
- **Concurrent pickers:** `pickQueue` is shared (`pick_lists.assigned_to` exists but the mobile flow
  never reassigns it — `assignedTo` is only set on `allocateOrderToFulfillment`, `commandBus.ts:3616`,
  and is `null` for the lazy-create release path, `:4093`). Two pickers can open the same list. Last
  write wins on `recordWeighAndPack`; the 10s poll + `pick:order` socket event keeps both screens
  roughly in sync. There is **no row lock / claim** on FLs.
- **Recall while picker is on the line (Scenario B):** if the FL is deleted under the picker,
  `PickView` detects the missing line in the refreshed query and shows a full-screen "Line Recalled"
  overlay (`PickView.tsx:76-82`, `PickLineScreen.tsx:131-157`).
- **Alert while picker is on the list (Scenario C):** `PickListScreen` shows an amber banner
  "Sales updated this order — check flagged lines." when any line has `alertCount > 0`
  (`PickListScreen.tsx:64-73`).
- **Re-release after recall-with-alerts:** the surviving FL retains its alerts and `recall_pending`
  status until the picker acknowledges; re-releasing reuses that FL (`commandBus.ts:4097-4108`,
  `:4185-4191`).
- **`printLabels` without UI:** the mobile flow never calls it; manifests are regenerated on every
  weigh/pack/fulfill anyway, so the printed-labels flag is API-only today.

---

## B) BACKEND SPEC

### RBAC
All twelve commands require **minimum role `operator`** except where noted — enforced by
`assertCommandAccess` → `commandMinRole` (`rbac.ts:16-24`, `commandCatalog.ts:336-454`). The route-level
gate `usePickWorkLoopGuard` is an *additional* client guard restricting the `/pick` view to the
warehouse work loop. Note `cancelSalesOrder` (the upstream coordination command) requires **manager**
(`commandCatalog.ts:375`).

### Tables

#### `pick_lists` (`schema.ts:444-457`, migration `0001`/`0052`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `pick_no` | varchar(80) NOT NULL UNIQUE | `code('PICK')` → `PICK-<base36 ts>-<rand>` (`commandBus.ts:405`) |
| `order_id` | uuid NOT NULL → `sales_orders(id)` ON DELETE **cascade** | one pick list per order (lookup-by-order is the dedup key) |
| `status` | varchar(32) NOT NULL default `'open'` | lifecycle: `open` → `fulfilled` (reverted to `open` by undo) |
| `assigned_to` | uuid → `users(id)` ON DELETE set null | set only by `allocateOrderToFulfillment`; null on release-lazy-create path |
| `label_format` | varchar(16) NOT NULL default `'4x6'` | set by `printLabels` |
| `units_per_bag` | integer NOT NULL default `1` | from `allocateOrderToFulfillment` payload, floored at ≥1 |
| `labels_printed` | boolean NOT NULL default false | set by `printLabels` |
| `manifest_path` | text | path to generated bag-manifest CSV (`writeBagManifest`, `commandBus.ts:5879-5922`) |
| `tracking` | text | optional carrier tracking, set on `markOrderFulfilled` |
| `created_at` / `updated_at` | timestamptz | |

#### `fulfillment_lines` (`schema.ts:459-473`, alerts/status cols via migration `0052`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `pick_list_id` | uuid NOT NULL → `pick_lists(id)` ON DELETE **cascade** | |
| `order_line_id` | uuid NOT NULL → `sales_order_lines(id)` ON DELETE **cascade** | one FL per released SOL |
| `batch_id` | uuid → `batches(id)` ON DELETE set null | source inventory for returns/cancel reconciliation |
| `expected_qty` | numeric(12,3) NOT NULL | copied from SOL `qty` at release/allocate |
| `actual_qty` | numeric(12,3) NOT NULL default `0` | picked qty; `> 0` means picking has started; drives queue/derived status |
| `actual_weight` | numeric(12,3) NOT NULL default `0` | recorded weight; must be `> 0` to pack |
| `bag_code` | varchar(80) | scanned/entered bag id; auto `BAG-…` if blank |
| `status` | varchar(32) NOT NULL default `'open'` | base status: `open` → `packed` |
| `warehouse_alerts` | jsonb NOT NULL default `[]` | array of alert objects (see Alert mechanism) |
| `status_extended` | varchar(32) | overlay status: `recall_pending` \| `cancelled` \| null |
| `created_at` / `updated_at` | timestamptz | |

#### `sales_order_lines` picking columns (`schema.ts:358-359`, migration `0052`)
| Column | Type | Notes |
|---|---|---|
| `pick_released_at` | timestamptz | NULL = not released; stamp = in queue. Partial index `sales_order_lines_pick_released_idx WHERE pick_released_at IS NOT NULL` (migration `0052:7-9`) |
| `pick_released_by` | uuid → `users(id)` ON DELETE set null | releasing user |
| `packed` | boolean | set true for all SOLs on `markOrderFulfilled` |

Migration `0052` also **backfills** historical posted orders: any SOL with a FL on a posted order gets
`pick_released_at = order.posted_at` so derived pick status renders for legacy data (`0052:17-25`).

### Commands

| Command | Role | Handler | Disposition |
|---|---|---|---|
| `allocateOrderToFulfillment` (≡ `createPickList`) | operator | `commandBus.ts:3605` | terminal |
| `releaseLineForPicking` | operator | `:4060` | reversible (via recall) |
| `releaseLinesForPicking` | operator | `:4119` | reversible |
| `recallLineFromPicking` | operator | `:4144` | terminal |
| `recordWeighAndPack` | operator | `:4017` | offsettable |
| `adjustFulfillmentLine` | operator | `:4017` (alias) | offsettable |
| `acknowledgeWarehouseAlert` | operator | `:4201` | terminal |
| `returnPickedUnits` | operator | `:4231` | offsettable |
| `cancelFulfillmentLine` | operator | `:4271` | terminal |
| `printLabels` | operator | `:4312` | offsettable |
| `markOrderFulfilled` | operator | `:4038` | reversible (true inverse) |

#### `allocateOrderToFulfillment` / `createPickList` (`commandBus.ts:3605-3628`)
- **Payload:** `{ orderId, unitsPerBag? }`. No zod schema; uses `requiredId`.
- **Logic:** idempotent — returns existing pick list if one already exists for the order. Requires
  order `status === 'posted'` and ≥1 line. Inserts a `pick_lists` row (`assignedTo = userId`,
  `unitsPerBag = max(1, floor(payload))`) and one FL per SOL (`status='open'`, `expectedQty = line.qty`),
  then writes the bag manifest.
- **Invariant:** at most one pick list per order. **Emits:** none (no `orderId` returned).

#### `releaseLineForPicking` (`commandBus.ts:4060-4116`)
- **Schema:** `releaseLineForPickingPayloadSchema` `{ lineId?, id? }` (`:318-321`); accepts either key.
- **Eligibility (mirrors `releaseEligibility`):** SOL exists; has `itemName`; has `batchId`; `qty > 0`;
  no *fatal* `validationIssues` (issues starting with `Pick landed COGS` are non-fatal — range pricing
  is allowed); batch `reservedQty >= qty`.
- **Logic:** idempotent on `pick_released_at`. Stamps `pick_released_at`/`pick_released_by`,
  lazy-creates the pick list (`status='open'`, no `assignedTo`), lazy-creates the FL if absent.
- **State:** SOL → released; FL created `open`. **Returns `orderId`.**
- **Emits:** `pick:queue` + `pick:order:{orderId}` (PICK_QUEUE_AND_ORDER) **and**
  `sales:order:{orderId}:line:changed` (SALES_LINE_CMDS) — `commandBus.ts:732,749`.

#### `releaseLinesForPicking` (`commandBus.ts:4119-4132`)
- **Payload:** `{ lineIds: string[] }` (non-empty). Sequentially calls `releaseLineForPicking` for each
  inside the single command transaction; aggregates affected ids; returns first `orderId`. Same emissions.

#### `recallLineFromPicking` (`commandBus.ts:4144-4195`)
- **Payload:** `{ lineId? | id?, reason? }`. Two-path logic (see Journey/Branches). Clears SOL
  release stamp in both paths. **Returns `orderId`.** Emits `pick:queue` + `pick:order` + sales line event.
- **Failure modes:** no-op if not released; safe if FL missing.

#### `recordWeighAndPack` / `adjustFulfillmentLine` (`commandBus.ts:4017-4035`)
- **Schema:** `recordWeighAndPackPayloadSchema` `{ fulfillmentLineId?, id?, actualQty?, actualWeight?, bagCode? }`
  (`:305-311`).
- **Logic:** loads FL; computes next qty/weight (payload value else existing); rejects if either `<= 0`;
  sets `status='packed'`, `bagCode` (or generated), and any provided qty/weight; rewrites manifest;
  returns the pick list's `orderId`.
- **Emits:** `pick:order:{orderId}` only (PICK_ORDER_ONLY — `commandBus.ts:733,738-740`). No `pick:queue`,
  because a packed line still belongs to the same queue row until fulfilled (queue row visibility is
  driven by *un-picked* lines; once all are packed the EXISTS clause drops it, but the next queue poll/
  any release-class event refreshes it).
- **Failure modes:** FL not found; qty/weight ≤ 0.

#### `markOrderFulfilled` (`commandBus.ts:4038-4053`)
- **Schema:** `markOrderFulfilledPayloadSchema` `{ orderId, tracking? }` (`:313-316`).
- **Logic:** order must be `posted`; pick list must exist; **every FL must have `actual_qty > 0`**.
  Sets pick `status='fulfilled'` (+ tracking), order `status='fulfilled'`/`packed=true`/`fulfilledAt=now`,
  all SOLs `packed=true`; rewrites manifest.
- **Invariant:** an order cannot be fulfilled with any unpicked line.
- **Reversal:** `reverseCommandById` restores pick→`open`, order→`posted`, `fulfilledAt=null`
  (`commandBus.ts:4949-4957`), driven by the captured `beforeSnapshot.pickLists`/`salesOrders`.
- **Emits:** none directly (no `orderId` on result; UI re-invalidates `pickQueue` after the call,
  `PickView.tsx:140`).

#### `printLabels` (`commandBus.ts:4312-4318`)
- **Payload:** `{ pickListId? | id?, labelFormat? }` (default `'4x6'`). Sets `labels_printed=true`,
  `label_format`, rewrites manifest. No emission.

#### `acknowledgeWarehouseAlert` (`commandBus.ts:4201-4226`)
- **Payload:** `{ fulfillmentLineId? | id?, alertIndex }` — `alertIndex` must be a non-negative integer
  in range. Splices the alert out; if none remain, sets `status_extended = null` (auto-clears a
  `recall_pending` marker once every conflict is reconciled). **Returns `orderId`.**
- **Emits:** `pick:order:{orderId}` (PICK_ORDER_ONLY).
- **Failure modes:** invalid/out-of-range index; FL not found.

#### `returnPickedUnits` (`commandBus.ts:4231-4264`)
- **Payload:** `{ fulfillmentLineId? | id?, qty, reason? }`. `qty > 0` and `qty <= actual_qty`.
- **Logic:** decrements FL `actual_qty`; if `batchId`, restores batch `available_qty += qty`,
  `reserved_qty = max(0, reserved_qty − qty)`, and inserts `inventory_movements{kind:'pick_return', qtyDelta:qty}`.
  **Returns `orderId`.** Emits `pick:order` (PICK_ORDER_ONLY).
- **Invariant:** cannot return more than picked; inventory deltas keep batch pools consistent.

#### `cancelFulfillmentLine` (`commandBus.ts:4271-4309`)
- **Payload:** `{ fulfillmentLineId? | id? }`. Idempotent on `status_extended==='cancelled'`.
- **Logic:** if `actual_qty > 0`, returns the full picked amount first (nested `returnPickedUnits`);
  releases remaining batch reservation up to SOL qty (`min(reservedQty, sol.qty)`); sets
  `status_extended='cancelled'`. **Returns `orderId`.** Emits `pick:order` (PICK_ORDER_ONLY).

### Release-eligibility logic (`queries.ts:1736-1773`)
Per-order, per-SOL boolean + reason list, computed identically to the command's gate:
- `!itemName` → "Item name is not set."
- `!batchId` → "No batch assigned."
- `qty <= 0` → "Quantity must be greater than zero."
- fatal validation issues (excluding `Pick landed COGS…`) → "Resolve validation issues: …"
- `batchReservedQty < qty` → "Insufficient reservation — reserve inventory first."
- Returns `{ lineId, eligible, alreadyReleased, reasons }`.

### Warehouse alert mechanism
Alerts live in `fulfillment_lines.warehouse_alerts` (jsonb array, default `[]`). Shapes observed:
- **Recall alert** (`commandBus.ts:4160-4166`): `{ id:'recall-<hex>', type:'recall', message, status:'pending', createdAt }`.
- **Line-cancelled push** from `cancelSalesOrder` (`commandBus.ts:3345-3346`):
  `{ kind:'line_cancelled', at, actor:'sales' }`.
Alerts are paired with `status_extended='recall_pending'`. The client picks the first alert whose
`status !== 'acknowledged'` and forces a non-dismissable interrupt (`PickView.tsx:84-101`).
`acknowledgeWarehouseAlert` **removes by index** (does not just flip status); clearing the last alert
nulls `status_extended`. `pickQueue` exposes a per-list `alertCount = SUM(jsonb_array_length(...))`
(`queries.ts:1655`).

### Query procedures
- **`pickQueue`** (`queries.ts:1641`): open pick lists with ≥1 released, un-picked, non-cancelled FL.
  Columns: `pickNo, orderId, orderNo, customer, status, assignedTo, createdAt, openLines, totalLines,
  alertCount, oldestReleasedAt`. Sorted by `oldestReleasedAt ASC NULLS LAST`. Drives `QueueScreen`,
  30s poll + `pick:queue` socket invalidation.
- **`pickListWithLines`** (`queries.ts:1680`): `{ header, lines[] }`. Lines carry derived `pickStatus`
  (CASE at `:1711-1718`), `warehouseAlerts`, `statusExtended`, `pickReleasedAt`. Drives `PickListScreen`/
  `PickLineScreen`; 10s poll + `pick:order` socket invalidation.
- **`releaseEligibility`** (`queries.ts:1736`): see above; drives sales-side release affordances.
- **`fulfillmentLines`** (`queries.ts:1010`): flat FL list for a pick list incl. `actualWeight`/`bagCode`
  — a lower-level projection (manifests/desktop) distinct from `pickListWithLines`.
- **`workQueue`** (`queries.ts:527`): cross-domain operator worklist. Its **Sales** lane surfaces orders
  in `draft`/`confirmed` only (`queries.ts:602-606`) — posted/fulfilled orders are handled by the pick
  flow, so fulfillment does not re-appear here; this is the boundary between the sales worklist and the
  warehouse pick queue.

### Socket emissions (CAP-030 / TER-1518)
Defined in `src/server/sockets.ts`; invoked post-commit in `commandBus.ts:729-760`.
- **`pick:queue`** → `authenticated` room (all operators) — emitted with `pick:order` by the
  PICK_QUEUE_AND_ORDER commands: `releaseLineForPicking`, `releaseLinesForPicking`, `recallLineFromPicking`
  (`sockets.ts:82-84`, bus `:732`).
- **`pick:order:{orderId}`** → `order:{orderId}` room (only clients who emitted `order:subscribe`) —
  emitted alone by PICK_ORDER_ONLY commands: `recordWeighAndPack`, `adjustFulfillmentLine`,
  `acknowledgeWarehouseAlert`, `returnPickedUnits`, `cancelFulfillmentLine` (`sockets.ts:85-89`, bus `:733`).
- **`sales:order:{orderId}:line:changed`** → `order:{orderId}` room — emitted by SALES_LINE_CMDS
  (the three release/recall commands + `removeSalesOrderLine`) so the sales grid pick badges refresh
  (`sockets.ts:109-115`, bus `:749`).
- **Room protocol:** every authenticated socket joins `authenticated` on connect; `order:subscribe` /
  `order:unsubscribe` join/leave `order:{orderId}` (`sockets.ts:42-59`). `PickView` subscribes on pick-list
  selection (`PickView.tsx:32-37`).
- **Client handling** (`SocketContext.tsx:113-145`): `pick:queue` invalidates any `pickQueue` query;
  `pick:order:*` invalidates affected-id queries; `sales:order:*:line:changed` invalidates affected
  queries + `pickQueue`.
- **Resilience:** all emitters no-op if the socket server isn't initialized (`sockets.ts:81`); all are
  wrapped in try/catch in the bus (`commandBus.ts:741,757`). Clients that miss an event still reconcile
  on the react-query poll (30s queue / 10s list).

### Failure-mode summary
- Commands run inside one DB transaction; any throw rolls back and the journal row is **updated** to
  `failed` with a scrubbed toast (`commandBus.ts:763-812`). Socket events fire **only after commit**.
- No optimistic-lock / FL claim → concurrent pickers are last-write-wins.
- Manifest write (`writeBagManifest`) touches the filesystem (`ARCHIVE_DIR/bag-manifests/<pickNo>.csv`)
  inside the command path — a filesystem failure throws and rolls back the command.

---

## Checklist — artifacts documented

**Commands (11 distinct handlers + 1 alias):**
- [x] `allocateOrderToFulfillment` / `createPickList` (`commandBus.ts:3605`)
- [x] `releaseLineForPicking` (`:4060`)
- [x] `releaseLinesForPicking` (`:4119`)
- [x] `recallLineFromPicking` (`:4144`)
- [x] `recordWeighAndPack` (`:4017`)
- [x] `adjustFulfillmentLine` (alias of recordWeighAndPack, `:944`)
- [x] `acknowledgeWarehouseAlert` (`:4201`)
- [x] `returnPickedUnits` (`:4231`)
- [x] `cancelFulfillmentLine` (`:4271`)
- [x] `printLabels` (`:4312`)
- [x] `markOrderFulfilled` (`:4038`)
- [x] `cancelSalesOrder` coordination edge (`:3323`)

**Tables:**
- [x] `pick_lists` — full column docs (`schema.ts:444`)
- [x] `fulfillment_lines` — full column docs (`schema.ts:459`)
- [x] `sales_order_lines` picking columns + index/backfill (`schema.ts:358`, migration `0052`)

**Query procs:**
- [x] `pickQueue` (`queries.ts:1641`)
- [x] `pickListWithLines` (`queries.ts:1680`)
- [x] `releaseEligibility` (`queries.ts:1736`)
- [x] `fulfillmentLines` (`queries.ts:1010`)
- [x] `workQueue` (`queries.ts:527`)

**Components / client:**
- [x] `PickView.tsx` (orchestrator, socket subscription, interrupt derivation)
- [x] `pick/QueueScreen.tsx`
- [x] `pick/PickListScreen.tsx`
- [x] `pick/PickLineScreen.tsx` (weigh/scan/hold/interrupt/recalled overlays)
- [x] `usePickWorkLoopGuard.ts`
- [x] `SocketContext.tsx` (client consumption of `pick:queue` / `pick:order` / sales line events)

**Infra:**
- [x] Migration `0052_pick_released_warehouse_alerts.sql`
- [x] Socket emitters `sockets.ts` (`pick:queue`, `pick:order:*`, `order:subscribe/unsubscribe`, `sales:order:*:line:changed`)
- [x] RBAC `rbac.ts` + `commandMinRole` mapping
- [x] `writeBagManifest` manifest generation (`commandBus.ts:5879`)
- [x] `markOrderFulfilled` reversal in `reverseCommandById` (`commandBus.ts:4949`)
