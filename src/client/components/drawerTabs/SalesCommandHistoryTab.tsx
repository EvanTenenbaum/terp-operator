import { trpc } from '../../api/trpc';
import { commandLabelFor } from '../../../shared/commandCatalog';

/**
 * SalesCommandHistoryTab — recent commands on the active sales order.
 *
 * CAP-007 (Phase 1 extension): Surfaces the command log for the selected
 * order so operators can see what has been done and by whom without
 * leaving the Sales workspace.
 *
 * Uses the existing relationshipSummary query (which returns a `commands`
 * array) scoped to the order's customer, and filters to this orderId.
 * If no history query for orders exists yet, shows a graceful placeholder.
 */

interface SalesCommandHistoryTabProps {
  orderId: string;
  customerId?: string;
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-US');
}

export function SalesCommandHistoryTab({ orderId, customerId }: SalesCommandHistoryTabProps) {
  const relationship = trpc.context.relationshipSummary.useQuery(
    { customerId: customerId, vendorId: undefined },
    { enabled: Boolean(customerId) }
  );

  const allCommands = relationship.data?.commands ?? [];
  // Filter to commands referencing this order if the field is present,
  // otherwise show all recent customer commands as a proxy.
  const commands = allCommands.filter(
    (cmd) =>
      !cmd.targetId ||
      String(cmd.targetId) === orderId ||
      String(cmd.orderId) === orderId
  );
  const displayCommands = commands.length ? commands : allCommands.slice(0, 10);

  if (!customerId) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Command history</h2>
        <div className="drawer-empty mt-3">No customer selected.</div>
      </div>
    );
  }

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Command history</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Order <span className="font-mono">{orderId.slice(0, 8)}…</span>
      </p>

      {relationship.isLoading ? (
        <div className="drawer-empty mt-3">Loading…</div>
      ) : displayCommands.length ? (
        <div className="mt-3 grid gap-1 text-xs">
          {displayCommands.slice(0, 15).map((cmd) => (
            <div key={String(cmd.id)} className="activity-row">
              <span className="font-medium">
                {commandLabelFor(String(cmd.commandName ?? ''))}
              </span>
              <span className="text-zinc-500">{String(cmd.actorName ?? '-')}</span>
              <span
                className={
                  String(cmd.status) === 'ok' || String(cmd.status) === 'success'
                    ? 'text-green-700'
                    : String(cmd.status) === 'error'
                    ? 'text-red-600'
                    : 'text-zinc-400'
                }
              >
                {String(cmd.status ?? '-')}
              </span>
              <span className="text-zinc-400">{dateish(cmd.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="drawer-empty mt-3">
          No commands found for this order.
        </div>
      )}
    </div>
  );
}
