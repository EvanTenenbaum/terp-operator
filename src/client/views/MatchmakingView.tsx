import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { parseTagInput } from '../../shared/tags';

const needColumns: ColDef<GridRow>[] = [
  { field: 'needCode', headerName: 'Need', pinned: 'left', width: 150 },
  { field: 'customer', width: 180 },
  { field: 'productName', headerName: 'Request', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'tags', editable: true, minWidth: 170 },
  { field: 'qtyMin', headerName: 'Min qty', editable: true, type: 'numericColumn', width: 115 },
  { field: 'qtyMax', headerName: 'Max qty', editable: true, type: 'numericColumn', width: 115 },
  { field: 'targetPrice', headerName: 'Target', editable: true, type: 'numericColumn', width: 110 },
  { field: 'neededBy', headerName: 'Needed by', editable: true, width: 150 },
  { field: 'urgency', editable: true, width: 110 },
  { field: 'notes', editable: true, minWidth: 220 },
  { field: 'status', width: 125 }
];

const supplyColumns: ColDef<GridRow>[] = [
  { field: 'supplyCode', headerName: 'Stock', pinned: 'left', width: 150 },
  { field: 'vendor', width: 180 },
  { field: 'productName', headerName: 'Product', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'tags', editable: true, minWidth: 170 },
  { field: 'availableQty', headerName: 'Avail', editable: true, type: 'numericColumn', width: 115 },
  { field: 'askingPrice', headerName: 'Ask', editable: true, type: 'numericColumn', width: 110 },
  { field: 'availableDate', headerName: 'Available', editable: true, width: 150 },
  { field: 'location', editable: true, width: 140 },
  { field: 'grade', editable: true, width: 105 },
  { field: 'terms', editable: true, minWidth: 150 },
  { field: 'notes', editable: true, minWidth: 220 },
  { field: 'status', width: 135 }
];

const matchColumns: ColDef<GridRow>[] = [
  { field: 'score', pinned: 'left', type: 'numericColumn', width: 90 },
  { field: 'customer', width: 170 },
  { field: 'needProduct', headerName: 'Need', minWidth: 190 },
  { field: 'category', width: 120 },
  { field: 'vendor', width: 170 },
  { field: 'vendorProduct', headerName: 'Vendor stock', minWidth: 190 },
  { field: 'qtyMin', headerName: 'Need qty', type: 'numericColumn', width: 115 },
  { field: 'availableQty', headerName: 'Avail', type: 'numericColumn', width: 110 },
  { field: 'targetPrice', headerName: 'Target', type: 'numericColumn', width: 110 },
  { field: 'askingPrice', headerName: 'Ask', type: 'numericColumn', width: 110 },
  { field: 'reasons', minWidth: 260 },
  { field: 'status', width: 125 }
];

