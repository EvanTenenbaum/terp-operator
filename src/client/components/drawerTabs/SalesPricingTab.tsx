import type { GridRow } from '../../../shared/types';

/**
 * SalesPricingTab — pricing context for the active sales order.
 *
 * CAP-007 (Phase 1 extension): Shows the active pricing strategy name and
 * surfaces any lines that are below the price floor as amber warnings so
 * the operator can resolve them before confirming.
 */

interface SalesPricingTabProps {
  orderId: string;
  selectedOrder?: GridRow;
  orderLines?: GridRow[];
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

export function SalesPricingTab({ orderId, selectedOrder, orderLines }: SalesPricingTabProps) {
  const strategy = selectedOrder?.pricingStrategy ? String(selectedOrder.pricingStrategy) : null;
  const belowFloorLines = (orderLines ?? []).filter((line) => Boolean(line.belowFloorReason));

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Pricing</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Order <span className="font-mono">{orderId.slice(0, 8)}…</span>
      </p>

      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Strategy</span>
          <strong>{strategy ?? <span className="text-zinc-400">Not set</span>}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Order total</span>
          <strong>${moneyish(selectedOrder?.total)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Status</span>
          <strong>{String(selectedOrder?.status ?? '-')}</strong>
        </div>
      </div>

      {/* Below-floor warnings */}
      {belowFloorLines.length > 0 ? (
        <div className="mt-4">
          <h3 className="section-title">
            <span className="text-amber-700">
              ⚠ Below-floor lines ({belowFloorLines.length})
            </span>
          </h3>
          <p className="mt-1 text-xs text-amber-700">
            These lines are priced below the vendor floor. Resolve before confirming.
          </p>
          <div className="mt-2 grid gap-1 text-xs">
            {belowFloorLines.map((line) => (
              <div key={line.id} className="activity-row border-l-2 border-amber-400 pl-2">
                <span className="font-medium text-ink">
                  {String(line.displayName ?? line.itemName ?? line.unresolvedSourceText ?? line.id)}
                </span>
                <span className="text-amber-800">
                  {String(line.belowFloorReason)}
                </span>
                <span className="text-zinc-500">${moneyish(line.unitPrice)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : orderLines?.length ? (
        <div className="mt-4">
          <div className="drawer-fact-row">
            <span className="text-green-700">All lines above floor</span>
            <strong className="text-green-700">✓</strong>
          </div>
        </div>
      ) : (
        <div className="drawer-empty mt-4">No lines on this order yet.</div>
      )}
    </div>
  );
}
