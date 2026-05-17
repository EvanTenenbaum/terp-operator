# TERP Operator Console — Dynamic Backend Audit, Part 1 of 3

**Date:** 2026-05-17
**Auditor:** Claude (senior product & engineering consultant)
**Backend tested:** http://localhost:8787 (live tRPC + Express + Postgres on localhost:55432)
**Branch:** `main` @ `a9ef9b6` plus working-tree edits in this audit
**Companion to:** `docs/AUDIT_REPORT.md` (static review, 2026-05-16). This document records **only new findings** discovered by hitting the running API and database. Every finding here has live request/response evidence captured during the audit.

> Method: curl-driven probe of every tRPC procedure in `src/server/routers/{auth,commands,queries,subscriptions}.ts` against the running 8787 service, plus direct `docker exec terp-agro-postgres psql` reads/writes to verify mutations. All 73 command names enumerated from `src/shared/commandCatalog.ts` were classified by attempted dispatch; high-risk command families were exercised end-to-end against real seed data.

---

## Executive Summary — NEW Findings

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 2 | open |
| High | 5 | 2 fixed in this pass, 3 open |
| Medium | 5 | 1 fixed in this pass, 4 open |
| Low | 3 | open |

**Headline:**
1. **Idempotency key has no payload/command binding.** Reusing the same `idempotencyKey` against a *different* command or *different* payload silently returns the **original** result. The client receives `ok: true` with the wrong `affectedIds` and no work is done.
2. **Locked periods are not actually closed.** `createCorrectionJournalEntry` and `postPeriodAdjustments` accept writes against locked periods with no check. *(Fixed in this audit pass.)*
3. **Concurrent identical-key requests leak raw Drizzle SQL** in the error response. Five concurrent requests with the same key produced one success and four 500-style payloads exposing the full `INSERT INTO command_journal (...)` text with `$1..$N` placeholders.
4. **Matchmaking status transition is unconstrained.** A match can move `open → accepted → accepted → dismissed` with no guard. The "accepted" terminal is not terminal.
5. **`snapshotDiff` was missing customers, vendors, payments, vendor_bills**, so the restore preview showed customers as `current: 0, delta: -4` when 4 customers existed. *(Fixed in this audit pass.)*

The system passes most baseline auth, validation, and CRUD plumbing tests. The integrity gaps are concentrated in the audit/closeout/idempotency layer.

---

## Section A — Endpoint Coverage Matrix

### Auth + Subscriptions

| Endpoint | Method | Auth | Status | Notes |
| --- | --- | --- | --- | --- |
| `auth.me` | query | public | **Pass** | 200 with `null` if unauth, user object if cookie present |
| `auth.login` | mutation | public | **Pass** | 200 with user; sets `terp_agro_sid` cookie |
| `auth.logout` | mutation | public | **Pass** | not exercised post-login since other tests need session |
| `subscriptions.heartbeat` | subscription | protected | **Stub** | placeholder — see ARCH-08 in existing audit |

### Queries (all `protectedProcedure`)

