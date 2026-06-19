// UX-R02 — Minimal /mobile/intake: verify + flag only
// Decision 7: scope is verify action (existing verify command) and flag-discrepancy
// action (existing discrepancy/reason path). No creation, no posting.
import { useState, useMemo } from 'react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../../components/useCommandRunner';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';
import { useMobileToast } from '../../components/mobile/MobileToast';

interface IntakeBatch {
  id: string;
  batchCode: string;
  name: string;
  status: string;
  intakeQty: string | null;
  expectedQty: string | null;
  notes: string | null;
  purchaseOrderId: string;
}

interface IntakeOrderRow {
  id: string;
  poNo: string;
  vendor: string;
  status: string;
  batches: IntakeBatch[];
}

type ActionMode = null | 'verify' | 'flag';

interface BatchAction {
  batchId: string;
  mode: ActionMode;
}

function statusBadge(status: string) {
  if (status === 'posted') return { label: 'Posted', color: 'var(--m-success-soft)', text: '#1f5a3f' };
  if (status === 'ready') return { label: 'Ready', color: '#e8f3ff', text: '#1e40af' };
  if (status === 'needs_fix') return { label: 'Needs fix', color: 'var(--m-amber-soft)', text: 'var(--m-amber)' };
  if (status === 'returned') return { label: 'Returned', color: '#fce7f3', text: '#be185d' };
  return { label: status, color: 'var(--m-line)', text: 'var(--m-muted)' };
}

/** Batches pending verification: draft or ready but not yet posted */
function pendingBatches(orders: IntakeOrderRow[]): Array<IntakeBatch & { poNo: string; vendor: string }> {
  const result: Array<IntakeBatch & { poNo: string; vendor: string }> = [];
  for (const order of orders) {
    for (const batch of order.batches) {
      if (batch.status === 'draft' || batch.status === 'ready' || batch.status === 'needs_fix') {
        result.push({ ...batch, poNo: order.poNo, vendor: order.vendor });
      }
    }
  }
  return result;
}

