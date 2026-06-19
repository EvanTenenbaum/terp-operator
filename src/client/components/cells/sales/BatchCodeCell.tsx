/**
 * BatchCodeCell — replaces lineColumns[batchCode].cellRenderer (SalesView.tsx:216-221).
 *
 * Renders the batch code with an "Already in order" chip when the row's
 * __dupSource flag is set (computed by useSalesLineRows / duplicateSourceLineIds).
 */
import { AlreadyInOrderChip } from '../../SalePrePostStrip';
import type { GridRow } from '../../../../shared/types';

export interface BatchCodeCellProps {
  value: unknown;
  data?: GridRow & { __dupSource?: boolean };
}

export function BatchCodeCell(params: BatchCodeCellProps): JSX.Element {
  return (
    <span>
      {String(params.value ?? '')}
      <AlreadyInOrderChip isDuplicate={Boolean(params.data?.__dupSource)} />
    </span>
  );
}
