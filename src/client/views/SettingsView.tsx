import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GridColDef } from '../../shared/grid-types';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { DefaultPricingPanel } from '../components/DefaultPricingPanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useConfirm } from '../hooks/useConfirm';
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
    { key: 'requests', label: 'Connector requests' },
    { key: 'strain-aliases', label: 'Strain aliases' },
    { key: 'pricing', label: 'Pricing' },
    ...(isManager ? [{ key: 'system' as SettingsTab, label: 'System' }] : []),
    ...(isOwner ? [{ key: 'credit-engine' as SettingsTab, label: 'Credit Engine' }] : [])
  ];
  const visibleTabKeys = new Set(tabs.map((t) => t.key));
  // SX-G01: default to System when visible, otherwise Strain aliases.
  const defaultTab: SettingsTab = visibleTabKeys.has('system') ? 'system' : 'strain-aliases';
  const effectiveTab = visibleTabKeys.has(activeTab) ? activeTab : defaultTab;
  const activeTabLabel = tabs.find((tab) => tab.key === effectiveTab)?.label ?? 'Settings';
  return (
    <div className="view-stack" data-view-key="settings" data-testid="settings-page-settings">
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
            className="selection-pill muted"
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

const strainAliasesColumns: GridColDef<GridRow>[] = [
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
  const { data, isLoading, refetch: refetchStances } = trpc.credit.creditEngineStances.useQuery();
  const configHistory = trpc.credit.creditEngineConfigHistory.useQuery();
  const stanceHistory = trpc.credit.creditEngineStanceHistory.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const confirm = useConfirm();
  // UX-Q05: stance CRUD editor state. 'new' opens an empty create form;
  // a stance object opens the edit form prefilled with that stance.
  const [stanceEditor, setStanceEditor] = useState<'new' | StanceEditorInitial | null>(null);
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

  // UX-Q05: stance delete. Server-side guards: cannot delete the global
  // default stance or a stance with assigned customers; deletion is terminal.
  async function handleDeleteStance(stance: { id: string; name: string }) {
    const ok = await confirm({
      title: `Delete stance "${stance.name}"?`,
      body:
        'Deleting a stance is permanent — it cannot be reconstructed. The delete is only allowed because no customers are assigned to this stance and it is not the global default.',
      tone: 'danger',
      primaryLabel: 'Delete stance'
    });
    if (!ok) return;
    await runCommand('deleteCreditEngineStance', { stanceId: stance.id }, `Delete credit engine stance "${stance.name}"`);
    refetchStances();
    stanceHistory.refetch();
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
          {/* UX-Q05 (Execution Decision 6b): owner-gated stance CRUD. */}
          <div className="mt-6" data-testid="credit-engine-stance-admin">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="section-title">Stances</h3>
                <p className="text-xs text-zinc-600 mb-2">
                  Create, edit, and delete engine stances. Weights are integers that must sum to 100. A stance can only be deleted when no customers are assigned to it and it is not the global default.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button compact-action"
                onClick={() => setStanceEditor('new')}
              >
                New stance
              </button>
            </div>
            <div className="finder-table-wrap">
              <table className="finder-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Weights</th>
                    <th>Customers</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.stances.map((stance) => {
                    const isGlobalDefault = stance.id === data.config.globalDefaultStanceId;
                    const deleteBlockedReason = isGlobalDefault
                      ? 'Cannot delete the global default stance.'
                      : stance.customerCount > 0
                        ? 'Cannot delete a stance that is still assigned to customers.'
                        : null;
                    return (
                      <tr key={stance.id}>
                        <td>{stance.name}</td>
                        <td>{stance.description ?? '-'}</td>
                        <td>{formatWeightsSummary(stance.weights)}</td>
                        <td>{stance.customerCount}</td>
                        <td>{stance.isSeeded ? 'Seeded' : 'Custom'}</td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              aria-label={`Edit stance ${stance.name}`}
                              onClick={() =>
                                setStanceEditor({
                                  id: stance.id,
                                  name: stance.name,
                                  description: stance.description,
                                  weights: stance.weights
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              aria-label={`Delete stance ${stance.name}`}
                              disabled={isRunning || Boolean(deleteBlockedReason)}
                              title={deleteBlockedReason ?? 'Delete this stance (permanent)'}
                              onClick={() => handleDeleteStance(stance)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stanceEditor ? (
              <StanceEditorForm
                key={stanceEditor === 'new' ? 'new' : stanceEditor.id}
                initial={stanceEditor === 'new' ? null : stanceEditor}
                onClose={() => setStanceEditor(null)}
                onSaved={() => {
                  refetchStances();
                  stanceHistory.refetch();
                }}
              />
            ) : null}
          </div>

          {/* UX-Q05: per-customer engine overrides (owner-only commands). */}
          <CreditEngineCustomerOverrides stances={data?.stances ?? []} />

          {/* UX-Q05: bulk revert — terminal bulk mutation, typed confirmation. */}
          <CreditEngineBulkRevert />

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

// ─── UX-Q05 — Credit Engine admin (owner-gated) ────────────────────────────
//
// Ships the #111 admin set in Settings → Credit Engine: stance CRUD
// (createCreditEngineStance / updateCreditEngineStance / deleteCreditEngineStance),
// per-customer overrides (setCustomerStance / disableCreditEngineForCustomer),
// and bulkRevertCustomersToEngine behind a typed confirmation. All six
// commands carry commandMinRole 'owner'; the Credit Engine tab itself is only
// rendered for owners (see SettingsView tabs above), so managers never see
// this section.

const STANCE_WEIGHT_FIELDS = [
  { key: 'revenueMomentum', label: 'Revenue momentum' },
  { key: 'cashCollection', label: 'Cash collection' },
  { key: 'profitability', label: 'Profitability' },
  { key: 'debtAging', label: 'Debt aging' },
  { key: 'repaymentVelocity', label: 'Repayment velocity' },
  { key: 'tenureDepth', label: 'Tenure depth' }
] as const;

type StanceWeightKey = (typeof STANCE_WEIGHT_FIELDS)[number]['key'];

interface StanceEditorInitial {
  id: string;
  name: string;
  description: string | null;
  weights: Record<StanceWeightKey, number>;
}

function StanceEditorForm({
  initial,
  onClose,
  onSaved
}: {
  initial: StanceEditorInitial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { runCommand, isRunning } = useCommandRunner();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [weightText, setWeightText] = useState<Record<StanceWeightKey, string>>(() => {
    const next = {} as Record<StanceWeightKey, string>;
    for (const field of STANCE_WEIGHT_FIELDS) {
      next[field.key] = String(initial?.weights[field.key] ?? 0);
    }
    return next;
  });
  const [ackExtreme, setAckExtreme] = useState(false);
  const [extremeJustification, setExtremeJustification] = useState('');

  const weightValues = STANCE_WEIGHT_FIELDS.map((field) => Number(weightText[field.key]));
  const weightsValid = weightValues.every((value) => Number.isInteger(value) && value >= 0 && value <= 100);
  const weightSum = weightValues.reduce((acc, value) => acc + value, 0);
  const maxWeight = Math.max(...weightValues);
  // Server rule: any single weight above 50 requires an explicit acknowledgement
  // plus a justification of at least 12 characters (assertExtremeWeightsAcknowledged).
  const needsExtremeAck = weightsValid && maxWeight > 50;
  const extremeAckSatisfied = !needsExtremeAck || (ackExtreme && extremeJustification.trim().length >= 12);
  const canSave = name.trim().length > 0 && weightsValid && weightSum === 100 && extremeAckSatisfied && !isRunning;

  async function handleSave() {
    if (!canSave) return;
    const weights = {} as Record<StanceWeightKey, number>;
    for (const field of STANCE_WEIGHT_FIELDS) {
      weights[field.key] = Number(weightText[field.key]);
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      weights
    };
    if (needsExtremeAck) {
      payload.acknowledgeExtremeWeights = true;
      payload.extremeWeightJustification = extremeJustification.trim();
    }
    if (initial) {
      payload.stanceId = initial.id;
      await runCommand('updateCreditEngineStance', payload, `Update credit engine stance "${name.trim()}"`);
    } else {
      await runCommand('createCreditEngineStance', payload, `Create credit engine stance "${name.trim()}"`);
    }
    onSaved();
    onClose();
  }

  return (
    <div className="mt-3 border border-line bg-panel p-3" data-testid="stance-editor-form">
      <h4 className="text-sm font-semibold">{initial ? `Edit stance — ${initial.name}` : 'New stance'}</h4>
      <p className="text-xs text-zinc-600">
        {initial
          ? 'Saving recomputes every customer assigned to this stance when weights change.'
          : 'Creates a new stance. Customers are only affected once the stance is assigned (per customer or as the global default).'}
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <label className="field-inline">
          Stance name
          <input className="input compact" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field-inline md:col-span-2">
          Stance description
          <input className="input compact" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {STANCE_WEIGHT_FIELDS.map((field) => (
          <label key={field.key} className="field-inline">
            {field.label}
            <input
              className="input compact"
              type="number"
              min="0"
              max="100"
              value={weightText[field.key]}
              onChange={(e) => setWeightText((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className={weightSum === 100 ? 'mt-2 text-xs text-zinc-600' : 'mt-2 text-xs text-danger'}>
        Weights must sum to 100 (currently {Number.isFinite(weightSum) ? weightSum : '—'}).
      </p>
      {needsExtremeAck ? (
        <div className="mt-2 border border-line bg-white p-2" data-testid="stance-extreme-ack">
          <label className="field-inline flex items-center gap-2">
            <input type="checkbox" checked={ackExtreme} onChange={(e) => setAckExtreme(e.target.checked)} />
            <span>A single weight exceeds 50 — I acknowledge this extreme weighting.</span>
          </label>
          <label className="field-inline mt-1">
            Extreme weight justification (min 12 characters)
            <input
              className="input compact"
              value={extremeJustification}
              onChange={(e) => setExtremeJustification(e.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className="primary-button compact-action" disabled={!canSave} onClick={handleSave}>
          {initial ? 'Save stance' : 'Create stance'}
        </button>
        <button type="button" className="secondary-button compact-action" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CreditEngineCustomerOverrides({
  stances
}: {
  stances: Array<{ id: string; name: string }>;
}) {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const [customerId, setCustomerId] = useState('');
  const [stanceId, setStanceId] = useState('');
  const [disableReason, setDisableReason] = useState('');
  const customers = (reference.data?.customers ?? []) as Array<{ id: string; name: string }>;

  const customerName = customers.find((c) => c.id === customerId)?.name ?? 'customer';

  async function handleSetStance() {
    if (!customerId) return;
    await runCommand(
      'setCustomerStance',
      { customerId, stanceId: stanceId === '' ? null : stanceId },
      stanceId === ''
        ? `Revert ${customerName} to the engine default stance`
        : `Pin ${customerName} to a specific credit stance`
    );
  }

  async function handleDisableEngine() {
    const reason = disableReason.trim();
    if (!customerId || reason.length < 4) return;
    await runCommand(
      'disableCreditEngineForCustomer',
      { customerId, reason },
      `Disable credit engine for ${customerName}`
    );
    setDisableReason('');
  }

  return (
    <div className="mt-6" data-testid="credit-engine-customer-overrides">
      <h3 className="section-title">Per-customer overrides</h3>
      <p className="text-xs text-zinc-600 mb-2">
        Pin one customer to a specific stance (or back to the engine default) — this queues an immediate engine recompute for that customer. Disabling the engine stops assessments from changing the customer&apos;s credit limit; their current limit is kept as a manual override, and the engine can be re-enabled later from the Credit Review queue.
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="field-inline">
          Customer
          <select
            className="select"
            aria-label="Override customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          Stance
          <select
            className="select"
            aria-label="Override stance"
            value={stanceId}
            onChange={(e) => setStanceId(e.target.value)}
          >
            <option value="">Engine default</option>
            {stances.map((stance) => (
              <option key={stance.id} value={stance.id}>
                {stance.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-inline">
          <span aria-hidden="true">&nbsp;</span>
          <button
            type="button"
            className="secondary-button compact-action"
            disabled={isRunning || !customerId}
            onClick={handleSetStance}
          >
            Set stance
          </button>
        </div>
        <label className="field-inline md:col-span-2">
          Disable reason (min 4 characters)
          <input
            className="input compact"
            aria-label="Disable reason"
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
          />
        </label>
        <div className="field-inline">
          <span aria-hidden="true">&nbsp;</span>
          <button
            type="button"
            className="secondary-button compact-action"
            disabled={isRunning || !customerId || disableReason.trim().length < 4}
            onClick={handleDisableEngine}
          >
            Disable engine for customer
          </button>
        </div>
      </div>
    </div>
  );
}

// Typed-confirmation phrase for the bulk revert. Kept exported-by-test via
// literal duplication in the test file on purpose — changing the phrase is a
// deliberate UX decision, not an incidental refactor.
const BULK_REVERT_PHRASE = 'REVERT TO ENGINE';

function CreditEngineBulkRevert() {
  const { runCommand, isRunning } = useCommandRunner();
  const [confirmText, setConfirmText] = useState('');
  const armed = confirmText.trim() === BULK_REVERT_PHRASE;

  async function handleBulkRevert() {
    if (!armed) return;
    await runCommand(
      'bulkRevertCustomersToEngine',
      // Explicit payload mirrors the server defaults so the journal records
      // intent: skip engine-disabled customers, and flip shadow mode off
      // (rollout intent — the engine goes live).
      { filter: { skipEngineDisabled: true }, flipShadowMode: true },
      'Bulk revert all manual credit overrides to the engine'
    );
    setConfirmText('');
  }

  return (
    <div className="mt-6 border border-danger p-3" data-testid="credit-engine-bulk-revert">
      <h3 className="section-title text-danger">Danger zone — bulk revert to engine</h3>
      <p className="text-xs text-zinc-600 mb-2">
        Reverts <strong>every</strong> customer whose credit limit is a manual override back to the engine-computed limit, and clears their manual review state (who set it, the reason, review date, and snooze count). Customers with the engine disabled are skipped, and customers without an engine assessment yet are skipped and reported. If shadow mode is still on, it is turned <strong>off</strong> — the engine goes live. This bulk action is terminal: it cannot be reversed in one step; individual customers must be restored manually afterward.
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="field-inline md:col-span-2">
          Type {BULK_REVERT_PHRASE} to confirm
          <input
            className="input compact"
            aria-label="Bulk revert confirmation"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={BULK_REVERT_PHRASE}
          />
        </label>
        <div className="field-inline">
          <span aria-hidden="true">&nbsp;</span>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center gap-2 border border-danger bg-danger px-3 text-sm font-medium text-white transition focus:outline-none focus-visible:shadow-focus hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isRunning || !armed}
            onClick={handleBulkRevert}
          >
            Bulk revert customers to engine
          </button>
        </div>
      </div>
    </div>
  );
}
