export type PaymentTerms =
  | 'cod'           // Cash on Delivery
  | 'prepay'        // Prepayment required (100% upfront)
  | 'net_15'        // Net 15 days
  | 'net_30'        // Net 30 days
  | 'net_60'        // Net 60 days
  | 'net_90'        // Net 90 days
  | 'consignment'   // Consignment
  | 'vendor_terms'; // Use vendor's default termsDays

export const PAYMENT_TERMS_OPTIONS: Array<{ value: PaymentTerms; label: string }> = [
  { value: 'vendor_terms', label: 'Vendor Terms' },
  { value: 'cod', label: 'COD (Cash on Delivery)' },
  { value: 'prepay', label: 'Prepayment Required' },
  { value: 'net_15', label: 'Net 15 Days' },
  { value: 'net_30', label: 'Net 30 Days' },
  { value: 'net_60', label: 'Net 60 Days' },
  { value: 'net_90', label: 'Net 90 Days' },
  { value: 'consignment', label: 'Consignment' }
];

export function getTermsDays(paymentTerms: PaymentTerms, vendorTermsDays: number): number {
  switch (paymentTerms) {
    case 'cod':
    case 'prepay':
      return 0;
    case 'net_15':
      return 15;
    case 'net_30':
      return 30;
    case 'net_60':
      return 60;
    case 'net_90':
      return 90;
    case 'consignment':
    case 'vendor_terms':
    default:
      return vendorTermsDays;
  }
}
