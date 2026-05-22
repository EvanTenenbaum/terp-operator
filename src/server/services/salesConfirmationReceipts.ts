import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { salesConfirmation } from './projections/salesConfirmation';
import type { Audience, SalesConfirmationInput } from './projections/types';

/**
 * Issue #113 Phase 3 — best-effort post-commit hook for `confirmSalesOrder`.
 *
 * Runs AFTER the SO transaction has committed. Re-queries the SO + lines +
 * customer via the raw `pg` Pool because the snapshot service manages its
 * own BEGIN/COMMIT with advisory locks.
 *
 * Snapshot identity:
 *   kind             = 'sales_confirmation'
 *   sourceEntityType = 'sales_order'
 *   sourceEntityId   = salesOrderId
 *
 * Failure is non-fatal: errors are caught and logged; the confirmSalesOrder
 * command result is never affected.
 */
export async function createSalesConfirmationReceipts(
  pool: Pool,
  salesOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    const soRes = await pool.query(
      `SELECT so.id, so.order_no, so.customer_id, so.total, so.notes,
              c.name AS customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
        WHERE so.id = $1
        LIMIT 1`,
      [salesOrderId]
    );
    const so = soRes.rows[0] as {
      id: string; order_no: string; customer_id: string | null;
      total: string; notes: string | null; customer_name: string | null;
    } | undefined;
    if (!so) {
      console.warn(`[salesConfirmationReceipts] sales order ${salesOrderId} not found at post-commit time; skipping snapshot.`);
      return;
    }

    const linesRes = await pool.query(
      `SELECT id, item_name, display_name, qty, unit_price, unit_cost,
              unit_cost_resolved, source_row_key, unresolved_source_text,
              legacy_status_marker
         FROM sales_order_lines
        WHERE order_id = $1
        ORDER BY created_at`,
      [salesOrderId]
    );
    const lineRows = linesRes.rows as Array<{
      id: string; item_name: string; display_name: string | null;
      qty: string; unit_price: string; unit_cost: string;
      unit_cost_resolved: boolean; source_row_key: string | null;
      unresolved_source_text: string | null; legacy_status_marker: string | null;
    }>;

    const dateISO = new Date().toISOString();
    const lines = lineRows.map((l) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      const unitCost = Number(l.unit_cost);
      const subtotal = qty * unitPrice;
      const internalMargin = (unitPrice - unitCost) * qty;
      return {
        productName: l.display_name ?? l.item_name,
        qty,
        unitPrice,
        subtotal,
        externalNotes: undefined,
        internalMargin,
        unitCost,
        unitCostResolved: l.unit_cost_resolved,
        sourceRowKey: l.source_row_key ?? undefined,
        legacyMarker: l.legacy_status_marker ?? undefined,
        candidateSourceText: l.unresolved_source_text ?? undefined
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
    const input: SalesConfirmationInput = {
      customerName: so.customer_name ?? 'Unknown customer',
      soNo: so.order_no,
      dateISO,
      externalNotes: so.notes ?? undefined,
      internalNotes: undefined,
      subtotal,
      total: Number(so.total),
      lines
    };

    await emitSnapshot(pool, 'external', input, salesOrderId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, salesOrderId, commandId, userId);
  } catch (err) {
    console.warn('[salesConfirmationReceipts] receipt creation failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function emitSnapshot(
  pool: Pool, audience: Audience, input: SalesConfirmationInput,
  salesOrderId: string, commandId: string, userId: string
): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots
      WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3
        AND status = 'finalized' AND voided_at IS NULL
        AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL)
      LIMIT 1`,
    ['sales_order', salesOrderId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload = audience === 'external'
    ? salesConfirmation.external(input)
    : salesConfirmation.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'sales_confirmation',
    sourceEntityType: 'sales_order',
    sourceEntityId: salesOrderId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: salesConfirmation.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
