> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Spec: `queries.comboboxOptions`

**Type:** `procedure`
**Target file:** `src/server/routers/queries.ts` (new procedure)
**Agent:** `build` (primary) with `qa-reviewer` review.

Resolves: **CPO Audit F3** (no typeahead-capable option endpoint). Feeds: **P0-2** (T-B-02 backend dep for ComboboxCellEditor / FilterToolbar / VendorSearch / CustomerSearch).

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3 (ARCH-3 one data source per view, ARCH-7 role gating, ARCH-8 per-entity queries, ARCH-10 N+1 avoidance), §6.2 (backend anti-patterns).
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F3 (the missing typeahead endpoint).
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) — status enums imported when status filtering is needed on an option entity (e.g., `ItemStatus`, `CustomerNeedStatus`).
- [src/server/routers/queries.ts](../../../../src/server/routers/queries.ts) lines 192–212 (`grid` + `reference` pattern this spec follows).
- [src/server/rbac.ts](../../../../src/server/rbac.ts) `assertRole`, `canRole`.
- [src/shared/schemas.ts](../../../../src/shared/schemas.ts) (where the input/output Zod schemas added in §3–4 live).

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-10 (cell-level interactions save immediately — combobox needs to surface candidates fast), UX-2 (supporting info one click away — filter and editor dropdowns expose neighbor entities without a navigation), UX-12 (empty states give the operator a next step — `noResultsHint` per entity). |
| **ARCH Rule(s) Followed** | ARCH-3 (one data source per call — single SQL, no N+1), ARCH-7 (protectedProcedure + `operator` floor; entity-specific gates layered above when reading sensitive entities), ARCH-8 (entity-aware single endpoint instead of a per-call grab-bag), ARCH-10 (single DB trip per call, server-side `ILIKE` + `LIMIT`, indexed columns). |
| **Attention Budget Tier** | Tier 1 (1-hop) — the combobox dropdown is what the operator opens to choose a neighbor entity; never always-visible. |
| **Old Pattern Replaced** | The 16-table grab-bag `queries.reference` (`queries.ts:193–201`) used as the option source for every dropdown. `reference` stays for low-cardinality lookup tables (transactionTypes, tags, processors), but every typeahead/autocomplete cell editor or filter now reads `comboboxOptions` instead of shipping the entire `customers` / `batches` / `items` blob to the client. |
| **URL State Encoded** | None. The combobox call is transient; the chosen value persists via `useCommandRunner` mutation. |
| **Existing Infra Leveraged** | `protectedProcedure`, `pool.query`, `canRole`/`assertRole`, the existing `reference` TTL pattern (a follow-up may cache low-volatility entity slices), the entity registry implied by `entityType`. |
| **Anti-Patterns Avoided** | No N+1: a `tags` filter does NOT join per-row — it uses a single `WHERE tags && $tags` array overlap. No client-side full-blob shipping: the procedure caps `limit` at 50 (default 20). No status string drift: `filters.status` validates against `src/shared/statuses.ts` per `entityType`. No raw-SQL injection: every input is parameterized. No leaking of sensitive fields: when the calling role is `viewer`, the procedure refuses entity types whose grid forbids `viewer` (matching `queries.grid` parity). |
| **Compliance Check** | (1) Open the network panel while typing in a customer-cell combobox: exactly one `queries.comboboxOptions` call per ≥150ms debounce window, never an unbounded `reference` blob. (2) Grep new server code for inline status literals — must be zero; every status in `filters.status` references `src/shared/statuses.ts`. (3) `EXPLAIN ANALYZE` for each supported `entityType` shows an index seek on the `search` columns (per §3.2 index notes) and a `Limit` node — never a `Seq Scan` on the full table. (4) Call with `entityType: 'unknown'` → rejects with `BAD_REQUEST` before hitting the DB. (5) Call as `viewer` against an `operator`-floored entity (e.g., `vendorBill`) → `FORBIDDEN`. |

---

## §1 — Semantic Decision

### 1.1 — Why one endpoint, not one-per-entity

