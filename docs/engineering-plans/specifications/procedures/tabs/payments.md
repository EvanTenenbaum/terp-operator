# Procedure Spec: `queries.paymentsTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the payments view tab bar. Tabs are `PaymentStatus` values; the typical UX exposes `posted` and `refunded` directly and surfaces `reversed` through a "Recovery" surface.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/payments.ts
import { z } from 'zod';
import { PaymentStatus } from '../statuses';

export const paymentsTabsInputSchema = z.object({
  status: PaymentStatus.optional(),
  direction: z.enum(['receiving', 'paying']).optional(),
  customerId: z.string().uuid().optional(),
  category: z.string().min(1).max(64).optional(),
  text: z.string().trim().max(120).optional(),  // matches reference or customer name
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

Mirrors `gridSql('payments')` (`queries.ts:2950–2955`).

```ts
export const paymentTabRowSchema = z.object({
  id: z.string().uuid(),
  customer: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  direction: z.string().nullable(),
  category: z.string().nullable(),
  method: z.string().nullable(),
  amount: z.coerce.number(),
  unappliedAmount: z.coerce.number().nullable(),
  allocationIntent: z.string().nullable(),
  impactPreview: z.string().nullable(),
  reference: z.string().nullable(),
  locationBucket: z.string().nullable(),
  notes: z.string().nullable(),
  status: PaymentStatus,
  createdAt: z.string().datetime()
});

export const paymentsTabsOutputSchema = z.object({
  entityType: z.literal('payments'),
  status: PaymentStatus.optional(),
  rows: z.array(paymentTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. No per-column blanking (payment amounts are operator-visible in TERP).

## §5 Status Values (from `src/shared/statuses.ts`)

`PaymentStatus.options`: `'posted'`, `'refunded'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement. `LEFT JOIN customers c` for sublabel. `WHERE p.status = $1` / `WHERE p.direction = $2` / `WHERE p.customer_id = $3` / `WHERE p.category = $4` / `WHERE (p.reference ILIKE $5 OR c.name ILIKE $5)` composed via `buildGridWhereClause`. `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('filters by direction', async () => {
  await seedPayments([
    { direction: 'receiving', status: 'posted' },
    { direction: 'paying',    status: 'posted' }
  ]);
  const result = await caller.queries.paymentsTabs({ status: 'posted', direction: 'receiving' });
  expect(result.rows).toHaveLength(1);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.paymentsTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.paymentsTabs({ status: 'posted' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Row shape matches `gridSql('payments')` column-for-column.
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
