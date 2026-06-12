import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { DefaultPricingPanel } from '../components/DefaultPricingPanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { formatWeightsSummary } from '../components/credit/creditPanelUtils';
import { useUiStore } from '../store/uiStore';
import type { GridRow, SettingsTab } from '../../shared/types';
import { ConnectorsView } from './ConnectorsView';

// UX-A13 — nav routes are canonical. The former Settings "Action log" and
// "Archive" tabs embedded RecoveryView / CloseoutView under a different
// ViewKey ('settings' vs 'recovery'/'closeout'), so drawer and selection
// state diverged depending on entry path. Those tabs are now links to the
// canonical /recovery and /closeout routes. The Requests tab remains the
// home for connector-request review (UX-A12 redirects /connectors here).
const canonicalRouteLinks: Array<{ tab: SettingsTab; label: string; to: string }> = [
  { tab: 'actions', label: 'Action log', to: '/recovery' },
  { tab: 'archive', label: 'Archive', to: '/closeout' }
];

export function SettingsView() {
  const activeTab = useUiStore((state) => state.activeSettingsTab);
  const setActiveTab = useUiStore((state) => state.setActiveSettingsTab);
  const navigate = useNavigate();
  const me = trpc.auth.me.useQuery();
  const isOwner = me.data?.role === 'owner';
  const isManager = me.data?.role === 'owner' || me.data?.role === 'manager';

  // UX-A13: 'actions'/'archive' may still arrive via persisted localStorage
  // state or older deep-link code paths. Redirect to the canonical route and
  // reset the stored tab so /settings does not redirect forever.
  useEffect(() => {
    const link = canonicalRouteLinks.find((entry) => entry.tab === activeTab);
    if (link) {
      setActiveTab('requests');
      navigate(link.to, { replace: true });
    }
  }, [activeTab, navigate, setActiveTab]);

  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'requests', label: 'Requests' },
    { key: 'strain-aliases', label: 'Strain aliases' },
    { key: 'pricing', label: 'Pricing' },
    ...(isManager ? [{ key: 'system' as SettingsTab, label: 'System' }] : []),
    ...(isOwner ? [{ key: 'credit-engine' as SettingsTab, label: 'Credit Engine' }] : [])
  ];
  const visibleTabKeys = new Set(tabs.map((t) => t.key));
  const effectiveTab = visibleTabKeys.has(activeTab) ? activeTab : tabs[0].key;
  const activeTabLabel = tabs.find((tab) => tab.key === effectiveTab)?.label ?? 'Settings';
  return (
    <div className="view-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* UX-Q08 (partial): disambiguate from the standalone nav routes. */}
          <h1 className="page-title">Settings — {activeTabLabel}</h1>
          <p className="page-subtitle">System review, audit history, and archive controls for managers.</p>
        </div>
      </div>
      <div className="report-chip-row">
        <div role="tablist" aria-label="Settings sections" className="contents">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={effectiveTab === tab.key}
              className={effectiveTab === tab.key ? 'report-chip report-chip-active' : 'report-chip'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* UX-A13: canonical-home links replace the old embedded tabs. */}
        {canonicalRouteLinks.map((link) => (
          <button
            key={link.tab}
            type="button"
            className="report-chip"
            title={`Opens ${link.to}`}
            onClick={() => navigate(link.to)}
          >
            {link.label} →
          </button>
        ))}
      </div>
      {effectiveTab === 'requests' ? <ConnectorsView /> : null}
      {effectiveTab === 'strain-aliases' ? <StrainAliasesPanel /> : null}
      {effectiveTab === 'pricing' ? <DefaultPricingPanel /> : null}
      {effectiveTab === 'system' ? <SystemSettingsPanel /> : null}
      {effectiveTab === 'credit-engine' ? <CreditEngineSettingsPanel /> : null}
    </div>
  );
}

const strainAliasesColumns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Canonical name', pinned: 'left', minWidth: 220 },
  { field: 'category', width: 140 },
  { field: 'alias', headerName: 'Customer-facing alias', editable: true, minWidth: 240 },
  { field: 'sku', headerName: 'SKU', width: 160 }
];

