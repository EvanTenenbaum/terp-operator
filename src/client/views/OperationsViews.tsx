import { Ban, CalendarClock, Check, CheckCircle, ChevronDown, ChevronRight, ClipboardList, CreditCard, FileDown, Landmark, ListChecks, PackageCheck, PackagePlus, Plus, RotateCcw, Send, ShieldCheck, Trash2, Truck, Undo2, XCircle } from 'lucide-react';
import { boolCol } from '../utils/format';
import { whyShownCol, type RuleMap } from '../components/columns';
import { CommandReversalTab } from '../components/drawerTabs/CommandReversalTab';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type React from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable, type InspectorTab } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { RecordPrepaymentDialog } from '../components/RecordPrepaymentDialog';
import { DefaultPricingPanel } from '../components/DefaultPricingPanel';

import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { formatWeightsSummary } from '../components/credit/creditPanelUtils';
import { useUiStore } from '../store/uiStore';
import { useConfirm } from '../hooks/useConfirm';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { VendorContextDrawer } from '../components/VendorContextDrawer';
import { AddRefereeRelationshipDrawer } from '../components/AddRefereeRelationshipDrawer';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { ReceiptPreviewOverlay } from '../components/ReceiptPreviewOverlay';
import type { GridRow, SettingsTab, ViewKey } from '../../shared/types';
import { commandLabelFor } from '../../shared/commandCatalog';
import type { CommandName } from '../../shared/commandCatalog';
import { parseTagInput } from '../../shared/tags';
import { PAYMENT_TERMS_OPTIONS } from '../../shared/paymentTerms';
import {
  asCustomerPricingRule,
  computeInventoryUnitPrice,
  formatInventoryUnitCost,
  inventoryUnitCostSortValue
} from '../../shared/inventoryPricing';

// CAP-030 / TER-1510 — WarehouseAlert interface matches warehouseAlerts JSONB shape in fulfillment_lines
interface WarehouseAlert {
  id: string;
  pickListId: string;
  lineId: string;
  type: 'qty_mismatch' | 'item_not_found' | 'overcount' | 'damaged' | 'other';
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  itemName?: string;
  batchCode?: string;
  createdAt: string;
}

interface PickQueueRow {
  id: string;
  pickNo: string;
  orderId: string;
  customer: string;
  status: 'needs_picking' | 'in_progress' | 'has_alerts' | 'ready_to_close' | 'closed';
  alertCount: number;
  lineCount: number;
  linesPicked: number;
}

const MS_PER_DAY = 86400000;

// Rule map for the Closeout "Why shown" audit column (status field).
const CLOSEOUT_STATUS_MAP: RuleMap = {
  open:     'Period is open — closeout has not been initiated yet.',
  locked:   'Period is locked — all open work is resolved and this period is ready to archive.',
  archived: 'Period has been archived — this run is complete and historical.',
  failed:   'Archive run encountered an error — review the log and retry.',
  draft:    'Period is in draft state — not yet locked.',
};

const columnsByView: Partial<Record<ViewKey, ColDef<GridRow>[]>> = {
  purchaseOrders: [
    { field: 'poNo', headerName: 'PO', pinned: 'left', width: 150 },
    { field: 'vendor', width: 190 },
    { field: 'status', width: 135 },
    { field: 'expectedDate', headerName: 'Expected', editable: true, width: 165 },
    { field: 'paymentTerms', headerName: 'Terms', editable: true, width: 140 },
    { field: 'prepaymentAmount', headerName: 'Prepay', editable: true, type: 'numericColumn', width: 115 },
    { field: 'total', type: 'numericColumn', width: 120 },
    { field: 'lines', width: 95 },
    { field: 'orderedQty', headerName: 'Ordered', type: 'numericColumn', width: 120 },
    { field: 'receivedQty', headerName: 'Received', type: 'numericColumn', width: 120 },
    { field: 'buyerNotes', headerName: 'Internal notes', editable: true, minWidth: 220 },
    { field: 'internalNotes', headerName: 'Internal notes (ops)', editable: true, minWidth: 220 },
    { field: 'externalNotes', headerName: 'External (vendor)', editable: true, minWidth: 220 },
    { field: 'orderedAt', width: 170 },
    { field: 'receivedAt', width: 170 },
    { field: 'createdAt', width: 170 }
  ],
  orders: [
    { field: 'orderNo', pinned: 'left', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'total', type: 'numericColumn', width: 120 },
    { field: 'deliveryWindow', editable: true, width: 180 },
    { field: 'notes', editable: true, minWidth: 180 },
    { field: 'invoiceNo', width: 150 },
    { field: 'invoiceStatus', width: 130 },
    boolCol('packed', { headerName: 'Packed', editable: true, width: 105 }),
    boolCol('inventoryPosted', { headerName: 'Inv Posted', editable: true, width: 125 }),
    boolCol('paymentFollowup', { headerName: 'Pay/F-up', editable: true, width: 125 }),
    { field: 'legacyStatusMarkers', headerName: 'Markers', width: 115 },
    { field: 'validationIssues', headerName: 'Fix', minWidth: 200 },
    { field: 'postedAt', width: 180 },
    { field: 'fulfilledAt', width: 180 }
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
    { field: 'itemAlias', headerName: 'Market name', editable: true, minWidth: 180 },
    { field: 'category', width: 120 },
    { field: 'tags', editable: true, minWidth: 170 },
    { field: 'vendor', width: 180 },
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
    { field: 'reservedQty', type: 'numericColumn', width: 130 },
    { field: 'uom', width: 90 },
    { field: 'unitCost', type: 'numericColumn', width: 110 },
    { field: 'unitPrice', editable: true, type: 'numericColumn', width: 110 },
    { field: 'location', width: 120 },
    { field: 'legacyMarker', headerName: 'Marker', editable: true, width: 105 },
    { field: 'ownershipStatus', width: 120 },
    { field: 'arrivalStatus', width: 120 },
    { field: 'mediaStatus', headerName: 'Media', width: 120 },
    { field: 'lotCode', editable: true, width: 120 },
    { field: 'expirationDate', editable: true, width: 140 },
    { field: 'status', width: 120 }
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
    { field: 'unitsPerBag', width: 130 },
    { field: 'labelFormat', width: 120 },
    boolCol('labelsPrinted', { headerName: 'Labels Printed', width: 140 }),
    { field: 'manifestPath', minWidth: 220 },
    { field: 'tracking', minWidth: 160 },
    { field: 'lines', width: 90 }
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

const EMPTY_ROWS: GridRow[] = [];

const purchaseOrderLineColumns: ColDef<GridRow>[] = [
  { field: 'productName', headerName: 'Product / strain', pinned: 'left', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'subcategory', editable: true, width: 140 },
  { field: 'unitCost', headerName: 'Unit cost', editable: true, type: 'numericColumn', width: 120 },
  { field: 'costRangeLow', headerName: 'Range low', editable: true, type: 'numericColumn', width: 115 },
  { field: 'costRangeHigh', headerName: 'Range high', editable: true, type: 'numericColumn', width: 115 },
  { field: 'qty', headerName: 'Units', editable: true, type: 'numericColumn', width: 105 },
  { field: 'uom', headerName: 'Unit type', editable: true, width: 110 },
  { field: 'lineTotal', headerName: 'Row total', type: 'numericColumn', width: 120, valueGetter: (params) => {
    const qty = Number(params.data?.qty ?? 0);
    const unitCost = Number(params.data?.unitCost ?? 0);
    if (unitCost > 0) return qty * unitCost;
    const low = Number(params.data?.costRangeLow ?? 0);
    const high = Number(params.data?.costRangeHigh ?? 0);
    if (low > 0 && high > 0) return qty * ((low + high) / 2);
    return 0;
  } },
  { field: 'externalNotes', headerName: 'Vendor receipt notes', editable: true, minWidth: 190 },
  { field: 'internalNotes', headerName: 'Internal notes', editable: true, minWidth: 180 },
  { field: 'tags', editable: true, minWidth: 160 },
  { field: 'receivedQty', headerName: 'Received', width: 120 },
  { field: 'status', width: 120 }
];

const fulfillmentLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', pinned: 'left', minWidth: 180 },
  { field: 'batchCode', width: 140 },
  { field: 'expectedQty', type: 'numericColumn', width: 130 },
  { field: 'actualQty', editable: true, type: 'numericColumn', width: 120 },
  { field: 'actualWeight', editable: true, type: 'numericColumn', width: 140 },
  { field: 'bagCode', editable: true, width: 140 },
  { field: 'status', width: 120 }
];

const purchaseReceiptLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', headerName: 'Product', pinned: 'left', minWidth: 190 },
  { field: 'batchCode', width: 140 },
  { field: 'qty', headerName: 'Qty', type: 'numericColumn', width: 120 },
  { field: 'unitCost', headerName: 'Unit cost', type: 'numericColumn', width: 120 },
  { field: 'subtotal', headerName: 'Subtotal', type: 'numericColumn', width: 120 }
];

