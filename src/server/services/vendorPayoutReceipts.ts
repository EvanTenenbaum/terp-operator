import type { Pool } from 'pg';
import { logger } from './logger';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { vendorPayout } from './projections/vendorPayout';
import type { Audience, VendorPayoutInput } from './projections/types';

export async function createVendorPayoutReceipts(pool: Pool, vendorPaymentId: string, commandId: string, userId: string): Promise<void> {
  try {
    const vpRes = await pool.query(
      `SELECT vp.id, vp.amount, vp.reference, vp.method, vp.created_at,
              v.name AS vendor_name, vb.discrepancy_notes AS discrepancy_notes
         FROM vendor_payments vp
         LEFT JOIN vendor_bills vb ON vb.id = vp.vendor_bill_id
         LEFT JOIN vendors v ON v.id = vb.vendor_id
        WHERE vp.id = $1
        LIMIT 1`,
      [vendorPaymentId]
    );
    const vp = vpRes.rows[0] as { id: string; amount: string; reference: string | null; method: string; created_at: Date; vendor_name: string | null; discrepancy_notes: string | null; } | undefined;
    if (!vp) { logger.warn('Vendor payment not found; skipping snapshot.', { module: 'vendorPayoutReceipts', vendorPaymentId }); return; }
    const input: VendorPayoutInput = {
      vendorName: vp.vendor_name ?? 'Unknown vendor',
      payoutRef: vp.reference ?? vp.id,
      dateISO: vp.created_at.toISOString(),
      amount: Number(vp.amount),
      internalReconciliationNotes: vp.discrepancy_notes ?? undefined
    };
    await emitSnapshot(pool, 'external', input, vendorPaymentId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, vendorPaymentId, commandId, userId);
  } catch (err) { logger.warn('Receipt creation failed (non-fatal)', { module: 'vendorPayoutReceipts', error: err instanceof Error ? err.message : String(err) }); }
}

async function emitSnapshot(pool: Pool, audience: Audience, input: VendorPayoutInput, vendorPaymentId: string, commandId: string, userId: string): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3 AND status = 'finalized' AND voided_at IS NULL AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL) LIMIT 1`,
    ['vendor_payment', vendorPaymentId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;
  const payload = audience === 'external' ? vendorPayout.external(input) : vendorPayout.internal(input);
  const { id } = await createDraftSnapshot(pool, { kind: 'vendor_payout', sourceEntityType: 'vendor_payment', sourceEntityId: vendorPaymentId, commandId, audience, payload: payload as unknown as Record<string, unknown>, projectionVersion: vendorPayout.projectionVersion, createdBy: userId, supersedesId: existingLiveId });
  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
