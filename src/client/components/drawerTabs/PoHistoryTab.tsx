import { trpc } from '../../api/trpc';
import { commandLabelFor } from '../../../shared/commandCatalog';

/**
 * PoHistoryTab — command journal for the active purchase order.
 *
 * CAP-002 / TER-1474: Shows every command that has affected this PO
 * (createPurchaseOrder, approvePurchaseOrder, postPurchaseReceipt,
 * cancelPurchaseOrder, reversals, …) so the operator can audit who did
 * what without leaving the PO drawer.
 *
 * Uses `queries.relatedCommands({ entityId })`, which reads
 * `command_journal.affected_ids @> [poId]` via the GIN index (migration
 * 0043) so the query stays cheap.
 */

interface PoHistoryTabProps {
  poId: string | null | undefined;
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function statusTone(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'ok' || s === 'success') return 'text-green-700';
  if (s === 'error' || s === 'rejected') return 'text-red-600';
  if (s === 'reversed') return 'text-amber-700';
  return 'text-zinc-500';
}

export function PoHistoryTab({ poId }: PoHistoryTabProps) {
  const enabled = Boolean(poId);
  const commands = trpc.queries.relatedCommands.useQuery(
    { entityId: poId ?? undefined, contactId: undefined },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">History</h2>
        <div className="drawer-empty mt-3">Select a purchase order to view its command history.</div>
      </div>
    );
  }

  const rows = commands.data ?? [];
  const reversed = rows.filter((cmd) => Boolean(cmd.reversedByCommandId)).length;
  const errored = rows.filter(
    (cmd) => String(cmd.status ?? '').toLowerCase() === 'error'
  ).length;

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">History</h2>
      <p className="mt-1 text-xs text-zinc-500">
        PO <span className="font-mono">{poId!.slice(0, 8)}…</span>
      </p>

      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Commands</span>
          <strong>{rows.length}</strong>
        </div>
        {reversed > 0 ? (
          <div className="drawer-fact-row">
            <span>Reversed</span>
            <strong className="text-amber-700">{reversed}</strong>
          </div>
        ) : null}
        {errored > 0 ? (
          <div className="drawer-fact-row">
            <span>Errors</span>
            <strong className="text-red-600">{errored}</strong>
          </div>
        ) : null}
      </div>

      {commands.isLoading ? (
        <div className="drawer-empty mt-4">Loading command history…</div>
      ) : rows.length ? (
        <div className="mt-4">
          <h3 className="section-title">Timeline (newest first)</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {rows.slice(0, 30).map((cmd) => (
              <div key={String(cmd.id)} className="activity-row">
                <span className="font-medium text-ink">
                  {commandLabelFor(String(cmd.commandName ?? ''))}
                </span>
                <span className="text-zinc-500">{String(cmd.actorName ?? '-')}</span>
                <span className={statusTone(cmd.status)}>{String(cmd.status ?? '-')}</span>
                <span className="text-zinc-400">{dateish(cmd.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="drawer-empty mt-4">No commands recorded for this PO yet.</div>
      )}
    </div>
  );
}
