import { db } from '@/server/db';
import { barterSettlements, barterSettlementLines } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Generates document snapshots for a barter settlement.
 * Runs post-commit using pool-level db (not tx) — same pattern as
 * createInvoiceReceipts / createPaymentReceivedReceipts / createVendorPayoutReceipts.
 *
 * Internal receipt: full audit record with cost basis, gain/loss, batch refs.
 * External receipt: counterparty-facing summary.
 */
export async function createBarterReceipts(settlementId: string) {
  try {
    const [settlement] = await db.select().from(barterSettlements).where(eq(barterSettlements.id, settlementId)).limit(1);
    if (!settlement) return null;

    const lines = await db.select().from(barterSettlementLines).where(eq(barterSettlementLines.settlementId, settlementId));

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

    // TODO: Insert into document_snapshots table when pattern is finalized.

    return {
      internal: receiptData,
      external: {
        type: 'barter_settlement',
        settlementNo: settlement.settlementNo,
        direction: settlement.direction,
        amount: settlement.settlementAmount,
        counterpartyType: settlement.counterpartyType,
        note: settlement.direction === 'inbound'
          ? `Product accepted as payment — $${settlement.settlementAmount} applied`
          : `Product issued as payment — $${settlement.settlementAmount} settled`,
      },
    };
  } catch (err) {
    logger.warn(`Barter receipt generation failed (non-fatal): ${err}`);
    return null;
  }
}
