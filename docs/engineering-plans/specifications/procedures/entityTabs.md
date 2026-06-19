> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md).
> Before implementing, read §§1–3 and §6 of the manifesto.

---

# Procedure Pattern Spec: Per-Entity Tab Queries

**Type:** `procedure-pattern` (one query per entity; this file is the catalog and template)
**Target file:** Each per-entity tab query is added to `src/server/routers/queries.ts`. Per-entity spec sheets live under `docs/engineering-plans/specifications/procedures/tabs/<entityType>.md`.
**Agent:** `fast-build` (one entity at a time, mechanical from this template) with `qa-reviewer` review.

Resolves: **CPO Audit F5/F10** (the `ViewTabBar` and `DetailSlideover` tab content surfaces have no data source). Feeds: **T-B-08** (per-entity tab query matrix).

References, by path:

- [docs/engineering-plans/MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md) §3 (ARCH-3, ARCH-7, ARCH-8 — per-entity not per-view), §6.2.
- [docs/engineering-plans/CPO-AUDIT-REPORT.md](../../CPO-AUDIT-REPORT.md) §F5, §F10.
- [src/shared/statuses.ts](../../../../src/shared/statuses.ts) — every `status` parameter goes through here.
- [docs/engineering-plans/specifications/procedures/statusCounts.md](./statusCounts.md) §1.1 — the tab bar counts.
- [docs/engineering-plans/specifications/procedures/grid-v2.md](./grid-v2.md) — the row shape is the same as `grid` rows for the same entity.

---

## Manifesto Anchoring (DO NOT SKIP)

| Field | Value |
|-------|-------|
| **UX Rule(s) Served** | UX-9 (filtering is fluid — switching a tab swaps the row set with a single round trip), UX-7 (operator sees current mode — the active tab IS the current filter), UX-11 (URL is session memory — `tab` param round-trips). |
| **ARCH Rule(s) Followed** | ARCH-3 (one query per tab render), ARCH-7 (`protectedProcedure` + per-entity role), ARCH-8 (per-entity query, not per-view — `purchaseOrderTabs` not `posPageTabs`), ARCH-10 (one statement, no N+1 in cell renderers). |
| **Attention Budget Tier** | Tier 0 — the rows under the active tab ARE the view content. |
| **Old Pattern Replaced** | Each tab fetching `grid({ view })` then client-side filtering, duplicating the per-row payload N times in client memory. Or worse: per-row sub-queries in cell renderers (e.g., `<Cell>` fetching `entityDetail` on hover). |
| **URL State Encoded** | None directly. The tab selection is encoded by the parent view via the `qf` URL param (ARCH-11: `qf=status:approved`), which the procedure receives as `status`. |
| **Existing Infra Leveraged** | `protectedProcedure`, `pool.query`, `canRole`, `src/shared/statuses.ts`. |
| **Anti-Patterns Avoided** | No per-row N+1 inside `gridSql`-style projections. No status-string literals — every `status` parameter narrows through `src/shared/statuses.ts`. No leaking of money-sensitive columns to `viewer` — projection mirrors `grid`'s role gates. |
| **Compliance Check** | (1) Per entity, exactly one tab query procedure. (2) Switching a tab fires exactly one new query call; the previous tab's rows are dropped via React Query GC. (3) `EXPLAIN ANALYZE` shows the `status` filter as an index seek. (4) Cell renderers consuming the rows do NOT issue further per-row queries — verified by network-panel inspection on a 50-row page. (5) `viewer` calling a `manager`-floored tab query → `FORBIDDEN`. |

---

## §1 — The Pattern

### 1.1 — Why one procedure per entity, not one global tab query

Three reasons:

1. **Shape divergence.** The row shape per entity is meaningful (and verified by tests / consumed by stable cell renderers). A single global tab query returning `Record<string, unknown>[]` defeats type narrowing in every consumer.
2. **Filter divergence.** Each entity supports a different filter set (e.g., `fulfillmentLines` accepts `pickListId`; `connectorRequests` accepts `inboundChannel`). A single procedure with a union filter type encourages either over-permissive validation or `any`-typed escape hatches.
3. **Role divergence.** `vendorPaymentTabs` floors at `manager`; `purchaseOrderTabs` at `operator`. Procedure-level role gates are clearer than per-call branching inside a switch.

The catalog is closed and small (~12 entries — see §3). New entities require a new procedure file and a per-entity spec sheet under `docs/engineering-plans/specifications/procedures/tabs/<entity>.md`.

### 1.2 — Naming convention

```
queries.<entityCamel>Tabs
```

