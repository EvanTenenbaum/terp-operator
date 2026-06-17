/**
 * GridView — Mercury UX primary layout template.
 *
 * Composes the full Mercury UX shell for primary grid views:
 * FilterToolbar → GridSummaryStrip → ViewTabBar → OperatorGrid → BulkActionBar
 * with a DetailSlideover overlay on the right.
 *
 * This is the canonical template for all `primaryGrid` views in the
 * view-registry.ts. Phase 1 delivers this as the single layout shell;
 * Phase 2+ adds masterDetail, dashboard, wizard, and report templates.
 */

import { useMemo, useCallback, useEffect, type ReactNode } from 'react';
import type { ColDef } from 'ag-grid-community';
import { useShallow } from 'zustand/shallow';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import { FilterToolbar } from '../components/FilterToolbar';
import { GridSummaryStrip } from '../components/GridSummaryStrip';
import { ViewTabBar } from '../components/ViewTabBar';
import { OperatorGrid } from '../components/OperatorGrid';
import { BulkActionBar, type BulkAction, type BulkActionResult } from '../components/BulkActionBar';
import { DetailSlideover, type SlideoverState } from '../components/DetailSlideover';
import { useColumnDefs } from '../hooks/useColumnDefs';
import { useEntityActions } from '../hooks/useEntityActions';
import { viewRegistry, type ViewEntry } from '../config/view-registry';
import type { GridRow, ViewKey, Role } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';
import type { BulkCommandRow, StatusCountsEntityType } from '../../shared/schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GridViewProps {
  /** View key — must match a registered entry in the view registry. */
  viewKey: ViewKey;
  /** Primary entity driving column definitions, status counts, and state machine. */
  entityType: string;
  /** Human-readable plural label (e.g. 'Purchase Orders'). Falls back to view config title. */
  entityLabel?: string;
  /** Optional custom summary strip — replaces the auto-fetched GridSummaryStrip when provided. */
  summarySlot?: ReactNode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_ROWS: GridRow[] = [] as const;

// ─── Entity type mappings ─────────────────────────────────────────────────────
// The view-registry entity field uses domain-level names (payment, sale, batch),
// but the backend statusCounts and gridSummary procedures each use their own
// naming conventions.  Map from viewKey → the canonical entity type each
// procedure expects so view files don't need to know backend naming details.

type StatusCountsEntity = string | null;
type GridSummaryEntity = string | null;

const VIEW_TO_STATUS_COUNTS: Partial<Record<ViewKey, StatusCountsEntity>> = {
  purchaseOrders: 'purchaseOrder',
  sales: 'salesOrder',
  orders: 'salesOrder',
  payments: 'payment',
  inventory: 'batch',
  intake: 'batch',
  items: 'item',
  fulfillment: 'fulfillmentLine',
  'fulfillment-picks': 'pickList',
  'fulfillment-lines': 'fulfillmentLine',
  connectors: 'connectorRequest',
  photography: 'photographyQueue',
  purchaseReceipts: 'purchaseReceipt',
  disputes: 'invoiceDispute',
  'credit-review': 'invoiceDispute',
  pick: 'pickList',
  matchmaking: 'matchmakingMatch',
  referees: 'refereeCredit',
};

