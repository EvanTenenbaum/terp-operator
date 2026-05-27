import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
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
  SideBarDef,
  SortChangedEvent,
  TabToNextCellParams,
  ValueGetterParams
} from 'ag-grid-community';
import { Columns3, Download, RotateCcw, Search, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { EmptyState } from './EmptyState';
import { IssueSidecar } from './IssueSidecar';
import { RelationshipDrawer } from './RelationshipDrawer';
import { RowCommandHistoryDrawer } from './RowCommandHistoryDrawer';
import { SelectionSummary } from './SelectionSummary';
import { StatusPill } from './StatusPill';
import { WorkspacePanel } from './WorkspacePanel';
import { ExpansionPanel } from './ExpansionPanel';
import { ExpansionChevronCell } from './ExpansionChevronColumn';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
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
  const [historyRow, setHistoryRow] = useState<GridRow | null>(null);
  const [relationshipRow, setRelationshipRow] = useState<GridRow | null>(null);
  const [issueRow, setIssueRow] = useState<GridRow | null>(null);
  const storedGridFilter = useUiStore((state) => state.gridFilters[view] ?? '');
  const setStoredGridFilter = useUiStore((state) => state.setGridFilter);
  const resolvedTableKey = tableKey ?? `view:${view}`;
  const storedColumnPrefs = useUiStore((state) => state.gridColumnPrefs[resolvedTableKey]);
  const setGridColumnPrefs = useUiStore((state) => state.setGridColumnPrefs);
  const resetGridColumnPrefs = useUiStore((state) => state.resetGridColumnPrefs);
  const [quickFilter, setQuickFilter] = useState(storedGridFilter);
  const parsedFilter = useMemo(() => parseGridFilter(quickFilter), [quickFilter]);
  const renderedRows = useMemo(() => applyGridFilter(rows, parsedFilter), [parsedFilter, rows]);
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
    if (!params.backwards) {
      if (currentIdx >= 0 && currentIdx < editableCols.length - 1) {
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

  return (
    <WorkspacePanel
      panelId={panelId}
      title={title}
      subtitle={subtitle ?? `${renderedRows.length.toLocaleString('en-US')} row(s)`}
      actions={
        <>
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
      <div className="ag-theme-quartz grid-shell">
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
            onSelectionChanged={() => {
              const selected = apiRef.current?.getSelectedRows() ?? [];
              setSelectedRows(selected);
              onSelectionChange?.(selected);
            }}
            onCellEditingStarted={() => { useUiStore.getState().setCellEditing(true); }}
            onCellEditingStopped={() => { useUiStore.getState().setCellEditing(false); }}
            onCellValueChanged={onCellCommit}
          />
        ) : (
          <EmptyState title={emptyTitle ?? 'No rows yet'}>{emptyChildren ?? 'Create or import rows, then mark them Ready when they can be posted.'}</EmptyState>
        )}
      </div>
      <SelectionSummary rows={selectedRows} view={view} onOpenHistory={setHistoryRow} onOpenRelationship={setRelationshipRow} onOpenIssue={canWrite ? setIssueRow : undefined} actions={canWrite ? selectionActions?.(selectedRows) : null} />
      <RowCommandHistoryDrawer row={historyRow} onClose={() => setHistoryRow(null)} />
      <RelationshipDrawer row={relationshipRow} view={view} onClose={() => setRelationshipRow(null)} />
      <IssueSidecar row={issueRow} view={view} onClose={() => setIssueRow(null)} />
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