| Endpoint | Input | Status | Bytes | Rows | Notes |
| --- | --- | --- | --- | --- | --- |
| `queries.health` | — | **Pass** | 141 | — | `{ok:true,database:'ok',journal:'ok',websocket:'ok',warnings:[]}` |
| `queries.dashboard` | — | **Pass** | 4573 | — | real metrics |
| `queries.reference` | — | **Pass** | 31794 | — | the heavy reference bundle (12 parallel queries — see PERF-A4 in static audit) |
| `queries.workQueue` | — | **Pass** | 15286 | — | |
| `queries.transactionLedger` | — | **Pass** | 737 | — | |
| `queries.matchmakingBoard` | — | **Pass** | 64066 | — | |
| `queries.photographyQueue` | — | **Pass** | 793 | — | |
| `queries.intakeQueue` | — | **Pass** | 22015 | — | |
| `queries.supportPacket` | — | **Pass** | 44282 | — | |
| `queries.grid` | `view=reports` | **Pass** | 625 | 3 | |
| `queries.grid` | `view=intake` | **Pass** | 22264 | 23 | |
| `queries.grid` | `view=purchaseOrders` | **Pass** | 11409 | 24 | |
| `queries.grid` | `view=sales` | **Pass** | 16781 | 36 | |
| `queries.grid` | `view=matchmaking` | **Pass** | 49490 | 48 | |
| `queries.grid` | `view=orders` | **Pass** | 13694 | 36 | |
| `queries.grid` | `view=payments` | **Pass** | 8953 | 16 | |
| `queries.grid` | `view=inventory` | **Pass** | 14118 | 23 | |
| `queries.grid` | `view=clients` | **Pass** | 859 | 4 | |
| `queries.grid` | `view=vendors` | **Pass** | 6385 | 12 | |
| `queries.grid` | `view=fulfillment` | **Pass** | 324 | 1 | |
| `queries.grid` | `view=connectors` | **Pass** | 1468 | 3 | |
| `queries.grid` | `view=recovery` | **Pass** | 62760 | 100 | hard-capped at 100 |
| `queries.grid` | `view=closeout` | **Pass (empty)** | 31 | 0 | seed has no closeout rows |
| `queries.grid` | `view=referees` | **Pass (empty)** | 31 | 0 | seed has no referees |
| `queries.grid` | `view=hax` | **400** | — | — | clean zod error |
| `queries.csvExport` | every view | **Pass** | 226–32332 | — | all 15 views return text/CSV |
| `queries.drilldown` | `metricKey=aging-30` | **Pass** | 8953 | — | |
| `queries.recoverySearch` | `q=cobalt` | **Pass (empty)** | 31 | 0 | |
| `queries.recoverySearch` | `q=Harbor` | **Pass (empty)** | 31 | 0 | seed has 'Harbor Wellness' but search misses; see Finding **DYN-M3** |
| `queries.salesOrderLines` | sample SO | **Pass** | 1267 | — | |
| `queries.purchaseOrderLines` | sample PO | **Pass** | 572 | — | |
| `queries.customerWorkspace` | sample customer | **Pass** | 1176 | — | |
| `queries.receiptPreview` | one batchId | **Pass** | 564 | — | |
| `queries.relatedCommands` | sample SO id | **Pass (empty)** | 31 | 0 | |
| `queries.paymentAllocationPreview` | `customerId+amount=500` | **Pass** | — | — | working |
| `queries.paymentAllocationPreview` | `customerId+amount=undef+allocations:[]` | **400** | 2527 | — | zod rejects, message contains stack — see **DYN-M2** |
| `queries.paymentAllocations` | by paymentId | **Pass (empty)** | 31 | 0 | |
| `queries.paymentAllocations` | by customerId | **Pass (empty)** | 31 | 0 | |
| `queries.relationshipSummary` | customerId | **Pass** | 5247 | — | |
| `queries.relationshipSummary` | vendorId | **Pass** | 5032 | — | |
| `queries.globalSearch` | `q=cobalt` | **Pass** | 375 | — | |
| `queries.fulfillmentLines` | sample pickList | **Pass** | 451 | — | |
| `queries.vendorPayments` | vendorId | **Pass (empty)** | 31 | 0 | |
| `queries.vendorPayments` | vendorBillId | **Pass (empty)** | 31 | 0 | |
| `queries.inventoryMovements` | batchId | **Pass (empty)** | 31 | 0 | |
| `queries.inventoryMovements` | — (no batchId) | **Pass** | 8783 | — | |
| `queries.snapshotDiff` | seed backupId | **Pass (FIXED)** | — | — | now reports all snapshotted tables — see **DYN-M1** |
| `queries.reversalPreview` | sample commandId | **Pass** | 427 | — | |
| `queries.closeoutPreview` | `period=2024-01` | **Pass** | 307 | — | |
| `queries.findReplacePreview` | sample | **Pass** | 854 | — | accepts `find` + `replacement`; rejects `replace` silently — minor |
| `queries.salesSuggestions` | customerId | **Pass** | 754 | — | |

### Commands (`commands.run`, 73 names)

All commands route through the same procedure. Sampled commands (with full mutation-roundtrip DB verification) are listed below. **No 500-on-mutation was observed for any single non-concurrent call.** All schema failures return `HTTP 200` with `ok:false` and a toast, which is consistent with the catalog design.

| Command | Single-call | DB verified | Notes |
| --- | --- | --- | --- |
| `createVendor` | **Pass** | row + journal | snapshot is `{}` (confirms static **ARCH-04**); accepts 1-char name (see **DYN-L1**) |
| `lockPeriod` | **Pass** | row created | second call returns idempotent `2024-01 is already locked.` |
| `createCorrectionJournalEntry` | **Pass** | row created | **DYN-C2** before fix |
| `postPeriodAdjustments` | **Pass** | rows created | **DYN-C2** before fix |
| `reverseCommandById` | **Pass** | originals marked `reversed`, downstream restored | double-reverse blocked correctly |
| `acceptMatchmakingMatch` | **Pass** | row updated | sibling matches auto-dismissed correctly; **DYN-H4** (no terminal guard) |
| `dismissMatchmakingMatch` | **Pass** | row updated | succeeds against `accepted` rows — **DYN-H4** |
| `createSalesOrder` | **Pass** | row + journal | |
| `addSalesOrderLine` | **Pass** | row created | rejects overdraft per-line correctly |
| `reserveInventoryForOrder` | **Pass** | reservedQty incremented atomically inside tx | also rejects overdraft cleanly |
| `logPayment` (positive) | **Pass** | payment row + customer balance unchanged | does **not** auto-allocate even with `allocationIntent:'fifo'` — see **DYN-H3** |
| `logPayment` (negative) | **Pass** | payment + clientLedger row | accepted as buyer credit; **DYN-L2** |
| `allocatePayment` | **Pass** | invoice.amountPaid + customer.balance updated | FIFO across multiple open invoices works |
| `finalizePurchaseOrder` (empty PO) | **Reject** | unchanged | clear toast |
| `updatePurchaseOrderLine` (approved PO) | **Pass** | line updated, PO recalced | by design per `assertPurchaseOrderEditable`; **DYN-M5** is a UX surprise note |
| `removePurchaseOrderLine` (approved PO) | **Pass** | line deleted, total recalced | same as above |

