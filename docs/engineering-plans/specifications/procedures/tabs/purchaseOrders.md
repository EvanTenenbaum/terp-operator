# Procedure Spec: `queries.purchaseOrdersTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the `PurchaseOrdersView` tab bar (Phase 1 pilot). Each tab is a `PurchaseOrderStatus` value (plus "All"); switching tabs swaps the row set with a single round-trip and an indexed filter.

Generic `grid` v2 would also work, but this procedure narrows the row shape and per-entity filter set, allowing strongly-typed cell renderers and a smaller wire payload than `grid` (no `aggregate` / `groups` slots that this consumer doesn't use).

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/purchaseOrders.ts
import { z } from 'zod';
import { PurchaseOrderStatus } from '../statuses';

export const purchaseOrdersTabsInputSchema = z.object({
  status: PurchaseOrderStatus.optional(),
  vendorId: z.string().uuid().optional(),
  text: z.string().trim().max(120).optional(),  // matches po_no or vendor name
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

Row shape matches the existing `gridSql('purchaseOrders')` projection (`queries.ts:2892–2905`) column-for-column. The single source of truth is the shared `purchaseOrderRowSchema` referenced below; both this procedure and `gridSql` build from the same projection helper.

```ts
export const purchaseOrderTabRowSchema = z.object({
  id: z.string().uuid(),
  poNo: z.string(),
  vendor: z.string().nullable(),
  vendorId: z.string().uuid().nullable(),
  status: PurchaseOrderStatus,
  expectedDate: z.string().datetime().nullable(),
  orderedAt: z.string().datetime().nullable(),
  receivedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  total: z.coerce.number(),
  prepaymentAmount: z.coerce.number(),
  prepaidAmount: z.coerce.number(),
  remainingPrepay: z.coerce.number(),
  lines: z.number().int(),
  orderedQty: z.coerce.number(),
  receivedQty: z.coerce.number(),
  buyerNotes: z.string().nullable(),
  internalNotes: z.string().nullable(),
  createdAt: z.string().datetime()
});

export const purchaseOrdersTabsOutputSchema = z.object({
  entityType: z.literal('purchaseOrders'),
  status: PurchaseOrderStatus.optional(),
  rows: z.array(purchaseOrderTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. No per-column blanking (PO totals are not money-sensitive in TERP's role model — the existing `gridSql('purchaseOrders')` does not blank anything for `operator`).

## §5 Status Values (from `src/shared/statuses.ts`)

`PurchaseOrderStatus.options`: `'draft'`, `'finalized'`, `'approved'`, `'partially_received'`, `'received'`, `'cancelled'`, `'reversed'`.

## §6 N+1 Avoidance

Single SQL statement. Uses the same projection as `gridSql('purchaseOrders')`, with:

- `LEFT JOIN purchase_order_lines pol` aggregated via `GROUP BY po.id, v.name` for `lines`, `orderedQty`, `receivedQty`.
- Scalar subqueries for `prepaidAmount` and `remainingPrepay` against `vendor_payments` (already in `gridSql`; per-row not per-call).
- `count(*) OVER ()` for `totalRows`.
- `WHERE po.status = $1` when `status` is set; `WHERE po.vendor_id = $2` when `vendorId` is set; `WHERE (po.po_no ILIKE $3 OR v.name ILIKE $3)` when `text` is set. All composed via the entity's `buildGridWhereClause` adapter.

Indexes used: `purchase_orders (status)`, `purchase_orders (vendor_id)`, `purchase_orders (po_no)` (assumed btree; P0-7 audit confirms).

## §7 Test Sketches

```ts
it('returns POs filtered by status with totalRows', async () => {
  await seedPurchaseOrders([
    { status: 'draft' }, { status: 'approved' }, { status: 'approved' }
  ]);
  const result = await caller.queries.purchaseOrdersTabs({ status: 'approved' });
  expect(result.rows).toHaveLength(2);
  expect(result.totalRows).toBe(2);
  expect(result.status).toBe('approved');
});

it('rejects an out-of-enum status', async () => {
  await expect(
    caller.queries.purchaseOrdersTabs({ status: 'super-approved' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.purchaseOrdersTabs({ status: 'approved' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`; no inline literals.
- [ ] AC-3: Row shape matches `gridSql('purchaseOrders')` column-for-column.
- [ ] AC-4: Single SQL statement per call.
- [ ] AC-5: §7 tests pass.
