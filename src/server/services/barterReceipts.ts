import type { Tx } from '@/server/db';
import { barterSettlements, barterSettlementLines } from '@/server/schema';
import { eq } from 'drizzle-orm';

/**
 * Generates document snapshots for a barter settlement.
 * 
 * Internal receipt: full audit record with cost basis, gain/loss, batch refs, counterparty.
 * External receipt: counterparty-facing summary — "Product accepted as payment — $X applied."
 * 
 * Follows the existing documentSnapshots pattern (internal + external audience).
 */
export async function createBarterReceipts(tx: Tx, settlementId: string) {
  const [settlement] = await tx.select().from(barterSettlements).where(eq(barterSettlements.id, settlementId)).limit(1);
  if (!settlement) return null;
  
  const lines = await tx.select().from(barterSettlementLines).where(eq(barterSettlementLines.settlementId, settlementId));
  
  // Build receipt data
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
  // The existing createInvoiceReceipts / createPaymentReceivedReceipts hooks
  // use documentSnapshots.insert(); follow that pattern once confirmed.
  
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
}
