/**
 * DisplayNameCell — replaces lineColumns[displayName].cellRenderer (SalesView.tsx:192-204).
 *
 * Renders the product display name with a chartreuse alias dot when
 * the row has a market alias.
 */
import type { GridRow } from '../../../../shared/types';

export interface DisplayNameCellProps {
  value: unknown;
  data?: GridRow;
}

export function DisplayNameCell(params: DisplayNameCellProps): JSX.Element {
  const fallback = params.value ?? params.data?.itemName ?? '';
  return (
    <span>
      {params.data?.itemAlias ? (
        <span title="Product name (market alias)" style={{ color: '#eab308', marginRight: 4 }}>
          ●
        </span>
      ) : null}
      {String(fallback)}
    </span>
  );
}
