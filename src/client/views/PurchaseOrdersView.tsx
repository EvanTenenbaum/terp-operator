import { ClipboardList, PackagePlus, Plus } from 'lucide-react';
import { useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { GridView } from '../templates/GridView';
import { OperatorGrid } from '../components/OperatorGrid';
import { RecordPrepaymentDialog } from '../components/RecordPrepaymentDialog';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { AddRefereeRelationshipDrawer } from '../components/AddRefereeRelationshipDrawer';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { ReceiptPreviewOverlay } from '../components/ReceiptPreviewOverlay';
import type { GridRow } from '../../shared/types';
import { parseTagInput } from '../../shared/tags';
import { PAYMENT_TERMS_OPTIONS } from '../../shared/paymentTerms';
import { dateish, moneyish } from './operations/shared';

// ── Typed interfaces for reference query results ────────────────────────────
interface RefereeRelationshipRow {
  id: string;
  refereeId: string;
  refereeName: string;
  entityType: string;
  entityId: string;
  entityName: string;
  feeType: string;
  feePercentage: number | null;
  feeFixedAmount: number | null;
  applyByDefault: boolean;
  active: boolean;
}

interface RefereeRow {
  id: string;
  name: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PO LINE COLUMNS (preserved export — used by authoring workspace + tests)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// PARTIAL RECEIVING HELPERS (preserved exports — used by tests)
// ═══════════════════════════════════════════════════════════════════════════════

/** PO statuses the server's receivePurchaseOrder command accepts. */
export const PO_RECEIVABLE_STATUSES = ['approved', 'ordered', 'partially_received'];

export function isPoReceivableStatus(status: unknown): boolean {
  return PO_RECEIVABLE_STATUSES.includes(String(status ?? ''));
}

/** Outstanding (not-yet-received) qty on a PO line: ordered − received, floored at 0. */
export function poLineOutstandingQty(row: GridRow): number {
  const outstanding = Number(row.qty ?? 0) - Number(row.receivedQty ?? 0);
  return outstanding > 0 ? Number(outstanding.toFixed(3)) : 0;
}

/**
 * Build the receivePurchaseOrder `lineQuantities` payload from the selected
 * lines + per-line operator overrides. Default = outstanding qty; overrides
 * are clamped to outstanding; lines with nothing outstanding are skipped.
 */
export function buildReceiveLineQuantities(lines: GridRow[], overrides: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of lines) {
    const id = String(line.id ?? '');
    if (!id) continue;
    const outstanding = poLineOutstandingQty(line);
    if (outstanding <= 0) continue;
    const override = overrides[id];
    const qty = Number.isFinite(override) && override > 0 ? Math.min(override, outstanding) : outstanding;
    result[id] = Number(qty.toFixed(3));
  }
  return result;
}

/**
 * Line-grid columns for a selected PO: when the PO is receivable the editable
 * "Receive qty" column is inserted ahead of the read-only Received column.
 */
export function purchaseOrderLineColumnsFor(poStatus: unknown): ColDef<GridRow>[] {
  if (!isPoReceivableStatus(poStatus)) return purchaseOrderLineColumns;
  const receiveQtyColumn: ColDef<GridRow> = {
    field: 'receiveQty',
    headerName: 'Receive qty',
    editable: true,
    type: 'numericColumn',
    width: 125,
    headerTooltip: 'Qty to receive now (defaults to outstanding). Used by "Receive selected qty".'
  };
  const columns = [...purchaseOrderLineColumns];
  const receivedIndex = columns.findIndex((column) => column.field === 'receivedQty');
  columns.splice(receivedIndex === -1 ? columns.length : receivedIndex, 0, receiveQtyColumn);
  return columns;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB REGISTRATION for DetailSlideover
// ═══════════════════════════════════════════════════════════════════════════════

import { registerPurchaseOrderTabs } from '../components/tabs/registerPoTabs';
registerPurchaseOrderTabs();

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function PurchaseOrdersView() {
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseOrders);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const pushToast = useUiStore((state) => state.pushToast);
  const selected = selectedRows ?? [];
  const selectedPo = selected[0];
  const lines = trpc.queries.purchaseOrderLines.useQuery(
    { purchaseOrderId: String(selectedPo?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedPo?.id) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canApprove = me.data?.role === 'owner' || me.data?.role === 'manager';

  // ── Authoring workspace state ─────────────────────────────────────────────
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [externalNotes, setExternalNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('consignment');
  const [prepaymentAmount, setPrepaymentAmount] = useState('0');
  const [draftLines, setDraftLines] = useState<GridRow[]>(Array.from({ length: 10 }, () => makePoDraftLine()));
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorTerms, setNewVendorTerms] = useState('14');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorNotes, setNewVendorNotes] = useState('');
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  const [addRefereeOpen, setAddRefereeOpen] = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [prepaymentDialogOpen, setPrepaymentDialogOpen] = useState(false);
  const [receiptOverlayOpen, setReceiptOverlayOpen] = useState(false);

  // ── Selected PO detail state ──────────────────────────────────────────────
  const [linesExpanded, setLinesExpanded] = useState(false);
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [receiveQtyByLine, setReceiveQtyByLine] = useState<Record<string, number>>({});

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

  // ── Authoring workspace helpers ───────────────────────────────────────────

  function openAuthoringWorkspace() {
    setAuthoringOpen(true);
    setSelectedRows('purchaseOrders', []);
    setDraftLines((rows) => rows.length ? rows : Array.from({ length: 10 }, () => makePoDraftLine()));
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

  async function updateLineCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    const field = String(event.colDef.field);
    if (field === 'receiveQty') {
      const lineId = String(event.data.id);
      const requested = Number(event.newValue);
      const outstanding = poLineOutstandingQty(event.data);
      if (!Number.isFinite(requested) || requested <= 0) {
        pushToast('Receive qty must be a positive number.', 'error');
        return;
      }
      if (requested > outstanding) {
        pushToast(`Receive qty ${requested} exceeds the line's outstanding ${outstanding}.`, 'error');
        return;
      }
      setReceiveQtyByLine((current) => ({ ...current, [lineId]: requested }));
      return;
    }
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* ── "New PO" button ──────────────────────────────────────────────── */}
      {canWrite && (
        <div className="control-band">
          <button className="primary-button" type="button" disabled={isRunning} onClick={openAuthoringWorkspace}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            New PO
          </button>
        </div>
      )}

      {/* ── Authoring workspace ──────────────────────────────────────────── */}
      {authoringOpen && (
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
                <select className="select" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
                  <option value="">Choose vendor</option>
                  {reference.data?.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </label>
              <button className="secondary-button compact-action" type="button" onClick={() => setNewVendorOpen((value) => !value)} aria-expanded={newVendorOpen}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add new vendor
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
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              {paymentTerms === 'prepayment' && (
                <label className="field-inline">
                  Prepayment amount
                  <input className="input compact" type="number" min="0" step="0.01" value={prepaymentAmount} onChange={(event) => setPrepaymentAmount(event.target.value)} />
                </label>
              )}
              <label className="field-inline">
                Referee credit (optional)
                <select className="select" value={refereeRelationshipId} onChange={(event) => setRefereeRelationshipId(event.target.value)}>
                  <option value="">No referee credit</option>
                  {(reference.data?.refereeRelationships ?? [])
                    .filter((rel: RefereeRelationshipRow) => rel.entityType === 'vendor' && rel.entityId === defaultVendorId)
                    .map((rel: RefereeRelationshipRow) => (
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
                <Plus className="h-4 w-4" aria-hidden="true" /> Add referee
              </button>
            </div>
            {newVendorOpen && (
              <div className="po-context-panel" role="region" aria-label="Add new vendor drawer">
                <div className="mb-2 text-sm font-semibold text-ink">Add new vendor</div>
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="field-inline">Name <input className="input" value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} /></label>
                  <label className="field-inline">Terms <input className="input compact" inputMode="numeric" value={newVendorTerms} onChange={(event) => setNewVendorTerms(event.target.value)} /></label>
                  <label className="field-inline">Contact <input className="input" value={newVendorContact} onChange={(event) => setNewVendorContact(event.target.value)} /></label>
                  <label className="field-inline">Notes <input className="input" value={newVendorNotes} onChange={(event) => setNewVendorNotes(event.target.value)} /></label>
                </div>
                <button className="primary-button mt-2" type="button" disabled={!newVendorName.trim() || isRunning} onClick={saveNewVendor}>Save vendor</button>
              </div>
            )}
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
                  {approvalLineIssues.length > 0 && <span className="selection-pill danger">{approvalLineIssues.length} filled line needs units and cost (fixed or range).</span>}
                  <button className="secondary-button compact-action" type="button" onClick={() => addDraftLine()}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add line row
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
              {approvalLineIssues.length > 0 && <span className="po-total-warning">{approvalLineIssues.length} filled line needs units and cost (fixed or range).</span>}
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
            {defaultVendorId && (
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
            )}
            {contextSignals.data ? (
              <PoSignalsSection inventory={contextSignals.data.inventory} pricing={contextSignals.data.pricing} />
            ) : contextSignals.isLoading ? (
              <div className="drawer-empty mt-4 text-xs">Loading market signals…</div>
            ) : null}
          </aside>
        </section>
      )}

      {/* ── Main grid — GridView template handles column defs, filtering, bulk actions, slide-over ── */}
      <div className="flex-1 min-h-0">
        <GridView viewKey="purchaseOrders" entityType="purchaseOrder" />
      </div>

      {/* ── Selected PO detail (below main grid) ──────────────────────────── */}
      {selectedPo && (
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
            {selectedPoStatus === 'finalized' && (
              <button type="button" className="secondary-button compact-action" onClick={() => setReceiptOverlayOpen(true)}>
                Preview receipt
              </button>
            )}
            <button type="button" className="secondary-button compact-action" onClick={() => setLinesExpanded((prev) => !prev)}>
              {linesExpanded ? 'Hide lines' : 'Show lines'}
            </button>
          </section>

          {receiptOverlayOpen && selectedPo?.id && (
            <ReceiptPreviewOverlay purchaseOrderId={String(selectedPo.id)} onClose={() => setReceiptOverlayOpen(false)} />
          )}

          {['finalized', 'approved', 'ordered', 'partially_received', 'received'].includes(selectedPoStatus) && (
            <ReceiptPanel purchaseOrderId={String(selectedPo.id)} />
          )}

          {linesExpanded && (
            <OperatorGrid
              view="purchaseOrders"
              title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
              subtitle="Procurement cost lines"
              rows={
                isPoReceivableStatus(selectedPoStatus)
                  ? ((lines.data ?? []) as GridRow[]).map((row) => ({
                      ...row,
                      receiveQty: receiveQtyByLine[String(row.id)] ?? poLineOutstandingQty(row)
                    }))
                  : ((lines.data ?? []) as GridRow[])
              }
              columns={purchaseOrderLineColumnsFor(selectedPoStatus)}
              loading={lines.isLoading || isRunning}
              onSelectionChange={setSelectedLines}
              onCellCommit={canWrite ? updateLineCell : undefined}
              actions={
                canWrite && (
                  <>
                    <button
                      className="primary-button"
                      disabled={!selectedLines.length || isRunning}
                      title={!selectedLines.length ? 'Select one or more PO lines first' : undefined}
                      onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo?.id ?? '', lineIds: selectedLines.map((line) => line.id) }, 'Receive selected PO lines to intake')}
                      type="button"
                    >
                      <PackagePlus className="h-4 w-4" aria-hidden="true" /> Draft selected lines
                    </button>
                  </>
                )
              }
            />
          )}
        </>
      )}

      {/* ── Modals and overlays ───────────────────────────────────────────── */}
      {prepaymentDialogOpen && selectedPo && (
        <RecordPrepaymentDialog
          purchaseOrderId={String(selectedPo.id)}
          poNo={String(selectedPo.poNo ?? '')}
          maxAmount={Number(selectedPo.prepaymentAmount ?? 0)}
          onClose={() => setPrepaymentDialogOpen(false)}
        />
      )}

      {addRefereeOpen && (
        <AddRefereeRelationshipDrawer
          isOpen={addRefereeOpen}
          vendorId={defaultVendorId}
          vendorName={selectedVendor?.name ?? ''}
          referees={(reference.data?.referees ?? []).map((r: RefereeRow) => ({ id: r.id, name: r.name }))}
          onSuccess={async (newRelationshipId) => {
            await reference.refetch();
            setRefereeRelationshipId(newRelationshipId);
            setAddRefereeOpen(false);
          }}
          onClose={() => setAddRefereeOpen(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
                {isOut ? 'OUT' : `${moneyish(qty)} ${row.uom ?? ''}`}
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
