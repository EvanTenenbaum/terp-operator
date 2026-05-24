/**
 * GlobalFinderPanel — CAP-005 / TER-1478 (Phase 2)
 *
 * Global search overlay with Sales / Inventory / Procurement frames.
 * Opened via Cmd+Shift+F or the "Find" button in the Keel.
 * Consumes the existing `queries.globalSearch` tRPC procedure — no server
 * changes required.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { GridRow, ViewKey } from '../../shared/types';

type Frame = 'all' | 'sales' | 'inventory' | 'procurement';

const FRAME_LABELS: Record<Frame, string> = {
  all: 'All',
  sales: 'Sales',
  inventory: 'Inventory',
  procurement: 'Procurement'
};

/** Which globalSearch group keys are shown for each frame */
const FRAME_GROUPS: Record<Frame, string[]> = {
  all: ['customers', 'vendors', 'batches', 'orders', 'purchaseOrders', 'invoices', 'payments', 'picks', 'customerNeeds', 'vendorStock'],
  sales: ['customers', 'orders', 'invoices', 'payments', 'customerNeeds'],
  inventory: ['batches', 'picks', 'vendorStock'],
  procurement: ['vendors', 'purchaseOrders']
};

const TYPE_TO_VIEW: Record<string, ViewKey> = {
  customer: 'clients',
  vendor: 'vendors',
  purchaseOrder: 'purchaseOrders',
  order: 'orders',
  invoice: 'payments',
  payment: 'payments',
  batch: 'inventory',
  customerNeed: 'matchmaking',
  vendorSupply: 'matchmaking',
  pick: 'fulfillment',
  connector: 'settings',
  command: 'settings'
};

const TYPE_TO_DRAWER: Record<string, string> = {
  purchaseOrder: 'po',
  batch: 'lot',
  invoice: 'payment',
  customerNeed: 'customerNeed',
  vendorSupply: 'vendorSupply'
};

function drawerTypeFor(type: string) {
  return TYPE_TO_DRAWER[type] ?? type;
}

export function GlobalFinderPanel() {
  const open = useUiStore((state) => state.finderOpen);
  const setOpen = useUiStore((state) => state.setFinderOpen);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);

  const [query, setQuery] = useState('');
  const [frame, setFrame] = useState<Frame>('all');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  // Debounce search input — 200 ms
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setFrame('all');
    }
  }, [open]);

  const searchQuery = trpc.queries.globalSearch.useQuery(
    { q: debouncedQuery },
    { enabled: open && debouncedQuery.trim().length > 1 }
  );

  if (!open) return null;

  const allGroups = searchQuery.data?.groups ?? {};
  const allowedKeys = FRAME_GROUPS[frame];
  const visibleGroups = Object.entries(allGroups).filter(
    ([key, rows]) => allowedKeys.includes(key) && Array.isArray(rows) && (rows as GridRow[]).length > 0
  ) as [string, GridRow[]][];

  const hasResults = visibleGroups.length > 0;
  const isSearching = searchQuery.isFetching;

  function navigate(row: GridRow) {
    const type = String(row.type ?? '');
    const view = TYPE_TO_VIEW[type];
    if (!view) return;
    setActiveView(view);
    setSelectedRows(view, [row]);
    setDrawerEntity(view, drawerTypeFor(type), row.id);
    setDrawerState(view, 'standard');
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Global finder"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        ref={containerRef}
        className="mx-auto mt-16 flex max-h-[75vh] max-w-2xl flex-col border border-line bg-white shadow-2xl"
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            aria-label="Global finder search"
            maxLength={200}
            className="h-9 flex-1 truncate outline-none text-sm"
            placeholder="Find customers, orders, batches, vendors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isSearching && (
            <span className="text-xs text-zinc-400" aria-live="polite">Searching…</span>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Close global finder"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Frame selector */}
        <div className="flex gap-1 border-b border-line px-3 py-1.5" role="group" aria-label="Filter frame">
          {(Object.keys(FRAME_LABELS) as Frame[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={frame === f}
              className={
                frame === f
                  ? 'finder-chip success text-xs'
                  : 'finder-chip text-xs'
              }
              onClick={() => setFrame(f)}
            >
              {FRAME_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {debouncedQuery.trim().length <= 1 && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              Type at least 2 characters to search across all entities.
            </div>
          )}

          {debouncedQuery.trim().length > 1 && !isSearching && !hasResults && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              No results for <strong>{debouncedQuery}</strong>
              {frame !== 'all' && <> in <em>{FRAME_LABELS[frame]}</em> frame</>}.
            </div>
          )}

          {visibleGroups.map(([group, rows]) => (
            <div key={group} className="mb-2">
              <div className="px-3 py-1 text-[11px] font-bold uppercase text-zinc-500">{group}</div>
              {rows.map((row) => {
                const type = String(row.type ?? '');
                const canNavigate = Boolean(TYPE_TO_VIEW[type]);
                return (
                  <button
                    key={`${group}-${row.id}`}
                    type="button"
                    className="entity-result w-full"
                    disabled={!canNavigate}
                    onClick={() => navigate(row)}
                    title={canNavigate ? `Go to ${type}` : undefined}
                  >
                    <span className="entity-type">{type}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{String(row.label ?? '')}</span>
                      <span className="block truncate text-xs text-zinc-500">{safeDetail(row.detail)}</span>
                    </span>
                    {canNavigate && (
                      <span className="shrink-0 text-xs text-zinc-400">Go to →</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-panel px-3 py-1.5 text-xs text-zinc-500">
          <span>⌘⇧F to open · Esc to close</span>
          {hasResults && (
            <span>
              {visibleGroups.reduce((n, [, r]) => n + r.length, 0)} result{visibleGroups.reduce((n, [, r]) => n + r.length, 0) === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function safeDetail(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v ?? '-')}`)
      .join(' / ');
  }
  return String(value);
}
