# Procedure Spec: `queries.photographyQueueTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the photography queue surface with status tabs (`open` / `done`). The queue is fed by intake; the operator works it down and the system auto-sets `done` on attach/upload.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/photographyQueue.ts
import { z } from 'zod';
import { PhotographyQueueStatus } from '../statuses';

export const photographyQueueTabsInputSchema = z.object({
  status: PhotographyQueueStatus.optional(),
  category: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const photographyQueueTabRowSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchCode: z.string().nullable(),
  itemAlias: z.string().nullable(),
  category: z.string().nullable(),
  vendorId: z.string().uuid().nullable(),
  vendor: z.string().nullable(),
  availableQty: z.coerce.number().nullable(),
  status: PhotographyQueueStatus,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
});

export const photographyQueueTabsOutputSchema = z.object({
  entityType: z.literal('photographyQueue'),
  status: PhotographyQueueStatus.optional(),
  rows: z.array(photographyQueueTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`.

## §5 Status Values (from `src/shared/statuses.ts`)

`PhotographyQueueStatus.options`: `'open'`, `'done'`.

## §6 N+1 Avoidance

Single SQL statement. `JOIN batches b` (for `batchCode`, `category`, `availableQty`, `vendorId`), `LEFT JOIN items i` (for `itemAlias`), `LEFT JOIN vendors v` (for `vendor`). `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('returns queue entries filtered by status', async () => {
  await seedPhotographyQueue([
    { status: 'open' }, { status: 'open' }, { status: 'done' }
  ]);
  const result = await caller.queries.photographyQueueTabs({ status: 'open' });
  expect(result.rows).toHaveLength(2);
});

it('filters by category via batch join', async () => {
  await seedPhotographyQueueForBatch(await seedBatch({ category: 'flower' }));
  await seedPhotographyQueueForBatch(await seedBatch({ category: 'concentrate' }));
  const result = await caller.queries.photographyQueueTabs({ status: 'open', category: 'flower' });
  expect(result.rows).toHaveLength(1);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.photographyQueueTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.photographyQueueTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Single SQL statement per call.
- [ ] AC-4: §7 tests pass.
