import { Plus, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useConfirm } from '../hooks/useConfirm';
import { InspectorDrawer } from './templates';

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function pctish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(1)}%` : '—';
}

interface VendorContextDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: {
    id: string;
    name: string;
    termsDays: number;
    notes?: string;
  } | null;
  relationshipData: {
    bills?: Array<{ id: string }>;
    vendorPayments?: Array<{ id: string }>;
    purchaseOrders?: Array<{
      id: string;
      poNo: string;
      status: string;
      total: string;
      createdAt: string;
    }>;
  } | null;
  historicalProducts: Array<{
    id: string;
    name: string;
    unitCost: string;
  }>;
  onQuickAdd: (product: { id: string; name: string; unitCost: string }) => void;
}

/**
 * Vendor context for PO authoring — now rendered through the shared
 * InspectorDrawer template so it shares chrome (backdrop, focus trap, header,
 * tablist, Escape) with every other row/entity inspector, and uses the
 * project's semantic palette instead of the raw blue/gray it previously
 * carried (chrome must be green-accent per the 2026-05-25 color decision;
 * blue stays reserved for status semantics).
 *
 * Public API and all four tabs (Context · Quick Adds · Historical POs ·
 * Brands) are unchanged: quick-add wiring into the PO authoring form,
 * expandable PO line items with margin/stock, and brands CRUD all preserved.
 */
export function VendorContextDrawer({
  isOpen,
  onClose,
  vendor,
  relationshipData,
  historicalProducts,
  onQuickAdd
}: VendorContextDrawerProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<string>('context');

  if (!isOpen) return null;

  return (
    <InspectorDrawer
      open={isOpen}
      title={vendor?.name ?? 'Vendor Context'}
      subtitle={vendor ? `Net ${vendor.termsDays ?? 14} days` : undefined}
      ariaLabel="Vendor context drawer"
      tabs={[
        { key: 'context', label: 'Context', render: () => <VendorContextTab vendor={vendor} relationshipData={relationshipData} /> },
        { key: 'quickAdds', label: 'Quick Adds', render: () => <VendorQuickAddsTab historicalProducts={historicalProducts} onQuickAdd={onQuickAdd} /> },
        { key: 'history', label: 'Historical POs', render: () => <VendorHistoryTab purchaseOrders={relationshipData?.purchaseOrders} /> },
        { key: 'brands', label: 'Brands', render: () => <VendorBrandsTab vendorId={vendor?.id} /> }
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
    />
  );
}

function VendorContextTab({
  vendor,
  relationshipData
}: {
  vendor: VendorContextDrawerProps['vendor'];
  relationshipData: VendorContextDrawerProps['relationshipData'];
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">Vendor</span>
        <strong className="text-ink">{vendor?.name ?? '-'}</strong>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">Terms</span>
        <strong className="text-ink">{vendor ? `Net ${vendor.termsDays ?? 14} days` : '-'}</strong>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">Open bills</span>
        <strong className="text-ink">{relationshipData?.bills?.length ?? 0}</strong>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">Payments</span>
        <strong className="text-ink">{relationshipData?.vendorPayments?.length ?? 0}</strong>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">Prior POs</span>
        <strong className="text-ink">{relationshipData?.purchaseOrders?.length ?? 0}</strong>
      </div>
      {vendor?.notes && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 text-sm text-zinc-600">Notes</div>
          <div className="whitespace-pre-wrap text-sm text-ink">{vendor.notes}</div>
        </div>
      )}
    </div>
  );
}

function VendorQuickAddsTab({
  historicalProducts,
  onQuickAdd
}: {
  historicalProducts: VendorContextDrawerProps['historicalProducts'];
  onQuickAdd: VendorContextDrawerProps['onQuickAdd'];
}) {
  return (
    <div className="space-y-2">
      {historicalProducts.length > 0 ? (
        historicalProducts.map((product) => (
          <button
            key={product.id}
            onClick={() => onQuickAdd(product)}
            className="flex w-full items-center justify-between border border-line px-4 py-3 text-left transition-colors hover:border-accent hover:bg-panel"
            type="button"
          >
            <span className="text-sm font-medium text-ink">{product.name}</span>
            <strong className="text-sm text-zinc-700">${moneyish(product.unitCost)}</strong>
          </button>
        ))
      ) : (
        <div className="py-8 text-center text-sm text-zinc-500">No reusable vendor history yet.</div>
      )}
    </div>
  );
}

function VendorHistoryTab({
  purchaseOrders
}: {
  purchaseOrders: NonNullable<VendorContextDrawerProps['relationshipData']>['purchaseOrders'];
}) {
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const lineItemsQuery = trpc.purchaseOrders.purchaseOrderLines.useQuery(
    { purchaseOrderId: expandedPoId ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: Boolean(expandedPoId) }
  );

  if (!purchaseOrders || purchaseOrders.length === 0) {
    return <div className="py-8 text-center text-sm text-zinc-500">No historical POs found.</div>;
  }

  return (
    <div className="space-y-2">
      {purchaseOrders.map((po) => {
        const isExpanded = expandedPoId === po.id;
        const lineItems = isExpanded ? lineItemsQuery.data : null;
        const isLoadingLines = isExpanded && lineItemsQuery.isLoading;
        return (
          <div key={po.id}>
            <button
              onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
              aria-expanded={isExpanded}
              className={`w-full border px-4 py-3 text-left text-sm transition-colors ${
                isExpanded ? 'border-accent bg-panel' : 'border-line hover:border-accent hover:bg-panel'
              }`}
              type="button"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-ink">{po.poNo}</span>
                <span className="selection-pill">{po.status}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-600">
                <span>{new Date(po.createdAt).toLocaleDateString('en-US')}</span>
                <strong className="text-ink">${moneyish(po.total)}</strong>
              </div>
            </button>
            {isExpanded && (
              <div className="ml-2 mt-1 space-y-2 border-l-2 border-accent pl-3">
                {isLoadingLines ? (
                  <div className="py-2 text-xs text-zinc-400">Loading line items…</div>
                ) : lineItemsQuery.isError ? (
                  <div className="py-2 text-xs text-danger">Failed to load line items.</div>
                ) : lineItems && lineItems.length > 0 ? (
                  lineItems.map((line: Record<string, unknown>) => {
                    const qty = Number(line.qty ?? 0);
                    const unitCost = Number(line.unitCost ?? 0);
                    const soldRevenue = Number(line.soldRevenue ?? 0);
                    const soldCost = Number(line.soldCost ?? 0);
                    const cogs = qty * unitCost;
                    const marginPct = soldRevenue > 0 ? ((soldRevenue - soldCost) / soldRevenue) * 100 : null;
                    const currentStock = Number(line.currentStock ?? 0);
                    return (
                      <div key={String(line.id)} className="border-b border-line py-2 text-xs last:border-b-0">
                        <div className="mb-1 flex justify-between">
                          <span className="max-w-[160px] truncate font-medium text-ink">{String(line.productName ?? '—')}</span>
                          <span className="text-zinc-500">
                            {moneyish(qty)} {String(line.uom ?? '')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-600">
                          <div>
                            <span className="text-zinc-400">Unit cost</span> ${moneyish(unitCost)}
                          </div>
                          <div>
                            <span className="text-zinc-400">COGS</span> ${moneyish(cogs)}
                          </div>
                          <div>
                            <span className="text-zinc-400">Margin</span>{' '}
                            {marginPct !== null ? pctish(marginPct) : <span className="text-zinc-400">—</span>}
                          </div>
                          <div>
                            <span className="text-zinc-400">Stock</span>{' '}
                            {currentStock > 0 ? (
                              <span className="font-semibold text-accent">
                                {moneyish(currentStock)} {String(line.uom ?? '')}
                              </span>
                            ) : (
                              <span className="font-semibold text-danger">OUT</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-2 text-xs text-zinc-400">No line items found for this PO.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VendorBrandsTab({ vendorId }: { vendorId?: string }) {
  const [newBrandName, setNewBrandName] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);
  const confirm = useConfirm();

  const brandsQuery = trpc.vendorBrands.list.useQuery(
    { vendorId: vendorId ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: Boolean(vendorId) }
  );

  const addBrand = trpc.vendorBrands.add.useMutation({
    onSuccess: () => {
      setNewBrandName('');
      setAddingBrand(false);
      brandsQuery.refetch();
    }
  });

  const removeBrand = trpc.vendorBrands.remove.useMutation({
    onSuccess: () => {
      brandsQuery.refetch();
    }
  });

  const renameBrand = trpc.vendorBrands.rename.useMutation({
    onSuccess: () => {
      brandsQuery.refetch();
    }
  });

  return (
    <div className="space-y-3">
      {addingBrand ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newBrandName.trim() && vendorId) {
              addBrand.mutate({ vendorId, name: newBrandName.trim() });
            }
          }}
          className="flex gap-2"
        >
          <input aria-label="New brand name"
            type="text"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            placeholder="Brand name"
            className="input flex-1"
            autoFocus
          />
          <button type="submit" disabled={addBrand.isLoading || !newBrandName.trim()} className="primary-button compact-action">
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingBrand(false);
              setNewBrandName('');
            }}
            className="secondary-button compact-action"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAddingBrand(true)}
          className="flex w-full items-center justify-center gap-2 border border-dashed border-line px-4 py-3 text-sm text-zinc-500 transition-colors hover:border-accent hover:bg-panel hover:text-accent"
          type="button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add brand
        </button>
      )}

      {brandsQuery.isLoading ? (
        <div className="py-4 text-center text-sm text-zinc-400">Loading brands…</div>
      ) : brandsQuery.isError ? (
        <div className="py-4 text-center text-sm text-danger">Failed to load brands.</div>
      ) : brandsQuery.data && brandsQuery.data.length > 0 ? (
        brandsQuery.data.map((brand) => (
          <div key={brand.id} className="flex items-center justify-between border border-line px-4 py-3">
            <BrandNameEditor brand={brand} onRename={(name) => renameBrand.mutate({ brandId: brand.id, name })} />
            <button
              onClick={() => {
                if (!vendorId) return;
                void confirm({
                  title: `Remove "${brand.name}" from this vendor?`,
                  body: 'This will permanently unlink the brand from the vendor. This action cannot be undone.',
                  tone: 'danger',
                  primaryLabel: 'Remove brand',
                }).then((ok) => {
                  if (ok) removeBrand.mutate({ brandId: brand.id, vendorId });
                });
              }}
              className="icon-button"
              aria-label={`Remove ${brand.name}`}
              type="button"
              title="Remove from vendor"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))
      ) : (
        <div className="py-8 text-center text-sm text-zinc-500">No brands assigned to this vendor yet.</div>
      )}
    </div>
  );
}

/** Inline brand name editor: click to edit, enter to save, escape to cancel. */
function BrandNameEditor({
  brand,
  onRename
}: {
  brand: { id: string; name: string; alias: string };
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(brand.name);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== brand.name) {
      onRename(trimmed);
    } else {
      setValue(brand.name);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input aria-label="Value"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setValue(brand.name);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className="input compact flex-1"
        autoFocus
      />
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="text-button text-sm font-medium" title="Click to rename">
      {brand.name}
    </button>
  );
}
