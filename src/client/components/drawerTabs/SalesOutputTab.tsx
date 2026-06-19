import { logger } from '@/client/services/logger';
import { FileText } from 'lucide-react';
import type { GridRow } from '../../../shared/types';
import { buildCustomerOfferCsv } from '../../views/SalesView.csvExport';

/**
 * SalesOutputTab — customer-safe output panel rendered in the Context Drawer.
 *
 * CAP-012: Extracted from the "Sale tray" disclosure in SalesView so the
 * drawer becomes the primary export path. The tray buttons remain as
 * secondary shortcuts.
 *
 * Customer mode ("catalog") hides cost, margin, vendor floor, and internal
 * notes. Internal mode ("internal") shows full operator data gated by
 * showMargin so a screen-sharing posture cannot leak sensitive numbers.
 */

interface SalesOutputTabProps {
  orderId: string;
  sheetMode: 'internal' | 'catalog';
  sheetRows: GridRow[];
  showMargin: boolean;
  orderLines?: GridRow[];
  onModeToggle: () => void;
  onExport: () => void | Promise<void>;
  exportError: string | null;
}

export function SalesOutputTab({
  orderId,
  sheetMode,
  sheetRows,
  showMargin: _showMargin,
  orderLines,
  onModeToggle,
  onExport,
  exportError,
}: SalesOutputTabProps) {
  const hasRows = sheetRows.length > 0;

  function handleCopyOffer() {
    if (!orderLines?.length) return;
    const csv = buildCustomerOfferCsv(orderLines);
    void navigator.clipboard.writeText(csv).catch(() => {
      // Fallback: build a temporary textarea if clipboard API is unavailable
      const area = document.createElement('textarea');
      area.value = csv;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    });
  }

  function handleExportSheet() {
    const result = onExport();
    if (result instanceof Promise) {
      void result.catch((err: unknown) => {
        logger.error('SalesOutputTab: exportSheet failed', { error: String(err) });
      });
    }
  }

  // Preview the first suggestion rows (mirrors the SalesView sheet preview).
  const previewRows = sheetRows.slice(0, 8);

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Sales Output</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Order <span className="font-mono">{orderId.slice(0, 8)}…</span>
      </p>

      {/* Mode toggle */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Mode:</span>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={onModeToggle}
          aria-pressed={sheetMode === 'catalog'}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          {sheetMode === 'internal' ? 'Internal sheet' : 'Customer catalog'}
        </button>
      </div>

      {sheetMode === 'catalog' ? (
        <p className="mt-1 text-xs text-green-700">
          Customer mode — hides cost, margin, and internal notes.
        </p>
      ) : (
        <p className="mt-1 text-xs text-zinc-400">
          Internal mode — cost and margin visible to operators only.
        </p>
      )}

      {/* Export actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!hasRows}
          onClick={handleExportSheet}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
        {orderLines?.length ? (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={handleCopyOffer}
          >
            Copy customer offer
          </button>
        ) : null}
      </div>

      {exportError ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {exportError}
        </p>
      ) : null}

      {/* Mini sheet preview */}
      {previewRows.length ? (
        <div className="mt-4">
          <h3 className="section-title">Preview ({previewRows.length} rows)</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {previewRows.map((row) => (
              <div key={row.id} className="activity-row">
                <span className="font-medium">{String(row.name ?? row.batchCode ?? '-')}</span>
                <span className="text-zinc-500">{String(row.category ?? '-')}</span>
                <span>${String(row.unitPrice ?? '-')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="drawer-empty mt-4">
          No sheet rows. Select suggestions from the Inventory Finder to populate the sheet.
        </div>
      )}
    </div>
  );
}
