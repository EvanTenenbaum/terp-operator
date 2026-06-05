import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellContextMenuEvent,
  CellPosition,
  CellValueChangedEvent,
  ColDef,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnVisibleEvent,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  RangeSelectionChangedEvent,
  SideBarDef,
  SortChangedEvent,
  TabToNextCellParams,
  ValueGetterParams
} from 'ag-grid-community';
import { Columns3, Download, Filter, RotateCcw, Search, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { EmptyState } from './EmptyState';
import { IssueSidecar } from './IssueSidecar';
import { RelationshipDrawer } from './RelationshipDrawer';
import { RowCommandHistoryDrawer } from './RowCommandHistoryDrawer';
import { SelectionSummary } from './SelectionSummary';
import type { CellRangeStat } from './SelectionSummary';
import { StatusPill } from './StatusPill';
import { WorkspacePanel } from './WorkspacePanel';
import { ExpansionPanel } from './ExpansionPanel';
import { ExpansionChevronCell } from './ExpansionChevronColumn';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
import type { FilterGroupInput, FilterCondition } from '../../shared/filterSchemas';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder';
import { evaluateFilterGroup } from '../utils/filterEvaluator';
import {
  applyGridFilter,
  columnIdentities,
  columnStateToPrefs,
  filterChips,
  mergeColumnDefsWithPrefs,
  parseGridFilter,
  removeFilterChip,
  serializeGridFilter
} from './gridFilterUtils';
import { buildCsvExportOptions } from './OperatorGrid.csvExport';
import { formatTs } from '../utils/format';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

interface OperatorGridProps {
  view: ViewKey;
  title: string;
  subtitle?: string;
  rows: GridRow[];
  columns: ColDef<GridRow>[];
  loading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  actions?: ReactNode;
  selectionActions?: (rows: GridRow[]) => ReactNode;
  contextMenuItems?: (row: GridRow, canWrite: boolean) => ContextMenuItem[];
  onSelectionChange?: (rows: GridRow[]) => void;
  onCellCommit?: (event: CellValueChangedEvent<GridRow>) => void;
  emptyTitle?: string;
  emptyChildren?: ReactNode;
  tableKey?: string;
  rowClassRules?: Record<string, (params: { data?: GridRow }) => boolean>;
  expansionConfig?: {
    enabled: boolean;
    actionsRenderer?: (row: GridRow) => ReactNode;
    historyRenderer?: (row: GridRow) => ReactNode;
    childrenRenderer?: (row: GridRow) => ReactNode;
    isRowMaster?: (row: GridRow) => boolean;
  };
}


export function OperatorGrid({
  view,
  title,
  subtitle,
  rows,
  columns,
  loading,
  isError,
  onRetry,
  actions,
  selectionActions,
  contextMenuItems,
  onSelectionChange,
  onCellCommit,
  emptyTitle,
  emptyChildren,
  tableKey,
  rowClassRules,
  expansionConfig
}: OperatorGridProps) {
  const apiRef = useRef<GridApi<GridRow> | null>(null);
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [selectedRows, setSelectedRows] = useState<GridRow[]>([]);
  const [cellRangeStats, setCellRangeStats] = useState<CellRangeStat[]>([]);
  const [historyRow, setHistoryRow] = useState<GridRow | null>(null);
  const [relationshipRow, setRelationshipRow] = useState<GridRow | null>(null);
  const [issueRow, setIssueRow] = useState<GridRow | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    items: ContextMenuItem[];
    x: number;
    y: number;
  } | null>(null);
  const storedGridFilter = useUiStore((state) => state.gridFilters[view] ?? '');
  const setStoredGridFilter = useUiStore((state) => state.setGridFilter);
  const storedAdvancedFilter = useUiStore((state) => state.gridAdvancedFilters[view]);
  const setStoredAdvancedFilter = useUiStore((state) => state.setGridAdvancedFilter);
  const clearStoredAdvancedFilter = useUiStore((state) => state.clearGridAdvancedFilter);
  const resolvedTableKey = tableKey ?? `view:${view}`;
  const storedColumnPrefs = useUiStore((state) => state.gridColumnPrefs[resolvedTableKey]);
  const setGridColumnPrefs = useUiStore((state) => state.setGridColumnPrefs);
  const resetGridColumnPrefs = useUiStore((state) => state.resetGridColumnPrefs);
  const [quickFilter, setQuickFilter] = useState(storedGridFilter);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const parsedFilter = useMemo(() => parseGridFilter(quickFilter), [quickFilter]);
  const advancedFilteredRows = useMemo(() => {
    if (!storedAdvancedFilter || storedAdvancedFilter.conditions.length === 0) return rows;
    return rows.filter((row) => evaluateFilterGroup(row as unknown as Record<string, unknown>, storedAdvancedFilter));
  }, [rows, storedAdvancedFilter]);
  const renderedRows = useMemo(() => applyGridFilter(advancedFilteredRows, parsedFilter), [parsedFilter, advancedFilteredRows]);
  const panelId = useMemo(() => `grid:${view}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [title, view]);

  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  // GH #326: triggerRef excluded from click-outside handler to prevent re-open on toggle click
  const columnsMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const defaultColDef = useMemo<ColDef<GridRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      editable: false,
      minWidth: 120,
      enableRowGroup: true,
      enablePivot: true,
      enableValue: true,
      cellDataType: false,
      valueFormatter: (params) => formatGridValue(params.value)
    }),
    []
  );

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => {
    const baseColumns = mergeColumnDefsWithPrefs(
      withRowNumbers(withCreatedAtFormatter(withStatusRenderer(columns, canWrite))),
      storedColumnPrefs
    );

    if (expansionConfig?.enabled) {
      const chevronColumn: ColDef<GridRow> = {
        colId: 'expansion-chevron',
        headerName: '',
        width: 48,
        minWidth: 48,
        maxWidth: 48,
        pinned: 'left',
        lockPinned: true,
        suppressMovable: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellRenderer: (params: ICellRendererParams<GridRow>) => {
          const isExpanded = params.node.expanded ?? false;
          const onToggle = () => {
            params.node.setExpanded(!isExpanded);
          };
          return <ExpansionChevronCell {...params} isExpanded={isExpanded} onToggle={onToggle} />;
        }
      };

      return [baseColumns[0], chevronColumn, ...baseColumns.slice(1)];
    }

    return baseColumns;
  }, [canWrite, columns, expansionConfig?.enabled, storedColumnPrefs]);

  const columnIdents = useMemo(() => columnIdentities(columns), [columns]);
  const chips = useMemo(() => filterChips(parsedFilter), [parsedFilter]);

  const rowSelection = useMemo(
    () => ({
      mode: 'multiRow' as const,
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true
    }),
    []
  );
  const cellSelection = useMemo(() => ({ handle: { mode: 'range' as const } }), []);
  const sideBar = useMemo<SideBarDef>(() => ({ toolPanels: ['columns', 'filters'], hiddenByDefault: true }), []);

  const tabToNextCell = useCallback((params: TabToNextCellParams<GridRow>): CellPosition | null => {
    const allColumns = params.api.getColumns() ?? [];
    const editableCols = allColumns.filter((col) => {
      const def = col.getColDef() as ColDef<GridRow>;
      return def.editable === true;
    });
    if (!editableCols.length) return params.nextCellPosition;
    const currentColId = params.previousCellPosition.column.getColId();
    const rowIndex = params.previousCellPosition.rowIndex;
    const rowPinned = params.previousCellPosition.rowPinned ?? null;
    const currentIdx = editableCols.findIndex((c) => c.getColId() === currentColId);
    // If current cell is not in the editable set (e.g. a read-only column like batchCode),
    // fall back to AG Grid default Tab behaviour rather than jumping to the next row.
    if (currentIdx < 0) return params.nextCellPosition;
    if (!params.backwards) {
      if (currentIdx < editableCols.length - 1) {
        return { rowIndex, column: editableCols[currentIdx + 1], rowPinned };
      }
      const nextRow = rowIndex + 1;
      if (nextRow < params.api.getDisplayedRowCount()) {
        return { rowIndex: nextRow, column: editableCols[0], rowPinned: null };
      }
      return null;
    } else {
      if (currentIdx > 0) {
        return { rowIndex, column: editableCols[currentIdx - 1], rowPinned };
      }
      const prevRow = rowIndex - 1;
      if (prevRow >= 0) {
        return { rowIndex: prevRow, column: editableCols[editableCols.length - 1], rowPinned: null };
      }
      return null;
    }
  }, []);
  // #34 FE-M5 / FE-L2 — accessible names for AG Grid floating-filter inputs,
  // sort affordances, and column-menu chevrons. AG Grid ships English
  // defaults for these keys but pinning them here documents intent and
  // protects against future locale-bundle swaps that would silently drop
  // the accessible names.
  const localeText = useMemo<Record<string, string>>(
    () => ({
      ariaFilterInput: 'filter input',
      ariaFilterValue: 'filter value',
      ariaFilterFromValue: 'filter from value',
      ariaFilterToValue: 'filter to value',
      ariaFilteringOperator: 'filtering operator',
      ariaFilterMenuOpen: 'open filter menu',
      ariaFilterColumn: 'press CTRL ENTER to open filter for column',
      ariaSortableColumn: 'press ENTER to sort column',
      ariaMenuColumn: 'press ALT DOWN to open column menu',
      ariaColumnFiltered: 'column filtered',
      ariaInputEditor: 'input editor',
      ariaLabelColumnFilter: 'column filter',
      ariaLabelColumnMenu: 'column menu',
      ariaLabelCellEditor: 'cell editor'
    }),
    []
  );

  useEffect(() => {
    setQuickFilter(storedGridFilter);
    apiRef.current?.setGridOption('quickFilterText', parseGridFilter(storedGridFilter).freeText);
  }, [storedGridFilter]);

  const writeQuickFilter = useCallback(
    (next: string) => {
      setQuickFilter(next);
      setStoredGridFilter(view, next);
      apiRef.current?.setGridOption('quickFilterText', parseGridFilter(next).freeText);
    },
    [setStoredGridFilter, view]
  );

  const persistColumnState = useCallback(() => {
    if (!apiRef.current) return;
    const state = apiRef.current.getColumnState() as Parameters<typeof columnStateToPrefs>[0];
    setGridColumnPrefs(resolvedTableKey, columnStateToPrefs(state));
  }, [resolvedTableKey, setGridColumnPrefs]);

  const setColumnHidden = useCallback(
    (colId: string, hide: boolean) => {
      apiRef.current?.setColumnsVisible([colId], !hide);
      persistColumnState();
    },
    [persistColumnState]
  );

  const removeChip = useCallback(
    (field: string, value: string) => {
      const next = removeFilterChip(parsedFilter, field, value);
      writeQuickFilter(serializeGridFilter(next));
    },
    [parsedFilter, writeQuickFilter]
  );

  const onRangeSelectionChanged = useCallback((event: RangeSelectionChangedEvent<GridRow>) => {
    const api = event.api;
    const ranges = api.getCellRanges();
    if (!ranges?.length) {
      setCellRangeStats([]);
      return;
    }
    // Collect values per column across all ranges
    const fieldValues = new Map<string, number[]>();
    for (const range of ranges) {
      if (!range.startRow || !range.endRow) continue;
      const startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
      const endRow = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
      for (const col of range.columns) {
        const field = col.getColDef().field;
        if (!field) continue;
        for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
          const rowNode = api.getDisplayedRowAtIndex(rowIdx);
          if (!rowNode?.data) continue;
          const raw = rowNode.data[field as keyof GridRow];
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(n)) continue;
          if (!fieldValues.has(field)) fieldValues.set(field, []);
          fieldValues.get(field)!.push(n);
        }
      }
    }
    // Only include numeric columns (at least 1 value found)
    const stats: CellRangeStat[] = [];
    for (const [field, values] of fieldValues) {
      if (!values.length) continue;
      const total = values.reduce((s, v) => s + v, 0);
      const min = values.reduce((m, v) => Math.min(m, v), Infinity);
      const max = values.reduce((m, v) => Math.max(m, v), -Infinity);
      stats.push({
        field,
        total,
        average: total / values.length,
        count: values.length,
        min,
        max
      });
    }
    setCellRangeStats(stats);
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onCellContextMenuHandler = useCallback(
    (event: CellContextMenuEvent<GridRow>) => {
      event.event?.preventDefault();
      const row = event.data;
      if (!row) return;

      // Select the right-clicked row (clears prior selection for single-row context)
      const api = event.api;
      api.deselectAll();
      event.node?.setSelected(true);

      const items: ContextMenuItem[] = [];

      // Common actions that match the SelectionSummary bar
      items.push({
        label: 'History',
        action: () => setHistoryRow(row)
      });
      if (canWrite && hasRelationship(row, view)) {
        items.push({
          label: 'Relationship',
          action: () => setRelationshipRow(row)
        });
      }
      if (canWrite && hasIssueSurface(row, view)) {
        items.push({
          label: 'Issue',
          action: () => setIssueRow(row)
        });
      }

      // View-specific actions from the prop
      if (contextMenuItems) {
        const viewItems = contextMenuItems(row, canWrite);
        if (viewItems.length) {
          if (items.length) items.push({ label: '', action: () => {} }); // separator hint — we'll render a separator
          items.push(...viewItems);
        }
      }

      setContextMenu({
        items,
        x: (event.event as MouseEvent)?.clientX ?? 0,
        y: (event.event as MouseEvent)?.clientY ?? 0
      });
    },
    [view, canWrite, contextMenuItems]
  );

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu, closeContextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('.operator-context-menu')) {
        closeContextMenu();
      }
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [contextMenu, closeContextMenu]);

  return (
    <WorkspacePanel
      panelId={panelId}
      title={title}
      subtitle={subtitle ?? `${renderedRows.length.toLocaleString('en-US')} row(s)`}
      actions={
        <>
          <button
            type="button"
            className={`icon-button${advancedFilterOpen ? ' active' : ''}${(storedAdvancedFilter?.conditions?.length ?? 0) > 0 ? ' ring-1 ring-blue-400' : ''}`}
            title="Advanced filters"
            aria-expanded={advancedFilterOpen}
            aria-label={`Advanced filters${(storedAdvancedFilter?.conditions?.length ?? 0) > 0 ? ` (${storedAdvancedFilter!.conditions.length} active)` : ''}`}
            onClick={() => setAdvancedFilterOpen((prev) => !prev)}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            {(storedAdvancedFilter?.conditions?.length ?? 0) > 0 ? (
              <span className="ml-0.5 text-[10px] font-bold">{storedAdvancedFilter!.conditions.length}</span>
            ) : null}
            <span className="sr-only">Advanced filters</span>
          </button>
          <label className="flex h-8 items-center gap-2 border border-line bg-white px-2 text-sm">
            <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <span className="sr-only">Filter {title} grid</span>
            <input
              aria-label={`Filter ${title} grid`}
              className="h-full w-44 bg-transparent outline-none"
              placeholder="Filter grid (field:value)"
              value={quickFilter}
              onChange={(event) => writeQuickFilter(event.target.value)}
            />
          </label>
          {canWrite ? actions : null}
          <div className="relative">
            <button
              ref={columnsMenuTriggerRef}
              type="button"
              className="icon-button"
              title="Columns"
              aria-haspopup="menu"
              aria-expanded={columnsMenuOpen}
              onClick={() => setColumnsMenuOpen((prev) => !prev)}
            >
              <Columns3 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Columns</span>
            </button>
            {columnsMenuOpen ? (
              <ColumnsMenu
                identities={columnIdents}
                hiddenById={hiddenColumnsByPrefs(storedColumnPrefs)}
                onToggle={setColumnHidden}
                onReset={() => {
                  resetGridColumnPrefs(resolvedTableKey);
                  apiRef.current?.resetColumnState();
                }}
                onClose={() => setColumnsMenuOpen(false)}
                triggerRef={columnsMenuTriggerRef}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button"
            title="Export visible grid CSV"
            onClick={() =>
              apiRef.current?.exportDataAsCsv(
                buildCsvExportOptions({ view, role: me.data?.role })
              )
            }
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Export visible grid CSV</span>
          </button>
        </>
      }
    >
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1" data-testid="grid-filter-chips">
          {chips.map((chip) => (
            <button
              key={`${chip.field}:${chip.value}`}
              type="button"
              className="selection-pill"
              title="Remove filter"
              aria-label={`Remove ${chip.field}:${chip.value} filter`}
              onClick={() => removeChip(chip.field, chip.value)}
            >
              {chip.field}:{chip.value}
              <X className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="icon-button" title="Clear filters" onClick={() => writeQuickFilter('')}>
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Clear filters</span>
          </button>
        </div>
      ) : null}
      {/* Advanced filter chips — shown when collapsed but active */}
      {(storedAdvancedFilter?.conditions?.length ?? 0) > 0 && !advancedFilterOpen ? (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1" data-testid="grid-advanced-filter-chips">
          {storedAdvancedFilter!.conditions.filter((c): c is FilterCondition => 'field' in c).map((condition, i) => {
            const cond = condition as { field: string; operator: string; value: unknown };
            const valueStr = cond.operator === 'is_null' || cond.operator === 'is_not_null'
              ? ''
              : ` ${Array.isArray(cond.value) ? cond.value.join(' – ') : String(cond.value)}`;
            return (
            <button
              key={i}
              type="button"
              className="selection-pill"
              title={`Remove ${cond.field} filter`}
              aria-label={`Remove advanced filter: ${cond.field} ${cond.operator} ${cond.value}`}
              onClick={() => {
                const updated = {
                  ...storedAdvancedFilter!,
                  conditions: storedAdvancedFilter!.conditions.filter((_, idx) => idx !== i)
                };
                setStoredAdvancedFilter(view, updated);
              }}
            >
              {cond.field}: {String(cond.operator).replace(/_/g, ' ')}{valueStr}
              <X className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
            );
          })}
          <button
            type="button"
            className="icon-button"
            title="Clear advanced filters"
            aria-label="Clear all advanced filters"
            onClick={() => clearStoredAdvancedFilter(view)}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Clear advanced filters</span>
          </button>
        </div>
      ) : null}
      {/* Advanced filter builder — shown when expanded */}
      {advancedFilterOpen ? (
        <AdvancedFilterBuilder
          filter={storedAdvancedFilter ?? { logic: 'AND', conditions: [] }}
          onChange={(filter) => setStoredAdvancedFilter(view, filter)}
          targetView={view}
          resultCount={renderedRows.length}
        />
      ) : null}
      <div className="ag-theme-quartz grid-shell" aria-busy={loading}>
        {isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500 p-8">
            <p className="text-sm font-medium text-red-600">Failed to load data</p>
            <p className="text-xs">Server error or connection issue</p>
            {onRetry && <button className="btn-secondary text-xs" onClick={onRetry}>Retry</button>}
          </div>
        ) : renderedRows.length || loading ? (
          <AgGridReact<GridRow>
            rowData={renderedRows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection={rowSelection}
            animateRows={false}
            cellSelection={cellSelection}
            undoRedoCellEditing
            tabToNextCell={tabToNextCell}
            sideBar={sideBar}
            loading={loading}
            localeText={localeText}
            rowClassRules={rowClassRules}
            getRowId={(params) => String(params.data.id)}
            masterDetail={expansionConfig?.enabled ?? false}
            detailRowAutoHeight={true}
            detailCellRenderer={(params: ICellRendererParams<GridRow>) => {
              if (!params.data) return null;
              return (
                <ExpansionPanel
                  row={params.data}
                  view={view}
                  actionsRenderer={expansionConfig?.actionsRenderer}
                  historyRenderer={expansionConfig?.historyRenderer}
                  childrenRenderer={expansionConfig?.childrenRenderer}
                />
              );
            }}
            isRowMaster={(dataItem) => {
              if (!expansionConfig?.enabled) return false;
              if (expansionConfig.isRowMaster) return expansionConfig.isRowMaster(dataItem);
              return Boolean(
                expansionConfig.actionsRenderer ||
                expansionConfig.historyRenderer ||
                expansionConfig.childrenRenderer
              );
            }}
            onGridReady={(event: GridReadyEvent<GridRow>) => {
              apiRef.current = event.api;
              event.api.setGridOption('quickFilterText', parsedFilter.freeText);
              if (storedColumnPrefs?.length) {
                event.api.applyColumnState({ state: storedColumnPrefs as Parameters<typeof event.api.applyColumnState>[0]['state'], applyOrder: true });
              } else {
                event.api.sizeColumnsToFit();
              }
            }}
            onColumnMoved={(_event: ColumnMovedEvent<GridRow>) => persistColumnState()}
            onColumnResized={(event: ColumnResizedEvent<GridRow>) => {
              if (event.finished) persistColumnState();
            }}
            onColumnVisible={(_event: ColumnVisibleEvent<GridRow>) => persistColumnState()}
            onColumnPinned={(_event: ColumnPinnedEvent<GridRow>) => persistColumnState()}
            onSortChanged={(_event: SortChangedEvent<GridRow>) => persistColumnState()}
            onRangeSelectionChanged={onRangeSelectionChanged}
            onSelectionChanged={() => {
              const selected = apiRef.current?.getSelectedRows() ?? [];
              setSelectedRows(selected);
              onSelectionChange?.(selected);
              // Clear range stats when row selection fires (AG Grid clears ranges on row click)
              setCellRangeStats([]);
            }}
            onCellEditingStarted={() => { useUiStore.getState().setCellEditing(true); }}
            onCellEditingStopped={() => { useUiStore.getState().setCellEditing(false); }}
            onCellValueChanged={onCellCommit}
            onCellContextMenu={onCellContextMenuHandler}
          />
        ) : (
          <EmptyState title={emptyTitle ?? 'No rows yet'}>{emptyChildren ?? 'Create or import rows, then mark them Ready when they can be posted.'}</EmptyState>
        )}
      </div>
      <SelectionSummary rows={selectedRows} view={view} onOpenHistory={setHistoryRow} onOpenRelationship={setRelationshipRow} onOpenIssue={canWrite ? setIssueRow : undefined} actions={canWrite ? selectionActions?.(selectedRows) : null} cellRangeStats={cellRangeStats} />
      <RowCommandHistoryDrawer row={historyRow} onClose={() => setHistoryRow(null)} />
      <RelationshipDrawer row={relationshipRow} view={view} onClose={() => setRelationshipRow(null)} />
      <IssueSidecar row={issueRow} view={view} onClose={() => setIssueRow(null)} />
      {contextMenu ? (
        <div
          className="operator-context-menu"
          role="menu"
          style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            zIndex: 9999,
            background: 'white',
            border: '1px solid var(--line, #e4e4e7)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '180px',
            padding: '4px 0'
          }}
        >
          {contextMenu.items.map((item, i) => {
            if (!item.label) {
              // Separator
              return <div key={i} style={{ borderTop: '1px solid var(--line, #e4e4e7)', margin: '2px 0' }} />;
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.action();
                  closeContextMenu();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 12px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  cursor: item.disabled ? 'default' : 'pointer',
                  textAlign: 'left',
                  opacity: item.disabled ? 0.4 : 1
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

function hiddenColumnsByPrefs(prefs: ReturnType<typeof useUiStore.getState>['gridColumnPrefs'][string] | undefined) {
  const hidden = new Set<string>();
  for (const pref of prefs ?? []) {
    if (pref.hide) hidden.add(pref.colId);
  }
  return hidden;
}

function ColumnsMenu({
  identities,
  hiddenById,
  onToggle,
  onReset,
  onClose,
  triggerRef
}: {
  identities: Array<{ id: string; label: string }>;
  hiddenById: Set<string>;
  onToggle: (id: string, hide: boolean) => void;
  onReset: () => void;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  // GH #326: close on click-outside; exclude trigger button so toggle-click doesn't re-open
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current && !menuRef.current.contains(event.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [onClose, triggerRef]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="inline-panel"
      style={{
        position: 'absolute',
        right: 0,
        top: '2rem',
        zIndex: 30,
        minWidth: '220px',
        maxHeight: '320px',
        overflow: 'auto',
        background: 'white',
        border: '1px solid var(--line, #e4e4e7)',
        padding: '0.5rem'
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <strong className="text-xs uppercase tracking-wide">Columns</strong>
        <button type="button" className="icon-button" onClick={onReset} title="Reset column layout">
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Reset</span>
        </button>
      </div>
      <ul className="text-sm">
        {identities.map((col) => {
          const hidden = hiddenById.has(col.id);
          return (
            <li key={col.id}>
              <label className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={(event) => onToggle(col.id, !event.target.checked)}
                />
                <span>{col.label || col.id}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatGridValue(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    if (!value.length) return '';
    if (value.every((entry) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry))) return value.join(', ');
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (value instanceof Date) return formatTs(value, { variant: 'short' });
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry))
      .slice(0, 3);
    if (!entries.length) return `${Object.keys(value as Record<string, unknown>).length} fields`;
    return entries.map(([key, entry]) => `${key}: ${entry ?? '-'}`).join(' / ');
  }
  return String(value);
}

function withStatusRenderer(columns: ColDef<GridRow>[], canWrite: boolean) {
  return columns.map((column) =>
    column.field === 'status'
      ? {
          ...column,
          editable: false,
          cellRenderer: (params: { value?: string }) => <StatusPill status={params.value} />
        }
      : canWrite
        ? {
            ...column,
            cellClass: column.editable ? 'editable-cell' : column.cellClass
          }
        : { ...column, editable: false }
  );
}

function withCreatedAtFormatter(columns: ColDef<GridRow>[]) {
  return columns.map((column) =>
    column.field === 'createdAt'
      ? {
          ...column,
          valueFormatter: (params: { value?: unknown }) =>
            formatTs(params.value as Date | string | number | null, { variant: 'short' }),
        }
      : column,
  );
}

function withRowNumbers(columns: ColDef<GridRow>[]) {
  if (columns.some((column) => column.colId === 'rowNumber')) return columns;
  const rowNumberColumn: ColDef<GridRow> = {
    colId: 'rowNumber',
    headerName: '#',
    valueGetter: (params: ValueGetterParams<GridRow>) => (params.node?.rowIndex ?? 0) + 1,
    width: 54,
    minWidth: 48,
    maxWidth: 64,
    pinned: 'left',
    lockPinned: true,
    suppressMovable: true,
    sortable: false,
    filter: false,
    resizable: false,
    editable: false,
    cellClass: 'row-number-cell'
  };
  return [
    rowNumberColumn,
    ...columns
  ];
}

function hasRelationship(row: GridRow, view: ViewKey) {
  return Boolean(row.customerId || row.vendorId || view === 'clients' || view === 'vendors');
}

function hasIssueSurface(row: GridRow, view: ViewKey) {
  return ['clients', 'orders', 'payments'].includes(view);
}
