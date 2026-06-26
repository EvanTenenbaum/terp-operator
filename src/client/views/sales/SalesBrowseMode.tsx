/**
 * SalesBrowseMode — Phase 3B Mode A (browsing, no customer selected).
 *
 * Mercury layout (UX-3 / ARCH-1):
 *   - Toolbar: status presets + "+ Inventory Finder" trigger (slide-over)
 *   - Primary surface: Sales Orders grid
 *   - Detail slide-over: opens on row click, shows registered salesOrder tabs
 *   - Inventory Finder: slide-over panel toggled from toolbar (NOT always-visible)
 *
 * Mode A → Mode B transition: selecting a customer cell sets ?customer=<uuid>
 * in the URL via `onCustomerSelect`. The Mercury mode router (SalesView.tsx)
 * then renders SalesBuildMode.
 *
 * Behind feature flag SALES_VIEW_MERCURY (currently false → not reachable in
 * production). LegacySalesView remains the production surface until the flag
 * flips.
 */
import { PackagePlus, Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { CellClickedEvent, CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useShallow } from 'zustand/react/shallow';
import { trpc } from '../../api/trpc';
import { OperatorGrid } from '../../components/OperatorGrid';
import { FilterPresetStrip } from '../../components/templates';
import { DetailSlideover, type SlideoverState } from '../../components/DetailSlideover';
import { InventoryFinderPanel, type InventoryFinderBatch } from '../../components/InventoryFinderPanel';
import { useCommandRunner } from '../../components/useCommandRunner';
import { useUiStore } from '../../store/uiStore';
import { registerSalesTabs } from '../../components/tabs/registerSalesTabs';
import { salesOrderCellCommand } from '../SalesView.ux-g03';
import { selectVisibleSalesColumns } from '../SalesView.columns';
import type { GridRow, Role, ViewKey } from '../../../shared/types';

// Register salesOrder slide-over tabs at module load. Idempotent (replaces
// any previous registration). Safe — never touches command bus or queries.
registerSalesTabs();

const VIEW_KEY: ViewKey = 'sales';

export interface SalesBrowseModeProps {
  /** Called when operator selects a customer — updates URL to ?customer=xxx */
  onCustomerSelect?: (customerId: string) => void;
}

// Order column definitions — driven by the entity-schemas registry (ARCH-8 / UX-8).
// The schema (`salesOrderSchema` → `saleSchema`) defines every column; the overrides
// below adjust visibility, widths, formatters, and the linesPicked semantic cell styling
// for the browse-mode surface. Custom renderers that aren't needed here (DisplayNameCell
// etc.) live in the SalesBuildMode override set instead.
import { useColumnDefs } from '../../hooks/useColumnDefs';

// ── Semantic cell-class rules for linesPicked (G-14) ───────────────────────
const LINES_PICKED_CLASS_RULES = {
  'lines-picked-complete': (params: { data?: GridRow }) => {
    const data = params.data;
    if (!data) return false;
    const total = Number(data.linesTotal ?? 0);
    const picked = Number(data.linesPicked ?? 0);
    return total > 0 && picked === total;
  },
  'lines-picked-partial': (params: { data?: GridRow }) => {
    const data = params.data;
    if (!data) return false;
    const total = Number(data.linesTotal ?? 0);
    const picked = Number(data.linesPicked ?? 0);
    return total > 0 && picked > 0 && picked !== total;
  },
};

const LINES_PICKED_FORMATTER = (params: { value: unknown; data?: GridRow }) => {
  const data = params.data;
  if (!data) return '';
  const total = Number(data.linesTotal ?? 0);
  const picked = Number(data.linesPicked ?? 0);
  if (!total) return '';
  return `${picked}/${total} picked`;
};

export function SalesBrowseMode(props: SalesBrowseModeProps) {
  const me = trpc.auth.me.useQuery();
  const role: Role = (me.data?.role as Role | undefined) ?? 'viewer';
  const canWrite = role !== 'viewer';

  const orders = trpc.queries.grid.useQuery({ view: 'sales' });
  const { runCommand } = useCommandRunner();

  const showMargin = useUiStore((s) => s.showMargin);
  const setSelectedRows = useUiStore((s) => s.setSelectedRows);

  // Drawer state for DetailSlideover.
  const activeDrawerEntity = useUiStore(
    useShallow((s) => s.activeDrawerEntityByView[VIEW_KEY]),
  );
  const drawerStateRaw = useUiStore((s) => s.drawerByView[VIEW_KEY]?.state);
  // SlideoverState is a strict subset of DrawerStateName ('focus' excluded).
  const drawerState: SlideoverState =
    drawerStateRaw === 'closed' ||
    drawerStateRaw === 'peek' ||
    drawerStateRaw === 'standard' ||
    drawerStateRaw === 'wide'
      ? drawerStateRaw
      : 'closed';
  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);

  // Inventory Finder slide-over toggle.
  const [finderOpen, setFinderOpen] = useState(false);

  // Order columns — schema-driven via useColumnDefs (G-13 / ARCH-8).
  // Overrides hide unneeded schema fields and supply browse-mode-specific
  // formatters + semantic cell classes (G-14).
  const orderOverrides = useMemo<Partial<ColDef<GridRow>>[]>(() => [
    // Hide schema fields not surfaced in browse mode.
    { field: 'orderedAt', hide: true },
    { field: 'packed', hide: true },
    { field: 'inventoryPosted', hide: true },
    { field: 'fulfilledAt', hide: true },
    { field: 'id', hide: true },
    { field: 'notes', hide: true },
    { field: 'createdAt', hide: true },
    { field: 'updatedAt', hide: true },
    { field: 'linesTotal', hide: true },
    // Adjust widths to match the legacy browse-mode surface.
    { field: 'orderNo', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'total', width: 120 },
    { field: 'internalMargin', headerName: 'Internal margin', width: 145 },
    { field: 'lines', width: 95 },
    { field: 'deliveryWindow', minWidth: 180, editable: true },
    // linesPicked: custom formatter + semantic cell-class rules (G-14).
    {
      field: 'linesPicked',
      headerName: 'Lines picked',
      width: 135,
      sortable: true,
      valueFormatter: LINES_PICKED_FORMATTER,
      cellClassRules: LINES_PICKED_CLASS_RULES,
    },
  ], []);

  const orderColumns = useColumnDefs('salesOrder', orderOverrides);

  const visibleOrderColumns = useMemo(
    () => selectVisibleSalesColumns(showMargin, orderColumns),
    [showMargin, orderColumns],
  );

  const salesOrderRows = (orders.data ?? []) as GridRow[];

  // Selection → open peek detail slide-over on single-row click.
  const handleSelectionChange = useCallback(
    (selection: GridRow[]) => {
      setSelectedRows('sales', selection);
      if (selection.length === 1) {
        setDrawerEntity(VIEW_KEY, 'salesOrder', String(selection[0].id));
        setDrawerState(VIEW_KEY, 'standard');
      } else if (selection.length === 0) {
        setDrawerState(VIEW_KEY, 'closed');
      }
    },
    [setSelectedRows, setDrawerEntity, setDrawerState],
  );

  const handleDrawerClose = useCallback(() => {
    setDrawerState(VIEW_KEY, 'closed');
  }, [setDrawerState]);

  // Slide-over row used by tab components.
  const slideoverRow: GridRow | undefined = useMemo(() => {
    if (!activeDrawerEntity?.entityId) return undefined;
    return salesOrderRows.find((r) => String(r.id) === activeDrawerEntity.entityId);
  }, [activeDrawerEntity, salesOrderRows]);

  // Inline cell-commit on the orders grid (delivery window etc).
  const onOrderCellCommit = useCallback(
    async (event: CellValueChangedEvent<GridRow>) => {
      if (!event.data?.id || event.oldValue === event.newValue) return;
      const command = salesOrderCellCommand(event.colDef.field, event.data.id, event.newValue);
      if (!command) return;
      await runCommand(command.name, command.payload, command.description);
      await orders.refetch();
    },
    [runCommand, orders],
  );

  // Customer cell click → Mode A → Mode B transition (R-04).
  const handleCellClick = useCallback(
    (event: CellClickedEvent<GridRow>) => {
      if (event.colDef.field === 'customer') {
        const customerId = event.data?.customerId;
        if (typeof customerId === 'string' && customerId) {
          props.onCustomerSelect?.(customerId);
        }
      }
    },
    [props.onCustomerSelect],
  );

  // Inventory Finder slide-over: in browse mode there is no active order,
  // so adding a batch is a no-op until the operator selects a customer.
  // We surface a helpful empty state inside the slide-over header.
  const handleFinderAdd = useCallback(
    async (_batch: InventoryFinderBatch, _qty: number): Promise<void> => {
      // No active order in browse mode. The legacy SalesSourcePane behaves the
      // same — addFinderBatch early-returns when no selectedOrder.
      return;
    },
    [],
  );

  return (
    <div className="view-stack">
      {/* Toolbar — status presets + finder trigger */}
      <div className="control-band">
        {canWrite ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setFinderOpen(true)}
            title="Open the Inventory Finder slide-over"
            data-testid="sales-browse-open-finder"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Inventory Finder
          </button>
        ) : null}
        <FilterPresetStrip
          view="sales"
          ariaLabel="Filter by status"
          presets={[
            { label: 'All Open', filter: 'status:draft,confirmed' },
            { label: 'Confirmed', filter: 'status:confirmed' },
            { label: 'Posted', filter: 'status:posted' },
          ]}
        />
      </div>

      {/* Primary: Sales Orders grid */}
      <div className="min-h-[420px]">
        <OperatorGrid
          view="sales"
          title="Sales Orders"
          rows={salesOrderRows}
          columns={visibleOrderColumns}
          loading={orders.isLoading}
          isError={orders.isError}
          onRetry={() => orders.refetch()}
          onSelectionChange={handleSelectionChange}
          onCellCommit={canWrite ? onOrderCellCommit : undefined}
          onCellClicked={handleCellClick}
          emptyTitle="No open sales shown"
          emptyChildren="Choose a customer from the keel bar to start a sale."
        />
      </div>

      {/* DetailSlideover — registered salesOrder tabs (Lines/Pricing/etc) */}
      {activeDrawerEntity?.entityId && drawerState !== 'closed' && (
        <DetailSlideover
          viewKey={VIEW_KEY}
          entityType="salesOrder"
          entityId={activeDrawerEntity.entityId}
          state={drawerState}
          row={slideoverRow}
          role={role}
          onClose={handleDrawerClose}
          onStateChange={(s) => setDrawerState(VIEW_KEY, s)}
        />
      )}

      {/* Inventory Finder slide-over — toolbar-triggered, NOT always-visible */}
      {finderOpen && (
        <aside
          className="slideover slideover--wide"
          role="dialog"
          aria-modal="true"
          aria-label="Inventory Finder"
          data-testid="sales-browse-finder-slideover"
        >
          <div className="slideover-header">
            <button
              type="button"
              className="icon-button"
              onClick={() => setFinderOpen(false)}
              aria-label="Close Inventory Finder"
              data-testid="sales-browse-finder-close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">Inventory Finder</div>
              <div className="truncate text-[11px] uppercase text-zinc-500">
                Browse posted batches
              </div>
            </div>
          </div>
          <div className="slideover-body">
            <div className="mb-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <PackagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Select a customer (keel bar) to enter Build Mode before adding lines.
                In Browse Mode the finder is read-only.
              </span>
            </div>
            <InventoryFinderPanel
              customerId={undefined}
              selectedOrderId={''}
              onAddBatch={handleFinderAdd}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
