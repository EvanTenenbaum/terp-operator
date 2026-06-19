# Procedure Spec: `queries.salesOrdersTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the `SalesView` tab bar (Phase 3). Tab values are `SalesOrderStatus` enum members. Coexists with the rich Sales detail flows in `SalesView` — the tab procedure feeds the primary list, the slide-over reads `salesOrderDetail` (existing).

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/salesOrders.ts
import { z } from 'zod';
import { SalesOrderStatus } from '../statuses';

export const salesOrdersTabsInputSchema = z.object({
  status: SalesOrderStatus.optional(),
  customerId: z.string().uuid().optional(),
  text: z.string().trim().max(120).optional(),  // matches order_no or customer name
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

Mirrors `gridSql('sales')` (`queries.ts:2906–2919`) — including the aggregated `lines`, `packed`, `inventoryPosted`, `paymentFollowup` columns. `internalMargin` is preserved server-side; role-gating happens via the v1 `grid` post-projection that this procedure replicates.

```ts
export const salesOrderTabRowSchema = z.object({
  id: z.string().uuid(),
  orderNo: z.string(),
  customer: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  status: SalesOrderStatus,
  pricingStrategy: z.string().nullable(),
  total: z.coerce.number(),
  internalMargin: z.coerce.number().nullable(),     // blanked for sub-manager
  marginWaivedTotal: z.coerce.number().nullable(),  // blanked for sub-manager
  lines: z.number().int(),
  deliveryWindow: z.string().nullable(),
  notes: z.string().nullable(),
  packed: z.boolean().nullable(),
  inventoryPosted: z.boolean().nullable(),
  paymentFollowup: z.boolean().nullable(),
  legacyStatusMarkers: z.string().nullable(),
  validationIssues: z.unknown().nullable(),
  createdAt: z.string().datetime()
});

export const salesOrdersTabsOutputSchema = z.object({
  entityType: z.literal('salesOrders'),
  status: SalesOrderStatus.optional(),
  rows: z.array(salesOrderTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. **Per-column blanking** for actors below `manager`: `internalMargin = null`, `marginWaivedTotal = null` (matches `grid` lines 205–207). Same shared helper that v1 `grid` and `gridSummary` use.

## §5 Status Values (from `src/shared/statuses.ts`)

`SalesOrderStatus.options`: `'draft'`, `'confirmed'`, `'posted'`, `'fulfilled'`, `'cancelled'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement. Uses the same projection as `gridSql('sales')`:

- `LEFT JOIN sales_order_lines sol` aggregated with `GROUP BY so.id, c.name`.
- `bool_or` and `string_agg` for the flag aggregates — single pass.
- `count(*) OVER ()` for `totalRows`.
- `WHERE so.status = $1` / `WHERE so.customer_id = $2` / `WHERE (so.order_no ILIKE $3 OR c.name ILIKE $3)` composed via `buildGridWhereClause`.

## §7 Test Sketches

```ts
it('blanks internalMargin for operator role', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  const result = await operatorCaller.queries.salesOrdersTabs({});
  expect(result.rows.every((r) => r.internalMargin === null)).toBe(true);
});

it('preserves internalMargin for manager role', async () => {
  const managerCaller = await callerFor({ role: 'manager' });
  await seedSalesOrders([{ status: 'posted', internalMargin: 1234 }]);
  const result = await managerCaller.queries.salesOrdersTabs({ status: 'posted' });
  expect(result.rows[0].internalMargin).toBeGreaterThan(0);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.salesOrdersTabs({ status: 'super-confirmed' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.salesOrdersTabs({ status: 'confirmed' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Row shape matches `gridSql('sales')` column-for-column.
- [ ] AC-4: Role-blanking applied identically to v1 `grid` for `internalMargin` / `marginWaivedTotal`.
- [ ] AC-5: Single SQL statement per call.
- [ ] AC-6: §7 tests pass.
