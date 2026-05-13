import { useMemo, useState } from 'react';
import { Braces, Play, Search, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { startVisibleForUser, viewVisibleForUser } from '../accessPolicy';
import { useUiStore } from '../store/uiStore';
import { useCommandRunner } from './useCommandRunner';
import type { CommandName } from '../../shared/commandCatalog';
import type { GridRow, QuickLaunchMode, ViewKey } from '../../shared/types';

const launchActions: Array<{
  label: string;
  detail: string;
  aliases: string;
  view: ViewKey;
  launch: QuickLaunchMode;
}> = [
  { label: 'New sale', detail: 'Open Sales with the customer-first workspace and inventory finder ready.', aliases: 'sale order customer sell quote catalog', view: 'sales', launch: 'sale' },
  { label: 'New purchase order', detail: 'Open Purchase Orders with vendor and line-entry controls ready.', aliases: 'purchase po procure buy vendor order', view: 'purchaseOrders', launch: 'purchaseOrder' },
  { label: 'Receive product', detail: 'Open Intake for receiving rows, Ready marking, and receipt posting.', aliases: 'receive receiving intake inventory batch vendor receipt', view: 'intake', launch: 'receiving' },
  { label: 'Money in', detail: 'Open Payments with Quick Ledger in Money In mode.', aliases: 'receive money payment cash crypto check wire paid', view: 'payments', launch: 'moneyIn' },
  { label: 'Money out', detail: 'Open Vendor Payouts with a payout row ready.', aliases: 'pay vendor payout payable bill pay money out', view: 'vendors', launch: 'moneyOut' }
];

export function CommandPalette() {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const advancedOpen = useUiStore((state) => state.commandPaletteAdvancedOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setAdvancedOpen = useUiStore((state) => state.setCommandPaletteAdvancedOpen);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  const setActiveQuickLaunch = useUiStore((state) => state.setActiveQuickLaunch);
  const setSalesRequestText = useUiStore((state) => state.setSalesRequestText);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerTab = useUiStore((state) => state.setDrawerTab);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const [query, setQuery] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const me = trpc.auth.me.useQuery();
  const reference = trpc.queries.reference.useQuery(undefined, { enabled: open });
  const entitySearch = trpc.queries.globalSearch.useQuery({ q: query }, { enabled: open && query.trim().length > 1 });
  const { runCommand, isRunning } = useCommandRunner();
  const normalizedQuery = query.trim().toLowerCase();

  const commands = useMemo(() => {
    const all = reference.data?.commands ?? [];
    if (!normalizedQuery) return [];
    return all.filter((command) => `${command.label} ${command.name} ${commandAliasText(command.name as CommandName)}`.toLowerCase().includes(normalizedQuery)).slice(0, 16);
  }, [reference.data?.commands, normalizedQuery]);

  const matchingLaunches = useMemo(() => {
    const user = me.data;
    const allowed = user ? launchActions.filter((action) => viewVisibleForUser(action.view, user) && startVisibleForUser(action.launch, user)) : launchActions;
    if (!normalizedQuery) return allowed;
    return allowed.filter((action) => `${action.label} ${action.detail} ${action.aliases}`.toLowerCase().includes(normalizedQuery));
  }, [me.data, normalizedQuery]);

  if (!open) return null;

  const contextPayload = selectedRows[activeView]?.length
    ? {
        selectedIds: selectedRows[activeView]?.map((row) => row.id),
        sourceView: activeView
      }
    : {};

  async function run(name: CommandName) {
    let payload: Record<string, unknown> = contextPayload;
    try {
      payload = { ...contextPayload, ...(JSON.parse(payloadText) as Record<string, unknown>) };
    } catch {
      payload = contextPayload;
    }
    await runCommand(name, payload, `Run from command palette on ${activeView}`);
    setOpen(false);
  }

  function openEntity(row: GridRow) {
    const type = String(row.type);
    if (type === 'connector') {
      setActiveSettingsTab('requests');
      setActiveView('settings');
      setSelectedRows('connectors', [{ id: row.id } as GridRow]);
      setDrawerEntity('settings', 'connector', row.id);
      setOpen(false);
      return;
    }
    if (type === 'command') {
      setActiveSettingsTab('actions');
      setActiveView('settings');
      setSelectedRows('recovery', [{ id: row.id } as GridRow]);
      setDrawerEntity('settings', 'recovery', row.id);
      setOpen(false);
      return;
    }
    const view = viewForEntity(type);
    if (view) {
      const drawerType = drawerTypeForEntity(type);
      setActiveView(view);
      setSelectedRows(view, [row]);
      setDrawerEntity(view, drawerType, row.id);
      if (relationshipEntity(row, type)) {
        setDrawerTab(view, 'relationship');
        setDrawerState(view, 'standard');
      }
    }
    setOpen(false);
  }

  function launchWorkflow(action: (typeof launchActions)[number]) {
    setActiveQuickLaunch(action.launch);
    if (action.view === 'sales' && normalizedQuery && !['new sale', 'sale', 'sales'].includes(normalizedQuery)) {
      setSalesRequestText(query.trim());
    }
    setActiveView(action.view);
    setOpen(false);
  }

  const groups = entitySearch.data?.groups ?? {};

  return (
    <div className="fixed inset-0 z-40 bg-black/25 p-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="mx-auto mt-12 flex max-h-[80vh] max-w-3xl flex-col border border-line bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <input
            autoFocus
            className="h-9 flex-1 outline-none"
            placeholder="Type a command, table, client, or row ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="icon-button" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className={advancedOpen ? 'grid min-h-0 flex-1 grid-cols-[1.2fr_0.8fr] overflow-hidden' : 'min-h-0 flex-1 overflow-hidden'}>
          <div className="overflow-y-auto p-2">
            {matchingLaunches.length ? (
              <div className="mb-2">
                <div className="px-3 py-1 text-[11px] font-bold uppercase text-zinc-500">Start work</div>
                {matchingLaunches.map((action) => (
                  <button type="button" key={action.launch} className="entity-result" onClick={() => launchWorkflow(action)}>
                    <span className="entity-type">open</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{action.label}</span>
                      <span className="block truncate text-xs text-zinc-500">{action.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {Object.entries(groups).map(([group, rows]) =>
              Array.isArray(rows) && rows.length ? (
                <div key={group} className="mb-2">
                  <div className="px-3 py-1 text-[11px] font-bold uppercase text-zinc-500">{group}</div>
                  {(rows as GridRow[]).map((row) => (
                    <button type="button" key={`${group}-${row.id}`} className="entity-result" onClick={() => openEntity(row)}>
                      <span className="entity-type">{String(row.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{String(row.label)}</span>
                        <span className="block truncate text-xs text-zinc-500">{safeDetail(row.detail)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null
            )}
            {commands.length ? (
              <div className="mb-2">
                <div className="px-3 py-1 text-[11px] font-bold uppercase text-zinc-500">Commands</div>
                {commands.map((command) => (
                  <button
                    type="button"
                    key={command.name}
                    className="flex w-full items-center gap-2 border border-transparent px-3 py-2 text-left text-sm hover:border-line hover:bg-panel focus:outline-none focus-visible:shadow-focus"
                    disabled={isRunning}
                    onClick={() => run(command.name)}
                  >
                    <Play className="h-4 w-4 text-accent" aria-hidden="true" />
                    <span className="flex-1">
                      <span className="block font-medium text-ink">{command.label}</span>
                      <span className="text-xs text-zinc-500">{command.name}{command.minRole ? ` / ${command.minRole}+` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {!commands.length && !matchingLaunches.length && !Object.values(groups).some((rows) => Array.isArray(rows) && rows.length) ? (
              <div className="px-3 py-8 text-center text-sm text-zinc-600">No commands or rows matched.</div>
            ) : null}
          </div>
          {advancedOpen ? <div className="border-l border-line bg-panel p-3">
            <div className="text-xs font-semibold uppercase text-zinc-600">Current context</div>
            <pre className="mt-2 max-h-24 overflow-auto bg-white p-2 text-xs">{JSON.stringify(contextPayload, null, 2)}</pre>
            <label className="mt-3 block text-xs font-semibold uppercase text-zinc-600" htmlFor="payload-json">
              Advanced JSON
            </label>
            <textarea
              id="payload-json"
              className="mt-2 h-44 w-full resize-none border border-line bg-white p-2 font-mono text-xs outline-none focus:shadow-focus"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
            />
          </div> : null}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-panel px-3 py-2 text-xs text-zinc-600">
          <span>{selectedRows[activeView]?.length ? `${selectedRows[activeView]?.length} selected on ${activeView}` : activeView}</span>
          <button type="button" className="text-button h-7 text-xs" onClick={() => setAdvancedOpen(!advancedOpen)}>
            <Braces className="h-3.5 w-3.5" aria-hidden="true" />
            Advanced payload
          </button>
        </div>
      </div>
    </div>
  );
}

function drawerTypeForEntity(type: string) {
  const map: Record<string, string> = {
    purchaseOrder: 'po',
    batch: 'lot',
    invoice: 'payment'
  };
  return map[type] ?? type;
}

function viewForEntity(type: string): ViewKey | null {
  const map: Record<string, ViewKey> = {
    customer: 'clients',
    vendor: 'vendors',
    purchaseOrder: 'purchaseOrders',
    order: 'orders',
    invoice: 'payments',
    payment: 'payments',
    batch: 'inventory',
    pick: 'fulfillment',
    connector: 'settings',
    command: 'settings'
  };
  return map[type] ?? null;
}

function relationshipEntity(row: GridRow, type: string) {
  return ['customer', 'vendor', 'order', 'invoice', 'payment', 'purchaseOrder', 'batch', 'pick', 'connector'].includes(type) || Boolean(row.customerId || row.vendorId);
}

function safeDetail(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).slice(0, 3).map(([key, entry]) => `${key}: ${String(entry ?? '-')}`).join(' / ');
  return String(value);
}

function commandAliasText(name: CommandName) {
  const aliases: Partial<Record<CommandName, string>> = {
    logPayment: 'receive money files cash crypto buyer credit down payment',
    allocatePayment: 'fifo invoice apply money',
    createVendorBill: 'payable vendor due bill',
    createPurchaseOrder: 'new po procurement purchase before receiving',
    addPurchaseOrderLine: 'planned buy product line procurement',
    approvePurchaseOrder: 'order approve purchase send vendor',
    receivePurchaseOrder: 'receive po into intake draft rows',
    recordVendorPayment: 'pay vendor payout money out',
    postPurchaseReceipt: 'process intake receiving receipt po',
    createBatch: 'new receiving intake row Ins candy ofc cv marker',
    attachBatchPhoto: 'photo catalog media',
    reverseCommandById: 'undo reversal mistake',
    archivePeriod: 'closeout archive period'
  };
  return aliases[name] ?? '';
}
