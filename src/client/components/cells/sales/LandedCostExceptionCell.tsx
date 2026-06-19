/**
 * LandedCostExceptionCell — canonicalizes the existing LandedCostExceptionCellRenderer
 * from src/client/components/LandedCostExceptionChip.tsx.
 *
 * The existing component already exists and is already stable — this file
 * standardizes the path and props name. The re-export shim in
 * LandedCostExceptionChip.tsx preserves backward compatibility for existing
 * test imports.
 */
import { LandedCostExceptionChip } from '../../LandedCostExceptionChip';

export interface LandedCostExceptionCellProps {
  data?: {
    landedCostExceptionReason?: string | null;
    landedCostExceptionNote?: string | null;
    landedCostBelowRange?: boolean;
    landedCostExceptionRangeLow?: number | null;
    landedCostExceptionRangeHigh?: number | null;
  } | null;
}

export function LandedCostExceptionCell(params: LandedCostExceptionCellProps): JSX.Element | null {
  const data = params.data ?? {};
  return (
    <LandedCostExceptionChip
      reason={data.landedCostExceptionReason ?? null}
      note={data.landedCostExceptionNote ?? null}
      rangeLow={data.landedCostExceptionRangeLow ?? null}
      rangeHigh={data.landedCostExceptionRangeHigh ?? null}
    />
  );
}
