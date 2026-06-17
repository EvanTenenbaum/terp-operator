/**
 * MarkupCell — replaces lineColumns[markup].cellRenderer + valueFormatter + valueSetter
 * (SalesView.tsx:228-251).
 *
 * Exports the renderer, valueFormatter, and valueSetter for the AG Grid
 * markup column. The valueSetter preserves the range-flow vs fixed-flow
 * branching byte-identical to the original.
 */
import { parsePriceRange } from '../../../../shared/priceRange';
import type { GridRow } from '../../../../shared/types';
import type { ValueSetterParams } from 'ag-grid-community';

export interface MarkupCellProps {
  value: unknown;
  data?: GridRow;
}

export function MarkupCell(params: MarkupCellProps): JSX.Element {
  return <span>{params.value != null ? `$${Number(params.value).toFixed(2)}` : '—'}</span>;
}

export function markupValueFormatter(params: { value: unknown }): string {
  return params.value != null ? `$${Number(params.value).toFixed(2)}` : '—';
}

export function markupValueSetter(params: ValueSetterParams<GridRow>): boolean {
  const newMarkup = parseFloat(String(params.newValue));
  if (!Number.isFinite(newMarkup)) return false;
  const row = params.data as GridRow;
  const range = parsePriceRange(row.priceRange as string | null);
  if (range) {
    // range flow: price stays fixed, markup overrides — derivedCogs = price - markup
    (row as Record<string, unknown>).markup = newMarkup;
  } else {
    // fixed flow: unitPrice = unitCost + markup
    const unitCost = Number(row.unitCost ?? 0);
    (row as Record<string, unknown>).unitPrice = unitCost + newMarkup;
    (row as Record<string, unknown>).markup = newMarkup;
  }
  return true;
}
