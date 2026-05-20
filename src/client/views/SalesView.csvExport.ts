import type { GridRow } from '../../shared/types';

// UX-A2 (#15): Customer-facing offer export must NOT include any
// internal-only columns (unit cost, internal margin, landed cost) and
// must SKIP rows that are not customer-share-ready (media not yet
// finalised — typically `mediaStatus !== 'done'/'ready'`).

// Customer-safe columns only. Note that `unitCost`, `landedCostBasis`,
// `internalMargin`, `estimatedMargin`, etc. are deliberately omitted.
const CUSTOMER_OFFER_HEADERS = ['itemName', 'qty', 'unitPrice', 'sourceRowKey'] as const;

export function isCustomerShareReady(value: unknown): boolean {
  if (value == null) return false;
  return ['done', 'ready'].includes(String(value).toLowerCase());
}

function csvValue(value: unknown): string {
  const raw = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/**
 * Build the customer-facing offer CSV string.
 * - Skips rows where mediaStatus is not customer-share-ready.
 * - Only emits customer-safe columns (no cost/margin).
 */
export function buildCustomerOfferCsv(rows: readonly GridRow[]): string {
  const shareReady = rows.filter((row) => isCustomerShareReady(row.mediaStatus));
  const header = CUSTOMER_OFFER_HEADERS.join(',');
  const body = shareReady
    .map((row) => CUSTOMER_OFFER_HEADERS.map((field) => csvValue(row[field as keyof GridRow])).join(','))
    .join('\n');
  return body.length ? `${header}\n${body}` : header;
}
