/**
 * DateCell — AG Grid cell renderer for date fields with overdue signal support.
 *
 * Formats date values using {@link formatTs} (short variant) and reads the
 * column's `__signal` function to apply conditional styling:
 *  - `'warning'` → `text-amber` color
 *  - `'danger'`  → `text-danger` color
 *  - `'none'` / missing → no extra styling
 *
 * Null / undefined / invalid values render as an empty string.
 */
import type { ICellRendererParams } from 'ag-grid-community';
import { formatTs } from '../../utils/format';

type SignalResult = 'none' | 'warning' | 'danger';

export default function DateCell(params: ICellRendererParams) {
  const value = params.value as Date | string | number | null | undefined;
  const formatted = formatTs(value, { variant: 'short' });
  if (!formatted) return null;

  const signal = (params.colDef as Record<string, unknown> | undefined)
    ?.__signal as ((row: Record<string, unknown>) => SignalResult) | undefined;

  if (!signal || typeof signal !== 'function') {
    return <span>{formatted}</span>;
  }

  const result = signal(params.data as Record<string, unknown>);
  if (result === 'warning') {
    return <span className="text-amber">{formatted}</span>;
  }
  if (result === 'danger') {
    return <span className="text-danger">{formatted}</span>;
  }

  return <span>{formatted}</span>;
}
