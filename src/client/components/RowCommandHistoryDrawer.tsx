import { RotateCcw } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { commandLabelFor } from '../../shared/commandCatalog';
import type { GridRow } from '../../shared/types';
import { InspectorDrawer } from './templates';

/**
 * Row command history — audited command journal + inventory movements for a
 * selected row, with manager+ reversal.
 *
 * The body is exported separately so it can render as a tab of the unified
 * RowInspector; the standalone drawer wrapper is kept for any direct callers.
 */
export function RowCommandHistoryBody({ row }: { row: GridRow }) {
  const commands = trpc.queries.relatedCommands.useQuery({ entityId: String(row.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(row.id) });
  const movements = trpc.inventory.inventoryMovements.useQuery({ batchId: String(row.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(row.id) });
  const me = trpc.auth.me.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const canReverse = me.data?.role === 'manager' || me.data?.role === 'owner';

  return (
    <>
      {movements.data?.length ? (
        <section className="mb-3">
          <h3 className="section-title">Inventory movements</h3>
          {movements.data.map((movement) => (
            <div className="row-history-card" key={String(movement.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{String(movement.kind)}</span>
                <span>{String(movement.qtyDelta)} qty</span>
              </div>
              <div className="mt-1 text-xs text-zinc-600">{new Date(String(movement.createdAt)).toLocaleString('en-US')} / {String(movement.reason ?? 'No reason recorded')}</div>
            </div>
          ))}
        </section>
      ) : null}
      {commands.isLoading ? <div className="text-sm text-zinc-600">Loading command history...</div> : null}
      {!commands.isLoading && !commands.data?.length ? <div className="text-sm text-zinc-600">No commands found for this row yet.</div> : null}
      {commands.data?.map((command) => {
        const reversible = command.status === 'ok' && !command.reversedByCommandId;
        return (
          <div className="row-history-card" key={String(command.id)}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{commandLabelFor(command.commandName)}</span>
              <span>{new Date(String(command.createdAt)).toLocaleString('en-US')}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-600">{String(command.actorName)} · {String(command.status)}</div>
            {command.reason ? <div className="mt-1 text-xs text-zinc-700">{String(command.reason)}</div> : null}
            {command.error ? <div className="mt-1 text-xs text-red-700">{String(command.error)}</div> : null}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-zinc-700">Before / after snapshot</summary>
              <pre className="json-chip mt-2">{JSON.stringify({ before: command.beforeSnapshot, after: command.afterSnapshot }, null, 2)}</pre>
            </details>
            <button
              className="secondary-button compact-action mt-2"
              type="button"
              disabled={!reversible || !canReverse || isRunning}
              title={canReverse ? 'Reverse command' : 'Manager or owner access is required to reverse posted actions.'}
              onClick={() => runCommand('reverseCommandById', { commandId: command.id }, `Reverse from row history for ${historyRowLabel(row)}`)}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Preview / Reverse
            </button>
          </div>
        );
      })}
    </>
  );
}

interface RowCommandHistoryDrawerProps {
  row: GridRow | null;
  onClose: () => void;
}

/** Standalone wrapper (legacy callers) — single-tab inspector. */
export function RowCommandHistoryDrawer({ row, onClose }: RowCommandHistoryDrawerProps) {
  if (!row) return null;
  return (
    <InspectorDrawer
      open
      title="Row History"
      subtitle={historyRowLabel(row)}
      ariaLabel="Row command history"
      tabs={[{ key: 'history', label: 'History', render: () => <RowCommandHistoryBody row={row} /> }]}
      activeTab="history"
      onTabChange={() => {}}
      onClose={onClose}
    />
  );
}

export function historyRowLabel(row: GridRow) {
  return String(row.label ?? row.name ?? row.customer ?? row.vendor ?? row.orderNo ?? row.poNo ?? row.billNo ?? row.batchCode ?? row.pickNo ?? row.reference ?? 'Selected row');
}
