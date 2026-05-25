import { BarChart3, Download, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { OperatorGrid } from './OperatorGrid';
import { workLoopForUser } from '../accessPolicy';

const reportOptions: { label: string; minLoop: 'manager' | null }[] = [
  { label: 'Revenue', minLoop: null },
  { label: 'Aging inventory', minLoop: 'manager' },
  { label: 'Payables due', minLoop: 'manager' },
  { label: 'Cash movement', minLoop: 'manager' },
  { label: 'Vendor performance', minLoop: 'manager' },
  { label: 'Category analytics', minLoop: null },
  { label: 'Client sales history', minLoop: 'manager' },
];

const reportColumns: ColDef<GridRow>[] = [
  { field: 'label', headerName: 'Group', pinned: 'left', minWidth: 190 },
  { field: 'status', width: 125 },
  { field: 'amount', type: 'numericColumn', width: 130 },
  { field: 'count', type: 'numericColumn', width: 105 },
  { field: 'source', width: 145 }
];

export function ReportsRouteShell() {
  const me = trpc.auth.me.useQuery();
  const myLoop = me.data ? workLoopForUser(me.data) : null;
  const isManagerPlus = myLoop === 'manager' || myLoop === 'owner';
  const visibleReports = reportOptions.filter(r => !r.minLoop || isManagerPlus);
  const [activeReport, setActiveReport] = useState(() => visibleReports[0]?.label ?? reportOptions[0].label);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const sales = trpc.queries.grid.useQuery({ view: 'sales' });
  const inventory = trpc.queries.grid.useQuery({ view: 'inventory' });
  const vendors = trpc.queries.grid.useQuery({ view: 'vendors' }, { enabled: isManagerPlus });
  const payments = trpc.queries.grid.useQuery({ view: 'payments' }, { enabled: isManagerPlus });
  const clients = trpc.queries.grid.useQuery({ view: 'clients' }, { enabled: isManagerPlus });
  const title = `${activeReport} report`;

  const rows = useMemo(
    () =>
      buildReportRows(activeReport, {
        sales: (sales.data ?? []) as GridRow[],
        inventory: (inventory.data ?? []) as GridRow[],
        vendors: (vendors.data ?? []) as GridRow[],
        payments: (payments.data ?? []) as GridRow[],
        clients: (clients.data ?? []) as GridRow[]
      }),
    [activeReport, clients.data, inventory.data, payments.data, sales.data, vendors.data]
  );

  function onSelectionChange(selection: GridRow[]) {
    setSelectedRows('reports', selection);
    if (selection[0]) {
      setDrawerEntity('reports', 'report', selection[0].id);
      setDrawerState('reports', 'peek');
    }
  }

  function exportCsv() {
    const headers = ['id', 'label', 'status', 'amount', 'count', 'source'];
    const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
    downloadText(`terp-agro-${activeReport.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const loading = sales.isLoading || inventory.isLoading || vendors.isLoading || payments.isLoading || clients.isLoading;

  return (
    <div className="view-stack reports-route-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Live source rows grouped for owner decisions.</p>
        </div>
        <button type="button" className="secondary-button" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export
        </button>
      </div>
      <div className="report-chip-row" aria-label="Report picker">
        {visibleReports.map((report) => (
          <button key={report.label} type="button" className={activeReport === report.label ? 'report-chip report-chip-active' : 'report-chip'} onClick={() => setActiveReport(report.label)}>
            {report.label}
          </button>
        ))}
      </div>
      <div className="report-parameter-strip" aria-label="Report parameters">
        <span className="report-filter-pill">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Live database
        </span>
        <span className="report-filter-pill">Status grouped</span>
        <span className="report-filter-pill">Source rows selectable</span>
      </div>
      <OperatorGrid
        view="reports"
        title={title}
        rows={rows}
        columns={reportColumns}
        loading={loading}
        onSelectionChange={onSelectionChange}
        actions={
          <button type="button" className="secondary-button compact-action" onClick={exportCsv} disabled={!rows.length}>
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Export report
          </button>
        }
      />
    </div>
  );
}

function buildReportRows(activeReport: string, data: Record<'sales' | 'inventory' | 'vendors' | 'payments' | 'clients', GridRow[]>): GridRow[] {
  if (activeReport === 'Revenue') {
    return groupRows(data.sales, (row) => String(row.status ?? 'unknown'), {
      idPrefix: 'revenue',
      source: 'Sales orders',
      amount: (row) => Number(row.total ?? 0),
      definition: 'Sales order totals grouped by live order status.'
    });
  }
  if (activeReport === 'Aging inventory') {
    return groupRows(data.inventory, (row) => ageBucket(Number(row.ageDays ?? 0)), {
      idPrefix: 'aging',
      source: 'Inventory',
      amount: (row) => Number(row.availableQty ?? 0) * Number(row.unitCost ?? 0),
      definition: 'Available inventory value grouped by batch age.'
    });
  }
  if (activeReport === 'Payables due') {
    return groupRows(data.vendors, (row) => String(row.status ?? 'unknown'), {
      idPrefix: 'payables',
      source: 'Vendor bills',
      amount: (row) => Number(row.amount ?? 0) - Number(row.amountPaid ?? 0),
      definition: 'Open vendor payable balance grouped by payable status.'
    });
  }
  if (activeReport === 'Cash movement') {
    return groupRows(data.payments, (row) => `${String(row.direction ?? 'money')} / ${String(row.method ?? 'method')}`, {
      idPrefix: 'cash',
      source: 'Payments',
      amount: (row) => Number(row.amount ?? 0),
      definition: 'Logged money movement grouped by direction and method.'
    });
  }
  if (activeReport === 'Vendor performance') {
    return groupRows(data.vendors, (row) => String(row.vendor ?? 'Unknown vendor'), {
      idPrefix: 'vendor',
      source: 'Vendor bills',
      amount: (row) => Number(row.amount ?? 0) - Number(row.amountPaid ?? 0),
      definition: 'Vendor bill exposure by vendor.'
    });
  }
  if (activeReport === 'Category analytics') {
    return groupRows(data.inventory, (row) => String(row.category ?? 'Uncategorized'), {
      idPrefix: 'category',
      source: 'Inventory',
      amount: (row) => Number(row.availableQty ?? 0) * Number(row.unitPrice ?? 0),
      definition: 'Available retail inventory value by category.'
    });
  }
  return data.clients.map((row) => ({
    id: `client-${row.id}`,
    label: String(row.name ?? 'Unknown client'),
    status: Number(row.balance ?? 0) > 0 ? 'open' : 'paid',
    amount: Number(row.balance ?? 0),
    count: Number(row.invoiceCount ?? 0),
    definition: 'Client balance and invoice count from the live client ledger.',
    source: 'Clients'
  }));
}

function groupRows(
  rows: GridRow[],
  labelFor: (row: GridRow) => string,
  config: { idPrefix: string; source: string; amount: (row: GridRow) => number; definition: string }
) {
  const groups = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const label = labelFor(row);
    const current = groups.get(label) ?? { amount: 0, count: 0 };
    current.amount += config.amount(row);
    current.count += 1;
    groups.set(label, current);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({
      id: `${config.idPrefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'none'}`,
      label,
      status: statusForLabel(label),
      amount: value.amount,
      count: value.count,
      definition: config.definition,
      source: config.source
    }));
}

function statusForLabel(label: string): GridRow['status'] {
  const normalized = label.toLowerCase();
  if (normalized.includes('posted') || normalized.includes('received')) return 'posted';
  if (normalized.includes('draft')) return 'draft';
  if (normalized.includes('paid')) return 'paid';
  if (normalized.includes('scheduled')) return 'scheduled';
  if (normalized.includes('approved')) return 'approved';
  if (normalized.includes('held')) return 'held';
  if (normalized.includes('damaged')) return 'damaged';
  if (normalized.includes('returned')) return 'returned';
  if (normalized.includes('confirmed')) return 'confirmed';
  return 'open';
}

function ageBucket(ageDays: number) {
  if (ageDays >= 60) return '60+ days';
  if (ageDays >= 30) return '30-59 days';
  return '0-29 days';
}

function csvValue(value: unknown) {
  const raw = value == null ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadText(filename: string, value: string, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