export function MatchmakingView() {
  const reference = trpc.queries.reference.useQuery();
  const board = trpc.queries.matchmakingBoard.useQuery();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const { runCommand, isRunning } = useCommandRunner();
  const needProductRef = useRef<HTMLInputElement | null>(null);
  const supplyProductRef = useRef<HTMLInputElement | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<GridRow[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [needProduct, setNeedProduct] = useState('Premium indoor flower');
  const [needCategory, setNeedCategory] = useState('Flower');
  const [needTags, setNeedTags] = useState('premium, flower');
  const [qtyMin, setQtyMin] = useState('10');
  const [qtyMax, setQtyMax] = useState('40');
  const [targetPrice, setTargetPrice] = useState('1050');
  const [neededBy, setNeededBy] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [needNotes, setNeedNotes] = useState('');

  const [vendorId, setVendorId] = useState('');
  const [supplyProduct, setSupplyProduct] = useState('Indoor Gelato smalls');
  const [supplyCategory, setSupplyCategory] = useState('Flower');
  const [supplyTags, setSupplyTags] = useState('premium, flower');
  const [availableQty, setAvailableQty] = useState('20');
  const [askingPrice, setAskingPrice] = useState('980');
  const [availableDate, setAvailableDate] = useState('');
  const [location, setLocation] = useState('');
  const [grade, setGrade] = useState('');
  const [terms, setTerms] = useState('');
  const [supplyNotes, setSupplyNotes] = useState('');

  const defaultCustomerId = customerId || reference.data?.customers[0]?.id || '';
  const defaultVendorId = vendorId || reference.data?.vendors[0]?.id || '';

  useEffect(() => {
    if (activeQuickLaunch === 'customerNeed') needProductRef.current?.focus();
    if (activeQuickLaunch === 'vendorSupply') supplyProductRef.current?.focus();
  }, [activeQuickLaunch]);

  async function createNeed() {
    await runCommand(
      'createCustomerNeed',
      {
        customerId: defaultCustomerId,
        productName: needProduct,
        category: needCategory,
        tags: parseTagInput(needTags),
        qtyMin: Number(qtyMin),
        qtyMax: qtyMax ? Number(qtyMax) : undefined,
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        neededBy: neededBy || undefined,
        urgency,
        notes: needNotes
      },
      'Add customer need from matchmaking'
    );
    setNeedNotes('');
  }

  async function createSupply() {
    await runCommand(
      'createVendorSupply',
      {
        vendorId: defaultVendorId,
        productName: supplyProduct,
        category: supplyCategory,
        tags: parseTagInput(supplyTags),
        availableQty: Number(availableQty),
        askingPrice: askingPrice ? Number(askingPrice) : undefined,
        availableDate: availableDate || undefined,
        location,
        grade,
        terms,
        notes: supplyNotes
      },
      'Add vendor stock from matchmaking'
    );
    setSupplyNotes('');
  }

  async function updateNeedCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateCustomerNeed', { customerNeedId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline customer need edit: ${event.colDef.field}`);
  }

  async function updateSupplyCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateVendorSupply', { vendorSupplyId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline vendor stock edit: ${event.colDef.field}`);
  }

  async function acceptSelected() {
    for (const row of selectedMatches) await runCommand('acceptMatchmakingMatch', { matchId: row.id }, 'Accept matchmaking row');
  }

  async function dismissSelected() {
    for (const row of selectedMatches) await runCommand('dismissMatchmakingMatch', { matchId: row.id }, 'Dismiss matchmaking row');
  }

  return (
    <div className="view-stack">
      {canWrite ? (
        <WorkspacePanel panelId="matchmaking:entry" title="Matchmaking Entry" contentClassName="p-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="control-band subtle-band">
              <label className="field-inline">
                Customer
                <select className="select" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Default customer</option>
                  {reference.data?.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-inline grow">
                Need
                <input ref={needProductRef} className="input" value={needProduct} onChange={(event) => setNeedProduct(event.target.value)} />
              </label>
              <label className="field-inline">
                Category
                <select className="select compact" value={needCategory} onChange={(event) => setNeedCategory(event.target.value)}>
                  {reference.data?.categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="field-inline grow">
                Tags
                <input className="input" value={needTags} onChange={(event) => setNeedTags(event.target.value)} />
              </label>
              <label className="field-inline">
                Min
                <input className="input compact" value={qtyMin} inputMode="decimal" onChange={(event) => setQtyMin(event.target.value)} />
              </label>
              <label className="field-inline">
                Max
                <input className="input compact" value={qtyMax} inputMode="decimal" onChange={(event) => setQtyMax(event.target.value)} />
              </label>
              <label className="field-inline">
                Target
                <input className="input compact" value={targetPrice} inputMode="decimal" onChange={(event) => setTargetPrice(event.target.value)} />
              </label>
              <label className="field-inline">
                By
                <input className="input compact" type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
              </label>
              <label className="field-inline">
                Urgency
                <select className="select compact" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="watch">Watch</option>
                </select>
              </label>
              <label className="field-inline grow">
                Notes
                <input className="input" value={needNotes} onChange={(event) => setNeedNotes(event.target.value)} />
              </label>
              <button className="primary-button" type="button" disabled={!defaultCustomerId || !needProduct.trim() || Number(qtyMin) <= 0 || isRunning} onClick={createNeed}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Need
              </button>
            </div>
            <div className="control-band subtle-band">
              <label className="field-inline">
                Vendor
                <select className="select" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
                  <option value="">Default vendor</option>
                  {reference.data?.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-inline grow">
                Stock
                <input ref={supplyProductRef} className="input" value={supplyProduct} onChange={(event) => setSupplyProduct(event.target.value)} />
              </label>
              <label className="field-inline">
                Category
                <select className="select compact" value={supplyCategory} onChange={(event) => setSupplyCategory(event.target.value)}>
                  {reference.data?.categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="field-inline grow">
                Tags
                <input className="input" value={supplyTags} onChange={(event) => setSupplyTags(event.target.value)} />
              </label>
              <label className="field-inline">
                Qty
                <input className="input compact" value={availableQty} inputMode="decimal" onChange={(event) => setAvailableQty(event.target.value)} />
              </label>
              <label className="field-inline">
                Ask
                <input className="input compact" value={askingPrice} inputMode="decimal" onChange={(event) => setAskingPrice(event.target.value)} />
              </label>
              <label className="field-inline">
                Date
                <input className="input compact" type="date" value={availableDate} onChange={(event) => setAvailableDate(event.target.value)} />
              </label>
              <label className="field-inline">
                Location
                <input className="input compact" value={location} onChange={(event) => setLocation(event.target.value)} />
              </label>
              <label className="field-inline">
                Grade
                <input className="input compact" value={grade} onChange={(event) => setGrade(event.target.value)} />
              </label>
              <label className="field-inline grow">
                Terms
                <input className="input" value={terms} onChange={(event) => setTerms(event.target.value)} />
              </label>
              <label className="field-inline grow">
                Notes
                <input className="input" value={supplyNotes} onChange={(event) => setSupplyNotes(event.target.value)} />
              </label>
              <button className="primary-button" type="button" disabled={!defaultVendorId || !supplyProduct.trim() || Number(availableQty) <= 0 || isRunning} onClick={createSupply}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Vendor Stock
              </button>
            </div>
          </div>
        </WorkspacePanel>
      ) : null}

      <OperatorGrid
        view="matchmaking"
        title="Deterministic Matches"
        rows={(board.data?.matches ?? []) as GridRow[]}
        columns={matchColumns}
        loading={board.isLoading || isRunning}
        onSelectionChange={setSelectedMatches}
        actions={
          <>
            <button className="primary-button compact-action" type="button" disabled={!selectedMatches.length || isRunning} onClick={acceptSelected}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Accept
            </button>
            <button className="secondary-button compact-action" type="button" disabled={!selectedMatches.length || isRunning} onClick={dismissSelected}>
              <X className="h-4 w-4" aria-hidden="true" />
              Dismiss
            </button>
          </>
        }
        emptyTitle="No matches yet"
        emptyChildren="Add a customer need and vendor stock with matching category or tags."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <OperatorGrid
          view="matchmaking"
          title="Customer Needs"
          rows={(board.data?.needs ?? []) as GridRow[]}
          columns={needColumns}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateNeedCell : undefined}
        />
        <OperatorGrid
          view="matchmaking"
          title="Vendor Stock"
          rows={(board.data?.supplies ?? []) as GridRow[]}
          columns={supplyColumns}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateSupplyCell : undefined}
        />
      </div>
    </div>
  );
}
