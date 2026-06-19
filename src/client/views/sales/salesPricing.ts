/**
 * SalesView pricing helpers — extracted from SalesView.tsx:158-182.
 *
 * Used by DerivedCogsCell (cell renderer), MarkupCell (valueSetter), and
 * useSalesLineRows (row enrichment). Byte-identical to the original inline
 * implementations.
 */
import { resolvePricingRuleEntry, markupDollarsFromPrice, applyPricingRule } from '../../../shared/inventoryPricingShared';
import { parsePriceRange } from '../../../shared/priceRange';
import type { GridRow, CustomerPricingRule } from '../../../shared/types';

export function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

/** Returns the rule source label shown in the COGS cell */
export function ruleSourceLabel(source: string, category?: string): string {
  if (source === 'customer-subcategory' || source === 'customer-category') return `▲ customer · ${category ?? ''}`;
  if (source === 'customer-default') return '▲ customer · default';
  if (source === 'settings-subcategory' || source === 'settings-category') return `▲ default · ${category ?? ''}`;
  if (source === 'settings-default') return '▲ default';
  return '▲ fallback 30%';
}

/** Compute markup dollars and derived COGS for a line row.
 *  Fixed COGS: markup = applyPricingRule(unitCost, rule) - unitCost
 *  Range COGS: markup = markupDollarsFromPrice(unitPrice, rule) */
export function computeLineMarkup(
  row: GridRow,
  rule: ReturnType<typeof resolvePricingRuleEntry>
): { markupDollars: number; derivedCogs: number; isRange: boolean; rangeLow?: number; rangeHigh?: number } {
  const range = parsePriceRange(row.priceRange as string | null);
  const unitPrice = Number(row.unitPrice ?? 0);
  const unitCost = Number(row.unitCost ?? 0);
  if (range) {
    const markup = markupDollarsFromPrice(unitPrice, rule);
    return { markupDollars: markup, derivedCogs: unitPrice - markup, isRange: true, rangeLow: range.low, rangeHigh: range.high };
  }
  const markup = Math.max(0, applyPricingRule(unitCost, rule) - unitCost);
  return { markupDollars: markup, derivedCogs: unitCost, isRange: false };
}
