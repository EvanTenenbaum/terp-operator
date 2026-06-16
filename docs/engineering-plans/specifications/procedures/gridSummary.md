> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Spec: `queries.gridSummary`

**Type:** `procedure`
**Target file:** `src/server/routers/queries.ts` (new procedure)
**Agent:** `build` (primary) with `qa-reviewer` review.

Resolves: **CPO Audit F8** (`GridSummaryStrip` has no data source). Feeds: **T-B-03** (gridSummary endpoint).

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3 (ARCH-3 single data source, ARCH-7 role gating, ARCH-8 per-entity queries, ARCH-10 N+1 avoidance), §6.2.
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F8.
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) — every `filters.status` value flows through here.
- [src/server/routers/queries.ts](../../../../src/server/routers/queries.ts) `viewSchema` (lines 19), `gridSql` (line 2854), and the role-gated post-projection on the `grid` procedure (lines 202–212) — same view set; same role-gating posture.
- [docs/engineering-plans/specifications/procedures/grid-v2.md](./grid-v2.md) — `filters` payload shape is shared.

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-3 (one primary surface — the summary strip is part of the grid's at-a-glance answer, not a separate dashboard), UX-9 (filtering is fluid — totals reflect the active filter set immediately), UX-11 (URL is the session memory — the filter that drives this strip lives in URL state). |
| **ARCH Rule(s) Followed** | ARCH-3 (one server call per view summary, never a per-metric fan-out), ARCH-7 (`protectedProcedure` + per-view role parity with `grid`), ARCH-8 (per-`entityType` shape, same registry as `grid`), ARCH-10 (single-statement aggregate; no row-by-row counting on the client). |
| **Attention Budget Tier** | Tier 0 (always-visible above the grid) — the strip is the operator's answer to "what does this list mean?". Total count, sum of money, average-only-if-actionable. |
| **Old Pattern Replaced** | Per-view ad-hoc footer aggregates computed in React reducers (`useMemo` over the grid rows). That pattern returns sums of the **visible page** when paginated, which is incorrect under filtered views. The strip's whole job is to summarize the underlying filtered set, regardless of pagination. |
| **URL State Encoded** | None directly. The strip is keyed by the *same* `filters` payload the grid uses (URL-encoded under ARCH-11 via `qf`/`qa`), so a refresh that restores the grid filter automatically restores the summary. |
| **Existing Infra Leveraged** | `protectedProcedure`, `pool.query`, `canRole`, `viewSchema`, the per-view filter-application machinery shared with `grid-v2`. |
| **Anti-Patterns Avoided** | No per-metric query (one SQL → one aggregate row). No fetching the grid rows then summing in TS (catastrophic when the filtered set is 50k rows). No status string drift — every `status` in `filters` is canonicalized via `src/shared/statuses.ts`. No leaking sensitive money totals to `viewer` for views where `grid` already blanks money columns (sales `internalMargin`, inventory `unitCost`). |
| **Compliance Check** | (1) Network panel: opening a grid view fires exactly one `queries.gridSummary` call alongside the `grid` call, sharing the same `filters` payload byte-for-byte. (2) `EXPLAIN ANALYZE` shows a single `Aggregate` plan node on top of the same `WHERE` predicates the grid uses — no `Materialize` over the row set then aggregate-on-the-client. (3) Toggle a filter chip → summary numbers update; total count never disagrees with the grid's row count for any unpaginated filter. (4) As `viewer`, request `entityType: 'sales'`; `sumFields` does not include `internalMargin`. (5) Pass a bogus status string for `purchaseOrders`; rejected with `BAD_REQUEST` before SQL. |

---

## §1 — Semantic Decision

### 1.1 — What the strip shows

For each grid view, `gridSummary` returns:

- `totalRows` — the count of rows after applying `filters`, ignoring `limit`/`offset`.
- `sumFields` — an object of `{ fieldName: numericTotal }` for the money/quantity columns the operator cares about (e.g., `total` and `amountPaid` for invoices).
- `avgFields` — sparse `{ fieldName: numericAverage }` for the columns where an average actually means something (e.g., `avgDaysToPay` on clients). Most entities have no entries here; missing is fine.
- `countBy` — sparse `{ field: { value: count } }` for the categorical breakdowns the strip surfaces inline (e.g., `status` breakdown for the bulk-action affordance). When `countBy.status` exists, it is the canonical source for the status badges on the strip; the separate `statusCounts` procedure (see [statusCounts.md](./statusCounts.md)) is used by the **tab bar**, not the summary strip.

### 1.2 — Why one endpoint per entity is wrong

A per-entity procedure would force the client to switch on `entityType` to pick a procedure name — defeating the schema-driven view registry (ARCH-8) and inflating the surface area. Instead, `gridSummary` dispatches on `entityType` server-side using a registry mirroring `gridSql`.

### 1.3 — Supported entity types

Mirrors `viewSchema` (`queries.ts:19`). At Phase 0–1 ship, the procedure supports every value `viewSchema` does: `reports`, `intake`, `purchaseOrders`, `sales`, `matchmaking`, `orders`, `payments`, `inventory`, `clients`, `vendors`, `fulfillment`, `connectors`, `recovery`, `closeout`, `referees`, `processors`, `photography`, `purchaseReceipts`, `items`, `disputes`. New views added to `viewSchema` MUST be added to the summary registry in the same PR (CI guard: see §10).

Per-entity field tables (the `sumFields` / `avgFields` / `countBy` shape) are defined in §3.3.

### 1.4 — Why a separate endpoint at all (not piggy-back on `grid-v2`)

`grid-v2` ships rows. The summary needs to NOT ship rows — it ships one aggregate row regardless of `totalRows`. Coupling them forces either:
- The client to wait for the grid response before the strip paints (slower TTI), or
- `grid-v2` to always return both, even when the grid is paginated and only the top page is wanted (wasteful).

Two endpoints, same filter input, parallel fetch in `useViewData` (T-B-17).

---

## §2 — Caching

Not TTL-cached server-side (the underlying tables change frequently and the strip is interactive). Client-side, `useViewData` keys this call under `['gridSummary', entityType, filters]` with a 15-second staleTime; same revalidation triggers as the parallel `grid-v2` query.

---

## §3 — Input Schema (Zod)

```ts
// src/shared/schemas.ts (added)

import { viewSchema } from '../server/routers/queries'; // already exported
// Filter shape is shared with grid-v2 (see grid-v2.md §3).
import { gridFiltersSchema } from './gridFilters';

export const gridSummaryInputSchema = z.object({
  entityType: viewSchema,
  filters: gridFiltersSchema.optional()
});

export type GridSummaryInput = z.infer<typeof gridSummaryInputSchema>;
```

`gridFiltersSchema` (defined alongside `grid-v2.md`) is the canonical filter envelope:

```ts
// src/shared/gridFilters.ts (added — owned by grid-v2 spec)
export const gridFiltersSchema = z.object({
  status: z.string().min(1).max(40).optional(),
  text: z.string().trim().max(120).optional(),
  // Generic equality filters: opaque to the server-side typing layer, narrowed
  // per entityType in the procedure (same approach as filters.status).
  eq: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  dateRange: z.object({
    field: z.string().min(1).max(40),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  tags: z.array(z.string()).max(20).optional()
}).strict();
```

### 3.1 — Per-entity status narrowing

Same approach as `comboboxOptions` (§3.1): the procedure narrows `filters.status` against the canonical enum mapped from `entityType`. The mapping is the **same** as `grid-v2`, defined once in `src/server/routers/queries.ts` and imported by both procedures.

### 3.2 — Role gate parity with `grid`

The `grid` procedure (queries.ts:202–212) already encodes role-based projection rules (`sales.internalMargin`, `inventory.unitCost` → `null` for non-managers). `gridSummary` mirrors those rules:

- For `viewType === 'sales'` and actor below `manager`: `sumFields.internalMargin` and `sumFields.marginWaivedTotal` are NOT included in the response.
- For `viewType === 'inventory'` and actor below `manager`: `sumFields.unitCost`-derived totals (`inventoryValue`) are NOT included.
- All other `sumFields` are unaffected by role.

This parity is non-negotiable: a `viewer` learning the total internal margin via the strip while the grid blanks the per-row column would be a regression.

### 3.3 — Per-entity registry

Each entry below is what the procedure registers for that `entityType`:

| `entityType` | `sumFields` | `avgFields` | `countBy` |
|---|---|---|---|
| `purchaseOrders` | `total`, `prepaidAmount`, `remainingPrepay` | (none) | `status` |
| `sales` | `total`, `internalMargin` *(manager+)*, `marginWaivedTotal` *(manager+)* | (none) | `status` |
| `orders` | `total` | (none) | `status` |
| `intake` | `intakeQty`, `availableQty` | (none) | `status`, `mediaStatus` |
| `inventory` | `availableQty`, `reservedQty`, `inventoryValue` *(manager+)* | (none) | `category`, `status` |
| `payments` | `amount`, `unappliedAmount` | (none) | `direction`, `category`, `status` |
| `clients` | `balance`, `creditLimit`, `headroom`, `unpaidBalance` | `avgDaysToPay` | (none) |
| `vendors` | `balance` *(manager+)*, `outstandingBillsTotal` | (none) | (none) |
| `fulfillment` | (none) | (none) | `status` |
| `connectors` | (none) | (none) | `status` |
| `matchmaking` | (none) | `score` | `status` |
| `recovery` | (none) | (none) | `kind` |
| `closeout` | (none) | (none) | `severity` |
| `referees` | `balance`, `lifetimeEarned` | (none) | (none) |
| `processors` | `feeFixedAmount` | `feePercentage` | (none) |
| `photography` | (none) | (none) | `status` |
| `purchaseReceipts` | `total` *(manager+)* | (none) | `status` |
| `items` | (none) | (none) | `status`, `category` |
| `disputes` | `disputedAmount` | (none) | `status` |
| `reports` | (none) | (none) | `severity` |

Tables marked *(manager+)* are role-gated per §3.2.

### 3.4 — Filter application

`gridSummary` applies the **same** WHERE clause that `grid-v2` does for the same `entityType` and `filters`. This is structurally enforced by extracting the per-view predicate builder into a helper used by both:

```ts
// src/server/routers/queries.ts (new helper, illustrative)
function buildGridWhereClause(
  entityType: z.infer<typeof viewSchema>,
  filters: GridFilters | undefined
): { sqlFragment: string; params: unknown[] };
```

This helper is owned by `grid-v2.md` (§5 of that spec); `gridSummary` consumes it. If the two go out of sync the test in §8.4 fails immediately.

---

## §4 — Output Schema (Zod)

```ts
// src/shared/schemas.ts (added)

export const gridSummaryOutputSchema = z.object({
  entityType: viewSchema,
  totalRows: z.number().int().min(0),
  sumFields: z.record(z.number()).default({}),
  avgFields: z.record(z.number()).default({}),
  countBy: z.record(z.record(z.number().int().min(0))).default({})
});

export type GridSummaryOutput = z.infer<typeof gridSummaryOutputSchema>;
```

### 4.1 — Invariants

1. `output.entityType === input.entityType`.
2. For each `countBy.fieldName`, the sum of its values equals `totalRows` for any filter that does not restrict that field. (Test 8.3.)
3. When the actor is below `manager`, `sumFields` for the entries marked *(manager+)* in §3.3 are absent (not `null`, not `0` — absent).
4. `sumFields[field]` is always a number; `null`-typed columns from the DB are coalesced to `0`.

### 4.2 — Wire shape examples

```jsonc
// purchaseOrders, status filter = 'approved'
{
  "entityType": "purchaseOrders",
  "totalRows": 14,
  "sumFields": { "total": 84_350.00, "prepaidAmount": 30_000.00, "remainingPrepay": 4_500.00 },
  "avgFields": {},
  "countBy": { "status": { "approved": 14 } }
}
```

```jsonc
// sales, no filter, role=manager
{
  "entityType": "sales",
  "totalRows": 312,
  "sumFields": { "total": 1_204_500.00, "internalMargin": 235_000.00, "marginWaivedTotal": 4_200.00 },
  "avgFields": {},
  "countBy": { "status": { "draft": 12, "confirmed": 40, "posted": 240, "fulfilled": 18, "cancelled": 2 } }
}

// sales, no filter, role=operator
{
  "entityType": "sales",
  "totalRows": 312,
  "sumFields": { "total": 1_204_500.00 },
  "avgFields": {},
  "countBy": { "status": { "draft": 12, "confirmed": 40, "posted": 240, "fulfilled": 18, "cancelled": 2 } }
}
```

---

## §5 — Client Consumption (informative)

`useViewData` (T-B-17) issues `gridSummary` in parallel with `grid-v2` and the same `filters` payload. `GridSummaryStrip` (T-0 component) renders:

```ts
<Strip
  total={data.totalRows}
  metrics={[
    { label: 'Open', value: data.sumFields.total },
    ...optional(data.sumFields.internalMargin, { label: 'Margin', value: data.sumFields.internalMargin })
  ]}
  badges={Object.entries(data.countBy.status ?? {}).map(([s, n]) => ({ label: s, count: n }))}
/>
```

The strip never re-fetches on selection or row hover — it owns the *filtered set* totals, not the *selected* totals (that's `BulkActionBar`).

---

## §6 — Error Contract

| Code | When |
|---|---|
| `UNAUTHORIZED` | No session. |
| `FORBIDDEN` | Actor below the entity's min role (parity with `grid`). |
| `BAD_REQUEST` | `entityType` not in `viewSchema`; `filters.status` not in canonical enum; `filters.dateRange.field` not allowed for the entity; `filters.eq` references an unknown column for the entity. |
| `INTERNAL_SERVER_ERROR` | DB failure; scrubbed. |

Validation order: Zod parse → role check → per-entity filter narrowing → SQL. Same as `comboboxOptions` (§6.2).

---

## §7 — N+1 Avoidance Strategy

**One SQL statement per call.** Each `entityType` is implemented as a single `SELECT` returning one row of aggregates:

```sql
-- Illustrative: purchaseOrders
SELECT
  count(*)::int                                                         AS "totalRows",
  coalesce(sum(po.total), 0)::numeric                                    AS "total_sum",
  coalesce(sum(prepaid.amount), 0)::numeric                              AS "prepaidAmount_sum",
  coalesce(sum(greatest(0, po.prepayment_amount - prepaid.amount)), 0)::numeric AS "remainingPrepay_sum",
  jsonb_object_agg(po.status, status_count) FILTER (WHERE po.status IS NOT NULL)
                                                                         AS "countBy_status"
FROM (
  SELECT po.*, count(*) OVER (PARTITION BY po.status) AS status_count
  FROM purchase_orders po
  /* WHERE clause from buildGridWhereClause('purchaseOrders', filters) */
) po
LEFT JOIN LATERAL (
  SELECT coalesce(sum(vp.amount), 0) AS amount
  FROM vendor_payments vp
  WHERE vp.purchase_order_id = po.id AND vp.status = 'posted'
) prepaid ON true
```

Even when `countBy` is needed for multiple categorical fields (e.g., `inventory`: `status`, `category`), the implementation uses `jsonb_object_agg(...) FILTER (WHERE ...)` over `count(*) OVER (PARTITION BY ...)` windows in a single pass — never one statement per categorical field.

Test (§8.5): `pg_stat_statements.calls` increments by exactly 1 per call.

---

## §8 — Test Sketches

File: `src/server/routers/queries.gridSummary.test.ts`.

### 8.1 — Happy path: purchaseOrders totals match seeded data

```ts
it('returns totalRows, sumFields, and countBy.status matching seeded POs', async () => {
  await seedPurchaseOrders([
    { status: 'draft',    total: 1000, prepaymentAmount: 0 },
    { status: 'approved', total: 2000, prepaymentAmount: 500 },
    { status: 'approved', total: 3000, prepaymentAmount: 1000 }
  ]);

  const result = await caller.queries.gridSummary({ entityType: 'purchaseOrders' });

  expect(result.totalRows).toBe(3);
  expect(result.sumFields.total).toBe(6000);
  expect(result.sumFields.prepaidAmount).toBe(0); // no vendor_payments seeded
  expect(result.sumFields.remainingPrepay).toBe(1500);
  expect(result.countBy.status).toEqual({ draft: 1, approved: 2 });
});
```

### 8.2 — Filter parity: status filter narrows totals

```ts
it('applies filters.status the same way grid-v2 does', async () => {
  // Same seed as 8.1
  const grid = await caller.queries.grid({ entityType: 'purchaseOrders', filters: { status: 'approved' } });
  const sum  = await caller.queries.gridSummary({ entityType: 'purchaseOrders', filters: { status: 'approved' } });

  expect(sum.totalRows).toBe(grid.rows.length);
  expect(sum.sumFields.total).toBe(grid.rows.reduce((s, r) => s + Number(r.total), 0));
});
```

### 8.3 — Invariant: countBy sums to totalRows

```ts
it('countBy.status values sum to totalRows when filters do not restrict status', async () => {
  // Seed varied statuses
  const sum = await caller.queries.gridSummary({ entityType: 'sales' });
  const totalFromCountBy = Object.values(sum.countBy.status ?? {}).reduce((a, b) => a + b, 0);
  expect(totalFromCountBy).toBe(sum.totalRows);
});
```

### 8.4 — Role gate: viewer does not see internalMargin total

```ts
it('omits sumFields.internalMargin for viewer-tier actor on sales view', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  const managerCaller  = await callerFor({ role: 'manager' });

  const op  = await operatorCaller.queries.gridSummary({ entityType: 'sales' });
  const mgr = await managerCaller .queries.gridSummary({ entityType: 'sales' });

  expect(op.sumFields.internalMargin).toBeUndefined();
  expect(mgr.sumFields.internalMargin).toBeGreaterThanOrEqual(0);
  // Both see total — that one is not money-sensitive in TERP's model.
  expect(op.sumFields.total).toBe(mgr.sumFields.total);
});
```

### 8.5 — Single-query (N+1 guard)

```ts
it('executes exactly one SQL statement per call across every entityType', async () => {
  for (const entityType of viewSchema.options) {
    const sqlSpy = trackPgStatements();
    await caller.queries.gridSummary({ entityType });
    expect(sqlSpy.callsForCurrentTest).toBe(1);
  }
});
```

### 8.6 — Bad status string

```ts
it('rejects an inline status string not in the canonical enum', async () => {
  await expect(
    caller.queries.gridSummary({
      entityType: 'purchaseOrders',
      filters: { status: 'super-approved' }   // not in PurchaseOrderStatus
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|---|---|---|---|
| `src/shared/statuses.ts` (P0-1) | EXISTS | yes | Status narrowing per §3.1. |
| `src/shared/gridFilters.ts` (`gridFiltersSchema`) | NEEDS_BUILD (owned by `grid-v2.md`) | yes | Shared filter shape. |
| `buildGridWhereClause` helper (owned by `grid-v2.md` §5) | NEEDS_BUILD | yes | Single source of truth for grid + summary parity. |
| `viewSchema` (queries.ts:19) | EXISTS | yes | Used directly as the input enum. |
| `useViewData` parallel-fetch wiring (T-B-17) | NEEDS_BUILD | no for procedure itself | Client-side concern. |

---

## §10 — Risk Notes

- **Drift between `grid-v2` and `gridSummary` filter handling.** If a new entity adds a custom filter field to `grid-v2` without updating the summary registry, totals and rows disagree. Mitigation: both procedures share `buildGridWhereClause` (§3.4) and the test (§8.2) compares totals to the grid row sum for at least one fixture per entity.
- **`viewSchema` drift.** Adding a view to `viewSchema` without registering a summary shape returns `{ totalRows: …, sumFields: {}, avgFields: {}, countBy: {} }` — degraded but not broken. A CI guard (`pnpm lint:grid-summary-registry`) compares `viewSchema.options` to the registered set and fails the build when out of sync. Tracked under T-B-10.
- **Money totals for huge filtered sets.** Aggregating over 200k+ rows with a `WHERE … ILIKE '%...%'` predicate that loses index usage is slow. Mitigation: `grid-v2.md` §5 covers index-friendly filter compilation; `gridSummary` inherits.
- **`null` semantics.** `sum(null)` is `null` in Postgres; the procedure `coalesce(..., 0)` every sum so the contract field is always a number.
- **`countBy` cardinality.** Categorical fields with high cardinality (e.g., `category` on `intake` with hundreds of values) should NOT be in `countBy`. The §3.3 registry is curated to low-cardinality fields. Reviewer must reject any addition that exceeds ~20 distinct values.

---

## §11 — Acceptance Criteria

- [ ] AC-1: `queries.gridSummary` added to `src/server/routers/queries.ts` as `protectedProcedure` with `gridSummaryInputSchema`.
- [ ] AC-2: Schemas live in `src/shared/schemas.ts` per §3, §4 and import `viewSchema` + status enums from `src/shared/statuses.ts`.
- [ ] AC-3: All `viewSchema` entries have a registry entry per §3.3; the test in §8.5 covers each.
- [ ] AC-4: Role-gated `sumFields` are absent (not zero) for actors below the required role; matches `grid` parity (§3.2).
- [ ] AC-5: `filters` apply via the shared `buildGridWhereClause` helper; §8.2 passes for every entity with at least one fixture.
- [ ] AC-6: Each call executes exactly one SQL statement (§8.5 passes).
- [ ] AC-7: `countBy` sums to `totalRows` when filters do not restrict the categorical field (§8.3 passes).
- [ ] AC-8: `pnpm typecheck` clean. No new inline status literals in `queries.ts` (grep gate).
