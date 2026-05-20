import type { CustomerPricingRule, PricingRuleApplication } from './types';
import { parsePriceRange } from './priceRange';
import { applyPricingRule, resolvePricingRuleEntry } from './inventoryPricingShared';

export function asCustomerPricingRule(value: unknown): CustomerPricingRule | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!v.default && !v.categories) return null;
  return v as CustomerPricingRule;
}

export interface InventoryUnitPriceInput {
  unitCost: number | string | null | undefined;
  priceRange?: string | null;
  category?: string | null;
  customerRule?: CustomerPricingRule | null;
  defaultsRule?: CustomerPricingRule | null;
}

export interface InventoryUnitPriceResult {
  unitPrice: number;
  rule: PricingRuleApplication;
  basisCost: number;
  source: 'pricing-rule';
}

/**
 * Compute inventory display unit price using the pricing rule cascade.
 * - Uses customer-specific rule when a customer context exists, otherwise system default.
 * - Falls back to 30% if nothing is configured (guaranteed non-zero markup when cost > 0).
 * - Uses landed/unit cost as the basis; when a priceRange is present and unitCost is 0 or
 *   missing, we fall back to the range midpoint so price never collapses to 0 on a
 *   malformed unit cost field.
 */
export function computeInventoryUnitPrice(input: InventoryUnitPriceInput): InventoryUnitPriceResult {
  const rule = resolvePricingRuleEntry(input.customerRule ?? null, input.defaultsRule ?? null, input.category ?? null);
  const basisCost = resolveBasisCost(input.unitCost, input.priceRange);
  const unitPrice = applyPricingRule(basisCost, rule);
  return { unitPrice, rule, basisCost, source: 'pricing-rule' };
}

function resolveBasisCost(unitCost: number | string | null | undefined, priceRange: string | null | undefined): number {
  const numeric = Number(unitCost);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const range = parsePriceRange(priceRange ?? null);
  if (range) return (range.low + range.high) / 2;
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return 0;
}

/**
 * Format inventory unit cost display. Returns a range string when a well-formed
 * priceRange exists (e.g. "30-50"), otherwise the single unit cost.
 */
export function formatInventoryUnitCost(input: { unitCost?: number | string | null; priceRange?: string | null }): string {
  const range = parsePriceRange(input.priceRange ?? null);
  if (range) {
    return `$${moneyish(range.low)}–$${moneyish(range.high)}`;
  }
  const numeric = Number(input.unitCost ?? 0);
  return `$${moneyish(numeric)}`;
}

function moneyish(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

/**
 * Numeric sort/export value for inventory unit cost.
 * Prefers the range midpoint when a well-formed priceRange exists, otherwise the numeric unitCost.
 * Returned value drives column sorting and CSV export; the display string still comes from
 * formatInventoryUnitCost so users see "$30–$50" while the grid sorts by 40.
 */
export function inventoryUnitCostSortValue(input: { unitCost?: number | string | null; priceRange?: string | null }): number {
  const range = parsePriceRange(input.priceRange ?? null);
  if (range) return (range.low + range.high) / 2;
  const numeric = Number(input.unitCost ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