export function PurchaseOrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'purchaseOrders' });
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseOrders);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const pushToast = useUiStore((state) => state.pushToast);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPo = selected[0];
  const lines = trpc.queries.purchaseOrderLines.useQuery(
    { purchaseOrderId: String(selectedPo?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedPo?.id) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [externalNotes, setExternalNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('consignment');
  const [prepaymentAmount, setPrepaymentAmount] = useState('0');
  const [prepaymentDialogOpen, setPrepaymentDialogOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<GridRow[]>(Array.from({ length: 10 }, () => makePoDraftLine()));
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorTerms, setNewVendorTerms] = useState('14');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorNotes, setNewVendorNotes] = useState('');
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [vendorDrawerOpen, setVendorDrawerOpen] = useState(false);
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  const [addRefereeOpen, setAddRefereeOpen] = useState(false);
  const [receiptOverlayOpen, setReceiptOverlayOpen] = useState(false);
  const defaultVendorId = vendorId;
  const selectedVendor = reference.data?.vendors.find((vendor) => vendor.id === defaultVendorId);
  const vendorRelationship = trpc.queries.relationshipSummary.useQuery({ vendorId: defaultVendorId }, { enabled: authoringOpen && Boolean(defaultVendorId) });
  const contextSignals = trpc.queries.poContextSignals.useQuery(undefined, { enabled: authoringOpen });
  const historicalProducts = (reference.data?.availableBatches ?? [])
    .filter((row) => !defaultVendorId || row.vendorId === defaultVendorId)
    .slice(0, 8);
  const selectedPoStatus = String(selectedPo?.status ?? '');
  const filledDraftLines = draftLines.filter((line) => String(line.productName ?? '').trim());
  const approvalLineIssues = filledDraftLines.filter((line) => {
    const hasQty = Number(line.qty ?? 0) > 0;
    const hasUnitCost = Number(line.unitCost ?? 0) > 0;
    const hasValidRange = (line.costRangeLow != null && line.costRangeHigh != null &&
                           Number(line.costRangeLow) > 0 && Number(line.costRangeHigh) > 0 &&
                           Number(line.costRangeLow) <= Number(line.costRangeHigh));
    return !hasQty || (!hasUnitCost && !hasValidRange);
  });
  const canApproveDraft = Boolean(defaultVendorId) && filledDraftLines.length > 0 && approvalLineIssues.length === 0;

  const purchaseOrderExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite || !['approved', 'ordered', 'partially_received'].includes(String(row.status ?? ''))}
            title={
              !canWrite ? 'Write access required' :
              !['approved', 'ordered', 'partially_received'].includes(String(row.status ?? ''))
                ? 'PO must be approved or ordered before drafting intake'
                : 'Draft intake batches from this PO'
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('receivePurchaseOrder', { purchaseOrderId: row.id }, 'Receive selected purchase order to draft intake');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Draft intake
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite || String(row.status ?? '') !== 'finalized'}
            title={
              !canWrite ? 'Write access required' :
              String(row.status ?? '') !== 'finalized'
                ? 'PO must be finalized before unfinalization'
                : 'Return finalized PO to draft for editing'
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('unfinalizePurchaseOrder', { purchaseOrderId: row.id }, 'Return finalized PO to draft for editing');
            }}
            type="button"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Unfinalize
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required to cancel a PO' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('cancelPurchaseOrder', { purchaseOrderId: row.id }, 'Cancel selected purchase order');
            }}
            type="button"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Cancel draft PO
          </button>
          <button
            className="secondary-button compact-action"
            type="button"
            disabled={isRunning || !canWrite || String(row.status ?? '') !== 'approved' || Number(row.prepaymentAmount ?? 0) <= 0}
            title={
              String(row.status ?? '') !== 'approved'
                ? 'PO must be approved before recording prepayment'
                : Number(row.prepaymentAmount ?? 0) <= 0
                ? 'PO has no prepayment amount set'
                : 'Record vendor prepayment'
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              setPrepaymentDialogOpen(true);
            }}
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Record Prepayment
          </button>
        </>
      )
    }),
    [isRunning, runCommand, canWrite, setPrepaymentDialogOpen]
  );

  const purchaseOrderLineExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          <button
            className="primary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required to draft a line' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo?.id ?? '', lineIds: [row.id] }, 'Receive selected PO line to intake');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Draft line
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required to remove a line' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('removePurchaseOrderLine', { lineId: row.id }, 'Remove purchase order line');
            }}
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove line
          </button>
        </>
      )
    }),
    [isRunning, selectedPo?.id, runCommand, canWrite]
  );

  function openAuthoringWorkspace() {
    setAuthoringOpen(true);
    setSelectedRows('purchaseOrders', []);
    setDraftLines((rows) => rows.length ? rows : Array.from({ length: 10 }, () => makePoDraftLine()));
    setDrawerState('purchaseOrders', 'closed');
  }

  function updateDraftLine(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null) return;
    const field = String(event.colDef.field);
    setDraftLines((rows) =>
      rows.map((row) => {
        if (row.id !== event.data?.id) return row;
        const next = { ...row, [field]: event.newValue };
        if (field === 'category') next.uom = unitTypeForCategory(String(event.newValue));
        return next;
      })
    );
  }

  function addDraftLine(seed: Partial<GridRow> = {}) {
    setDraftLines((rows) => [...rows, makePoDraftLine(seed)]);
  }

  function quickAddHistorical(row: GridRow) {
    addDraftLine({
      productName: row.name,
      category: row.category,
      subcategory: Array.isArray(row.tags) ? row.tags[0] : '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
      unitCost: row.unitCost,
      qty: 1,
      uom: row.uom || unitTypeForCategory(String(row.category ?? ''))
    });
  }

  async function saveDraftPo(options: { approve?: boolean } = {}) {
    if (!defaultVendorId) return null;
    const linesToSubmit = draftLines.filter((row) => String(row.productName ?? '').trim());
    if (options.approve && (!linesToSubmit.length || linesToSubmit.some((row) => {
      const hasQty = Number(row.qty ?? 0) > 0;
      const hasUnitCost = Number(row.unitCost ?? 0) > 0;
      const hasValidRange = (row.costRangeLow != null && row.costRangeHigh != null &&
                             Number(row.costRangeLow) > 0 && Number(row.costRangeHigh) > 0 &&
                             Number(row.costRangeLow) <= Number(row.costRangeHigh));
      return !hasQty || (!hasUnitCost && !hasValidRange);
    }))) {
      pushToast('Approve PO needs product, units, and either unit cost or valid cost range on every filled line.', 'error');
      return null;
    }
    const result = await runCommand(
      'createPurchaseOrder',
      {
        vendorId: defaultVendorId,
        expectedDate: expectedDate || undefined,
        buyerNotes: buyerNotes || undefined,
        internalNotes: internalNotes || undefined,
        externalNotes: externalNotes || undefined,
        paymentTerms: paymentTerms || 'vendor_terms',
        prepaymentAmount: Number(prepaymentAmount || 0)
      },
      options.approve ? 'Create purchase order draft before approval' : 'Save purchase order draft'
    );
    if (!result.ok || !result.affectedIds[0]) return null;
    const purchaseOrderId = result.affectedIds[0];
    for (const line of linesToSubmit) {
      await runCommand(
        'addPurchaseOrderLine',
        {
          purchaseOrderId,
          productName: line.productName,
          category: line.category || 'Flower',
          subcategory: line.subcategory || undefined,
          tags: parseTagInput(String(line.tags ?? '')),
          qty: Number(line.qty || 0),
          unitCost: Number(line.unitCost || 0),
          costRangeLow: line.costRangeLow ? Number(line.costRangeLow) : undefined,
          costRangeHigh: line.costRangeHigh ? Number(line.costRangeHigh) : undefined,
          uom: line.uom || unitTypeForCategory(String(line.category ?? '')),
          externalNotes: line.externalNotes || undefined,
          internalNotes: line.internalNotes || undefined,
          ownershipStatus: 'UNKNOWN'
        },
        'Add purchase order line from authoring table'
      );
    }
    if (options.approve) {
      // Finalize the PO before approval — required by the PO state machine
      await runCommand('finalizePurchaseOrder', { purchaseOrderId }, 'Finalize PO draft before approval');
      const payload: Record<string, unknown> = { purchaseOrderId };
      if (refereeRelationshipId) {
        payload.refereeRelationshipId = refereeRelationshipId;
        payload.logRefereeCredit = true;
      }
      await runCommand('approvePurchaseOrder', payload, 'Approve PO to receive queue');
    }
    setAuthoringOpen(false);
    setAddRefereeOpen(false);
    setDraftLines(Array.from({ length: 10 }, () => makePoDraftLine()));
    setBuyerNotes('');
    setInternalNotes('');
    setExternalNotes('');
    setPaymentTerms('consignment');
    setPrepaymentAmount('0');
    setRefereeRelationshipId('');
    setSelectedRows('purchaseOrders', [{ id: purchaseOrderId }]);
    return purchaseOrderId;
  }

  async function saveNewVendor() {
    const result = await runCommand(
      'createVendor',
      { name: newVendorName, termsDays: Number(newVendorTerms || 14), contact: newVendorContact || undefined, notes: newVendorNotes || undefined },
      'Add vendor from PO workspace'
    );
    if (result.ok && result.affectedIds[0]) {
      setVendorId(result.affectedIds[0]);
      setNewVendorOpen(false);
      setNewVendorName('');
      setNewVendorContact('');
      setNewVendorNotes('');
    }
  }

  async function updatePoCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    const field = String(event.colDef.field);
    if (['expectedDate', 'buyerNotes', 'internalNotes', 'externalNotes', 'paymentTerms', 'prepaymentAmount'].includes(field)) {
      const value = field === 'prepaymentAmount' ? Number(event.newValue || 0) : event.newValue;
      await runCommand('updatePurchaseOrder', { purchaseOrderId: event.data.id, [field]: value }, `Inline purchase order edit: ${field}`);
    }
  }

  async function updateLineCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    const field = String(event.colDef.field);
    const supported = ['productName', 'category', 'subcategory', 'tags', 'qty', 'uom', 'unitCost', 'costRangeLow', 'costRangeHigh', 'notes', 'internalNotes', 'externalNotes'];
    if (!supported.includes(field)) return;
    let value: string | string[] | number = event.newValue;
    if (field === 'tags') {
      value = parseTagInput(String(event.newValue ?? ''));
    } else if (['unitCost', 'costRangeLow', 'costRangeHigh'].includes(field)) {
      value = Number(event.newValue || 0);
    }
    await runCommand('updatePurchaseOrderLine', { lineId: event.data.id, [field]: value }, `Inline purchase order line edit: ${field}`);
  }

  async function runPurchaseOrderPrimary() {
    if (!selectedPo?.id) return;
    if (['approved', 'ordered', 'partially_received'].includes(selectedPoStatus)) {
      await runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo.id }, 'Receive selected purchase order to draft intake');
      return;
    }
    if (selectedPoStatus === 'finalized') {
      await runCommand('approvePurchaseOrder', { purchaseOrderId: selectedPo.id }, 'Approve finalized PO');
      return;
    }
    await runCommand('finalizePurchaseOrder', { purchaseOrderId: selectedPo.id }, 'Finalize draft PO');
  }

  return (
    <div className="view-stack">
      {canWrite ? (
        <div className="control-band">
          <button className="primary-button" type="button" disabled={isRunning} onClick={openAuthoringWorkspace}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            New PO
          </button>
        </div>
      ) : null}
      {authoringOpen ? (
        <section className="inline-panel po-authoring-layout" aria-label="New purchase order workspace">
          <div className="po-authoring-main">
            <div className="po-header-strip">
              <div>
                <div className="text-xs font-bold uppercase text-zinc-500">New purchase order</div>
                <div className="text-base font-semibold text-ink">Draft workspace</div>
              </div>
              <div className="po-header-facts">
                <span>{selectedVendor?.name ?? 'Choose vendor'}</span>
                <span>Expected {expectedDate ? dateish(expectedDate) : 'optional'}</span>
                <span>${moneyish(poLinesTotal(draftLines))} PO total</span>
              </div>
              <button className="secondary-button compact-action" type="button" onClick={() => { setAuthoringOpen(false); setAddRefereeOpen(false); }}>
                Cancel draft PO
              </button>
            </div>
            <div className="control-band subtle-band">
              <label className="field-inline">
                Vendor
                <select
                  className="select"
                  value={vendorId}
                  onChange={(event) => {
                    setVendorId(event.target.value);
                  }}
                >
                  <option value="">Choose vendor</option>
                  {reference.data?.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button compact-action" type="button" onClick={() => setNewVendorOpen((value) => !value)} aria-expanded={newVendorOpen}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add new vendor
              </button>
              <button
                className="secondary-button compact-action"
                type="button"
                onClick={() => setVendorDrawerOpen(true)}
                disabled={!defaultVendorId}
                title="View vendor context"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                Context
              </button>
              <label className="field-inline">
                Expected
                <input className="input compact" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
              </label>
              <label className="field-inline grow">
                Vendor receipt notes
                <input className="input" value={externalNotes} onChange={(event) => setExternalNotes(event.target.value)} />
              </label>
              <label className="field-inline">
                Payment terms
                <select className="select" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)}>
                  {PAYMENT_TERMS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-inline">
                Prepayment amount
                <input
                  className="input compact"
                  type="number"
                  min="0"
                  step="0.01"
                  value={prepaymentAmount}
                  onChange={(event) => setPrepaymentAmount(event.target.value)}
                />
              </label>
              <label className="field-inline">
                Referee credit (optional)
                <select className="select" value={refereeRelationshipId} onChange={(event) => setRefereeRelationshipId(event.target.value)}>
                  <option value="">No referee credit</option>
                  {(reference.data?.refereeRelationships ?? [])
                    .filter((rel: any) => rel.entityType === 'vendor' && rel.entityId === defaultVendorId)
                    .map((rel: any) => (
                      <option key={rel.id} value={rel.id}>
                        {rel.refereeName} ({rel.feeType === 'percentage' ? `${rel.feePercentage}%` : rel.feeType === 'fixed' ? `$${rel.feeFixedAmount}` : `${rel.feePercentage}% + $${rel.feeFixedAmount}`})
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary-button compact-action"
                disabled={!defaultVendorId || !canWrite}
                title={!canWrite ? 'Write access required to add referee' : defaultVendorId ? 'Add a new referee credit for this vendor' : 'Select a vendor first'}
                onClick={() => setAddRefereeOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add referee
              </button>
            </div>
            {newVendorOpen ? (
              <div className="po-context-panel" role="region" aria-label="Add new vendor drawer">
                <div className="mb-2 text-sm font-semibold text-ink">Add new vendor</div>
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="field-inline">
                    Name
                    <input className="input" value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Terms
                    <input className="input compact" inputMode="numeric" value={newVendorTerms} onChange={(event) => setNewVendorTerms(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Contact
                    <input className="input" value={newVendorContact} onChange={(event) => setNewVendorContact(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Notes
                    <input className="input" value={newVendorNotes} onChange={(event) => setNewVendorNotes(event.target.value)} />
                  </label>
                </div>
                <button className="primary-button mt-2" type="button" disabled={!newVendorName.trim() || isRunning} onClick={saveNewVendor}>
                  Save vendor
                </button>
              </div>
            ) : null}
            <OperatorGrid
              view="purchaseOrders"
              title="New PO lines"
              subtitle="Enter lines directly in the table"
              rows={draftLines.map(withPoLineTotal)}
              columns={purchaseOrderLineColumns}
              loading={isRunning}
              onSelectionChange={setSelectedLines}
              onCellCommit={updateDraftLine}
              actions={
                <>
                  {approvalLineIssues.length ? <span className="selection-pill danger">{approvalLineIssues.length} filled line needs units and cost (fixed or range).</span> : null}
                  <button className="secondary-button compact-action" type="button" onClick={() => addDraftLine()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add line row
                  </button>
                  <button className="secondary-button compact-action" type="button" disabled={!defaultVendorId || isRunning} title={!defaultVendorId ? 'Select a vendor before saving the draft PO' : undefined} onClick={() => void saveDraftPo()}>
                    Save draft
                  </button>
                  <button className="primary-button compact-action" type="button" disabled={isRunning || !canApproveDraft} title={approvalLineIssues.length ? 'Every filled PO line needs units and either unit cost or valid cost range before approval.' : undefined} onClick={() => void saveDraftPo({ approve: true })}>
                    Approve PO
                  </button>
                </>
              }
              emptyTitle="No PO lines"
              emptyChildren="Add a line row, then type product, units, cost, terms, and notes directly into the table."
            />
            <div className="po-total-strip">
              <span>PO total ${moneyish(poLinesTotal(draftLines))}</span>
              {approvalLineIssues.length ? <span className="po-total-warning">{approvalLineIssues.length} filled line needs units and cost (fixed or range).</span> : null}
            </div>
          </div>
          <aside className="po-context-panel" aria-label="Vendor context">
            <h2 className="section-title">Vendor context</h2>
            <div className="po-context-list">
              <div className="drawer-fact-row"><span>Vendor</span><strong>{selectedVendor?.name ?? 'Choose vendor'}</strong></div>
              <div className="drawer-fact-row"><span>Terms</span><strong>{selectedVendor ? `${String(selectedVendor.termsDays ?? 14)} days` : '-'}</strong></div>
              <div className="drawer-fact-row"><span>Open bills</span><strong>{vendorRelationship.data?.bills?.length ?? 0}</strong></div>
              <div className="drawer-fact-row"><span>Payments</span><strong>{vendorRelationship.data?.vendorPayments?.length ?? 0}</strong></div>
              <div className="drawer-fact-row"><span>Prior POs</span><strong>{vendorRelationship.data?.purchaseOrders?.length ?? 0}</strong></div>
            </div>
            {defaultVendorId ? (
              <>
                <h3 className="section-title mt-4">Historical quick add</h3>
                <div className="po-context-list">
                  {historicalProducts.length ? historicalProducts.map((row) => (
                    <button className="po-context-row" type="button" key={String(row.id)} onClick={() => quickAddHistorical(row)}>
                      <span>{String(row.name ?? 'Product')}</span>
                      <strong>${moneyish(row.unitCost)}</strong>
                    </button>
                  )) : (
                    <div className="drawer-empty">No reusable vendor history yet.</div>
                  )}
                </div>
              </>
            ) : null}
            {contextSignals.data ? (
              <PoSignalsSection inventory={contextSignals.data.inventory} pricing={contextSignals.data.pricing} />
            ) : contextSignals.isLoading ? (
              <div className="drawer-empty mt-4 text-xs">Loading market signals…</div>
            ) : null}
          </aside>
        </section>
      ) : null}
      {/* Vendor Context Drawer */}
      <VendorContextDrawer
        isOpen={vendorDrawerOpen}
        onClose={() => setVendorDrawerOpen(false)}
        vendor={selectedVendor ?? null}
        relationshipData={vendorRelationship.data ?? null}
        historicalProducts={historicalProducts}
        onQuickAdd={(product) => {
          addDraftLine({
            productName: product.name,
            unitCost: product.unitCost
          });
          setVendorDrawerOpen(false);
        }}
      />
      {addRefereeOpen ? <AddRefereeRelationshipDrawer
        isOpen={addRefereeOpen}
        vendorId={defaultVendorId}
        vendorName={selectedVendor?.name ?? ''}
        referees={(reference.data?.referees ?? []).map((r: any) => ({ id: r.id, name: r.name }))}
        onSuccess={async (newRelationshipId) => {
          await reference.refetch();
          setRefereeRelationshipId(newRelationshipId);
          setAddRefereeOpen(false);
        }}
        onClose={() => setAddRefereeOpen(false)}
      /> : null}
      <OperatorGrid
        view="purchaseOrders"
        title="Recent purchase orders"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.purchaseOrders ?? []}
        loading={grid.isLoading || isRunning}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => {
          setSelectedRows('purchaseOrders', rows);
          setSelectedLines([]);
          // CAP-002 / TER-1474: open PO drawer context on row selection
          if (rows.length === 1 && rows[0]?.id) {
            setDrawerEntity('purchaseOrders', 'po', String(rows[0].id));
            setDrawerState('purchaseOrders', 'standard');
          } else if (rows.length === 0) {
            setDrawerState('purchaseOrders', 'closed');
          }
        }}
        onCellCommit={canWrite ? updatePoCell : undefined}
        actions={
          <>
            {/* GH #354 presets, now via the shared template */}
            <FilterPresetStrip
              view="purchaseOrders"
              ariaLabel="Filter by status"
              presets={[
                { label: 'Active', filter: 'status:draft,approved,ordered,partially_received' },
                { label: 'Ordered', filter: 'status:ordered,partially_received' },
                { label: 'Finalized', filter: 'status:finalized' }
              ]}
            />
            {canWrite ? (
              <>
                <button className="primary-button" disabled={!selected.length || isRunning || purchaseOrderPrimaryDisabled(selectedPoStatus)} title={!selected.length ? 'Select a purchase order first' : purchaseOrderPrimaryDisabled(selectedPoStatus) ? 'This PO status does not support the current action' : undefined} onClick={runPurchaseOrderPrimary} type="button">
                  {['approved', 'ordered', 'partially_received'].includes(selectedPoStatus) ? <PackagePlus className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  {purchaseOrderPrimaryLabel(selectedPoStatus)}
                </button>
              </>
            ) : null}
          </>
        }
        expansionConfig={canWrite ? purchaseOrderExpansionConfig : undefined}
      />
      {prepaymentDialogOpen && selectedPo ? (
        <RecordPrepaymentDialog
          purchaseOrderId={String(selectedPo.id)}
          poNo={String(selectedPo.poNo ?? '')}
          maxAmount={Number(selectedPo.prepaymentAmount ?? 0)}
          onClose={() => setPrepaymentDialogOpen(false)}
        />
      ) : null}
      {selectedPo ? (
        <>
          <section className="po-header-strip" aria-label="Selected purchase order summary">
            <div>
              <div className="text-xs font-bold uppercase text-zinc-500">Selected PO</div>
              <div className="text-base font-semibold text-ink">{String(selectedPo.poNo ?? 'Purchase order')}</div>
            </div>
            <div className="po-header-facts">
              <span>{String(selectedPo.vendor ?? 'Vendor')}</span>
              <span>Expected {dateish(selectedPo.expectedDate)}</span>
              <span>{String(selectedPo.status ?? 'draft')}</span>
              <span>{moneyish(selectedPo.receivedQty)} / {moneyish(selectedPo.orderedQty)} received</span>
              <span>${moneyish(selectedPo.total)}</span>
            </div>
            {canWrite ? (
              <button className="primary-button compact-action" disabled={isRunning || purchaseOrderPrimaryDisabled(selectedPoStatus)} title={purchaseOrderPrimaryDisabled(selectedPoStatus) ? 'This PO status does not support the current action' : undefined} onClick={runPurchaseOrderPrimary} type="button">
                {purchaseOrderPrimaryLabel(selectedPoStatus)}
              </button>
            ) : null}
            {selectedPoStatus === 'finalized' ? (
              <button
                type="button"
                className="secondary-button compact-action"
                onClick={() => setReceiptOverlayOpen(true)}
              >
                Preview receipt
              </button>
            ) : null}
          </section>
          {receiptOverlayOpen && selectedPo?.id ? (
            <ReceiptPreviewOverlay
              purchaseOrderId={String(selectedPo.id)}
              onClose={() => setReceiptOverlayOpen(false)}
            />
          ) : null}
          {['finalized', 'approved', 'ordered', 'partially_received', 'received'].includes(selectedPoStatus) ? (
            <ReceiptPanel purchaseOrderId={String(selectedPo.id)} />
          ) : null}
          <OperatorGrid
            view="purchaseOrders"
            title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
            subtitle="Procurement cost lines"
            rows={(lines.data ?? []) as GridRow[]}
            columns={purchaseOrderLineColumns}
            loading={lines.isLoading || isRunning}
            onSelectionChange={setSelectedLines}
            onCellCommit={canWrite ? updateLineCell : undefined}
            actions={
              canWrite ? (
                <>
                  <button
                    className="primary-button"
                    disabled={!selectedLines.length || isRunning}
                    title={!selectedLines.length ? 'Select one or more PO lines first' : undefined}
                    onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo?.id ?? '', lineIds: selectedLines.map((line) => line.id) }, 'Receive selected PO lines to intake')}
                    type="button"
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    Draft selected lines
                  </button>
                </>
              ) : null
            }
            expansionConfig={canWrite ? purchaseOrderLineExpansionConfig : undefined}
          />
        </>
      ) : null}

    </div>
  );
}

function makePoDraftLine(seed: Partial<GridRow> = {}): GridRow {
  const category = String(seed.category ?? 'Flower');
  return {
    id: `draft-${crypto.randomUUID()}`,
    productName: seed.productName ?? '',
    category,
    subcategory: seed.subcategory ?? '',
    costRangeLow: seed.costRangeLow ?? null,
    costRangeHigh: seed.costRangeHigh ?? null,
    qty: seed.qty ?? 1,
    uom: seed.uom ?? unitTypeForCategory(category),
    unitCost: seed.unitCost ?? 0,
    externalNotes: seed.externalNotes ?? '',
    internalNotes: seed.internalNotes ?? '',
    tags: seed.tags ?? '',
    receivedQty: 0,
    status: 'draft'
  };
}

function poLineUnitCost(row: GridRow): number {
  const unitCost = Number(row.unitCost ?? 0);
  if (unitCost > 0) return unitCost;
  const low = Number(row.costRangeLow ?? 0);
  const high = Number(row.costRangeHigh ?? 0);
  if (low > 0 && high > 0) return (low + high) / 2;
  return 0;
}

function withPoLineTotal(row: GridRow): GridRow {
  return { ...row, lineTotal: Number(row.qty ?? 0) * poLineUnitCost(row) };
}

function poLinesTotal(rows: GridRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.qty ?? 0) * poLineUnitCost(row), 0);
}

function unitTypeForCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('flower')) return 'lb';
  if (normalized.includes('infused')) return 'case';
  if (normalized.includes('pre-roll')) return 'pack';
  return 'unit';
}

