import { useMemo, useState } from 'react';
import { Play, Search, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import { useCommandRunner } from './useCommandRunner';
import type { CommandName } from '../../shared/commandCatalog';
import type { GridRow, ViewKey } from '../../shared/types';

export function CommandPalette() {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const [query, setQuery] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const reference = trpc.queries.reference.useQuery(undefined, { enabled: open });
  const entitySearch = trpc.queries.globalSearch.useQuery({ q: query }, { enabled: open && query.trim().length > 1 });
  const { runCommand, isRunning } = useCommandRunner();

  const commands = useMemo(() => {
    const all = reference.data?.commands ?? [];
    return all.filter((command) => `${command.label} ${command.name} ${commandAliasText(command.name as CommandName)}`.toLowerCase().includes(query.toLowerCase())).slice(0, 16);
  }, [reference.data?.commands, query]);

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
    const view = viewForEntity(String(row.type));
    if (view) {
      setActiveView(view);
      setSelectedRows(view, [{ id: row.id } as GridRow]);
    }
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
        <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_0.8fr] overflow-hidden">
          <div className="overflow-y-auto p-2">
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
            {!commands.length && !Object.values(groups).some((rows) => Array.isArray(rows) && rows.length) ? (
              <div className="px-3 py-8 text-center text-sm text-zinc-600">No commands or rows matched.</div>
            ) : null}
          </div>
          <div className="border-l border-line bg-panel p-3">
            <div className="text-xs font-semibold uppercase text-zinc-600">Context payload</div>
            <pre className="mt-2 max-h-24 overflow-auto bg-white p-2 text-xs">{JSON.stringify(contextPayload, null, 2)}</pre>
            <label className="mt-3 block text-xs font-semibold uppercase text-zinc-600" htmlFor="payload-json">
              Extra JSON payload
            </label>
            <textarea
              id="payload-json"
              className="mt-2 h-44 w-full resize-none border border-line bg-white p-2 font-mono text-xs outline-none focus:shadow-focus"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
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
    connector: 'connectors',
    command: 'recovery'
  };
  return map[type] ?? null;
}

function safeDetail(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
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
