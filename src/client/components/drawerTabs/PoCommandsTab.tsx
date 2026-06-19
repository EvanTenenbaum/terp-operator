import { useCommandRunner } from '../useCommandRunner';
import { trpc } from '../../api/trpc';

/**
 * PoCommandsTab — status-aware PO actions for the PO drawer.
 *
 * CMD-PO / TER-1512: Surfaces Approve and Receive buttons based on the PO's
 * current status so operators don't have to navigate back to the inline
 * authoring panel for status-advancing actions.
 */

interface PoCommandsTabProps {
  poId: string | null | undefined;
  poStatus?: string | null;
}

function statusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    finalized: 'Finalized',
    approved: 'Approved',
    ordered: 'Ordered',
    partially_received: 'Partially received',
    received: 'Received',
    cancelled: 'Cancelled',
  };
  return labels[String(status ?? '')] ?? String(status ?? '-');
}

export function PoCommandsTab({ poId, poStatus }: PoCommandsTabProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const utils = trpc.useUtils();
  const enabled = Boolean(poId);

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Commands</h2>
        <div className="drawer-empty mt-3">No PO selected.</div>
      </div>
    );
  }

  const status = String(poStatus ?? '');
  const canApprove = status === 'finalized'; // draft POs must be finalized before approval (commandBus enforces this)
  const canReceive = status === 'approved' || status === 'ordered' || status === 'partially_received';
  const isTerminal = status === 'received' || status === 'cancelled';

  const handleApprove = async () => {
    await runCommand('approvePurchaseOrder', { purchaseOrderId: poId! }, 'Approve PO');
    await utils.intake.intakeQueue.invalidate();
    await utils.queries.grid.invalidate({ view: 'purchaseOrders' });
  };

  const handleReceive = async () => {
    await runCommand('receivePurchaseOrder', { purchaseOrderId: poId! }, 'Receive PO to draft intake');
    await utils.intake.intakeQueue.invalidate();
    await utils.queries.grid.invalidate({ view: 'purchaseOrders' });
  };

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Commands</h2>
      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Status</span>
          <strong>{statusLabel(status)}</strong>
        </div>
      </div>

      {isTerminal ? (
        <div className="drawer-empty mt-4">No actions available — PO is {statusLabel(status).toLowerCase()}.</div>
      ) : (
        <div className="mt-4 grid gap-2">
          {canApprove && (
            <button
              type="button"
              className="primary-button"
              disabled={isRunning}
              onClick={handleApprove}
            >
              Approve PO
            </button>
          )}
          {canReceive && (
            <button
              type="button"
              className="primary-button"
              disabled={isRunning}
              onClick={handleReceive}
            >
              Receive PO to intake
            </button>
          )}
        </div>
      )}
    </div>
  );
}
