import { Clock, Sigma, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GridRow, ViewKey } from '../../shared/types';

export interface CellRangeStat {
  field: string;
  total: number;
  average: number;
  count: number;   // total cell count (including zeros)
  min: number;
  max: number;
}

interface SelectionSummaryProps {
  rows: GridRow[];
  view: ViewKey;
  onOpenHistory: (row: GridRow) => void;
  onOpenRelationship?: (row: GridRow) => void;
  onOpenIssue?: (row: GridRow) => void;
  actions?: ReactNode;
  cellRangeStats?: CellRangeStat[];  // NEW optional prop
}

const VIEW_LABELS: Partial<Record<string, string>> = {
  intake: 'Intake',
  purchaseOrders: 'Purchase Orders',
  sales: 'Sales',
  payments: 'Payments',
  inventory: 'Inventory',
  connectors: 'Connectors',
  fulfillment: 'Fulfillment',
  recovery: 'Recovery',
  closeout: 'Closeout',
  photography: 'Photography',
  matchmaking: 'Matchmaking',
  pickQueue: 'Pick Queue',
  orders: 'Orders',
  clients: 'Clients',
  vendors: 'Vendors',
  dashboard: 'Dashboard',
  reports: 'Reports',
  settings: 'Settings',
};

const sumFields = ['subtotal', 'total', 'amount', 'intakeQty', 'availableQty', 'qty', 'openBalance'];

export function SelectionSummary({ rows, view, onOpenHistory, onOpenRelationship, onOpenIssue, actions, cellRangeStats }: SelectionSummaryProps) {
  const hasRangeStats = Boolean(cellRangeStats?.length);
  if (!rows.length && !hasRangeStats) return null;

  const sums = sumFields
    .map((field) => {
      const hasField = rows.some((row) => row[field] != null);
      if (!hasField) return null;
      const allValues = rows.map((row) => numeric(row[field]));
      const total = allValues.reduce((sum, value) => sum + value, 0);
      const min = allValues.reduce((m, v) => Math.min(m, v), Infinity);
      const max = allValues.reduce((m, v) => Math.max(m, v), -Infinity);
      return { field, total, average: total / rows.length, count: rows.length, min, max };
    })
    .filter((row): row is { field: string; total: number; average: number; count: number; min: number; max: number } => Boolean(row));

  const issues = rows.flatMap((row) => Array.isArray(row.validationIssues) ? row.validationIssues.map(String) : []);
  const totalCells = cellRangeStats?.reduce((sum, stat) => sum + stat.count, 0) ?? 0;

  return (
    <div className="selection-summary" aria-live="polite">
      <div className="selection-summary-main">
        {hasRangeStats ? (
          <>
            <span className="selection-pill">{totalCells} cells</span>
            <span className="selection-pill">cell range</span>
            {cellRangeStats!.slice(0, 4).map((stat) => (
              <span className="selection-pill" key={stat.field}>
                <Sigma className="h-3.5 w-3.5" aria-hidden="true" />
                {label(stat.field)} sum {format(stat.total)} / avg {format(stat.average)} / count {stat.count}
              </span>
            ))}
          </>
        ) : rows.length > 0 ? (
          <>
            <span className="selection-pill">{rows.length} selected</span>
            <span className="selection-pill">{VIEW_LABELS[view] ?? view}</span>
            {sums.slice(0, 4).map((sum) => (
              <span className="selection-pill" key={sum.field}>
                <Sigma className="h-3.5 w-3.5" aria-hidden="true" />
                {label(sum.field)} total {format(sum.total)} / avg {format(sum.average)} / count {sum.count}
              </span>
            ))}
          </>
        ) : null}
        {issues.length ? (
          <span className="selection-pill warning">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {issues.length} issue(s)
          </span>
        ) : null}
      </div>
      <div className="selection-summary-actions">
        {actions}
        {onOpenRelationship && rows[0] && hasRelationship(rows[0], view) ? (
          <button className="secondary-button compact-action" type="button" onClick={() => onOpenRelationship(rows[0])}>
            Relationship
          </button>
        ) : null}
        {onOpenIssue && rows[0] && hasIssueSurface(rows[0], view) ? (
          <button className="secondary-button compact-action" type="button" onClick={() => onOpenIssue(rows[0])}>
            Issue
          </button>
        ) : null}
        {rows[0] ? (
          <button className="secondary-button compact-action" type="button" onClick={() => onOpenHistory(rows[0])}>
            <Clock className="h-4 w-4" aria-hidden="true" />
            History
          </button>
        ) : null}
      </div>
    </div>
  );
}

function hasRelationship(row: GridRow | undefined, view: ViewKey) {
  if (!row) return false;
  return Boolean(row.customerId || row.vendorId || view === 'clients' || view === 'vendors');
}

function hasIssueSurface(row: GridRow | undefined, view: ViewKey) {
  if (!row) return false;
  return ['clients', 'orders', 'payments'].includes(view);
}

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function format(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function label(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
