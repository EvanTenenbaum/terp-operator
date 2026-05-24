import { trpc } from '../../api/trpc';
import type { IntakeBatchRow } from '../../views/IntakeView.types';

/**
 * PoLinkedIntakeTab — linked intake batches for the active purchase order.
 *
 * CAP-003 / TER-1476: Surfaces the receipt status of every batch tied to
 * the selected PO so the operator can confirm fulfillment progress from
 * the PO drawer without switching to the Intake view.
 *
 * Uses `queries.intakeQueue` (which returns POs with their batches) and
 * filters client-side to the active PO. A dedicated per-PO query does not
 * exist yet — `intakeQueue` is the closest equivalent and only ranges over
 * approved/ordered/partially_received/received POs with at least one batch
 * in a tracked status, so empty results genuinely mean "nothing to show".
 */

interface PoLinkedIntakeTabProps {
  poId: string | null | undefined;
}

function qtyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '0';
}

function statusTone(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'posted') return 'text-green-700';
  if (s === 'returned' || s === 'needs_fix') return 'text-amber-700';
  if (s === 'rejected') return 'text-red-600';
  return 'text-zinc-500';
}

export function PoLinkedIntakeTab({ poId }: PoLinkedIntakeTabProps) {
  const enabled = Boolean(poId);
  const intake = trpc.queries.intakeQueue.useQuery(undefined, { enabled });

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Linked intake</h2>
        <div className="drawer-empty mt-3">Select a purchase order to view its receipts.</div>
      </div>
    );
  }

  const order = intake.data?.find((row) => String(row.id) === String(poId));
  const batches = order?.batches ?? [];
  const postedCount = batches.filter((b: IntakeBatchRow) => String(b.status) === 'posted').length;
  const totalCount = batches.length;

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Linked intake</h2>
      <p className="mt-1 text-xs text-zinc-500">
        PO <span className="font-mono">{poId!.slice(0, 8)}…</span>
      </p>

      {intake.isLoading ? (
        <div className="drawer-empty mt-3">Loading receipts…</div>
      ) : !order ? (
        <div className="drawer-empty mt-3">
          No receipts yet. Use <strong>Draft intake</strong> on the PO row to start receiving.
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2">
            <div className="drawer-fact-row">
              <span>Receipts</span>
              <strong>{totalCount}</strong>
            </div>
            <div className="drawer-fact-row">
              <span>Verified</span>
              <strong>
                {postedCount}/{totalCount}
              </strong>
            </div>
            <div className="drawer-fact-row">
              <span>Expected qty</span>
              <strong>{qtyish(order.expectedTotalQty)}</strong>
            </div>
            <div className="drawer-fact-row">
              <span>Received qty</span>
              <strong>{qtyish(order.receivedTotalQty)}</strong>
            </div>
          </div>

          {batches.length ? (
            <div className="mt-4">
              <h3 className="section-title">Batches ({batches.length})</h3>
              <div className="mt-2 grid gap-1 text-xs">
                {batches.map((batch: IntakeBatchRow) => {
                  const expected = Number(batch.expectedQty ?? 0);
                  const actual = Number(batch.intakeQty ?? 0);
                  const mismatch = expected > 0 && actual > 0 && expected !== actual;
                  return (
                    <div key={String(batch.id)} className="activity-row">
                      <span className="font-medium text-ink">{String(batch.batchCode ?? batch.id)}</span>
                      <span className="text-zinc-500">{String(batch.name ?? '-')}</span>
                      <span className={mismatch ? 'text-amber-700' : 'text-zinc-600'}>
                        {qtyish(actual)}/{qtyish(expected)} {String(batch.uom ?? '')}
                      </span>
                      <span className={statusTone(batch.status)}>{String(batch.status ?? '-')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="drawer-empty mt-4">PO is on the intake queue but has no batches yet.</div>
          )}
        </>
      )}
    </div>
  );
}
