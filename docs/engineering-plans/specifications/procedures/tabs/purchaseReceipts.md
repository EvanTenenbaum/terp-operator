# Procedure Spec: `queries.purchaseReceiptsTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives a receipts list with status tabs (`posted` / `reversed`). Often used as the entry point for vendor-bill creation flows and intake correction routes.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/purchaseReceipts.ts
import { z } from 'zod';
import { PurchaseReceiptStatus } from '../statuses';

export const purchaseReceiptsTabsInputSchema = z.object({
  status: PurchaseReceiptStatus.optional(),
  vendorId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  text: z.string().trim().max(120).optional(),  // matches receipt_no or PO no
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const purchaseReceiptTabRowSchema = z.object({
  id: z.string().uuid(),
  receiptNo: z.string(),
  vendorId: z.string().uuid().nullable(),
  vendor: z.string().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  poNo: z.string().nullable(),
  total: z.coerce.number().nullable(),           // blanked for sub-manager
  receiptDate: z.string().datetime().nullable(),
  status: PurchaseReceiptStatus,
  vendorBillId: z.string().uuid().nullable(),    // linked bill if any
  createdAt: z.string().datetime()
});

export const purchaseReceiptsTabsOutputSchema = z.object({
  entityType: z.literal('purchaseReceipts'),
  status: PurchaseReceiptStatus.optional(),
  rows: z.array(purchaseReceiptTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. **Per-column blanking** for actors below `manager`: `total = null` (mirrors v1 `grid('purchaseReceipts')` if that exists; if it does not, follows the conservative posture: financial totals on receipts are landed-cost data and not operator-visible).

## §5 Status Values (from `src/shared/statuses.ts`)

`PurchaseReceiptStatus.options`: `'posted'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement. `LEFT JOIN purchase_orders po`, `LEFT JOIN vendors v`. Scalar subquery for `vendorBillId` against `vendor_bills` is permitted only if indexed on `vendor_bills (purchase_receipt_id)` (P0-7 verifies). `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('returns receipts filtered by status', async () => {
  await seedPurchaseReceipts([
    { status: 'posted' },
    { status: 'reversed' }
  ]);
  const result = await caller.queries.purchaseReceiptsTabs({ status: 'posted' });
  expect(result.rows).toHaveLength(1);
});

it('blanks total for operator', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  await seedPurchaseReceipts([{ status: 'posted', total: 5000 }]);
  const result = await operatorCaller.queries.purchaseReceiptsTabs({ status: 'posted' });
  expect(result.rows[0].total).toBeNull();
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.purchaseReceiptsTabs({ status: 'pending' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.purchaseReceiptsTabs({ status: 'posted' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: `total` blanked for sub-manager actors.
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
