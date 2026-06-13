import { useState } from 'react';
import { trpc } from '../api/trpc';

type TabAudience = 'external' | 'internal';

/**
 * Issue #113 Phase 2-4 — read-only finalization receipt viewer.
 * Supports 4 kinds: purchase_order, sales_order, payment, vendor_payment.
 * All four hook triples are always called (rules of hooks); only one set has enabled:true.
 */
export type ReceiptPanelProps =
  | { kind?: 'purchase_order'; purchaseOrderId: string; salesOrderId?: never; paymentId?: never; vendorPaymentId?: never }
  | { kind: 'sales_order'; salesOrderId: string; purchaseOrderId?: never; paymentId?: never; vendorPaymentId?: never }
  | { kind: 'payment'; paymentId: string; purchaseOrderId?: never; salesOrderId?: never; vendorPaymentId?: never }
  | { kind: 'vendor_payment'; vendorPaymentId: string; purchaseOrderId?: never; salesOrderId?: never; paymentId?: never };

export function ReceiptPanel(props: ReceiptPanelProps) {
  const kind = props.kind ?? 'purchase_order';
  const isPo = kind === 'purchase_order';
  const isSo = kind === 'sales_order';
  const isPayment = kind === 'payment';
  const isVendorPayment = kind === 'vendor_payment';

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const [audience, setAudience] = useState<TabAudience>('external');

  const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
  const poId = isPo ? (props.purchaseOrderId as string) : PLACEHOLDER_UUID;
  const soId = isSo ? (props.salesOrderId as string) : PLACEHOLDER_UUID;
  const payId = isPayment ? (props.paymentId as string) : PLACEHOLDER_UUID;
  const vpId = isVendorPayment ? (props.vendorPaymentId as string) : PLACEHOLDER_UUID;

  const poExternalQuery = trpc.queries.purchaseOrderExternalReceipt.useQuery({ purchaseOrderId: poId }, { enabled: isPo });
  const poInternalQuery = trpc.queries.purchaseOrderInternalReceipt.useQuery({ purchaseOrderId: poId }, { enabled: isPo && isManagerOrOwner });
  const poSignalTextQuery = trpc.queries.purchaseOrderSignalText.useQuery({ purchaseOrderId: poId }, { enabled: isPo });

  const soExternalQuery = trpc.queries.salesOrderExternalReceipt.useQuery({ salesOrderId: soId }, { enabled: isSo });
  const soInternalQuery = trpc.queries.salesOrderInternalReceipt.useQuery({ salesOrderId: soId }, { enabled: isSo && isManagerOrOwner });
  const soSignalTextQuery = trpc.queries.salesOrderSignalText.useQuery({ salesOrderId: soId }, { enabled: isSo });

  const payExternalQuery = trpc.queries.paymentExternalReceipt.useQuery({ paymentId: payId }, { enabled: isPayment });
  const payInternalQuery = trpc.queries.paymentInternalReceipt.useQuery({ paymentId: payId }, { enabled: isPayment && isManagerOrOwner });
  const paySignalTextQuery = trpc.queries.paymentSignalText.useQuery({ paymentId: payId }, { enabled: isPayment });

  const vpExternalQuery = trpc.queries.vendorPaymentExternalReceipt.useQuery({ vendorPaymentId: vpId }, { enabled: isVendorPayment });
  const vpInternalQuery = trpc.queries.vendorPaymentInternalReceipt.useQuery({ vendorPaymentId: vpId }, { enabled: isVendorPayment && isManagerOrOwner });
  const vpSignalTextQuery = trpc.queries.vendorPaymentSignalText.useQuery({ vendorPaymentId: vpId }, { enabled: isVendorPayment });

  const poPrintHtmlQuery = trpc.queries.purchaseOrderPrintHtml.useQuery(
    { purchaseOrderId: poId, audience },
    { enabled: isPo }
  );
  const soPrintHtmlQuery = trpc.queries.salesOrderPrintHtml.useQuery(
    { salesOrderId: soId, audience },
    { enabled: isSo }
  );
  const payPrintHtmlQuery = trpc.queries.paymentPrintHtml.useQuery(
    { paymentId: payId, audience },
    { enabled: isPayment }
  );
  const vpPrintHtmlQuery = trpc.queries.vendorPaymentPrintHtml.useQuery(
    { vendorPaymentId: vpId, audience },
    { enabled: isVendorPayment }
  );

  const printHtmlQuery = isPo ? poPrintHtmlQuery : isSo ? soPrintHtmlQuery : isPayment ? payPrintHtmlQuery : vpPrintHtmlQuery;

  const externalQuery = isPo ? poExternalQuery : isSo ? soExternalQuery : isPayment ? payExternalQuery : vpExternalQuery;
  const internalQuery = isPo ? poInternalQuery : isSo ? soInternalQuery : isPayment ? payInternalQuery : vpInternalQuery;
  const signalTextQuery = isPo ? poSignalTextQuery : isSo ? soSignalTextQuery : isPayment ? paySignalTextQuery : vpSignalTextQuery;

  const externalReceipt = externalQuery.data ?? null;
  const internalReceipt = internalQuery.data ?? null;
  const isLoading = externalQuery.isLoading || signalTextQuery.isLoading;
  const showEmpty = !isLoading && !externalReceipt && !internalReceipt;

  async function copySignalText() {
    const text = signalTextQuery.data;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignored */ }
  }

  function openPrintWindow(html: string): void {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function handlePrint() {
    const html = printHtmlQuery.data;
    if (!html) return;
    openPrintWindow(html);
  }

  const projection = audience === 'external' ? externalReceipt : internalReceipt;

  function emptyLabel() {
    if (isPo) return 'PO';
    if (isSo) return 'sale';
    if (isPayment) return 'payment';
    return 'vendor payout';
  }

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
          <button type="button" data-testid="receipt-copy-signal" className="secondary-button compact-action"
            onClick={copySignalText} disabled={!signalTextQuery.data}
            title="Copy plain-text receipt for Signal">Copy for Signal</button>
        ) : null}
        <button type="button" data-testid="receipt-print" className="secondary-button compact-action"
          onClick={handlePrint} disabled={!printHtmlQuery.data}
          title="Print receipt">Print</button>
      </header>
      {isLoading ? (
        <p className="page-subtitle">Loading receipt…</p>
      ) : showEmpty ? (
        <p className="page-subtitle">No receipt generated yet. {isPo ? 'Finalize' : isPayment ? 'Log' : 'Post'} the {emptyLabel()} to produce one.</p>
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
  const hasLines = projection.lines.length > 0;
  return (
    <div className="view-stack">
      {audience === 'internal' ? <div className="selection-pill warning">INTERNAL — DO NOT SEND</div> : null}
      <div className="drawer-fact-row"><span>{projection.header.title}</span><strong>{projection.header.documentNo}</strong></div>
      <div className="drawer-fact-row"><span>To</span><strong>{projection.header.counterparty}</strong></div>
      <div className="drawer-fact-row"><span>Date</span><strong>{projection.header.dateISO}</strong></div>
      {hasLines ? (
        <table className="finder-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Subtotal</th><th>Notes</th></tr></thead>
          <tbody>
            {projection.lines.map((l, i) => (
              <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td>{l.unitPrice ?? '-'}</td><td>{l.subtotal}</td><td>{l.notes ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="drawer-fact-row"><span>Subtotal</span><strong>{projection.totals.subtotal}</strong></div>
      {projection.totals.adjustments != null ? <div className="drawer-fact-row"><span>Adjustments</span><strong>{projection.totals.adjustments}</strong></div> : null}
      <div className="drawer-fact-row"><span>Total</span><strong>{projection.totals.total}</strong></div>
      {projection.footer?.terms ? <div className="drawer-fact-row"><span>Terms</span><strong>{projection.footer.terms}</strong></div> : null}
      {projection.footer?.reference ? <div className="drawer-fact-row"><span>Ref</span><strong>{projection.footer.reference}</strong></div> : null}
      {audience === 'internal' && projection.internalNotes ? (
        <div className="inline-panel"><div className="section-title">Internal reconciliation notes</div><p>{projection.internalNotes}</p></div>
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
