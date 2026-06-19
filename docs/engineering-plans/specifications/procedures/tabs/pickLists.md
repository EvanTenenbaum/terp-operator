# Procedure Spec: `queries.pickListsTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives a pick list view with status tabs (`open` / `fulfilled`). Used by the warehouse assignment surface.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/pickLists.ts
import { z } from 'zod';
import { PickListStatus } from '../statuses';

export const pickListsTabsInputSchema = z.object({
  status: PickListStatus.optional(),
  assigneeId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const pickListTabRowSchema = z.object({
  id: z.string().uuid(),
  pickListNo: z.string().nullable(),
  salesOrderId: z.string().uuid().nullable(),
  orderNo: z.string().nullable(),
  customer: z.string().nullable(),
  assigneeId: z.string().uuid().nullable(),
  assignee: z.string().nullable(),
  status: PickListStatus,
  lineCount: z.number().int(),
  packedLineCount: z.number().int(),
  createdAt: z.string().datetime()
});

export const pickListsTabsOutputSchema = z.object({
  entityType: z.literal('pickLists'),
  status: PickListStatus.optional(),
  rows: z.array(pickListTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`.

## §5 Status Values (from `src/shared/statuses.ts`)

`PickListStatus.options`: `'open'`, `'fulfilled'`.

## §6 N+1 Avoidance

Single SQL statement. `LEFT JOIN sales_orders so`, `LEFT JOIN customers c`, `LEFT JOIN users u` (for assignee). `lineCount` and `packedLineCount` computed via `LEFT JOIN LATERAL` over `fulfillment_lines fl WHERE fl.pick_list_id = pl.id`. `count(*) OVER ()` for `totalRows`.

```sql
LEFT JOIN LATERAL (
  SELECT count(*)::int AS line_count,
         count(*) FILTER (WHERE fl.status = 'packed')::int AS packed_line_count
  FROM fulfillment_lines fl
  WHERE fl.pick_list_id = pl.id
) flagg ON true
```

## §7 Test Sketches

```ts
it('returns pick lists filtered by status', async () => {
  await seedPickLists([
    { status: 'open' }, { status: 'fulfilled' }
  ]);
  const result = await caller.queries.pickListsTabs({ status: 'open' });
  expect(result.rows).toHaveLength(1);
});

it('reports line counts via lateral join', async () => {
  const pl = await seedPickList({ status: 'open' });
  await seedFulfillmentLinesForPickList(pl, [
    { status: 'open' }, { status: 'open' }, { status: 'packed' }
  ]);
  const result = await caller.queries.pickListsTabs({ status: 'open' });
  const row = result.rows.find((r) => r.id === pl.id);
  expect(row?.lineCount).toBe(3);
  expect(row?.packedLineCount).toBe(1);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.pickListsTabs({ status: 'closed' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.pickListsTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: `lineCount` / `packedLineCount` correct via lateral join (no per-row subqueries).
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
