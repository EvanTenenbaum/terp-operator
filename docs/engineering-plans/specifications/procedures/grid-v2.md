> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Spec: `queries.grid` (v2 — filter/sort/group/paginate)

**Type:** `procedure`
**Target file:** `src/server/routers/queries.ts` (extend existing `grid` procedure; no rename)
**Agent:** `build` (primary, requires schema discipline) with `qa-reviewer` review; escalate to `opus-build` if a backend reviewer flags a SQL-correctness concern during implementation.

Resolves: **CPO Audit F6** (`grid` accepts only `view`; filter/sort/group/pagination live entirely on the client). Feeds: **T-B-05**.

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3 (ARCH-3, ARCH-7, ARCH-8, ARCH-10).
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F6.
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) — every status filter goes through here.
- [src/server/routers/queries.ts](../../../../src/server/routers/queries.ts) lines 19 (`viewSchema`), 202–212 (existing `grid` procedure + role-based projection), 2854+ (`gridSql`).
- [docs/engineering-plans/specifications/procedures/gridSummary.md](./gridSummary.md) — shares `gridFiltersSchema` and `buildGridWhereClause` with this spec.

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-9 (filtering is fluid — filter, sort, group resolve in one round trip), UX-11 (URL is session memory — server accepts the same payload the URL encodes), UX-3 (one primary surface — pagination keeps the grid responsive on large entities). |
| **ARCH Rule(s) Followed** | ARCH-3 (one query per grid render), ARCH-7 (`protectedProcedure` + per-view role parity), ARCH-8 (per-entity SQL behind a single procedure name), ARCH-10 (no per-row N+1 — filter/sort/group compiled into one SQL statement). |
| **Attention Budget Tier** | Tier 0 — the grid IS the view. |
| **Old Pattern Replaced** | (a) Full unfiltered `gridSql` then client-side `.filter()` over the whole table. (b) Hand-rolled per-view procedures that hard-code one filter (e.g., `openInvoices` vs `paidInvoices`). (c) Pagination implemented in the React store by slicing the row array (memory leak + stale page on data churn). |
| **URL State Encoded** | None directly. The client serializes `filters`, `sort`, `groupBy`, `limit`, `offset` into URL params (ARCH-11: `qf`, `qs`, `qg`, `qp`); the server reads the same payload structure. |
| **Existing Infra Leveraged** | `protectedProcedure`, `pool.query`, `canRole`, `viewSchema`, `gridSql` (refactored into a builder that takes filters/sort/group/limit/offset). |
| **Anti-Patterns Avoided** | No raw-SQL string concatenation of user input — every filter compiles to parameterized SQL via the `buildGridWhereClause` helper. No status string drift — `filters.status` re-parsed against `src/shared/statuses.ts`. No silent column-name leakage — `sort.field` and `groupBy` are matched against the entity's allowlist (§3.4). No offset-without-order — `sort` is required when `offset > 0` so pagination is deterministic. |
| **Compliance Check** | (1) Network panel: opening a grid view fires exactly one `queries.grid` call. (2) Apply a status filter → second call with `filters.status = '<enum>'`; no client-side row filter. (3) `EXPLAIN ANALYZE` for each entity under representative filters: planner uses an index seek for `status` and `sort.field`, never `Seq Scan` over 10k+ rows. (4) Pass `filters.status = 'foo'` → `BAD_REQUEST`. (5) Pass `sort.field = 'does_not_exist'` → `BAD_REQUEST`. (6) Pass `offset = 100, limit = 50` with no `sort` → `BAD_REQUEST` (`sort required when offset > 0`). (7) Compare `queries.grid({ entityType, filters }).rows` to `queries.gridSummary({ entityType, filters }).totalRows` over an unpaginated request — must be equal. |

---

## §1 — Backwards Compatibility

This is **an extension of the existing `grid` procedure, not a replacement**. The procedure name stays `queries.grid`; old callsites that pass `{ view }` only continue to work because every new field is optional with a safe default:

- `filters` default: `undefined` → no `WHERE` predicate beyond the entity's `baseWhere`.
- `sort` default: the entity's default sort (matching the existing `ORDER BY` in `gridSql`).
- `groupBy` default: `undefined` → no grouping.
- `limit` default: `null` → no `LIMIT` clause (returns full set, matching today).
- `offset` default: `0`.
- `status` (legacy single-filter shortcut): `undefined`.