const VIEW_TO_GRID_SUMMARY: Partial<Record<ViewKey, GridSummaryEntity>> = {
  purchaseOrders: 'purchaseOrder',
  sales: 'salesOrder',
  orders: 'salesOrder',
  payments: 'payment',
  inventory: 'batch',
  intake: 'batch',
  fulfillment: 'fulfillmentLine',
  purchaseReceipts: 'purchaseReceipt',
  connectors: 'connectorRequest',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Constructs a human-readable reason string for bulk command journaling.
 * Must be ≥3 characters and ≤500 characters per the bulkCommandInputSchema.
 */
function buildBulkReason(label: string, count: number, entityLabel: string): string {
  const noun = count === 1 ? entityLabel : `${entityLabel}s`;
  return `Bulk ${label} on ${count} ${noun}`;
}

/** Defensive fallback title when the view config hasn't been registered yet. */
function fallbackTitle(entityLabel: string | undefined, entityType: string): string {
  if (entityLabel) return entityLabel;
  // PascalCase → Title Case: 'purchaseOrder' → 'Purchase Order'
  return entityType
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GridView({ viewKey, entityType, entityLabel, summarySlot }: GridViewProps): ReactNode {
  // ── View config ────────────────────────────────────────────────────────────
  const viewConfig: ViewEntry | undefined = viewRegistry[viewKey];

  // ── Auth / role ────────────────────────────────────────────────────────────
  const me = trpc.auth.me.useQuery();
  const userRole: Role = me.data?.role ?? 'viewer';

  // ── Grid data ──────────────────────────────────────────────────────────────
  // tRPC auto-generated Input type for queries.grid (used for type-safe cast).
  type GridQueryInput = Parameters<typeof trpc.queries.grid.useQuery>[0];
  const grid = trpc.queries.grid.useQuery({ view: viewKey } as GridQueryInput);
  const rows: GridRow[] = (grid.data as GridRow[] | undefined) ?? EMPTY_ROWS;

  // ── Column definitions ─────────────────────────────────────────────────────
  const columnDefs: ColDef[] = useColumnDefs(entityType);

  // ── Selection state ────────────────────────────────────────────────────────
  const selectedRows: GridRow[] =
    useUiStore(useShallow((s) => s.selectedRows[viewKey] ?? EMPTY_ROWS));
  const setSelectedRows = useUiStore((s) => s.setSelectedRows);

  // ── Drawer / slideover state ───────────────────────────────────────────────
  const activeDrawerEntity = useUiStore(useShallow((s) => s.activeDrawerEntityByView[viewKey]));
  const drawerState: SlideoverState =
    (useUiStore((s) => s.drawerByView[viewKey]?.state) as SlideoverState | undefined) ?? 'closed';
  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);
  const setGridFilter = useUiStore((s) => s.setGridFilter);
  const gridFilter = useUiStore((s) => s.gridFilters[viewKey] ?? '');

  // ── Status counts for FilterToolbar StatusFilterPill (replaces ViewTabBar) ──
  const statusCountsEntity = VIEW_TO_STATUS_COUNTS[viewKey] ?? null;
  const statusCountsQuery = trpc.queries.statusCounts.useQuery(
    { entityType: statusCountsEntity as StatusCountsEntityType },
    { enabled: statusCountsEntity !== null },
  );
  const statusCounts = statusCountsQuery.data?.statuses ?? [];

  // ── Extract active status filter from grid filter string ───────────────────
  const activeStatusFilter = useMemo(() => {
    const match = gridFilter.match(/^status:(.+)$/);
    return match ? match[1] : '';
  }, [gridFilter]);

  // ── Selected rows with definite id + status (for entity action resolution) ─
  const selectionForActions: { id: string; status: string }[] = useMemo(
    () =>
      selectedRows
        .filter((r): r is GridRow & { id: string; status: string } =>
          typeof r.id === 'string' && r.id.length > 0 && typeof r.status === 'string',
        )
        .map((r) => ({ id: r.id, status: r.status })),
    [selectedRows],
  );

  // ── Bulk action definitions (resolved by entity state machine) ────────────
  const bulkActionDefs = useEntityActions(entityType, selectionForActions, userRole);

  // ── Bulk command mutation ──────────────────────────────────────────────────
  const runBulk = trpc.commands.runBulk.useMutation();

  // ── Wire bulk action definitions → executable BulkAction[] ─────────────────
  const bulkActions: BulkAction[] = useMemo(() => {
    if (bulkActionDefs.length === 0 || selectedRows.length === 0) return [];

    return bulkActionDefs.map((def): BulkAction => ({
      key: def.key,
      label: def.label,
      primary: def.primary,
      variant: def.variant,
      onAction: async (inputValue?: string): Promise<BulkActionResult> => {
        const groupKey = crypto.randomUUID();
        const label = def.label;

        const commands: BulkCommandRow[] = selectedRows.map((row) => ({
          entityType,
          entityId: row.id,
          // Entity action keys correspond to registered CommandNames;
          // safe assertion from the entity-actions config layer.
          commandName: def.key as CommandName,
          payload: inputValue ? { value: inputValue } : {},
          idempotencyKey: `${groupKey}:${row.id}`,
        }));

        try {
          const result = await runBulk.mutateAsync({
            groupKey,
            reason: buildBulkReason(label, selectedRows.length, entityLabel ?? entityType),
            commands,
          });

          return {
            succeeded: result.succeeded,
            failed: result.failed + result.rolledBack + result.skipped,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Bulk command failed';
          return { succeeded: 0, failed: selectedRows.length, error: message };
        }
      },
    }));
  }, [bulkActionDefs, selectedRows, entityType, entityLabel, runBulk]);

  // ── Selection change handler ───────────────────────────────────────────────
  const handleSelectionChange = useCallback(
    (rows: GridRow[]) => {
      setSelectedRows(viewKey, rows);

      // UX: single row selected → open detail drawer.
      // Multi-row selected → leave drawer as-is; BulkActionBar takes over.
      if (rows.length === 1) {
        setDrawerEntity(viewKey, entityType, rows[0].id);
        setDrawerState(viewKey, 'standard');
      } else if (rows.length === 0) {
        setDrawerState(viewKey, 'closed');
      }
    },
    [viewKey, entityType, setSelectedRows, setDrawerEntity, setDrawerState],
  );

  // ── Clear selection (bulk bar dismiss) ────────────────────────────────────
  const handleClearSelection = useCallback(() => {
    setSelectedRows(viewKey, []);
  }, [viewKey, setSelectedRows]);

  // ── Tab change → status filter (ViewTabBar compat) ────────────────────────
  const handleTabChange = useCallback(
    (key: string) => {
      if (key === 'all') {
        setGridFilter(viewKey, '');
      } else {
        setGridFilter(viewKey, `status:${key}`);
      }
    },
    [viewKey, setGridFilter],
  );

  // ── Multi-select status filter (FilterToolbar StatusFilterPill) ────────────
  const handleStatusFilterChange = useCallback(
    (statusFilter: string) => {
      if (!statusFilter) {
        setGridFilter(viewKey, '');
      } else {
        setGridFilter(viewKey, `status:${statusFilter}`);
      }
    },
    [viewKey, setGridFilter],
  );

  // ── URL serialization: persist status filter to URL params (ARCH-6) ────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeStatusFilter) {
      params.set('status', activeStatusFilter);
    } else {
      params.delete('status');
    }
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [activeStatusFilter]);

  // ── Drawer close ───────────────────────────────────────────────────────────
  const handleDrawerClose = useCallback(() => {
    setDrawerState(viewKey, 'closed');
  }, [viewKey, setDrawerState]);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = viewConfig?.title ?? fallbackTitle(entityLabel, entityType);

  // ── Active row for slideover detail (looked up by drawer entityId). ──────
  const activeRow = useMemo(() => {
    const eId = activeDrawerEntity?.entityId;
    if (!eId) return undefined;
    return rows.find((r) => r.id === eId);
  }, [rows, activeDrawerEntity?.entityId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid-view flex flex-col h-full" data-testid={`grid-view-${viewKey}`}>
      {/* FilterToolbar — status presets, quick filters, advanced, export */}
      <FilterToolbar
        view={viewKey}
        quickFilters={['date', 'keyword', 'amount']}
        exportFormats={['csv']}
        statusCounts={statusCounts}
        activeStatusFilter={activeStatusFilter}
        onStatusFilterChange={handleStatusFilterChange}
      />

      {/* GridSummaryStrip — auto-fetches from queries.gridSummary. Hidden when BulkActionBar is mounted (ARCH-4).
          When summarySlot is provided, it replaces the auto-fetched strip. */}
      {summarySlot ?? (selectedRows.length === 0 && (
        <GridSummaryStrip entityType={VIEW_TO_GRID_SUMMARY[viewKey] ?? entityType} />
      ))}

      {/* ViewTabBar — auto-fetches status counts from queries.statusCounts */}
      <ViewTabBar
        entityType={VIEW_TO_STATUS_COUNTS[viewKey] ?? entityType}
        onChange={handleTabChange}
        autoFetch
      />

      {/* OperatorGrid — the main AG Grid surface */}
      <div className="flex-1 min-h-0">
        <OperatorGrid
          view={viewKey}
          title={title}
          rows={rows}
          columns={columnDefs}
          loading={grid.isLoading}
          isError={grid.isError}
          onRetry={() => grid.refetch()}
          onSelectionChange={handleSelectionChange}
          emptyTitle={`No ${entityLabel ?? entityType} found`}
        />
      </div>

      {/* BulkActionBar — sticky-bottom bar when rows are selected */}
      {selectedRows.length > 0 && (
        <BulkActionBar
          selectedCount={selectedRows.length}
          entityLabel={entityLabel ?? entityType}
          actions={bulkActions}
          onClear={handleClearSelection}
        />
      )}

      {/* DetailSlideover — right-side panel, overlays the grid */}
      <DetailSlideover
        viewKey={viewKey}
        entityType={entityType}
        entityId={activeDrawerEntity?.entityId ?? null}
        state={drawerState}
        row={activeRow}
        role={userRole}
        onClose={handleDrawerClose}
      />
    </div>
  );
}