Each procedure name is `<entityType>Tabs` where `<entityType>` matches the canonical entity name from `src/shared/statuses.ts` (`PurchaseOrderStatus` → `purchaseOrderTabs`). The trailing `Tabs` suffix flags the consumption pattern (tab-driven status filter) and prevents collision with `queries.purchaseOrder` (single-entity detail fetch).

### 1.3 — Distinct from `grid-v2`

Both procedures accept a `status` filter and return rows. The differences:

| Aspect | `grid` v2 | `<entity>Tabs` |
|---|---|---|
| Input shape | Generic `gridFiltersSchema` | Per-entity tab schema (smaller surface, entity-specific filters allowed) |
| Output shape | Generic `{ rows, totalRows, aggregate?, groups? }` | Per-entity `{ rows, totalRows }` (no aggregate/groups — the tab page renders flat) |
| Number of consumers | Every grid view | A specific tab consumer (`ViewTabBar` row list, `DetailSlideover` tab content) |
| Type narrowing | Lost (`gridRowSchema = z.record(z.unknown())`) | Preserved (per-entity Zod row schema) |

Practically: `<entity>Tabs` is a typed, focused subset of what `grid-v2` would do; views that want filter/sort/group/pagination richness use `grid-v2`, while views that just need "switch tabs and see rows" use `<entity>Tabs`. The two are not mutually exclusive — a view may use `<entity>Tabs` for its primary list and `grid-v2` for nested expansion.

---

## §2 — Schema Template

Each per-entity tab procedure follows this template, parametrized by `<EntityName>`, `<EntityStatusEnum>`, and `<EntityRowSchema>`:

```ts
// src/shared/schemas/tabs/<entity>.ts (per-entity file)

import { z } from 'zod';
import { <EntityStatusEnum> } from '../statuses';

export const <entity>TabsInputSchema = z.object({
  // Tab selection. Optional → "All" tab.
  status: <EntityStatusEnum>.optional(),
  // Pagination. Defaults are the same as grid-v2.
  limit:  z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
  // Per-entity additional filters. Each entity spec sheet enumerates these.
  // The template leaves the slot open as a literal object so unused entities
  // omit it entirely (no `extras: undefined` clutter).
  // <ENTITY_SPECIFIC_FILTERS_GO_HERE>
}).superRefine((input, ctx) => {
  if (input.offset > 0) {
    // Tab pagination uses the entity's natural sort (createdAt desc); no
    // need to require an explicit sort param like grid-v2 does, because
    // the tab procedure has exactly one sort order.
  }
});

export const <entity>TabsRowSchema = <EntityRowSchema>; // per entity

export const <entity>TabsOutputSchema = z.object({
  entityType: z.literal('<entity>'),
  status: <EntityStatusEnum>.optional(), // echoes input.status for consumers
  rows: z.array(<entity>TabsRowSchema),
  totalRows: z.number().int().min(0)
});
```

### 2.1 — Why output is a tagged object, not a bare array

Mirrors `grid-v2` (§4.1): consumers need `totalRows` for the "Showing 1–100 of 4,512" header. Returning a bare array forces consumers to re-issue `statusCounts` to get the same number, which doubles network traffic.

---

## §3 — The Catalog (12 entries for Phase 0–3)

Each entry below is implemented as a procedure under `queries.<entity>Tabs` and gets a per-entity spec sheet under `docs/engineering-plans/specifications/procedures/tabs/<entity>.md`. The 12 chosen entities are exactly the set the Phase 0–3 UI needs.