The `view` field is renamed in this spec to `entityType` for parity with `gridSummary` / `statusCounts`, but the existing input field `view` is **accepted as an alias** at the schema layer to avoid breaking the ~20+ existing callsites at migration time. The alias is removed in Phase 4 cleanup (T-4-N).

```ts
// Schema-level alias handling
export const gridInputSchemaRaw = z.object({
  entityType: viewSchema.optional(),
  view: viewSchema.optional(), // deprecated alias; removed in Phase 4
  filters: gridFiltersSchema.optional(),
  sort: gridSortSchema.optional(),
  groupBy: z.string().min(1).max(40).optional(),
  limit: z.number().int().min(1).max(1000).nullable().default(null),
  offset: z.number().int().min(0).default(0)
}).superRefine((input, ctx) => {
  if (!input.entityType && !input.view) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityType'], message: 'entityType is required.' });
  }
  if (input.offset > 0 && !input.sort) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sort'], message: 'sort is required when offset > 0 (deterministic pagination).' });
  }
});

export const gridInputSchema = gridInputSchemaRaw.transform((input) => ({
  ...input,
  entityType: (input.entityType ?? input.view)!
}));
```

---

## §2 — Caching

Not server-side cached. Client-side, `useViewData` keys the call under `['grid', entityType, filters, sort, groupBy, limit, offset]` with a 15-second staleTime and the same invalidation predicates `useCommandRunner` triggers.

---

## §3 — Input Schema (Zod)

```ts
// src/shared/gridFilters.ts (new file, shared with gridSummary)

import { z } from 'zod';

export const gridFiltersSchema = z.object({
  status: z.string().min(1).max(40).optional(),
  text: z.string().trim().max(120).optional(),
  eq: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  dateRange: z.object({
    field: z.string().min(1).max(40),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional()
}).strict();

export const gridSortSchema = z.object({
  field: z.string().min(1).max(40),
  direction: z.enum(['asc', 'desc']).default('asc')
});
```

### 3.1 — Per-entity status narrowing

Identical to `comboboxOptions` and `gridSummary`: after Zod, the procedure re-parses `filters.status` against the entity's canonical status enum via `statusSchemaFor(entityType)`. Mismatch → `BAD_REQUEST`. Helper is shared across the three procedures.

### 3.2 — Per-entity `filters.eq` allowlist

Generic equality is dangerous (`filters.eq.foo = 1; DROP TABLE …`) without an allowlist. Each entity registers the set of column keys `filters.eq` may reference:

| `entityType` | Allowed `eq` keys |
|---|---|
| `purchaseOrders` | `vendorId`, `status` |
| `sales` | `customerId`, `status`, `pricingStrategy` |
| `orders` | `customerId`, `status`, `invoiceStatus` |
| `intake` | `vendorId`, `purchaseOrderId`, `status`, `mediaStatus`, `arrivalStatus` |
| `inventory` | `vendorId`, `itemId`, `category`, `subcategory`, `status` |
| `payments` | `customerId`, `direction`, `category`, `method`, `status` |
| `clients` | `tags` (handled via tag op, not eq) |
| `vendors` | `tags` (handled via tag op, not eq) |
| `fulfillment` | `status` |
| `connectors` | `status` |
| `matchmaking` | `status` |
| `recovery` | `kind`, `severity` |
| `closeout` | `severity` |
| `referees` | `active` |
| `processors` | `processorType` |
| `photography` | `status`, `category` |
| `purchaseReceipts` | `vendorId`, `purchaseOrderId`, `status` |
| `items` | `category`, `status` |
| `disputes` | `status`, `customerId` |
| `reports` | (none — `eq` not allowed) |

A key not in the allowlist → `BAD_REQUEST` with the path `filters.eq.<key>`.

### 3.3 — Per-entity `dateRange.field` allowlist

Same protective principle as `eq`:

| `entityType` | Allowed `dateRange.field` |
|---|---|
| `purchaseOrders` | `createdAt`, `orderedAt`, `expectedDate`, `receivedAt`, `cancelledAt` |
| `sales` | `createdAt`, `deliveryWindow`, `postedAt`, `fulfilledAt` |
| `orders` | `createdAt`, `postedAt`, `fulfilledAt`, `deliveryWindow` |
| `intake` | `createdAt`, `intakeDate`, `expirationDate` |
| `inventory` | `createdAt`, `intakeDate`, `expirationDate` |
| `payments` | `createdAt` |
| `clients` | `createdAt` |
| `vendors` | `createdAt` |
| `fulfillment` | `createdAt` |
| `connectors` | `createdAt` |
| `matchmaking` | `createdAt`, `updatedAt` |
| `recovery` | `createdAt` |
| `closeout` | `createdAt` |
| `referees` | `createdAt` |
| `processors` | `createdAt` |
| `photography` | `createdAt` |
| `purchaseReceipts` | `createdAt`, `receiptDate` |
| `items` | `createdAt` |
| `disputes` | `createdAt` |
| `reports` | (none) |

