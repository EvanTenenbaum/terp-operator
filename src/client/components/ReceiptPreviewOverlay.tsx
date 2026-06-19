import { useState } from 'react';
import { trpc } from '../api/trpc';

interface ReceiptPreviewOverlayProps {
  purchaseOrderId: string;
  onClose: () => void;
}

type Mode = 'external' | 'internal';

// Local projection shape — mirrors ExternalReceiptProjection / InternalReceiptProjection
// from server/services/projections/types.ts without creating a client→server import.
interface ReceiptLineLike {
  name: string;
  qty: number;
  unitPrice?: number;
  subtotal: number;
  notes?: string;
}

interface ProjectionLike {
  header: { title: string; counterparty: string; dateISO: string; documentNo: string };
  lines: ReceiptLineLike[];
  totals: { subtotal: number; adjustments?: number; total: number };
  footer?: { terms?: string; reference?: string };
  internalNotes?: string;
}

/**
 * Full-screen receipt preview overlay for a finalized Purchase Order.
 *
 * Triggered by the "Preview receipt" button in the PO view when a finalized
 * PO is selected. Loads the document_snapshots receipt (external or internal)
 * and supports print via the .print-receipt-only CSS media query.
 *
 * data-testid attributes match the E2E spec in tests/e2e/receipt-preview.spec.ts.
 */
export function ReceiptPreviewOverlay({ purchaseOrderId, onClose }: ReceiptPreviewOverlayProps) {
  const [mode, setMode] = useState<Mode>('external');

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';

  const externalQuery = trpc.purchaseOrders.purchaseOrderExternalReceipt.useQuery({ purchaseOrderId });
  const internalQuery = trpc.purchaseOrders.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId },
    { enabled: isManagerOrOwner }
  );

  const activeQuery = mode === 'external' ? externalQuery : internalQuery;

  const projection: ProjectionLike | null =
    mode === 'external'
      ? (externalQuery.data as ProjectionLike | null | undefined) ?? null
      : (internalQuery.data as ProjectionLike | null | undefined) ?? null;

  function handlePrint() {
    document.body.classList.add('print-receipt-only');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-receipt-only');
    }, 1000);
  }

  return (
    <div className="receipt-preview-overlay" data-testid="receipt-preview-overlay">
      <div className="receipt-preview-panel">
        {/* control band */}
        <div className="control-band">
          <button
            type="button"
            data-testid="receipt-close-btn"
            className="secondary-button compact-action"
            onClick={onClose}
            aria-label="Close receipt preview"
          >
            Close
          </button>

          <div role="tablist" aria-label="Receipt audience">
            <button
              type="button"
              role="tab"
              data-testid="receipt-mode-external"
              aria-selected={mode === 'external'}
              className={mode === 'external' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setMode('external')}
            >
              External
            </button>
            <button
              type="button"
              role="tab"
              data-testid="receipt-mode-internal"
              aria-selected={mode === 'internal'}
              className={mode === 'internal' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setMode('internal')}
              disabled={!isManagerOrOwner}
            >
              Internal
            </button>
          </div>

          <button
            type="button"
            data-testid="receipt-print-btn"
            className="secondary-button compact-action"
            onClick={handlePrint}
          >
            Print
          </button>
        </div>

        {/* internal watermark — always in DOM; hidden class toggled by mode */}
        <div
          data-testid="internal-watermark"
          className={mode === 'external' ? 'hidden selection-pill warning' : 'selection-pill warning'}
        >
          INTERNAL — DO NOT SEND
        </div>

        {/* receipt body — always rendered so the element is immediately visible */}
        <div data-testid="receipt-preview-body" className="receipt-preview-body-html">
          {activeQuery.isLoading ? (
            <p className="page-subtitle">Loading receipt…</p>
          ) : projection ? (
            <ReceiptContent projection={projection} />
          ) : (
            <p className="page-subtitle">No receipt available for this purchase order.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptContent({ projection }: { projection: ProjectionLike }) {
  return (
    <div className="grid gap-2">
      <div className="drawer-fact-row">
        <span>{projection.header.title}</span>
        <strong>{projection.header.documentNo}</strong>
      </div>
      <div className="drawer-fact-row">
        <span>To</span>
        <strong>{projection.header.counterparty}</strong>
      </div>
      <div className="drawer-fact-row">
        <span>Date</span>
        <strong>{projection.header.dateISO}</strong>
      </div>
      {projection.lines.length > 0 ? (
        <table className="finder-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Subtotal</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {projection.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.name}</td>
                <td>{line.qty}</td>
                <td>{line.unitPrice ?? '—'}</td>
                <td>{line.subtotal}</td>
                <td>{line.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="drawer-fact-row">
        <span>Subtotal</span>
        <strong>{projection.totals.subtotal}</strong>
      </div>
      {projection.totals.adjustments != null ? (
        <div className="drawer-fact-row">
          <span>Adjustments</span>
          <strong>{projection.totals.adjustments}</strong>
        </div>
      ) : null}
      <div className="drawer-fact-row">
        <span>Total</span>
        <strong>{projection.totals.total}</strong>
      </div>
      {projection.footer?.terms ? (
        <div className="drawer-fact-row">
          <span>Terms</span>
          <strong>{projection.footer.terms}</strong>
        </div>
      ) : null}
      {projection.footer?.reference ? (
        <div className="drawer-fact-row">
          <span>Reference</span>
          <strong>{projection.footer.reference}</strong>
        </div>
      ) : null}
      {projection.internalNotes ? (
        <div className="inline-panel">
          <div className="section-title">Internal reconciliation notes</div>
          <p>{projection.internalNotes}</p>
        </div>
      ) : null}
    </div>
  );
}
