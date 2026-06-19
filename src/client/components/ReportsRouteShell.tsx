import { logger } from '@/client/services/logger';
/**
 * ReportsRouteShell — Phase 6 live implementation
 *
 * Reports are wired to live tRPC grid queries. All aggregation is client-side.
 * Reference: docs/roadmap/phase-readiness/6.md
 *
 * TER-1575: Payables Due, Cash Movement, Vendor Performance formulas
 * TER-1574: Inventory Aging (intake_date-based ageDays)
 * TER-1576: Category Performance, Client Balances, Client Sales History
 * TER-1573: Revenue Summary formula
 * TER-1577: Source-row drilldown linkage
 * TER-1578: CSV export with deterministic headers
 * Selection state (setSelectedRows/setDrawerEntity/setDrawerState) intentionally
 * removed — no consumers of 'reports' key in uiStore confirmed by grep audit.
 */

import { BarChart3, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { EmptyState } from './EmptyState';
import { workLoopForUser } from '../accessPolicy';
import type { GridRow, ViewKey } from '../../shared/types';
import { formatMoney } from '../utils/format';

// ── Report registry ───────────────────────────────────────────────────────────

type ReportDef = {
  key: string;
  label: string;
  description: string;
  columns: readonly string[];
  gated?: boolean;
  /** Manager+ only. Hides this report from non-manager users. */
  minLoop?: 'manager';
};

const REPORT_DEFS: readonly ReportDef[] = [
  {
    key: 'revenue-summary',
    label: 'Revenue Summary',
    description: 'Posted orders by status — all time, live. Gross posted order total. Formal adjustments not yet tracked.',
    columns: ['Status', 'Orders', 'Total Value', 'Note'] as const,
  },
  {
    key: 'payables-aging',
    label: 'Payables Due',
    description: 'Open vendor bills grouped by status. Overdue shown at top.',
    columns: ['Status', 'Bills', 'Outstanding Balance', 'Overdue?'] as const,
    minLoop: 'manager',
  },
  {
    key: 'client-balances',
    label: 'Client Balances',
    description: 'Client accounts sorted by outstanding balance.',
    columns: ['Client', 'Open Orders', 'Balance', 'Credit Limit', 'Available Credit'] as const,
  },
  {
    key: 'inventory-aging',
    label: 'Inventory Aging',
    description: 'Available inventory value grouped by age since intake date.',
    columns: ['Age Range', 'Lots', 'Total Available Qty', 'Cost Value', 'Retail Value'] as const,
    minLoop: 'manager',
  },
  {
    key: 'category-performance',
    label: 'Category Performance',
    description: 'Available inventory grouped by category. Lots without a price show at cost.',
    columns: ['Category', 'Lots', 'Available Qty', 'Cost Value', 'Retail Value'] as const,
  },
  {
    key: 'cash-flow',
    label: 'Cash Movement',
    description: 'Posted payments grouped by direction and method.',
    columns: ['Direction / Method', 'Transactions', 'Total Amount', 'Net Position'] as const,
    minLoop: 'manager',
  },
  {
    key: 'vendor-performance',
    label: 'Vendor Performance',
    description: 'Outstanding vendor bills grouped by vendor.',
    columns: ['Vendor', 'Bills', 'Total Billed', 'Outstanding Balance'] as const,
    minLoop: 'manager',
  },
  {
    key: 'client-sales-history',
    label: 'Client Sales History',
    description: 'Sales orders grouped by client — all time, live.',
    columns: ['Client', 'Total Orders', 'Posted Revenue', 'In Pipeline'] as const,
    minLoop: 'manager',
  },
  {
    key: 'closeout-period',
    label: 'Closeout Period',
    description: 'Period closeout summary — available after Phase 5 archive gates.',
    columns: [],
    gated: true,
  },
];

/** Maps a report key to which data sources it needs (Fix 3 — lazy query loading). */
const REPORT_DATA_SOURCES: Record<string, Array<'vendors' | 'payments' | 'inventory' | 'clients' | 'sales'>> = {
  'revenue-summary': ['sales'],
  'payables-aging': ['vendors'],
  'client-balances': ['clients'],
  'inventory-aging': ['inventory'],
  'category-performance': ['inventory'],
  'cash-flow': ['payments'],
  'vendor-performance': ['vendors'],
  'client-sales-history': ['sales'],
  'closeout-period': [],
};

/** Maps a report key to the source-row view to navigate to on row click (TER-1577). */
const REPORT_DRILLDOWN_VIEW: Record<string, ViewKey> = {
  'revenue-summary': 'sales',
  'payables-aging': 'vendors',
  'client-balances': 'clients',
  'inventory-aging': 'inventory',
  'category-performance': 'inventory',
  'cash-flow': 'payments',
  'vendor-performance': 'vendors',
  'client-sales-history': 'sales',
};

// ── Row type ──────────────────────────────────────────────────────────────────

type ReportRow = Record<string, string | number>;

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportsRouteShell() {
  const navigate = useNavigate();
  const [activeReport, setActiveReport] = useState(() => REPORT_DEFS[0].key);
  const me = trpc.auth.me.useQuery();
  const myLoop = me.data ? workLoopForUser(me.data) : null;
  const isManagerPlus = myLoop === 'manager' || myLoop === 'owner';
  const visibleReports = REPORT_DEFS.filter((r) => !r.minLoop || isManagerPlus);

  const currentReport = REPORT_DEFS.find((r) => r.key === activeReport) ?? REPORT_DEFS[0];

  // ── Data fetching (TER-1575, TER-1574, TER-1576, TER-1573) ────────────────
  // Fix 3: gate each query to only fetch when the active report actually needs it.
  const needsSources = REPORT_DATA_SOURCES[activeReport] ?? [];

  const vendorsGrid = trpc.queries.grid.useQuery(
    { view: 'vendors' },
    { enabled: needsSources.includes('vendors') && isManagerPlus }
  );
  const paymentsGrid = trpc.queries.grid.useQuery(
    { view: 'payments' },
    { enabled: needsSources.includes('payments') && isManagerPlus }
  );
  const inventoryGrid = trpc.queries.grid.useQuery(
    { view: 'inventory' },
    { enabled: needsSources.includes('inventory') }
  );
  const clientsGrid = trpc.queries.grid.useQuery(
    { view: 'clients' },
    { enabled: needsSources.includes('clients') && isManagerPlus }
  );
  const salesGrid = trpc.queries.grid.useQuery(
    { view: 'sales' },
    { enabled: needsSources.includes('sales') }
  );

  // Fix 3: only count loading/error state for sources this report actually uses.
  const isLoading =
    (needsSources.includes('vendors') && vendorsGrid.isLoading) ||
    (needsSources.includes('payments') && paymentsGrid.isLoading) ||
    (needsSources.includes('inventory') && inventoryGrid.isLoading) ||
    (needsSources.includes('clients') && clientsGrid.isLoading) ||
    (needsSources.includes('sales') && salesGrid.isLoading);

  // Fix 2: surface fetch errors so the UI can show a retry prompt.
  const hasError =
    (needsSources.includes('vendors') && vendorsGrid.isError) ||
    (needsSources.includes('payments') && paymentsGrid.isError) ||
    (needsSources.includes('inventory') && inventoryGrid.isError) ||
    (needsSources.includes('clients') && clientsGrid.isError) ||
    (needsSources.includes('sales') && salesGrid.isError);

  // ── Compute report rows ───────────────────────────────────────────────────
  const reportRows = useMemo(
    () =>
      buildRowsValidated(activeReport, {
        vendorsData: (vendorsGrid.data ?? []) as GridRow[],
        paymentsData: (paymentsGrid.data ?? []) as GridRow[],
        inventoryData: (inventoryGrid.data ?? []) as GridRow[],
        clientsData: (clientsGrid.data ?? []) as GridRow[],
        salesData: (salesGrid.data ?? []) as GridRow[],
      }),
    [activeReport, vendorsGrid.data, paymentsGrid.data, inventoryGrid.data, clientsGrid.data, salesGrid.data]
  );

  // ── Export CSV (TER-1578) ─────────────────────────────────────────────────
  const canExport = !currentReport.gated && !hasError && reportRows.length > 0;

  function exportCsv() {
    const columns = currentReport.columns as readonly string[];
    const header = columns.join(',');
    const dataRows = reportRows.map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          const str = val === undefined || val === null ? '' : String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    );
    const csv = [header, ...dataRows].join('\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadText(
      `terp-operator-${currentReport.key}-${dateStr}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  }

  // ── Drilldown row click handler (TER-1577) ────────────────────────────────
  const drilldownView = REPORT_DRILLDOWN_VIEW[activeReport];

  return (
    <div className="view-stack reports-route-shell">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Operator projections for owner decisions — live data.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={exportCsv}
          disabled={!canExport}
          title={
            currentReport.gated
              ? 'Export not available — Phase 5 archive gate required'
              : reportRows.length === 0
              ? 'Export available once data loads'
              : 'Export CSV'
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* ── Report picker chips ─────────────────────────────────────────────── */}
      <div className="report-chip-row" aria-label="Report picker">
        {visibleReports.map((report) => (
          <button
            key={report.key}
            type="button"
            className={activeReport === report.key ? 'report-chip report-chip-active' : 'report-chip'}
            onClick={() => setActiveReport(report.key)}
            aria-pressed={activeReport === report.key}
          >
            {report.label}
          </button>
        ))}
      </div>

      {/* ── Active report body ──────────────────────────────────────────────── */}
      {currentReport.gated ? (
        // Closeout Period — gated until Phase 5 archive gates pass (CAP-020)
        <div className="report-table-wrap">
          <div className="mb-3">
            <h2 className="section-title">{currentReport.label}</h2>
            <p className="mt-1 text-sm text-zinc-600">{currentReport.description}</p>
          </div>
          <EmptyState title="Available after Phase 5 — CAP-020 archive gates required" role="status">
            This report requires the Closeout Period archive gate to be complete before data
            is available. Once Phase 5 (Recovery &amp; Closeout) is live, this report will show
            period summary financials.
          </EmptyState>
        </div>
      ) : (
        <div className="report-table-wrap" aria-busy={isLoading}>
          <div className="mb-3">
            <h2 className="section-title">{currentReport.label}</h2>
            <p className="mt-1 text-sm text-zinc-600">{currentReport.description}</p>
            {(activeReport === 'revenue-summary' || activeReport === 'client-sales-history') && (
              <p className="mt-1 text-xs text-zinc-400">All orders — live</p>
            )}
          </div>
          {/* Priority: error > loading > empty > data */}
          {hasError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-500">
              <p className="text-sm">Failed to load report data. Check your connection and try again.</p>
              <button
                type="button"
                className="secondary-button text-xs"
                onClick={() => {
                  if (needsSources.includes('vendors')) vendorsGrid.refetch();
                  if (needsSources.includes('payments')) paymentsGrid.refetch();
                  if (needsSources.includes('inventory')) inventoryGrid.refetch();
                  if (needsSources.includes('clients')) clientsGrid.refetch();
                  if (needsSources.includes('sales')) salesGrid.refetch();
                }}
              >
                Retry
              </button>
            </div>
          ) : reportRows.length === 0 && !isLoading ? (
            <EmptyState
              title={emptyStateTitle(activeReport)}
              role="status"
            />
          ) : (
            <table className="report-table" aria-label={`${currentReport.label} data table`}>
              <thead>
                <tr>
                  {currentReport.columns.map((col) => (
                    <th key={col} scope="col">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={currentReport.columns.length || 1}
                      className="py-8 text-center text-sm text-zinc-500"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        drilldownView
                          ? 'cursor-pointer transition-colors hover:bg-zinc-50'
                          : ''
                      }
                      onClick={
                        drilldownView ? () => navigate('/' + drilldownView) : undefined
                      }
                      tabIndex={drilldownView ? 0 : undefined}
                      aria-label={
                        drilldownView
                          ? `Go to ${drilldownView} view`
                          : undefined
                      }
                      onKeyDown={
                        drilldownView
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate('/' + drilldownView);
                              }
                            }
                          : undefined
                      }
                    >
                      {currentReport.columns.map((col) => (
                        <td key={col}>{row[col] ?? ''}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {/* TER-1577: drilldown hint */}
          {drilldownView && reportRows.length > 0 && (
            <p className="mt-2 text-xs text-zinc-400">Click any row to open the {drilldownView} view</p>
          )}
        </div>
      )}

      {/* ── Bottom action strip ──────────────────────────────────────────────── */}
      <div className="control-band">
        <span className="text-xs text-zinc-500">
          {currentReport.gated
            ? 'Export not available — Phase 5 gate required'
            : canExport
            ? 'Export CSV'
            : 'No data to export'}
        </span>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={exportCsv}
          disabled={!canExport}
          title={
            currentReport.gated
              ? 'Export not available — Phase 5 archive gate required'
              : reportRows.length === 0
              ? 'Export available once data loads'
              : 'Export CSV'
          }
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Export report
        </button>
      </div>
    </div>
  );
}

// ── Empty state labels ────────────────────────────────────────────────────────

function emptyStateTitle(reportKey: string): string {
  switch (reportKey) {
    case 'revenue-summary':
      return 'No sales orders recorded yet.';
    case 'payables-aging':
      return 'No open vendor bills.';
    case 'client-balances':
      return 'No client accounts found.';
    case 'inventory-aging':
      return 'No active inventory.';
    case 'category-performance':
      return 'No active inventory.';
    case 'cash-flow':
      return 'No posted payments yet.';
    case 'vendor-performance':
      return 'No vendor bills found.';
    case 'client-sales-history':
      return 'No sales orders recorded yet.';
    default:
      return 'No data available.';
  }
}

// ── Column key contract ───────────────────────────────────────────────────────
// IMPORTANT: Each build*Rows function must return objects whose keys exactly
// match the column strings in the corresponding REPORT_DEFS entry. TypeScript
// cannot enforce this automatically (ReportRow is Record<string, string|number>).
// If you rename a column in REPORT_DEFS, update the matching build*Rows function.
// CSV export reads row[col] directly — mismatches produce silent empty columns.
// ─────────────────────────────────────────────────────────────────────────────

// ── Aggregation functions ─────────────────────────────────────────────────────

interface BuildRowsInput {
  vendorsData: GridRow[];
  paymentsData: GridRow[];
  inventoryData: GridRow[];
  clientsData: GridRow[];
  salesData: GridRow[];
}

function buildRows(reportKey: string, data: BuildRowsInput): ReportRow[] {
  switch (reportKey) {
    case 'revenue-summary':
      return buildRevenueRows(data.salesData);
    case 'payables-aging':
      return buildPayablesRows(data.vendorsData);
    case 'client-balances':
      return buildClientBalancesRows(data.clientsData);
    case 'inventory-aging':
      return buildInventoryAgingRows(data.inventoryData);
    case 'category-performance':
      return buildCategoryPerformanceRows(data.inventoryData);
    case 'cash-flow':
      return buildCashMovementRows(data.paymentsData);
    case 'vendor-performance':
      return buildVendorPerformanceRows(data.vendorsData);
    case 'client-sales-history':
      return buildClientSalesHistoryRows(data.salesData);
    default:
      return [];
  }
}

/**
 * Dev-mode wrapper around buildRows that validates column key alignment at
 * runtime. If a REPORT_DEFS column name does not appear as a key in the first
 * row returned by buildRows, a console.error is emitted so the mismatch is
 * caught in development before a silent empty-column CSV export ships.
 * In production this is a transparent pass-through with zero overhead.
 */
function buildRowsValidated(reportKey: string, data: BuildRowsInput): ReportRow[] {
  const rows = buildRows(reportKey, data);
  if (process.env.NODE_ENV !== 'production' && rows.length > 0) {
    const def = REPORT_DEFS.find((r) => r.key === reportKey);
    if (def && def.columns.length > 0) {
      const missingKeys = def.columns.filter((col) => !(col in rows[0]));
      if (missingKeys.length > 0) {
        logger.error(
          `[ReportsRouteShell] Column key mismatch for "${reportKey}": ` +
            `missing keys in row output: ${missingKeys.join(', ')}. ` +
            `CSV export will produce empty columns.`
        );
      }
    }
  }
  return rows;
}

// ── Revenue Summary (TER-1573) ────────────────────────────────────────────────

function buildRevenueRows(salesData: GridRow[]): ReportRow[] {
  const groups: Record<string, { count: number; total: number }> = {};
  for (const row of salesData) {
    const status = String(row.status ?? 'unknown');
    if (!groups[status]) groups[status] = { count: 0, total: 0 };
    groups[status].count += 1;
    groups[status].total += Number(row.total ?? 0);
  }
  const rows: ReportRow[] = Object.entries(groups)
    .filter(([, g]) => g.count > 0)
    .map(([status, g]) => ({
      Status: status,
      Orders: g.count,
      'Total Value': formatMoney(g.total),
      Note: status === 'posted' ? 'Posted = recognized revenue' : '',
    }));
  const postedTotal = salesData
    .filter((r) => r.status === 'posted')
    .reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  if (rows.length > 0) {
    rows.push({
      Status: 'Posted total',
      Orders: '',
      'Total Value': formatMoney(postedTotal),
      Note: 'Gross posted order total. Formal adjustments not yet tracked.',
    });
  }
  return rows;
}

// ── Payables Due (TER-1575) ────────────────────────────────────────────────────

function buildPayablesRows(vendorData: GridRow[]): ReportRow[] {
  // Compare date-only strings to avoid UTC/local timezone misclassification.
  // date-only strings (YYYY-MM-DD) are parsed as UTC midnight by JS, while
  // new Date() is local time. Normalizing both to ISO date strings avoids
  // bills due today appearing Overdue at 8am EST.
  const todayStr = new Date().toISOString().slice(0, 10);
  // Mutually exclusive buckets: overdue bills go only into overdueGroup
  const overdueGroup = { count: 0, balance: 0 };
  const groups: Record<string, { count: number; balance: number }> = {};
  let grandTotal = 0;

  for (const row of vendorData) {
    const status = String(row.status ?? 'unknown');
    if (['paid', 'voided'].includes(status)) continue;

    const balance = Number(row.amount ?? 0) - Number(row.amountPaid ?? 0);
    const due = row.dueDate ? new Date(row.dueDate as string | Date) : null;
    const dueDateStr = due && !isNaN(due.getTime()) ? due.toISOString().slice(0, 10) : null;
    const isOverdue = dueDateStr != null && dueDateStr < todayStr;

    grandTotal += balance;

    if (isOverdue) {
      // Overdue bills: only in overdue group, NOT in status group
      overdueGroup.count += 1;
      overdueGroup.balance += balance;
    } else {
      // Non-overdue: only in status group
      if (!groups[status]) groups[status] = { count: 0, balance: 0 };
      groups[status].count += 1;
      groups[status].balance += balance;
    }
  }

  const rows: ReportRow[] = [];
  if (overdueGroup.count > 0) {
    rows.push({
      Status: 'Overdue',
      Bills: overdueGroup.count,
      'Outstanding Balance': formatMoney(overdueGroup.balance),
      'Overdue?': 'Yes',
    });
  }
  rows.push(
    ...Object.entries(groups).map(([status, g]) => ({
      Status: status,
      Bills: g.count,
      'Outstanding Balance': formatMoney(g.balance),
      'Overdue?': '',
    }))
  );
  if (rows.length > 0) {
    rows.push({
      Status: 'Total outstanding',
      Bills: '',
      'Outstanding Balance': formatMoney(grandTotal),
      'Overdue?': '',
    });
  }
  return rows;
}

// ── Cash Movement (TER-1575) ───────────────────────────────────────────────────

function buildCashMovementRows(paymentsData: GridRow[]): ReportRow[] {
  const posted = paymentsData.filter((r) => r.status === 'posted');
  const groups: Record<string, { count: number; total: number }> = {};

  for (const row of posted) {
    const key = `${String(row.direction ?? 'unknown')} / ${String(row.method ?? 'unknown')}`;
    if (!groups[key]) groups[key] = { count: 0, total: 0 };
    groups[key].count += 1;
    groups[key].total += Number(row.amount ?? 0);
  }

  const inTotal = posted
    .filter((r) => r.direction === 'in')
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const outTotal = posted
    .filter((r) => r.direction === 'out')
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const net = inTotal - outTotal;

  const rows: ReportRow[] = Object.entries(groups).map(([key, g]) => ({
    'Direction / Method': key,
    Transactions: g.count,
    'Total Amount': formatMoney(g.total),
    'Net Position': '',
  }));

  if (rows.length > 0) {
    rows.push({
      'Direction / Method': 'Net position',
      Transactions: '',
      'Total Amount': '',
      'Net Position': formatMoney(net),
    });
  }
  return rows;
}

// ── Vendor Performance (TER-1575) ─────────────────────────────────────────────

function buildVendorPerformanceRows(vendorData: GridRow[]): ReportRow[] {
  const groups: Record<string, { billCount: number; totalBilled: number; outstanding: number }> = {};

  for (const row of vendorData) {
    const vendor = String(row.vendor ?? 'Unknown');
    const status = String(row.status ?? '');
    if (!groups[vendor]) groups[vendor] = { billCount: 0, totalBilled: 0, outstanding: 0 };

    if (status !== 'voided') {
      groups[vendor].totalBilled += Number(row.amount ?? 0);
      groups[vendor].billCount += 1;
    }
    if (!['paid', 'voided'].includes(status)) {
      groups[vendor].outstanding += Number(row.amount ?? 0) - Number(row.amountPaid ?? 0);
    }
  }

  return Object.entries(groups)
    .sort(([, a], [, b]) => b.outstanding - a.outstanding)
    .map(([vendor, g]) => ({
      Vendor: vendor,
      Bills: g.billCount,
      'Total Billed': formatMoney(g.totalBilled),
      'Outstanding Balance': formatMoney(g.outstanding),
    }));
}

// ── Inventory Aging (TER-1574) ─────────────────────────────────────────────────

function buildInventoryAgingRows(inventoryData: GridRow[]): ReportRow[] {
  const active = inventoryData.filter((r) => {
    const status = String(r.status ?? '');
    return ['posted', 'ready'].includes(status) && Number(r.availableQty ?? 0) > 0;
  });

  const buckets: Record<
    string,
    { lotCount: number; totalQty: number; costValue: number; retailValue: number }
  > = {};

  const getBucket = (ageDays: number) => {
    if (ageDays < 30) return 'Fresh (0–29 days)';
    if (ageDays < 60) return 'Watch (30–59 days)';
    return 'Aging (60+ days)';
  };

  for (const row of active) {
    const ageDays = Number(row.ageDays ?? 0);
    const bucket = getBucket(ageDays);
    const qty = Number(row.availableQty ?? 0);
    const unitCost = Number(row.unitCost ?? 0);
    const unitPrice = row.unitPrice != null ? Number(row.unitPrice) : unitCost;

    if (!buckets[bucket]) {
      buckets[bucket] = { lotCount: 0, totalQty: 0, costValue: 0, retailValue: 0 };
    }
    buckets[bucket].lotCount += 1;
    buckets[bucket].totalQty += qty;
    buckets[bucket].costValue += qty * unitCost;
    buckets[bucket].retailValue += qty * unitPrice;
  }

  const bucketOrder = ['Fresh (0–29 days)', 'Watch (30–59 days)', 'Aging (60+ days)'];
  return bucketOrder
    .filter((b) => buckets[b])
    .map((b) => ({
      'Age Range': b,
      Lots: buckets[b].lotCount,
      'Total Available Qty': buckets[b].totalQty,
      'Cost Value': formatMoney(buckets[b].costValue),
      'Retail Value': formatMoney(buckets[b].retailValue),
    }));
}

// ── Category Performance (TER-1576) ───────────────────────────────────────────

function buildCategoryPerformanceRows(inventoryData: GridRow[]): ReportRow[] {
  const active = inventoryData.filter((r) => {
    const status = String(r.status ?? '');
    return ['posted', 'ready'].includes(status) && Number(r.availableQty ?? 0) > 0;
  });

  const groups: Record<
    string,
    { lotCount: number; totalQty: number; costValue: number; retailValue: number }
  > = {};

  for (const row of active) {
    const category = String(row.category ?? 'Uncategorized');
    const qty = Number(row.availableQty ?? 0);
    const unitCost = Number(row.unitCost ?? 0);
    const unitPrice = row.unitPrice != null ? Number(row.unitPrice) : unitCost;

    if (!groups[category]) {
      groups[category] = { lotCount: 0, totalQty: 0, costValue: 0, retailValue: 0 };
    }
    groups[category].lotCount += 1;
    groups[category].totalQty += qty;
    groups[category].costValue += qty * unitCost;
    groups[category].retailValue += qty * unitPrice;
  }

  return Object.entries(groups)
    .sort(([, a], [, b]) => b.retailValue - a.retailValue)
    .map(([category, g]) => ({
      Category: category,
      Lots: g.lotCount,
      'Available Qty': g.totalQty,
      'Cost Value': formatMoney(g.costValue),
      'Retail Value': formatMoney(g.retailValue),
    }));
}

// ── Client Balances (TER-1576) ─────────────────────────────────────────────────

function buildClientBalancesRows(clientsData: GridRow[]): ReportRow[] {
  return clientsData.map((row) => ({
    Client: String(row.name ?? ''),
    'Open Orders': Number(row.openInvoiceCount ?? 0),
    Balance: formatMoney(Number(row.balance ?? 0)),
    'Credit Limit': formatMoney(Number(row.creditLimit ?? 0)),
    'Available Credit': formatMoney(Number(row.headroom ?? 0)),
  }));
}

// ── Client Sales History (TER-1576) ───────────────────────────────────────────

function buildClientSalesHistoryRows(salesData: GridRow[]): ReportRow[] {
  const groups: Record<
    string,
    { orderCount: number; postedRevenue: number; pipeline: number }
  > = {};

  for (const row of salesData) {
    const customer = String(row.customer ?? 'Unknown');
    const status = String(row.status ?? '');
    if (!groups[customer]) groups[customer] = { orderCount: 0, postedRevenue: 0, pipeline: 0 };
    groups[customer].orderCount += 1;
    if (status === 'posted') {
      groups[customer].postedRevenue += Number(row.total ?? 0);
    }
    if (['confirmed', 'draft'].includes(status)) {
      groups[customer].pipeline += Number(row.total ?? 0);
    }
  }

  return Object.entries(groups)
    .sort(([, a], [, b]) => b.postedRevenue - a.postedRevenue)
    .map(([customer, g]) => ({
      Client: customer,
      'Total Orders': g.orderCount,
      'Posted Revenue': formatMoney(g.postedRevenue),
      'In Pipeline': formatMoney(g.pipeline),
    }));
}

// ── Utility ───────────────────────────────────────────────────────────────────

function downloadText(filename: string, value: string, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
