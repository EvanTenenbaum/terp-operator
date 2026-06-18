import { registerTabs, type SlideOverTab, type SlideOverTabProps } from './registry';
import { CommandReversalTab } from '../drawerTabs/CommandReversalTab';
import { trpc } from '../../api/trpc';
import { commandLabelFor } from '../../../shared/commandCatalog';

/**
 * Recovery Detail tab — shows command details for a selected journal entry.
 * Displays: command name (label), full input payload, and affected IDs.
 */
function RecoveryDetailTab({ entityId }: SlideOverTabProps): JSX.Element {
  const search = trpc.queries.recoverySearch.useQuery({ q: '' });
  const row = (search.data ?? []).find((r) => String(r.id) === entityId);

  if (!row) {
    return (
      <div className="slideover-empty" data-testid="slideover-empty">
        Command not found in current journal.
      </div>
    );
  }

  const commandNameRaw = row.commandName ?? '—';
  const label = commandLabelFor(commandNameRaw);
  const payload = row.inputPayload;

  return (
    <div className="p-3 space-y-3 text-sm">
      <div>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Command</span>
        <div className="font-medium text-ink mt-0.5">{label}</div>
        <div className="text-xs text-zinc-400 mt-0.5">{String(commandNameRaw)}</div>
      </div>
      <div>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Status</span>
        <div className="mt-0.5">
          <span className="selection-pill text-xs">{String(row.status ?? 'unknown')}</span>
        </div>
      </div>
      <div>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Actor</span>
        <div className="mt-0.5 text-ink">{String(row.actorName ?? '—')}</div>
      </div>
      {row.error ? (
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Error</span>
          <div className="mt-0.5 text-red-700 text-xs">{String(row.error)}</div>
        </div>
      ) : null}
      <div>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Affected IDs</span>
        <div className="mt-0.5 text-xs font-mono break-all text-zinc-600">
          {Array.isArray(row.affectedIds) && row.affectedIds.length > 0
            ? (row.affectedIds as string[]).join(', ')
            : '—'}
        </div>
      </div>
      {payload && typeof payload === 'object' ? (
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Input Payload</span>
          <pre className="mt-1 text-xs text-zinc-600 bg-panel p-2 rounded border border-line overflow-auto max-h-48">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      ) : null}
      <div>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Created</span>
        <div className="mt-0.5 text-ink">{fmtDate(row.createdAt)}</div>
      </div>
    </div>
  );
}

/**
 * Recovery Logs tab — shows the raw command journal row data for debugging.
 */
function RecoveryLogsTab({ entityId }: SlideOverTabProps): JSX.Element {
  const search = trpc.queries.recoverySearch.useQuery({ q: '' });
  const row = (search.data ?? []).find((r) => String(r.id) === entityId);

  if (!row) {
    return (
      <div className="slideover-empty" data-testid="slideover-empty">
        Command not found in current journal.
      </div>
    );
  }

  return (
    <div className="p-3">
      <pre className="text-xs text-zinc-600 bg-panel p-2 rounded border border-line overflow-auto max-h-96">
        {JSON.stringify(row, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Recovery Reversal tab — wraps CommandReversalTab for the slide-over.
 */
function RecoveryReversalTab({ entityId }: SlideOverTabProps): JSX.Element {
  return <CommandReversalTab commandId={entityId} />;
}

/**
 * Recovery History tab — placeholder for entity timeline of affected IDs.
 */
function RecoveryHistoryTab({ entityId }: SlideOverTabProps): JSX.Element {
  const search = trpc.queries.recoverySearch.useQuery({ q: '' });
  const row = (search.data ?? []).find((r) => String(r.id) === entityId);
  const affectedIds: string[] = Array.isArray(row?.affectedIds) ? row.affectedIds as string[] : [];

  return (
    <div className="p-3 space-y-3 text-sm">
      <span className="text-xs text-zinc-500 uppercase tracking-wide">
        Entity Timeline (Preview)
      </span>
      {affectedIds.length === 0 ? (
        <div className="slideover-empty text-xs">No affected entities for this command.</div>
      ) : (
        <div className="space-y-1">
          {affectedIds.map((id) => (
            <div key={id} className="text-xs font-mono text-zinc-600 bg-panel p-1.5 rounded border border-line">
              {id}
            </div>
          ))}
          <p className="text-xs text-zinc-400 italic">
            Full entity timeline via entity-detail lookup (future Phase).
          </p>
        </div>
      )}
    </div>
  );
}

/** Export the tab definitions for test / registry inspection. */
export const recoveryDetailTab: SlideOverTab = {
  key: 'details',
  label: 'Details',
  component: RecoveryDetailTab,
  defaultFor: ['recovery'],
};

export const recoveryReversalTab: SlideOverTab = {
  key: 'reversal',
  label: 'Reversal',
  component: RecoveryReversalTab,
};

export const recoveryHistoryTab: SlideOverTab = {
  key: 'history',
  label: 'History',
  component: RecoveryHistoryTab,
};

export const recoveryLogsTab: SlideOverTab = {
  key: 'logs',
  label: 'Logs',
  component: RecoveryLogsTab,
};

/**
 * Register all Recovery tabs in the global tab registry.
 * Idempotent — calling twice replaces the previous registration.
 */
export function registerRecoveryTabs(): void {
  registerTabs('recovery', [
    recoveryDetailTab,
    recoveryReversalTab,
    recoveryHistoryTab,
    recoveryLogsTab,
  ]);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString('en-US');
}
