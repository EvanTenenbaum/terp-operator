/**
 * Customer Purchase History filter (#61).
 *
 * Free-text search across product alias, canonical product, vendor,
 * payment terms, and payment status. Whitespace-separated terms are
 * AND-combined (every term must appear somewhere in the haystack).
 */

export interface PurchaseHistoryRow {
  id: string;
  orderId: string;
  orderNo: string;
  itemAlias: string | null;
  itemName: string;
  vendor: string | null;
  unitPrice: string | number | null;
  qty: string | number | null;
  paymentTerms: string | null;
  paymentStatus: string | null;
  createdAt: string;
  // Extra optional fields the server may include for tooltips/labels
  displayName?: string | null;
  batchCode?: string | null;
  category?: string | null;
}

function haystackFor(row: PurchaseHistoryRow): string {
  return [
    row.itemAlias,
    row.itemName,
    row.displayName,
    row.batchCode,
    row.vendor,
    row.category,
    row.paymentTerms,
    row.paymentStatus,
    row.orderNo
  ]
    .map((value) => (value == null ? '' : String(value)))
    .join(' ')
    .toLowerCase();
}

export function filterPurchaseHistory(
  rows: ReadonlyArray<PurchaseHistoryRow>,
  query: string
): PurchaseHistoryRow[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...rows];
  return rows.filter((row) => {
    const haystack = haystackFor(row);
    return terms.every((term) => haystack.includes(term));
  });
}