function StrainAliasesPanel() {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canEdit = me.data?.role === 'owner' || me.data?.role === 'manager';
  const rows = ((reference.data?.items ?? []) as unknown as GridRow[]).map((row) => ({ ...row }));
  return (
    <section className="inline-panel" data-testid="strain-aliases-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Strain aliases</h2>
          <p className="text-xs text-zinc-600">
            Aliases replace the canonical strain name on customer-facing surfaces (inventory, sales lines, picks). Vendor and audit records keep the canonical name.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <OperatorGrid
          view="settings"
          title="Items"
          rows={rows}
          columns={strainAliasesColumns.map((col) => ({ ...col, editable: col.editable && canEdit }))}
          loading={reference.isLoading}
          onCellCommit={(event) => {
            if (event.colDef.field !== 'alias') return;
            const itemId = event.data?.id;
            if (!itemId) return;
            const next = typeof event.newValue === 'string' ? event.newValue.trim() : '';
            const prior = typeof event.oldValue === 'string' ? event.oldValue.trim() : '';
            if (next === prior) return;
            runCommand('setItemAlias', { itemId, alias: next }, next ? `Set alias to ${next}` : 'Clear strain alias');
          }}
        />
      </div>
    </section>
  );
}

function SystemSettingsPanel() {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const settings = reference.data?.systemSettings ?? [];
  // Per-row editing state: key -> edited value text
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  function startEditing(key: string, currentValue: Record<string, unknown>) {
    setEditingKey(key);
    setEditText(JSON.stringify(currentValue, null, 2));
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditText('');
  }

  async function saveSetting(key: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText);
    } catch (e) {
      return; // silently reject invalid JSON — validation will catch on blur
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    await runCommand('updateSystemSetting', { key, value: parsed }, `Update system setting "${key}"`);
    await reference.refetch();
    cancelEditing();
  }

  return (
    <section className="inline-panel" data-testid="system-settings-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">System settings</h2>
          <p className="text-xs text-zinc-600">
            Raw key-value configuration stored in the system_settings table. Values are JSON objects. Editing is restricted to managers and above.
          </p>
        </div>
      </div>
      {reference.isLoading ? (
        <div className="mt-3 text-sm text-zinc-600">Loading system settings...</div>
      ) : settings.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-500">No system settings configured.</div>
      ) : (
        <div className="mt-3">
          <table className="finder-table">
            <thead>
              <tr>
                <th style={{ width: 260 }}>Key</th>
                <th>Value</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => {
                const isEditing = editingKey === s.key;
                const valuePreview = JSON.stringify(s.value);
                return (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.key}</td>
                    <td>
                      {isEditing ? (
                        <textarea aria-label="Edit text"
                          className="input w-full"
                          rows={Math.max(3, editText.split('\n').length)}
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                      ) : (
                        <code className="text-xs bg-zinc-100 rounded px-1 py-0.5 block max-w-[400px] truncate" title={valuePreview}>
                          {valuePreview}
                        </code>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="primary-button compact-action"
                              disabled={isRunning}
                              onClick={() => saveSetting(s.key)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={cancelEditing}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button compact-action"
                            onClick={() => startEditing(s.key, s.value)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function changedFieldsSummary(pre: Record<string, unknown>, post: Record<string, unknown>): string {
  const keys = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(pre[key]) !== JSON.stringify(post[key])) {
      changed.push(key === 'globalDefaultStanceId' ? 'defaultStance' : key);
    }
  }
  return changed.length > 0 ? changed.join(', ') : '(no changes)';
}

function CreditEngineSettingsPanel() {
  const { data, isLoading } = trpc.credit.creditEngineStances.useQuery();
  const configHistory = trpc.credit.creditEngineConfigHistory.useQuery();
  const stanceHistory = trpc.credit.creditEngineStanceHistory.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const [stanceId, setStanceId] = useState('');
  const [coldStartInvoices, setColdStartInvoices] = useState('');
  const [coldStartTenure, setColdStartTenure] = useState('');
  const [reminderDays, setReminderDays] = useState('');
  const [snoozeCapDays, setSnoozeCapDays] = useState('');
  const [shadowMode, setShadowMode] = useState(false);

  useEffect(() => {
    if (!data) return;
    setStanceId(data.config.globalDefaultStanceId);
    setColdStartInvoices(String(data.config.coldStartMinPostedInvoices));
    setColdStartTenure(String(data.config.coldStartMinTenureDays));
    setReminderDays(String(data.config.manualOverrideReminderDefaultDays));
    setSnoozeCapDays(String(data.config.manualOverrideSnoozeCapDays));
    setShadowMode(data.config.shadowMode);
  }, [data]);

  const shadowDisabled = data?.config.shadowMode === false;

  async function handleSave() {
    const payload: Record<string, unknown> = {};
    if (stanceId) payload.globalDefaultStanceId = stanceId;
    if (coldStartInvoices !== '') payload.coldStartMinPostedInvoices = Number(coldStartInvoices);
    if (coldStartTenure !== '') payload.coldStartMinTenureDays = Number(coldStartTenure);
    if (reminderDays !== '') payload.manualOverrideReminderDefaultDays = Number(reminderDays);
    if (snoozeCapDays !== '') payload.manualOverrideSnoozeCapDays = Number(snoozeCapDays);
    payload.shadowMode = shadowMode;
    await runCommand('setCreditEngineConfig', payload, 'Update credit engine settings');
    configHistory.refetch();
  }

  return (
    <section className="inline-panel" data-testid="credit-engine-settings-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Credit Engine Settings</h2>
          <p className="text-xs text-zinc-600">Global config and read-only stance overview.</p>
        </div>
      </div>
      {isLoading ? (
        <div className="mt-3 text-sm text-zinc-600">Loading engine config...</div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="field-inline">
              Default stance
              <select className="select" value={stanceId} onChange={(e) => setStanceId(e.target.value)}>
                <option value="">Select stance</option>
                {data?.stances.map((stance) => (
                  <option key={stance.id} value={stance.id}>
                    {stance.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              Cold-start invoices
              <input className="input compact" type="number" min="0" value={coldStartInvoices} onChange={(e) => setColdStartInvoices(e.target.value)} />
            </label>
            <label className="field-inline">
              Cold-start tenure (days)
              <input className="input compact" type="number" min="0" value={coldStartTenure} onChange={(e) => setColdStartTenure(e.target.value)} />
            </label>
            <label className="field-inline">
              Reminder days
              <input className="input compact" type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
            </label>
            <label className="field-inline">
              Snooze cap (days)
              <input className="input compact" type="number" min="0" value={snoozeCapDays} onChange={(e) => setSnoozeCapDays(e.target.value)} />
            </label>
            <label className="field-inline flex items-center gap-2">
              <input type="checkbox" checked={shadowMode} disabled={shadowDisabled} onChange={(e) => setShadowMode(e.target.checked)} />
              <span>Shadow mode</span>
              {shadowDisabled ? <span className="text-xs text-zinc-500">Cannot re-enable once disabled</span> : null}
            </label>
          </div>
          <div className="mt-3">
            <button className="primary-button" type="button" disabled={isRunning} onClick={handleSave}>
              Save settings
            </button>
          </div>
          <div className="mt-6">
            <h3 className="section-title">Stances</h3>
            <p className="text-xs text-zinc-600 mb-2">Stance create/edit is command-backed follow-up work.</p>
            <div className="finder-table-wrap">
              <table className="finder-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Weights</th>
                    <th>Customers</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.stances.map((stance) => (
                    <tr key={stance.id}>
                      <td>{stance.name}</td>
                      <td>{stance.description ?? '-'}</td>
                      <td>{formatWeightsSummary(stance.weights)}</td>
                      <td>{stance.customerCount}</td>
                      <td>{stance.isSeeded ? 'Seeded' : 'Custom'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Config Change History — TER-1648 */}
          <div className="mt-6">
            <h3 className="section-title">Config Change History</h3>
            <p className="text-xs text-zinc-600 mb-2">Every config update is appended here (read-only).</p>
            {configHistory.isLoading ? (
              <div className="text-sm text-zinc-600">Loading history...</div>
            ) : configHistory.data && configHistory.data.length > 0 ? (
              <div className="finder-table-wrap">
                <table className="finder-table" data-testid="credit-engine-config-history">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Changed by</th>
                      <th>Changed fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configHistory.data.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.changedAt).toLocaleString('en-US')}</td>
                        <td>{entry.changedByName || entry.changedByEmail}</td>
                        <td>{changedFieldsSummary(entry.preState as Record<string, unknown>, entry.postState as Record<string, unknown>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No config changes recorded yet.</div>
            )}
          </div>

          {/* Stance Change History — TER-1648 */}
          <div className="mt-6">
            <h3 className="section-title">Stance Change History</h3>
            <p className="text-xs text-zinc-600 mb-2">Every stance create, update, and delete is appended here (read-only).</p>
            {stanceHistory.isLoading ? (
              <div className="text-sm text-zinc-600">Loading history...</div>
            ) : stanceHistory.data && stanceHistory.data.length > 0 ? (
              <div className="finder-table-wrap">
                <table className="finder-table" data-testid="credit-engine-stance-history">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Stance</th>
                      <th>Action</th>
                      <th>Changed by</th>
                      <th>Affected customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stanceHistory.data.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.changedAt).toLocaleString('en-US')}</td>
                        <td>{entry.stanceName}</td>
                        <td className="font-mono text-xs">{entry.action}</td>
                        <td>{entry.changedByName || entry.changedByEmail}</td>
                        <td>{entry.affectedCustomerCount ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No stance changes recorded yet.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
