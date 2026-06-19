/**
 * DerivedCogsCell — replaces lineColumns[derivedCogs].cellRenderer (SalesView.tsx:277-305).
 *
 * Renders the derived COGS value with rule-source label and range indicator.
 * Reads __rule from row data (set by useSalesLineRows). Uses pricing helpers
 * from salesPricing.ts.
 */
import { parsePriceRange } from '../../../../shared/priceRange';
import { ruleSourceLabel } from '../../../views/sales/salesPricing';
import type { GridRow } from '../../../../shared/types';
import type { resolvePricingRuleEntry } from '../../../../shared/inventoryPricingShared';

export interface DerivedCogsCellProps {
  data?: GridRow;
}

export function DerivedCogsCell(params: DerivedCogsCellProps): JSX.Element | null {
  const row = params.data;
  if (!row) return null;
  const range = parsePriceRange(row.priceRange as string | null);
  const markup = Number((row as Record<string, unknown>).markup ?? 0);
  const unitPrice = Number(row.unitPrice ?? 0);
  const rule = (row as Record<string, unknown>).__rule as ReturnType<typeof resolvePricingRuleEntry> | undefined;

  if (!range) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
        <span>${Number(row.unitCost ?? 0).toFixed(2)}</span>
        {rule ? <span style={{ fontSize: 10, color: '#71717a' }}>{ruleSourceLabel(rule.source, rule.category)}</span> : null}
      </div>
    );
  }
  if (!unitPrice) return <span style={{ color: '#71717a', fontSize: 12 }}>Set price first</span>;
  const derivedCogs = unitPrice - markup;
  const inRange = derivedCogs >= range.low && derivedCogs <= range.high;
  const rangeCheck = inRange ? '✓' : derivedCogs < range.low ? '↓ below' : '↑ above';
  const rangeColor = inRange ? '#216e4e' : '#b06915';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
      <span>${derivedCogs.toFixed(2)}</span>
      <span style={{ fontSize: 10, color: rangeColor }}>{range.low}–{range.high} {rangeCheck}</span>
      {rule ? <span style={{ fontSize: 10, color: '#71717a' }}>{ruleSourceLabel(rule.source, rule.category)}</span> : null}
    </div>
  );
}