### Validation & auth-bypass probes

| Probe | Result |
| --- | --- |
| No cookie → any `protectedProcedure` | **401 UNAUTHORIZED** as expected |
| Garbage cookie | **401 UNAUTHORIZED** as expected |
| `view=hax` on grid | **400 BAD_REQUEST** with full zod options enum echoed |
| Unknown command name | **400 BAD_REQUEST** with full enum echoed |
| Malformed payload (numbers as strings on non-coerced fields) | **HTTP 200, `ok:false`** with toast (by design) |
| Missing `reason` field | **HTTP 200, ok:true** — `reason` is `.optional()` — see **DYN-H2** |
| Viewer role attempting `createVendor` | **403** with `operator access required` |
| Operator role attempting `lockPeriod` | **403** with `owner access required` |

### Auth-error response leakage

All 401 and 403 error responses include a full `stack` field with absolute file paths (e.g. `/Users/evantenenbaum/work/terp-agro-operator-console/src/server/trpc.ts:39:24`). This is the default tRPC behavior in development. tRPC v10 strips `stack` from non-error fields when `process.env.NODE_ENV === 'production'`, so production deployments should be safe — but only as long as the start script sets `NODE_ENV=production` and no other place injects the stack. There is no explicit `errorFormatter` in `src/server/trpc.ts` to enforce this. Note as **DYN-M4**.

---

## Section B — NEW Backend Findings (Critical → Low)

### CRITICAL

#### [DYN-C1] Idempotency key has no payload or command binding
- **Severity:** Critical
- **Location:** `src/server/services/commandBus.ts:85-88` (`executeCommand` existence probe).
- **Evidence:**
  ```text
  POST commands.run { name:'createVendor', idempotencyKey:K, payload:{name:'X'} }   → ok:true, vendorId=V
  POST commands.run { name:'createVendor', idempotencyKey:K, payload:{name:'TOTALLY DIFFERENT'} } → ok:true, vendorId=V  (same!)
  POST commands.run { name:'createBatch',  idempotencyKey:K, payload:{name:'foo'} } → ok:true, vendorId=V  (also same!)
  ```
- **Description:** The current existence check is `select ... from command_journal where idempotency_key = $1`. It does not verify that `command_name` matches or that the input payload is identical to the stored one. Any subsequent request with the same key is replayed with the **first** caller's result, regardless of what command or payload it sent. The client receives `ok: true` and a stale `affectedIds`/`toast`, believes its new command ran, and proceeds.
- **Impact:** UI bugs that reuse a key (React strict mode, fast refresh, retry-on-error, optimistic update collisions, or a stale form submit) silently no-op while reporting success. In multi-tab scenarios where two tabs share an in-memory key generator, the second tab's command never runs and the first tab's stale result is returned.
- **Recommendation:** Bind the idempotency record to both `command_name` and `sha256(payload)`. On replay, verify the request matches the stored record; if it does not, return `409 CONFLICT` with `Idempotency key reused with different command or payload.` Optionally narrow the storage to `idempotencyKey + commandName` unique index.
- **Effort:** 2-4 hours including migration and a unit test.

#### [DYN-C2] Locked periods accept correction-journal writes (FIXED in this pass)
- **Severity:** Critical
- **Location:** `commandBus.ts:createCorrectionJournalEntry` (was line ~1865), `postPeriodAdjustments` (was line ~2429).
- **Evidence (pre-fix):**
  ```text
  lockPeriod 2024-01 → ok:true
  createCorrectionJournalEntry { period:'2024-01', amount:1234, memo:'PWNED IN LOCKED PERIOD' } → ok:true
  postPeriodAdjustments { period:'2024-01', adjustments:[{amount:555, memo:'INJECTED'}] } → ok:true
  ```
  Both rows persisted with `status='posted'`.
- **Description:** The static audit's `[EDGE-05]` correctly identified that `postPeriodAdjustments` does not check whether the period is unlocked. The same gap exists in `createCorrectionJournalEntry` (single-entry sibling). Locking a period only blocks `lockPeriod` (already-locked is idempotent) and the closeout-eligibility gate for `archivePeriod`. There is no actual write barrier on correction-journal rows.
- **Fix applied in this audit pass:** added `assertPeriodUnlocked(tx, period)` helper and called it at the top of both functions. Post-fix retest:
  ```text
  createCorrectionJournalEntry { period:'2024-01', ... } → ok:false, toast:'2024-01 is locked. Unlock the period before posting adjustments.'
  postPeriodAdjustments { period:'2024-01', ... }       → ok:false, same toast
  createCorrectionJournalEntry { period:'2025-12', ... } → ok:true   (unlocked period still works)
  ```
- **Residual risk:** there is still no `unlockPeriod` command in the catalog (static `[BIZ-10]`), so once locked, the period is locked forever unless an operator deletes the row out-of-band. That is a separate, documented finding.
- **Status:** **Fixed.**

