import { trpc } from '../../api/trpc';

/**
 * LotMovementTab — inventory movement history for the active lot/batch.
 *
 * CAP-011 / TER-1486: Shows the ordered movement timeline (intake,
 * adjustments, sales reservations, returns) for the selected batch so the
 * operator can audit qty changes without leaving the Intake/Inventory
 * workspace.
 *
 * Uses `queries.inventoryMovements` scoped by batchId. The batchId is
 * expected from the active drawer entity (`lot` entity id).
 */

interface LotMovementTabProps {
  batchId: string | null | undefined;
}

function qtyish(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US', { maximumFractionDigits: 3 })}`;
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-US');
}

function kindTone(kind: unknown): string {
  const k = String(kind ?? '').toLowerCase();
  if (k === 'intake' || k === 'in' || k === 'receipt') return 'text-green-700';
  if (k === 'sale' || k === 'out' || k === 'shipment') return 'text-blue-700';
  if (k === 'adjustment' || k === 'flag') return 'text-amber-700';
  if (k === 'return' || k === 'rejection') return 'text-red-600';
  return 'text-zinc-500';
}

export function LotMovementTab({ batchId }: LotMovementTabProps) {
  const enabled = Boolean(batchId);
  const movements = trpc.inventory.inventoryMovements.useQuery(
    { batchId: batchId ?? undefined },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Movement</h2>
        <div className="drawer-empty mt-3">Select a batch to view its movement history.</div>
      </div>
    );
  }

  const rows = movements.data ?? [];
  const netDelta = rows.reduce((sum, row) => sum + Number(row.qtyDelta ?? 0), 0);

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Movement</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Batch <span className="font-mono">{batchId!.slice(0, 8)}…</span>
      </p>

      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Movements</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Net change</span>
          <strong className={netDelta >= 0 ? 'text-green-700' : 'text-red-600'}>
            {qtyish(netDelta)}
          </strong>
        </div>
      </div>

      {movements.isLoading ? (
        <div className="drawer-empty mt-4">Loading movements…</div>
      ) : rows.length ? (
        <div className="mt-4">
          <h3 className="section-title">Timeline (newest first)</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {rows.map((row) => (
              <div key={String(row.id)} className="activity-row">
                <span className={`font-medium ${kindTone(row.kind)}`}>
                  {String(row.kind ?? '-')}
                </span>
                <span className={Number(row.qtyDelta ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {qtyish(row.qtyDelta)}
                </span>
                <span className="text-zinc-500">
                  {String(row.reason ?? '-')}
                </span>
                <span className="text-zinc-400">{dateish(row.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="drawer-empty mt-4">No movement recorded for this batch yet.</div>
      )}
    </div>
  );
}
