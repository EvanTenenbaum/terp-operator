import { PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { FilterPresetStrip } from '../components/templates';
import { useCommandRunner } from '../components/useCommandRunner';
import { useConfirm } from '../hooks/useConfirm';
import type { GridRow } from '../../shared/types';
import { parseTagInput } from '../../shared/tags';
import {
  asCustomerPricingRule,
  computeInventoryUnitPrice,
  formatInventoryUnitCost,
  inventoryUnitCostSortValue
} from '../../shared/inventoryPricing';
import { GridJourney } from './operations/shared';
// UX-O02: PhotographyQueuePanel surfaces media-readiness CountPills in the
// Inventory lane so catalog decisions (blocking batches needing photos) are
// visible without switching to the Photography lane.
import { PhotographyQueuePanel } from '../components/PhotographyQueuePanel';

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
        /* GH #354 presets, now via the shared template.
           UX-I02: "No photos" preset surfaces batches lacking any published media. */
        <FilterPresetStrip
          view="inventory"
          ariaLabel="Filter inventory"
          presets={[
            { label: 'Available', filter: 'arrivalStatus:arrived' },
            { label: 'Office Stock', filter: 'ownershipStatus:OFC', title: 'Office-owned batches (ownershipStatus:OFC)' },
            { label: 'No photos', filter: 'mediaStatus:open', title: 'Batches with no published media (mediaStatus:open)' }
          ]}
        />
      )}
      // UX-O02: PhotographyQueuePanel in the Inventory lane surfaces CountPills
      // (needs-media / ready counts) so catalog decisions are informed without
      // navigating away to the Photography view.
      prelude={() => <PhotographyQueuePanel />}
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
          // UX-I03: quantity edits are handled in InventoryRowActions with
          // before/after preview. The inline cell edit path is kept for parity
          // but uses a hardcoded reason; operators who want the preview should
          // use Row Actions → Adjust Qty which surfaces the full before/after strip.
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

// UX-I01: ≤8 default-visible columns. The inventory grid has grown to 20+
// columns; hide lower-value ones so operators see a clean default view.
// All hidden columns remain reachable via the Columns menu. gridColumnPrefs
// override defaults (mergeColumnDefsWithPrefs honours pref.hide), so
// existing operator customisations are preserved.
function buildInventoryColumns(defaultsRule: ReturnType<typeof asCustomerPricingRule>): ColDef<GridRow>[] {
  return [
    // --- Visible by default (8 columns) ---
    { field: 'batchCode', pinned: 'left', width: 150 },
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
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
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
    { field: 'legacyMarker', headerName: 'Marker', editable: true, width: 105 },
    // UX-I02: mediaStatus visible by default — photographer persona's primary column.
    { field: 'mediaStatus', headerName: 'Media', width: 120 },
    { field: 'status', width: 120 },
    // --- Hidden by default (≤8 rule); reachable via Columns menu ---
    { field: 'subcategory', width: 140, hide: true },
    { field: 'itemAlias', headerName: 'Market name', editable: true, minWidth: 180, hide: true },
    { field: 'category', width: 120, hide: true },
    { field: 'tags', editable: true, minWidth: 170, hide: true },
    { field: 'vendor', width: 180, hide: true },
    { field: 'reservedQty', type: 'numericColumn', width: 130, hide: true },
    { field: 'uom', width: 90, hide: true },
    { field: 'location', width: 120, hide: true },
    { field: 'ownershipStatus', width: 120, hide: true },
    { field: 'arrivalStatus', width: 120, hide: true },
    // UX-I02: hasPrimaryPhoto column hidden by default; used by "No photos" filter preset.
    { field: 'hasPrimaryPhoto', headerName: 'Photos', width: 100, hide: true },
    { field: 'lotCode', editable: true, width: 120, hide: true },
    { field: 'expirationDate', editable: true, width: 140, hide: true }
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
  const [reason, setReason] = useState('');
  const [tagText, setTagText] = useState('');

  // UX-I03: qty adjustment state — tracks before/after for the preview strip.
  const [adjustQty, setAdjustQty] = useState('');

  const selectedBatch = rows[0];
  const batchId = selectedBatch?.id;
  const noSelection = !batchId;
  const consignedVendorId = vendorId || String(selectedBatch?.vendorId ?? '');

  // UX-I03: before/after qty preview values.
  const beforeQty = Number(selectedBatch?.availableQty ?? 0);
  const deltaQty = Number(adjustQty) || 0;
  const afterQty = beforeQty + deltaQty;

  useEffect(() => {
    const currentTags = selectedBatch?.tags;
    setTagText(Array.isArray(currentTags) ? currentTags.join(', ') : String(currentTags ?? ''));
    // Reset adjustment when selection changes.
    setAdjustQty('');
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

            {/* UX-I03: Qty adjustment with before/after preview + required reason */}
            <fieldset className="field-inline" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend className="text-xs font-medium text-zinc-600 mb-1">Adjust qty</legend>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500">
                  Before: <strong>{beforeQty}</strong>
                </span>
                <input
                  className="input compact"
                  type="number"
                  step="any"
                  value={adjustQty}
                  placeholder="±delta"
                  aria-label="Quantity delta (positive to add, negative to remove)"
                  onChange={(e) => setAdjustQty(e.target.value)}
                  style={{ width: 90 }}
                />
                {adjustQty !== '' && Number.isFinite(deltaQty) ? (
                  <span className="text-xs text-zinc-500">
                    After: <strong>{afterQty}</strong>
                    {deltaQty !== 0 ? (
                      <em className={`ml-1 ${deltaQty > 0 ? 'text-emerald-600' : 'text-red-600'}`} style={{ fontStyle: 'normal' }}>
                        ({deltaQty > 0 ? '+' : ''}{deltaQty})
                      </em>
                    ) : null}
                  </span>
                ) : null}
                <button
                  className="secondary-button compact-action"
                  type="button"
                  disabled={!reason.trim() || !adjustQty || deltaQty === 0}
                  title={
                    !reason.trim()
                      ? 'Enter a reason before adjusting quantity'
                      : !adjustQty || deltaQty === 0
                      ? 'Enter a non-zero quantity delta'
                      : `Adjust qty by ${deltaQty > 0 ? '+' : ''}${deltaQty}`
                  }
                  onClick={() =>
                    void confirmAction(`Adjust qty by ${deltaQty > 0 ? '+' : ''}${deltaQty}`, () => {
                      runCommand('adjustBatchQuantity', { batchId, deltaQty, reason }, `Adjust qty: ${reason}`);
                      setAdjustQty('');
                    })
                  }
                >
                  Apply adjustment
                </button>
              </div>
            </fieldset>

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
            <label className="field-inline grow" style={{ flex: '1 1 200px' }}>
              Reason <span className="text-red-500" aria-hidden="true">*</span>
              <input
                className="input"
                value={reason}
                required
                placeholder="Required — e.g. cycle count correction"
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="reason-help"
              />
              <span id="reason-help" className="sr-only">Required for all inventory actions</span>
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
