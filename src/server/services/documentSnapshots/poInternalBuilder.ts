import type { PurchaseOrder, Vendor } from '../../schema';
import type { purchaseOrderLines } from '../../schema';

type PurchaseOrderLineRow = typeof purchaseOrderLines.$inferSelect;

export interface BuildPurchaseOrderInternalPayloadInput {
  purchaseOrder: PurchaseOrder;
  vendor: Vendor | null;
  lines: PurchaseOrderLineRow[];
}

const toNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function buildPurchaseOrderInternalPayload(input: BuildPurchaseOrderInternalPayloadInput): Record<string, unknown> {
  const { purchaseOrder: po, vendor, lines } = input;
  return {
    poNo: po.poNo,
    vendorId: po.vendorId,
    vendorName: vendor?.name ?? null,
    vendorAlias: vendor?.alias ?? null,
    status: po.status,
    expectedDate: po.expectedDate ? new Date(po.expectedDate).toISOString() : null,
    orderedAt: po.orderedAt ? new Date(po.orderedAt).toISOString() : null,
    finalizedAt: po.finalizedAt ? new Date(po.finalizedAt).toISOString() : null,
    paymentTerms: po.paymentTerms,
    prepaymentAmount: toNumber(po.prepaymentAmount),
    total: toNumber(po.total),
    buyerNotes: po.buyerNotes ?? null,
    internalNotes: po.internalNotes ?? null,
    externalNotes: po.externalNotes ?? null,
    refereeRelationshipId: po.refereeRelationshipId ?? null,
    refereeCreditAmount: toNullableNumber(po.refereeCreditAmount),
    lines: lines.map((line) => ({
      id: line.id,
      purchaseOrderId: line.purchaseOrderId,
      itemId: line.itemId,
      productName: line.productName,
      category: line.category,
      tags: line.tags ?? [],
      qty: toNumber(line.qty),
      receivedQty: toNumber(line.receivedQty),
      uom: line.uom,
      unitCost: toNumber(line.unitCost),
      unitPrice: toNumber(line.unitPrice),
      costRangeLow: toNullableNumber(line.costRangeLow),
      costRangeHigh: toNullableNumber(line.costRangeHigh),
      sourceCode: line.sourceCode ?? null,
      shorthand: line.shorthand ?? null,
      legacyMarker: line.legacyMarker ?? null,
      ownershipStatus: line.ownershipStatus,
      notes: line.notes ?? null,
      internalNotes: line.internalNotes ?? null,
      externalNotes: line.externalNotes ?? null,
      status: line.status
    }))
  };
}
