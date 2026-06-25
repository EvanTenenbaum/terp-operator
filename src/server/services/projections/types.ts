export type SnapshotKind =
  | 'purchase_finalization'
  | 'sales_confirmation'
  | 'invoice'
  | 'payment_received'
  | 'vendor_payout'
  | 'barter_settlement';

export type Audience = 'external' | 'internal';

export type SourceEntityType =
  | 'purchase_order'
  | 'sales_order'
  | 'invoice'
  | 'payment'
  | 'vendor_payment'
  | 'barter_settlement';

export interface ReceiptHeader {
  title: string;
  counterparty: string;
  dateISO: string;
  documentNo: string;
}

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPrice?: number;
  subtotal: number;
  notes?: string;
}

export interface ReceiptTotals {
  subtotal: number;
  adjustments?: number;
  total: number;
}

export interface ExternalReceiptProjection {
  kind: SnapshotKind;
  header: ReceiptHeader;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  footer?: { terms?: string; reference?: string };
  projectionVersion: number;
  readonly __EXTERNAL_PROJECTED__: true;
}

export interface InternalReceiptProjection
  extends Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'> {
  internalNotes?: string;
  cogs?: { perLine: Array<{ name: string; unitCost?: number; landedCost?: number }>; total: number };
  margin?: { perLine: Array<{ name: string; marginAbs: number; marginPct: number }>; total: number };
  diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
  readonly __INTERNAL_ONLY__: true;
}

export interface Projector<TInput> {
  external: (input: TInput) => Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'>;
  internal: (input: TInput) => Omit<InternalReceiptProjection, '__INTERNAL_ONLY__'>;
  projectionVersion: number;
}

// Per-kind input types. Declared centrally so projector files import them
// instead of redefining shape locally. Each kind's projector file is the
// owner of further nesting / required-field detail; this file is the
// public contract surface the service layer codes against.
export interface PurchaseFinalizationInput {
  vendorName: string;
  poNo: string;
  dateISO: string;
  internalNotes?: string;
  externalNotes?: string;
  subtotal: number;
  total: number;
  lines: Array<{
    productName: string;
    qty: number;
    unitPrice?: number;
    subtotal: number;
    externalNotes?: string;
    internalNotes?: string;
    landedCost?: number;
    margin?: { abs: number; pct: number };
    diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
  }>;
}

export interface SalesConfirmationInput {
  customerName: string;
  soNo: string;
  dateISO: string;
  internalNotes?: string;
  externalNotes?: string;
  subtotal: number;
  total: number;
  lines: Array<{
    productName: string;
    qty: number;
    unitPrice?: number;
    subtotal: number;
    externalNotes?: string;
    internalMargin?: number;
    unitCost?: number;
    unitCostResolved?: boolean;
    sourceRowKey?: string;
    legacyMarker?: string;
    candidateSourceText?: string;
  }>;
}

export interface InvoiceInput extends SalesConfirmationInput {
  invoiceNo: string;
  dueDateISO: string;
}

// Phase 1 stubs. Real field lists pin in Phase 4 (spec §11 Q7).
export interface PaymentReceivedInput {
  customerName: string;
  paymentRef: string;
  dateISO: string;
  amount: number;
  internalReconciliationNotes?: string;
}

export interface VendorPayoutInput {
  vendorName: string;
  payoutRef: string;
  dateISO: string;
  amount: number;
  internalReconciliationNotes?: string;
}
