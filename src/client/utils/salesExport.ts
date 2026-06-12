/**
 * Sales export helpers for TERP Operator.
 *
 * Issue #63: customer-facing catalog exports must NEVER contain cost, margin,
 * or other internal operator fields regardless of the showMargin toggle state.
 * The show/hide toggle only affects on-screen columns, not what is exported to
 * customers.
 */
import type { GridRow } from '../../shared/types';

/** Convert a cell value to a CSV-safe string. */
export function csvValue(value: unknown): string {
  const raw = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/**
 * Headers for customer-facing catalog exports.
 * Must NEVER include cost, margin, or other internal fields.
 */
const CATALOG_HEADERS: readonly string[] = [
  'batchCode',
  'name',
  'category',
  'availableQty',
  'unitPrice',
  'tags'
];

/**
 * Headers for internal/operator sheets.
 * Includes cost and margin data for operator use only.
 */
const INTERNAL_HEADERS: readonly string[] = [
  'batchCode',
  'name',
  'category',
  'vendor',
  'availableQty',
  'unitPrice',
  'unitCost',
  'estimatedMargin',
  'tags',
  'reason',
  // UX-F12 — below-floor exception annotation (OPEN-04/JY-06). The captured
  // reason rides the INTERNAL sheet only; it must NEVER join CATALOG_HEADERS
  // (customer-facing). Regression-pinned in salesExport.ux-f12.test.ts.
  'belowFloorReason'
];

/** Returns the customer-safe catalog export headers. */
export function getCatalogHeaders(): string[] {
  return [...CATALOG_HEADERS];
}

/** Returns the internal/operator export headers (includes cost and margin). */
export function getInternalHeaders(): string[] {
  return [...INTERNAL_HEADERS];
}

/**
 * Build a CSV string from rows using the correct header set for the given mode.
 * 'catalog' → customer-safe headers (no cost/margin).
 * 'internal' → operator headers (includes cost/margin by default).
 *
 * For internal exports, `options.showMargin: false` omits cost/margin columns.
 */
export function buildSheetCsv(
  rows: GridRow[],
  mode: 'catalog' | 'internal',
  options?: { showMargin?: boolean }
): string {
  const showMargin = options?.showMargin ?? true;
  let headers = mode === 'catalog' ? getCatalogHeaders() : getInternalHeaders();
  if (mode === 'internal' && !showMargin) {
    headers = headers.filter((h) => !/cost|margin/i.test(h));
  }
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) => headers.map((h) => csvValue(row[h])).join(','));
  return [headerLine, ...dataLines].join('\n');
}
