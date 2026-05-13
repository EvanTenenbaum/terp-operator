import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellValueChangedEvent, ColDef, GridApi, GridReadyEvent, SideBarDef } from 'ag-grid-community';
import { Download, Search } from 'lucide-react';
import { trpc } from '../api/trpc';
import { EmptyState } from './EmptyState';
import { IssueSidecar } from './IssueSidecar';
import { RelationshipDrawer } from './RelationshipDrawer';
import { RowCommandHistoryDrawer } from './RowCommandHistoryDrawer';
import { SelectionSummary } from './SelectionSummary';
import { StatusPill } from './StatusPill';
import { WorkspacePanel } from './WorkspacePanel';
import type { GridRow, ViewKey } from '../../shared/types';

type ExportableView = Exclude<ViewKey, 'dashboard' | 'reports' | 'settings'>;

const EXPORTABLE_VIEWS: readonly ExportableView[] = ['intake', 'purchaseOrders', 'sales', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors', 'recovery', 'closeout'];

interface OperatorGridProps {
  view: ViewKey;
  title: string;
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

export function OperatorGrid({ view, title, rows, columns, loading, actions, selectionActions, onSelectionChange, onCellCommit, emptyTitle, emptyChildren }: OperatorGridProps) {
  const apiRef = useRef<GridApi<GridRow> | null>(null);
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useContext();
  const canWrite = me.data?.role !== 'viewer';
  const [selectedRows, setSelectedRows] = useState<GridRow[]>([]);
  const [historyRow, setHistoryRow] = useState<GridRow | null>(null);
  const [relationshipRow, setRelationshipRow] = useState<GridRow | null>(null);
  const [issueRow, setIssueRow] = useState<GridRow | null>(null);
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
  const columnDefs = useMemo<ColDef<GridRow>[]>(() => withStatusRenderer(columns, canWrite), [canWrite, columns]);
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

  async function exportServerCsv() {
    if (!isExportableView(view)) return;
    const result = await utils.queries.csvExport.fetch({ view });
    downloadText(result.filename, result.csv, 'text/csv;charset=utf-8');
  }

  return (
    <WorkspacePanel
      panelId={panelId}
      title={title}
      subtitle={`${rows.length} row(s). Sort, filter, group, fill down, copy/paste TSV, and edit inline where enabled.`}
      actions={
        <>
          <label className="flex h-8 items-center gap-2 border border-line bg-white px-2 text-sm">
            <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <input
              className="h-full w-44 bg-transparent outline-none"
              placeholder="Filter grid"
              onChange={(event) => apiRef.current?.setGridOption('quickFilterText', event.target.value)}
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
          {isExportableView(view) ? (
            <button type="button" className="secondary-button compact-action" title="Export deterministic server CSV" onClick={() => void exportServerCsv()}>
              Export CSV
            </button>
          ) : null}
        </>
      }
    >
      <div className="ag-theme-quartz grid-shell">
        {rows.length || loading ? (
          <AgGridReact<GridRow>
            rowData={rows}
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

function downloadText(filename: string, value: string, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isExportableView(view: ViewKey): view is ExportableView {
  return EXPORTABLE_VIEWS.includes(view as ExportableView);
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
        ? column
        : { ...column, editable: false }
  );
}