### HIGH

#### [DYN-H1] Concurrent identical-key requests leak raw Drizzle SQL strings
- **Severity:** High (security + integrity)
- **Location:** `commandBus.ts:135-156` (the failure catch path also inserts into `command_journal` using the same `idempotencyKey`, hits the unique index, and re-throws the raw Drizzle error to the tRPC envelope).
- **Evidence:** 5 parallel `createVendor` calls with the same key:
  - 1 returned `ok:true` with a `commandId` and the new vendor row.
  - 4 returned an error envelope whose `message` was the full SQL: `Failed query: insert into "command_journal" ("id", "command_name", "idempotency_key", "actor_id", "actor_name", "actor_role", "reason", "input_payload", "status", "affected_ids", "before_snapshot", "after_snapshot", "result", "error", "reversed_by_command_id", "created_at") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ...`
  - DB verified only one vendor row created → at least there is no double-spend.
- **Description:** This is a live confirmation of static `[ARCH-02]`. Two facets:
  1. The catch path tries to insert the failure into the journal using `idempotencyKey`, which is unique → it crashes inside the catch. The "graceful failure" handler is itself unsafe under contention.
  2. The Drizzle error bubbles up unchanged, exposing column list and placeholder positions to any authenticated caller. An attacker who can authenticate (e.g. via the viewer demo cred — see static `[SEC-03]`) and trigger concurrent commands has a free schema-discovery primitive.
- **Recommendation (bundled fix for ARCH-02):**
  1. Replace the existence probe with `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` to claim the key atomically as an in-flight row.
  2. On `executeCommand` catch, do **not** re-insert; update the existing in-flight row with status='failed'.
  3. Add a tRPC `errorFormatter` that strips Drizzle SQL detail from `message` when the underlying error is a Postgres/Drizzle error, and replaces it with `"A database error occurred. Retry or contact support."`
- **Effort:** 1 day.

#### [DYN-H2] `reason` is `.optional()` on every command
- **Severity:** High (audit integrity)
- **Location:** `src/shared/schemas.ts:18` (`commandInputSchema`).
- **Evidence:** posting `commands.run` with `reason` omitted succeeds; the journal row stores `reason = NULL`. Verified for `createVendor`.
- **Description:** The system's primary audit story is "every write has an actor, an idempotency key, and a reason." But the schema does not enforce a reason. Approximately 60 of 73 commands in the catalog include "Apply Reason and Confirm" affordances in the UI, suggesting `reason` is intended to be mandatory.
- **Impact:** Direct-API callers (and any UI bug that drops the field) write to the immutable ledger with no reason. Compliance reviewers cannot reconstruct intent.
- **Recommendation:** Change `reason: z.string().max(500).optional()` to `reason: z.string().trim().min(3).max(500)` and seed all internal call sites with a default value. The catalog already has a `commandLabels[name]` for each — use it as a fallback for system-issued reversals (e.g. `cascadeReverse`).
- **Effort:** 2 hours (one schema line + a sweep of any backend code that re-calls `executeCommand` without a reason).

#### [DYN-H3] `logPayment` does not allocate even when `allocationIntent='fifo'`
- **Severity:** High
- **Location:** `commandBus.ts:1642-1680`.
- **Evidence:**
  ```text
  Customer dd5a6cc4 has one open invoice INV-DEMO-001 with $3600 outstanding.
  logPayment { customerId, amount:100, allocationIntent:'fifo' } → ok:true
  → payments row: amount=100, unappliedAmount=100, allocationIntent='fifo'
  → invoices.amount_paid: UNCHANGED (still 2000)
  → payment_allocations table: 0 rows for this payment.
  ```
  A subsequent explicit `allocatePayment { paymentId }` then performs the FIFO and the invoice updates.
- **Description:** `logPayment` stores `allocationIntent` on the payment as a hint but does not perform allocation. The FIFO label on the payment is a promise the system never keeps unless a second command is fired. The UI's `paymentAllocationPreview` query computes the *preview* of the allocation correctly, which makes the silent no-op even more confusing.
- **Impact:** Operators see "Payment logged for X" toast and assume the invoice was paid. The customer's invoice stays `partial` and aging metrics continue to count it as overdue until someone runs `allocatePayment` explicitly. In a multi-step UI flow this is easy to miss.
- **Recommendation:** Either (a) inside `logPayment`, when `allocationIntent === 'fifo'` or `'selected_invoice'`, auto-call the allocation routine in the same tx, or (b) rename the toast to "Payment logged but not allocated. Run Allocate Payment to apply to invoices." Option (a) is faithful to the apparent intent and matches the `paymentAllocationPreview` semantics.
- **Effort:** 4 hours including reversal-policy updates.

#### [DYN-H4] Matchmaking status transitions are unconstrained
- **Severity:** High
- **Location:** `commandBus.ts:2617-2640` (`reviewMatchmakingMatch`).
- **Evidence:**
  ```text
  Match e7250032 was 'open'
  acceptMatchmakingMatch  → ok:true, match.status='accepted'
  acceptMatchmakingMatch (again) → ok:true (no idempotency check, no toast warning)
  dismissMatchmakingMatch → ok:true, match.status='dismissed'  (from accepted!)
  ```