A field not in the allowlist → `BAD_REQUEST`.

### 3.4 — Per-entity `sort.field` and `groupBy` allowlist

Each entity registers a sortable/groupable column set. The default sort per entity is the existing `ORDER BY` clause in `gridSql` (`queries.ts:2854+`); when `input.sort` is unset, the default is used.

The allowlist is one of:
- columns that appear in the grid's projection (so the user can sort by what they see),
- `createdAt` and `updatedAt` (always sortable),
- the entity's status column (always sortable).

A field outside the allowlist → `BAD_REQUEST`. `groupBy` is restricted to categorical columns (`status`, `category`, `direction`, `vendorId`, etc.) — never numeric columns.

---

## §4 — Output Schema (Zod)

The output extends the current `grid` shape (an array of rows) with optional aggregate and pagination metadata. Backwards-compatible callers that previously read `.rows` directly continue to work because the procedure returns an object that **is also** array-shaped for `pageSize: null` — see §4.1 for the structural decision.

```ts
// src/shared/schemas.ts (added)

export const gridRowSchema = z.record(z.unknown()); // per-entity columns; not narrowed here

export const gridOutputSchema = z.object({
  entityType: viewSchema,
  rows: z.array(gridRowSchema),
  // Total row count after filters but before pagination. Cheap because the
  // SQL uses `count(*) OVER ()` window in the same SELECT, not a second query.
  totalRows: z.number().int().min(0),
  // Aggregate row appended at the bottom of the grid. Optional, per-entity.
  // Same data the strip computes; this is for the in-grid "totals row" that
  // AG Grid renders when configured.
  aggregate: z.record(z.union([z.number(), z.string(), z.null()])).optional(),
  // Group buckets when groupBy is set. The client can render this as a
  // collapsible grid; rows[] is still the flat row list, ordered by group.
  groups: z.array(z.object({
    key: z.union([z.string(), z.number(), z.null()]),
    count: z.number().int().min(0),
    aggregate: z.record(z.number()).optional()
  })).optional()
});

export type GridOutput = z.infer<typeof gridOutputSchema>;
```

### 4.1 — Why an object, not a bare array

The existing `grid` procedure returns a bare `Row[]`. Switching to `{ rows, totalRows, ... }` is a breaking change for the ~20 callsites that do `const rows = await trpc.queries.grid.useQuery({ view })`. Two acceptable options:

- **Option A (chosen):** Return `{ rows, totalRows, ... }`. Add a one-shot client codemod under T-4-N to update every callsite from `const rows = data` to `const rows = data.rows`. The grid filter/sort/group/paginate work doesn't ship until callsites are migrated.
- **Option B (rejected):** Keep returning `Row[]` and put `totalRows` in an out-of-band header. This couples the procedure to HTTP transport semantics tRPC doesn't model and breaks subscriptions.

