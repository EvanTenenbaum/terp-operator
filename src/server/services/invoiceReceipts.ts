import type { Pool } from 'pg';
import { logger } from './logger';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { invoice } from './projections/invoice';
import type { Audience, InvoiceInput } from './projections/types';

/**
 * Issue #113 Phase 3 — best-effort post-commit hook for `postSalesOrder`.
 *
 * Snapshot identity:
 *   kind             = 'invoice'
 *   sourceEntityType = 'invoice'
 *   sourceEntityId   = invoice.id  (NOT the sales order id)
 */
export async function createInvoiceReceipts(
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
      logger.warn('Sales order not found at post-commit time; skipping snapshot.', { module: 'invoiceReceipts', salesOrderId });
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

    const invRes = await pool.query(
      `SELECT id, invoice_no, customer_id, order_id, total, due_date, created_at
         FROM invoices
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [salesOrderId]
    );
    const inv = invRes.rows[0] as {
      id: string; invoice_no: string; customer_id: string | null;
      order_id: string; total: string; due_date: Date; created_at: Date;
    } | undefined;
    if (!inv) {
      logger.warn('No invoice row found for sales order; skipping snapshot.', { module: 'invoiceReceipts', salesOrderId });
      return;
    }

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
    const input: InvoiceInput = {
      customerName: so.customer_name ?? 'Unknown customer',
      soNo: so.order_no,
      dateISO: inv.created_at.toISOString(),
      externalNotes: so.notes ?? undefined,
      internalNotes: undefined,
      subtotal,
      total: Number(inv.total),
      invoiceNo: inv.invoice_no,
      dueDateISO: inv.due_date.toISOString(),
      lines
    };

    await emitSnapshot(pool, 'external', input, inv.id, commandId, userId);
    await emitSnapshot(pool, 'internal', input, inv.id, commandId, userId);
  } catch (err) {
    logger.warn('Receipt creation failed (non-fatal)', { module: 'invoiceReceipts', error: err instanceof Error ? err.message : String(err) });
  }
}

async function emitSnapshot(
  pool: Pool, audience: Audience, input: InvoiceInput,
  invoiceId: string, commandId: string, userId: string
): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots
      WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3
        AND status = 'finalized' AND voided_at IS NULL
        AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL)
      LIMIT 1`,
    ['invoice', invoiceId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload = audience === 'external'
    ? invoice.external(input)
    : invoice.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'invoice',
    sourceEntityType: 'invoice',
    sourceEntityId: invoiceId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: invoice.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
