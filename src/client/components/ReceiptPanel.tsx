import { useState } from 'react';
import { trpc } from '../api/trpc';

interface ReceiptPanelProps {
  purchaseOrderId: string;
}

type TabAudience = 'external' | 'internal';

/**
 * Issue #113 Phase 2 — read-only finalization receipt viewer for a PO.
 *
 * The panel fetches both audiences via tRPC (Internal returns null /
 * throws FORBIDDEN for non-manager users — we hide the tab and skip the
 * query for those roles to avoid noisy error toasts).
 *
 * "Copy for Signal" pulls the server-rendered plain-text string from
 * trpc.queries.purchaseOrderSignalText so the renderer stays in one place.
 */
export function ReceiptPanel({ purchaseOrderId }: ReceiptPanelProps) {
  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<TabAudience>('external');

  const externalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery({ purchaseOrderId });
  const internalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId },
    { enabled: isManagerOrOwner }
  );
  const signalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery({ purchaseOrderId });

  const externalReceipt = externalQuery.data ?? null;
  const internalReceipt = internalQuery.data ?? null;

  const isLoading = externalQuery.isLoading || signalTextQuery.isLoading;
  const showEmpty = !isLoading && !externalReceipt && !internalReceipt;

  async function copySignalText() {
    const text = signalTextQuery.data;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard rejected — fall back is the user retrying after permission grant */
    }
  }

  const projection = audience === 'external' ? externalReceipt : internalReceipt;

  return (
    <section data-testid="receipt-panel" className="inline-panel" aria-label="Finalization receipt">
      <header className="control-band">
        <div role="tablist" aria-label="Receipt audience">
          <button
            type="button"
            role="tab"
            data-testid="receipt-tab-external"
            aria-selected={audience === 'external'}
            className={audience === 'external' ? 'primary-button compact-action' : 'secondary-button compact-action'}
            onClick={() => setAudience('external')}
          >
            External
          </button>
          {isManagerOrOwner ? (
            <button
              type="button"
              role="tab"
              data-testid="receipt-tab-internal"
              aria-selected={audience === 'internal'}
              className={audience === 'internal' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setAudience('internal')}
            >
              Internal
            </button>
          ) : null}
        </div>
        {audience === 'external' ? (
          <button
            type="button"
            data-testid="receipt-copy-signal"
            className="secondary-button compact-action"
            onClick={copySignalText}
            disabled={!signalTextQuery.data}
            title="Copy plain-text receipt for Signal"
          >
            Copy for Signal
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. Finalize the PO to produce one.</p>
      ) : projection ? (
        <ReceiptBody audience={audience} projection={projection} />
      ) : (
        <p className="page-subtitle">No {audience} receipt available.</p>
      )}
    </section>
  );
}

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
  cogs?: { perLine: Array<{ name: string; unitCost?: number; landedCost?: number }>; total: number };
  margin?: { perLine: Array<{ name: string; marginAbs: number; marginPct: number }>; total: number };
  diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
}

function ReceiptBody({ audience, projection }: { audience: TabAudience; projection: ProjectionLike }) {
  return (
    <div className="view-stack">
      {audience === 'internal' ? (
        <div className="selection-pill warning">INTERNAL — DO NOT SEND</div>
      ) : null}
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
      <table className="finder-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Subtotal</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {projection.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td>{l.qty}</td>
              <td>{l.unitPrice ?? '-'}</td>
              <td>{l.subtotal}</td>
              <td>{l.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="drawer-fact-row"><span>Subtotal</span><strong>{projection.totals.subtotal}</strong></div>
      {projection.totals.adjustments != null ? (
        <div className="drawer-fact-row"><span>Adjustments</span><strong>{projection.totals.adjustments}</strong></div>
      ) : null}
      <div className="drawer-fact-row"><span>Total</span><strong>{projection.totals.total}</strong></div>
      {projection.footer?.terms ? (
        <div className="drawer-fact-row"><span>Terms</span><strong>{projection.footer.terms}</strong></div>
      ) : null}

      {audience === 'internal' && projection.internalNotes ? (
        <div className="inline-panel">
          <div className="section-title">Internal notes</div>
          <p>{projection.internalNotes}</p>
        </div>
      ) : null}
      {audience === 'internal' && projection.cogs ? (
        <div className="inline-panel">
          <div className="section-title">COGS</div>
          {projection.cogs.perLine.map((c, i) => (
            <div key={i} className="drawer-fact-row">
              <span>{c.name}</span>
              <strong>{c.landedCost ?? c.unitCost ?? '-'}</strong>
            </div>
          ))}
          <div className="drawer-fact-row"><span>Total COGS</span><strong>{projection.cogs.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.margin ? (
        <div className="inline-panel">
          <div className="section-title">Margin</div>
          {projection.margin.perLine.map((m, i) => (
            <div key={i} className="drawer-fact-row">
              <span>{m.name}</span>
              <strong>{m.marginAbs} ({m.marginPct}%)</strong>
            </div>
          ))}
          <div className="drawer-fact-row"><span>Total margin</span><strong>{projection.margin.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.diagnostics ? (
        <div className="inline-panel">
          <div className="section-title">Diagnostics</div>
          {projection.diagnostics.unresolvedSources?.length ? (
            <div className="drawer-fact-row">
              <span>Unresolved sources</span>
              <strong>{projection.diagnostics.unresolvedSources.join(', ')}</strong>
            </div>
          ) : null}
          {projection.diagnostics.legacyMarkers?.length ? (
            <div className="drawer-fact-row">
              <span>Legacy markers</span>
              <strong>{projection.diagnostics.legacyMarkers.join(', ')}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
