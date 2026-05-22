import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { paymentReceived } from './projections/paymentReceived';
import type { Audience, PaymentReceivedInput } from './projections/types';

export async function createPaymentReceivedReceipts(pool: Pool, paymentId: string, commandId: string, userId: string): Promise<void> {
  try {
    const payRes = await pool.query(
      `SELECT p.id, p.amount, p.reference, p.method, p.notes, p.created_at,
              c.name AS customer_name
         FROM payments p
         LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.id = $1
        LIMIT 1`,
      [paymentId]
    );
    const pay = payRes.rows[0] as { id: string; amount: string; reference: string | null; method: string; notes: string | null; created_at: Date; customer_name: string | null; } | undefined;
    if (!pay) { console.warn(`[paymentReceivedReceipts] payment ${paymentId} not found; skipping snapshot.`); return; }
    const input: PaymentReceivedInput = {
      customerName: pay.customer_name ?? 'Unknown customer',
      paymentRef: pay.reference ?? pay.id,
      dateISO: pay.created_at.toISOString(),
      amount: Number(pay.amount),
      internalReconciliationNotes: pay.notes ?? undefined
    };
    await emitSnapshot(pool, 'external', input, paymentId, commandId, userId);
    await emitSnapshot(pool, 'internal', input, paymentId, commandId, userId);
  } catch (err) { console.warn('[paymentReceivedReceipts] receipt creation failed (non-fatal):', err instanceof Error ? err.message : err); }
}

async function emitSnapshot(pool: Pool, audience: Audience, input: PaymentReceivedInput, paymentId: string, commandId: string, userId: string): Promise<void> {
  const liveRes = await pool.query(
    `SELECT id FROM document_snapshots WHERE source_entity_type = $1 AND source_entity_id = $2 AND audience = $3 AND status = 'finalized' AND voided_at IS NULL AND id NOT IN (SELECT supersedes_id FROM document_snapshots WHERE supersedes_id IS NOT NULL) LIMIT 1`,
    ['payment', paymentId, audience]
  );
  const existingLiveId = (liveRes.rows[0] as { id: string } | undefined)?.id;
  const payload = audience === 'external' ? paymentReceived.external(input) : paymentReceived.internal(input);
  const { id } = await createDraftSnapshot(pool, { kind: 'payment_received', sourceEntityType: 'payment', sourceEntityId: paymentId, commandId, audience, payload: payload as unknown as Record<string, unknown>, projectionVersion: paymentReceived.projectionVersion, createdBy: userId, supersedesId: existingLiveId });
  await finalizeSnapshot(pool, { id, finalizedBy: userId });
}
