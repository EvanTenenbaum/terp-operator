import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellValueChangedEvent, ColDef, GridApi, GridReadyEvent, SideBarDef, ValueGetterParams } from 'ag-grid-community';
import { Download, Search } from 'lucide-react';
import { trpc } from '../api/trpc';
import { EmptyState } from './EmptyState';
import { IssueSidecar } from './IssueSidecar';
import { RelationshipDrawer } from './RelationshipDrawer';
import { RowCommandHistoryDrawer } from './RowCommandHistoryDrawer';
import { SelectionSummary } from './SelectionSummary';
import { StatusPill } from './StatusPill';
import { WorkspacePanel } from './WorkspacePanel';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';

interface OperatorGridProps {
  view: ViewKey;
  title: string;
  subtitle?: string;
  rows: GridRow[];
  columns: ColDef<GridRow>[];
  loading?: boolean;
  actions?: ReactNode;
  selectionActions?: (rows: GridRow[]) => ReactNode;
  onSelectionChange?: (rows: GridRow[]) => void;
  onCellCommit?: (event: CellValueChangedEvent<GridRow>) => void;
  emptyTitle?: string;
  emptyChildren?: ReactNode;
}

export function OperatorGrid({ view, title, subtitle, rows, columns, loading, actions, selectionActions, onSelectionChange, onCellCommit, emptyTitle, emptyChildren }: OperatorGridProps) {
  const apiRef = useRef<GridApi<GridRow> | null>(null);
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [selectedRows, setSelectedRows] = useState<GridRow[]>([]);
  const [historyRow, setHistoryRow] = useState<GridRow | null>(null);
  const [relationshipRow, setRelationshipRow] = useState<GridRow | null>(null);
  const [issueRow, setIssueRow] = useState<GridRow | null>(null);
  const storedGridFilter = useUiStore((state) => state.gridFilters[view] ?? '');
  const setStoredGridFilter = useUiStore((state) => state.setGridFilter);
  const [quickFilter, setQuickFilter] = useState(storedGridFilter);
  const parsedFilter = useMemo(() => parseGridFilter(quickFilter), [quickFilter]);
  const renderedRows = useMemo(() => applyGridFilter(rows, parsedFilter), [parsedFilter, rows]);
  const panelId = useMemo(() => `grid:${view}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [title, view]);
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
  const columnDefs = useMemo<ColDef<GridRow>[]>(() => withRowNumbers(withStatusRenderer(columns, canWrite)), [canWrite, columns]);
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

  useEffect(() => {
    setQuickFilter(storedGridFilter);
    apiRef.current?.setGridOption('quickFilterText', parseGridFilter(storedGridFilter).freeText);
  }, [storedGridFilter]);

  return (
    <WorkspacePanel
      panelId={panelId}
      title={title}
      subtitle={subtitle ?? `${renderedRows.length.toLocaleString('en-US')} row(s)`}
      actions={
        <>
          <label className="flex h-8 items-center gap-2 border border-line bg-white px-2 text-sm">
            <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <input
              className="h-full w-44 bg-transparent outline-none"
              placeholder="Filter grid"
              value={quickFilter}
              onChange={(event) => {
                setQuickFilter(event.target.value);
                setStoredGridFilter(view, event.target.value);
                apiRef.current?.setGridOption('quickFilterText', parseGridFilter(event.target.value).freeText);
              }}
            />
          </label>
          {canWrite ? actions : null}
          <button
            type="button"
            className="icon-button"
            title="Export visible grid CSV"
            onClick={() => apiRef.current?.exportDataAsCsv({ fileName: `terp-agro-${view}.csv` })}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Export visible grid CSV</span>
          </button>
        </>
      }
    >
      <div className="ag-theme-quartz grid-shell">
        {renderedRows.length || loading ? (
          <AgGridReact<GridRow>
            rowData={renderedRows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection={rowSelection}
            animateRows={false}
            cellSelection={cellSelection}
            undoRedoCellEditing
            sideBar={sideBar}
            loading={loading}
            getRowId={(params) => String(params.data.id)}
            onGridReady={(event: GridReadyEvent<GridRow>) => {
              apiRef.current = event.api;
              event.api.setGridOption('quickFilterText', parsedFilter.freeText);
              event.api.sizeColumnsToFit();
            }}
            onSelectionChanged={() => {
              const selected = apiRef.current?.getSelectedRows() ?? [];
              setSelectedRows(selected);
              onSelectionChange?.(selected);
            }}
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

interface ParsedGridFilter {
  freeText: string;
  fields: Record<string, string[]>;
}

function parseGridFilter(value: string): ParsedGridFilter {
  const fields: Record<string, string[]> = {};
  const freeText: string[] = [];
  for (const part of value.split(/\s+/).filter(Boolean)) {
    const [rawKey, ...rawRest] = part.split(':');
    const rest = rawRest.join(':');
    if (rawKey && rest) {
      fields[rawKey] = rest.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    } else {
      freeText.push(part);
    }
  }
  return { freeText: freeText.join(' '), fields };
}

function applyGridFilter(rows: GridRow[], filter: ParsedGridFilter) {
  const entries = Object.entries(filter.fields);
  if (!entries.length) return rows;
  return rows.filter((row) =>
    entries.every(([field, allowed]) => {
      if (!allowed.length) return true;
      const value = String(row[field] ?? '').toLowerCase();
      return allowed.some((candidate) => value === candidate || value.includes(candidate));
    })
  );
}

function formatGridValue(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    if (!value.length) return '';
    if (value.every((entry) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry))) return value.join(', ');
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (value instanceof Date) return value.toLocaleString();
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
