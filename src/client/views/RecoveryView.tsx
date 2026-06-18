import { Check, FileDown, Send, Settings } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useShallow } from 'zustand/shallow';
import { FilterToolbar, type StatusCount } from '../components/FilterToolbar';
import {
  BulkActionBar,
  type BulkAction,
} from '../components/BulkActionBar';
import { DetailSlideover, type SlideoverState } from '../components/DetailSlideover';
import { registerRecoveryTabs } from '../components/tabs/registerRecoveryTabs';
import type { GridRow, ViewKey } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';
import { commandFamilies } from '../../shared/commandCatalog';
import { columnsByView, EMPTY_ROWS } from './operations/shared';

// ── Register recovery entity tabs for DetailSlideover ─────────────────────
registerRecoveryTabs();

export function RecoveryView() {
  const selectedRecoveryRows = useUiStore((state) => state.selectedRows.recovery);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const rows = selectedRecoveryRows ?? EMPTY_ROWS;
  const { runCommand } = useCommandRunner();
  const navigate = useNavigate();
  const location = useLocation();
  // True when rendered as the standalone /recovery route.
  const isStandaloneRecovery = !location.pathname.startsWith('/settings');
  const [q, setQ] = useState('');
  // UX-M04: entity-id and command-family filter chips above the command journal.
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('');
  // Status filter (multi-select, comma-separated). Wired to FilterToolbar StatusFilterPill.
  const [statusFilter, setStatusFilter] = useState('');
  // Admin tools slide-over visibility (replaces WorkspacePanel above the grid)
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [adminTab, setAdminTab] = useState<'backup' | 'correction' | 'findreplace'>('backup');
  const [backupId, setBackupId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [replaceTable, setReplaceTable] = useState<'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests'>('batches');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState('');

  // ── Drawer state for DetailSlideover (opens on single-row selection) ──
  const activeDrawerEntity = useUiStore(useShallow((s) => s.activeDrawerEntityByView.recovery));
  const drawerState: SlideoverState =
    (useUiStore((s) => s.drawerByView.recovery?.state) as SlideoverState | undefined) ?? 'closed';
  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);

  // ── Queries ────────────────────────────────────────────────────────────
  const search = trpc.queries.recoverySearch.useQuery({ q });
  const reference = trpc.queries.reference.useQuery();
  const support = trpc.queries.supportPacket.useQuery(undefined, { enabled: false });
  const diff = trpc.queries.snapshotDiff.useQuery({ backupId: backupId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(backupId) });
  const findReplace = trpc.queries.findReplacePreview.useQuery(
    { table: replaceTable, find: findText || '___', replacement: replaceText },
    { enabled: Boolean(findText) }
  );

  // ── Client-side filtering (entity ID + command family + status) ────────
  const familyCommandSet = familyFilter ? new Set<string>(commandFamilies[familyFilter] ?? []) : null;
  const selectedStatuses = statusFilter ? statusFilter.split(',').filter(Boolean) : [];

  const filteredSearchRows = (search.data ?? []).filter((row) => {
    if (entityIdFilter.trim()) {
      const ids: string[] = Array.isArray(row.affectedIds) ? row.affectedIds : [];
      if (!ids.some((id) => String(id).toLowerCase().includes(entityIdFilter.toLowerCase()))) return false;
    }
    if (familyCommandSet) {
      if (!familyCommandSet.has(String(row.commandName ?? ''))) return false;
    }
    if (selectedStatuses.length > 0) {
      if (!selectedStatuses.includes(String(row.status ?? ''))) return false;
    }
    return true;
  });

  // ── Status counts for FilterToolbar status pill ────────────────────────
  const statusCounts: StatusCount[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of (search.data ?? [])) {
      const s = String(row.status ?? 'unknown');
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({ status, count }));
  }, [search.data]);

  // ── Selection → drawer open (single-row click → detail slide-over) ────
  const handleSelectionChange = useCallback(
    (selection: GridRow[]) => {
      setSelectedRows('recovery', selection);
      if (selection.length === 1) {
        setDrawerEntity('recovery' as ViewKey, 'recovery', String(selection[0].id));
        setDrawerState('recovery' as ViewKey, 'standard');
      } else if (selection.length === 0) {
        setDrawerState('recovery' as ViewKey, 'closed');
      }
    },
    [setSelectedRows, setDrawerEntity, setDrawerState],
  );

  const handleDrawerClose = useCallback(() => {
    setDrawerState('recovery' as ViewKey, 'closed');
  }, [setDrawerState]);

  // ── BulkActionBar: Retry selected (all-failed gate preserved) ──────────
  const buildBulkActions = useCallback(
    (selectedRows: GridRow[]): BulkAction[] => {
      if (selectedRows.length === 0) return [];
      const allFailed = selectedRows.every((row) => String(row.status ?? '') === 'failed');
      if (!allFailed) return [];
      return [
        {
          key: 'retry',
          label: `Retry ${selectedRows.length === 1 ? '' : `${selectedRows.length} `}selected`,
          primary: true,
          variant: 'primary',
          onAction: async () => {
            let succeeded = 0;
            let failed = 0;
            for (const row of selectedRows) {
              try {
                await runCommand(
                  String(row.commandName) as CommandName,
                  payloadObject(row.inputPayload),
                  `Retry failed command (bulk)`,
                );
                succeeded++;
              } catch {
                failed++;
              }
            }
            return { succeeded, failed };
          },
        },
      ];
    },
    [runCommand],
  );

  // ── Slideover row (for DetailSlideover) ────────────────────────────────
  const slideoverRow: GridRow | undefined = useMemo(() => {
    if (!activeDrawerEntity?.entityId) return undefined;
    return filteredSearchRows.find((r) => String(r.id) === activeDrawerEntity.entityId);
  }, [activeDrawerEntity, filteredSearchRows]);

  // ── Admin tools labels ─────────────────────────────────────────────────
  const adminLabels: Record<string, string> = { backup: 'Backup & support', correction: 'Correction', findreplace: 'Find & replace' };

  return (
    <div className="view-stack">
      {/* TER-1628 F-41: Recovery vs per-row Undo guidance (standalone Recovery route only) */}
      {isStandaloneRecovery ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
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

      {/* Search bar — primary surface (search-driven, not entity-driven) */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <label className="field-inline flex-1 min-w-[200px]">
          Search
          <input className="input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        {/* UX-M04: entity-id filter — paste a UUID to narrow to commands affecting that entity */}
        <label className="field-inline">
          Entity ID
          <input
            className="input compact"
            placeholder="Paste entity UUID…"
            value={entityIdFilter}
            onChange={(event) => setEntityIdFilter(event.target.value)}
            title="Filter command journal to rows whose affected IDs contain this entity UUID"
          />
        </label>
        {/* ⚙ Admin Tools button — opens wide slide-over (Tier 2) */}
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowAdminTools(true)}
          title="Admin tools"
          aria-label="Open admin tools"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* FilterToolbar — status filter pills (replaces FilterPresetStrip) */}
      <FilterToolbar
        view="recovery"
        statusCounts={statusCounts}
        activeStatusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Command-family filter chips — compact row above the grid */}
      <div role="group" aria-label="Filter by command family" className="flex flex-wrap gap-1 px-3 pb-1">
        {Object.keys(commandFamilies).map((family) => (
          <button
            key={family}
            type="button"
            className="secondary-button compact-action"
            aria-pressed={familyFilter === family}
            onClick={() => setFamilyFilter(familyFilter === family ? '' : family)}
            title={`Show only ${family} commands`}
          >
            {family}
          </button>
        ))}
        {familyFilter ? (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={() => setFamilyFilter('')}
            title="Clear family filter"
          >
            ✕ Clear
          </button>
        ) : null}
      </div>

      {/* Action Log grid — 100% of primary surface (UX-3, UX-9, ARCH-9) */}
      <div id="recovery-action-log">
        <OperatorGrid
          view="recovery"
          title="Action Log"
          rows={filteredSearchRows as GridRow[]}
          columns={columnsByView.recovery ?? []}
          loading={search.isLoading}
          onSelectionChange={handleSelectionChange}
          emptyTitle="No recent actions"
          emptyChildren="Recent commands will appear here automatically. Use search when you need a specific row, person, or action."
          selectionActions={(selRows) => {
            const actions = buildBulkActions(selRows);
            if (actions.length === 0) return null;
            return (
              <BulkActionBar
                selectedCount={selRows.length}
                entityLabel="command"
                actions={actions}
                onClear={() => setSelectedRows('recovery', [])}
              />
            );
          }}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Admin Tools — wide slide-over triggered by ⚙ button (Tier 2).
          Preserves all existing admin functionality verbatim; only the
          visual home moves from a WorkspacePanel above the grid to a
          slide-over (UX-3).
          ════════════════════════════════════════════════════════════════ */}
      {showAdminTools && (
        <>
          {/* Backdrop */}
          <div
            className="slideover-backdrop"
            aria-hidden="true"
            onClick={() => setShowAdminTools(false)}
            data-testid="admin-tools-backdrop"
          />
          {/* Panel — wide state */}
          <aside
            className="slideover slideover--wide"
            aria-label="Admin tools"
            role="dialog"
            aria-modal="true"
            data-testid="admin-tools-slideover"
          >
            {/* Header */}
            <div className="slideover-header">
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowAdminTools(false)}
                aria-label="Close admin tools"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">Admin Tools</div>
                <div className="truncate text-[11px] uppercase text-zinc-500">Recovery</div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="slideover-tabs" role="tablist" aria-label="Admin tool sections">
              {(['backup', 'correction', 'findreplace'] as const).map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={adminTab === tab}
                  className={`slideover-tab${adminTab === tab ? ' slideover-tab--active' : ''}`}
                  onClick={() => setAdminTab(tab)}
                >
                  <span className="slideover-tab-index">{index + 1}</span>
                  {adminLabels[tab]}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="slideover-body">
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
            </div>
          </aside>
        </>
      )}

      {/* DetailSlideover — opens on single-row selection */}
      {activeDrawerEntity?.entityId && drawerState !== 'closed' && (
        <DetailSlideover
          viewKey="recovery"
          entityType="recovery"
          entityId={activeDrawerEntity.entityId}
          state={drawerState}
          row={slideoverRow}
          onClose={handleDrawerClose}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Helpers (unchanged from original — preserved verbatim)
// ===========================================================================

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
