import { Check, FileDown, Send } from 'lucide-react';
import { CommandReversalTab } from '../components/drawerTabs/CommandReversalTab';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { StatusActionBar, type StatusActionTable } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';
import { columnsByView, EMPTY_ROWS } from './operations/shared';

export function RecoveryView() {
  const selectedRecoveryRows = useUiStore((state) => state.selectedRows.recovery);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const rows = selectedRecoveryRows ?? EMPTY_ROWS;
  const { runCommand } = useCommandRunner();
  const navigate = useNavigate();
  const location = useLocation();
  // True when rendered as the standalone /recovery route. UX-A13 made the nav
  // route canonical (the Settings "Action log" tab is now a redirect here), so
  // in practice this is always true; the embedded branch is retained for the
  // redirect window and any legacy entry path.
  const isStandaloneRecovery = !location.pathname.startsWith('/settings');
  const [q, setQ] = useState('');
  const [adminTab, setAdminTab] = useState<'backup' | 'correction' | 'findreplace'>('backup');
  const [backupId, setBackupId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [replaceTable, setReplaceTable] = useState<'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests'>('batches');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const search = trpc.queries.recoverySearch.useQuery({ q });
  const reference = trpc.queries.reference.useQuery();
  const support = trpc.queries.supportPacket.useQuery(undefined, { enabled: false });
  const diff = trpc.queries.snapshotDiff.useQuery({ backupId: backupId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(backupId) });
  const findReplace = trpc.queries.findReplacePreview.useQuery(
    { table: replaceTable, find: findText || '___', replacement: replaceText },
    { enabled: Boolean(findText) }
  );
  const selected = rows[0];
  return (
    <div className="view-stack">
      {/* TER-1628 F-41: Recovery vs per-row Undo guidance (standalone Recovery route only) */}
      {isStandaloneRecovery ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="page-subtitle">
            Use this for bulk reversals or commands older than the last 30 days' log; for a single recent command use Undo from the Action Log.
          </p>
          {/* UX-A13: the Action Log now lives on this page (the Settings tab
              redirects here), so the cross-link jumps to the grid below. */}
          <button
            type="button"
            className="text-button text-xs"
            onClick={() => document.getElementById('recovery-action-log')?.scrollIntoView({ block: 'start' })}
          >
            → Action Log
          </button>
        </div>
      ) : null}
      <div className="control-band">
        <label className="field-inline">
          Search
          <input className="input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>

      </div>
      <WorkspacePanel panelId="recovery-admin-tools" title="Admin tools" headingLevel={2}>
        {/* Tab nav */}
        <div className="inspector-tabs border-b border-line mb-3" role="tablist" aria-label="Admin tool sections">
          {(['backup', 'correction', 'findreplace'] as const).map((tab) => {
            const labels = { backup: 'Backup & support', correction: 'Correction', findreplace: 'Find & replace' };
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={adminTab === tab}
                className={`inspector-tab${adminTab === tab ? ' active' : ''}`}
                tabIndex={adminTab === tab ? 0 : -1}
                onClick={() => setAdminTab(tab)}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Backup & support tab */}
        {adminTab === 'backup' && (
          <div role="tabpanel" aria-label="Backup and support" className="space-y-3 p-1">
            <div className="control-band subtle-band">
              <button className="secondary-button" type="button" onClick={() => support.refetch().then((result) => downloadJson('terp-agro-support-packet.json', result.data))}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Export support
              </button>
              <select aria-label="Backup id" className="select" value={backupId} onChange={(event) => setBackupId(event.target.value)}>
                <option value="">Backup preview</option>
                {reference.data?.backupSnapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.label}
                  </option>
                ))}
              </select>
              <button className="secondary-button" type="button" disabled={!backupId} onClick={() => runCommand('restoreFromBackupPoint', { backupId }, 'Read-only backup restore preview')}>
                Restore preview
              </button>
            </div>
            {diff.data ? (
              <div className="border border-line bg-white p-3">
                <h3 className="section-title mb-2">Snapshot diff</h3>
                <div className="grid gap-1 text-sm">
                  {diff.data.rows.map((row) => (
                    <div key={row.key} className="activity-row">
                      <span>{row.key}</span>
                      <span>backup {row.backup}</span>
                      <span>current {row.current}</span>
                      <span>delta {row.delta}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Correction tab */}
        {adminTab === 'correction' && (
          <div role="tabpanel" aria-label="Correction" className="control-band subtle-band">
            {/* K3/A9: explicit id+htmlFor so keyboard users know which input they are in */}
            <label className="field-inline" htmlFor="recovery-period">
              Period
              <input id="recovery-period" className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <label className="field-inline" htmlFor="recovery-amount">
              Amount
              <input id="recovery-amount" className="input compact" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="field-inline" htmlFor="recovery-memo">
              Memo
              <input id="recovery-memo" className="input" value={memo} onChange={(event) => setMemo(event.target.value)} />
            </label>
            <button className="secondary-button" type="button" disabled={!memo} onClick={() => runCommand('createCorrectionJournalEntry', { period, amount: Number(amount), memo }, 'Create manual correction')}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Correction
            </button>
          </div>
        )}

        {/* Find & replace tab */}
        {adminTab === 'findreplace' && (
          <div role="tabpanel" aria-label="Find and replace" className="space-y-3 p-1">
            <div className="control-band subtle-band">
              <label className="field-inline">
                Find in
                <select className="select compact" value={replaceTable} onChange={(event) => setReplaceTable(event.target.value as typeof replaceTable)}>
                  <option value="batches">Inventory Batches</option>
                  <option value="customers">Customers</option>
                  <option value="vendors">Vendors</option>
                  <option value="sales_orders">Sales Orders</option>
                  <option value="connector_requests">Inbound Requests</option>
                </select>
              </label>
              <label className="field-inline">
                Find value
                <input className="input compact" value={findText} onChange={(event) => setFindText(event.target.value)} />
              </label>
              <label className="field-inline">
                Replace with
                <input className="input compact" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
              </label>
              <label className="field-inline">
                Confirm
                <input className="input compact" value={replaceConfirm} placeholder="Type REPLACE" onChange={(event) => setReplaceConfirm(event.target.value)} />
              </label>
              <span className="selection-pill">{findReplace.data?.count ? `${findReplace.data.count} matching row(s)` : 'No matching rows'}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={!findText || !findReplace.data?.count || replaceConfirm !== 'REPLACE'}
                onClick={() =>
                  runCommand(
                    'createCorrectionJournalEntry',
                    {
                      period,
                      amount: 0,
                      memo: `Find and replace ${findText} -> ${replaceText} in ${replaceTable}`,
                      findReplace: { table: replaceTable, find: findText, replacement: replaceText }
                    },
                    'Action log find and replace with preview'
                  )
                }
              >
                Apply previewed replace
              </button>
            </div>
            {findReplace.data?.rows.length ? (
              <div className="inline-panel">
                <h3 className="section-title mb-2">Find / replace preview</h3>
                <div className="grid gap-2 text-xs">
                  {findReplace.data.rows.slice(0, 8).map((row) => (
                    <div key={row.id} className="border border-line bg-panel p-2">
                      <strong>{row.id}</strong>
                      {row.matches.map((match) => (
                        <div key={match.field} className="mt-1">
                          {match.field}: {String(match.before)} {'->'}  {String(match.after)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </WorkspacePanel>
      <div id="recovery-action-log">
      <OperatorGrid
        view="recovery"
        title="Action Log"
        rows={(search.data ?? []) as GridRow[]}
        columns={columnsByView.recovery ?? []}
        loading={search.isLoading}
        onSelectionChange={(selection) => setSelectedRows('recovery', selection)}
        emptyTitle="No recent actions"
        emptyChildren="Recent commands will appear here automatically. Use search when you need a specific row, person, or action."
        selectionActions={(rows) => {
          // Spec §10.9 — status table for the action log. Real command_journal
          // statuses are pending | ok | failed; "reversed" is ok +
          // reversedByCommandId set (verified in commandBus). Retry replays
          // the original command name with its stored input_payload. Reverse
          // is intentionally NOT a one-click primary here: reverseCommandById
          // is destructive and its designed home is the TER-1521 confirm-flow
          // reversal panel below the grid (spec §10.9 predates TER-1521).
          const allFailed = rows.every((row) => String(row.status ?? '') === 'failed');
          const retry = {
            key: 'retry',
            label: 'Retry',
            icon: <Send className="h-4 w-4" aria-hidden="true" />,
            disabled: !allFailed,
            disabledReason: 'Retry applies to failed commands only',
            run: (r: GridRow[]) => runCommand(String(r[0]?.commandName) as CommandName, payloadObject(r[0]?.inputPayload), 'Retry failed command')
          };
          const recoveryTable: StatusActionTable = {
            rules: [
              { when: 'failed', primary: retry, tray: [] },
              // ok rows: reversal runs through the confirm-flow panel below.
              { when: ['ok', 'pending'], primary: null, tray: [] },
              // Catch-all: Retry stays reachable (disabled-with-reason when
              // the selection is not all-failed).
              { when: () => true, primary: null, tray: [retry] }
            ]
          };
          return <StatusActionBar rows={rows} table={recoveryTable} />;
        }}
      />
      </div>
      {/* CAP-009 / Phase 5 — reversal preview panel (CMD-RECOVERY TER-1521) */}
      {selected ? (
        <section className="inline-panel" data-testid="recovery-reversal-panel">
          {/* TER-1628 F-41: cross-link to Recovery when viewing from Settings > Action log */}
          {!isStandaloneRecovery ? (
            <p className="text-xs text-zinc-500">
              For bulk reversals →{' '}
              <button type="button" className="text-button text-xs" onClick={() => navigate('/recovery')}>
                Recovery
              </button>
            </p>
          ) : null}
          <CommandReversalTab commandId={String(selected.id)} />
        </section>
      ) : null}

    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  if (!value) return;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function payloadObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
