import { boolCol } from '../../utils/format';
import { whyShownCol, type RuleMap } from '../../components/columns';
import { type ReactNode } from 'react';
import type React from 'react';
import type { CellValueChangedEvent } from 'ag-grid-community';
import type { GridColDef } from '../../../shared/grid-types';
import { trpc } from '../../api/trpc';
import { OperatorGrid } from '../../components/OperatorGrid';
import { type InspectorTab } from '../../components/templates';
import { useCommandRunner } from '../../components/useCommandRunner';
import { useUiStore } from '../../store/uiStore';
import type { GridRow, ViewKey } from '../../../shared/types';
import { commandLabelFor } from '../../../shared/commandCatalog';
import { markerTooltip } from '../../utils/markerLegend';
import { useColumnDefs } from '../../hooks/useColumnDefs';

// Rule map for the Closeout "Why shown" audit column (status field).
const CLOSEOUT_STATUS_MAP: RuleMap = {
  open:     'Period is open — closeout has not been initiated yet.',
  locked:   'Period is locked — all open work is resolved and this period is ready to archive.',
  archived: 'Period has been archived — this run is complete and historical.',
  failed:   'Archive run encountered an error — review the log and retry.',
  draft:    'Period is in draft state — not yet locked.',
};

export const columnsByView: Partial<Record<ViewKey, GridColDef<GridRow>[]>> = {
  // UX-I01: ≤8 visible-by-default columns per grid. Lower-value columns carry
  // hide:true so the experience is clean out-of-the-box; they remain reachable
  // via the Columns menu. gridColumnPrefs prefs take precedence at render time
  // (mergeColumnDefsWithPrefs honours pref.hide over column.hide), so operator
  // customisations are never clobbered.
  purchaseOrders: [
    { field: 'poNo', headerName: 'PO', pinned: 'left', width: 150 },
    { field: 'vendor', width: 190 },
    { field: 'status', width: 135 },
    { field: 'expectedDate', headerName: 'Expected', editable: true, width: 165 },
    // UX-H08: original / prepaid / remaining prepay columns.  Prepay (original)
    // stays visible as the one prepay indicator; Prepaid and Prepay remaining
    // are demoted to optional (reachable via Columns menu) per SX-H02.
    { field: 'prepaymentAmount', headerName: 'Prepay', editable: true, type: 'numericColumn', width: 145, headerTooltip: 'The original prepayment amount set on this PO.' },
    { field: 'prepaidAmount', headerName: 'Prepaid', type: 'numericColumn', width: 110, hide: true, headerTooltip: 'Amount already paid via recordVendorPrepayment.' },
    { field: 'remainingPrepay', headerName: 'Prepay remaining', type: 'numericColumn', width: 150, hide: true, headerTooltip: 'Remaining prepayment not yet paid (original − prepaid).' },
    { field: 'total', type: 'numericColumn', width: 120 },
    // Below columns hidden by default (≤8 rule); reachable via Columns menu.
    { field: 'paymentTerms', headerName: 'Terms', editable: true, width: 140, hide: true },
    { field: 'lines', width: 95, hide: true },
    { field: 'orderedQty', headerName: 'Ordered', type: 'numericColumn', width: 120, hide: true },
    { field: 'receivedQty', headerName: 'Received', type: 'numericColumn', width: 120, hide: true },
    { field: 'buyerNotes', headerName: 'Internal notes', editable: true, minWidth: 220, hide: true },
    { field: 'internalNotes', headerName: 'Internal notes (ops)', editable: true, minWidth: 220, hide: true },
    { field: 'externalNotes', headerName: 'External (vendor)', editable: true, minWidth: 220, hide: true },
    { field: 'orderedAt', width: 170, hide: true },
    { field: 'receivedAt', width: 170, hide: true },
    { field: 'createdAt', width: 170, hide: true }
  ],
  orders: [
    { field: 'orderNo', pinned: 'left', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'total', type: 'numericColumn', width: 120 },
    // Wave-2/4 closeout mark columns — visible by default (G01 ships them; owner sorts by them).
    boolCol('packed', { headerName: 'Packed', editable: true, width: 105 }),
    boolCol('inventoryPosted', { headerName: 'Inv Posted', editable: true, width: 125 }),
    boolCol('paymentFollowup', { headerName: 'Pay/F-up', editable: true, width: 125 }),
    // Below columns hidden by default (≤8 rule); reachable via Columns menu.
    { field: 'deliveryWindow', editable: true, width: 180, hide: true },
    { field: 'notes', editable: true, minWidth: 180, hide: true },
    { field: 'invoiceNo', width: 150, hide: true },
    { field: 'invoiceStatus', width: 130, hide: true },
    { field: 'legacyStatusMarkers', headerName: 'Markers', width: 115, hide: true },
    { field: 'validationIssues', headerName: 'Fix', minWidth: 200, hide: true },
    { field: 'postedAt', width: 180, hide: true },
    { field: 'fulfilledAt', width: 180, hide: true }
  ],
  payments: [
    { field: 'customer', pinned: 'left', width: 180 },
    { field: 'method', width: 110 },
    { field: 'direction', width: 120 },
    { field: 'category', width: 140 },
    { field: 'amount', type: 'numericColumn', width: 120 },
    { field: 'unappliedAmount', type: 'numericColumn', width: 150 },
    { field: 'allocationIntent', width: 145 },
    { field: 'impactPreview', minWidth: 220 },
    { field: 'reference', width: 160 },
    { field: 'locationBucket', width: 150 },
    { field: 'notes', minWidth: 180 },
    { field: 'status', width: 125 },
    { field: 'createdAt', width: 180 }
  ],
  inventory: [
    { field: 'batchCode', pinned: 'left', width: 150 },
    {
      field: 'name',
      minWidth: 200,
      cellRenderer: (params: { value: unknown; data: GridRow }) => (
        <span>
          {params.data?.itemAlias ? (
            <span title="Customer-facing alias active" style={{ color: '#eab308', marginRight: 4 }}>
              ●
            </span>
          ) : null}
          {String(params.value ?? '')}
        </span>
      )
    },
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
    { field: 'unitCost', type: 'numericColumn', width: 110 },
    { field: 'unitPrice', editable: true, type: 'numericColumn', width: 110 },
    // UX-H07: marker legend tooltip — distinguishes confirmed vs inferred meanings.
    {
      field: 'legacyMarker',
      headerName: 'Marker',
      editable: true,
      width: 105,
      tooltipValueGetter: (params) => markerTooltip(String(params.value ?? ''), 'legacy') ?? undefined
    },
    // UX-I02: mediaStatus visible by default — photographer persona's primary column.
    { field: 'mediaStatus', headerName: 'Media', width: 120 },
    { field: 'status', width: 120 },
    // Below columns hidden by default (≤8 rule); reachable via Columns menu.
    { field: 'itemAlias', headerName: 'Market name', editable: true, minWidth: 180, hide: true },
    { field: 'category', width: 120, hide: true },
    { field: 'tags', editable: true, minWidth: 170, hide: true },
    { field: 'vendor', width: 180, hide: true },
    { field: 'reservedQty', type: 'numericColumn', width: 130, hide: true },
    { field: 'uom', width: 90, hide: true },
    { field: 'location', width: 120, hide: true },
    {
      field: 'ownershipStatus',
      width: 120,
      hide: true,
      tooltipValueGetter: (params) => markerTooltip(String(params.value ?? ''), 'ownership') ?? undefined
    },
    { field: 'arrivalStatus', width: 120, hide: true },
    // UX-I02: hasPrimaryPhoto column (hidden by default, used by "No photos" preset).
    { field: 'hasPrimaryPhoto', headerName: 'Photos', width: 100, hide: true },
    { field: 'lotCode', editable: true, width: 120, hide: true },
    { field: 'expirationDate', editable: true, width: 140, hide: true },
  ],
  clients: [
    { field: 'name', pinned: 'left', width: 190 },
    { field: 'creditLimit', type: 'numericColumn', width: 140 },
    { field: 'balance', type: 'numericColumn', width: 130 },
    {
      headerName: 'Aging',
      width: 120,
      cellRenderer: (params: { data?: GridRow }) => {
        const days = Number(params.data?.daysPastDue ?? 0);
        if (days <= 0) return <span className="text-xs font-medium text-emerald-600">Current</span>;
        if (days <= 30) return <span className="text-xs font-medium text-amber-600">{days}d past due</span>;
        return <span className="text-xs font-medium text-red-600">{days}d past due</span>;
      },
    },
    { field: 'tags', minWidth: 180 },
    { field: 'notes', minWidth: 260 },
    { field: 'invoiceCount', width: 120 },
    { field: 'avgDaysToPay', headerName: 'Avg days to pay', type: 'numericColumn', width: 145 }
  ],
  vendors: [
    { field: 'vendor', pinned: 'left', width: 190 },
    { field: 'billNo', width: 150 },
    { field: 'amount', type: 'numericColumn', width: 120 },
    { field: 'amountPaid', type: 'numericColumn', width: 130 },
    { field: 'status', width: 125 },
    { field: 'dueDate', width: 180 },
    { field: 'scheduledFor', width: 180 },
    { field: 'dueReason', minWidth: 240 },
    { field: 'consignmentTriggered', width: 170 }
  ],
  fulfillment: [
    {
      field: 'alertCount',
      headerName: 'Alerts',
      width: 90,
      pinned: 'left',
      cellRenderer: (params: { value: unknown }) => {
        const count = Number(params.value ?? 0);
        if (!count) return <span className="text-xs text-zinc-400">—</span>;
        return (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {count}
          </span>
        );
      }
    },
    { field: 'pickNo', pinned: 'left', width: 150 },
    { field: 'orderNo', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'tracking', minWidth: 160 },
    { field: 'lines', width: 90 },
    // Below columns hidden by default (≤8 rule); reachable via Columns menu.
    { field: 'unitsPerBag', width: 130, hide: true },
    { field: 'labelFormat', width: 120, hide: true },
    { ...boolCol('labelsPrinted', { headerName: 'Labels Printed', width: 140 }), hide: true },
    { field: 'manifestPath', minWidth: 220, hide: true },
  ],
  connectors: [
    { field: 'source', headerName: 'From', pinned: 'left', width: 170, valueFormatter: (params) => formatRequestSource(params.value) },
    { field: 'requestType', headerName: 'Request', width: 170, valueFormatter: (params) => formatRequestType(params.value) },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'operatorNotes', headerName: 'Notes', minWidth: 220 },
    { field: 'createdAt', width: 180 }
  ],
  recovery: [
    { field: 'commandName', headerName: 'Action', pinned: 'left', width: 220, valueFormatter: (params) => commandLabelFor(params.value) },
    { field: 'actorName', width: 150 },
    { field: 'status', width: 125 },
    { field: 'error', minWidth: 260 },
    { field: 'reversedByCommandId', width: 220 },
    { field: 'createdAt', width: 180 }
  ],
  purchaseReceipts: [
    { field: 'receiptNo', pinned: 'left', width: 150 },
    { field: 'vendor', width: 190 },
    { field: 'poNo', headerName: 'PO', width: 150 },
    { field: 'total', type: 'numericColumn', width: 120 },
    { field: 'status', width: 125 },
    { field: 'lines', width: 90 },
    { field: 'createdAt', width: 180 }
  ],
  disputes: [
    { field: 'invoiceNo', headerName: 'Invoice', pinned: 'left', width: 160 },
    { field: 'customer', width: 180 },
    { field: 'invoiceAmount', headerName: 'Amount', type: 'numericColumn', width: 130 },
    { field: 'reason', headerName: 'Reason', minWidth: 240 },
    { field: 'status', width: 125 },
    { field: 'resolution', headerName: 'Resolution', minWidth: 220 },
    { field: 'createdAt', width: 180 }
  ],
  closeout: [
    { field: 'period', pinned: 'left', width: 100 },
    { field: 'status', width: 125 },
    { field: 'controlTotals', minWidth: 220 },
    { field: 'csvPath', headerName: 'CSV', minWidth: 180 },
    { field: 'jsonlPath', headerName: 'JSONL', minWidth: 180 },
    { field: 'pdfPath', headerName: 'PDF', minWidth: 180 },
    { field: 'createdAt', width: 180 },
    // Why shown audit column — uses status as the reason key; tooltip shows full
    // description.  Hidden by default to avoid duplicating the Status column
    // visually; visible columns remain at 7.
    { ...whyShownCol('status', CLOSEOUT_STATUS_MAP), hide: true },
  ]
};

