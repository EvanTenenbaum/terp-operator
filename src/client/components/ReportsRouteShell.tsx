/**
 * ReportsRouteShell — Phase 6 scaffold
 *
 * This file ships the Reports route as a structured stub: 7 report tabs with
 * realistic column headers, empty tables, and clear TODO markers. No live tRPC
 * queries are wired yet — all data is static so the shell can ship before math
 * fixtures are ready.
 *
 * TODO(phase6): wire real report queries once math fixtures pass. See each
 * report definition below for the expected query name.
 * Reference: docs/roadmap/phase-readiness/6.md
 */

import { BarChart3, Download } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from './EmptyState';

// ── Report registry ───────────────────────────────────────────────────────────
// Each entry drives the chip, the section heading, the description, and the
// empty table column headers. Mark `gated: true` to show a notice instead of
// a table (used for Closeout Period until Phase 5 archive gates pass).

type ReportDef = {
  key: string;
  label: string;
  description: string;
  columns: readonly string[];
  /** When true, renders a phase-gate notice instead of an empty table. */
  gated?: boolean;
};

const REPORT_DEFS: readonly ReportDef[] = [
  {
    key: 'revenue-summary',
    label: 'Revenue Summary',
    description: 'Total revenue by status, period, and category.',
    // TODO(phase6): wire queries.revenueReport — group by period + category
    columns: ['Period', 'Category', 'Units', 'Revenue', 'Avg Unit Price'],
  },
  {
    key: 'payables-aging',
    label: 'Payables Aging',
    description: 'Open vendor bills bucketed by days outstanding.',
    // TODO(phase6): wire queries.payablesAgingReport — bucket by daysOutstanding
    columns: ['Vendor', 'Bill ID', 'Days Outstanding', 'Amount Due', 'Status'],
  },
  {
    key: 'receivables-aging',
    label: 'Receivables Aging',
    description: 'Open customer balances bucketed by days outstanding.',
    // TODO(phase6): wire queries.receivablesAgingReport — bucket by daysOutstanding
    columns: ['Customer', 'Invoice ID', 'Days Outstanding', 'Balance Due', 'Status'],
  },
  {
    key: 'inventory-aging',
    label: 'Inventory Aging',
    description: 'Available inventory value grouped by batch age.',
    // TODO(phase6): wire queries.inventoryAgingReport — group by ageBucket
    columns: ['Batch', 'Category', 'Age (days)', 'QOH', 'Carrying Value'],
  },
  {
    key: 'category-performance',
    label: 'Category Performance',
    description: 'Sales volume and margin by product category.',
    // TODO(phase6): wire queries.categoryPerformanceReport — group by category
    columns: ['Category', 'Units Sold', 'Revenue', 'COGS', 'Margin %'],
  },
  {
    key: 'cash-flow',
    label: 'Cash Flow',
    description: 'Money in and out grouped by method and direction.',
    // TODO(phase6): wire queries.cashFlowReport — group by direction + method + date
    columns: ['Date', 'Direction', 'Method', 'Amount', 'Running Balance'],
  },
  {
    key: 'closeout-period',
    label: 'Closeout Period',
    description: 'Period closeout summary — available after Phase 5 archive gates.',
    // TODO(phase6): wire queries.closeoutPeriodReport — requires CAP-020 archive gates
    columns: [],
    gated: true,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportsRouteShell() {
  const [activeReport, setActiveReport] = useState(REPORT_DEFS[0].key);

  const currentReport = REPORT_DEFS.find((r) => r.key === activeReport) ?? REPORT_DEFS[0];

  // TODO(phase6): populate rows from the matching tRPC query. Until then all
  // reports are empty — the Export button is intentionally disabled.
  const rows: never[] = [];

  function exportCsv() {
    // TODO(phase6): replace stub CSV with real report rows from tRPC
    const headers = currentReport.columns.slice();
    const csv = headers.join(',') + '\n';
    downloadText(`terp-operator-${currentReport.key}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const canExport = !currentReport.gated && rows.length > 0;

  return (
    <div className="view-stack reports-route-shell">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">
            Operator projections for owner decisions — math fixtures coming in Phase 6.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={exportCsv}
          disabled={!canExport}
          title={
            currentReport.gated
              ? 'Export not available — Phase 5 archive gate required'
              : 'Export available once Phase 6 math fixtures pass'
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* ── Report picker chips ─────────────────────────────────────────────── */}
      <div className="report-chip-row" aria-label="Report picker">
        {REPORT_DEFS.map((report) => (
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
          <EmptyState title="Available after Phase 5 — CAP-020 archive gates required">
            This report requires the Closeout Period archive gate to be complete before data
            is available. Once Phase 5 (Recovery &amp; Closeout) is live, this report will show
            period summary financials.
          </EmptyState>
        </div>
      ) : (
        <div className="report-table-wrap">
          <div className="mb-3">
            <h2 className="section-title">{currentReport.label}</h2>
            <p className="mt-1 text-sm text-zinc-600">{currentReport.description}</p>
          </div>
          {/* TODO(phase6): replace empty table with live rows from the wired tRPC query */}
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentReport.columns.length || 1}
                    className="py-8 text-center text-sm text-zinc-500"
                  >
                    No data — math fixtures coming in Phase 6
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Bottom action strip ──────────────────────────────────────────────── */}
      <div className="control-band">
        <span className="text-xs text-zinc-500">
          {currentReport.gated
            ? 'Export not available — Phase 5 gate required'
            : 'Export CSV — available once Phase 6 math fixtures pass'}
        </span>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={exportCsv}
          disabled={!canExport}
          title={
            currentReport.gated
              ? 'Export not available — Phase 5 archive gate required'
              : 'Export available once Phase 6 math fixtures pass'
          }
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Export report
        </button>
      </div>
    </div>
  );
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
