> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Spec: `queries.statusCounts`

**Type:** `procedure`
**Target file:** `src/server/routers/queries.ts` (new procedure)
**Agent:** `fast-build` (low risk: one-row aggregate, no mutations) with `qa-reviewer` review.

Resolves: **CPO Audit F10** (`ViewTabBar` tab counts have no data source). Feeds: **T-B-04** (statusCounts endpoint), all `entityTabs`-pattern procedures (see [entityTabs.md](./entityTabs.md)).

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3 (ARCH-3 single data source for tab counts, ARCH-7 role gating, ARCH-8 per-entity status set, ARCH-10 single-statement aggregation).
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F10.
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) — **non-negotiable**: this procedure's response shape is keyed entirely by enum values from this file.
- [docs/engineering-plans/specifications/procedures/gridSummary.md](./gridSummary.md) §1.1 — the distinction between `gridSummary.countBy.status` (summary strip) and `statusCounts` (tab bar).
- [docs/engineering-plans/specifications/procedures/entityTabs.md](./entityTabs.md) — the consuming pattern.

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-9 (filtering is fluid — the tab bar is a 1-click status filter), UX-7 (operator sees what mode they're in — the active tab is the current filter and the counts on inactive tabs preview the alternatives). |
| **ARCH Rule(s) Followed** | ARCH-3 (one call per tab bar render — never one call per tab), ARCH-7 (`protectedProcedure` + per-view role parity with `grid`), ARCH-8 (per-`entityType` registry whose tab set is the canonical status enum). |
| **Attention Budget Tier** | Tier 0 (always-visible) — tab counts are part of the navigation context. |
| **Old Pattern Replaced** | Hand-rolled `count(*) FILTER (WHERE status = ?)` snippets repeated across views; tabs whose count is hardcoded `0` or computed client-side over the grid page. The procedure consolidates them into one query with one canonical status set. |
| **URL State Encoded** | None directly. The selected tab maps to `filters.status` in the URL state (ARCH-11); `statusCounts` is independent of the selection. |
| **Existing Infra Leveraged** | `protectedProcedure`, `pool.query`, `viewSchema`, the per-entity status table from `src/shared/statuses.ts`. |
| **Anti-Patterns Avoided** | No per-tab query. No status-string literals — every status key in the response is the canonical enum value imported from `src/shared/statuses.ts`. No leaking sensitive entities to `viewer` for views that `grid` already role-gates. |
| **Compliance Check** | (1) Open a tab-bar-equipped view: exactly one `queries.statusCounts` call. (2) Compare response keys to `<EntityName>Status.options` — must be a subset of those values (never extra). (3) `EXPLAIN ANALYZE`: one `GROUP BY status` aggregate, indexed. (4) `viewer` requesting `entityType: 'vendorBills'` → `FORBIDDEN`. (5) Toggle a status filter on the grid → `statusCounts` does NOT re-fire (the tab bar shows totals across all statuses regardless of which one is active). |

---

## §1 — Semantic Decision

### 1.1 — What this returns and what it does NOT

For a given `entityType`, returns `{ statuses: { status, count }[] }` where each `status` is an enum value from the entity's canonical status schema in `src/shared/statuses.ts`. The full enum set is always present in the response, even for values with `count = 0`, so the tab bar can render every tab (including "Cancelled (0)") in a stable order with no client-side defaulting.

`statusCounts` does **not** apply the active grid filter. The tab bar's job is to show the operator the totals across all statuses so they can pivot; if it inherited the active filter, switching tabs would show "(0)" everywhere except the currently selected status, which is useless. Filter-aware breakdown of categorical fields belongs in `gridSummary.countBy` (see [gridSummary.md](./gridSummary.md) §1.1).

### 1.2 — Why one call per render, not per tab

A naïve implementation issues `count(*) WHERE status = ?` per tab. For 6 tabs that's 6 round trips → 6× latency and 6× lock contention on hot tables. `statusCounts` runs one `GROUP BY` per render and clients zero-fill the enum on receipt.

### 1.3 — Why not piggy-back on `gridSummary`

`gridSummary` is filtered; `statusCounts` is not. Coupling them creates ambiguity (which filter wins?) and forces clients that don't need the tab bar (e.g., dashboards) to compute it anyway. Two endpoints, two semantics. The implementation IS allowed to share a Postgres prepared statement (same `SELECT status, count(*) FROM <table> GROUP BY status`) under the hood — see §7.

### 1.4 — Supported entity types

Each entry below has a canonical status enum in `src/shared/statuses.ts`. The procedure registers the entity type → table mapping; the tab set comes from the enum.

| `entityType` | Table | Status enum | Min role |
|---|---|---|---|
| `purchaseOrders` | `purchase_orders` | `PurchaseOrderStatus` | `operator` |
| `purchaseOrderLines` | `purchase_order_lines` | `PurchaseOrderLineStatus` | `operator` |
| `salesOrders` | `sales_orders` | `SalesOrderStatus` | `operator` |
| `salesOrderLines` | `sales_order_lines` | `SalesOrderLineStatus` | `operator` |
| `purchaseReceipts` | `purchase_receipts` | `PurchaseReceiptStatus` | `operator` |
| `batches` | `batches` | `BatchStatus` | `operator` |
| `invoices` | `invoices` | `InvoiceStatus` | `operator` |
| `payments` | `payments` | `PaymentStatus` | `operator` |
| `vendorBills` | `vendor_bills` | `VendorBillStatus` | `operator` |
| `vendorPayments` | `vendor_payments` | `VendorPaymentStatus` | `manager` |
| `pickLists` | `pick_lists` | `PickListStatus` | `operator` |
| `fulfillmentLines` | `fulfillment_lines` | `FulfillmentLineStatus` | `operator` |
| `connectorRequests` | `connector_requests` | `ConnectorRequestStatus` | `operator` |
| `customerNeeds` | `customer_needs` | `CustomerNeedStatus` | `operator` |
| `vendorSupply` | `vendor_supply` | `VendorSupplyStatus` | `operator` |
| `matchmakingMatches` | `matchmaking_matches` | `MatchmakingMatchStatus` | `operator` |
| `invoiceDisputes` | `invoice_disputes` | `InvoiceDisputeStatus` | `operator` |
| `photographyQueue` | `photography_queue` | `PhotographyQueueStatus` | `operator` |
| `items` | `items` | `ItemStatus` | `operator` |

Any `entityType` not in this table is rejected with `BAD_REQUEST`. New entities require both the enum in `src/shared/statuses.ts` and a registry entry here.

### 1.5 — Archived rows

Tables with an `archived_at` column (e.g., `batches`) exclude archived rows from counts. This matches the `grid` semantics (`queries.ts` `case 'inventory'`: `where b.archived_at is null`). The exclusion is encoded in the registry alongside the table mapping:

```ts
{ table: 'batches', enum: BatchStatus, baseWhere: 'archived_at IS NULL' }
```

---

## §2 — Caching

Not server-side cached. Client-side `useViewData` keys the call under `['statusCounts', entityType]` with a 30-second staleTime. The call invalidates when any command in the entity's command family completes (T-B-17 wires this through `buildAffectedQueryPredicate`).

---

## §3 — Input Schema (Zod)

```ts
// src/shared/schemas.ts (added)

export const statusCountsEntityTypeSchema = z.enum([
  'purchaseOrders',
  'purchaseOrderLines',
  'salesOrders',
  'salesOrderLines',
  'purchaseReceipts',
  'batches',
  'invoices',
  'payments',
  'vendorBills',
  'vendorPayments',
  'pickLists',
  'fulfillmentLines',
  'connectorRequests',
  'customerNeeds',
  'vendorSupply',
  'matchmakingMatches',
  'invoiceDisputes',
  'photographyQueue',
  'items'
]);

export const statusCountsInputSchema = z.object({
  entityType: statusCountsEntityTypeSchema
});

export type StatusCountsInput = z.infer<typeof statusCountsInputSchema>;
```

### 3.1 — Role gate per entity

The role gate runs after Zod parse, before SQL. Mapping `entityType → minRole` lives in the §1.4 table and is encoded in a single `minRoleFor(entityType)` helper next to the registry.

---

## §4 — Output Schema (Zod)

```ts
// src/shared/schemas.ts (added)

export const statusCountSchema = z.object({
  status: z.string().min(1).max(40),    // Canonical enum value
  count: z.number().int().min(0)
});

export const statusCountsOutputSchema = z.object({
  entityType: statusCountsEntityTypeSchema,
  statuses: z.array(statusCountSchema)
});

export type StatusCountsOutput = z.infer<typeof statusCountsOutputSchema>;
```

### 4.1 — Invariants

1. `output.entityType === input.entityType`.
2. `output.statuses` contains exactly one entry per value in the entity's canonical status enum from `src/shared/statuses.ts`. Missing values are filled in with `count: 0` server-side.
3. `output.statuses` order matches the enum declaration order in `src/shared/statuses.ts`. The tab bar renders left-to-right in this order, so it must be stable.
4. No `status` value appears in `output.statuses` that is not in the canonical enum. If the DB returns one (e.g., legacy row with a stale status), the procedure throws `INTERNAL_SERVER_ERROR` so the data quality issue surfaces in monitoring rather than silently appearing as a phantom tab.

### 4.2 — Wire shape example

```jsonc
// entityType: 'purchaseOrders'
{
  "entityType": "purchaseOrders",
  "statuses": [
    { "status": "draft",              "count": 5 },
    { "status": "finalized",          "count": 0 },
    { "status": "approved",           "count": 14 },
    { "status": "partially_received", "count": 2 },
    { "status": "received",           "count": 220 },
    { "status": "cancelled",          "count": 3 },
    { "status": "reversed",           "count": 1 }
  ]
}
```

---

## §5 — Client Consumption (informative)

`ViewTabBar` reads the response and renders one tab per `statuses[]` entry:

```ts
<TabBar>
  <Tab label="All" count={data.statuses.reduce((s, x) => s + x.count, 0)} active={!activeStatus} />
  {data.statuses.map((s) => (
    <Tab key={s.status} label={labelFor(entityType, s.status)} count={s.count} active={activeStatus === s.status} />
  ))}
</TabBar>
```

`labelFor` is a client-side label registry mapping enum value → user-visible string (e.g., `'partially_received'` → `'Partially Received'`). The procedure does NOT return labels — that's a presentation concern.

Selecting a tab calls `setGridFilter(view, 'status', tab.status)` which writes URL state and triggers `grid-v2` + `gridSummary` re-fetches; `statusCounts` itself is NOT re-fetched on tab change.

---

## §6 — Error Contract

| Code | When |
|---|---|
| `UNAUTHORIZED` | No session. |
| `FORBIDDEN` | Actor below `minRoleFor(entityType)`. |
| `BAD_REQUEST` | `entityType` not in §1.4 set. |
| `INTERNAL_SERVER_ERROR` | DB row carries a status not in the canonical enum (§4.1 invariant 4); DB connection failure; scrubbed. |

Validation order: Zod parse → role check → SQL → enum invariant check.

---

## §7 — N+1 Avoidance Strategy

**One SQL statement per call.** Implementation:

```sql
SELECT status, count(*)::int AS cnt
FROM <table>
WHERE <baseWhere>      -- e.g., archived_at IS NULL where applicable
GROUP BY status;
```

The procedure post-processes the result rows in TS:

```ts
// Build a Map<status, count> from the result, then fill in zeros from the enum.
const counts = new Map<string, number>(rows.map((r) => [r.status, r.cnt]));
const enumValues = enumForEntity(entityType).options as readonly string[];
const statuses = enumValues.map((status) => ({ status, count: counts.get(status) ?? 0 }));

// Invariant 4: any DB status not in the enum is a data quality bug.
for (const r of rows) {
  if (!counts.has(r.status) || !enumValues.includes(r.status)) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Status '${r.status}' on ${entityType} is not in canonical enum.`
    });
  }
}
```

Test (§8.4): `pg_stat_statements.calls` increments by exactly 1.

---

## §8 — Test Sketches

File: `src/server/routers/queries.statusCounts.test.ts`.

### 8.1 — Happy path: purchaseOrders zero-fill

```ts
it('returns one entry per PurchaseOrderStatus value, zero-filled', async () => {
  await seedPurchaseOrders([
    { status: 'draft' },
    { status: 'approved' },
    { status: 'approved' },
    { status: 'received' }
  ]);

  const result = await caller.queries.statusCounts({ entityType: 'purchaseOrders' });

  expect(result.entityType).toBe('purchaseOrders');
  expect(result.statuses.map((s) => s.status)).toEqual(PurchaseOrderStatus.options);
  expect(byStatus(result, 'draft')).toBe(1);
  expect(byStatus(result, 'approved')).toBe(2);
  expect(byStatus(result, 'received')).toBe(1);
  expect(byStatus(result, 'cancelled')).toBe(0);   // zero-filled
  expect(byStatus(result, 'reversed')).toBe(0);    // zero-filled
});
```

### 8.2 — Order stability matches enum declaration

```ts
it('returns statuses in canonical enum declaration order', async () => {
  const result = await caller.queries.statusCounts({ entityType: 'batches' });
  expect(result.statuses.map((s) => s.status)).toEqual(BatchStatus.options);
});
```

### 8.3 — Role failure: viewer cannot read vendorPayments counts

```ts
it('rejects viewer requesting vendorPayments with FORBIDDEN', async () => {
  const viewerCaller = await callerFor({ role: 'viewer' });
  await expect(
    viewerCaller.queries.statusCounts({ entityType: 'vendorPayments' })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

### 8.4 — Single-query (N+1 guard)

```ts
it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.statusCounts({ entityType: 'salesOrders' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

### 8.5 — Phantom status: DB carries non-canonical value

```ts
it('throws INTERNAL_SERVER_ERROR when DB has a status outside the canonical enum', async () => {
  await db.execute(sql`UPDATE purchase_orders SET status = 'super-approved' WHERE id = ${someId}`);
  await expect(
    caller.queries.statusCounts({ entityType: 'purchaseOrders' })
  ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});
```

### 8.6 — Archived rows excluded for batches

```ts
it('excludes archived batches from counts', async () => {
  await seedBatches([
    { status: 'posted', archived_at: null },
    { status: 'posted', archived_at: '2026-01-01T00:00:00Z' }
  ]);
  const result = await caller.queries.statusCounts({ entityType: 'batches' });
  expect(byStatus(result, 'posted')).toBe(1);
});
```

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|---|---|---|---|
| `src/shared/statuses.ts` (P0-1) | EXISTS | yes | Response key set comes from here. |
| `statusCountsEntityTypeSchema` (§3) | NEEDS_BUILD (this PR) | yes | |
| `ViewTabBar` client component (T-0) | NEEDS_BUILD | no for procedure itself | Client wiring. |
| `labelFor(entityType, status)` client label registry | NEEDS_BUILD (T-0) | no | Presentation only. |
| `useViewData` invalidation predicate (T-B-17) | NEEDS_BUILD | no | Client-side staleness only. |

---

## §10 — Risk Notes

- **Phantom statuses on legacy rows.** Throwing `INTERNAL_SERVER_ERROR` makes the tab bar load fail — a UX regression — but it surfaces the data quality bug. The trade-off favors loud failure: silently dropping the row would hide rows from the operator's view forever. Mitigation: a one-time DB audit (P0-7) verifies every `status` column for every registered entity has only canonical values; a CI guard query runs nightly via `pnpm db:audit:statuses` going forward.
- **Hot tables.** `batches` and `sales_orders` are large. `GROUP BY status` benefits from a btree on `status`. P0-7 verifies these exist; if missing, P0-7 adds them.
- **Status enum drift.** If `src/shared/statuses.ts` adds a value, the tab bar gets a new (likely zero-count) tab automatically. The label registry on the client must be updated in the same PR to avoid a tab labeled `'in_transit'` rather than `'In transit'`. CI guard: `pnpm lint:status-labels` compares the client label registry to enum options.
- **`countBy` overlap with `gridSummary`.** A reviewer may be tempted to remove `countBy.status` from `gridSummary` and tell consumers to use `statusCounts` instead — don't. They have different filter semantics (§1.1). Two endpoints, two purposes.

---

## §11 — Acceptance Criteria

- [ ] AC-1: `queries.statusCounts` added to `src/server/routers/queries.ts` as `protectedProcedure` with `statusCountsInputSchema`.
- [ ] AC-2: Schemas live in `src/shared/schemas.ts` per §3, §4 and import every per-entity status enum from `src/shared/statuses.ts`.
- [ ] AC-3: Per-entity registry per §1.4 is complete; an unrecognized `entityType` returns `BAD_REQUEST`.
- [ ] AC-4: Response `statuses` array is zero-filled to the full enum, in enum-declaration order (§4.1 invariants 2, 3).
- [ ] AC-5: A DB row with a non-canonical status raises `INTERNAL_SERVER_ERROR` (§4.1 invariant 4; test §8.5 passes).
- [ ] AC-6: Each call executes exactly one SQL statement (§8.4 passes).
- [ ] AC-7: Tables with `archived_at` exclude archived rows from counts (§8.6 passes).
- [ ] AC-8: `pnpm typecheck` clean. No inline status string literals in `queries.ts` introduced by this PR.
