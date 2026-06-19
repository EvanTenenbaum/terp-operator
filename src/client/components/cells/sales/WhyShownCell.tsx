/**
 * WhyShownCell — replaces suggestionColumns[reason].cellRenderer (SalesView.tsx:114-120).
 *
 * Renders "why shown" chips using the existing whyShownChips helper from
 * SalesView.columns.ts.
 */
import { whyShownChips } from '../../../views/SalesView.columns';

export interface WhyShownCellProps {
  value: unknown;
}

export function WhyShownCell(params: WhyShownCellProps): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {whyShownChips(params.value).map((chip) => (
        <span key={chip} className="finder-chip">{chip}</span>
      ))}
    </span>
  );
}