export const EMPTY_ROWS: GridRow[] = [];

/**
 * @deprecated GridJourney is being refactored into PrimaryGridView (src/client/templates/GridView.tsx)
 * as part of the Mercury UX retrofit. See docs/design-system/decisions-log.md (2026-06-16 entry).
 *
 * **Strategy:** Refactor in place — no parallel build. GridJourney's body moves to
 * templates/GridView.tsx, the export is renamed to PrimaryGridView, and GridJourney
 * is re-exported as a @deprecated alias for one release cycle.
 *
 * **Current callers:** ClientLedgerView, CloseoutView, PaymentsView.
 * **Already migrated:** PurchaseOrdersView (uses templates/GridView.tsx directly).
 *
 * **Do not add new features to this component.** New views use GridView/PrimaryGridView.
 */
const VIEW_TO_ENTITY: Partial<Record<string, string>> = {
  payments: 'payment',
  clientLedger: 'customer',
  closeout: 'closeout',
};

export function GridJourney({
  view,
  title,
  actions,
  prelude,
  onCellCommit,
  expansionConfig,
  columns,
  selectionActions,
  inspectorTabs,
  // UX-D03: per-view empty-state copy. Views that don't pass these fall back to
  // the OperatorGrid neutral default ("No rows match the current view") which
  // replaced the old intake-specific text in Wave 1 UX-A05.
  emptyTitle,
  emptyChildren
}: {
  view: Exclude<ViewKey, 'dashboard' | 'intake' | 'sales' | 'reports' | 'settings' | 'credit-review' | 'pick' | 'contacts' | 'contacts-customer-orders' | 'fulfillment-picks' | 'fulfillment-lines'>;
  title: string;
  actions?: (rows: GridRow[], runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => React.ReactNode;
  prelude?: (runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => React.ReactNode;
  onCellCommit?: (event: CellValueChangedEvent<GridRow>, runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => void;
  expansionConfig?: {
    enabled: boolean;
    actionsRenderer?: (row: GridRow) => ReactNode;
    historyRenderer?: (row: GridRow) => ReactNode;
    childrenRenderer?: (row: GridRow) => ReactNode;
    isRowMaster?: (row: GridRow) => boolean;
  };
  columns?: GridColDef<GridRow>[];
  selectionActions?: (rows: GridRow[], runCommand: ReturnType<typeof useCommandRunner>['runCommand'], setNextSuccessActions?: ReturnType<typeof useCommandRunner>['setNextSuccessActions']) => React.ReactNode;
  inspectorTabs?: (row: GridRow) => InspectorTab[];
  emptyTitle?: string;
  emptyChildren?: React.ReactNode;
}) {
  const grid = trpc.queries.grid.useQuery({ view });
  const selectedRows = useUiStore((state) => state.selectedRows[view]);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand, setNextSuccessActions } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';

  // Schema-driven columns for smart-tables rollout (P3/F6).
  const entityKey = VIEW_TO_ENTITY[view];
  const schemaColumns = entityKey ? useColumnDefs(entityKey) : [];

  return (
    <div className="view-stack">
      {canWrite ? prelude?.(runCommand) : null}
      <OperatorGrid
        view={view}
        title={title}
        rows={(grid.data ?? []) as GridRow[]}
        columns={columns ?? schemaColumns ?? columnsByView[view] ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows(view, rows)}
        onCellCommit={(event) => onCellCommit?.(event, runCommand)}
        actions={canWrite ? actions?.(selected, runCommand) : null}
        selectionActions={canWrite && selectionActions ? (rows) => selectionActions(rows, runCommand, setNextSuccessActions) : undefined}
        inspectorTabs={inspectorTabs}
        expansionConfig={canWrite ? expansionConfig : undefined}
        emptyTitle={emptyTitle}
        emptyChildren={emptyChildren}
      />
    </div>
  );
}

function safeHistory(value: unknown) {
  if (!value) return 'No review history yet.';
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'object' && entry ? Object.values(entry).map(historyValue).join(' / ') : historyValue(entry))).join('; ');
  if (typeof value === 'object') return Object.values(value).map(historyValue).join(' / ');
  return historyValue(value);
}

function historyValue(value: unknown) {
  return String(value === 'routed' ? 'in progress' : value);
}

export function formatRequestType(value: unknown) {
  const raw = String(value ?? '');
  const labels: Record<string, string> = {
    catalog_request: 'Catalog Request',
    reserve_request: 'Reserve Request',
    bag_scan: 'Bag Scan',
    cart_submit: 'Cart Submit',
    session_end: 'Session End'
  };
  return labels[raw] ?? labelFromToken(raw);
}

export function formatRequestSource(value: unknown) {
  const raw = String(value ?? '');
  const labels: Record<string, string> = {
    vip: 'VIP customer',
    'live-shopping': 'Live order',
    'mobile-scan': 'Warehouse scan'
  };
  return labels[raw] ?? labelFromToken(raw);
}

export function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

export function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US');
}
