import { X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { trpc } from '../api/trpc';

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function pctish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(1)}%` : '—';
}

type TabKey = 'context' | 'quickAdds' | 'history';

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

export function VendorContextDrawer({
  isOpen,
  onClose,
  vendor,
  relationshipData,
  historicalProducts,
  onQuickAdd
}: VendorContextDrawerProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<TabKey>('context');
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);

  const lineItemsQuery = trpc.queries.purchaseOrderLines.useQuery(
    { purchaseOrderId: expandedPoId ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: Boolean(expandedPoId) }
  );

  // K4 (phase7-keyboard-a11y-audit): Trap focus inside the vendor context drawer.
  const drawerRef = useFocusTrap<HTMLElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className="fixed top-0 right-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-label="Vendor context drawer"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {vendor?.name ?? 'Vendor Context'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close drawer"
            type="button"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </header>

        {/* Tabs */}
        <nav className="flex border-b border-gray-200 px-6" role="tablist">
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'context'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('context')}
            role="tab"
            aria-selected={activeTab === 'context'}
            type="button"
          >
            Context
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'quickAdds'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('quickAdds')}
            role="tab"
            aria-selected={activeTab === 'quickAdds'}
            type="button"
          >
            Quick Adds
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('history')}
            role="tab"
            aria-selected={activeTab === 'history'}
            type="button"
          >
            Historical POs
          </button>
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'context' && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Vendor</span>
                <strong className="text-gray-900">{vendor?.name ?? '-'}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Terms</span>
                <strong className="text-gray-900">
                  {vendor ? `Net ${vendor.termsDays ?? 14} days` : '-'}
                </strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Open bills</span>
                <strong className="text-gray-900">
                  {relationshipData?.bills?.length ?? 0}
                </strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payments</span>
                <strong className="text-gray-900">
                  {relationshipData?.vendorPayments?.length ?? 0}
                </strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Prior POs</span>
                <strong className="text-gray-900">
                  {relationshipData?.purchaseOrders?.length ?? 0}
                </strong>
              </div>
              {vendor?.notes && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Notes</div>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">
                    {vendor.notes}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'quickAdds' && (
            <div className="space-y-2">
              {historicalProducts.length > 0 ? (
                historicalProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => onQuickAdd(product)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                    type="button"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {product.name}
                    </span>
                    <strong className="text-sm text-gray-700">
                      ${moneyish(product.unitCost)}
                    </strong>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-sm text-gray-500">
                  No reusable vendor history yet.
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {relationshipData?.purchaseOrders && relationshipData.purchaseOrders.length > 0 ? (
                relationshipData.purchaseOrders.map((po) => {
                  const isExpanded = expandedPoId === po.id;
                  const lineItems = isExpanded ? lineItemsQuery.data : null;
                  const isLoadingLines = isExpanded && lineItemsQuery.isLoading;
                  return (
                    <div key={po.id}>
                      <button
                        onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                          isExpanded
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
                        }`}
                        type="button"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">{po.poNo}</span>
                          <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                            {po.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                          <span>{new Date(po.createdAt).toLocaleDateString()}</span>
                          <strong className="text-gray-900">${moneyish(po.total)}</strong>
                        </div>
                      </button>
                      {/* Expanded line items */}
                      {isExpanded && (
                        <div className="mt-1 ml-2 border-l-2 border-blue-300 pl-3 space-y-2">
                          {isLoadingLines ? (
                            <div className="text-xs text-gray-400 py-2">Loading line items…</div>
                          ) : lineItemsQuery.isError ? (
                            <div className="text-xs text-red-500 py-2">Failed to load line items.</div>
                          ) : lineItems && lineItems.length > 0 ? (
                            lineItems.map((line: Record<string, unknown>) => {
                              const qty = Number(line.qty ?? 0);
                              const unitCost = Number(line.unitCost ?? 0);
                              const soldRevenue = Number(line.soldRevenue ?? 0);
                              const soldCost = Number(line.soldCost ?? 0);
                              const cogs = qty * unitCost;
                              const marginPct = soldRevenue > 0
                                ? ((soldRevenue - soldCost) / soldRevenue) * 100
                                : null;
                              const currentStock = Number(line.currentStock ?? 0);
                              return (
                                <div key={String(line.id)} className="py-2 text-xs border-b border-gray-100 last:border-b-0">
                                  <div className="flex justify-between mb-1">
                                    <span className="font-medium text-gray-900 truncate max-w-[160px]">
                                      {String(line.productName ?? '—')}
                                    </span>
                                    <span className="text-gray-500">{moneyish(qty)} {String(line.uom ?? '')}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-600">
                                    <div><span className="text-gray-400">Unit cost</span> ${moneyish(unitCost)}</div>
                                    <div><span className="text-gray-400">COGS</span> ${moneyish(cogs)}</div>
                                    <div>
                                      <span className="text-gray-400">Margin</span>{' '}
                                      {marginPct !== null ? pctish(marginPct) : <span className="text-gray-400">—</span>}
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Stock</span>{' '}
                                      {currentStock > 0 ? (
                                        <span className="font-semibold text-green-700">{moneyish(currentStock)} {String(line.uom ?? '')}</span>
                                      ) : (
                                        <span className="text-red-500 font-semibold">OUT</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-gray-400 py-2">No line items found for this PO.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-sm text-gray-500">
                  No historical POs found.
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