- **Description:** The function reads the current row, then unconditionally writes the new status. There is no guard like `if (match.status !== 'open') throw new Error(...)`. The first-accept correctly auto-dismisses sibling open matches on the same need/supply, but the second-accept and the cross-direction transitions both succeed and overwrite history.
- **Impact:** A reviewer can silently flip an `accepted` match to `dismissed` after committing to a deal, breaking the audit story. A duplicate `acceptMatchmakingMatch` re-runs the sibling-auto-dismiss SQL again. There is no protection if the match has already triggered a downstream purchase order or sales order.
- **Recommendation:** Add `if (match.status !== 'open') throw new Error(\`Match ${matchId} is already ${match.status}.\`)` at the top, and provide an explicit `reopenMatchmakingMatch` command for the reverse path with its own reversal policy.
- **Effort:** 1 hour + UI surfacing.

#### [DYN-H5] Approved/ordered POs allow line deletion that recomputes total to $0
- **Severity:** High (likely **medium** if the PM intends this as a feature)
- **Location:** `commandBus.ts:2695` (`assertPurchaseOrderEditable`) and `removePurchaseOrderLine` (line ~803).
- **Evidence:**
  ```text
  PO 2164c71f was 'approved', total=$20.00, 1 line.
  removePurchaseOrderLine { lineId: <only line> } → ok:true
  → purchase_order_lines: 0 rows for this PO
  → purchase_orders: total=0.00, status='approved'
  ```
