/**
 * ReportView — read-only report/summary template.
 *
 * Renders a header with title and optional export controls, plus a list of
 * collapsible report sections. Designed for CloseoutView, ClientLedgerView,
 * and similar reporting views.
 *
 * Sections are rendered in order. Each section has a collapsible body
 * controlled by `expandedSections` state.
 */

import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ExportFormat } from '../components/FilterToolbar';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportSection {
  /** Unique key for collapse state tracking. */
  key: string;
  /** Section heading shown in the collapse toggle. */
  title: string;
  /** Content renderer. Return null to hide the entire section (including header). */
  render: () => ReactNode;
  /** When true the section starts expanded (default true). */
  defaultExpanded?: boolean;
}

export interface ReportViewProps {
  /** View key for data attributes. */
  viewKey: string;
  /** Title displayed in the report header. */
  title: string;
  /** Optional subtitle rendered below the title. */
  subtitle?: string;
  /** Report sections in display order. */
  sections?: ReportSection[];
  /** Export handler. When provided an export button is shown in the header. */
  onExport?: (format: ExportFormat) => void;
  /** When true, shows a loading skeleton instead of content. */
  loading?: boolean;
  /** When true, shows an error banner with a retry action. */
  error?: boolean;
  /** Callback for the error retry button. */
  onRetry?: () => void;
  /** Children rendered below all sections (e.g. a grid or additional content). */
  children?: ReactNode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPORT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  excel: 'Excel',
  pdf: 'PDF',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportView({
  viewKey,
  title,
  subtitle,
  sections,
  onExport,
  loading = false,
  error = false,
  onRetry,
  children,
}: ReportViewProps): ReactNode {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!sections) return new Set();
    return new Set(
      sections.filter((s) => s.defaultExpanded !== false).map((s) => s.key),
    );
  });

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="view-stack" data-view-key={viewKey} data-testid={`report-view-${viewKey}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {onExport ? (
          <div className="flex items-center gap-1">
            {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                className="secondary-button compact-action"
                onClick={() => onExport(format)}
                title={`Export as ${EXPORT_LABELS[format]}`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{EXPORT_LABELS[format]}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Loading state ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="inline-panel" role="status" aria-busy="true">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded border border-line bg-zinc-100" />
            ))}
          </div>
        </div>
      ) : error ? (
        /* ── Error state ──────────────────────────────────────────────────── */
        <div
          className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <span>Failed to load report data.</span>
          {onRetry ? (
            <button
              type="button"
              className="ml-auto text-xs underline hover:no-underline"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : sections && sections.length > 0 ? (
        /* ── Sections ──────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          {sections.map((section) => {
            const rendered = section.render();
            // Suppress the entire section (header + body) when render returns null.
            if (rendered === null || rendered === undefined || rendered === false) return null;

            const isExpanded = expanded.has(section.key);

            return (
              <section key={section.key} className="inline-panel">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:shadow-focus"
                  aria-expanded={isExpanded}
                  onClick={() => toggle(section.key)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-zinc-400" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-400" aria-hidden="true" />
                  )}
                  <h2 className="section-title">{section.title}</h2>
                </button>
                {isExpanded ? <div className="mt-3">{rendered}</div> : null}
              </section>
            );
          })}
        </div>
      ) : (
        /* ── Empty state ───────────────────────────────────────────────────── */
        <div className="inline-panel" role="status">
          <div className="flex min-h-40 flex-col items-center justify-center text-center">
            <h3 className="text-sm font-semibold text-ink">Nothing to report yet.</h3>
            <p className="mt-2 max-w-xl text-sm text-zinc-600">
              Report data will appear here once the relevant records are posted.
            </p>
          </div>
        </div>
      )}

      {/* ── Additional content ──────────────────────────────────────────────── */}
      {children}
    </div>
  );
}
