# 12 — Domain: Sales Orders, Pricing Engine & Matchmaking

> Ground truth is the code. Every claim below is cited as `file:line`. Covers CMD-SALES (sales order lifecycle), the pricing engine (rules → profile → floor → landed cost), sale-time cost-range / below-floor / vendor-approval exceptions, customer-safe output & sheet snapshots, and CMD-MATCHMAKING (customer needs / vendor supply / deterministic matches).
>
> Key source files:
> - `src/server/services/commandBus.ts` — all write-path handlers
> - `src/server/services/pricing.ts`, `src/shared/inventoryPricingShared.ts` — pricing engine
> - `src/shared/saleLineCostExceptions.ts`, `src/shared/priceRange.ts` — exception/range gates
> - `src/shared/customerSheetSnapshot.ts` — customer-safe snapshot sanitization
> - `src/server/services/projections/salesConfirmation.ts`, `salesConfirmationReceipts.ts` — confirmation documents
> - `src/server/projections/landedCostException.ts` — below-range journal projection
> - `src/server/routers/queries.ts` — all read-path procs
> - `src/server/schema.ts` — tables
> - `src/client/views/SalesView.tsx`, `MatchmakingView.tsx` + components

---

## SECTION A — JOURNEY MAP

### A.1 Sales order spine (happy path)

`new sale → add lines → reserve → price → confirm → post`. Every step is a command through `commandBus.ts`'s `executeCommand` dispatcher (`commandBus.ts:881-917`), wrapped in a single DB transaction with a command-journal row, post-commit JSONL append, and a `command:completed` socket broadcast (`commandBus.ts:655-660`).

1. **Create** — `createSalesOrder` (`commandBus.ts:2472`). Requires a real `customerId` (`customers` row must exist, else `Customer not found.`). Inserts `sales_orders` with `orderNo = code('SO')`, `status='draft'`, empty `validationIssues`. Role: `operator` (`commandCatalog.ts:368`).
2. **Add lines** — `addSalesOrderLine` (`commandBus.ts:2481`). Order must be `draft` or `confirmed` (`:2487`). A line can be batch-backed or an unresolved free-text placeholder. See A.2 for the per-line COGS/floor setup that happens here.
3. **Reserve** — `reserveInventoryForOrder` (`commandBus.ts:2721`). For each batch-backed, non-`reserved` line: `SELECT … FOR UPDATE` row-locks the batch (`:2734`), checks `available_qty - reserved_qty >= line.qty`, increments `reserved_qty`, flips line `status='reserved'`. This is the **hard TOCTOU close** (the add-time guard is soft).
4. **Price** — `priceSalesOrder` (`commandBus.ts:2747`). Strategy-driven; see A.4. `repriceOrder` is the same handler with a different toast (`commandBus.ts:964`).
5. **Confirm** — `confirmSalesOrder` (`commandBus.ts:3296`). Runs all gates (validation issues, unresolved COGS, exception blockers, credit limit, pricing guardrails), flips `status='confirmed'`, enqueues a credit recompute, and (post-commit) emits external+internal confirmation document snapshots.
6. **Post** — `postSalesOrder` (`commandBus.ts:3367`). Must be `confirmed`. Re-runs gates, row-locks customer + each batch, decrements inventory, writes `inventory_movements`, creates the `invoices` row + `client_ledger_entries`, bumps `customers.balance` (Decimal), writes per-line below-floor correction journal entries, optionally triggers consignment vendor bills, accrues referee credit. Idempotent against double-post (`already posted` guard `:3372`).

After post: `allocateOrderToFulfillment` / `createPickList` (`commandBus.ts:3605`) builds the pick list (only when `status='posted'`). Picking release/recall is documented in A.6.

### A.2 Add-line branches (COGS resolution & floor setup)

In `addSalesOrderLine` (`commandBus.ts:2511-2526`):

- **Batch has a `priceRange` (e.g. "60-72")** → midpoint is written as a *provisional* `unitCost`, `unitCostResolved=false`, `landedCostBasis=null`, `priceFloor=null`, and a `Pick landed COGS in $low-$high.` validation issue is pushed. The line cannot confirm/post until COGS is resolved (A.3).
- **Batch has a fixed `unitCost`** → `unitCost=landedCost`, `unitCostResolved=true`, `landedCostBasis='fixed'`, `priceFloor=landedCost` (when > 0).
- **No batch (free-text placeholder)** → `unitCost=0`, `unitCostResolved=true`, validation issue `Choose exact inventory source row.` blocks confirm.