function composePoLineNotes(line: GridRow) {
  return [
    line.notes ? `Receipt: ${String(line.notes)}` : '',
    line.internalNotes ? `Internal: ${String(line.internalNotes)}` : '',
    line.paymentTerms ? `Terms: ${String(line.paymentTerms)}` : ''
  ].filter(Boolean).join(' | ');
}

function purchaseOrderPrimaryLabel(status: string) {
  if (['approved', 'ordered', 'partially_received'].includes(status)) return 'Receive PO';
  if (status === 'received') return 'Received';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'finalized') return 'Approve PO';
  return 'Finalize PO';
}

function purchaseOrderPrimaryDisabled(status: string) {
  return ['received', 'cancelled'].includes(status);
}

export function OrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'orders' });
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.orders);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  const selectedOrder = selected[0];
  const customerId = String(selectedOrder?.customerId ?? '');

  async function handlePostOrder() {
    if (!selectedOrder) return;
    const payload: Record<string, unknown> = { orderId: selectedOrder.id };
    if (refereeRelationshipId) {
      payload.refereeRelationshipId = refereeRelationshipId;
      payload.logRefereeCredit = true;
    }
    await runCommand('postSalesOrder', payload, 'Post selected order');
    setRefereeRelationshipId('');
  }

  function onCellCommit(event: CellValueChangedEvent<GridRow>) {
    // GH #291: In the orders grid, each row represents a sales_order and row.id
    // is the sales order UUID. Explicitly bind it as `orderId` so the field
    // mapping to the command handlers is unambiguous.
    const orderId: string | undefined = event.data?.id;
    if (!orderId || event.colDef.field == null || event.oldValue === event.newValue) return;
    if (event.colDef.field === 'deliveryWindow') {
      // setDeliveryWindow expects { orderId } — matches sales order UUID.
      runCommand('setDeliveryWindow', { orderId, deliveryWindow: event.newValue }, 'Inline delivery window edit');
      return;
    }
    if (['notes', 'packed', 'inventoryPosted', 'paymentFollowup'].includes(String(event.colDef.field))) {
      // updateSalesOrderLine with orderId (no lineId) updates the order header +
      // propagates to all of its lines via the handler's orderId branch.
      runCommand('updateSalesOrderLine', { orderId, [String(event.colDef.field)]: event.newValue }, `Inline order closeout edit: ${event.colDef.field}`);
    }
  }

  const customerRelationships = (reference.data?.refereeRelationships ?? [])
    .filter((rel: any) => rel.entityType === 'customer' && rel.entityId === customerId);

  // Spec §10.4 — status-aware primary decision table for Orders. Every verb
  // from the former always-on cockpit (Ready, Post, Reprice, Fulfillment,
  // Pick list, Cancel) remains reachable: it is either the primary for its
  // status or lives in the tray; the catch-all rule keeps the full verb set
  // available for mixed/unknown selections (no functionality loss).
  const act = {
    confirm: { key: 'confirm', label: 'Confirm', icon: <Check className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('confirmSalesOrder', { orderId: rows[0].id }, 'Mark selected order Ready/Confirmed') },
    post: { key: 'post', label: 'Post', icon: <Send className="h-4 w-4" aria-hidden="true" />, run: () => handlePostOrder() },
    reprice: { key: 'reprice', label: 'Reprice', icon: <FileDown className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('repriceOrder', { orderId: rows[0].id, strategy: 'clearance' }, 'Reprice selected order') },
    fulfillment: { key: 'fulfillment', label: 'Allocate fulfillment', icon: <Truck className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('allocateOrderToFulfillment', { orderId: rows[0].id }, 'Allocate order to fulfillment') },
    pickList: { key: 'pickList', label: 'Pick list', icon: <ListChecks className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('createPickList', { orderId: rows[0].id }, 'Create pick list for selected order') },
    cancel: { key: 'cancel', label: 'Cancel order', icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('cancelSalesOrder', { orderId: rows[0].id }, 'Cancel selected order') },
    markCloseout: (field: 'packed' | 'inventoryPosted' | 'paymentFollowup', label: string) => ({
      key: `mark-${field}`,
      label,
      icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
      run: (rows: GridRow[]) => runCommand('updateSalesOrderLine', { orderId: rows[0].id, [field]: true }, `Mark order ${label.toLowerCase()}`)
    })
  };
  const flag = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1';
  const ordersActionTable: StatusActionTable = {
    rules: [
      { when: 'draft', primary: act.confirm, tray: [act.reprice, act.cancel] },
      { when: 'confirmed', primary: act.post, tray: [act.reprice, act.fulfillment, act.pickList, act.cancel] },
      { when: (row) => row.status === 'posted' && !flag(row.packed), primary: act.markCloseout('packed', 'Mark packed'), tray: [act.fulfillment, act.pickList, act.reprice] },
      { when: (row) => row.status === 'posted' && flag(row.packed) && !flag(row.inventoryPosted), primary: act.markCloseout('inventoryPosted', 'Mark inv-posted'), tray: [act.fulfillment, act.pickList] },
      { when: (row) => row.status === 'posted' && flag(row.packed) && flag(row.inventoryPosted) && !flag(row.paymentFollowup), primary: act.markCloseout('paymentFollowup', 'Mark pay/f-up'), tray: [act.pickList] },
      { when: 'posted', primary: null, tray: [act.pickList, act.fulfillment] },
      { when: 'fulfilled', primary: null, tray: [act.pickList] },
      // Catch-all: mixed or unrecognized statuses keep every verb reachable.
      { when: () => true, primary: null, tray: [act.confirm, act.post, act.reprice, act.fulfillment, act.pickList, act.cancel] }
    ]
  };

  return (
    <div className="view-stack">
      {canWrite && selectedOrder && customerRelationships.length > 0 ? (
        <div className="control-band subtle-band">
          <label className="field-inline">
            Referee credit (optional)
            <select className="select" value={refereeRelationshipId} onChange={(e) => setRefereeRelationshipId(e.target.value)}>
              <option value="">No referee credit</option>
              {customerRelationships.map((rel: any) => (
                <option key={rel.id} value={rel.id}>
                  {rel.refereeName} ({rel.feeType === 'percentage' ? `${rel.feePercentage}%` : rel.feeType === 'fixed' ? `$${rel.feeFixedAmount}` : `${rel.feePercentage}% + $${rel.feeFixedAmount}`})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <OperatorGrid
        view="orders"
        title="Orders"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.orders ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('orders', rows)}
        onCellCommit={canWrite ? onCellCommit : undefined}
        actions={canWrite ? (
          /* GH #354 presets, now via the shared template */
          <FilterPresetStrip
            view="orders"
            ariaLabel="Filter by status"
            presets={[
              { label: 'All Open', filter: 'status:draft,confirmed' },
              { label: 'Confirmed', filter: 'status:confirmed' },
              { key: 'today', label: 'Today', filter: () => `createdAt:${new Date().toISOString().slice(0, 10)}` }
            ]}
          />
        ) : null}
        selectionActions={canWrite ? (rows) => (
          /* Spec §10.4 — status-aware primary + tray in the selection strip */
          <StatusActionBar rows={rows} table={ordersActionTable} busy={isRunning} />
        ) : undefined}
      />
    </div>
  );
}

export function PaymentsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.payments);
  const selectedPayment = selectedRows?.[0];
  return (
    <GridJourney
      view="payments"
      title="Payments"
      prelude={() => (
        <>
          <QuickLedgerGrid />
          {/* Selection-bound allocation tools live in consistent WorkspacePanel
              chrome (collapsible, focusable) instead of a bare inline panel. */}
          {selectedPayment ? (
            <WorkspacePanel panelId="payments-allocations" title="Payment allocations" subtitle="Uses the selected payment row below." headingLevel={2}>
              <PaymentAllocationTools selectedPayment={selectedPayment} />
            </WorkspacePanel>
          ) : null}
        </>
      )}
      inspectorTabs={(row) =>
        row.id
          ? [
              {
                key: 'receipt',
                label: 'Receipt',
                render: () => <ReceiptPanel kind="payment" paymentId={String(row.id)} />
              }
            ]
          : []
      }
      actions={() => (
        <>
          {/* GH #354 presets, now via the shared template */}
          <FilterPresetStrip
            view="payments"
            ariaLabel="Filter payments"
            presets={[
              { label: 'Unpaid', filter: 'status:active' },
              { label: 'Overdue', filter: 'category:overdue' }
            ]}
          />
        </>
      )}
      selectionActions={(rows, runCommand) => {
        // Spec §10.5 — status-aware primary for payments. The spec's
        // unapplied / partially_applied / applied states are NOT payment
        // statuses (real payments.status: posted | refunded | reversed,
        // verified in schema + commandBus); applied-ness is derived from
        // unappliedAmount vs amount, and buyer credits are a direction, not
        // a status. allocatePayment requires unapplied > 0. Unallocate and
        // discounts keep their inputs in the allocations WorkspacePanel
        // (in-page work tool per the templates.md decision rule).
        const unappliedOf = (row: GridRow) => Number(row.unappliedAmount ?? 0);
        const amountOf = (row: GridRow) => Math.abs(Number(row.amount ?? 0));
        const allocate = (label: string) => ({
          key: 'allocate',
          label,
          icon: <Check className="h-4 w-4" aria-hidden="true" />,
          run: (r: GridRow[]) => runCommand('allocatePayment', { paymentId: r[0].id }, 'Auto-apply payment to oldest open orders')
        });
        const paymentsTable: StatusActionTable = {
          rules: [
            { when: (row) => ['reversed', 'refunded'].includes(String(row.status ?? '')), primary: null, tray: [] },
            { when: (row) => unappliedOf(row) > 0 && unappliedOf(row) >= amountOf(row), primary: allocate('Auto-apply oldest'), tray: [] },
            { when: (row) => unappliedOf(row) > 0, primary: allocate('Allocate remaining'), tray: [] },
            // Fully applied: unallocate/discount live in the allocations panel.
            { when: (row) => unappliedOf(row) <= 0, primary: null, tray: [] },
            // Catch-all: allocation stays reachable on mixed selections.
            { when: () => true, primary: null, tray: [allocate('Auto-apply oldest')] }
          ]
        };
        return <StatusActionBar rows={rows} table={paymentsTable} />;
      }}
    />
  );
}

function PaymentAllocationTools({ selectedPayment }: { selectedPayment?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const allocations = trpc.queries.paymentAllocations.useQuery({ paymentId: selectedPayment?.id }, { enabled: Boolean(selectedPayment?.id) });
  const me = trpc.auth.me.useQuery();
  // CAP-004: preview impact for selected payment using existing paymentAllocationPreview query.
  const blankCustomerId = '00000000-0000-0000-0000-000000000000';
  const paymentAmount = Number(selectedPayment?.amount ?? 0);
  const paymentCustomerId = selectedPayment?.customerId ? String(selectedPayment.customerId) : blankCustomerId;
  const allocationPreview = trpc.queries.paymentAllocationPreview.useQuery(
    { customerId: paymentCustomerId, amount: paymentAmount, allocationIntent: String(selectedPayment?.allocationIntent ?? 'fifo') },
    { enabled: Boolean(selectedPayment?.id && selectedPayment?.customerId) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const canAllocate = me.data ? ['owner', 'manager'].includes(me.data.role) : false;
  const [allocationId, setAllocationId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const firstAllocation = allocations.data?.[0];
  const chosenAllocationId = allocationId || String(firstAllocation?.id ?? '');
  const invoices = (reference.data?.openInvoices ?? []).filter((invoice) => !selectedPayment?.customerId || invoice.customerId === selectedPayment.customerId);

  // K7 (phase7-keyboard-a11y-audit): explicit label associations ensure reliable tab order.
  const allocationSelectId = useId();
  const invoiceSelectId = useId();
  const discountInputId = useId();

  // CAP-004: detect buyer credit (negative amount or explicit direction flag)
  const isBuyerCredit = paymentAmount < 0 || selectedPayment?.direction === 'buyer_credit';
  const preview = allocationPreview.data;

  return (
    /* Title/subtitle chrome is owned by the wrapping WorkspacePanel
       ("Payment allocations") — this body keeps only data + controls. */
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="selection-pill">{allocations.data?.length ?? 0} allocation(s)</span>
        {/* CAP-004: buyer credit badge */}
        {isBuyerCredit ? (
          <span className="selection-pill">Buyer Credit / Down Payment</span>
        ) : null}
      </div>
      {/* CAP-004: allocation impact preview */}
      {preview && selectedPayment?.id ? (
        <div className="mt-2 text-xs text-zinc-500">
          {preview.kind === 'buyer_credit' ? (
            <span>Buyer credit of ${moneyish(preview.unapplied)} recorded as unapplied credit available for future orders.</span>
          ) : preview.rows && preview.rows.length > 0 ? (
            <span>Will apply ${moneyish(preview.rows[0]?.applied)} to order {String(preview.rows[0]?.invoiceNo ?? preview.rows[0]?.invoiceId ?? '—')}
              {Number(preview.unapplied) > 0 ? ` · $${moneyish(preview.unapplied)} remains unapplied` : ''}.
            </span>
          ) : Number(preview.unapplied) > 0 ? (
            <span>Overpayment of ${moneyish(preview.unapplied)} will be recorded as unapplied credit available for future orders.</span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={allocationSelectId} className="field-inline">
          Allocation
          <select id={allocationSelectId} className="select" value={chosenAllocationId} onChange={(event) => setAllocationId(event.target.value)} disabled={!allocations.data?.length || !canAllocate}>
            <option value="">Choose</option>
            {allocations.data?.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.invoiceNo)} / ${String(row.amount)}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenAllocationId || isRunning || !canAllocate} title={!canAllocate ? 'Manager or owner required to unallocate' : !chosenAllocationId ? 'Select an allocation to unallocate' : undefined} onClick={() => runCommand('unallocatePayment', { allocationId: chosenAllocationId }, 'Unallocate selected payment allocation')}>
          Unallocate
        </button>
        <label htmlFor={invoiceSelectId} className="field-inline">
          Order
          <select id={invoiceSelectId} className="select" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} disabled={!canAllocate}>
            <option value="">Choose order</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} / ${Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={discountInputId} className="field-inline">
          Discount
          <input id={discountInputId} className="input compact" value={discountAmount} inputMode="decimal" disabled={!canAllocate} onChange={(event) => setDiscountAmount(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={!invoiceId || !discountAmount || isRunning || !canAllocate} title={!canAllocate ? 'Manager or owner required to apply discount' : !invoiceId ? 'Select an order first' : !discountAmount ? 'Enter a discount amount' : undefined} onClick={() => runCommand('applyDiscount', { invoiceId, amount: Number(discountAmount) }, 'Apply discount from payments surface')}>
          Apply Discount
        </button>
      </div>
      {/* CAP-004: role-gate note for viewers */}
      {!canAllocate ? (
        <p className="text-xs text-zinc-400 mt-1">Manager or owner required to allocate payments.</p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Selected {selectedPayment ? String(selectedPayment.reference ?? selectedPayment.id) : 'none'}</span>
        <span className="selection-pill">Unapplied ${moneyish(selectedPayment?.unappliedAmount)}</span>
        <span className="selection-pill success">{paymentAllocationLabel(selectedPayment?.allocationIntent)}</span>
      </div>
      {allocations.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {allocations.data.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.invoiceNo ?? row.invoiceId ?? 'Order')}</td>
                  <td>${moneyish(row.amount)}</td>
                  <td>{dateish(row.createdAt)}</td>
                  <td>{String(selectedPayment?.reference ?? selectedPayment?.method ?? 'Payment row')} -&gt; {String(row.invoiceNo ?? 'order')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function paymentAllocationLabel(intent: unknown) {
  if (intent === 'selected' || intent === 'selected_invoice') return 'Selected order';
  if (intent === 'unapplied') return 'Leave unapplied';
  return 'Auto-apply to oldest';
}

export function InventoryView() {
  const reference = trpc.queries.reference.useQuery();
  const defaultsRule = useMemo(
    () => asCustomerPricingRule(reference.data?.defaultPricingRule),
    [reference.data?.defaultPricingRule]
  );
  const vendors = reference.data?.vendors ?? [];

  const inventoryColumns = useMemo<ColDef<GridRow>[]>(
    () => buildInventoryColumns(defaultsRule),
    [defaultsRule]
  );

  return (
    <GridJourney
      view="inventory"
      title="Inventory Batches"
      columns={inventoryColumns}
      actions={() => (
        /* GH #354 presets, now via the shared template */
        <FilterPresetStrip
          view="inventory"
          ariaLabel="Filter inventory"
          presets={[
            { label: 'Available', filter: 'arrivalStatus:arrived' },
            { label: 'Office Stock', filter: 'ownershipStatus:OFC', title: 'Office-owned batches (ownershipStatus:OFC)' }
          ]}
        />
      )}
      selectionActions={(rows, runCommand) => (
        <InventoryRowActions rows={rows} vendors={vendors} runCommand={runCommand} />
      )}
      onCellCommit={(event, runCommand) => {
        if (event.colDef.field === 'unitPrice') {
          if (event.oldValue === event.newValue) return;
          // Derived/auto unit price: do not write back. The cell is non-editable in that state,
          // but guard here too in case ag-grid emits a commit for a no-op interaction.
          const stored = Number(event.data?.unitPrice);
          const hasStoredPrice = Number.isFinite(stored) && stored > 0;
          if (!hasStoredPrice) return;
          const next = Number(event.newValue);
          if (!Number.isFinite(next)) return;
          runCommand('setBatchPrice', { batchId: event.data?.id, unitPrice: next }, 'Inline inventory price edit');
        }
        if (event.colDef.field === 'availableQty') {
          runCommand(
            'adjustBatchQuantity',
            { batchId: event.data?.id, deltaQty: Number(event.newValue) - Number(event.oldValue), reason: 'Inline inventory adjustment from grid' },
            'Inline inventory quantity adjustment'
          );
        }
        if (['lotCode', 'expirationDate'].includes(String(event.colDef.field))) {
          runCommand('setBatchLotInfo', { batchId: event.data?.id, [String(event.colDef.field)]: event.newValue }, `Inline lot info edit: ${event.colDef.field}`);
        }
        if (['tags', 'legacyMarker', 'ownershipStatus', 'arrivalStatus', 'mediaStatus'].includes(String(event.colDef.field))) {
          runCommand('updateBatch', { batchId: event.data?.id, [String(event.colDef.field)]: event.newValue }, `Inline inventory edit: ${event.colDef.field}`);
        }
        if (event.colDef.field === 'itemAlias') {
          const itemId = event.data?.itemId;
          if (!itemId) return;
          const next = typeof event.newValue === 'string' ? event.newValue.trim() : '';
          const prior = typeof event.oldValue === 'string' ? event.oldValue.trim() : '';
          if (next === prior) return;
          runCommand('setItemAlias', { itemId, alias: next }, next ? `Set alias to ${next}` : 'Clear strain alias');
        }
      }}
    />
  );
}

function buildInventoryColumns(defaultsRule: ReturnType<typeof asCustomerPricingRule>): ColDef<GridRow>[] {
  return [
    { field: 'batchCode', pinned: 'left', width: 150 },
    { field: 'subcategory', width: 140 },
    {
      field: 'name',
      minWidth: 200,
      cellRenderer: (params: { value: unknown; data: GridRow }) => (
        <span>
          {params.data?.itemAlias ? (
            <span title="Customer-facing market name active" style={{ color: '#eab308', marginRight: 4 }}>
              ●
            </span>
          ) : null}
          {String(params.value ?? '')}
        </span>
      )
    },
    { field: 'itemAlias', headerName: 'Market name', editable: true, minWidth: 180 },
    { field: 'category', width: 120 },
    { field: 'tags', editable: true, minWidth: 170 },
    { field: 'vendor', width: 180 },
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
    { field: 'reservedQty', type: 'numericColumn', width: 130 },
    { field: 'uom', width: 90 },
    {
      field: 'unitCost',
      headerName: 'Unit cost',
      type: 'numericColumn',
      minWidth: 130,
      valueGetter: (params) =>
        inventoryUnitCostSortValue({
          unitCost: params.data?.unitCost as number | string | null | undefined,
          priceRange: (params.data?.priceRange as string | null | undefined) ?? null
        }),
      cellRenderer: (params: { data?: GridRow }) =>
        formatInventoryUnitCost({
          unitCost: params.data?.unitCost as number | string | null | undefined,
          priceRange: (params.data?.priceRange as string | null | undefined) ?? null
        }),
      comparator: (_a, _b, nodeA, nodeB) => {
        const av = inventoryUnitCostSortValue({
          unitCost: nodeA?.data?.unitCost as number | string | null | undefined,
          priceRange: (nodeA?.data?.priceRange as string | null | undefined) ?? null
        });
        const bv = inventoryUnitCostSortValue({
          unitCost: nodeB?.data?.unitCost as number | string | null | undefined,
          priceRange: (nodeB?.data?.priceRange as string | null | undefined) ?? null
        });
        return av - bv;
      },
      cellClass: 'numeric-display-cell'
    },
    {
      field: 'unitPrice',
      headerName: 'Unit price',
      // Editable only when a stored batch unitPrice exists — otherwise the cell shows
      // a derived auto-price and accidental edits would silently overwrite the rule output.
      editable: (params) => {
        const stored = Number(params.data?.unitPrice);
        return Number.isFinite(stored) && stored > 0;
      },
      type: 'numericColumn',
      width: 120,
      valueGetter: (params) => {
        const stored = params.data?.unitPrice;
        const storedNum = Number(stored);
        if (Number.isFinite(storedNum) && storedNum > 0) return storedNum;
        const derived = computeInventoryUnitPrice({
          unitCost: params.data?.unitCost as number | string | null | undefined,
          priceRange: (params.data?.priceRange as string | null | undefined) ?? null,
          category: (params.data?.category as string | null | undefined) ?? null,
          customerRule: null,
          defaultsRule
        });
        return Number(derived.unitPrice.toFixed(2));
      },
      cellRenderer: (params: { value: unknown; data?: GridRow }) => {
        const stored = Number(params.data?.unitPrice);
        const isAuto = !(Number.isFinite(stored) && stored > 0);
        const display = Number(params.value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
        return (
          <span>
            ${display}
            {isAuto ? (
              <em
                title="Auto-derived from pricing rule — set a stored unit price on the batch to override."
                style={{ marginLeft: 4, fontSize: 10, color: '#6b7280', fontStyle: 'normal' }}
              >
                Auto
              </em>
            ) : null}
          </span>
        );
      }
    },
    { field: 'location', width: 120 },
    { field: 'legacyMarker', headerName: 'Marker', editable: true, width: 105 },
    { field: 'ownershipStatus', width: 120 },
    { field: 'arrivalStatus', width: 120 },
    { field: 'mediaStatus', headerName: 'Media', width: 120 },
    { field: 'lotCode', editable: true, width: 120 },
    { field: 'expirationDate', editable: true, width: 140 },
    { field: 'status', width: 120 }
  ];
}

function InventoryRowActions({
  rows,
  vendors,
  runCommand
}: {
  rows: GridRow[];
  vendors: Array<{ id: string; name: string }>;
  runCommand: ReturnType<typeof useCommandRunner>['runCommand'];
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('held');
  const [location, setLocation] = useState('');
  const [ownershipStatus, setOwnershipStatus] = useState('OFC');
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('Operator inventory correction');
  const [tagText, setTagText] = useState('');
  const selectedBatch = rows[0];
  const batchId = selectedBatch?.id;
  const noSelection = !batchId;
  const consignedVendorId = vendorId || String(selectedBatch?.vendorId ?? '');

  useEffect(() => {
    const currentTags = selectedBatch?.tags;
    setTagText(Array.isArray(currentTags) ? currentTags.join(', ') : String(currentTags ?? ''));
  }, [selectedBatch?.id, selectedBatch?.tags]);

  const confirm = useConfirm();
  const confirmAction = async (label: string, exec: () => void) => {
    const ok = await confirm({ title: `${label} for selected inventory row?` });
    if (!ok) return;
    exec();
  };

  return (
    <>
      <button
        type="button"
        className="secondary-button compact-action"
        disabled={noSelection}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="inventory-row-actions-menu"
        title={noSelection ? 'Select an inventory row to enable actions' : 'Inventory row actions'}
      >
        Row actions
      </button>
      {open && !noSelection ? (
        <div id="inventory-row-actions-menu" role="menu" className="inline-panel" style={{ width: '100%' }}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="field-inline">
              Status
              <select className="select compact" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="posted">Available</option>
                <option value="held">Held</option>
                <option value="damaged">Damaged</option>
                <option value="returned">Returned</option>
                <option value="in_transit">In transit</option>
              </select>
            </label>
            <button
              className="secondary-button compact-action"
              type="button"
              disabled={!reason.trim()}
              title={!reason.trim() ? 'Enter a reason before changing status' : undefined}
              onClick={() =>
                void confirmAction(`Set inventory status to ${status}`, () =>
                  runCommand('setInventoryStatus', { batchId, status }, reason || `Set inventory status to ${status}`)
                )
              }
            >
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Set status
            </button>
            <label className="field-inline">
              Location
              <input className="input compact" value={location} placeholder={String(selectedBatch?.location ?? 'Warehouse A')} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <button
              className="secondary-button compact-action"
              type="button"
              disabled={!location.trim() || !reason.trim()}
              title={!location.trim() ? 'Enter a destination location' : !reason.trim() ? 'Enter a reason for the move' : undefined}
              onClick={() =>
                void confirmAction(`Move location to ${location}`, () =>
                  runCommand('transferInventoryLocation', { batchId, location: location.trim() }, reason || `Move inventory to ${location}`)
                )
              }
            >
              <Truck className="h-4 w-4" aria-hidden="true" />
              Move location
            </button>
            <label className="field-inline">
              Owner
              <select className="select compact" value={ownershipStatus} onChange={(event) => setOwnershipStatus(event.target.value)}>
                <option value="OFC">Office</option>
                <option value="C">Consigned</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </label>
            {ownershipStatus === 'C' ? (
              <select
                className="select compact"
                aria-label="Consignment vendor"
                value={consignedVendorId}
                onChange={(event) => setVendorId(event.target.value)}
              >
                <option value="">Vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              className="secondary-button compact-action"
              type="button"
              disabled={!reason.trim() || (ownershipStatus === 'C' && !consignedVendorId)}
              title={!reason.trim() ? 'Enter a reason for the ownership change' : (ownershipStatus === 'C' && !consignedVendorId) ? 'Select a consignment vendor first' : undefined}
              onClick={() =>
                void confirmAction(`Move ownership to ${ownershipStatus}`, () =>
                  runCommand(
                    'transferInventoryOwnership',
                    { batchId, ownershipStatus, vendorId: ownershipStatus === 'C' ? consignedVendorId : undefined },
                    reason || `Move inventory ownership to ${ownershipStatus}`
                  )
                )
              }
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Move ownership
            </button>
            <label className="field-inline grow">
              Reason
              <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <label className="field-inline grow">
              Tags
              <input className="input" value={tagText} placeholder="premium, candy" onChange={(event) => setTagText(event.target.value)} />
            </label>
            <button
              className="secondary-button compact-action"
              type="button"
              onClick={() =>
                void confirmAction('Replace tags', () =>
                  runCommand('applyTags', { entityType: 'batch', entityId: batchId, tags: parseTagInput(tagText), mode: 'replace' }, 'Replace tags on selected inventory row')
                )
              }
            >
              Apply tags
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ClientLedgerView() {
  const navigate = useNavigate();
  const matchSettings = trpc.queries.matchmakingSettings.useQuery();
  const matchCounts = trpc.queries.matchmakingEntityCounts.useQuery(undefined, {
    enabled: matchSettings.data?.showClientsColumn ?? false,
  });
  const clientColumns = useMemo((): ColDef<GridRow>[] => {
    const base: ColDef<GridRow>[] = [
      {
        field: 'name',
        pinned: 'left',
        width: 190,
        cellRenderer: (params: { data: GridRow; value: string }) =>
          params.data?.contactId ? (
            <button
              className="text-button font-medium text-left"
              onClick={() => navigate(`/contacts/${String(params.data.contactId)}`)}
              type="button"
            >
              {params.value}
            </button>
          ) : (
            <span>{params.value}</span>
          )
      },
      { field: 'creditLimit', type: 'numericColumn', width: 140 },
      { field: 'balance', type: 'numericColumn', width: 130 },
      { field: 'tags', minWidth: 180 },
      { field: 'notes', minWidth: 260 },
      { field: 'invoiceCount', width: 120 },
      { field: 'avgDaysToPay', headerName: 'Avg days to pay', type: 'numericColumn', width: 145 },
    ];
    if (!matchSettings.data?.showClientsColumn) return base;
    return [
      ...base,
      {
        headerName: 'Matchmaking',
        width: 160,
        cellRenderer: (params: { data?: GridRow }) => {
          const counts = matchCounts.data?.customers[String(params.data?.id ?? '')];
          if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
          return (
            <a
              href={`/matchmaking?customer=${params.data?.id}`}
              className="text-xs text-blue-600 hover:underline"
              onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?customer=${params.data?.id}`); }}
            >
              {counts.needs} needs · {counts.matches} matches
            </a>
          );
        },
      },
    ];
  }, [matchSettings.data?.showClientsColumn, matchCounts.data, navigate]);
  return <GridJourney view="clients" title="Client Balances" columns={clientColumns} />;
}

export function VendorPayablesView() {
  const selectedRows = useUiStore((state) => state.selectedRows.vendors);
  const selectedBill = selectedRows?.[0];
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canVoid = me.data?.role === 'manager' || me.data?.role === 'owner';
  const navigate = useNavigate();
  const matchSettings = trpc.queries.matchmakingSettings.useQuery();
  const matchCounts = trpc.queries.matchmakingEntityCounts.useQuery(undefined, {
    enabled: matchSettings.data?.showVendorsColumn ?? false,
  });

  const vendorMatchColumns = useMemo((): ColDef<GridRow>[] => {
    const base: ColDef<GridRow>[] = [
      { field: 'vendor', pinned: 'left', width: 190 },
      { field: 'billNo', width: 150 },
      { field: 'amount', type: 'numericColumn', width: 120 },
      { field: 'amountPaid', type: 'numericColumn', width: 130 },
      { field: 'status', width: 125 },
      { field: 'dueDate', width: 180 },
      { field: 'scheduledFor', width: 180 },
      { field: 'dueReason', minWidth: 240 },
      { field: 'consignmentTriggered', width: 170 }
    ];
    if (!matchSettings.data?.showVendorsColumn) return base;
    return [
      ...base,
      {
        headerName: 'Matchmaking',
        width: 140,
        cellRenderer: (params: { data?: GridRow }) => {
          const counts = matchCounts.data?.vendors[String(params.data?.vendorId ?? '')];
          if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
          return (
            <a
              href={`/matchmaking?vendor=${params.data?.id}`}
              className="text-xs text-blue-600 hover:underline"
              onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?vendor=${params.data?.id}`); }}
            >
              {counts.supply} stock listed
            </a>
          );
        },
      },
    ];
  }, [matchSettings.data?.showVendorsColumn, matchCounts.data, navigate]);

  const vendorBillExpansionConfig = useMemo(
    () => ({
      enabled: true,
      // CMD-VENDOR / TER-1517: status-aware inline actions — show only the
      // action that is valid for the current bill status. Void is visible to
      // manager+ for any non-terminal status. Viewer role sees a read-only note.
      actionsRenderer: (row: GridRow) => {
        const rowStatus = String(row.status ?? '');
        const isTerminal = rowStatus === 'paid' || rowStatus === 'voided';
        const showApprove = rowStatus === 'open' || rowStatus === 'pending';
        const showSchedule = rowStatus === 'approved';
        const showRecord = rowStatus === 'scheduled';

        if (!canWrite) {
          return (
            <span className="text-xs text-zinc-400">
              Manager or owner required to act on this bill.
            </span>
          );
        }

        return (
          <>
            {showApprove ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('approveVendorBill', { vendorBillId: row.id }, 'Approve vendor bill');
                }}
                type="button"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Approve
              </button>
            ) : null}

            {showSchedule ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('scheduleVendorPayment', { vendorBillId: row.id, scheduledFor: new Date(Date.now() + MS_PER_DAY).toISOString() }, 'Schedule vendor payment');
                }}
                type="button"
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule
              </button>
            ) : null}

            {showRecord ? (
              <button
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={() => {
                  if (!row.id || String(row.id).trim() === '') return;
                  runCommand('recordVendorPayment', { vendorBillId: row.id }, 'Record vendor payout');
                }}
                type="button"
              >
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Pay
              </button>
            ) : null}

            {!isTerminal && canVoid ? (
              // Void requires a vendorPaymentId — open the Payments drawer tab
              // (Details tab also surfaces Void) to select the specific payment.
              // This inline indicator is intentionally read-only; it confirms
              // void access and directs the operator to the drawer for the action.
              <span
                className="text-xs text-zinc-500"
                title="Open the Payments or Details drawer tab to void a specific payment"
              >
                <Ban className="inline h-3 w-3 mr-1 text-zinc-400" aria-hidden="true" />
                Void via drawer
              </span>
            ) : null}

            {isTerminal ? (
              <span className="text-xs text-zinc-400">
                {rowStatus === 'paid' ? 'Paid in full' : 'Voided'}
              </span>
            ) : null}
          </>
        );
      }
    }),
    [isRunning, runCommand, canWrite, canVoid]
  );

  return (
    <GridJourney
      view="vendors"
      title="Vendor Payouts"
      columns={vendorMatchColumns}
      prelude={() => (
        <>
          {/* Pre/post-selection band swap (spec §1.4 #2): the payout commit
              row appears only once a bill is selected — no disabled-control
              strip before that. Both tools use WorkspacePanel chrome
              (collapsible, persisted) like Payments allocations. */}
          {selectedBill ? (
            <WorkspacePanel panelId="vendors-money-out" title="Record payout" subtitle="Commits against the selected bill." headingLevel={2}>
              <VendorMoneyOutStrip selectedBill={selectedBill} />
            </WorkspacePanel>
          ) : null}
          <WorkspacePanel panelId="vendors-bill-tools" title="Vendor bill and payout tools" subtitle="Manual bill creation and payout voiding — no selection required." headingLevel={2}>
            <VendorBillTools selectedBill={selectedBill} />
          </WorkspacePanel>
        </>
      )}
      selectionActions={(rows) => {
        // Spec §10.6 — status-aware primary decision table for vendor bills.
        // Status values verified against schema + commandBus (NOT the spec's
        // names): open → approved → scheduled → (partial →) paid, with
        // 'reversed' from reversals. There is no 'void' BILL status — void
        // applies to vendor_payments (TER-1517 expansion + VendorBillTools).
        // recordVendorPayment requires status 'scheduled', so Pay actions on
        // unscheduled bills schedule first (same sequence as the Money-out
        // commit row).
        const payBill = async (bill: GridRow | undefined) => {
          if (!bill?.id) return;
          if (String(bill.status ?? '') !== 'scheduled') {
            const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: bill.id, scheduledFor: new Date().toISOString() }, 'Auto-schedule before payout');
            if (!scheduled.ok) return;
          }
          await runCommand('recordVendorPayment', { vendorBillId: bill.id }, 'Record vendor payout');
        };
        const vAct = {
          approve: { key: 'approve', label: 'Approve', icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('approveVendorBill', { vendorBillId: r[0].id }, 'Approve vendor bill') },
          schedule: (label: string) => ({ key: 'schedule', label, icon: <CalendarClock className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('scheduleVendorPayment', { vendorBillId: r[0].id, scheduledFor: new Date(Date.now() + MS_PER_DAY).toISOString() }, 'Schedule vendor payment') }),
          pay: (label: string) => ({ key: 'pay', label, icon: <Landmark className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => payBill(r[0]) })
        };
        const vendorBillTable: StatusActionTable = {
          rules: [
            { when: ['open', 'pending'], primary: vAct.approve, tray: [vAct.schedule('Schedule'), vAct.pay('Pay now')] },
            { when: 'approved', primary: vAct.schedule('Schedule'), tray: [vAct.pay('Pay now')] },
            { when: 'scheduled', primary: vAct.pay('Pay'), tray: [vAct.schedule('Reschedule')] },
            { when: 'partial', primary: vAct.pay('Pay remaining'), tray: [vAct.schedule('Reschedule')] },
            { when: ['paid', 'reversed'], primary: null, tray: [] },
            // Catch-all: every verb stays reachable on mixed/unknown statuses.
            { when: () => true, primary: null, tray: [vAct.approve, vAct.schedule('Schedule'), vAct.pay('Pay (schedules first)')] }
          ]
        };
        return <StatusActionBar rows={rows} table={vendorBillTable} busy={isRunning} />;
      }}
      expansionConfig={vendorBillExpansionConfig}
    />
  );
}

function VendorMoneyOutStrip({ selectedBill }: { selectedBill?: GridRow }) {
  const { runCommand, isRunning } = useCommandRunner();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [bucket, setBucket] = useState('accounting');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const openAmount = Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0);
  const payoutAmount = amount ? Number(amount) : openAmount;
  const selectedStatus = String(selectedBill?.status ?? '');
  const trace = selectedBill ? `${moneyBucketLabel(bucket)} to ${String(selectedBill.billNo ?? 'bill')}` : `${moneyBucketLabel(bucket)} to selected bill`;
  const impact = selectedBill ? `Pays ${moneyish(Math.min(Math.max(openAmount, 0), Math.max(payoutAmount, 0)))} on ${String(selectedBill.billNo ?? 'bill')}` : 'Select bill to preview payout';

  async function commit() {
    if (!selectedBill?.id) return;
    if (selectedStatus !== 'scheduled') {
      const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: selectedBill.id, scheduledFor: new Date(date).toISOString() }, 'Money out row: schedule vendor payout');
      if (!scheduled.ok) return;
    }
    await runCommand('recordVendorPayment', { vendorBillId: selectedBill.id, amount: payoutAmount, method, reference }, 'Money out row: record vendor payout');
  }

  return (
    <section className="money-out-strip" aria-label="Money out payout row">
      <span className="selection-pill">{selectedBill ? `${String(selectedBill.vendor ?? 'Vendor')} / ${String(selectedBill.billNo ?? 'bill')}` : 'Select vendor bill'}</span>
      <label className="field-inline">
        Date
        <input className="input compact" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label className="field-inline">
        Method
        <select className="select compact" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="wire">Wire</option>
          <option value="crypto">Crypto</option>
        </select>
      </label>
      <label className="field-inline">
        Bucket
        <select className="select compact" value={bucket} onChange={(event) => setBucket(event.target.value)}>
          <option value="accounting">Accounting</option>
          <option value="cash-file-a">Cash file A</option>
          <option value="cash-file-b">Cash file B</option>
          <option value="wire-clearing">Wire clearing</option>
        </select>
      </label>
      <label className="field-inline">
        Amount
        <input className="input compact" value={amount} placeholder={openAmount > 0 ? moneyish(openAmount) : '0'} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
      </label>
      <label className="field-inline grow">
        Reference
        <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <span className="selection-pill">{impact}</span>
      <span className="selection-pill">{trace}</span>
      <button className="primary-button compact-action" type="button" disabled={!selectedBill?.id || payoutAmount <= 0 || isRunning} title={!selectedBill?.id ? 'Select a vendor bill first' : payoutAmount <= 0 ? 'Enter a payout amount greater than zero' : undefined} onClick={commit}>
        Commit payout
      </button>
    </section>
  );
}

function moneyBucketLabel(value: string) {
  const labels: Record<string, string> = {
    accounting: 'Accounting',
    'cash-file-a': 'Cash file A',
    'cash-file-b': 'Cash file B',
    'wire-clearing': 'Wire clearing'
  };
  return labels[value] ?? labelFromToken(value);
}

function VendorBillTools({ selectedBill }: { selectedBill?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const vendorPayments = trpc.queries.vendorPayments.useQuery({ vendorBillId: selectedBill?.id }, { enabled: Boolean(selectedBill?.id) });
  const { runCommand, isRunning } = useCommandRunner();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueReason, setDueReason] = useState('Manual vendor payable');
  const [vendorPaymentId, setVendorPaymentId] = useState('');
  const firstPayment = vendorPayments.data?.find((row) => row.status !== 'void');
  const chosenPaymentId = vendorPaymentId || String(firstPayment?.id ?? '');

  return (
    /* Title/subtitle chrome is owned by the wrapping WorkspacePanel
       ("Vendor bill and payout tools") — this body keeps data + controls. */
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="selection-pill">{vendorPayments.data?.length ?? 0} payout(s)</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Vendor
          <select className="select" value={vendorId || String(selectedBill?.vendorId ?? '')} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Choose vendor</option>
            {reference.data?.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          Amount
          <input className="input compact" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="field-inline">
          Due
          <input className="input compact" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="field-inline">
          Why
          <input className="input" value={dueReason} onChange={(event) => setDueReason(event.target.value)} />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!(vendorId || selectedBill?.vendorId) || !amount || isRunning}
          title={!(vendorId || selectedBill?.vendorId) ? 'Select a vendor to create a bill' : !amount ? 'Enter an amount to create a bill' : undefined}
          onClick={() => runCommand('createVendorBill', { vendorId: vendorId || selectedBill?.vendorId, amount: Number(amount), dueDate: dueDate || undefined, dueReason }, 'Create manual vendor bill')}
        >
          Create bill
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Payout
          <select className="select" value={chosenPaymentId} onChange={(event) => setVendorPaymentId(event.target.value)} disabled={!vendorPayments.data?.length}>
            <option value="">Choose payout</option>
            {vendorPayments.data?.map((payment) => (
              <option key={String(payment.id)} value={String(payment.id)}>
                {String(payment.billNo)} / ${String(payment.amount)} / {labelFromToken(String(payment.status ?? 'open'))}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenPaymentId || isRunning} title={!chosenPaymentId ? 'Select a payout to void' : undefined} onClick={() => runCommand('voidVendorPayment', { vendorPaymentId: chosenPaymentId }, 'Void selected vendor payout')}>
          Void payout
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Bill {String(selectedBill?.billNo ?? 'none')}</span>
        <span className="selection-pill">Open ${moneyish(Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0))}</span>
        <span className="selection-pill success">{selectedBill ? String(selectedBill.dueReason ?? 'Due reason not recorded') : 'Select bill to see due reason'}</span>
      </div>
      {vendorPayments.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorPayments.data.map((payment) => (
                <tr key={String(payment.id)}>
                  <td>{String(payment.billNo ?? selectedBill?.billNo ?? 'Bill')}</td>
                  <td>${moneyish(payment.amount)}</td>
                  <td>{labelFromToken(String(payment.method ?? '-'))}</td>
                  <td>{String(payment.reference ?? '-')}</td>
                  <td>{labelFromToken(String(payment.status ?? '-'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {chosenPaymentId ? (
        <ReceiptPanel kind="vendor_payment" vendorPaymentId={String(chosenPaymentId)} />
      ) : null}
    </section>
  );
}

export function FulfillmentView() {
  const grid = trpc.queries.grid.useQuery({ view: 'fulfillment' });
  const selectedRows = useUiStore((state) => state.selectedRows.fulfillment);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const pickRows = (grid.data ?? []) as GridRow[];
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPick = selected[0];
  const lines = trpc.queries.fulfillmentLines.useQuery({ pickListId: String(selectedPick?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(selectedPick?.id) });
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [actualQty, setActualQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [bagCode, setBagCode] = useState('');
  const [tracking, setTracking] = useState('');
  const [labelFormat, setLabelFormat] = useState('4x6');
  const [printTrayOpen, setPrintTrayOpen] = useState(false);
  // CAP-030 / TER-1510 — filter chips (non-persisted)
  const pickQueueFilters = useUiStore((state) => state.pickQueueFilters);
  const setPickQueueFilter = useUiStore((state) => state.setPickQueueFilter);
  const clearPickQueueFilters = useUiStore((state) => state.clearPickQueueFilters);
  // UX-L03: default to 'Open picks' so fulfilled rows are excluded on first load.
  // gridFilters is not persisted across sessions (uiStore.ts partialize list), so
  // we seed status:open on every mount unless the operator has already chosen a filter.
  const fulfillmentGridFilter = useUiStore((state) => state.gridFilters?.fulfillment ?? '');
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  useEffect(() => {
    if (!fulfillmentGridFilter) {
      setGridFilter('fulfillment', 'status:open');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // GH #354: grid-filter presets now rendered via FilterPresetStrip template
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [alertsPickListId, setAlertsPickListId] = useState<string | null>(null);

  // K8 (phase7-keyboard-a11y-audit): Trap focus inside the alerts drawer.
  const alertsRef = useFocusTrap<HTMLDivElement>(alertsDrawerOpen, () => setAlertsDrawerOpen(false));
  const [alertReturnQty, setAlertReturnQty] = useState('');
  // CAP-030 / TER-1510 — derive live alerts from fulfillmentLines.warehouseAlerts JSONB (backend now merged)
  const liveAlerts: Array<WarehouseAlert & { alertIndex: number }> = alertsPickListId && lines.data
    ? (lines.data as GridRow[]).flatMap((l) => {
        const rawAlerts = Array.isArray(l.warehouseAlerts) ? (l.warehouseAlerts as WarehouseAlert[]) : [];
        return rawAlerts
          .filter((a) => a.status !== 'acknowledged')
          .map((a, idx) => ({
            ...a,
            lineId: String(l.id ?? ''),
            itemName: a.itemName ?? String(l.itemName ?? ''),
            batchCode: a.batchCode ?? String(l.batchCode ?? ''),
            alertIndex: idx,
          }));
      })
    : [];
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const line = selectedLines[0];
  const fulfillmentComplete = Boolean(
    selectedPick?.id &&
      lines.data?.length &&
      lines.data.every((candidate) => String(candidate.status ?? '') === 'packed' || (Number(candidate.actualQty ?? 0) > 0 && Boolean(candidate.bagCode)))
  );

  // CAP-030 / TER-1510 — apply chip filters to pick rows
  const filteredPickRows = pickQueueFilters.size === 0 ? pickRows : pickRows.filter((row) => {
    const status = String(row.status ?? '');
    const alertCount = Number(row.alertCount ?? 0);
    if (pickQueueFilters.has('needs_picking') && status !== 'needs_picking') return false;
    if (pickQueueFilters.has('in_progress') && status !== 'in_progress') return false;
    if (pickQueueFilters.has('has_alerts') && alertCount === 0) return false;
    if (pickQueueFilters.has('ready_to_close') && status !== 'ready_to_close') return false;
    return true;
  });

  useEffect(() => {
    if (!line) {
      setActualQty('');
      setActualWeight('');
      setBagCode('');
      return;
    }
    setActualQty(String(line.actualQty ?? ''));
    setActualWeight(String(line.actualWeight ?? ''));
    setBagCode(String(line.bagCode ?? ''));
  }, [line]);

  return (
    <div className="view-stack">
      {/* CAP-030 / TER-1510 — pick queue filter chips */}
      {canWrite ? (
        <div className="control-band subtle-band flex-wrap gap-1">
          <span className="text-xs text-zinc-500 font-medium">Filter:</span>
          {[
            { key: 'needs_picking', label: 'Needs picking' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'has_alerts', label: 'Has alerts' },
            { key: 'ready_to_close', label: 'Ready to close' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={pickQueueFilters.has(key) ? 'selection-pill warning' : 'selection-pill'}
              onClick={() => setPickQueueFilter(key, !pickQueueFilters.has(key))}
              aria-pressed={pickQueueFilters.has(key)}
            >
              {label}
              {pickQueueFilters.has(key) ? ' ×' : ''}
            </button>
          ))}
          {pickQueueFilters.size > 0 ? (
            <button type="button" className="text-button text-xs" onClick={clearPickQueueFilters}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
      <OperatorGrid
        view="fulfillment"
        title="Fulfillment"
        rows={filteredPickRows}
        columns={columnsByView.fulfillment ?? []}
        loading={grid.isLoading || isRunning}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => {
          setSelectedRows('fulfillment', rows);
          setSelectedLines([]);
          if (rows[0]?.id) setAlertsPickListId(String(rows[0].id));
        }}
        actions={canWrite ?
          <>
            {/* UX-L03: correct DB statuses are 'open' and 'fulfilled' (verified
                in schema.ts and commandBus). Previous presets used wrong values
                ('in_progress', 'needs_picking') that never matched any rows.
                'Open picks' is the default-active preset (seeded by useEffect above). */}
            <FilterPresetStrip
              view="fulfillment"
              ariaLabel="Filter fulfillment"
              presets={[
                { label: 'Open picks', filter: 'status:open', title: 'Show only open (active) pick lists' },
                { label: 'Fulfilled', filter: 'status:fulfilled', title: 'Show fulfilled pick lists' }
              ]}
            />
            <span className={selectedPick ? 'selection-pill' : 'selection-pill warning'}>{selectedPick ? `Showing ${String(selectedPick.pickNo ?? 'pick')}` : 'Select a pick row'}</span>
            {/* TER-1660: Label printing deferred to backlog. The Print/Labels
                tray is hidden from the active fulfillment flow; the underlying
                printLabels command remains in the catalog for future re-enable. */}
            {/*
            <button className="secondary-button compact-action" disabled={!selectedPick?.id} onClick={() => setPrintTrayOpen((value) => !value)} type="button" aria-expanded={printTrayOpen}>
              {printTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              Print
            </button>
            {printTrayOpen ? (
              <>
                <label className="field-inline">
                  Format
                  <select className="select compact" value={labelFormat} onChange={(event) => setLabelFormat(event.target.value)}>
                    <option value="4x6">4x6</option>
                    <option value="2x1">2x1</option>
                  </select>
                </label>
                <button className="secondary-button compact-action" disabled={!selectedPick?.id} onClick={() => runCommand('printLabels', { pickListId: selectedPick?.id, labelFormat }, 'Print labels')} type="button">
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Labels
                </button>
              </>
            ) : null}
            */}
          </>
          : null}
        selectionActions={canWrite ? (rows) => {
          // Spec §10.7 — status-aware primary for pick rows. Real pick_lists
          // statuses are 'open' and 'fulfilled' only (verified in schema +
          // commandBus); the spec's draft/in_pack/packed/labeled states do
          // not exist — pack progress is derived from the line grid
          // (fulfillmentComplete). printLabels stays out of the bar per the
          // TER-1660 deferral.
          const fulfillAct = {
            key: 'fulfilled',
            label: 'Mark fulfilled',
            icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
            disabled: !fulfillmentComplete,
            disabledReason: 'Pack every line (qty + bag code) below before fulfilling',
            run: (r: GridRow[]) => runCommand('markOrderFulfilled', { orderId: r[0]?.orderId, tracking }, 'Mark order fulfilled')
          };
          const pickTable: StatusActionTable = {
            rules: [
              { when: 'open', primary: fulfillAct, tray: [] },
              { when: 'fulfilled', primary: null, tray: [] },
              // Catch-all: the verb stays reachable for unknown statuses.
              { when: () => true, primary: null, tray: [fulfillAct] }
            ]
          };
          return <StatusActionBar rows={rows} table={pickTable} busy={isRunning} />;
        } : undefined}
      />
      {canWrite && line ? (
        <div className="control-band fulfillment-pack-strip">
          <span className="selection-pill">{String(line.itemName ?? 'Selected line')} / {String(line.batchCode ?? 'batch')}</span>
          <label className="field-inline">
            Qty
            <input className="input compact" value={actualQty} onChange={(event) => setActualQty(event.target.value)} />
          </label>
          <label className="field-inline">
            Weight
            <input className="input compact" value={actualWeight} onChange={(event) => setActualWeight(event.target.value)} />
          </label>
          <label className="field-inline">
            Bag
            <input className="input compact" value={bagCode} onChange={(event) => setBagCode(event.target.value)} />
          </label>
          <label className="field-inline">
            Tracking
            <input className="input compact" value={tracking} onChange={(event) => setTracking(event.target.value)} />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!actualQty || !bagCode}
            title={!actualQty ? 'Enter actual quantity before packing' : !bagCode ? 'Enter a bag code before packing' : undefined}
            onClick={() =>
              runCommand(
                'recordWeighAndPack',
                {
                  fulfillmentLineId: line.id,
                  actualQty: actualQty ? Number(actualQty) : line.actualQty,
                  actualWeight: actualWeight ? Number(actualWeight) : line.actualWeight,
                  bagCode: bagCode || line.bagCode
                },
                'Record fulfillment line bagging'
              )
            }
          >
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Pack line
          </button>
        </div>
      ) : null}
      <OperatorGrid
        view="fulfillment"
        title="Fulfillment Lines"
        rows={(lines.data ?? []) as GridRow[]}
        columns={fulfillmentLineColumns}
        loading={lines.isLoading}
        onSelectionChange={setSelectedLines}
        emptyTitle={selectedPick ? 'No lines on this pick' : 'No pick selected'}
        emptyChildren={selectedPick ? 'Allocate an order to fulfillment to create pack lines.' : 'Select a fulfillment row to load pack lines.'}
        onCellCommit={canWrite ? (event) => {
          if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
          runCommand('adjustFulfillmentLine', { fulfillmentLineId: event.data.id, [event.colDef.field]: event.newValue }, `Inline fulfillment edit: ${event.colDef.field}`);
        } : undefined}
      />
      {/* CAP-030 / TER-1510 — Alerts drawer */}
      {canWrite && alertsDrawerOpen && alertsPickListId ? (
        <div ref={alertsRef} className="inline-panel border-t border-line">
          <div className="flex items-center justify-between">
            <h2 className="section-title">
              Warehouse Alerts
              {liveAlerts.length > 0 ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {liveAlerts.length}
                </span>
              ) : null}
            </h2>
            <button type="button" className="icon-button" onClick={() => setAlertsDrawerOpen(false)} aria-label="Close alerts panel">×</button>
          </div>
          {liveAlerts.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No alerts for this pick list.</p>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {liveAlerts.map((alert) => (
                <div key={alert.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-ink">{alert.itemName ?? alert.lineId}</span>
                      <span className="ml-2 text-xs text-zinc-500">{alert.batchCode}</span>
                      <p className="mt-0.5 text-xs text-zinc-600">{alert.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="secondary-button compact-action text-xs"
                        disabled={isRunning}
                        onClick={() => {
                          runCommand('acknowledgeWarehouseAlert', { fulfillmentLineId: alert.lineId, alertIndex: alert.alertIndex }, 'Acknowledge warehouse alert');
                        }}
                      >
                        Acknowledge
                      </button>
                      <div className="flex gap-1">
                        <input aria-label="Qty"
                          className="input compact w-16"
                          value={alertReturnQty}
                          inputMode="decimal"
                          placeholder="Qty"
                          min="0.001"
                          step="0.001"
                          type="number"
                          onChange={(e) => setAlertReturnQty(e.target.value)}
                        />
                        <button
                          type="button"
                          className="secondary-button compact-action text-xs"
                          disabled={isRunning || !alertReturnQty || Number(alertReturnQty) <= 0}
                          onClick={() => {
                            runCommand('returnPickedUnits', { fulfillmentLineId: alert.lineId, qty: Number(alertReturnQty) }, 'Return picked units');
                            setAlertReturnQty('');
                          }}
                        >
                          Return
                        </button>
                      </div>
                      <button
                        type="button"
                        className="secondary-button compact-action text-xs"
                        disabled={isRunning}
                        onClick={() => {
                          runCommand('cancelFulfillmentLine', { fulfillmentLineId: alert.lineId }, 'Cancel fulfillment line from alert');
                        }}
                      >
                        Mark cancelled
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Toggle alerts drawer when row has alerts */}
      {canWrite && selectedPick && Number(selectedPick.alertCount ?? 0) > 0 && !alertsDrawerOpen ? (
        <div className="control-band subtle-band">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAlertsDrawerOpen(true);
              setAlertsPickListId(String(selectedPick.id));
            }}
          >
            View {Number(selectedPick.alertCount)} alerts for {String(selectedPick.pickNo ?? 'this pick')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ConnectorsView() {
  const [operatorNotes, setOperatorNotes] = useState('');
  const [routedTo, setRoutedTo] = useState('');
  const selectedRows = useUiStore((state) => state.selectedRows.connectors);
  const selected = selectedRows?.[0];
  const isExternalSource = selected && !['internal', 'web', 'phone'].includes(String(selected.source ?? ''));
  return (
    <GridJourney
      view="connectors"
      title="Inbound Requests"
      prelude={() => (
        <>
          {/* CAP-017 / Phase 4 — persistent safety banner for external connector sources */}
          {isExternalSource ? (
            <div className="control-band subtle-band" role="alert">
              <span className="text-xs text-amber-700">
                ⚠ External connector request — verify source identity before routing or approving.
              </span>
            </div>
          ) : null}
          <div className="control-band">
            <label className="field-inline">
              Notes
              <input className="input compact" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} />
            </label>
            <label className="field-inline">
              Route to
              <input className="input compact" placeholder="team or person" value={routedTo} onChange={(event) => setRoutedTo(event.target.value)} />
            </label>
            <span className="selection-pill">{selected ? `${formatRequestSource(selected.source)} / ${formatRequestType(selected.requestType)}` : 'Select request'}</span>
          </div>
          {selected ? (
            <section className="inline-panel text-sm">
              <h2 className="section-title">Selected request</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <span>{formatRequestSource(selected.source)} / {formatRequestType(selected.requestType)}</span>
                <span>{String(selected.customer ?? 'No customer')}</span>
                <span>{String(selected.status ?? 'open')}</span>
              </div>
              <ConnectorTimeline selected={selected} />
            </section>
          ) : null}
        </>
      )}
      selectionActions={(rows, runCommand) => {
        // Spec §10.8 — status-aware actions for inbound requests. Real
        // connector_requests statuses are 'open' (initial) →
        // 'routed' | 'approved' | 'rejected' (verified in commandBus); the
        // spec's 'pending' initial state does not exist. Route remains the
        // primary verb per the later CAP-017 / Phase 4 decision (Approve and
        // Reject are secondary).
        const route = {
          key: 'route',
          label: 'Route',
          icon: <Truck className="h-4 w-4" aria-hidden="true" />,
          disabled: !routedTo.trim(),
          disabledReason: 'Enter a destination in "Route to" before routing',
          run: (r: GridRow[]) => runCommand('routeConnectorRequest', { requestId: r[0].id, routedTo: routedTo.trim(), operatorNotes }, 'Reassign inbound request')
        };
        const approve = { key: 'approve', label: 'Approve', icon: <Check className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('approveConnectorRequest', { requestId: r[0].id, operatorNotes }, 'Approve inbound request') };
        const reject = { key: 'reject', label: 'Reject', icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('rejectConnectorRequest', { requestId: r[0].id, operatorNotes }, 'Reject connector request') };
        const connectorTable: StatusActionTable = {
          rules: [
            { when: ['open', 'pending', 'pending_review'], primary: route, tray: [approve, reject] },
            { when: 'routed', primary: null, tray: [approve, reject] },
            { when: 'approved', primary: null, tray: [route, reject] },
            { when: 'rejected', primary: null, tray: [route, approve] },
            // Catch-all: all three verbs reachable for mixed/unknown states.
            { when: () => true, primary: null, tray: [route, approve, reject] }
          ]
        };
        return <StatusActionBar rows={rows} table={connectorTable} />;
      }}
    />
  );
}

function ConnectorTimeline({ selected }: { selected: GridRow }) {
  const history = normalizeReviewHistory(selected.reviewHistory);
  const steps = [
    { label: 'Received', detail: dateish(selected.createdAt), tone: 'done' },
    ...history.map((entry) => ({ label: labelFromToken(String(entry.status ?? 'reviewed')), detail: [entry.actorName, dateish(entry.at), entry.note].filter(Boolean).join(' · '), tone: entry.status === 'rejected' ? 'blocked' : 'done' })),
    { label: String(selected.status ?? 'open') === 'open' ? 'Waiting review' : 'Current status', detail: String(selected.status ?? 'open'), tone: String(selected.status ?? 'open') === 'rejected' ? 'blocked' : 'current' }
  ];
  return (
    <div className="connector-timeline" aria-label="Request review timeline">
      {steps.slice(0, 5).map((step, index) => (
        <div className="connector-timeline-step" key={`${step.label}-${index}`}>
          <span className={`timeline-dot timeline-dot-${step.tone}`} aria-hidden="true" />
          <strong>{step.label}</strong>
          <span>{step.detail || '-'}</span>
        </div>
      ))}
    </div>
  );
}

function normalizeReviewHistory(value: unknown): Array<{ status?: unknown; actorName?: unknown; at?: unknown; note?: unknown }> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [];
}

export function RecoveryView() {
  const selectedRecoveryRows = useUiStore((state) => state.selectedRows.recovery);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const rows = selectedRecoveryRows ?? EMPTY_ROWS;
  const { runCommand } = useCommandRunner();
  const navigate = useNavigate();
  const location = useLocation();
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  // True when rendered as the standalone /recovery route; false when embedded
  // inside SettingsView as the "Action log" tab.
  const isStandaloneRecovery = !location.pathname.startsWith('/settings');
  const [q, setQ] = useState('');
  const [adminTab, setAdminTab] = useState<'backup' | 'correction' | 'findreplace'>('backup');
  const [backupId, setBackupId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [replaceTable, setReplaceTable] = useState<'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests'>('batches');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const search = trpc.queries.recoverySearch.useQuery({ q });
  const reference = trpc.queries.reference.useQuery();
  const support = trpc.queries.supportPacket.useQuery(undefined, { enabled: false });
  const diff = trpc.queries.snapshotDiff.useQuery({ backupId: backupId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(backupId) });
  const findReplace = trpc.queries.findReplacePreview.useQuery(
    { table: replaceTable, find: findText || '___', replacement: replaceText },
    { enabled: Boolean(findText) }
  );
  const selected = rows[0];
  return (
    <div className="view-stack">
      {/* TER-1628 F-41: Recovery vs per-row Undo guidance (standalone Recovery route only) */}
      {isStandaloneRecovery ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="page-subtitle">
            Use this for bulk reversals or commands older than the last 30 days' log; for a single recent command use Undo from the Action Log.
          </p>
          <button
            type="button"
            className="text-button text-xs"
            onClick={() => { setActiveSettingsTab('actions'); navigate('/settings'); }}
          >
            → Action Log
          </button>
        </div>
      ) : null}
      <div className="control-band">
        <label className="field-inline">
          Search
          <input className="input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>

      </div>
      <WorkspacePanel panelId="recovery-admin-tools" title="Admin tools" headingLevel={2}>
        {/* Tab nav */}
        <div className="inspector-tabs border-b border-line mb-3" role="tablist" aria-label="Admin tool sections">
          {(['backup', 'correction', 'findreplace'] as const).map((tab) => {
            const labels = { backup: 'Backup & support', correction: 'Correction', findreplace: 'Find & replace' };
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={adminTab === tab}
                className={`inspector-tab${adminTab === tab ? ' active' : ''}`}
                tabIndex={adminTab === tab ? 0 : -1}
                onClick={() => setAdminTab(tab)}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Backup & support tab */}
        {adminTab === 'backup' && (
          <div role="tabpanel" aria-label="Backup and support" className="space-y-3 p-1">
            <div className="control-band subtle-band">
              <button className="secondary-button" type="button" onClick={() => support.refetch().then((result) => downloadJson('terp-agro-support-packet.json', result.data))}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Export support
              </button>
              <select aria-label="Backup id" className="select" value={backupId} onChange={(event) => setBackupId(event.target.value)}>
                <option value="">Backup preview</option>
                {reference.data?.backupSnapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.label}
                  </option>
                ))}
              </select>
              <button className="secondary-button" type="button" disabled={!backupId} onClick={() => runCommand('restoreFromBackupPoint', { backupId }, 'Read-only backup restore preview')}>
                Restore preview
              </button>
            </div>
            {diff.data ? (
              <div className="border border-line bg-white p-3">
                <h3 className="section-title mb-2">Snapshot diff</h3>
                <div className="grid gap-1 text-sm">
                  {diff.data.rows.map((row) => (
                    <div key={row.key} className="activity-row">
                      <span>{row.key}</span>
                      <span>backup {row.backup}</span>
                      <span>current {row.current}</span>
                      <span>delta {row.delta}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Correction tab */}
        {adminTab === 'correction' && (
          <div role="tabpanel" aria-label="Correction" className="control-band subtle-band">
            {/* K3/A9: explicit id+htmlFor so keyboard users know which input they are in */}
            <label className="field-inline" htmlFor="recovery-period">
              Period
              <input id="recovery-period" className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <label className="field-inline" htmlFor="recovery-amount">
              Amount
              <input id="recovery-amount" className="input compact" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="field-inline" htmlFor="recovery-memo">
              Memo
              <input id="recovery-memo" className="input" value={memo} onChange={(event) => setMemo(event.target.value)} />
            </label>
            <button className="secondary-button" type="button" disabled={!memo} onClick={() => runCommand('createCorrectionJournalEntry', { period, amount: Number(amount), memo }, 'Create manual correction')}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Correction
            </button>
          </div>
        )}

        {/* Find & replace tab */}
        {adminTab === 'findreplace' && (
          <div role="tabpanel" aria-label="Find and replace" className="space-y-3 p-1">
            <div className="control-band subtle-band">
              <label className="field-inline">
                Find in
                <select className="select compact" value={replaceTable} onChange={(event) => setReplaceTable(event.target.value as typeof replaceTable)}>
                  <option value="batches">Inventory Batches</option>
                  <option value="customers">Customers</option>
                  <option value="vendors">Vendors</option>
                  <option value="sales_orders">Sales Orders</option>
                  <option value="connector_requests">Inbound Requests</option>
                </select>
              </label>
              <label className="field-inline">
                Find value
                <input className="input compact" value={findText} onChange={(event) => setFindText(event.target.value)} />
              </label>
              <label className="field-inline">
                Replace with
                <input className="input compact" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
              </label>
              <label className="field-inline">
                Confirm
                <input className="input compact" value={replaceConfirm} placeholder="Type REPLACE" onChange={(event) => setReplaceConfirm(event.target.value)} />
              </label>
              <span className="selection-pill">{findReplace.data?.count ? `${findReplace.data.count} matching row(s)` : 'No matching rows'}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={!findText || !findReplace.data?.count || replaceConfirm !== 'REPLACE'}
                onClick={() =>
                  runCommand(
                    'createCorrectionJournalEntry',
                    {
                      period,
                      amount: 0,
                      memo: `Find and replace ${findText} -> ${replaceText} in ${replaceTable}`,
                      findReplace: { table: replaceTable, find: findText, replacement: replaceText }
                    },
                    'Action log find and replace with preview'
                  )
                }
              >
                Apply previewed replace
              </button>
            </div>
            {findReplace.data?.rows.length ? (
              <div className="inline-panel">
                <h3 className="section-title mb-2">Find / replace preview</h3>
                <div className="grid gap-2 text-xs">
                  {findReplace.data.rows.slice(0, 8).map((row) => (
                    <div key={row.id} className="border border-line bg-panel p-2">
                      <strong>{row.id}</strong>
                      {row.matches.map((match) => (
                        <div key={match.field} className="mt-1">
                          {match.field}: {String(match.before)} {'->'}  {String(match.after)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </WorkspacePanel>
      <OperatorGrid
        view="recovery"
        title="Action Log"
        rows={(search.data ?? []) as GridRow[]}
        columns={columnsByView.recovery ?? []}
        loading={search.isLoading}
        onSelectionChange={(selection) => setSelectedRows('recovery', selection)}
        emptyTitle="No recent actions"
        emptyChildren="Recent commands will appear here automatically. Use search when you need a specific row, person, or action."
        selectionActions={(rows) => {
          // Spec §10.9 — status table for the action log. Real command_journal
          // statuses are pending | ok | failed; "reversed" is ok +
          // reversedByCommandId set (verified in commandBus). Retry replays
          // the original command name with its stored input_payload. Reverse
          // is intentionally NOT a one-click primary here: reverseCommandById
          // is destructive and its designed home is the TER-1521 confirm-flow
          // reversal panel below the grid (spec §10.9 predates TER-1521).
          const allFailed = rows.every((row) => String(row.status ?? '') === 'failed');
          const retry = {
            key: 'retry',
            label: 'Retry',
            icon: <Send className="h-4 w-4" aria-hidden="true" />,
            disabled: !allFailed,
            disabledReason: 'Retry applies to failed commands only',
            run: (r: GridRow[]) => runCommand(String(r[0]?.commandName) as CommandName, payloadObject(r[0]?.inputPayload), 'Retry failed command')
          };
          const recoveryTable: StatusActionTable = {
            rules: [
              { when: 'failed', primary: retry, tray: [] },
              // ok rows: reversal runs through the confirm-flow panel below.
              { when: ['ok', 'pending'], primary: null, tray: [] },
              // Catch-all: Retry stays reachable (disabled-with-reason when
              // the selection is not all-failed).
              { when: () => true, primary: null, tray: [retry] }
            ]
          };
          return <StatusActionBar rows={rows} table={recoveryTable} />;
        }}
      />
      {/* CAP-009 / Phase 5 — reversal preview panel (CMD-RECOVERY TER-1521) */}
      {selected ? (
        <section className="inline-panel" data-testid="recovery-reversal-panel">
          {/* TER-1628 F-41: cross-link to Recovery when viewing from Settings > Action log */}
          {!isStandaloneRecovery ? (
            <p className="text-xs text-zinc-500">
              For bulk reversals →{' '}
              <button type="button" className="text-button text-xs" onClick={() => navigate('/recovery')}>
                Recovery
              </button>
            </p>
          ) : null}
          <CommandReversalTab commandId={String(selected.id)} />
        </section>
      ) : null}

    </div>
  );
}

export function PurchaseReceiptsView() {
  const grid = trpc.queries.grid.useQuery({ view: 'purchaseReceipts' });
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseReceipts);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedReceipt = selected[0];
  const lines = trpc.queries.purchaseReceiptLines.useQuery(
    { purchaseReceiptId: String(selectedReceipt?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedReceipt?.id) }
  );
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);

  return (
    <div className="view-stack">
      <OperatorGrid
        view="purchaseReceipts"
        title="Purchase Receipts"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.purchaseReceipts ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('purchaseReceipts', rows)}
      />
      {selectedReceipt ? (
        <>
          <section className="po-header-strip" aria-label="Selected receipt summary">
            <div>
              <div className="text-xs font-bold uppercase text-zinc-500">Selected Receipt</div>
              <div className="text-base font-semibold text-ink">{String(selectedReceipt.receiptNo ?? 'Purchase receipt')}</div>
            </div>
            <div className="po-header-facts">
              <span>{String(selectedReceipt.vendor ?? 'Vendor')}</span>
              <span>PO {String(selectedReceipt.poNo ?? '-')}</span>
              <span>{String(selectedReceipt.status ?? 'posted')}</span>
              <span>${moneyish(selectedReceipt.total)}</span>
            </div>
          </section>
          <OperatorGrid
            view="purchaseReceipts"
            title={`Receipt ${String(selectedReceipt.receiptNo ?? '')} Lines`}
            subtitle="Received line items"
            rows={(lines.data ?? []) as GridRow[]}
            columns={purchaseReceiptLineColumns}
            loading={lines.isLoading}
          />
        </>
      ) : null}
    </div>
  );
}

export function CloseoutView() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [adjustmentAmount, setAdjustmentAmount] = useState('0');
  const [adjustmentMemo, setAdjustmentMemo] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null);
  const preview = trpc.queries.closeoutPreview.useQuery({ period });
  const { runCommand, isRunning } = useCommandRunner();
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const controlTotals = preview.data?.controlTotals ?? {};
  const blockers = preview.data?.blockers ?? [];
  const openWorkCount = preview.data?.openWorkCount ?? preview.data?.unsafeRows ?? 0;
  const readiness = closeoutReadiness(preview.data?.locked, openWorkCount);
  const blockerRows = trpc.queries.closeoutBlockerRows.useQuery(
    { period, blockerId: expandedBlocker ?? '' },
    { enabled: Boolean(expandedBlocker) }
  );

  function openBlocker(blockerId?: string) {
    const target = blockerTarget(blockerId);
    if (target.settingsTab) setActiveSettingsTab(target.settingsTab);
    setGridFilter(target.filterView ?? target.view, target.filter);
    setActiveView(target.view);
  }

  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Period
          <input className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <span className="selection-pill">Open work: {openWorkCount}</span>
        <span className={`selection-pill ${readiness.tone}`}>{readiness.label}</span>
        <span className="text-sm text-zinc-700">Batches: {controlTotals.batches ?? 0}</span>
        <span className="text-sm text-zinc-700">Sales: {controlTotals.salesOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">POs: {controlTotals.purchaseOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">Commands: {controlTotals.commands ?? 0}</span>
        {(() => {
          // Spec §10.10 — status-aware primary for the closeout period. The
          // period is not a grid row, so the band feeds the same decision
          // engine a synthetic row (status: open | locked from
          // closeoutPreview). With open work the primary becomes the amber
          // "Fix unsafe rows (N)" warning-tone action; Lock and Archive stay
          // visible in the tray (disabled-with-reason) so no verb is lost.
          const fixUnsafe = {
            key: 'fix-unsafe',
            label: `Fix unsafe rows (${openWorkCount})`,
            tone: 'warning' as const,
            run: () => openBlocker(blockers[0]?.id)
          };
          const lock = (disabled: boolean) => ({
            key: 'lock',
            label: 'Lock period',
            disabled,
            disabledReason: 'Review open work before locking this period',
            run: () => runCommand('lockPeriod', { period }, 'Lock closeout period')
          });
          const archive = (disabled: boolean, reason: string) => ({
            key: 'archive',
            label: 'Archive',
            icon: <FileDown className="h-4 w-4" aria-hidden="true" />,
            disabled,
            disabledReason: reason,
            run: () => runCommand('archivePeriod', { period, verified: true }, 'Archive locked period')
          });
          const adjust = {
            key: 'adjust',
            label: showAdjustment ? 'Hide adjustment' : 'Adjustment',
            run: () => setShowAdjustment((value) => !value)
          };
          const closeoutTable: StatusActionTable = {
            rules: [
              { when: (row) => row.status === 'open' && openWorkCount > 0, primary: fixUnsafe, tray: [adjust, lock(true), archive(true, 'Lock the period first')] },
              { when: 'open', primary: lock(false), tray: [adjust, archive(true, 'Lock the period first')] },
              { when: (row) => row.status === 'locked' && openWorkCount > 0, primary: fixUnsafe, tray: [adjust, archive(true, 'Review open work before archiving')] },
              { when: 'locked', primary: archive(false, ''), tray: [adjust] },
              // Catch-all: every closeout verb stays reachable.
              { when: () => true, primary: null, tray: [fixUnsafe, lock(false), archive(false, ''), adjust] }
            ]
          };
          const periodRow: GridRow = { id: period, status: preview.data?.locked ? 'locked' : 'open' };
          return <StatusActionBar rows={[periodRow]} table={closeoutTable} busy={isRunning} />;
        })()}
      </div>
      {showAdjustment ? (
        <div className="control-band subtle-band">
          <label className="field-inline">
            Adj
            <input className="input compact" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
          </label>
          <label className="field-inline">
            Memo
            <input className="input" value={adjustmentMemo} onChange={(event) => setAdjustmentMemo(event.target.value)} />
          </label>
          <button className="secondary-button" type="button" disabled={!adjustmentMemo} onClick={() => runCommand('postPeriodAdjustments', { period, amount: Number(adjustmentAmount), memo: adjustmentMemo }, 'Post closeout adjustment')}>
          Post adjustment
          </button>
        </div>
      ) : null}
      <section className="inline-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Archive readiness</h2>
          </div>
          <span className={preview.data?.eligible ? 'selection-pill success' : 'selection-pill warning'}>{preview.data?.eligible ? 'Ready' : 'Open work'}</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(controlTotals).map(([key, value]) => (
            <div key={key} className="metric-mini">
              <span className="text-[11px] uppercase text-zinc-500">{key.replace(/([A-Z])/g, ' $1')}</span>
              <strong>{Number(value ?? 0).toLocaleString('en-US')}</strong>
            </div>
          ))}
        </div>
        {/* CAP-025 / Phase 5 — inline expandable blocker drilldown (TER-1504) */}
        {blockers.length ? (
          <div className="mt-3 grid gap-2 text-sm">
            {blockers.map((blocker) => {
              const isExpanded = expandedBlocker === String(blocker.id);
              const descriptions: Record<string, string> = {
                unsafeBatches: 'Intake lots still in draft or needs-fix state must be reviewed, posted, or deleted before the period can be archived.',
                unsafePurchaseOrders: 'Purchase orders that have not been fully received are still open. Receive, cancel, or defer them before archiving.',
                openConnectors: 'Inbound connector requests are awaiting review. Approve, reject, or route each one before archiving.',
                openFulfillment: 'Fulfillment picks are in open or packed state. Complete or cancel them before archiving.',
                failedCommands: 'Commands in the action log failed and have not been retried. Review each failure and retry or create a correction.',
                unresolvedDrafts: 'Sales orders are still in draft state. Confirm or cancel them before archiving.',
              };
              return (
                <div key={String(blocker.id)} className="border border-line rounded">
                  <button
                    type="button"
                    className="closeout-blocker-row w-full"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedBlocker(isExpanded ? null : String(blocker.id))}
                  >
                    <span className="font-medium text-ink">{String(blocker.label)}</span>
                    <div className="flex items-center gap-2">
                      <span className="selection-pill warning">{Number(blocker.count ?? 0).toLocaleString('en-US')}</span>
                      <span className="text-xs text-zinc-500" aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="border-t border-line bg-panel px-3 py-3" data-testid="blocker-drilldown">
                      <p className="text-xs text-zinc-600">{descriptions[String(blocker.id)] ?? 'Review open work before archiving.'}</p>
                      <div className="ml-2 mt-2 grid gap-1 text-xs border-l-2 border-amber-200 pl-3">
                        {blockerRows.isLoading ? (
                          <span className="text-zinc-400">Loading…</span>
                        ) : blockerRows.data?.rows.length ? (
                          blockerRows.data.rows.map((row) => (
                            <button
                              key={String(row.id)}
                              type="button"
                              className="activity-row text-left hover:bg-zinc-50 cursor-pointer"
                              onClick={() => { setExpandedBlocker(null); openBlocker(String(blocker.id)); }}
                            >
                              <span className="font-mono text-zinc-400">{String(row.id).slice(0, 8)}…</span>
                              <span className="truncate">{String(row.label)}</span>
                              <span className={String(row.status) === 'failed' ? 'text-red-600' : 'text-amber-700'}>{String(row.status)}</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-zinc-400">No rows returned.</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-button mt-2 text-xs"
                        onClick={() => { setExpandedBlocker(null); openBlocker(String(blocker.id)); }}
                      >
                        View all in {String(blocker.label).toLowerCase()} →
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
      <GridJourney view="closeout" title="Archive Runs" />
    </div>
  );
}

function closeoutReadiness(locked: unknown, openWorkCount: number) {
  if (openWorkCount > 0) return { label: 'Review open work', tone: 'warning' };
  if (locked) return { label: 'Ready to archive', tone: 'success' };
  return { label: 'Ready to lock', tone: 'success' };
}

function blockerTarget(blockerId?: string): { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' } {
  const map: Record<string, { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' }> = {
    unsafeBatches: { view: 'intake', filter: 'status:draft,needs_fix' },
    unsafePurchaseOrders: { view: 'purchaseOrders', filter: 'status:draft,approved,ordered,partially_received' },
    openConnectors: { view: 'settings', filterView: 'connectors', settingsTab: 'requests', filter: 'status:open,pending_review,approved,accepted,routed,posting,failed' },
    openFulfillment: { view: 'fulfillment', filter: 'status:open,packed' },
    failedCommands: { view: 'settings', filterView: 'recovery', settingsTab: 'actions', filter: 'failed' },
    unresolvedDrafts: { view: 'orders', filter: 'status:draft' }
  };
  return map[blockerId ?? ''] ?? { view: 'dashboard', filter: '' };
}

export function SettingsView() {
  const activeTab = useUiStore((state) => state.activeSettingsTab);
  const setActiveTab = useUiStore((state) => state.setActiveSettingsTab);
  const me = trpc.auth.me.useQuery();
  const isOwner = me.data?.role === 'owner';
  const isManager = me.data?.role === 'owner' || me.data?.role === 'manager';
  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'requests', label: 'Requests' },
    { key: 'actions', label: 'Action log' },
    { key: 'archive', label: 'Archive' },
    { key: 'strain-aliases', label: 'Strain aliases' },
    { key: 'pricing', label: 'Pricing' },
    ...(isManager ? [{ key: 'system' as SettingsTab, label: 'System' }] : []),
    ...(isOwner ? [{ key: 'credit-engine' as SettingsTab, label: 'Credit Engine' }] : [])
  ];
  const visibleTabKeys = new Set(tabs.map((t) => t.key));
  const effectiveTab = visibleTabKeys.has(activeTab) ? activeTab : tabs[0].key;
  const activeTabLabel = tabs.find((tab) => tab.key === effectiveTab)?.label ?? 'Settings';
  return (
    <div className="view-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{activeTabLabel}</h1>
          <p className="page-subtitle">System review, audit history, and archive controls for managers.</p>
        </div>
      </div>
      <div className="report-chip-row" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={effectiveTab === tab.key}
            className={effectiveTab === tab.key ? 'report-chip report-chip-active' : 'report-chip'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {effectiveTab === 'requests' ? <ConnectorsView /> : null}
      {effectiveTab === 'actions' ? <RecoveryView /> : null}
      {effectiveTab === 'archive' ? <CloseoutView /> : null}
      {effectiveTab === 'strain-aliases' ? <StrainAliasesPanel /> : null}
      {effectiveTab === 'pricing' ? <DefaultPricingPanel /> : null}
      {effectiveTab === 'system' ? <SystemSettingsPanel /> : null}
      {effectiveTab === 'credit-engine' ? <CreditEngineSettingsPanel /> : null}
    </div>
  );
}

export function InvoiceDisputesView() {
  const grid = trpc.queries.grid.useQuery({ view: 'disputes' });
  const selectedRows = useUiStore((state) => state.selectedRows.disputes);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedDispute = selected[0];
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canResolve = me.data?.role === 'owner' || me.data?.role === 'manager';

  // State for resolve/reject dialog (replaces native prompt())
  const [dialogMode, setDialogMode] = useState<'resolve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const dialogRef = useFocusTrap<HTMLDivElement>(dialogMode !== null, () => closeDialog());

  function closeDialog() {
    setDialogMode(null);
    setNote('');
  }

  async function handleConfirm() {
    if (!selectedDispute?.id) return;
    const trimmed = note.trim();
    const mode = dialogMode;
    closeDialog();
    if (mode === 'resolve') {
      await runCommand('resolveInvoiceDispute', { disputeId: selectedDispute.id, resolution: trimmed || undefined }, 'Resolve invoice dispute');
    } else if (mode === 'reject') {
      await runCommand('rejectInvoiceDispute', { disputeId: selectedDispute.id, reason: trimmed || undefined }, 'Reject invoice dispute');
    }
  }

  function handleResolve() {
    if (!selectedDispute?.id) return;
    setDialogMode('resolve');
    setNote('');
  }

  function handleReject() {
    if (!selectedDispute?.id) return;
    setDialogMode('reject');
    setNote('');
  }

  const dialogTitle = dialogMode === 'resolve' ? 'Resolve invoice dispute' : 'Reject invoice dispute';
  const dialogBodyLabel = dialogMode === 'resolve' ? 'Resolution note (optional)' : 'Rejection reason (optional)';
  const dialogConfirmLabel = dialogMode === 'resolve' ? 'Resolve' : 'Reject';

  return (
    <>
      <div className="view-stack">
      <OperatorGrid
        view="disputes"
        title="Invoice disputes"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.disputes ?? []}
        loading={grid.isLoading || isRunning}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('disputes', rows)}
        actions={
          canResolve && selectedDispute ? (
            <>
              <button
                className="primary-button compact-action"
                type="button"
                disabled={isRunning || String(selectedDispute.status ?? '') !== 'open'}
                onClick={handleResolve}
                title={String(selectedDispute.status ?? '') !== 'open' ? 'Only open disputes can be resolved' : 'Resolve this dispute'}
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Resolve
              </button>
              <button
                className="secondary-button compact-action"
                type="button"
                disabled={isRunning || String(selectedDispute.status ?? '') !== 'open'}
                onClick={handleReject}
                title={String(selectedDispute.status ?? '') !== 'open' ? 'Only open disputes can be rejected' : 'Reject this dispute'}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Reject
              </button>
            </>
          ) : null
        }
        emptyTitle="No disputes"
        emptyChildren="Invoice disputes are created from correction journal entries with an invoice reference."
      />
      {selectedDispute ? (
        <section className="inline-panel" aria-label="Dispute details">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="section-title">Dispute details</h2>
              <p className="text-xs text-zinc-600">Invoice {String(selectedDispute.invoiceNo ?? '')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div className="drawer-fact-row"><span>Invoice</span><strong>{String(selectedDispute.invoiceNo ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Customer</span><strong>{String(selectedDispute.customer ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Amount</span><strong>${moneyish(selectedDispute.invoiceAmount)}</strong></div>
            <div className="drawer-fact-row"><span>Invoice status</span><strong>{String(selectedDispute.invoiceStatus ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Dispute status</span><strong>{String(selectedDispute.status ?? '-')}</strong></div>
            <div className="drawer-fact-row"><span>Created</span><strong>{dateish(selectedDispute.createdAt)}</strong></div>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <span className="text-xs font-bold uppercase text-zinc-500">Reason</span>
              <p className="text-sm text-ink whitespace-pre-wrap">{String(selectedDispute.reason ?? 'No reason provided.')}</p>
            </div>
            {selectedDispute.resolution ? (
              <div>
                <span className="text-xs font-bold uppercase text-zinc-500">Resolution</span>
                <p className="text-sm text-ink whitespace-pre-wrap">{String(selectedDispute.resolution)}</p>
              </div>
             ) : null}
           </div>
         </section>
       ) : null}
     </div>
       {dialogMode && createPortal(
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeDialog} data-testid="dispute-dialog-backdrop">
           <div
             ref={dialogRef}
             role="dialog"
             aria-modal="true"
             aria-labelledby="dispute-dialog-title"
             className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
             onClick={(e) => e.stopPropagation()}
           >
             <h2 id="dispute-dialog-title" className="text-lg font-semibold text-zinc-900">{dialogTitle}</h2>
             <p className="mt-2 text-sm text-zinc-600">
               {dialogMode === 'resolve'
                 ? 'Record a resolution note for this dispute.'
                 : 'Provide a reason for rejecting this dispute.'}
             </p>
             <div className="mt-4">
               <label htmlFor="dispute-dialog-note" className="mb-1 block text-sm font-medium text-zinc-700">
                 {dialogBodyLabel}
               </label>
               <textarea
                 id="dispute-dialog-note"
                 value={note}
                 onChange={(e) => setNote(e.target.value)}
                 className="w-full rounded border border-zinc-300 px-3 py-2 text-sm resize-y min-h-[80px]"
                 placeholder={dialogMode === 'resolve' ? 'e.g., Resolved after customer review' : 'e.g., Insufficient evidence'}
                 rows={3}
                 autoFocus
               />
             </div>
             <div className="mt-4 flex flex-row-reverse gap-2">
               <button
                 type="button"
                 className={dialogMode === 'reject'
                   ? 'inline-flex h-8 items-center justify-center gap-2 border border-danger bg-danger px-3 text-sm font-medium text-white transition focus:outline-none focus-visible:shadow-focus hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'
                   : 'btn-primary'}
                 onClick={handleConfirm}
                 disabled={isRunning}
                 data-testid="dispute-dialog-confirm"
               >
                 {isRunning ? 'Processing...' : dialogConfirmLabel}
               </button>
               <button
                 type="button"
                 className="secondary-button compact-action"
                 onClick={closeDialog}
                 data-testid="dispute-dialog-cancel"
               >
                 Cancel
               </button>
             </div>
           </div>
         </div>,
         document.body
       )}
     </>
   );
 }

const strainAliasesColumns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Canonical name', pinned: 'left', minWidth: 220 },
  { field: 'category', width: 140 },
  { field: 'alias', headerName: 'Customer-facing alias', editable: true, minWidth: 240 },
  { field: 'sku', headerName: 'SKU', width: 160 }
];

function StrainAliasesPanel() {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canEdit = me.data?.role === 'owner' || me.data?.role === 'manager';
  const rows = ((reference.data?.items ?? []) as unknown as GridRow[]).map((row) => ({ ...row }));
  return (
    <section className="inline-panel" data-testid="strain-aliases-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Strain aliases</h2>
          <p className="text-xs text-zinc-600">
            Aliases replace the canonical strain name on customer-facing surfaces (inventory, sales lines, picks). Vendor and audit records keep the canonical name.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <OperatorGrid
          view="settings"
          title="Items"
          rows={rows}
          columns={strainAliasesColumns.map((col) => ({ ...col, editable: col.editable && canEdit }))}
          loading={reference.isLoading}
          onCellCommit={(event) => {
            if (event.colDef.field !== 'alias') return;
            const itemId = event.data?.id;
            if (!itemId) return;
            const next = typeof event.newValue === 'string' ? event.newValue.trim() : '';
            const prior = typeof event.oldValue === 'string' ? event.oldValue.trim() : '';
            if (next === prior) return;
            runCommand('setItemAlias', { itemId, alias: next }, next ? `Set alias to ${next}` : 'Clear strain alias');
          }}
        />
      </div>
    </section>
  );
}

function SystemSettingsPanel() {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const settings = reference.data?.systemSettings ?? [];
  // Per-row editing state: key -> edited value text
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  function startEditing(key: string, currentValue: Record<string, unknown>) {
    setEditingKey(key);
    setEditText(JSON.stringify(currentValue, null, 2));
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditText('');
  }

  async function saveSetting(key: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText);
    } catch (e) {
      return; // silently reject invalid JSON — validation will catch on blur
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    await runCommand('updateSystemSetting', { key, value: parsed }, `Update system setting "${key}"`);
    await reference.refetch();
    cancelEditing();
  }

  return (
    <section className="inline-panel" data-testid="system-settings-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">System settings</h2>
          <p className="text-xs text-zinc-600">
            Raw key-value configuration stored in the system_settings table. Values are JSON objects. Editing is restricted to managers and above.
          </p>
        </div>
      </div>
      {reference.isLoading ? (
        <div className="mt-3 text-sm text-zinc-600">Loading system settings...</div>
      ) : settings.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-500">No system settings configured.</div>
      ) : (
        <div className="mt-3">
          <table className="finder-table">
            <thead>
              <tr>
                <th style={{ width: 260 }}>Key</th>
                <th>Value</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => {
                const isEditing = editingKey === s.key;
                const valuePreview = JSON.stringify(s.value);
                return (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.key}</td>
                    <td>
                      {isEditing ? (
                        <textarea aria-label="Edit text"
                          className="input w-full"
                          rows={Math.max(3, editText.split('\n').length)}
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                      ) : (
                        <code className="text-xs bg-zinc-100 rounded px-1 py-0.5 block max-w-[400px] truncate" title={valuePreview}>
                          {valuePreview}
                        </code>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="primary-button compact-action"
                              disabled={isRunning}
                              onClick={() => saveSetting(s.key)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={cancelEditing}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button compact-action"
                            onClick={() => startEditing(s.key, s.value)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function changedFieldsSummary(pre: Record<string, unknown>, post: Record<string, unknown>): string {
  const keys = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(pre[key]) !== JSON.stringify(post[key])) {
      changed.push(key === 'globalDefaultStanceId' ? 'defaultStance' : key);
    }
  }
  return changed.length > 0 ? changed.join(', ') : '(no changes)';
}

function CreditEngineSettingsPanel() {
  const { data, isLoading } = trpc.credit.creditEngineStances.useQuery();
  const configHistory = trpc.credit.creditEngineConfigHistory.useQuery();
  const stanceHistory = trpc.credit.creditEngineStanceHistory.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const [stanceId, setStanceId] = useState('');
  const [coldStartInvoices, setColdStartInvoices] = useState('');
  const [coldStartTenure, setColdStartTenure] = useState('');
  const [reminderDays, setReminderDays] = useState('');
  const [snoozeCapDays, setSnoozeCapDays] = useState('');
  const [shadowMode, setShadowMode] = useState(false);

  useEffect(() => {
    if (!data) return;
    setStanceId(data.config.globalDefaultStanceId);
    setColdStartInvoices(String(data.config.coldStartMinPostedInvoices));
    setColdStartTenure(String(data.config.coldStartMinTenureDays));
    setReminderDays(String(data.config.manualOverrideReminderDefaultDays));
    setSnoozeCapDays(String(data.config.manualOverrideSnoozeCapDays));
    setShadowMode(data.config.shadowMode);
  }, [data]);

  const shadowDisabled = data?.config.shadowMode === false;

  async function handleSave() {
    const payload: Record<string, unknown> = {};
    if (stanceId) payload.globalDefaultStanceId = stanceId;
    if (coldStartInvoices !== '') payload.coldStartMinPostedInvoices = Number(coldStartInvoices);
    if (coldStartTenure !== '') payload.coldStartMinTenureDays = Number(coldStartTenure);
    if (reminderDays !== '') payload.manualOverrideReminderDefaultDays = Number(reminderDays);
    if (snoozeCapDays !== '') payload.manualOverrideSnoozeCapDays = Number(snoozeCapDays);
    payload.shadowMode = shadowMode;
    await runCommand('setCreditEngineConfig', payload, 'Update credit engine settings');
    configHistory.refetch();
  }

  return (
    <section className="inline-panel" data-testid="credit-engine-settings-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Credit Engine Settings</h2>
          <p className="text-xs text-zinc-600">Global config and read-only stance overview.</p>
        </div>
      </div>
      {isLoading ? (
        <div className="mt-3 text-sm text-zinc-600">Loading engine config...</div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="field-inline">
              Default stance
              <select className="select" value={stanceId} onChange={(e) => setStanceId(e.target.value)}>
                <option value="">Select stance</option>
                {data?.stances.map((stance) => (
                  <option key={stance.id} value={stance.id}>
                    {stance.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              Cold-start invoices
              <input className="input compact" type="number" min="0" value={coldStartInvoices} onChange={(e) => setColdStartInvoices(e.target.value)} />
            </label>
            <label className="field-inline">
              Cold-start tenure (days)
              <input className="input compact" type="number" min="0" value={coldStartTenure} onChange={(e) => setColdStartTenure(e.target.value)} />
            </label>
            <label className="field-inline">
              Reminder days
              <input className="input compact" type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
            </label>
            <label className="field-inline">
              Snooze cap (days)
              <input className="input compact" type="number" min="0" value={snoozeCapDays} onChange={(e) => setSnoozeCapDays(e.target.value)} />
            </label>
            <label className="field-inline flex items-center gap-2">
              <input type="checkbox" checked={shadowMode} disabled={shadowDisabled} onChange={(e) => setShadowMode(e.target.checked)} />
              <span>Shadow mode</span>
              {shadowDisabled ? <span className="text-xs text-zinc-500">Cannot re-enable once disabled</span> : null}
            </label>
          </div>
          <div className="mt-3">
            <button className="primary-button" type="button" disabled={isRunning} onClick={handleSave}>
              Save settings
            </button>
          </div>
          <div className="mt-6">
            <h3 className="section-title">Stances</h3>
            <p className="text-xs text-zinc-600 mb-2">Stance create/edit is command-backed follow-up work.</p>
            <div className="finder-table-wrap">
              <table className="finder-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Weights</th>
                    <th>Customers</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.stances.map((stance) => (
                    <tr key={stance.id}>
                      <td>{stance.name}</td>
                      <td>{stance.description ?? '-'}</td>
                      <td>{formatWeightsSummary(stance.weights)}</td>
                      <td>{stance.customerCount}</td>
                      <td>{stance.isSeeded ? 'Seeded' : 'Custom'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Config Change History — TER-1648 */}
          <div className="mt-6">
            <h3 className="section-title">Config Change History</h3>
            <p className="text-xs text-zinc-600 mb-2">Every config update is appended here (read-only).</p>
            {configHistory.isLoading ? (
              <div className="text-sm text-zinc-600">Loading history...</div>
            ) : configHistory.data && configHistory.data.length > 0 ? (
              <div className="finder-table-wrap">
                <table className="finder-table" data-testid="credit-engine-config-history">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Changed by</th>
                      <th>Changed fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configHistory.data.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.changedAt).toLocaleString('en-US')}</td>
                        <td>{entry.changedByName || entry.changedByEmail}</td>
                        <td>{changedFieldsSummary(entry.preState as Record<string, unknown>, entry.postState as Record<string, unknown>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No config changes recorded yet.</div>
            )}
          </div>

          {/* Stance Change History — TER-1648 */}
          <div className="mt-6">
            <h3 className="section-title">Stance Change History</h3>
            <p className="text-xs text-zinc-600 mb-2">Every stance create, update, and delete is appended here (read-only).</p>
            {stanceHistory.isLoading ? (
              <div className="text-sm text-zinc-600">Loading history...</div>
            ) : stanceHistory.data && stanceHistory.data.length > 0 ? (
              <div className="finder-table-wrap">
                <table className="finder-table" data-testid="credit-engine-stance-history">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Stance</th>
                      <th>Action</th>
                      <th>Changed by</th>
                      <th>Affected customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stanceHistory.data.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.changedAt).toLocaleString('en-US')}</td>
                        <td>{entry.stanceName}</td>
                        <td className="font-mono text-xs">{entry.action}</td>
                        <td>{entry.changedByName || entry.changedByEmail}</td>
                        <td>{entry.affectedCustomerCount ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No stance changes recorded yet.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GridJourney({
  view,
  title,
  actions,
  prelude,
  onCellCommit,
  expansionConfig,
  columns,
  selectionActions,
  inspectorTabs
}: {
  view: Exclude<ViewKey, 'dashboard' | 'intake' | 'sales' | 'reports' | 'settings' | 'credit-review' | 'pick' | 'contacts' | 'contacts-customer-orders'>;
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
  columns?: ColDef<GridRow>[];
  selectionActions?: (rows: GridRow[], runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => React.ReactNode;
  inspectorTabs?: (row: GridRow) => InspectorTab[];
}) {
  const grid = trpc.queries.grid.useQuery({ view });
  const selectedRows = useUiStore((state) => state.selectedRows[view]);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  return (
    <div className="view-stack">
      {canWrite ? prelude?.(runCommand) : null}
      <OperatorGrid
        view={view}
        title={title}
        rows={(grid.data ?? []) as GridRow[]}
        columns={columns ?? columnsByView[view] ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows(view, rows)}
        onCellCommit={(event) => onCellCommit?.(event, runCommand)}
        actions={canWrite ? actions?.(selected, runCommand) : null}
        selectionActions={canWrite && selectionActions ? (rows) => selectionActions(rows, runCommand) : undefined}
        inspectorTabs={inspectorTabs}
        expansionConfig={canWrite ? expansionConfig : undefined}
      />
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  if (!value) return;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function payloadObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

function formatRequestType(value: unknown) {
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

function formatRequestSource(value: unknown) {
  const raw = String(value ?? '');
  const labels: Record<string, string> = {
    vip: 'VIP customer',
    'live-shopping': 'Live order',
    'mobile-scan': 'Warehouse scan'
  };
  return labels[raw] ?? labelFromToken(raw);
}

function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PoSignalsSection({
  inventory,
  pricing
}: {
  inventory: Array<{ category: string; subcategory: string | null; availableQty: string; batchCount: string; uom: string | null }>;
  pricing: Array<{ category: string; subcategory: string | null; avgCost: string; minCost: string; maxCost: string; poCount: number; lastPoDate: string | null }>;
}) {
  const pricingMap = new Map(pricing.map((p) => [`${p.category}|${p.subcategory ?? ''}`, p]));
  if (!inventory.length) return null;
  return (
    <>
      <h3 className="section-title mt-4">Market signals</h3>
      <div className="po-context-list">
        {inventory.map((row) => {
          const qty = Number(row.availableQty ?? 0);
          const isOut = qty === 0;
          const price = pricingMap.get(`${row.category}|${row.subcategory ?? ''}`);
          return (
            <div
              key={`${row.category}|${row.subcategory ?? ''}`}
              className="flex items-center justify-between gap-2 border border-line bg-white px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate font-medium text-ink">{row.subcategory ?? row.category}</span>
              <span className={isOut ? 'font-semibold text-red-600' : 'text-zinc-500'}>
                {isOut ? 'OUT' : `${moneyish(qty)} ${row.uom ?? ''}`}
              </span>
              <span className="text-right text-zinc-500">
                {price ? `$${moneyish(price.avgCost)}${price.poCount > 1 ? ` (${String(price.poCount)} POs)` : ''}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US');
}