Phase 0 codemod owner: T-B-05 (this spec's task) ships the schema change; T-4-N migrates callsites.

### 4.2 — Invariants

1. `output.entityType === input.entityType` (post-alias resolution).
2. `output.rows.length <= input.limit` when `limit` is set.
3. `output.totalRows` is the count of rows matching `filters` *ignoring* `limit`/`offset`.
4. `output.totalRows === queries.gridSummary({ entityType, filters }).totalRows` for the same `entityType`/`filters` — this is the load-bearing parity check (§7).
5. When `groupBy` is set, `output.groups` is present and `sum(groups[].count) === output.totalRows`.

---

## §5 — Filter Compilation (`buildGridWhereClause`)

This is the single source of truth for `filters` → SQL, shared with `gridSummary`. It lives in `src/server/routers/queries.ts` (or a thin sibling file `src/server/routers/gridWhere.ts`) next to `gridSql`.

```ts
// src/server/routers/gridWhere.ts (illustrative)
export function buildGridWhereClause(
  entityType: z.infer<typeof viewSchema>,
  filters: GridFilters | undefined
): { sqlFragment: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  // baseWhere from registry — e.g., `archived_at IS NULL` for inventory/intake.
  parts.push(BASE_WHERE[entityType]);

  if (filters?.status) {
    parts.push(`status = $${p++}`);
    params.push(filters.status);
  }
  if (filters?.text) {
    const cols = TEXT_SEARCH_COLS[entityType]; // per-entity registry
    if (cols.length) {
      const ors = cols.map(() => `${cols.shift()} ILIKE $${p++}`).join(' OR ');
      parts.push(`(${ors})`);
      const pat = '%' + escapeLike(filters.text) + '%';
      cols.forEach(() => params.push(pat));
    }
  }
  if (filters?.dateRange) {
    const f = filters.dateRange.field;
    if (filters.dateRange.from) { parts.push(`${f} >= $${p++}`); params.push(filters.dateRange.from); }
    if (filters.dateRange.to)   { parts.push(`${f} <= $${p++}`); params.push(filters.dateRange.to); }
  }
  if (filters?.eq) {
    for (const [k, v] of Object.entries(filters.eq)) {
      parts.push(`${k} ${v === null ? 'IS' : '='} $${p++}`);
      params.push(v);
    }
  }
  if (filters?.tags) {
    parts.push(`tags && $${p++}`);
    params.push(filters.tags);
  }

  return { sqlFragment: parts.filter(Boolean).join(' AND '), params };
}
```

The allowlists from §3.2–3.4 are enforced by the procedure **before** this helper runs, so the helper can trust its inputs.

---

## §6 — Role gate parity with v1

The existing `grid` procedure post-projects `internalMargin`, `marginWaivedTotal`, and `unitCost` to `null` for non-managers. The new procedure preserves that logic verbatim. Filter/sort/group on those fields **is** permitted for non-managers (so a manager who shared a URL doesn't strand a viewer on an unloadable page), but the response columns are blanked. This is the same posture as v1; no new role policy.

---

## §7 — N+1 Avoidance Strategy

**One SQL statement per call.** Pagination metadata uses a window function in the same SELECT:

```sql
SELECT
  <projection>,
  count(*) OVER () AS "__totalRows"
FROM <table>
<JOINs>
WHERE <buildGridWhereClause>
ORDER BY <sort>
LIMIT <limit>
OFFSET <offset>
```

`__totalRows` is identical on every row and is read once by the TS wrapper, then stripped from the rows.

`groupBy`, when set, uses a second `SELECT` that's merged into the *same* statement via `WITH groups AS (...)` CTE in front of the main `SELECT`. Net: one statement (one parse + plan), two SELECTs in the plan tree, no extra round trip.

Test (§8.5): `pg_stat_statements.calls` increments by exactly 1.

---

## §8 — Test Sketches

File: `src/server/routers/queries.grid.v2.test.ts`.

### 8.1 — Backwards compat: legacy callsite still works

```ts
it('honors the deprecated `view` alias with no new fields', async () => {
  await seedPurchaseOrders([{ status: 'draft' }, { status: 'approved' }]);
  const result = await caller.queries.grid({ view: 'purchaseOrders' });
  expect(result.rows).toHaveLength(2);
  expect(result.totalRows).toBe(2);
});
```

### 8.2 — Status filter narrows rows and totals together

```ts
it('applies filters.status server-side', async () => {
  await seedPurchaseOrders([
    { status: 'draft' }, { status: 'approved' }, { status: 'approved' }
  ]);
  const result = await caller.queries.grid({
    entityType: 'purchaseOrders',
    filters: { status: 'approved' }
  });
  expect(result.rows).toHaveLength(2);
  expect(result.totalRows).toBe(2);
});
```

### 8.3 — Pagination requires sort

```ts
it('rejects offset > 0 without sort', async () => {
  await expect(
    caller.queries.grid({ entityType: 'purchaseOrders', offset: 50, limit: 25 })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

### 8.4 — Bad sort field rejected

```ts
it('rejects sort.field not in entity allowlist', async () => {
  await expect(
    caller.queries.grid({ entityType: 'purchaseOrders', sort: { field: 'leaked_column', direction: 'asc' } })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

### 8.5 — Single-query (N+1 guard)

```ts
it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.grid({
    entityType: 'sales',
    filters: { status: 'confirmed' },
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 50, offset: 100,
    groupBy: 'status'
  });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

### 8.6 — gridSummary parity

```ts
it('totalRows matches gridSummary.totalRows for the same filters', async () => {
  const filters = { status: 'approved' as const };
  const g = await caller.queries.grid({ entityType: 'purchaseOrders', filters });
  const s = await caller.queries.gridSummary({ entityType: 'purchaseOrders', filters });
  expect(g.totalRows).toBe(s.totalRows);
});
```

### 8.7 — Role projection preserved

```ts
it('blanks internalMargin for operator on sales view (v1 parity)', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  const result = await operatorCaller.queries.grid({ entityType: 'sales' });
  expect(result.rows.every((r) => r.internalMargin === null)).toBe(true);
});
```

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|---|---|---|---|
| `src/shared/statuses.ts` (P0-1) | EXISTS | yes | Per-entity status narrowing. |
| `src/shared/gridFilters.ts` (`gridFiltersSchema`, `gridSortSchema`) | NEEDS_BUILD (this PR) | yes | Shared shape with `gridSummary`. |
| `buildGridWhereClause` helper | NEEDS_BUILD (this PR) | yes | Single source of truth for filter→SQL. |
| Refactor of `gridSql` from string-returning to builder-returning | NEEDS_BUILD (this PR) | yes | Mechanical refactor; per-entity SQL stays equivalent for the default case. |
| Index audit (P0-7) | NEEDS_VERIFY | no for first ship | Performance only. |
| Callsite codemod for `{ view }` → `data.rows` | NEEDS_BUILD (Phase 4) | no for procedure | Migration only. |

---

## §10 — Risk Notes

- **Pagination + group order interaction.** When `groupBy` is set, `LIMIT/OFFSET` applies *after* group ordering. The grouped result must be ordered by `groupBy ASC, sort.field <dir>` so pagination is deterministic. Reviewer must verify the test case where `offset` straddles a group boundary returns the expected tail.
- **`baseWhere` drift.** Each entity's existing `gridSql` already encodes implicit `baseWhere` (e.g., `archived_at IS NULL`). The refactor must preserve those without exception; the §8 test suite uses fixtures that include archived rows and asserts they remain excluded.
- **`count(*) OVER ()` cost.** Window-function totals are computed even when `limit=null`. For very large tables this is acceptable (one extra pass), but if a future entity exceeds ~500k rows the procedure should switch to an explicit `WITH totals AS (SELECT count(*) ...)` CTE. Tracked as Phase 4 perf work.
- **Schema breakage.** Output shape changes from `Row[]` to `{ rows, totalRows, ... }`. The codemod is the load-bearing migration; the PR that merges this MUST also update every consumer or live behind a feature flag until the codemod lands.
- **Filter compilation injection.** Every column name interpolated into SQL comes from the §3.2–3.4 allowlists, not from input. Values are parameterized via `$1, $2, ...`. Reviewer must grep the helper for any `${...}` interpolation of a non-allowlisted identifier — must be zero.

---

## §11 — Acceptance Criteria

- [ ] AC-1: `queries.grid` accepts `entityType` (preferred) and `view` (deprecated alias); the rest of the input schema matches §3.
- [ ] AC-2: `gridFiltersSchema` and `gridSortSchema` live in `src/shared/gridFilters.ts` and are imported by both `grid` and `gridSummary`.
- [ ] AC-3: `buildGridWhereClause` is the only place filter values reach SQL; grep `WHERE.*\\$[0-9]` shows it as the sole composer.
- [ ] AC-4: Per-entity allowlists (§3.2, §3.3, §3.4) are enforced before SQL; unknown keys/fields → `BAD_REQUEST`.
- [ ] AC-5: `offset > 0` without `sort` → `BAD_REQUEST` (deterministic pagination invariant).
- [ ] AC-6: Output is `{ entityType, rows, totalRows, aggregate?, groups? }`; `totalRows` is computed via `count(*) OVER ()` in the same statement.
- [ ] AC-7: Role projection (`internalMargin`, `marginWaivedTotal`, `unitCost`) matches v1 exactly (§6).
- [ ] AC-8: Each call executes exactly one SQL statement (§8.5).
- [ ] AC-9: Parity test §8.6 passes for at least one fixture per entity.
- [ ] AC-10: Test sketches §8 implemented and pass.
- [ ] AC-11: `pnpm typecheck` clean. No new inline status string literals in `queries.ts`.
