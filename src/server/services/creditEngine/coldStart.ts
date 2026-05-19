export interface ColdStartConfig {
  minPostedInvoices: number;
  minTenureDays: number;
}

export interface ColdStartInput {
  postedInvoiceCount: number;
  tenureDays: number;
  computedBase: number;
  config: ColdStartConfig;
}

export function isColdStartReady(input: ColdStartInput): boolean {
  if (input.postedInvoiceCount < 0 || input.tenureDays < 0 || input.computedBase < 0) {
    throw new Error('cold-start inputs must be non-negative');
  }
  return (
    input.postedInvoiceCount >= input.config.minPostedInvoices &&
    input.tenureDays >= input.config.minTenureDays &&
    input.computedBase > 0
  );
}
