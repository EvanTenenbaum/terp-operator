# Procedure Spec: `queries.fulfillmentLinesTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives a fulfillment line list with status tabs (`open` / `packed`). Used by the warehouse fulfillment surface and the bulk "release for picking" / "record weigh & pack" actions.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/fulfillmentLines.ts
import { z } from 'zod';
import { FulfillmentLineStatus } from '../statuses';

export const fulfillmentLinesTabsInputSchema = z.object({
  status: FulfillmentLineStatus.optional(),
  pickListId: z.string().uuid().optional(),
  salesOrderId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const fulfillmentLineTabRowSchema = z.object({
  id: z.string().uuid(),
  salesOrderId: z.string().uuid(),
  orderNo: z.string().nullable(),
  customer: z.string().nullable(),
  pickListId: z.string().uuid().nullable(),
  batchId: z.string().uuid().nullable(),
  batchCode: z.string().nullable(),
  itemAlias: z.string().nullable(),
  qty: z.coerce.number(),
  uom: z.string().nullable(),
  packedQty: z.coerce.number().nullable(),
  packedAt: z.string().datetime().nullable(),
  status: FulfillmentLineStatus,
  statusExtended: z.string().nullable(),
  createdAt: z.string().datetime()
});

export const fulfillmentLinesTabsOutputSchema = z.object({
  entityType: z.literal('fulfillmentLines'),
  status: FulfillmentLineStatus.optional(),
  rows: z.array(fulfillmentLineTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`.

## §5 Status Values (from `src/shared/statuses.ts`)

`FulfillmentLineStatus.options`: `'open'`, `'packed'`. (Cancellation is recorded on `status_extended`, not `status` — see `src/shared/statuses.ts` line 213. Tabs render only `open` / `packed`; cancellation is surfaced via the `statusExtended` chip.)

## §6 N+1 Avoidance

Single SQL statement. `LEFT JOIN sales_orders so`, `LEFT JOIN customers c`, `LEFT JOIN batches b`, `LEFT JOIN items i`. `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('returns lines filtered by status', async () => {
  await seedFulfillmentLines([
    { status: 'open' }, { status: 'open' }, { status: 'packed' }
  ]);
  const result = await caller.queries.fulfillmentLinesTabs({ status: 'open' });
  expect(result.rows).toHaveLength(2);
});

it('filters by pickListId', async () => {
  const pl = await seedPickList();
  await seedFulfillmentLinesForPickList(pl, [{ status: 'open' }, { status: 'open' }]);
  const result = await caller.queries.fulfillmentLinesTabs({ pickListId: pl.id });
  expect(result.rows).toHaveLength(2);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.fulfillmentLinesTabs({ status: 'cancelled' })  // not in enum (it's statusExtended)
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.fulfillmentLinesTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: `statusExtended` surfaced as a separate field; not conflated with `status` (matches the enum doc note in `statuses.ts:213`).
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
