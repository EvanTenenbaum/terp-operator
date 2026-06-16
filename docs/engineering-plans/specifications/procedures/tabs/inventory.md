# Procedure Spec: `queries.inventoryTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the inventory batches table tab bar. Tabs are `BatchStatus` values. Distinct from the intake flow (which uses pre-posted lifecycle tabs `draft`/`ready`/`needs_fix`) — `inventoryTabs` typically shows the post-posting lifecycle (`posted`/`held`/`damaged`/`returned`/`in_transit`/`reversed`).

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/inventory.ts
import { z } from 'zod';
import { BatchStatus } from '../statuses';

export const inventoryTabsInputSchema = z.object({
  status: BatchStatus.optional(),
  category: z.string().min(1).max(64).optional(),
  vendorId: z.string().uuid().optional(),
  availableQty: z.enum(['positive']).optional(),
  text: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

Mirrors `gridSql('inventory')` (`queries.ts:2956–2970`).

```ts
export const inventoryTabRowSchema = z.object({
  id: z.string().uuid(),
  batchCode: z.string().nullable(),
  name: z.string().nullable(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  vendor: z.string().nullable(),
  vendorId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  itemAlias: z.string().nullable(),
  displayName: z.string().nullable(),
  availableQty: z.coerce.number(),
  reservedQty: z.coerce.number(),
  uom: z.string().nullable(),
  unitCost: z.coerce.number().nullable(),  // blanked for sub-manager
  unitPrice: z.coerce.number().nullable(),
  priceRange: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  location: z.string().nullable(),
  ownershipStatus: z.string().nullable(),
  legacyMarker: z.string().nullable(),
  arrivalStatus: z.string().nullable(),
  mediaStatus: z.string().nullable(),
  status: BatchStatus,
  lotCode: z.string().nullable(),
  expirationDate: z.string().datetime().nullable(),
  ageDays: z.number().int().nullable()
});

export const inventoryTabsOutputSchema = z.object({
  entityType: z.literal('inventory'),
  status: BatchStatus.optional(),
  rows: z.array(inventoryTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`. **Per-column blanking** for actors below `manager`: `unitCost = null` (matches `grid` lines 208–210).

## §5 Status Values (from `src/shared/statuses.ts`)

`BatchStatus.options`: `'draft'`, `'ready'`, `'needs_fix'`, `'posted'`, `'held'`, `'damaged'`, `'returned'`, `'in_transit'`, `'reversed'`. Practical inventory-view tabs typically render only the post-posting subset (`posted`, `held`, `damaged`, `returned`, `in_transit`), but the procedure supports the full enum so intake reuse stays straightforward.

## §6 N+1 Avoidance

Single SQL statement. Uses the same projection as `gridSql('inventory')`:

- `LEFT JOIN vendors v`, `LEFT JOIN items i` — single pass.
- `archived_at IS NULL` baseWhere.
- `WHERE b.status = $1` / `WHERE b.category = $2` / `WHERE b.vendor_id = $3` / `WHERE b.available_qty > 0` (when `availableQty: 'positive'`) / `WHERE (b.batch_code ILIKE $4 OR b.lot_code ILIKE $4 OR b.name ILIKE $4)` composed via `buildGridWhereClause`.
- `count(*) OVER ()` for `totalRows`.

## §7 Test Sketches

```ts
it('filters by status and availableQty=positive', async () => {
  await seedBatches([
    { status: 'posted', available_qty: 10 },
    { status: 'posted', available_qty: 0  },
    { status: 'held',   available_qty: 5  }
  ]);
  const result = await caller.queries.inventoryTabs({ status: 'posted', availableQty: 'positive' });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].availableQty).toBe(10);
});

it('blanks unitCost for operator', async () => {
  const operatorCaller = await callerFor({ role: 'operator' });
  await seedBatches([{ status: 'posted', unit_cost: 99 }]);
  const result = await operatorCaller.queries.inventoryTabs({ status: 'posted' });
  expect(result.rows[0].unitCost).toBeNull();
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.inventoryTabs({ status: 'archived' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.inventoryTabs({ status: 'posted' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Row shape matches `gridSql('inventory')` column-for-column.
- [ ] AC-4: `unitCost` blanked for sub-manager actors.
- [ ] AC-5: Single SQL statement per call.
- [ ] AC-6: §7 tests pass.
