/**
 * GridView — Mercury UX primary layout template (canonical name: PrimaryGridView).
 *
 * Composes the full Mercury UX shell for primary grid views:
 * FilterToolbar → GridSummaryStrip → ViewTabBar → OperatorGrid → BulkActionBar
 * with a DetailSlideover overlay on the right.
 *
 * This is the canonical template for all `primaryGrid` views in the
 * view-registry.ts. Phase 1 delivers this as the single layout shell;
 * Phase 2+ adds masterDetail, dashboard, wizard, and report templates.
 *
 * **Naming:** The architecture documents (Manifesto §2.1, slot contracts, migration plan)
 * refer to this component as `PrimaryGridView`. The exported name `GridView` is the
 * runtime name; `PrimaryGridView` is a re-export alias matching the architecture docs.
 * After the GridJourney deprecation completes in Phase 4, GridView will be renamed to
 * PrimaryGridView as the canonical export.
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
import type { ChipEditField, BulkChipEditResult } from '../components/BulkChipEdit';
import { DetailSlideover, type SlideoverState } from '../components/DetailSlideover';
import { useColumnDefs } from '../hooks/useColumnDefs';
import { useEntityActions } from '../hooks/useEntityActions';
import { viewRegistry, type ViewEntry } from '../config/view-registry';
import { entitySchemas } from '../config/entity-schemas';
import type { GridRow, ViewKey, Role } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';
import type { BulkCommandRow, StatusCountsEntityType } from '../../shared/schemas';
import { GROUP_BY_ALLOWLIST } from '../../server/routers/gridWhere';

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

// ── Bulk chip edit: entity → update command mapping ────────────────────────
// Maps entity types to their partial-update command names and the ID field
// the command expects. Entities not listed here won't show chip edit fields.
// Reason stamp: "Bulk set {fieldName} to {value} on N {entityType} rows"

const ENTITY_CHIP_EDIT_COMMAND: Partial<Record<string, { commandName: CommandName; idField: string }>> = {
  purchaseOrder: { commandName: 'updatePurchaseOrder', idField: 'purchaseOrderId' },
  intake: { commandName: 'updateBatch', idField: 'batchId' },
  item: { commandName: 'updateItem', idField: 'itemId' },
  vendor: { commandName: 'updateVendor', idField: 'vendorId' },
};

/** Derive chip edit fields from the entity schema. Returns fields that have
 *  an `optionSource` (enum or status kind) and a `chip` config. */
function computeChipEditFields(
  entityType: string,
  selectedRows: GridRow[],
): ChipEditField[] {
  const schema = entitySchemas[entityType];
  if (!schema || selectedRows.length === 0) return [];

  return schema.fields
    .filter((f) => {
      // Must have optionSource values and chip config
      if (!f.optionSource || !f.chip) return false;
      const os = f.optionSource;
      if (os.kind !== 'enum' && os.kind !== 'status') return false;
      if (os.kind === 'enum' && (!os.values || os.values.length === 0)) return false;
      return true;
    })
    .map((f): ChipEditField => {
      let options: { value: string; label: string }[];
      if (f.optionSource!.kind === 'enum') {
        options = (f.optionSource! as { kind: 'enum'; values: { value: string; label: string }[] }).values;
      } else {
        // status kind — options come from selected rows' values or empty
        const unique = [...new Set(selectedRows.map((r) => String(r[f.field] ?? '')))].filter(Boolean);
        options = unique.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') }));
      }

      // Current shared value (if all rows have the same value)
      const currentValues = [...new Set(selectedRows.map((r) => r[f.field] as string | undefined))];
      const currentValue = currentValues.length === 1 ? currentValues[0] ?? null : null;

      return {
        field: f.field,
        headerName: f.headerName,
        options,
        currentValue,
      };
    });
}

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

  // ── Chip edit fields (from schema + selected rows) ────────────────────────
  const chipEditFields = useMemo(
    () => computeChipEditFields(entityType, selectedRows),
    [entityType, selectedRows],
  );

  // ── Chip edit commit handler: dispatches bulk commands ─────────────────────
  const handleChipEditCommit = useCallback(
    async (field: string, value: string): Promise<BulkChipEditResult> => {
      const cmdInfo = ENTITY_CHIP_EDIT_COMMAND[entityType];
      if (!cmdInfo) {
        return { succeeded: 0, failed: selectedRows.length, error: `No update command mapped for ${entityType}` };
      }

      const groupKey = crypto.randomUUID();
      const schema = entitySchemas[entityType];
      const fieldDef = schema?.fields.find((f) => f.field === field);
      const fieldName = fieldDef?.headerName ?? field;

      const commands: BulkCommandRow[] = selectedRows.map((row) => ({
        entityType,
        entityId: row.id,
        commandName: cmdInfo.commandName,
        payload: { [cmdInfo.idField]: row.id, [field]: value },
        idempotencyKey: `${groupKey}:${row.id}`,
      }));

      try {
        const result = await runBulk.mutateAsync({
          groupKey,
          reason: `Bulk set ${fieldName} to ${value} on ${selectedRows.length} ${entityType} rows`,
          commands,
        });

        return {
          succeeded: result.succeeded,
          failed: result.failed + result.rolledBack + result.skipped,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bulk chip edit failed';
        return { succeeded: 0, failed: selectedRows.length, error: message };
      }
    },
    [entityType, selectedRows, runBulk],
  );

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
      {/* FilterToolbar — status presets, quick filters, advanced, export, group-by */}
      <FilterToolbar
        view={viewKey}
        quickFilters={['date', 'keyword', 'amount']}
        exportFormats={['csv']}
        statusCounts={statusCounts}
        activeStatusFilter={activeStatusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        groupByFields={GROUP_BY_ALLOWLIST[viewKey as keyof typeof GROUP_BY_ALLOWLIST] ?? []}
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
          chipEditFields={chipEditFields}
          onChipEditCommit={handleChipEditCommit}
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

/**
 * PrimaryGridView — canonical name matching architecture docs (Manifesto §2.1, slot contracts).
 * Re-export of GridView. After Phase 4 GridJourney deprecation completes, this becomes the
 * sole canonical export and GridView becomes the deprecated alias.
 */
export const PrimaryGridView = GridView;
