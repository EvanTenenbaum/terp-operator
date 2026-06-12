import { CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { GridRow } from '../../shared/types';
import { columnsByView, EMPTY_ROWS, moneyish, dateish } from './operations/shared';

export function InvoiceDisputesView() {
  const grid = trpc.queries.grid.useQuery({ view: 'disputes' });
  const selectedRows = useUiStore((state) => state.selectedRows.disputes);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedDispute = selected[0];
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canResolve = me.data?.role === 'owner' || me.data?.role === 'manager';

  // State for resolve/reject dialog (replaces native prompt())
  const [dialogMode, setDialogMode] = useState<'resolve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const dialogRef = useFocusTrap<HTMLDivElement>(dialogMode !== null, () => closeDialog());

  function closeDialog() {
    setDialogMode(null);
    setNote('');
  }

  async function handleConfirm() {
    if (!selectedDispute?.id) return;
    const trimmed = note.trim();
    const mode = dialogMode;
    closeDialog();
    if (mode === 'resolve') {
      await runCommand('resolveInvoiceDispute', { disputeId: selectedDispute.id, resolution: trimmed || undefined }, 'Resolve invoice dispute');
    } else if (mode === 'reject') {
      await runCommand('rejectInvoiceDispute', { disputeId: selectedDispute.id, reason: trimmed || undefined }, 'Reject invoice dispute');
    }
  }

  function handleResolve() {
    if (!selectedDispute?.id) return;
    setDialogMode('resolve');
    setNote('');
  }

  function handleReject() {
    if (!selectedDispute?.id) return;
    setDialogMode('reject');
    setNote('');
  }

  const dialogTitle = dialogMode === 'resolve' ? 'Resolve invoice dispute' : 'Reject invoice dispute';
  const dialogBodyLabel = dialogMode === 'resolve' ? 'Resolution note (optional)' : 'Rejection reason (optional)';
  const dialogConfirmLabel = dialogMode === 'resolve' ? 'Resolve' : 'Reject';

  return (
    <>
      <div className="view-stack">
      <OperatorGrid
        view="disputes"
        title="Invoice disputes"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.disputes ?? []}
        loading={grid.isLoading || isRunning}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('disputes', rows)}
        actions={
          canResolve && selectedDispute ? (
            <>
              <button
                className="primary-button compact-action"
                type="button"
                disabled={isRunning || String(selectedDispute.status ?? '') !== 'open'}
                onClick={handleResolve}
                title={String(selectedDispute.status ?? '') !== 'open' ? 'Only open disputes can be resolved' : 'Resolve this dispute'}
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Resolve
              </button>
              <button
                className="secondary-button compact-action"
                type="button"
                disabled={isRunning || String(selectedDispute.status ?? '') !== 'open'}
                onClick={handleReject}
                title={String(selectedDispute.status ?? '') !== 'open' ? 'Only open disputes can be rejected' : 'Reject this dispute'}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Reject
              </button>
            </>
          ) : null
        }
        emptyTitle="No disputes"
        emptyChildren="Invoice disputes are created from correction journal entries with an invoice reference."
      />
      {selectedDispute ? (
        <section className="inline-panel" aria-label="Dispute details">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="section-title">Dispute details</h2>
              <p className="text-xs text-zinc-600">Invoice {String(selectedDispute.invoiceNo ?? '')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div className="drawer-fact-row"><span>Invoice</span><strong>{String(selectedDispute.invoiceNo ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Customer</span><strong>{String(selectedDispute.customer ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Amount</span><strong>${moneyish(selectedDispute.invoiceAmount)}</strong></div>
            <div className="drawer-fact-row"><span>Invoice status</span><strong>{String(selectedDispute.invoiceStatus ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Dispute status</span><strong>{String(selectedDispute.status ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Created</span><strong>{dateish(selectedDispute.createdAt)}</strong></div>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <span className="text-xs font-bold uppercase text-zinc-500">Reason</span>
              <p className="text-sm text-ink whitespace-pre-wrap">{String(selectedDispute.reason ?? 'No reason provided.')}</p>
            </div>
            {selectedDispute.resolution ? (
              <div>
                <span className="text-xs font-bold uppercase text-zinc-500">Resolution</span>
                <p className="text-sm text-ink whitespace-pre-wrap">{String(selectedDispute.resolution)}</p>
              </div>
             ) : null}
           </div>
         </section>
       ) : null}
     </div>
       {dialogMode && createPortal(
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeDialog} data-testid="dispute-dialog-backdrop">
           <div
             ref={dialogRef}
             role="dialog"
             aria-modal="true"
             aria-labelledby="dispute-dialog-title"
             className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
             onClick={(e) => e.stopPropagation()}
           >
             <h2 id="dispute-dialog-title" className="text-lg font-semibold text-zinc-900">{dialogTitle}</h2>
             <p className="mt-2 text-sm text-zinc-600">
               {dialogMode === 'resolve'
                 ? 'Record a resolution note for this dispute.'
                 : 'Provide a reason for rejecting this dispute.'}
             </p>
             <div className="mt-4">
               <label htmlFor="dispute-dialog-note" className="mb-1 block text-sm font-medium text-zinc-700">
                 {dialogBodyLabel}
               </label>
               <textarea
                 id="dispute-dialog-note"
                 value={note}
                 onChange={(e) => setNote(e.target.value)}
                 className="w-full rounded border border-zinc-300 px-3 py-2 text-sm resize-y min-h-[80px]"
                 placeholder={dialogMode === 'resolve' ? 'e.g., Resolved after customer review' : 'e.g., Insufficient evidence'}
                 rows={3}
                 autoFocus
               />
             </div>
             <div className="mt-4 flex flex-row-reverse gap-2">
               <button
                 type="button"
                 className={dialogMode === 'reject'
                   ? 'inline-flex h-8 items-center justify-center gap-2 border border-danger bg-danger px-3 text-sm font-medium text-white transition focus:outline-none focus-visible:shadow-focus hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'
                   : 'btn-primary'}
                 onClick={handleConfirm}
                 disabled={isRunning}
                 data-testid="dispute-dialog-confirm"
               >
                 {isRunning ? 'Processing...' : dialogConfirmLabel}
               </button>
               <button
                 type="button"
                 className="secondary-button compact-action"
                 onClick={closeDialog}
                 data-testid="dispute-dialog-cancel"
               >
                 Cancel
               </button>
             </div>
           </div>
         </div>,
         document.body
       )}
     </>
   );
 }
