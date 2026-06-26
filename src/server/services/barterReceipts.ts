import type { Pool } from 'pg';
import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { barterSettlements, barterSettlementLines } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { logger } from './logger';

/**
 * Generates document snapshots for a barter settlement.
 * Runs post-commit using pool-level db (not tx) — same pattern as
 * createInvoiceReceipts / createPaymentReceivedReceipts / createVendorPayoutReceipts.
 *
 * Internal receipt: full audit record with cost basis, gain/loss, batch refs.
 * External receipt: counterparty-facing summary.
 */
export async function createBarterReceipts(
  pool: Pool,
  settlementId: string,
  commandId: string,
  userId: string
): Promise<void> {
  try {
    const [settlement] = await db.select().from(barterSettlements).where(eq(barterSettlements.id, settlementId)).limit(1);
    if (!settlement) return;

    const lines = await db.select().from(barterSettlementLines).where(eq(barterSettlementLines.settlementId, settlementId));

    // Internal receipt — full audit record.
    const receiptData = {
      settlementNo: settlement.settlementNo,
      direction: settlement.direction,
      counterpartyType: settlement.counterpartyType,
      settlementAmount: settlement.settlementAmount,
      costBasis: settlement.costBasis,
      gainLoss: settlement.gainLoss,
      valueOverridden: settlement.valueOverridden,
      lineCount: lines.length,
      lines: lines.map(l => ({
        batchId: l.batchId,
        productName: l.productName,
        qty: l.qty,
        unitCost: l.unitCost,
        lineSettlementAmount: l.lineSettlementAmount,
      })),
      createdAt: new Date().toISOString(),
    };

    const { id: internalId } = await createDraftSnapshot(pool, {
      kind: 'barter_settlement',
      sourceEntityType: 'barter_settlement',
      sourceEntityId: settlementId,
      commandId,
      audience: 'internal',
      payload: receiptData as Record<string, unknown>,
      projectionVersion: 1,
      createdBy: userId,
    });
    await finalizeSnapshot(pool, { id: internalId, finalizedBy: userId });

    // External receipt — counterparty-facing summary.
    const externalData = {
      type: 'barter_settlement',
      settlementNo: settlement.settlementNo,
      direction: settlement.direction,
      amount: settlement.settlementAmount,
      counterpartyType: settlement.counterpartyType,
      note: settlement.direction === 'inbound'
        ? `Product accepted as payment — $${settlement.settlementAmount} applied`
        : `Product issued as payment — $${settlement.settlementAmount} settled`,
    };

    const { id: externalId } = await createDraftSnapshot(pool, {
      kind: 'barter_settlement',
      sourceEntityType: 'barter_settlement',
      sourceEntityId: settlementId,
      commandId,
      audience: 'external',
      payload: externalData as Record<string, unknown>,
      projectionVersion: 1,
      createdBy: userId,
    });
    await finalizeSnapshot(pool, { id: externalId, finalizedBy: userId });
  } catch (err) {
    logger.warn(`Barter receipt generation failed (non-fatal): ${err}`);
  }
}