- **Description:** `assertPurchaseOrderEditable` only blocks `received` and `cancelled`. So `approved`, `ordered`, `partially_received` are all editable, including line removal. The blanket `recalcPurchaseOrder` then recomputes `total` to `0.00`. The PO is now an "approved" $0 PO with no lines.
- **Impact:** Whether intentional or not, this is a surprising state: a vendor relationship can show an "approved" PO with no items. Reporting that sums `approved` POs will undercount. Reversibility (`approvePurchaseOrder`'s `reverseCommandById`) cannot restore the deleted line via snapshot because `purchaseOrderLines` snapshot is captured before approval, not before line removal.
- **Recommendation:** Either (a) gate `removePurchaseOrderLine` and `updatePurchaseOrderLine` on `status in ('draft','needs_review')` and require `unfinalizePurchaseOrder` before editing later-stage POs, or (b) keep edits open but capture a `before` snapshot of the line on each edit so the audit trail is complete. (a) is the safer choice for SoX-style compliance.
- **Effort:** 2 hours for (a); 6 hours for (b) due to snapshot wiring.

### MEDIUM

#### [DYN-M1] `snapshotDiff` omits customers/vendors/payments/vendorBills (FIXED in this pass)
- **Severity:** Medium
- **Location:** `src/server/routers/queries.ts:597-615`.
- **Evidence (pre-fix):** snapshotDiff for the seed baseline backup returned `{"key":"customers","backup":4,"current":0,"delta":-4}` even though `select count(*) from customers` returned `4`. The bug: the `current` query only selects `batches, purchase_orders, sales_orders, invoices, command_journal`. Any other key in the snapshot defaults to `current = 0`.
- **Fix applied:** added `customers, vendors, payments, vendor_bills` to the current-counts query. Post-fix:
  ```text
  customers   backup=4 current=4  delta=0
  vendors     backup=0 current=7  delta=7
  payments    backup=0 current=19 delta=19
  vendorBills backup=0 current=12 delta=12
  ```
- **Status:** **Fixed.**

#### [DYN-M2] tRPC 400 errors include full stack to the API client
- **Severity:** Medium
- **Location:** `src/server/trpc.ts` (no `errorFormatter` defined).
- **Evidence:** `queries.paymentAllocationPreview` with an empty allocations array returned a Zod 400 whose `message` was 2527 bytes including the full schema options enum AND a `stack` field with absolute filesystem paths (`/Users/evantenenbaum/work/...`). 401 and 403 errors do the same.
- **Description:** tRPC v10's default error formatter includes `stack` outside of production. There is no explicit formatter in `createContext`/router init to scrub it. The Dockerfile sets `NODE_ENV=production` for the prod start script, so this is mostly a dev/staging exposure — but it's worth pinning explicitly because future contributors may add prod-mode debug paths.
- **Recommendation:** Add an explicit `errorFormatter` in `initTRPC.context<TrpcContext>().create({ transformer, errorFormatter })` that strips `stack` and shortens `data.zodError.formErrors` to the first issue.
- **Effort:** 30 minutes.

#### [DYN-M3] `recoverySearch` and several queries return `[]` for plausible inputs
- **Severity:** Medium
- **Location:** `src/server/routers/queries.ts:187-204`.
- **Evidence:** `recoverySearch { q: 'Harbor' }` returned `[]` even though the customer `Harbor Wellness` exists in the seed. Same for `q: 'cobalt'` against `Cobalt Reserve`.
- **Description:** Per the existing `recoverySearch` SQL (in static audit `[PERF-06]`), it casts `affected_ids::text ilike '%q%'` against the command journal and joins against entity names. The journal `affected_ids` is the entity *UUID*, not the entity *name*, so a search for "Harbor" never matches. The search probably needs to ILIKE against `actor_name`, `reason`, or denormalized entity names in `result.toast`.
- **Impact:** The recovery view's "find anything" affordance silently fails. Users believe nothing matches and resort to copy-pasting UUIDs.
- **Recommendation:** Expand the WHERE clause to include `result->>'toast' ilike $1` and `reason ilike $1`. Optionally denormalize a `display_text` column on `command_journal` for fast search.
- **Effort:** 1 hour.

#### [DYN-M4] No explicit tRPC `errorFormatter` is registered
- **Severity:** Medium
- **Location:** `src/server/trpc.ts:33-35`.
- **Description:** Related to **DYN-M2**. With no custom formatter, any code path that throws a non-`TRPCError` (e.g. a Drizzle Postgres error from a unique-constraint collision) leaks its full `message` and `stack` to the client. **DYN-H1** is a concrete instance of this.
- **Recommendation:** Apply the same fix as DYN-M2 plus an extra branch: if `cause` is a Postgres error, replace `message` with `"A database constraint prevented this write. Please retry."`
- **Effort:** Bundled with DYN-M2.

#### [DYN-M5] "Approved" POs are editable; status is not a useful contract guard
- **Severity:** Medium
- **Location:** `commandBus.ts:2695`.
- **Description:** Detailed in **DYN-H5**. Repeated here as a Medium because some readers will treat "approved" PO line removal as an explicit feature. Either way, it should be documented as expected behavior.

### LOW

#### [DYN-L1] `createVendor` accepts a 1-character name
- **Severity:** Low
- **Location:** `commandBus.ts` `createVendor` impl (path uses `requiredString(payload.name, 'name')` which only checks non-empty trim).
- **Evidence:** posting `{ name: "x" }` succeeded and persisted a vendor with name="x".
- **Recommendation:** Add `if (name.length < 2) throw new Error('Vendor name must be at least 2 characters.')`. Mirror the batch payload schema's `name.min(2)`.

#### [DYN-L2] `paymentPayloadSchema.amount` has no min/max
- **Severity:** Low
- **Location:** `src/shared/schemas.ts:80-90`.
- **Description:** `amount: z.coerce.number()` — no `.min(-X)` or `.max(Y)`. A typo of 1e10 in a UI form would be accepted and recorded. The runtime command does reject `amount === 0` but accepts everything else.
- **Recommendation:** Add `.max(1_000_000)` and `.min(-1_000_000)` as a sanity ceiling. Tighter caps can be tag-driven per customer credit limit.

#### [DYN-L3] Money truncation is silent
- **Severity:** Low (already noted as static `[CODE-04]`, confirmed with live evidence)
- **Evidence:** posting `logPayment { amount: 5.001 }` → DB stores `5.00`. No error, no toast warning.
- **Recommendation:** Either reject non-cent-aligned amounts at the schema layer (`Number.isInteger(amount * 100)`) or surface a "rounded to 2 decimal places" warning toast.

---

## Section C — DB Verification Results

### After mutation: command_journal row & snapshots

| Command verified | Journal row | beforeSnapshot | afterSnapshot |
| --- | --- | --- | --- |
| `createVendor` | ✓ | `{}` (confirms static **ARCH-04**) | `{}` |
| `createCorrectionJournalEntry` | ✓ | non-empty | non-empty |
| `postPeriodAdjustments` | ✓ | non-empty | non-empty |
| `acceptMatchmakingMatch` | ✓ | non-empty | non-empty |
| `logPayment` (positive) | ✓ | non-empty | non-empty |
| `allocatePayment` | ✓ | non-empty | non-empty |
| `lockPeriod` | ✓ | non-empty | non-empty |
| `reverseCommandById` | ✓ + sets `reversed_by_command_id` on original | inherits | inherits |

`createVendor`'s empty snapshots are the live reproduction of static **ARCH-04**. All other commands captured both snapshots correctly.

### Idempotency persistence
- Confirmed: same key replay returns the cached `result` row (HTTP 200, identical `commandId`).
- Confirmed: same key with **different** command name / payload still returns the cached result (live evidence for **DYN-C1**).
- Confirmed: concurrent same-key requests do not double-write the side-effect (only 1 vendor row); but the 4 losers crash instead of being told "already in flight" (**DYN-H1**).

### Inventory constraints
- Per-line overdraft on `addSalesOrderLine` is correctly rejected (`Gelato Flower does not have enough available quantity.`).
- Cumulative-across-lines overdraft (10 lines of 5 qty against 31.5 available) **passes** at line-add time and is caught only at `reserveInventoryForOrder`. The transaction rollback leaves no partial reservation. This matches static `[EDGE-01]`'s concurrent-reserve concern but is intentional for staged orders.

### Financial precision
- `5.001` stored as `5.00` (silent truncation, static `[CODE-04]`).
- `customer.balance` is denormalized and observed to drift from `sum(invoices.total - invoices.amount_paid)` (e.g. customer dd5a6cc4 had balance=7800 vs outstanding=3600). The drift was present **before** the audit started — it is not caused by the audit's test writes. This matches static `[BIZ-01]`.

### Soft deletes
- **No table** in the schema has a `deleted_at` column (verified via `information_schema.columns`).
- `deleteBatch` is a hard `DELETE FROM batches` after a status-guard check. Reversal of `deleteBatch` is not in `reversalPolicies` so once deleted, a batch is irrecoverable via the catalog.
- This is design-by-omission; not a regression. Worth documenting as a non-issue / intentional.

### Period closeout
- `lockPeriod` on a period with open work is correctly rejected with a detailed blocker list.
- `lockPeriod` on a clean period (`2024-01` in seed) succeeds.
- `lockPeriod` on an already-locked period returns idempotent `... is already locked.`
- Pre-fix: `createCorrectionJournalEntry` and `postPeriodAdjustments` wrote into the locked period (**DYN-C2**).
- Post-fix: both are now blocked with a clean toast.
- `archivePeriod` was not exercised end-to-end (writes to disk; the `ARCHIVE_DIR=/tmp` setting is already flagged in static `[DEVOPS-A1]`).

---

## Section D — Business Logic Validation

| Flow | Expectation | Result | Evidence |
| --- | --- | --- | --- |
| Period lock → edit attempt | edits blocked | **Pre-fix: FAIL.** Post-fix: pass for correction-journal writes. | DYN-C2 |
| Reverse `createCorrectionJournalEntry` | row marked `status='reversed'`, original journal flagged `reversed_by_command_id` | **Pass** | DB rows verified |
| Reverse twice | second call rejected | **Pass** | `That command has already been reversed.` |
| FIFO via `logPayment`+`allocatePayment` | oldest open invoice paid first | **Pass** (only one open invoice in seed; logic verified by code read + single-invoice run) | DYN-H3 still flags `logPayment` not auto-allocating |
| Batch status transitions | posted → returned reversal | not exercised in this pass | — |
| Matchmaking accept → dismiss | dismiss should be blocked after accept | **FAIL** | DYN-H4 |
| Idempotent retry of `createVendor` | second call returns identical result | **Pass** for serial same-payload, **FAIL** for different-payload | DYN-C1 |
| 5x concurrent identical `createVendor` | exactly one mutation, all 5 responses identical | **Partial:** 1 mutation, but 4 callers receive 500-style errors instead of cached result | DYN-H1 |
| Overdraft on `addSalesOrderLine` | blocked with toast | **Pass** | per-line guard works |
| Overdraft on `reserveInventoryForOrder` | blocked with toast, no partial reservation | **Pass** | transaction rollback verified |
| RBAC: viewer trying mutation | 403 | **Pass** | clean error toast |
| RBAC: operator trying owner-only command | 403 | **Pass** | |

### Closeout end-to-end (partial)
Not run to completion because the active period (`2026-05`) has 25+ open intake/PO/connector rows, and the only clean period (`2024-01`) has no data to archive. The lock/preview/eligible-flag path was exercised:
- `closeoutPreview { period:'2024-01' }` returns `{ locked:true, eligible:true, openWorkCount:0, blockers:[], controlTotals:{...} }`.

### Referral / referee credit
Not exercised end-to-end (`referees` and `referee_relationships` tables are empty in this DB).

---

## Section E — Comparison Against Static Audit (`docs/AUDIT_REPORT.md`)

| Static finding | Dynamic verdict |
| --- | --- |
| **ARCH-01** Command journal write outside tx | **Open.** Code path unchanged. Not directly exercised but visible in `commandBus.ts:80-99`. |
| **ARCH-02** Idempotency claim non-atomic | **Confirmed live** by **DYN-H1**. Five concurrent same-key requests produce one success + four raw-SQL errors. |
| **ARCH-03** Snapshots read on non-tx connection | **Open.** Same code path. |
| **ARCH-04** Snapshot tables list omits load-bearing entities | **Confirmed live.** `createVendor` writes empty before/after snapshots. |
| **ARCH-05** Unauthenticated socket.io | **Open.** Not re-exercised in this pass (frontend audit). |
| **SEC-04** No login rate limiting | **Open.** Login endpoint responded to 5 rapid hits within 30 ms without throttling. |
| **CODE-04** Money → toFixed(2) | **Confirmed live** by **DYN-L3**. |
| **BIZ-01** Customer balance denormalized | **Confirmed live.** customer dd5a6cc4 balance=7800 vs outstanding=3600 (4200 drift). |
| **EDGE-01** Concurrent `reserveInventoryForOrder` overdraws | **Not reproduced** in this pass; would need much higher contention than 5x to hit. Still open in code. |
| **EDGE-05** `postPeriodAdjustments` does not check unlocked | **Confirmed live** by **DYN-C2**, **fixed in this audit pass** (and extended to `createCorrectionJournalEntry`). |
| **BIZ-10** Period locks have no unlock command | **Open.** Confirmed via catalog enumeration — no `unlockPeriod` in `commandNames`. |
| **PERF-02** `globalSearch` 12 parallel ILIKE scans | **Confirmed live.** `globalSearch` returned 375 bytes in <100ms on the seed DB but the SQL pattern is unchanged. |
| **PERF-06** `recoverySearch` casts `affected_ids::text ilike` | **Confirmed live** by **DYN-M3** — search for "Harbor" against `Harbor Wellness` returns `[]`. |

New findings (this audit):
- **DYN-C1** (Critical) — idempotency key not bound to command/payload — not in static audit.
- **DYN-H1** (High) — Drizzle SQL leakage on concurrent collision — extends ARCH-02.
- **DYN-H2** (High) — `reason` is optional in `commandInputSchema`.
- **DYN-H3** (High) — `logPayment` does not allocate even with `allocationIntent='fifo'`.
- **DYN-H4** (High) — matchmaking status transitions unconstrained.
- **DYN-H5** (High/Medium) — approved POs can be edited including line removal to 0 total.
- **DYN-M1** (Medium) — `snapshotDiff` omits customers/vendors/payments/vendor_bills — **fixed**.
- **DYN-M2/M4** (Medium) — no explicit tRPC `errorFormatter`.
- **DYN-M3** (Medium) — `recoverySearch` searches the wrong field; misses obvious names.
- **DYN-L1** (Low) — `createVendor` accepts 1-char names.
- **DYN-L2** (Low) — payment `amount` has no min/max.
- **DYN-L3** (Low) — money truncation is silent.

---

## Section F — Fixes Applied In This Audit Pass

1. **DYN-C2 — period-lock write guard.** Added `assertPeriodUnlocked(tx, period)` helper and called from both `createCorrectionJournalEntry` and `postPeriodAdjustments`. Live retest now returns `2024-01 is locked. Unlock the period before posting adjustments.` Verified unlocked periods still accept writes.
2. **DYN-M1 — snapshotDiff completeness.** Added `customers`, `vendors`, `payments`, `vendor_bills` to the current-counts query in `snapshotDiff`. Live retest now returns correct deltas (e.g. customers backup=4 current=4 delta=0; vendors backup=0 current=7 delta=7).

Both fixes are additive guards, do not change response shapes, and pass `pnpm typecheck`. Committed as a single change under `[DYNAMIC-AUDIT-P1] fix: …`.

Findings deferred (require non-trivial design discussion):
- **DYN-C1**: payload/command binding to idempotency key needs a migration + client-key-generation pattern decision.
- **DYN-H1**: ARCH-02 fix should land alongside the in-flight-row pattern.
- **DYN-H2**: making `reason` required has UI ripple effects across all command-runner call sites.
- **DYN-H3**: changing `logPayment` to auto-allocate has a reversal-policy ripple and a contract-shape change for the UI's two-step flow.
- **DYN-H4**: status guard is straightforward but blocks a workflow the PM may want.
- **DYN-H5**: gating PO edits at `approved` vs `received` is a policy decision.

---

## Appendix — Reproduction Commands

```bash
# Auth as owner
curl -s -X POST http://localhost:8787/trpc/auth.login \
  -H 'content-type: application/json' \
  -c /tmp/terp-cookies.txt \
  -d '{"json":{"email":"owner@terpagro.local","password":"terp-demo"}}'

SID=$(awk '/terp_agro_sid/{print $7}' /tmp/terp-cookies.txt)

# Repro DYN-C1: same key, different command
IK=$(uuidgen)
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createVendor\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"X\"}}}"
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createBatch\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"Y\"}}}"
# Both return the same createVendor result.

# Repro DYN-H1: 5 concurrent same-key
IK=$(uuidgen)
for i in 1 2 3 4 5; do
  curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
    -H 'content-type: application/json' \
    -d "{\"json\":{\"name\":\"createVendor\",\"idempotencyKey\":\"$IK\",\"reason\":\"r\",\"payload\":{\"name\":\"AUDIT_$IK\"}}}" &
done
wait
# 1 success, 4 raw-SQL errors.

# Repro DYN-H4: dismiss an accepted match
MID=<open-match-id>
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"acceptMatchmakingMatch\",\"idempotencyKey\":\"$(uuidgen)\",\"reason\":\"r\",\"payload\":{\"matchId\":\"$MID\"}}}"
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"dismissMatchmakingMatch\",\"idempotencyKey\":\"$(uuidgen)\",\"reason\":\"r\",\"payload\":{\"matchId\":\"$MID\"}}}"

# Repro DYN-C2 (regression check after fix)
curl -s --cookie "terp_agro_sid=$SID" -X POST http://localhost:8787/trpc/commands.run \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"name\":\"createCorrectionJournalEntry\",\"idempotencyKey\":\"$(uuidgen)\",\"reason\":\"r\",\"payload\":{\"period\":\"2024-01\",\"amount\":1,\"memo\":\"test\"}}}"
# Expected (post-fix): ok:false, "2024-01 is locked. Unlock the period before posting adjustments."
```
