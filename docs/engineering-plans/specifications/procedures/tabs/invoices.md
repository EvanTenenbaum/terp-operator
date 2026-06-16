# Procedure Spec: `queries.invoicesTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives an invoices list with status tabs (`open` / `paid` / `reversed`). The current `gridSql` does NOT have a dedicated `invoices` view (only the `clients` aggregate). This procedure stands up the row-level invoice list that the dispute / payment-allocation flows need.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/invoices.ts
import { z } from 'zod';
import { InvoiceStatus } from '../statuses';

export const invoicesTabsInputSchema = z.object({
  status: InvoiceStatus.optional(),
  customerId: z.string().uuid().optional(),
  text: z.string().trim().max(120).optional(),  // matches invoice_no or customer name
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const invoiceTabRowSchema = z.object({
  id: z.string().uuid(),
  invoiceNo: z.string(),
  customerId: z.string().uuid().nullable(),
  customer: z.string().nullable(),
  orderId: z.string().uuid().nullable(),
  total: z.coerce.number(),
  amountPaid: z.coerce.number(),
  balance: z.coerce.number(),                    // total - amountPaid
  status: InvoiceStatus,
  dueDate: z.string().datetime().nullable(),
  daysPastDue: z.number().int().nullable(),
  openDisputeId: z.string().uuid().nullable(),
  createdAt: z.string().datetime()
});

export const invoicesTabsOutputSchema = z.object({
  entityType: z.literal('invoices'),
  status: InvoiceStatus.optional(),
  rows: z.array(invoiceTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. No per-column blanking.

## §5 Status Values (from `src/shared/statuses.ts`)

`InvoiceStatus.options`: `'open'`, `'paid'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement:

```sql
SELECT
  i.id, i.invoice_no AS "invoiceNo",
  i.customer_id AS "customerId", c.name AS customer,
  i.order_id AS "orderId",
  i.total, i.amount_paid AS "amountPaid",
  (i.total - i.amount_paid) AS balance,
  i.status, i.due_date AS "dueDate",
  CASE WHEN i.status = 'open' AND i.due_date IS NOT NULL
       THEN floor(extract(epoch FROM (now() - i.due_date)) / 86400)::int
  END AS "daysPastDue",
  (SELECT d.id FROM invoice_disputes d WHERE d.invoice_id = i.id AND d.status = 'open' LIMIT 1) AS "openDisputeId",
  i.created_at AS "createdAt",
  count(*) OVER () AS "__totalRows"
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
WHERE [buildGridWhereClause]
ORDER BY i.created_at DESC
LIMIT $L OFFSET $O
```

The `openDisputeId` subquery is a per-row scalar lookup, but it is bounded by `LIMIT 1` on an indexed `(invoice_id, status)` column and runs as a single SQL statement from Postgres's view, satisfying ARCH-10 (no extra round trips). Reviewer must verify a Postgres index exists on `invoice_disputes (invoice_id, status)` — flagged for P0-7.

## §7 Test Sketches

```ts
it('returns invoices filtered by status with balance computed', async () => {
  await seedInvoices([
    { invoice_no: 'INV-001', status: 'open', total: 1000, amount_paid: 300 },
    { invoice_no: 'INV-002', status: 'paid', total: 500,  amount_paid: 500 }
  ]);
  const result = await caller.queries.invoicesTabs({ status: 'open' });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].balance).toBe(700);
});

it('attaches openDisputeId when present', async () => {
  const invoiceId = await seedInvoiceWithOpenDispute();
  const result = await caller.queries.invoicesTabs({ status: 'open' });
  const invoice = result.rows.find((r) => r.id === invoiceId);
  expect(invoice?.openDisputeId).not.toBeNull();
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.invoicesTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.invoicesTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Single SQL statement per call.
- [ ] AC-4: `openDisputeId` populated when an `invoice_disputes` row with `status='open'` exists.
- [ ] AC-5: §7 tests pass.