| `<entity>` | Status enum | Table(s) | Min role | Per-entity filter slots | Spec sheet |
|---|---|---|---|---|---|
| `purchaseOrders` | `PurchaseOrderStatus` | `purchase_orders` (+ aggregates from `purchase_order_lines`, `vendor_payments`) | `operator` | `vendorId?`, `text?` (po_no / vendor name) | [tabs/purchaseOrders.md](./tabs/purchaseOrders.md) |
| `salesOrders` | `SalesOrderStatus` | `sales_orders` (+ aggregates from `sales_order_lines`) | `operator` | `customerId?`, `text?` | [tabs/salesOrders.md](./tabs/salesOrders.md) |
| `inventory` | `BatchStatus` | `batches` | `operator` | `category?`, `vendorId?`, `availableQty?: 'positive'`, `text?` | [tabs/inventory.md](./tabs/inventory.md) |
| `payments` | `PaymentStatus` | `payments` | `operator` | `direction?`, `customerId?`, `category?`, `text?` | [tabs/payments.md](./tabs/payments.md) |
| `invoices` | `InvoiceStatus` | `invoices` | `operator` | `customerId?`, `text?` | [tabs/invoices.md](./tabs/invoices.md) |
| `purchaseReceipts` | `PurchaseReceiptStatus` | `purchase_receipts` | `operator` | `vendorId?`, `purchaseOrderId?`, `text?` | [tabs/purchaseReceipts.md](./tabs/purchaseReceipts.md) |
| `vendorBills` | `VendorBillStatus` | `vendor_bills` | `operator` | `vendorId?`, `text?` | [tabs/vendorBills.md](./tabs/vendorBills.md) |
| `fulfillmentLines` | `FulfillmentLineStatus` | `fulfillment_lines` | `operator` | `pickListId?`, `salesOrderId?` | [tabs/fulfillmentLines.md](./tabs/fulfillmentLines.md) |
| `pickLists` | `PickListStatus` | `pick_lists` | `operator` | `assigneeId?` | [tabs/pickLists.md](./tabs/pickLists.md) |
| `connectorRequests` | `ConnectorRequestStatus` | `connector_requests` | `operator` | `inboundChannel?`, `text?` | [tabs/connectorRequests.md](./tabs/connectorRequests.md) |
| `matchmakingMatches` | `MatchmakingMatchStatus` | `matchmaking_matches` (+ join `customer_needs`, `vendor_supply`) | `operator` | `customerId?`, `vendorId?` | [tabs/matchmakingMatches.md](./tabs/matchmakingMatches.md) |
| `photographyQueue` | `PhotographyQueueStatus` | `photography_queue` (+ join `batches`) | `operator` | `category?` | [tabs/photographyQueue.md](./tabs/photographyQueue.md) |

Future entities (when added) follow the same template and add a spec sheet.

---

## §4 — Per-Entity Spec Sheet Template

Every entry in `docs/engineering-plans/specifications/procedures/tabs/<entity>.md` follows this skeleton (the actual sheets are written under Output 2):

```md
# Procedure Spec: `queries.<entity>Tabs`

## §1 Purpose
One paragraph: which tab consumer reads this; why a generic `grid` call isn't enough.

## §2 Input Schema (Zod)
Per-entity expansion of §2 template above.

## §3 Output Schema (Zod)
Per-entity row shape with link to `gridSql` rows for the same entity (must match column-for-column to keep cell renderers unified).

## §4 Role Gating
Min role at the procedure boundary. Per-column blanking rules if any (mirrors `grid` role gate).

## §5 Status Values
Imported from `src/shared/statuses.ts`. List of tab labels (presentation only — actual labels live in client label registry).

## §6 N+1 Avoidance
One SQL statement. Sub-aggregates inline via `LEFT JOIN LATERAL` or `count(*) OVER (PARTITION BY ...)` — never per-row.

## §7 Test Sketches
(a) Happy path: status filter narrows rows. (b) Role failure. (c) Single-query guard.

## §8 Acceptance Criteria
```

---

## §5 — Caching

Not server-side cached. Client-side `useViewData` keys each call under `['<entity>Tabs', input]` with a 15-second staleTime. Invalidations triggered by `useCommandRunner` mirror the existing `affectedQueryPredicate` semantics so a `releaseLineForPicking` mutation invalidates `fulfillmentLinesTabs` and `pickListsTabs` together.

---

## §6 — Error Contract

Identical across all per-entity procedures:

| Code | When |
|---|---|
| `UNAUTHORIZED` | No session. |
| `FORBIDDEN` | Actor below the entity's min role. |
| `BAD_REQUEST` | `status` not in the entity's canonical enum; unknown per-entity filter key (entity sheets allowlist them). |
| `INTERNAL_SERVER_ERROR` | DB failure; scrubbed. |

---

## §7 — N+1 Avoidance Strategy

Every per-entity tab procedure executes **exactly one** SQL statement per call. Per-row aggregates are computed via:

- `LEFT JOIN LATERAL ( ... ) ON true` for sub-aggregates (the existing `gridSql` pattern, e.g., `dr` lateral on `batches` for `draftReservedQty`).
- `count(*) OVER (PARTITION BY ...)` for window aggregates (e.g., per-status counts when the procedure also returns a quick tab summary).
- Pre-joined `LEFT JOIN` for direct neighbor entities (e.g., `vendors`, `customers`).

A reviewer must reject any per-entity tab procedure that issues more than one SQL statement. The compliance test (§8.3) enforces this.

---

## §8 — Pattern-Level Tests

These tests live in `src/server/routers/queries.entityTabs.pattern.test.ts` and run against every per-entity tab procedure via a parameterized loop:

### 8.1 — Status enum membership for every entity

