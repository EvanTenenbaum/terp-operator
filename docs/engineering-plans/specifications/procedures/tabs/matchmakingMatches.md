# Procedure Spec: `queries.matchmakingMatchesTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the matchmaking review surface with status tabs (`open` / `accepted` / `dismissed`). Reuses the same projection as the existing `matchmakingSql()` helper in `queries.ts`.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/matchmakingMatches.ts
import { z } from 'zod';
import { MatchmakingMatchStatus } from '../statuses';

export const matchmakingMatchesTabsInputSchema = z.object({
  status: MatchmakingMatchStatus.optional(),
  customerId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

Mirrors `matchmakingSql()` projection (`queries.ts:2840+`). Row shape includes both the customer-need and the vendor-supply sides.

```ts
export const matchmakingMatchTabRowSchema = z.object({
  id: z.string().uuid(),
  customerNeedId: z.string().uuid(),
  needCode: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  customer: z.string().nullable(),
  customerProduct: z.string().nullable(),
  needTags: z.array(z.string()).nullable(),
  neededQty: z.coerce.number().nullable(),
  targetPrice: z.coerce.number().nullable(),
  neededBy: z.string().datetime().nullable(),
  vendorSupplyId: z.string().uuid(),
  supplyCode: z.string().nullable(),
  vendorId: z.string().uuid().nullable(),
  vendor: z.string().nullable(),
  vendorProduct: z.string().nullable(),
  supplyTags: z.array(z.string()).nullable(),
  availableQty: z.coerce.number().nullable(),
  askingPrice: z.coerce.number().nullable(),
  availableDate: z.string().datetime().nullable(),
  location: z.string().nullable(),
  score: z.coerce.number().nullable(),
  reasons: z.array(z.string()).nullable(),
  status: MatchmakingMatchStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable()
});

export const matchmakingMatchesTabsOutputSchema = z.object({
  entityType: z.literal('matchmakingMatches'),
  status: MatchmakingMatchStatus.optional(),
  rows: z.array(matchmakingMatchTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`.

## §5 Status Values (from `src/shared/statuses.ts`)

`MatchmakingMatchStatus.options`: `'open'`, `'accepted'`, `'dismissed'`.

## §6 N+1 Avoidance

Single SQL statement. `JOIN customer_needs cn`, `JOIN vendor_supply vs`, `LEFT JOIN customers c`, `LEFT JOIN vendors v` — identical structure to `matchmakingSql()`. `WHERE mm.status = $1` / `WHERE cn.customer_id = $2` / `WHERE vs.vendor_id = $3` composed via `buildGridWhereClause`. `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('returns matches filtered by status', async () => {
  await seedMatches([
    { status: 'open' }, { status: 'open' }, { status: 'accepted' }
  ]);
  const result = await caller.queries.matchmakingMatchesTabs({ status: 'open' });
  expect(result.rows).toHaveLength(2);
});

it('filters by customerId via the need join', async () => {
  const cust = await seedCustomer();
  await seedMatchForCustomer(cust);
  await seedMatchForCustomer(await seedCustomer());
  const result = await caller.queries.matchmakingMatchesTabs({ status: 'open', customerId: cust.id });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].customerId).toBe(cust.id);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.matchmakingMatchesTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.matchmakingMatchesTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Row shape matches `matchmakingSql()` column-for-column.
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