**Soft availability guard** (`commandBus.ts:2495-2501`): `available - reserved - draftReserved < qty` throws. `draftReserved` comes from `getDraftReservedQtyMap` (`commandBus.ts:2436`), which sums qty held by *other* draft/confirmed orders. This narrows but does not close the race (the FOR UPDATE lock in reserve/post is the hard close — GH #249).

`updateSalesOrderLine` (`commandBus.ts:2551`) re-runs the *same* range/fixed setup when `batchId` changes (`:2585-2618`), clearing prior `landedCostReason`, `belowFloorReason`, `belowFloorNote`, and resetting `vendorApprovalState='none'`. Qty increases re-check availability (`:2634-2647`). A qty change on an already pick-released line pushes a `qty_changed` warehouse alert and sets the fulfillment line to `recall_pending` (`:2668-2681`).

`removeSalesOrderLine` (`commandBus.ts:2687`): if the line was pick-released, it is **not deleted** (FK to fulfillment line); instead pushes a `line_cancelled` alert, clears `pickReleasedAt`, keeps the audit trail (`:2695-2715`). Otherwise it deletes the row. Both recalc the order.

### A.3 Sale-time exceptions (cost-range, below-floor, vendor approval)

Three independent slices of state, deliberately kept separate (`saleLineCostExceptions.ts:11-21`):

- **Landed-COGS resolution** — `setLineLandedCost` (`commandBus.ts:2851`). For a range batch, `validateLandedCost` (`saleLineCostExceptions.ts:67`) enforces:
  - In range → accepted, basis recorded as given.
  - **Above range** → hard reject unless `basis='override'` **and** role ∈ {manager, owner, admin} **and** a non-empty `reason`. Records basis `override`, stores `landedCostReason`.
  - **Below range** → accepted *for any role* only if a structured `exceptionReason` (a `BELOW_FLOOR_REASON`) is supplied; otherwise rejected with guidance.
  On success: writes `unitCost`, `unitCostResolved=true`, `landedCostBasis`, `priceFloor=landedCost`, removes the `Pick landed COGS` validation issue, and (if a below-range exception) records `delta.exceptionReason/Note` into the command journal (projected back to the UI via `landedCostException.ts`).
- **Below-floor reason** — `setLineBelowFloorReason` (`commandBus.ts:2940`). `validateBelowFloorChoice` (`saleLineCostExceptions.ts:122`) requires a reason only when `unitPrice < priceFloor`. Reason `vendor_approval_pending` sets line `vendorApprovalState='pending'`; any other reason sets `none`. Refreshes the order rollup.
- **Vendor approval** — `resolveVendorApproval` (`commandBus.ts:2990`). Sets pending lines to `approved`/`declined` (by `lineId` or all pending lines on an `orderId`). Refreshes rollup.

**Confirm/Post gate** — `canConfirmOrPost` (`saleLineCostExceptions.ts:225`) returns the first blocking reason in priority order: `cogs_unresolved` → `vendor_approval_pending` → `vendor_approval_declined` → `below_floor_reason_missing`. `findExceptionBlockedLine` + `formatExceptionBlockerMessage` (`commandBus.ts:3097-3132`) turn this into operator copy. Both `confirmSalesOrder` and `postSalesOrder` call it (`:3307`, `:3380`).

**Order rollup** — `refreshOrderExceptionRollup` + `computeOrderExceptionTotals` (`commandBus.ts:3042`, `saleLineCostExceptions.ts:161`) compute `marginWaivedTotal` (Σ `(floor-price)*qty` for `waive_margin` lines), `lossRecognizedTotal` (Σ `(cost-price)*qty` for `take_loss` lines), and `vendorApprovalPending`. These persist to `sales_orders` at post (`commandBus.ts:3486-3497`).

### A.4 Pricing strategies (the price step)

`priceSalesOrder` (`commandBus.ts:2747`) branches on `strategy`:

- **`standard` / `premium` / `clearance`** (`:2799-2820`): multiply each line's existing `unitPrice` by `1 / 1.08 / 0.92`, then clamp through `evaluatePrice` guardrails (A.5). Guardrail-lifted lines are reported in `delta.guardrails`.
- **`customer-rule`** (`:2755-2797`): first rejects if any line has unresolved COGS. For each line, resolves the pricing rule chain (A.5) keyed by the batch category, computes a candidate via `applyPricingRule(unitCost, rule)`, clamps it through the `standard` guardrail profile, and writes the result. `delta.ruleAppliedLines` records `ruleSource`, candidate vs final, guardrail hits.

Both branches call `recalcOrder` (`commandBus.ts:5554`) which recomputes `total` and `internalMargin` with Decimal precision and (when passed) updates `pricingStrategy`.

The **client** computes inline markup/COGS previews (`SalesView.tsx:139-152`): for range batches `markup = markupDollarsFromPrice(unitPrice, rule)` and `derivedCogs = price - markup`; for fixed batches `markup = applyPricingRule(unitCost, rule) - unitCost`. The `derivedCogs` column shows a ✓/↓below/↑above range check (`SalesView.tsx:249-256`). From the UI, `priceSalesOrder` is invoked with `strategy:'standard'` for the preview button (`SalesView.tsx:745`) and `strategy:'customer-rule'` for re-apply (`:984`).

### A.5 Pricing guardrails & the rule chain

- **Profiles** (`pricing.ts:30-42`): `standard` (min margin 20%, max discount 15%), `premium` (28% / 8%), `clearance` (8% / 25%). `resolvePricingProfile` picks by strategy, then by customer tags (`premium`/`value`), else `standard`.
- **`evaluatePrice`** (`pricing.ts:44-62`): `minimumUnitPrice = max(vendorFloor=unitCost, marginFloor=unitCost*(1+minMargin), discountFloor=basisPrice*(1-maxDiscount))`. The final price is clamped up to this minimum; the violated floors are reported as `guardrails: ['vendor_floor'|'min_margin'|'max_discount']`. Confirm rejects any line whose snapshot carries guardrail hits (`commandBus.ts:3316-3317`).
- **Rule resolution chain** (`inventoryPricingShared.ts:13-93`) — 7 levels, first hit wins: (1) customer subcategory, (2) customer category, (3) customer default, (4) settings subcategory, (5) settings category, (6) settings default, (7) fallback `percent 0.30`. Old flat `{basis,amount}` category entries are transparently upgraded to `{rule:{…}}` (`:32-34`, also migrated server-side in `validatePricingRulePayload` `commandBus.ts:3178-3203`).
- **Apply** (`inventoryPricingShared.ts:98-105`): `dollar` → `cost + amount`; `percent` → `cost * (1 + amount)`.

Customer rule is set via `setCustomerPricingRule` (`commandBus.ts:3134`, role manager). Default rule via `setDefaultPricingRule` (`commandBus.ts:3152`) writing `system_settings['pricing.defaults']`. Both are reversible (restore prior rule from the command snapshot — `commandCatalog.ts:576-577`).

### A.6 Picking release/recall (sales side of CMD-FULFILLMENT)

- `releaseLineForPicking` (`commandBus.ts:4060`, operator) — idempotent (no-op if already released). Eligibility: item name present, batch assigned, qty > 0, no *fatal* validation issues (range-priced COGS is **not** fatal for release, `:4074`), and batch `reserved_qty >= line.qty`. Stamps `pickReleasedAt/By`, lazily creates the pick list, inserts the fulfillment line (idempotent).
- `releaseLinesForPicking` (`commandBus.ts:4119`) — bulk loop over `lineIds`, aggregates affected ids.
- `recallLineFromPicking` (`commandBus.ts:4144`, terminal disposition) — if `actualQty=0`, deletes the fulfillment line (and the pick list when empty); if `actualQty>0`, keeps the FL, sets `recall_pending`, appends a recall warehouse alert. Always clears `pickReleasedAt/By` so re-release reuses the FL.

### A.7 Cancel & credit

- `cancelSalesOrder` (`commandBus.ts:3323`, **manager** role) — blocks if any released line already picked (`actualQty>0` & not cancelled) until `returnPickedUnits`/`cancelFulfillmentLine`. Pushes `line_cancelled` alerts for unpicked released lines, then **releases `reserved_qty` for every batch-backed line regardless of status** (GH #287, `:3358-3362`), flips order to `cancelled`.
- `applyClientCredit` (`commandBus.ts:3630`, **manager** role) — decrements `customers.balance` by `amount` (Decimal), writes a `client_ledger_entries` `kind='credit'` row with negative `amount` and `balanceAfter`.
- `setDeliveryWindow` (`commandBus.ts:3641`, operator) — sets `sales_orders.deliveryWindow` (free text).

### A.8 Customer-safe output & sheet snapshots

Two enforcement boundaries keep cost/margin away from customers:

1. **CSV export** — `buildCustomerOfferCsv` (`SalesView.csvExport.ts:27`) emits only `itemName, qty, unitPrice, sourceRowKey` and **skips rows whose `mediaStatus` is not `done`/`ready`** (`isCustomerShareReady`, `:12`). Used by `SalesOutputTab.tsx:42`.
2. **On-screen margin toggle** — `selectVisibleSalesColumns` (`SalesView.columns.ts:44`) hides `MARGIN_COLUMN_FIELDS` (`unitCost, internalMargin, estimatedMargin, rangeBadge, landedCostExceptionReason, markup, markupPct, derivedCogs`) when `showMargin` is off (customer screen-share posture). The exception controls also collapse cost rows in this mode but keep the vendor-approval action (`SaleLineExceptionControls.tsx:103-106`).

**Sheet snapshots** — `createCustomerSheetSnapshot` (`commandBus.ts:3059`, operator). Modes `internal` | `catalog` (`customerSheetSnapshot.ts:19`). `buildCustomerSheetSnapshotRows` (`customerSheetSnapshot.ts:72`) copies only allowlisted fields: catalog keeps `batchId, batchCode, name, itemAlias, displayName, category, vendor, availableQty, unitPrice, tags` (cost/margin-free); internal adds `unitCost, estimatedMargin, reason`. Snapshot is **append-only** (terminal disposition). The journal payload is redacted by `redactCustomerSheetSnapshotJournalPayload` (`customerSheetSnapshot.ts:213`) which drops the raw `rows` array and stores only `itemCount` + a non-reversible `rowsHash` (cyrb53) — so recoverySearch never re-exposes cost/margin, and the same hash powers idempotency ("same key, different rows" rejection).

Read side: `recentCustomerSheets` (`queries.ts:791`) returns metadata only; `customerSheetSnapshotById` (`queries.ts:812`) requires *both* `id` and `customerId` and runs `getViewerSafeSnapshot` (`customerSheetSnapshot.ts:123`) which (a) returns null when a `viewer` role opens an internal snapshot, (b) re-sanitizes rows on the way out (defense in depth). `RecentSheetsPanel.tsx` lets operators re-add snapshot rows to a live draft, gating each Add against current inventory and replaying quoted qty/price (`:206-223`).

UI creates snapshots automatically when an operator exports a sheet (`SalesView.tsx:855-865`), choosing mode from `sheetMode`.

### A.9 Confirmation documents (post-confirm projections)

After `confirmSalesOrder` commits, `createSalesConfirmationReceipts` (`salesConfirmationReceipts.ts:21`) runs **best-effort** (errors caught, never fail the command — `commandBus.ts:688-699`). It re-queries the order + lines + customer via the raw pool and emits **two** finalized document snapshots (`external` and `internal`) keyed `kind='sales_confirmation'`, `sourceEntityType='sales_order'`. The `salesConfirmation` projector (`projections/salesConfirmation.ts:61`):
- **external** allowlist strips `unitCost, unitCostResolved, sourceRowKey, legacyMarker, candidateSourceText, internalMargin, internalNotes` — leaves header/lines/totals/footer only.
- **internal** adds `cogs` (perLine + total), `margin` (perLine + total), and `diagnostics` (unresolved sources, legacy markers).

Read procs: `salesOrderExternalReceipt` / `salesOrderInternalReceipt` / `salesOrderSignalText` / `salesOrderPrintHtml` (`queries.ts:1513-1611`) prefer the latest *invoice* snapshot (post-post) and fall back to the sales-order confirmation snapshot.

### A.10 Matchmaking demand/supply board lifecycle

**Create demand/supply** — `createCustomerNeed` (`commandBus.ts:5227`, operator) and `createVendorSupply` (`commandBus.ts:5297`, operator). Each validates its parent (customer/vendor), normalizes tags into the tag catalog, inserts the row (`needCode=code('NEED')` / `supplyCode=code('VS')`, default `status='open'`), then **immediately regenerates matches** (`rebuildMatchesForNeed` / `rebuildMatchesForSupply`) and returns `delta.matchCount`. Updates (`updateCustomerNeed` `:5262`, `updateVendorSupply` `:5329`) enforce status-transition guards (A.11) and rebuild matches.

**Review a match** — `acceptMatchmakingMatch` / `dismissMatchmakingMatch` route to `reviewMatchmakingMatch` (`commandBus.ts:5526`, operator). A match must be `open` (else "already accepted/dismissed — use reopen first"). On **accept**: sets the match `accepted`, **auto-dismisses sibling open matches** sharing the same need or supply, sets the need `matched` and supply `held_for_match`. Reopen — `reopenMatchmakingMatch` (`commandBus.ts:5478`, **manager**): flips back to `open`; if no other accepted match remains for the need/supply, reverts each to `open`. Sibling auto-dismissals are **not** restored (`:5362-5378`).

**Settings** — `updateMatchmakingSettings` (`commandBus.ts:5379`, manager) upserts the singleton `matchmaking_settings` row; enforces `workQueueThreshold >= matchQualityFloor`.

**Work-queue / opportunity snooze** — `noteMatchmakingOutreach` (`commandBus.ts:5415`) and `dismissMatchmakingWorkQueueItem` (`commandBus.ts:5444`) write *journal-only* records (no table mutation). The Leg-2/Leg-3 opportunity queries read both command names from `command_journal` to suppress an entity+category for 30 days (`queries.ts:343-350`, `:397-404`).

**Board reads** — `matchmakingBoard` (`queries.ts:234`) returns needs/supplies/matches ordered by status then score. `matchmakingOpportunities` (`queries.ts:267`) computes Leg-2 "inventory to move" (in-stock batches × customer need/history) and Leg-3 "gaps to fill" (low/empty inventory categories × vendor supply/history), both honoring the 30-day snooze. `matchmakingEntityCounts` (`queries.ts:441`) and `matchmakingSettings` (`queries.ts:242`) feed the board UI.

**UI** — `MatchmakingView.tsx` drives accept/dismiss/reopen per row and in bulk (`:170-174`, `:251-280`), need/supply creation (`:121`, `:141`), settings (`:112`), and outreach notes (`:340`, `:410`).

### A.11 Error states, recovery & edge cases

- **Status-transition guards**: needs `open↔matched`/`→closed` only; supply `open↔held_for_match`/`→closed`; `accepted`/`dismissed` are terminal from the update command's view (`commandBus.ts:5198-5225`). Invalid transitions throw.
- **Credit limit**: confirm and post both reject when `balance + total > creditLimit` (`commandBus.ts:3312`, `:3410`). Post re-reads the customer FOR UPDATE to avoid a balance race.
- **Duplicate source rows**: post rejects two lines sharing the same `sourceRowKey`/`batchId` ("appears more than once from the same source row", `commandBus.ts:3386-3390`).
- **Archived/non-editable orders**: `assertSalesOrderEditableById` (`commandBus.ts:2397`) blocks COGS/floor/vendor-approval edits on archived or non-`draft`/`confirmed` orders.
- **Consignment trigger** (post): when a `C`-ownership batch hits `available<=0`, an existing open vendor bill is marked due, or a `VBILL-CONSIGN` bill is created (`commandBus.ts:3430-3460`).
- **Below-floor correction journal** (post): per below-floor line, a `correction_journal_entries` row records the `max(0,(floor-price)*qty)` variance; `vendor_approval_pending` lines also annotate the vendor's open bill (FOR UPDATE SKIP LOCKED, soft) (`commandBus.ts:3500-3572`).
- **Reversal dispositions** (`commandCatalog.ts:502-585`): `postSalesOrder` reversible (restores inventory/invoice); `confirm`/`reserve`/`price`/`applyClientCredit` offsettable; `createSalesOrder`/`addLine`/`removeLine`/`cancel`/`setDeliveryWindow` terminal; `setLineLandedCost`/`setCustomerPricingRule`/`setDefaultPricingRule`/`setLineBelowFloorReason` reversible from snapshot; snapshots terminal.

---

## SECTION B — BACKEND SPEC

### B.1 Command reference (schema / role / logic / tables / invariants)

Roles from `commandCatalog.ts:368-451`; dispositions from `:502-585`.

| Command | Role | Handler | Key writes | Invariants / failure modes |
|---|---|---|---|---|
| `createSalesOrder` | operator | `commandBus.ts:2472` | `sales_orders` (draft) | Customer must exist. |
| `addSalesOrderLine` | operator | `:2481` | `sales_order_lines`, recalc order | Order draft/confirmed; batch posted; soft-availability guard; range→`unitCostResolved=false`. |
| `updateSalesOrderLine` | operator | `:2551` | line + order fields | Editable-status gate; batch swap re-runs COGS/floor setup & clears exception state; qty↑ re-checks availability; qty change on released line → warehouse alert. |
| `removeSalesOrderLine` | operator | `:2687` | delete line OR clear release + alert | Released line preserved (FK to fulfillment). |
| `reserveInventoryForOrder` | operator | `:2721` | `batches.reserved_qty`, line `status='reserved'` | FOR UPDATE batch lock; `avail-reserved>=qty`; at least one line. |
| `priceSalesOrder` | operator | `:2747` | line `unit_price`, recalc | `customer-rule` rejects unresolved COGS; guardrail clamp. |
| `repriceOrder` | manager | `:964` → priceSalesOrder | same | Same as price (different toast). |
| `confirmSalesOrder` | operator | `:3296` | order `status='confirmed'`; post-commit doc snapshots | Gates: validation issues, unresolved COGS, exception blocker, credit limit, pricing guardrails. |
| `postSalesOrder` | operator | `:3367` | inventory, `invoices`, `client_ledger_entries`, `customers.balance`, `inventory_movements`, `correction_journal_entries`, vendor bills | Must be confirmed; re-runs all gates; FOR UPDATE customer+batch; dup source-row guard; period-lock check on exceptions. |
| `cancelSalesOrder` | manager | `:3323` | order `cancelled`, release `reserved_qty`, alerts | Blocks if released line already picked. |
| `applyClientCredit` | manager | `:3630` | `customers.balance`, `client_ledger_entries` | Customer must exist. |
| `setDeliveryWindow` | operator | `:3641` | `sales_orders.delivery_window` | Required non-empty window. |
| `releaseLineForPicking` | operator | `:4060` | line release stamp, `pick_lists`, `fulfillment_lines` | Idempotent; item+batch+qty+reservation eligibility; range COGS non-fatal. |
| `releaseLinesForPicking` | operator | `:4119` | bulk of above | Non-empty `lineIds`. |
| `recallLineFromPicking` | operator | `:4144` | delete FL or set `recall_pending`+alert; clear release | actualQty drives delete vs recall_pending. |
| `setLineLandedCost` | operator | `:2851` | line `unit_cost/unitCostResolved/landedCostBasis/landedCostReason/priceFloor`; journal delta | `validateLandedCost`: above-range→override+manager+reason; below-range→structured `exceptionReason`. |
| `setLineBelowFloorReason` | operator | `:2940` | line `belowFloorReason/Note/vendorApprovalState`; order rollup | Reason required when price<floor; `vendor_approval_pending`→state `pending`. |
| `resolveVendorApproval` | (resolveVendorApproval) | `:2990` | line `vendorApprovalState`; rollup | State approved/declined; line(s) must be pending. |
| `setCustomerPricingRule` | manager | `:3134` | `customers.pricing_rule` | Zod `customerPricingRuleSchema`; old shape migrated. |
| `setDefaultPricingRule` | manager | `:3152` | `system_settings['pricing.defaults']` | Same schema. |
| `createCustomerSheetSnapshot` | operator | `:3059` | `customer_sheet_snapshots` | Mode internal/catalog; rows sanitized; non-empty; journal payload redacted. |
| `createCustomerNeed` | operator | `:5227` | `customer_needs` + matches | Customer exists; qtyMin>0; qtyMax≥qtyMin. |
| `updateCustomerNeed` | operator | `:5262` | need + matches | Status-transition guard; qty rules. |
| `createVendorSupply` | operator | `:5297` | `vendor_supply` + matches | Vendor exists; qty>0. |
| `updateVendorSupply` | operator | `:5329` | supply + matches | Status-transition guard; qty>0. |
| `acceptMatchmakingMatch` | operator | `:5526` | match `accepted`, siblings dismissed, need `matched`, supply `held_for_match` | Match must be `open`. |
| `dismissMatchmakingMatch` | operator | `:5526` | match `dismissed` | Match must be `open`. |
| `reopenMatchmakingMatch` | manager | `:5478` | match `open`, conditional need/supply revert | Not already open; siblings not restored. |
| `updateMatchmakingSettings` | manager | `:5379` | `matchmaking_settings` (singleton upsert) | `threshold>=floor`. |
| `noteMatchmakingOutreach` | operator | `:5415` | journal only | entityType customer/vendor; leg 2/3; context required. |
| `dismissMatchmakingWorkQueueItem` | operator | `:5444` | journal only (may re-route to outreach) | itemType match/opportunity. |

### B.2 Reservation & inventory logic

- **Soft draft reservation** (`getDraftReservedQtyMap`, `commandBus.ts:2436`): SQL sums `sales_order_lines.qty` for other draft/confirmed orders whose line status ∉ {reserved, allocated, posted, cancelled}, grouped by batch. Used in add/update availability guards. Mock-tx returns `{rows:[]}` → 0 (falls back to plain `avail-reserved`).
- **Hard reserve** (`reserveInventoryForOrder`, `:2721`): `SELECT … FOR UPDATE` then `reserved_qty += qty`. Snake_case bracket access on raw rows (`available_qty`/`reserved_qty`) is mandatory — camelCase would yield NaN.
- **Post inventory** (`postSalesOrder`, `:3415-3464`): per line, FOR UPDATE batch, `available_qty -= qty`, `reserved_qty = max(0, reserved-qty)`, write `inventory_movements` (`kind='sale_posted'`, `qty_delta=-qty`).
- **Cancel release** (`:3358-3362`): `reserved_qty = max(0, reserved - qty)` for every batch-backed line.

### B.3 Pricing engine algorithm (detail)

Order of resolution when pricing a line under `customer-rule`:

1. **Resolve rule** (`resolvePricingRuleEntry`, `inventoryPricingShared.ts:13`) — 7-level chain (B.1 of Section A.5). Inputs: customer `pricing_rule` JSON, `system_settings['pricing.defaults']`, batch `category` (subcategory currently null at this call site — `commandBus.ts:2765`).
2. **Candidate price** (`applyPricingRule`, `:98`) — `percent`: `cost*(1+amount)`; `dollar`: `cost+amount`.
3. **Guardrail clamp** (`evaluatePrice`, `pricing.ts:44`) — `minimum = max(vendorFloor, marginFloor, discountFloor)`; final = `max(candidate, minimum)`; report violated floors.
4. **Persist** `unit_price`, recalc order (`recalcOrder` Decimal sum → `total`, `internal_margin`).

For range-COGS rows the client uses the *inverse* form (`markupDollarsFromPrice`, `inventoryPricingShared.ts:117`): `markup = price*(rule%/(1+rule%))`, so `derivedCogs = price - markup` and markup-on-cost stays consistent with fixed rows.

`pricingRuleEntryFromUnknown` (`pricing.ts:69`) defensively coerces unknown JSON to a `{basis, amount}` entry. `validatePricingRulePayload` (`commandBus.ts:3178`) migrates legacy flat category shapes before Zod validation.

### B.4 Cost-range / below-floor gate functions (pure)

`src/shared/saleLineCostExceptions.ts`:
- `LANDED_COST_BASIS_VALUES` = fixed, pick-low, pick-mid, pick-high, manual, override (`:23`).
- `BELOW_FLOOR_REASONS` = keep_margin, renegotiate, waive_margin, take_loss, vendor_approval_pending (`:34`).
- `VENDOR_APPROVAL_STATES` = none, pending, approved, declined (`:44`).
- `validateLandedCost` (`:67`) — privileged roles {manager, owner, admin}.
- `validateBelowFloorChoice` (`:122`) — `requiresVendorApproval` iff reason is `vendor_approval_pending`.
- `computeOrderExceptionTotals` (`:161`) — margin-waived & loss-recognized aggregation, round2.
- `canConfirmOrPost` (`:225`) — ordered blocking reasons.

`src/shared/priceRange.ts`: `parsePriceRange` (`"low-high"`), `isLandedCostInRange`, `pickFromRange` (pick-low/mid/high), `validateCostRange`, `rangeMidpoint`.

### B.5 Snapshot / journal sanitization

`src/shared/customerSheetSnapshot.ts`: `CATALOG_FIELDS` (cost/margin-free allowlist, `:29`), `INTERNAL_FIELDS` (adds unitCost/estimatedMargin/reason, `:46`), `buildCustomerSheetSnapshotRows` (`:72`), `getViewerSafeSnapshot` (viewer privacy + re-sanitize, `:123`), `redactCustomerSheetSnapshotJournalPayload` (drop rows, add `rowsHash` via cyrb53, `:213`).

### B.6 Document projections & socket events

- `salesConfirmation` projector external/internal allowlists (`projections/salesConfirmation.ts:29-59`).
- `createSalesConfirmationReceipts` emits both audiences as finalized snapshots, superseding any prior live snapshot (`salesConfirmationReceipts.ts:106-132`). Non-fatal.
- `projectLandedCostException` (`projections/landedCostException.ts:70`) inflates `command_journal.result.delta.exceptionReason/Note` into flat `landedCostException*` fields for the `salesOrderLines` query LATERAL join (`queries.ts:639-692`).
- **Socket events**: `command:completed` (commandId, commandName, actorId, affectedIds — toast stripped, `commandBus.ts:655`), `command:failed` (`:807`), `health:pulse`, `order:subscribe`/`order:unsubscribe` rooms + `sales:order:{id}:line:changed` (`sockets.ts:114`). Emitted to the `authenticated` room only.

### B.7 Table column reference

**`customers`** (`schema.ts:77`): `id`; `name` varchar(180); `credit_limit` numeric(12,2) dflt 0; `balance` numeric(12,2) dflt 0; `tags` text[]; `pricing_rule` jsonb dflt {}; `notes`; `engine_max` numeric; `stance_id`→creditEngineStances (set null); `credit_limit_source` varchar(16) dflt 'manual'; `engine_enabled` bool dflt false; `engine_disabled_at/by/reason`; `last_assessment_id`; `credit_limit_manual_set_at/by/reason`; `credit_limit_reminder_days`; `credit_limit_last_reviewed_at`; `credit_limit_snooze_count` int dflt 0; `contact_id`→contacts; `created_at`; `updated_at`. (Sales reads `name, credit_limit, balance, tags, pricing_rule`.)

**`sales_orders`** (`schema.ts:305`): `id`; `order_no` varchar(80) unique; `customer_id`→customers (RESTRICT, mig 0059); `status` varchar(32) dflt 'draft' (draft/confirmed/posted/cancelled/archived…); `pricing_strategy` varchar(80) dflt 'standard'; `internal_margin` numeric(12,2) dflt 0; `total` numeric(12,2) dflt 0; `delivery_window` text; `notes`; `packed`/`inventory_posted`/`payment_followup` bool dflt false; `legacy_status_markers` varchar(180); `validation_issues` jsonb string[] dflt []; `referee_relationship_id` uuid; `referee_credit_amount` numeric; **`vendor_approval_pending` bool dflt false** (mig 0048); **`margin_waived_total` numeric dflt 0**; **`loss_recognized_total` numeric dflt 0**; `posted_at`; `fulfilled_at`; `archived_at`; `created_at`; `updated_at`.

**`sales_order_lines`** (`schema.ts:334`): `id`; `order_id`→sales_orders (cascade); `batch_id`→batches (set null); `item_name` varchar(180); `display_name` varchar(180); `qty` numeric(12,3); `unit_price` numeric(12,2); `unit_cost` numeric(12,2) dflt 0; `source_row_key` varchar(180); `unresolved_source_text` varchar(180); `legacy_status_marker` varchar(80); `packed`/`inventory_posted`/`payment_followup` bool dflt false; `validation_issues` jsonb string[] dflt []; `unit_cost_resolved` bool dflt false; `landed_cost_basis` varchar(32) (CHECK ∈ basis values, mig 0048); `landed_cost_reason` text; `price_floor` numeric(12,2); `below_floor_reason` varchar(32) (CHECK ∈ reasons); `below_floor_note` text; `vendor_approval_state` varchar(32) dflt 'none' (CHECK ∈ states); `status` varchar(32) dflt 'draft' (draft/needs_fix/reserved/allocated/posted/cancelled); `pick_released_at` ts; `pick_released_by`→users (set null); `created_at`; `updated_at`.

**`customer_needs`** (`schema.ts:490`): `id`; `need_code` varchar(80) (unique idx); `customer_id`→customers (set null); `product_name` varchar(180); `category` varchar(80); `tags` text[]; `qty_min` numeric(12,3) dflt 1; `qty_max` numeric(12,3); `target_price` numeric(12,2); `needed_by` ts; `urgency` varchar(32) dflt 'normal'; `owner_id`→users (set null); `notes`; `status` varchar(32) dflt 'open' (open/matched/closed; accepted/dismissed reachable via matches); `created_at`; `updated_at`. Indexes: code (unique), customer, status, category.

**`vendor_supply`** (`schema.ts:518`): `id`; `supply_code` varchar(80) (unique idx); `vendor_id`→vendors (set null); `product_name` varchar(180); `category` varchar(80); `tags` text[]; `available_qty` numeric(12,3) dflt 1; `asking_price` numeric(12,2); `available_date` ts; `location` varchar(120); `grade` varchar(80); `terms` text; `notes`; `status` varchar(32) dflt 'open' (open/held_for_match/closed; accepted/dismissed via matches); `created_at`; `updated_at`. Indexes: code (unique), vendor, status, category.

**`matchmaking_matches`** (`schema.ts:546`): `id`; `customer_need_id`→customer_needs (cascade); `vendor_supply_id`→vendor_supply (cascade); `score` int dflt 0; `reasons` text[] dflt []; `status` varchar(32) dflt 'open' (open/accepted/dismissed); `reviewed_by`→users (set null); `created_at`; `updated_at`. Indexes: **unique (need, supply) pair**, need, supply, status, score.

**`matchmaking_settings`** (singleton, `schema.ts:568`): `id`; `match_quality_floor` int dflt 35; `work_queue_threshold` int dflt 75; `history_lookback_days` int dflt 90; `repeat_threshold` int dflt 3; `gap_floor_qty` int dflt 0; `show_clients_column`/`show_vendors_column` bool dflt false; `work_queue_enabled` bool dflt true; `updated_at`; `updated_by`→users (set null). (mig 0056 seeds one row.)

**`customer_sheet_snapshots`** (`schema.ts:999`, mig 0047): `id`; `customer_id`→customers (cascade); `mode` varchar(16) (internal/catalog); `actor_id`→users (set null); `actor_name` varchar(180); `item_count` int dflt 0; `rows_json` jsonb array dflt []; `notes` text; `created_at`. Index: (customer_id, created_at desc).

### B.8 Deterministic match generation

`scoreMatch(need, supply)` (`commandBus.ts:5793`) — additive integer score with reason strings:
- Category equal (case-insensitive): **+35**, "Category match".
- Tag overlap: **+min(24, count*8)**, "Tags: …".
- Product-name token overlap (`tokenOverlap`, tokens length>2): **+10**, "Product wording overlaps".
- `supply.availableQty >= need.qtyMin`: **+12**, "Quantity covers minimum".
- `supply.askingPrice <= need.targetPrice` (both set): **+12**, "Ask is within target".
- `supply.availableDate <= need.neededBy` (both set): **+7**, "Available before needed-by".

Score is capped at 100 on insert (`Math.min(100, …)`).

**Selection / rebuild**:
- `rebuildMatchesForNeed` (`:5702`): deletes existing **open** matches for the need, returns `[]` if need not `open`, else scores against all `open` supplies via `createBestMatches`.
- `bestSupplyMatchesForNeed` (`:5784`): filters score>0, sorts desc, keeps all with score ≥ **35**; if none clear 35, keeps the single top candidate (so a need always gets at least one suggestion when any positive match exists).
- `createBestMatches` / `createBestMatchesForSupply` (`:5720`, `:5751`): upsert by the unique (need, supply) pair — refresh score/reasons on existing **open** rows, skip non-open rows (never resurrect a reviewed decision), insert new ones.
- `rebuildMatchesForSupply` (`:5711`): symmetric, scores against all `open` needs (no 35-floor filter on the supply side — all positive matches kept via `createBestMatchesForSupply`).

Matches are **fully deterministic**: same inputs → same scores/reasons/selection, no randomness. Re-running create/update on a need/supply idempotently refreshes its open matches without disturbing accepted/dismissed history.

### B.9 Read procs (Sales & Matchmaking domain)

| Proc | File:line | Returns / notes |
|---|---|---|
| `salesOrderLines` | `queries.ts:639` | Lines + batch/vendor join + below-range exception projection (LATERAL on command_journal). |
| `salesSuggestions` | `queries.ts:1318` | Posted batches matching buyer tags/filters; `estimatedMargin` (internal-only). Empty without customerId. |
| `customerWorkspace` | `queries.ts:710` | Customer + last 20 orders (with exception rollup) + invoices + payments + recent commands. |
| `customerPurchaseHistory` | `queries.ts:743` | Line-level prior sales w/ derived Net-N terms & payment status. |
| `customerOrderHistory` | `queries.ts:2063` | Keyset-paginated order list (`created_at\|id` cursor). |
| `customerLastOrderedQty` | `queries.ts:2197` | Most-recent qty for a customer+batch (publicProcedure). |
| `matchmakingBoard` | `queries.ts:234` | needs + supplies + matches (status-ordered). |
| `matchmakingOpportunities` | `queries.ts:267` | Leg-2 inventory-to-move, Leg-3 gaps-to-fill (30-day snooze aware). |
| `matchmakingEntityCounts` | `queries.ts:441` | per-customer needs/matches, per-vendor supply (gated by column toggles). |
| `matchmakingSettings` | `queries.ts:242` | Singleton settings (with defaults fallback). |
| `salesOrder{External,Internal}Receipt` / `SignalText` / `PrintHtml` | `queries.ts:1513-1611` | Prefer invoice snapshot, fall back to sales-order confirmation. |
| `customerSheetSnapshotById` | `queries.ts:812` | id+customerId scoped; viewer-safe re-sanitized. |
| `recentCustomerSheets` | `queries.ts:791` | Snapshot metadata, newest first. |
| `drilldown` | `queries.ts:485` | Metric drilldown; sensitive keys manager-gated. |

### B.10 Client components

`SalesView.tsx` (+ `SalesView.columns.ts` margin toggle, `SalesView.csvExport.ts` customer-safe CSV); `PricingPanel.tsx` (customer rule editor → `setCustomerPricingRule`); `DefaultPricingPanel.tsx` (→ `setDefaultPricingRule`); `SalesSourcePane.tsx` / `InventoryFinderPanel`; `SaleLineExceptionControls.tsx` (landed COGS / below-floor / vendor approval); `LandedCostExceptionChip.tsx` (below-range chip from projection); `CustomerPurchaseHistoryPanel.tsx`; `RecentSheetsPanel.tsx` (snapshot replay); `MatchmakingView.tsx`; drawer tabs `SalesPricingTab.tsx`, `SalesOutputTab.tsx`, `SalesCommandHistoryTab.tsx`.
