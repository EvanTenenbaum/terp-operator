import { useState } from 'react';
import { trpc } from '../api/trpc';

type TabAudience = 'external' | 'internal';

/**
 * Issue #113 Phase 2 + Phase 3 — read-only finalization receipt viewer.
 *
 * Pass `purchaseOrderId` (default kind='purchase_order') for PO receipts,
 * or `kind='sales_order'` + `salesOrderId` for sales/invoice receipts.
 * Both hook sets are always called (rules of hooks); the inactive set
 * passes enabled:false so React Query never fetches for the wrong kind.
 */
export type ReceiptPanelProps =
  | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never }
  | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never };

export function ReceiptPanel(props: ReceiptPanelProps) {
  const kind = props.kind ?? 'purchase_order';
  const isPo = kind === 'purchase_order';
  const isSo = kind === 'sales_order';

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<TabAudience>('external');

  const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
  const poId = isPo ? (props.purchaseOrderId as string) : PLACEHOLDER_UUID;
  const soId = isSo ? (props.salesOrderId as string) : PLACEHOLDER_UUID;

  // PO hook set
  const poExternalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo }
  );
  const poInternalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo && isManagerOrOwner }
  );
  const poSignalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery(
    { purchaseOrderId: poId }, { enabled: isPo }
  );

  // Sales hook set
  const soExternalQuery = trpc.queries.salesOrderExternalReceipt.useQuery(
    { salesOrderId: soId }, { enabled: isSo }
  );
  const soInternalQuery = trpc.queries.salesOrderInternalReceipt.useQuery(
    { salesOrderId: soId }, { enabled: isSo && isManagerOrOwner }
  );
  const soSignalTextQuery = trpc.queries.salesOrderSignalText.useQuery(
    { salesOrderId: soId }, { enabled: isSo }
  );

  const externalQuery = isPo ? poExternalQuery : soExternalQuery;
  const internalQuery = isPo ? poInternalQuery : soInternalQuery;
  const signalTextQuery = isPo ? poSignalTextQuery : soSignalTextQuery;

  const externalReceipt = externalQuery.data ?? null;
  const internalReceipt = internalQuery.data ?? null;

  const isLoading = externalQuery.isLoading || signalTextQuery.isLoading;
  const showEmpty = !isLoading && !externalReceipt && !internalReceipt;

  async function copySignalText() {
    const text = signalTextQuery.data;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignored */ }
  }

  const projection = audience === 'external' ? externalReceipt : internalReceipt;

  return (
    <section data-testid="receipt-panel" className="inline-panel" aria-label="Finalization receipt">
      <header className="control-band">
        <div role="tablist" aria-label="Receipt audience">
          <button type="button" role="tab" data-testid="receipt-tab-external"
            aria-selected={audience === 'external'}
            className={audience === 'external' ? 'primary-button compact-action' : 'secondary-button compact-action'}
            onClick={() => setAudience('external')}>External</button>
          {isManagerOrOwner ? (
            <button type="button" role="tab" data-testid="receipt-tab-internal"
              aria-selected={audience === 'internal'}
              className={audience === 'internal' ? 'primary-button compact-action' : 'secondary-button compact-action'}
              onClick={() => setAudience('internal')}>Internal</button>
          ) : null}
        </div>
        {audience === 'external' ? (
          <button type="button" data-testid="receipt-copy-signal"
            className="secondary-button compact-action"
            onClick={copySignalText} disabled={!signalTextQuery.data}
            title="Copy plain-text receipt for Signal">Copy for Signal</button>
        ) : null}
      </header>
      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. Finalize the {isPo ? 'PO' : 'sale'} to produce one.</p>
      ) : projection ? (
        <ReceiptBody audience={audience} projection={projection} />
      ) : (
        <p className="page-subtitle">No {audience} receipt available.</p>
      )}
    </section>
  );
}

interface ReceiptLineLike { name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string; }
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
      {audience === 'internal' ? <div className="selection-pill warning">INTERNAL — DO NOT SEND</div> : null}
      <div className="drawer-fact-row"><span>{projection.header.title}</span><strong>{projection.header.documentNo}</strong></div>
      <div className="drawer-fact-row"><span>To</span><strong>{projection.header.counterparty}</strong></div>
      <div className="drawer-fact-row"><span>Date</span><strong>{projection.header.dateISO}</strong></div>
      <table className="finder-table">
        <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Subtotal</th><th>Notes</th></tr></thead>
        <tbody>
          {projection.lines.map((l, i) => (
            <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td>{l.unitPrice ?? '-'}</td><td>{l.subtotal}</td><td>{l.notes ?? ''}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="drawer-fact-row"><span>Subtotal</span><strong>{projection.totals.subtotal}</strong></div>
      {projection.totals.adjustments != null ? <div className="drawer-fact-row"><span>Adjustments</span><strong>{projection.totals.adjustments}</strong></div> : null}
      <div className="drawer-fact-row"><span>Total</span><strong>{projection.totals.total}</strong></div>
      {projection.footer?.terms ? <div className="drawer-fact-row"><span>Terms</span><strong>{projection.footer.terms}</strong></div> : null}
      {projection.footer?.reference ? <div className="drawer-fact-row"><span>Ref</span><strong>{projection.footer.reference}</strong></div> : null}
      {audience === 'internal' && projection.internalNotes ? (
        <div className="inline-panel"><div className="section-title">Internal notes</div><p>{projection.internalNotes}</p></div>
      ) : null}
      {audience === 'internal' && projection.cogs ? (
        <div className="inline-panel">
          <div className="section-title">COGS</div>
          {projection.cogs.perLine.map((c, i) => <div key={i} className="drawer-fact-row"><span>{c.name}</span><strong>{c.landedCost ?? c.unitCost ?? '-'}</strong></div>)}
          <div className="drawer-fact-row"><span>Total COGS</span><strong>{projection.cogs.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.margin ? (
        <div className="inline-panel">
          <div className="section-title">Margin</div>
          {projection.margin.perLine.map((m, i) => <div key={i} className="drawer-fact-row"><span>{m.name}</span><strong>{m.marginAbs} ({m.marginPct}%)</strong></div>)}
          <div className="drawer-fact-row"><span>Total margin</span><strong>{projection.margin.total}</strong></div>
        </div>
      ) : null}
      {audience === 'internal' && projection.diagnostics ? (
        <div className="inline-panel">
          <div className="section-title">Diagnostics</div>
          {projection.diagnostics.unresolvedSources?.length ? <div className="drawer-fact-row"><span>Unresolved sources</span><strong>{projection.diagnostics.unresolvedSources.join(', ')}</strong></div> : null}
          {projection.diagnostics.legacyMarkers?.length ? <div className="drawer-fact-row"><span>Legacy markers</span><strong>{projection.diagnostics.legacyMarkers.join(', ')}</strong></div> : null}
        </div>
      ) : null}
    </div>
  );
}