Phase 0 introduces `ComboboxCellEditor` (T-0-01..03), `FilterToolbar` (T-0-07), `VendorSearch`, `CustomerSearch`, and the bulk-route input on `BulkActionBar` (T-0-09). Each of those needs the same shape — a small `{ id, label, sublabel? }[]` filtered by a substring — for a *different* entity. Standing up 10 nearly-identical procedures is ARCH-3/ARCH-8 violation (a callsite that picks a procedure name based on a literal switches on entity type at compile-time, defeating the schema-driven view registry).

The procedure switches on `entityType` internally using a closed set of supported entity types. Adding a new combobox-eligible entity is a one-line registry update (§1.3), not a new procedure file.

### 1.2 — Why server-side search, not client-side

`customers` has thousands of rows; `batches` regularly exceeds 10k. Shipping the whole table to the client every keystroke (today's behavior via `reference`) is unacceptable for both bytes-on-the-wire and render time. The procedure executes a server-side `ILIKE`-on-indexed-columns search and returns at most `limit` rows.

Server-side search also lets us encode entity-specific filters (e.g., only return `posted` batches with `availableQty > 0` when used inside an order-line combobox) that the client cannot reconstruct without re-implementing the relevant business rules.

### 1.3 — Supported entity types

The procedure supports the following entity types at Phase 0. Each entity has a fixed list of "label", "sublabel", and "search" columns and a fixed set of allowed `filters` keys. Adding an entry to this table is the only place a new entity is wired up:

| `entityType` | Label column | Sublabel column | Searchable columns | Allowed filters | Min role | Notes |
|---|---|---|---|---|---|---|
| `customer` | `name` | `null` | `name`, `id::text` | `tags` | `operator` | Excludes `name ILIKE 'reaper-test-%'` (mirrors `_fetchReferenceData`). |
| `vendor` | `name` | `null` | `name`, `id::text` | `tags` | `operator` | |
| `staff` | `name` | `role` | `name`, `email` | `roles[]` | `operator` | Source: `users` where `active`. |
| `item` | `name` | `alias` (when distinct) | `name`, `alias`, `sku` | `status: ItemStatus`, `category` | `operator` | Status: `'active'` default. |
| `batch` | `coalesce(items.alias, batches.name)` | `batch_code` + ` · ` + `vendor.name` | `batch_code`, `name`, `lot_code`, `shorthand`, `source_code` | `status: BatchStatus`, `availableQty: 'positive'` | `operator` | When `availableQty: 'positive'` is set, restricts to `available_qty > 0`. |
| `tag` | `label` | `slug` | `label`, `slug` | (none) | `operator` | Source: `tag_catalog` where `is_active`. |
| `transactionType` | `label` | `direction` | `label`, `slug` | `direction: 'receiving'|'paying'` | `operator` | Source: `transaction_types` where `is_active`. |
| `purchaseOrder` | `po_no` | `vendor.name` + ` · ` + `status` | `po_no`, `vendor.name` | `status: PurchaseOrderStatus` | `operator` | |
| `salesOrder` | `order_no` | `customer.name` + ` · ` + `status` | `order_no`, `customer.name` | `status: SalesOrderStatus` | `operator` | |
| `invoice` | `invoice_no` | `customer.name` + ` · ` + `status` + ` · ` + open balance | `invoice_no`, `customer.name` | `status: InvoiceStatus` | `operator` | |
| `vendorBill` | `bill_no` | `vendor.name` + ` · ` + `status` | `bill_no`, `vendor.name` | `status: VendorBillStatus` | `operator` | |

Any `entityType` not in this table is rejected with `BAD_REQUEST` (see §6.2).

### 1.4 — Search semantics

`search` is the typed substring from the user. The procedure builds `WHERE (search_col_1 ILIKE $pat OR search_col_2 ILIKE $pat OR ...)` with `pat = '%' + escape(search) + '%'`. `search` is trimmed; an empty `search` returns the first `limit` rows ordered by the entity's default sort (see §3.3). `escape` percent-escapes `%` and `_` so they cannot widen the search.

Two-character minimum is enforced **only** when `entityType.searchable.length === 1` (small set, prevents full scan); other entities accept any length including 0.

---

## §2 — Caching

This procedure is **not** TTL-cached on the server. The reasoning:

- Typeahead is interactive — staleness is felt immediately by the operator.
- Each call already costs at most one indexed `ILIKE … LIMIT N` query, well under the 60s TTL budget that `reference` uses for its 16-blob payload.
- The view registry encodes which entity types are stable enough for client-side React Query staleness; `useViewData` (T-B-17) defaults a 30-second staleTime per query key for `comboboxOptions` — enough to dedupe paint flicker, short enough to feel live.

The client cache key is structurally `['comboboxOptions', entityType, search, JSON.stringify(filters ?? {}), limit ?? 20]`. See §5 for the consumer contract.

---

## §3 — Input Schema (Zod)

Added to `src/shared/schemas.ts` (mirrors `viewSchema`/`commandInputSchema` placement):

```ts
// src/shared/schemas.ts (added)

import {
  ItemStatus,
  BatchStatus,
  PurchaseOrderStatus,
  SalesOrderStatus,
  InvoiceStatus,
  VendorBillStatus
} from './statuses';

export const comboboxEntityTypeSchema = z.enum([
  'customer',
  'vendor',
  'staff',
  'item',
  'batch',
  'tag',
  'transactionType',
  'purchaseOrder',
  'salesOrder',
  'invoice',
  'vendorBill'
]);
export type ComboboxEntityType = z.infer<typeof comboboxEntityTypeSchema>;

// Per-entity filter shape. The union is closed; the procedure dispatches on
// `entityType` and refuses any filter not in the entity's allowed set.
export const comboboxFiltersSchema = z
  .object({
    tags: z.array(z.string().min(1).max(64)).max(20).optional(),
    roles: z.array(z.enum(['owner', 'manager', 'operator', 'viewer'])).max(4).optional(),
    direction: z.enum(['receiving', 'paying']).optional(),
    category: z.string().min(1).max(64).optional(),
    // availableQty filter is a tri-state predicate, not a numeric range.
    availableQty: z.enum(['positive']).optional(),
    // Status filter is left as a permissive string at the schema layer; the
    // procedure narrows it per entity by re-parsing against the canonical
    // enum imported above (see §3.1).
    status: z.string().min(1).max(40).optional()
  })
  .strict()
  .optional();

export const comboboxOptionsInputSchema = z.object({
  entityType: comboboxEntityTypeSchema,
  // Trimmed substring; empty string is allowed and means "first N rows".
  search: z.string().trim().max(120).default(''),
  limit: z.number().int().min(1).max(50).default(20),
  filters: comboboxFiltersSchema
});

export type ComboboxOptionsInput = z.infer<typeof comboboxOptionsInputSchema>;
```

### 3.1 — Per-entity status narrowing

After Zod parses the envelope, the procedure narrows `filters.status` against the canonical enum for the resolved `entityType` and rejects mismatches:

```ts
// src/server/routers/queries.ts (illustration)
const statusSchemaForEntity: Partial<Record<ComboboxEntityType, z.ZodTypeAny>> = {
  item: ItemStatus,
  batch: BatchStatus,
  purchaseOrder: PurchaseOrderStatus,
  salesOrder: SalesOrderStatus,
  invoice: InvoiceStatus,
  vendorBill: VendorBillStatus
};

if (filters?.status) {
  const schema = statusSchemaForEntity[entityType];
  if (!schema) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Status filter not supported for entityType '${entityType}'.` });
  }
  filters.status = schema.parse(filters.status);
}
```

This is the load-bearing reason every status value flows through `src/shared/statuses.ts` (P0-1) — the procedure cannot accept ad-hoc strings.

### 3.2 — Index requirements

The procedure assumes the following indexes exist (P0-7 audit owns confirming none are missing):

| Table | Index | Purpose |
|---|---|---|
| `customers (name)` | btree, exists | `ILIKE 'foo%'` planner choice when search anchors. |
| `vendors (name)` | btree, exists | same as above. |
| `users (name) WHERE active` | partial btree, **may need add** | staff combobox search. |
| `items (name)`, `items (alias)`, `items (sku)` | btree, exist (sku unique) | item combobox search. |
| `batches (batch_code)`, `batches (lot_code)`, `batches (shorthand)`, `batches (source_code)` | btree, **verify** | batch combobox typically searches `batch_code` and `lot_code` heavily. |
| `tag_catalog (slug)`, `tag_catalog (label)` | btree, exists | tag combobox. |
| `transaction_types (slug)`, `transaction_types (label)` | btree, exists | tx-type combobox. |
| `purchase_orders (po_no)`, `sales_orders (order_no)`, `invoices (invoice_no)`, `vendor_bills (bill_no)` | btree, exist (likely unique) | document-number combobox. |

If P0-7 finds any of the "verify" rows missing, it adds them. This spec does NOT own the migrations.

### 3.3 — Default ordering

When `search === ''`, ordering per entity:

| Entity | Default order | Rationale |
|---|---|---|
| `customer` | `balance desc, name asc` | Operators usually search highest-AR customers first. |
| `vendor` | `name asc` | |
| `staff` | `role asc, name asc` | |
| `item` | `name asc` | |
| `batch` | `created_at desc` | Newest intake first. |
| `tag` | `label asc` | |
| `transactionType` | `is_system desc, direction, label` | Mirrors `reference` ordering. |
| `purchaseOrder` | `created_at desc` | |
| `salesOrder` | `created_at desc` | |
| `invoice` | `created_at desc` | |
| `vendorBill` | `created_at desc` | |

When `search` is non-empty, ordering is `priority asc, default order` where `priority` is `0` for rows whose primary label column matches `search ILIKE 'pat%'` (anchored), `1` for substring-match anywhere, so anchored hits float to the top.

---

## §4 — Output Schema (Zod)

```ts
// src/shared/schemas.ts (added)