export function MobileIntakeView() {
  const [action, setAction] = useState<BatchAction>({ batchId: '', mode: null });
  const [flagReason, setFlagReason] = useState('');

  const { runCommand, isRunning } = useCommandRunner();
  const { addToast } = useMobileToast();

  const me = trpc.auth.me.useQuery();
  const role: string = (me.data as { role?: string } | undefined)?.role ?? 'viewer';
  const canWrite = role !== 'viewer';

  const intakeQuery = trpc.intake.intakeQueue.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();

  const orderRows = (intakeQuery.data ?? []) as IntakeOrderRow[];
  const batches = useMemo(() => pendingBatches(orderRows), [orderRows]);

  function openAction(batchId: string, mode: 'verify' | 'flag') {
    setAction({ batchId, mode });
    setFlagReason('');
  }

  function closeAction() {
    setAction({ batchId: '', mode: null });
    setFlagReason('');
  }

  async function handleVerify(batch: IntakeBatch & { poNo: string; vendor: string }) {
    // Verify = updateBatch (set intakeQty = expectedQty) + postPurchaseReceipt
    try {
      const intakeQty = Number(batch.intakeQty ?? batch.expectedQty ?? 0);
      if (intakeQty > 0) {
        const updateResult = await runCommand(
          'updateBatch',
          { id: batch.id, intakeQty, availableQty: intakeQty },
          'Verify intake batch — apply qty'
        );
        if (!updateResult.ok) return;
      }
      const result = await runCommand(
        'postPurchaseReceipt',
        { batchIds: [batch.id] },
        'Verify intake batch — post receipt'
      );
      if (result.ok) {
        addToast(`${batch.name || batch.batchCode} verified`, 'success');
        closeAction();
        void utils.intake.intakeQueue.invalidate();
      }
    } catch {
      // useCommandRunner surfaces errors via toast pipeline
    }
  }

  async function handleFlag(batchId: string, reason: string) {
    if (!reason.trim()) return;
    try {
      const result = await runCommand(
        'flagBatch',
        { batchId, reason: reason.trim() },
        'Flag intake discrepancy from mobile'
      );
      if (result.ok) {
        const batch = batches.find(b => b.id === batchId);
        addToast(`${batch?.name || batchId} flagged for attention`, 'success');
        closeAction();
        void utils.intake.intakeQueue.invalidate();
      }
    } catch {
      // surfaced by useCommandRunner
    }
  }

  if (intakeQuery.isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-8">
        <p style={{ color: 'var(--m-muted)' }}>Loading intake…</p>
      </div>
    );
  }

  if (intakeQuery.isError) {
    return (
      <div className="px-4 py-6">
        <p style={{ color: 'var(--m-danger)' }}>Failed to load intake queue.</p>
        <button
          type="button"
          onClick={() => void intakeQuery.refetch()}
          className="mt-3 m-btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <MobileEmptyState
        icon="📦"
        headline="No batches pending verification"
        body="All intake batches are verified or there are no active PO receipts."
      />
    );
  }

  const activeBatch = action.batchId ? batches.find(b => b.id === action.batchId) ?? null : null;

  return (
    <div>
      {/* Header info strip */}
      <div
        className="border-b px-4 py-3"
        style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)' }}
      >
        <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
          {batches.length} batch{batches.length === 1 ? '' : 'es'} pending verification
        </p>
      </div>

      {/* Batch list */}
      <div className="divide-y px-4" style={{ borderColor: 'var(--m-line)' }}>
        {batches.map(batch => {
          const badge = statusBadge(batch.status);
          const isExpanded = action.batchId === batch.id;

          return (
            <div key={batch.id}>
              {/* Batch row */}
              <div className="flex min-h-[64px] flex-col gap-1 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
                      {batch.name || batch.batchCode}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                      {batch.poNo} · {batch.vendor}
                    </p>
                    {batch.expectedQty ? (
                      <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                        Expected {batch.expectedQty}
                        {batch.intakeQty && batch.intakeQty !== batch.expectedQty
                          ? ` · Received ${batch.intakeQty}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: badge.color, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Action buttons — only for write-capable users */}
                {canWrite && !isExpanded && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      aria-label={`Verify ${batch.name || batch.batchCode}`}
                      onClick={() => openAction(batch.id, 'verify')}
                      className="m-chip"
                      style={{ color: 'var(--m-accent)', borderColor: 'var(--m-accent)' }}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      aria-label={`Flag discrepancy for ${batch.name || batch.batchCode}`}
                      onClick={() => openAction(batch.id, 'flag')}
                      className="m-chip"
                      style={{ color: 'var(--m-amber)', borderColor: 'var(--m-amber)' }}
                    >
                      Flag discrepancy
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded verify confirm panel */}
              {isExpanded && action.mode === 'verify' && activeBatch && (
                <div
                  className="mb-3 rounded-xl p-3 space-y-2"
                  style={{ background: 'var(--m-success-soft)' }}
                >
                  <p className="text-sm font-medium" style={{ color: '#1f5a3f' }}>
                    Verify and post receipt for <strong>{activeBatch.name || activeBatch.batchCode}</strong>?
                  </p>
                  <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                    Expected qty: {activeBatch.expectedQty ?? '—'}
                    {activeBatch.intakeQty ? ` · Received qty: ${activeBatch.intakeQty}` : ''}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="m-btn-primary flex-1"
                      disabled={isRunning}
                      onClick={() => void handleVerify(activeBatch)}
                      aria-label="Confirm verify"
                    >
                      {isRunning ? 'Verifying…' : 'Confirm verify'}
                    </button>
                    <button
                      type="button"
                      className="m-btn-secondary flex-1"
                      onClick={closeAction}
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded flag discrepancy panel */}
              {isExpanded && action.mode === 'flag' && activeBatch && (
                <div
                  className="mb-3 rounded-xl p-3 space-y-2"
                  style={{ background: 'var(--m-amber-soft)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--m-amber)' }}>
                    Flag discrepancy for <strong>{activeBatch.name || activeBatch.batchCode}</strong>
                  </p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>
                      Reason (required)
                    </span>
                    <input
                      type="text"
                      value={flagReason}
                      onChange={e => setFlagReason(e.target.value)}
                      placeholder="Describe the discrepancy…"
                      aria-label="Discrepancy reason"
                      style={{
                        width: '100%',
                        height: 40,
                        borderRadius: 12,
                        border: '1px solid var(--m-line)',
                        padding: '0 12px',
                        background: 'var(--m-field)',
                        color: 'var(--m-ink)',
                        fontSize: 14,
                      }}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="m-btn-primary flex-1"
                      disabled={isRunning || !flagReason.trim()}
                      onClick={() => void handleFlag(activeBatch.id, flagReason)}
                      aria-label="Submit flag"
                    >
                      {isRunning ? 'Flagging…' : 'Submit flag'}
                    </button>
                    <button
                      type="button"
                      className="m-btn-secondary flex-1"
                      onClick={closeAction}
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
