# Procedure Spec: `queries.vendorBillsTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives a vendor bills list with status tabs (`open` / `approved` / `scheduled` / `partial` / `paid` / `void` / `reversed`). Used by the vendor payables flow.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/vendorBills.ts
import { z } from 'zod';
import { VendorBillStatus } from '../statuses';

export const vendorBillsTabsInputSchema = z.object({
  status: VendorBillStatus.optional(),
  vendorId: z.string().uuid().optional(),
  text: z.string().trim().max(120).optional(),  // bill_no / vendor name
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const vendorBillTabRowSchema = z.object({
  id: z.string().uuid(),
  billNo: z.string(),
  vendorId: z.string().uuid().nullable(),
  vendor: z.string().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  poNo: z.string().nullable(),
  amount: z.coerce.number(),
  amountPaid: z.coerce.number(),
  balance: z.coerce.number(),                    // amount - amountPaid
  status: VendorBillStatus,
  dueDate: z.string().datetime().nullable(),
  daysPastDue: z.number().int().nullable(),
  createdAt: z.string().datetime()
});

export const vendorBillsTabsOutputSchema = z.object({
  entityType: z.literal('vendorBills'),
  status: VendorBillStatus.optional(),
  rows: z.array(vendorBillTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. (Vendor bills are operator-visible at the line level; aggregate vendor balance is `manager`-floored, but per-bill `amount` is fine for operators creating receipts.)

## §5 Status Values (from `src/shared/statuses.ts`)

`VendorBillStatus.options`: `'open'`, `'approved'`, `'scheduled'`, `'partial'`, `'paid'`, `'void'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement. `LEFT JOIN vendors v`, `LEFT JOIN purchase_orders po`. `count(*) OVER ()` for `totalRows`. `WHERE vb.status = $1` / `WHERE vb.vendor_id = $2` / `WHERE (vb.bill_no ILIKE $3 OR v.name ILIKE $3)` composed via `buildGridWhereClause`.

## §7 Test Sketches

```ts
it('returns bills filtered by status with balance computed', async () => {
  await seedVendorBills([
    { status: 'open',    amount: 1000, amount_paid: 0 },
    { status: 'partial', amount: 1000, amount_paid: 400 },
    { status: 'paid',    amount: 1000, amount_paid: 1000 }
  ]);
  const result = await caller.queries.vendorBillsTabs({ status: 'partial' });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].balance).toBe(600);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.vendorBillsTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.vendorBillsTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Single SQL statement per call.
- [ ] AC-4: `balance` always equals `amount - amountPaid`.
- [ ] AC-5: §7 tests pass.