```ts
const ENTITY_TAB_PROCEDURES = [
  { name: 'purchaseOrders',     enum: PurchaseOrderStatus,     minRole: 'operator' },
  { name: 'salesOrders',        enum: SalesOrderStatus,        minRole: 'operator' },
  // ... etc
] as const;

it.each(ENTITY_TAB_PROCEDURES)('$name accepts every canonical status value', async ({ name, enum: e }) => {
  for (const status of e.options) {
    await expect(
      caller.queries[`${name}Tabs`]({ status })
    ).resolves.toMatchObject({ entityType: name, status });
  }
});
```

### 8.2 — Bad status string rejected

```ts
it.each(ENTITY_TAB_PROCEDURES)('$name rejects out-of-enum status', async ({ name }) => {
  await expect(
    caller.queries[`${name}Tabs`]({ status: 'super-status' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
```

### 8.3 — Single-query (N+1 guard)

```ts
it.each(ENTITY_TAB_PROCEDURES)('$name executes exactly one SQL statement per call', async ({ name }) => {
  const sqlSpy = trackPgStatements();
  await caller.queries[`${name}Tabs`]({ limit: 50 });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

### 8.4 — Role gate

```ts
it.each(ENTITY_TAB_PROCEDURES.filter((e) => e.minRole !== 'viewer'))(
  '$name rejects sub-min-role actors',
  async ({ name, minRole }) => {
    const lowerRole = belowMinRole(minRole);
    const lowCaller = await callerFor({ role: lowerRole });
    await expect(
      lowCaller.queries[`${name}Tabs`]({})
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
);
```

### 8.5 — Output `entityType` and `status` echo input

```ts
it.each(ENTITY_TAB_PROCEDURES)('$name echoes entityType and status to consumers', async ({ name, enum: e }) => {
  const status = e.options[0];
  const result = await caller.queries[`${name}Tabs`]({ status });
  expect(result.entityType).toBe(name);
  expect(result.status).toBe(status);
});
```

---

## §9 — Dependencies

| Dependency | Status | Blocker? | Notes |
|---|---|---|---|
| `src/shared/statuses.ts` (P0-1) | EXISTS | yes | All status filters route through here. |
| Per-entity row schema files under `src/shared/schemas/tabs/` | NEEDS_BUILD (one per entity) | yes | Each entity sheet specifies its row shape. |
| `useViewData` invalidation predicates (T-B-17) | NEEDS_BUILD | no for procedures themselves | Client-side staleness. |
| Per-entity spec sheets under `tabs/<entity>.md` | NEEDS_BUILD (Output 2 of this work) | yes | Each procedure has a 1:1 spec. |

---

## §10 — Risk Notes

- **Coupling to `grid` row shape.** A per-entity tab row schema MUST match `gridSql` for the same entity column-for-column. Drift causes the same cell renderer to behave differently between the grid and the tab list. Mitigation: each entity tab spec references the relevant `gridSql` case in `queries.ts` and the implementation reuses the same projection (extracted into a `<entity>ProjectionSql` helper).
- **Filter expansion creep.** Each entity will be tempted to add "just one more" optional filter (e.g., `dateRange`, `text`). The catalog table in §3 caps the per-entity filter set; widening it requires a spec edit, not a code-only addition. CI guard: `pnpm lint:tab-procedure-filters` greps each `<entity>Tabs.ts` for filter keys and compares to the sheet.
- **Replacement for `grid-v2`.** As filters and sort proliferate on a tab procedure, the cost-benefit shifts toward letting that view use `grid-v2` instead. Reviewer must reject any per-entity tab procedure whose filter set duplicates `gridFiltersSchema`; that's the signal to migrate to `grid-v2`.
- **Tab procedure for legacy data drift.** Same as `statusCounts.md` §10: DB rows with non-canonical status values cause subtle bugs (rows missing from any tab). The DB audit (P0-7) is the mitigation; tab procedures themselves are unforgiving and return only canonical statuses.

---

## §11 — Acceptance Criteria (Pattern-Level)

- [ ] AC-1: For each of the 12 entities in §3, a `queries.<entity>Tabs` procedure exists in `src/server/routers/queries.ts`.
- [ ] AC-2: Each procedure imports its status enum from `src/shared/statuses.ts` — no inline status string literals.
- [ ] AC-3: Each procedure's input/output Zod schemas live in `src/shared/schemas/tabs/<entity>.ts`.
- [ ] AC-4: Pattern-level tests in §8 pass for every entity (parametric test loop).
- [ ] AC-5: Each entity has a corresponding spec sheet under `docs/engineering-plans/specifications/procedures/tabs/<entity>.md`.
- [ ] AC-6: Filter sets per entity match the §3 catalog; no entity adds undocumented filters.
- [ ] AC-7: `pnpm typecheck` clean.
