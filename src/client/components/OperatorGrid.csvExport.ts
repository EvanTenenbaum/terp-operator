import type { CsvExportParams, ProcessCellForExportParams } from 'ag-grid-community';
import type { ViewKey } from '../../shared/types';

// UX-A2 (#15): Role-based CSV export gating.
//
// When an operator with role='viewer' exports a grid as CSV, AG Grid by
// default emits ALL visible columns. That bypasses any in-UI hiding and
// leaks unit cost, internal margin, and customer balance figures that the
// viewer is otherwise not entitled to see.
//
// This module centralises the column-restriction policy so it can be unit
// tested without rendering the grid, and so the same policy is applied
// everywhere `exportDataAsCsv` is called.

export const RESTRICTED_VIEWER_COLUMNS = [
  // Cost (any column whose colId/field starts with "unitCost" / "cost" /
  // ends with "Cost" / contains "landedCost" / "costBasis")
  'unitCost',
  'cost',
  'unitCostResolved',
  'landedCostBasis',
  // Internal margin
  'internalMargin',
  'estimatedMargin',
  'margin',
  // Customer financials
  'balance',
  'creditLimit'
] as const;

const RESTRICTED_SET: ReadonlySet<string> = new Set(RESTRICTED_VIEWER_COLUMNS);

type Role = 'viewer' | 'operator' | 'manager' | 'owner';

/**
 * Returns true when the given column key must be stripped from CSV export
 * for the given role. Viewers (and unknown/loading roles) are restricted;
 * operator/manager/owner are not.
 */
export function isRestrictedColumnForRole(colKey: string | null | undefined, role: Role | string | undefined): boolean {
  if (!colKey) return false;
  if (role && role !== 'viewer') return false;
  return RESTRICTED_SET.has(colKey);
}

interface BuildOptionsArgs {
  view: ViewKey | string;
  role: Role | string | undefined;
}

/**
 * Build the CsvExportParams to pass to AG Grid's `exportDataAsCsv`.
 * When the role is a viewer (or auth hasn't resolved), a
 * processCellCallback is installed that returns '' for any cell whose
 * column id belongs to RESTRICTED_VIEWER_COLUMNS.
 */
export function buildCsvExportOptions({ view, role }: BuildOptionsArgs): CsvExportParams {
  const fileName = `terp-operator-${view}.csv`;
  if (role && role !== 'viewer') {
    return { fileName };
  }
  return {
    fileName,
    processCellCallback: (params: ProcessCellForExportParams) => {
      const colId =
        params.column?.getColId?.() ??
        params.column?.getColDef?.()?.field ??
        undefined;
      if (isRestrictedColumnForRole(colId ?? null, role)) {
        return '';
      }
      return params.value;
    }
  };
}
