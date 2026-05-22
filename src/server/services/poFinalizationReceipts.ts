import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { purchaseFinalization } from './projections/purchaseFinalization';
import type { Audience, PurchaseFinalizationInput } from './projections/types';

/**
 * Issue #113 Phase 2 — best-effort post-commit hook for `finalizePurchaseOrder`.
 *
 * Runs AFTER the PO transaction has committed (see commandBus.ts `executeCommand`).
 * Re-queries the PO + lines + vendor via the raw `pg` Pool because the snapshot
 * service is `pg`-native (it manages its own BEGIN/COMMIT with advisory locks
 * — see documentSnapshots.ts finalizeSnapshot). Nesting it under the outer
 * drizzle tx would deadlock the advisory lock against itself.
 *
 * Failure is non-fatal: a thrown SQL error, a missing PO row, or a snapshot
 * service rejection MUST NOT cause the PO command to surface as failed. The
 * PO is already finalized in the DB before this runs.
 *
 * Handles unfinalize→re-finalize: if a live snapshot already exists for the
 * (purchase_order, id, audience) triple, the new snapshot is created with
 * supersedesId set, so the amendment chain reflects the actual operator
 * activity (spec §7).
 */
export async function createPoFinalizationReceipts(
  pool: Pool,
  purchaseOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    // 1. PO header + vendor name. Explicit columns — no SELECT *, no
    //    schema leakage (spec §6 rule 3).
    const poRes = await pool.query(
      `SELECT po.id, po.po_no, po.vendor_id, po.finalized_at, po.total,
              po.internal_notes, po.external_notes,
              v.name AS vendor_name
         FROM purchase_orders po
         LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE po.id = $1
        LIMIT 1`,
      [purchaseOrderId]
    );
    const po = poRes.rows[0] as {
      id: string;
      po_no: string;
      vendor_id: string | null;
      finalized_at: Date | null;
      total: string;
      internal_notes: string | null;
      external_notes: string | null;
      vendor_name: string | null;
    } | undefined;
    if (!po) {
      console.warn(
        `[poFinalizationReceipts] purchase order ${purchaseOrderId} not found at post-commit time; skipping snapshot.`
      );
      return;
    }

    // 2. Lines. Explicit columns again.
    const linesRes = await pool.query(
      `SELECT id, product_name, qty, unit_cost,
              external_notes, internal_notes, legacy_marker
         FROM purchase_order_lines
        WHERE purchase_order_id = $1
        ORDER BY created_at`,
      [purchaseOrderId]
    );
    const lineRows = linesRes.rows as Array<{
      id: string;
      product_name: string;
      qty: string;
      unit_cost: string;
      external_notes: string | null;
      internal_notes: string | null;
      legacy_marker: string | null;
    }>;

    // 3. Build PurchaseFinalizationInput.
    const dateISO = (po.finalized_at ?? new Date()).toISOString();
    const subtotal = lineRows.reduce(
      (sum, l) => sum + Number(l.qty) * Number(l.unit_cost),
      0
    );
    const input: PurchaseFinalizationInput = {
      vendorName: po.vendor_name ?? 'Unknown vendor',
      poNo: po.po_no,
      dateISO,
      externalNotes: po.external_notes ?? undefined,
      internalNotes: po.internal_notes ?? undefined,
      subtotal,
      total: Number(po.total),
      lines: lineRows.map((l) => {
        const qty = Number(l.qty);
        const unitCost = Number(l.unit_cost);
        return {
          productName: l.product_name,
          qty,
          unitPrice: unitCost,
          subtotal: qty * unitCost,
          externalNotes: l.external_notes ?? undefined,
          internalNotes: l.internal_notes ?? undefined,
          // Phase 2 does not surface landed cost or margin for POs — those are
          // Sales-side / Phase 3+ concerns. legacy_marker is the only PO-level
          // diagnostic available at this time.
          diagnostics: l.legacy_marker
            ? { legacyMarkers: [l.legacy_marker] }
            : undefined
        };
      })
    };

    // 4. For each audience: find the existing live head (for amendment),
    //    then createDraft + finalize.
    await emitSnapshot(pool, 'external', input, purchaseOrderId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, purchaseOrderId, commandId, userId);
  } catch (err) {
    console.warn(
      '[poFinalizationReceipts] receipt creation failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
  }
}

async function emitSnapshot(
  pool: Pool,
  audience: Audience,
  input: PurchaseFinalizationInput,
  purchaseOrderId: string,
  commandId: string,
  userId: string
): Promise<void> {
  // Look up existing live head for this (PO, audience). Live = finalized,
  // not voided, not superseded. Matches selectLiveRow in documentSnapshots.ts.
  const liveRes = await pool.query(
    `SELECT id
       FROM document_snapshots
      WHERE source_entity_type = $1
        AND source_entity_id   = $2
        AND audience           = $3
        AND status = 'finalized'
        AND voided_at IS NULL
        AND id NOT IN (
          SELECT supersedes_id FROM document_snapshots
           WHERE supersedes_id IS NOT NULL
        )
      LIMIT 1`,
    ['purchase_order', purchaseOrderId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;

  const payload =
    audience === 'external'
      ? purchaseFinalization.external(input)
      : purchaseFinalization.internal(input);

  const { id } = await createDraftSnapshot(pool, {
    kind: 'purchase_finalization',
    sourceEntityType: 'purchase_order',
    sourceEntityId: purchaseOrderId,
    commandId,
    audience,
    payload: payload as unknown as Record<string, unknown>,
    projectionVersion: purchaseFinalization.projectionVersion,
    createdBy: userId,
    supersedesId: existingLiveId
  });

  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
