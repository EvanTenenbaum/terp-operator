import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

/**
 * Inventory query router.
 *
 * Domain: inventory / batch / intake queries. Extracted from queries.ts
 * during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const inventoryRouter = router({
  receiptPreview: protectedProcedure
    .input(z.object({ batchIds: z.array(z.string().uuid()).min(1) }))
    .query(async ({ input }) => {
      const rows = (
        await pool.query(
          `select b.id, b.batch_code as "batchCode", b.name, b.vendor_id as "vendorId", v.name as vendor,
                  b.intake_qty as "intakeQty", b.unit_cost as "unitCost", b.status, b.intake_date as "intakeDate",
                  b.ownership_status as "ownershipStatus", b.legacy_marker as "legacyMarker",
                  (b.intake_qty * b.unit_cost) as subtotal
           from batches b
           left join vendors v on v.id = b.vendor_id
           where b.id = any($1::uuid[])
           order by b.created_at`,
          [input.batchIds]
        )
      ).rows;
      const vendorIds = new Set(rows.map((row) => row.vendorId).filter(Boolean));
      const statuses = new Set(rows.map((row) => row.status));
      const total = rows.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
      const conflicts: string[] = [];
      if (rows.length !== input.batchIds.length) conflicts.push('One or more selected rows no longer exists.');
      if (vendorIds.size !== 1) conflicts.push('Selected rows must share one vendor.');
      if ([...statuses].some((status) => !['draft', 'ready'].includes(String(status)))) conflicts.push('Only Draft or Ready rows can be receipted.');
      for (const row of rows) {
        if (!row.vendorId) conflicts.push(`${row.name} needs a vendor.`);
        if (Number(row.intakeQty ?? 0) <= 0) conflicts.push(`${row.name} needs intake quantity above zero.`);
        if (Number(row.unitCost ?? 0) < 0) conflicts.push(`${row.name} cannot have negative cost.`);
      }
      return { rows, total: total.toFixed(2), conflicts, ok: conflicts.length === 0, vendor: rows[0]?.vendor ?? '' };
    }),
});