export const comboboxOptionSchema = z.object({
  id: z.string(),                      // The chosen value the editor commits.
  label: z.string(),                   // Primary user-facing text.
  sublabel: z.string().optional(),     // Secondary text rendered smaller.
  // Surface entity-specific facts the editor can show as right-aligned chips
  // without needing a second fetch. Each field below is OPTIONAL and only
  // populated when relevant for the entityType.
  status: z.string().optional(),       // Already narrowed per src/shared/statuses.ts.
  availableQty: z.number().optional(), // Batch-only.
  balance: z.number().optional(),      // Customer-only.
  // Lets the client render a "disabled" reason in the dropdown without a
  // second roundtrip (e.g., a batch with zero available qty when the editor
  // is in "any" mode rather than "positive" mode).
  disabledReason: z.string().optional()
});

export const comboboxOptionsOutputSchema = z.object({
  entityType: comboboxEntityTypeSchema,
  options: z.array(comboboxOptionSchema),
  // Hint a UI can show in the empty-state of the dropdown. Generated server-
  // side so a backend that knows about a status filter can say "No matching
  // active items — clear status filter?" without the client re-encoding
  // every filter into a string.
  noResultsHint: z.string().optional(),
  // `true` when the result was capped at `limit`. The UI can show
  // "Showing first N — refine your search." Cheap on the server: we already
  // know `rows.length === limit`.
  truncated: z.boolean()
});

