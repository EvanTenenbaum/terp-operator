import { Clock, Sigma, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GridRow, ViewKey } from '../../shared/types';

interface SelectionSummaryProps {
  rows: GridRow[];
  view: ViewKey;
  onOpenHistory: (row: GridRow) => void;
  onOpenRelationship?: (row: GridRow) => void;
  onOpenIssue?: (row: GridRow) => void;
  actions?: ReactNode;
}

const sumFields = ['subtotal', 'total', 'amount', 'intakeQty', 'availableQty', 'qty', 'openBalance'];

export function SelectionSummary({ rows, view, onOpenHistory, onOpenRelationship, onOpenIssue, actions }: SelectionSummaryProps) {
  if (!rows.length) return null;
  const sums = sumFields
    .map((field) => {
      const values = rows.map((row) => numeric(row[field])).filter((value) => Math.abs(value) > 0.0001);
      const total = values.reduce((sum, value) => sum + value, 0);
      return values.length ? { field, total, average: total / values.length, count: values.length } : null;
    })
    .filter((row): row is { field: string; total: number; average: number; count: number } => Boolean(row));
  const issues = rows.flatMap((row) => Array.isArray(row.validationIssues) ? row.validationIssues.map(String) : []);

  return (
    <div className="selection-summary" aria-live="polite">
      <div className="selection-summary-main">
        <span className="selection-pill">{rows.length} selected</span>
        <span className="selection-pill">{view}</span>
        {sums.slice(0, 4).map((sum) => (
          <span className="selection-pill" key={sum.field}>
            <Sigma className="h-3.5 w-3.5" aria-hidden="true" />
            {label(sum.field)} total {format(sum.total)} / avg {format(sum.average)} / count {sum.count}
          </span>
        ))}
        {issues.length ? (
          <span className="selection-pill warning">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {issues.length} issue(s)
          </span>
        ) : null}
      </div>
      <div className="selection-summary-actions">
        {actions}
        {onOpenRelationship && hasRelationship(rows[0], view) ? (
          <button className="secondary-button compact-action" type="button" onClick={() => onOpenRelationship(rows[0])}>
            Relationship
          </button>
        ) : null}
        {onOpenIssue && hasIssueSurface(rows[0], view) ? (
          <button className="secondary-button compact-action" type="button" onClick={() => onOpenIssue(rows[0])}>
            Issue
          </button>
        ) : null}
        <button className="secondary-button compact-action" type="button" onClick={() => downloadSelectionPacket(view, rows)}>
          Packet
        </button>
        <button className="secondary-button compact-action" type="button" onClick={() => onOpenHistory(rows[0])}>
          <Clock className="h-4 w-4" aria-hidden="true" />
          History
        </button>
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

function downloadSelectionPacket(view: ViewKey, rows: GridRow[]) {
  const payload = { generatedAt: new Date().toISOString(), view, selectedRowCount: rows.length, rows };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `terp-agro-${view}-selection-packet.json`;
  link.click();
  URL.revokeObjectURL(url);
}
