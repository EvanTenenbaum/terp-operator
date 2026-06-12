/**
 * UX-F01 — "Copy offer" helper for the sheet preview panel.
 *
 * Builds a customer-safe text block from sheet rows.
 * Reuses the catalog-mode column gating: NEVER includes
 * cost, margin, internal notes, or any forbidden field.
 */
import type { GridRow } from '../../shared/types';
import { getCatalogHeaders } from '../utils/salesExport';

/**
 * Fields that must NEVER appear in customer-facing offer text.
 * Mirrors the diff between INTERNAL_HEADERS and CATALOG_HEADERS in
 * salesExport.ts, plus additional PII/internal fields.
 */
export const OFFER_FORBIDDEN_FIELDS: readonly string[] = [
  'unitCost',
  'internalMargin',
  'estimatedMargin',
  'landedCostBasis',
  'reason',
  'notes',
  'vendor',
  'vendorApproval',
  'unitCostWithLanded',
] as const;

/**
 * Build a customer-safe plain-text offer block from sheet rows.
 *
 * Each row is formatted as a short line: "Name — Qty available · $Price".
 * Only catalog-safe fields (batchCode, name, category, availableQty,
 * unitPrice, tags) are used; forbidden fields are never read.
 *
 * The caller is responsible for writing this to the clipboard and showing a
 * toast ("Copied — internal columns excluded.").
 */
export function buildOfferText(rows: readonly GridRow[]): string {
  if (rows.length === 0) return '';

  // Verify at build time that getCatalogHeaders() never returns a forbidden field.
  // This is a belt-and-suspenders guard; the real gate is the explicit field list below.
  const catalogHeaders = getCatalogHeaders();
  const safeCatalogHeaders = catalogHeaders.filter(
    (h) => !OFFER_FORBIDDEN_FIELDS.map((f) => f.toLowerCase()).includes(h.toLowerCase())
  );

  if (safeCatalogHeaders.length === 0) {
    // Fallback: use the minimal safe set if catalog headers were somehow all forbidden.
    return rows
      .map((row) => {
        const name = row['name'] ? String(row['name']) : '';
        const qty = row['availableQty'] != null ? String(row['availableQty']) : '';
        const price = row['unitPrice'] != null ? `$${String(row['unitPrice'])}` : '';
        return [name, qty && `${qty} available`, price].filter(Boolean).join(' — ');
      })
      .join('\n');
  }

  return rows
    .map((row) => {
      const name = row['name'] ? String(row['name']) : row['batchCode'] ? String(row['batchCode']) : 'Item';
      const qty = row['availableQty'] != null ? `${String(row['availableQty'])} available` : null;
      const price = row['unitPrice'] != null ? `$${String(row['unitPrice'])}` : null;
      const category = row['category'] ? String(row['category']) : null;
      const parts = [name, category, qty, price].filter(Boolean);
      return parts.join(' — ');
    })
    .join('\n');
}