export type ComboboxOptionsOutput = z.infer<typeof comboboxOptionsOutputSchema>;
```

### 4.1 — Invariants

1. `output.entityType === input.entityType`.
2. `output.options.length <= input.limit`.
3. Each `option.id` is unique within `output.options`.
4. When `filters.status` is set, every `option.status` (if present) equals the requested filter value.
5. `truncated === (options.length === limit && more rows exist server-side)`. Implementation: SQL fetches `limit + 1`; if the extra row exists, drop it and set `truncated = true`.

---

## §5 — Client Consumption (informative)

Three callsites are wired in Phase 0:

1. `ComboboxCellEditor` (T-0-01..03): on focus and on each ≥150ms debounce, calls `trpc.queries.comboboxOptions.useQuery({ entityType, search: typed, filters: editorFilters, limit: 20 })`. Reads `options[].id` as the commit value.
2. `FilterToolbar` (T-0-07): the filter chip popover uses `comboboxOptions` for any chip whose `valueKind === 'entityRef'`. Same hook, no special handling.
3. `BulkActionBar` (T-0-09): the "Route to …" bespoke input uses `entityType: 'staff'` with `filters.roles: ['operator', 'manager']`.

The procedure is never called from `useViewData` (those callsites read the entity grid, not a side-list).

---

## §6 — Error Contract

### 6.1 — tRPC error codes

| Code | When | Surface |
|---|---|---|
| `UNAUTHORIZED` | No active session. | tRPC envelope. |
| `FORBIDDEN` | Actor role below the entity's min role per §1.3 table. | tRPC envelope. |
| `BAD_REQUEST` | `entityType` not in §1.3 set; or `filters` contains a key not allowed for the entity; or `filters.status` is not a valid value for the entity's canonical status enum; or `search.length > 120`. | tRPC envelope. |
| `INTERNAL_SERVER_ERROR` | DB connection failure or planner error. | tRPC envelope with `scrubDatabaseError`. |

### 6.2 — Validation ordering

1. Zod parse `comboboxOptionsInputSchema` (envelope).
2. Role check (`assertRole(ctx.user.role, minRoleFor(entityType))`).
3. Filter narrowing per §3.1.
4. SQL execution.

Order matters: a `viewer` calling with `entityType: 'vendorBill'` should see `FORBIDDEN` even if their `filters` are malformed, because returning `BAD_REQUEST` first would leak which entities exist behind the role gate. Both `assertRole` and the status narrowing throw before any SQL touches the DB.

---

## §7 — N+1 Avoidance Strategy

This procedure executes **exactly one** SQL statement per call. Specifically:

- No per-row subqueries (the `customer` entity does NOT join open invoices, despite that being useful in some other contexts — the combobox is a small-N picker).
- The `vendor.name` / `customer.name` sublabels for `purchaseOrder` / `salesOrder` / `invoice` / `vendorBill` are joined with a single `LEFT JOIN`, not a per-row scalar subquery.
- The `batch` entity joins `items` (for `alias`) and `vendors` (for sublabel) once, not per row.
- `tags`-array filtering uses Postgres array-overlap `&&` (single index op), not `unnest` + per-tag join.

Test: enable `pg_stat_statements`, run one call per supported `entityType`, assert that each call increases `pg_stat_statements.calls` by exactly 1.

---

## §8 — Test Sketches

File: `src/server/routers/queries.comboboxOptions.test.ts`. Uses the existing in-process DB harness (`src/test/db.ts` pattern).

### 8.1 — Happy path: customer search

```ts
it('returns customers matching the substring with sublabel set to null', async () => {
  await seedCustomers([
    { name: 'Acme Botanicals', balance: 5_000 },
    { name: 'Acme Holdings',   balance: 12_000 },
    { name: 'Wildflower Co.',  balance: 200 }
  ]);

  const result = await caller.queries.comboboxOptions({
    entityType: 'customer',
    search: 'acme',
    limit: 10
  });

  expect(result.entityType).toBe('customer');
  expect(result.options.map((o) => o.label)).toEqual(['Acme Holdings', 'Acme Botanicals']);
  expect(result.options.every((o) => o.sublabel === undefined)).toBe(true);
  expect(result.options[0].balance).toBe(12_000); // sublabel data attached as side field
  expect(result.truncated).toBe(false);
});
```

### 8.2 — Role failure: viewer requesting vendorBill combobox

```ts
it('rejects a viewer requesting vendorBill options with FORBIDDEN', async () => {
  const viewerCaller = await callerFor({ role: 'viewer' });

  await expect(
    viewerCaller.queries.comboboxOptions({ entityType: 'vendorBill', search: '' })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

### 8.3 — Status narrowing: bad status string for batch

```ts
it('rejects an inline batch status that is not in BatchStatus', async () => {
  await expect(
    caller.queries.comboboxOptions({
      entityType: 'batch',
      search: '',
      filters: { status: 'archived' }   // not in BatchStatus enum
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

### 8.4 — Truncation: results capped at limit

```ts
it('reports truncated=true when more rows exist than limit', async () => {
  await seedCustomers(Array.from({ length: 25 }, (_, i) => ({ name: `Cust ${i}` })));

  const result = await caller.queries.comboboxOptions({
    entityType: 'customer',
    search: 'Cust',
    limit: 10
  });

  expect(result.options).toHaveLength(10);
  expect(result.truncated).toBe(true);
});
```

### 8.5 — Single-query (N+1 guard)

```ts
it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.comboboxOptions({ entityType: 'batch', search: 'lot' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|---|---|---|---|
| `src/shared/statuses.ts` (P0-1) | EXISTS | yes | Used by §3.1 for per-entity status narrowing. |
| `src/shared/schemas.ts` additions (§3, §4) | NEEDS_BUILD (this PR) | yes | Schemas live next to other Zod schemas. |
| Index audit for batches/users (§3.2) | NEEDS_VERIFY (P0-7) | no for first ship | If missing, P0-7 adds. Performance only, not correctness. |
| `useViewData` cache-key contract (§5) | NEEDS_BUILD (T-B-17) | no | Client-side staleness wiring. |

---

## §10 — Risk Notes

- **Sublabel growth.** Adding entity types whose sublabel needs more than one join (e.g., `invoice` showing balance) tempts inlining a per-row scalar subquery. Don't. If the sublabel needs more than one join, denormalize at the SQL planner level (a `LEFT JOIN ... ON true` lateral with a pre-aggregated CTE) or extend the entity registry with an explicit join clause.
- **Status drift.** When a new status is added to an enum in `src/shared/statuses.ts`, callsites that hard-coded the old set in their UI defaults need updating. The procedure itself stays correct (it re-parses against the live enum), but callers may pass a filter value the UI no longer offers. Tracked under T-B-10 (canonical status sync test).
- **`reference` deprecation.** Removing `customer`/`vendor`/`item`/`batch`/`tag` from `reference` once `comboboxOptions` ships is desirable but not in scope here — too many consumers still rely on the blob. A follow-up under Phase 4 cleanup audits and migrates.
- **Tag-only filter w/o tags column.** Only `customers`, `vendors`, `items`, `batches` carry a `tags` column. The procedure rejects `filters.tags` for any other entity via the §3 strict shape and `BAD_REQUEST` per §6.1.
- **Tenancy/scoping.** TERP Operator is single-tenant today. If multi-tenant scoping ships (post-Mercury), this procedure needs a tenant filter added uniformly per entity. Flag noted in Phase 4.

---

## §11 — Acceptance Criteria

- [ ] AC-1: `queries.comboboxOptions` procedure added to `src/server/routers/queries.ts` as `protectedProcedure` with `comboboxOptionsInputSchema`.
- [ ] AC-2: `comboboxOptionsInputSchema`, `comboboxFiltersSchema`, `comboboxEntityTypeSchema`, `comboboxOptionSchema`, `comboboxOptionsOutputSchema` live in `src/shared/schemas.ts` and import status enums from `src/shared/statuses.ts`.
- [ ] AC-3: All 11 entity types in §1.3 are implemented; an unrecognized `entityType` is rejected with `BAD_REQUEST` before any SQL runs.
- [ ] AC-4: Per-entity min role table (§1.3) is honored; `viewer` requesting a forbidden entity gets `FORBIDDEN`.
- [ ] AC-5: `filters.status` is re-parsed against the canonical per-entity status enum; an out-of-set value is rejected with `BAD_REQUEST`.
- [ ] AC-6: Each call executes exactly one SQL statement (§7 test passes).
- [ ] AC-7: `truncated` is `true` iff a 21st row (when `limit=20`) would have matched.
- [ ] AC-8: Test sketches §8 are implemented and pass.
- [ ] AC-9: `pnpm typecheck` clean. `rg "status.*===.*'[a-z_]+'" src/server/routers/queries.ts` shows zero new hits introduced by this PR.
