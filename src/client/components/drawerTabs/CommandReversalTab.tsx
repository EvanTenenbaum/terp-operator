import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../useCommandRunner';
import { commandLabelFor } from '../../../shared/commandCatalog';

/**
 * CommandReversalTab — self-contained reversal preview panel for the Recovery view.
 *
 * CAP-009 / Phase 5 — CMD-RECOVERY (TER-1521): Replaces the plain-text
 * reversal preview with a proper confirm flow. Queries reversalPreview
 * internally and gates the Confirm Reverse action behind an allowlist
 * role check (owner | manager only).
 */

function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

interface CommandReversalTabProps {
  commandId: string;
}

export function CommandReversalTab({ commandId }: CommandReversalTabProps) {
  const [confirmPending, setConfirmPending] = useState(false);
  const [terminalReason, setTerminalReason] = useState('');
  const { runCommand } = useCommandRunner();

  const preview = trpc.queries.reversalPreview.useQuery(
    { commandId },
    { enabled: Boolean(commandId) }
  );
  const me = trpc.auth.me.useQuery();

  // Allowlist pattern — never denylist
  const canReverse = ['owner', 'manager'].includes(me.data?.role ?? '');
  const canSaveReason = ['owner', 'manager'].includes(me.data?.role ?? '');

  const data = preview.data;

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Reversal preview</h2>

      {preview.isLoading ? (
        <div className="drawer-empty mt-3">Loading…</div>
      ) : preview.isError ? (
        <div className="drawer-empty mt-3 text-red-600 text-sm">
          Could not load reversal preview. Try reselecting the row.
        </div>
      ) : !data ? (
        <div className="drawer-empty mt-3">
          {commandId ? 'No reversal data for this command.' : 'Select an action log row to see reversal details.'}
        </div>
      ) : (
        <>
          <div className="activity-row mt-3">
            <span className="font-medium">{commandLabelFor(String(data.commandName ?? ''))}</span>
            <span className="text-zinc-500">{String(data.actorName ?? '—')}</span>
            <span className={String(data.status) === 'ok' ? 'text-green-700' : 'text-red-600'}>
              {String(data.status ?? '-')}
            </span>
            <span className="text-zinc-400 text-xs">{fmtDate(data.createdAt)}</span>
          </div>

          <p className="mt-2 text-sm text-ink">{data.plainLanguageImpact}</p>

          {Array.isArray(data.affectedIds) && data.affectedIds.length > 0 ? (
            <div className="mt-2 text-xs text-zinc-500">
              Affects: {data.affectedIds.slice(0, 5).join(', ')}
              {data.affectedIds.length > 5 ? ` … +${data.affectedIds.length - 5} more` : ''}
            </div>
          ) : null}

          {data.reversedByCommandId ? (
            <div className="mt-2">
              <span className="selection-pill">Already reversed</span>
            </div>
          ) : null}

          {/* Reverse action — only for reversible commands, manager+ role */}
          {data.reversible && canReverse && !data.reversedByCommandId ? (
            confirmPending ? (
              <div className="control-band subtle-band mt-3">
                <p className="text-sm text-amber-700">
                  Confirm: this reversal cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      void runCommand(
                        'reverseCommandById',
                        { commandId },
                        'Reverse command'
                      );
                      setConfirmPending(false);
                    }}
                  >
                    Confirm reverse
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setConfirmPending(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="secondary-button mt-3"
                onClick={() => setConfirmPending(true)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Preview reverse
              </button>
            )
          ) : null}

          {/* Terminal reason — only for failed, non-reversible commands */}
          {String(data.status) === 'failed' && !data.reversible ? (
            <div className="mt-3">
              <label className="field-inline">
                Document terminal reason (optional)
                <input
                  className="input"
                  value={terminalReason}
                  onChange={(e) => setTerminalReason(e.target.value)}
                  placeholder="e.g. duplicate, invalid data, manually corrected"
                  disabled={!canSaveReason}
                />
              </label>
              <button
                type="button"
                className="primary-button mt-2"
                disabled={!terminalReason.trim() || !canSaveReason}
                onClick={() => {
                  void runCommand('documentCommandFailure', { commandId, reason: terminalReason }, 'Document terminal failure reason');
                  setTerminalReason('');
                }}
              >
                Save reason
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
