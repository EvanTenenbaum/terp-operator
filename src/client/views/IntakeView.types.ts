export interface IntakeBatchRow {
  id: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string | null;
  batchCode: string;
  name: string;
  itemId?: string | null;
  itemAlias?: string | null;
  category: string;
  subcategory?: string | null;
  intakeQty: string;
  availableQty: string;
  unitCost: string;
  unitPrice: string;
  uom: string;
  status: string;
  notes: string | null;
  validationIssues: string[];
  mediaStatus: string;
  arrivalStatus: string;
  vendorId: string | null;
  tags: string[];
  location: string;
  lotCode: string | null;
  expectedQty: string | null;
  expectedUnitCost: string | null;
  discrepancyReason?: string;
  createdAt: string;
}

export interface IntakeOrderRow {
  id: string;
  poNo: string;
  vendor: string | null;
  vendorId: string | null;
  status: string;
  expectedDate: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  total: string;
  expectedTotal: string;
  expectedTotalQty: string;
  receivedTotalQty: string;
  internalNotes: string | null;
  buyerNotes: string | null;
  createdAt: string;
  batches: IntakeBatchRow[];
}
