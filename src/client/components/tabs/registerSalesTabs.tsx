/**
 * Phase 3B — Sales entity tab registry for the Mercury SalesView modes.
 *
 * Registers six tabs on the `salesOrder` entity type so that DetailSlideover
 * surfaces consistent detail content for an order regardless of which view
 * opened it (SalesBrowseMode, SalesBuildMode, RowInspector deep-link, etc.).
 *
 * Tab list (matches docs/engineering-plans/specifications/views/preserved-views-design-proposals.md §SalesView):
 *   - Lines       (default — order line items grid)
 *   - Pricing     (markup, COGS, range, exceptions)
 *   - Fulfillment (pick status, release eligibility, recall)
 *   - Invoice     (sheet preview, customer-safe export)
 *   - Payments    (open invoices, applied payments)
 *   - Journal     (command audit / order timeline)
 *   - Suggestions (smart suggestions for this customer; placeholder)
 *
 * Tab components are intentionally light placeholders that read entity data
 * from the supplied `row` and short-circuit to a "loading" or "no data" state
 * when context is missing. Real tab bodies migrate from inline panels in
 * later phases; the registry shape is stable and additive.
 *
 * SAFETY: This module is import-time pure; calling `registerSalesTabs()` is
 * idempotent (the underlying `registerTabs` REPLACES on second call). It
 * never mutates command state, never issues queries, and never affects the
 * legacy SalesView path (feature flag SALES_VIEW_MERCURY=false → legacy view
 * is rendered unchanged by SalesView.tsx).
 */
import { registerTabs, type SlideOverTab, type SlideOverTabProps } from './registry';
import type { GridRow } from '../../../shared/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function entityField(row: GridRow | undefined, field: string): unknown {
  if (!row) return undefined;
  return (row as Record<string, unknown>)[field];
}

function PlaceholderTab({
  label,
  description,
  row,
}: {
  label: string;
  description: string;
  row?: GridRow;
}): JSX.Element {
  return (
    <div className="p-3 text-sm" data-testid={`sales-slideover-${label.toLowerCase()}-tab`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <p className="mt-1 text-zinc-700">{description}</p>
      {row?.id ? (
        <div className="mt-3 text-[11px] text-zinc-500">
          Order: <span className="font-mono">{String(row.id).slice(0, 8)}</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Tab components ─────────────────────────────────────────────────────────

/**
 * Lines tab — order line summary. Renders a compact summary derived from the
 * grid row's denormalized columns (`lines`, `linesPicked`, `linesTotal`,
 * `total`). The detailed editable lines grid stays in the main view body
 * (Build Mode); this tab is a quick reference / read-only summary.
 */
function SalesOrderLinesTab(props: SlideOverTabProps): JSX.Element {
  const { row } = props;
  const total = entityField(row, 'total');
  const lines = entityField(row, 'lines');
  const linesPicked = entityField(row, 'linesPicked');
  const linesTotal = entityField(row, 'linesTotal');
  const status = entityField(row, 'status');
  return (
    <div className="p-3 space-y-2 text-sm" data-testid="sales-slideover-lines-tab">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Lines summary</div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">Status</dt>
        <dd className="text-ink">{String(status ?? '—')}</dd>
        <dt className="text-zinc-500">Line count</dt>
        <dd className="text-ink">{String(lines ?? '—')}</dd>
        <dt className="text-zinc-500">Picked</dt>
        <dd className="text-ink">{linesTotal ? `${linesPicked ?? 0} / ${linesTotal}` : '—'}</dd>
        <dt className="text-zinc-500">Order total</dt>
        <dd className="text-ink">{fmtMoney(total)}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">
        Edit lines in the primary grid (Build Mode) or open the order in full view.
      </p>
    </div>
  );
}

function SalesOrderPricingTab(props: SlideOverTabProps): JSX.Element {
  const { row } = props;
  const strategy = entityField(row, 'pricingStrategy');
  const total = entityField(row, 'total');
  const internalMargin = entityField(row, 'internalMargin');
  return (
    <div className="p-3 space-y-2 text-sm" data-testid="sales-slideover-pricing-tab">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Pricing</div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">Strategy</dt>
        <dd className="text-ink">{String(strategy ?? 'standard')}</dd>
        <dt className="text-zinc-500">Order total</dt>
        <dd className="text-ink">{fmtMoney(total)}</dd>
        <dt className="text-zinc-500">Internal margin</dt>
        <dd className="text-ink">{fmtMoney(internalMargin)}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">
        Use the Markup / COGS columns to adjust per-line pricing. Re-price via the order action footer.
      </p>
    </div>
  );
}

function SalesOrderFulfillmentTab(props: SlideOverTabProps): JSX.Element {
  const { row } = props;
  const linesPicked = entityField(row, 'linesPicked');
  const linesTotal = entityField(row, 'linesTotal');
  const deliveryWindow = entityField(row, 'deliveryWindow');
  return (
    <div className="p-3 space-y-2 text-sm" data-testid="sales-slideover-fulfillment-tab">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Fulfillment</div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">Picked</dt>
        <dd className="text-ink">{linesTotal ? `${linesPicked ?? 0} / ${linesTotal}` : '—'}</dd>
        <dt className="text-zinc-500">Delivery window</dt>
        <dd className="text-ink">{String(deliveryWindow ?? '—')}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">
        Release for picking, recall, or mark packed via line-level actions.
      </p>
    </div>
  );
}

function SalesOrderInvoiceTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Invoice"
      description="Customer sheet preview and invoice export controls. Open the sales sheet panel in Build Mode for full export options."
      row={props.row}
    />
  );
}

function SalesOrderPaymentsTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Payments"
      description="Applied payments and open invoice balance for this order. Manage receipts and allocations in the Payments view."
      row={props.row}
    />
  );
}

function SalesOrderJournalTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Journal"
      description="Command and audit trail for this order. The full action log lives in the Recovery view."
      row={props.row}
    />
  );
}

function SalesOrderSuggestionsTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Suggestions"
      description="Smart inventory suggestions for the active customer. Pick a suggestion to add it as a draft line."
      row={props.row}
    />
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────

export const salesOrderLinesTab: SlideOverTab = {
  key: 'lines',
  label: 'Lines',
  component: SalesOrderLinesTab,
  defaultFor: ['salesOrder'],
};

export const salesOrderPricingTab: SlideOverTab = {
  key: 'pricing',
  label: 'Pricing',
  component: SalesOrderPricingTab,
};

export const salesOrderFulfillmentTab: SlideOverTab = {
  key: 'fulfillment',
  label: 'Fulfillment',
  component: SalesOrderFulfillmentTab,
};

export const salesOrderInvoiceTab: SlideOverTab = {
  key: 'invoice',
  label: 'Invoice',
  component: SalesOrderInvoiceTab,
};

export const salesOrderPaymentsTab: SlideOverTab = {
  key: 'payments',
  label: 'Payments',
  component: SalesOrderPaymentsTab,
};

export const salesOrderJournalTab: SlideOverTab = {
  key: 'journal',
  label: 'Journal',
  component: SalesOrderJournalTab,
};

export const salesOrderSuggestionsTab: SlideOverTab = {
  key: 'suggestions',
  label: 'Suggestions',
  component: SalesOrderSuggestionsTab,
};

/**
 * Register all sales entity tabs in the global tab registry.
 *
 * Idempotent — second call REPLACES the previous registration (see
 * `registerTabs` in ./registry.ts). Safe to call at module scope from
 * SalesView mode modules.
 */
export function registerSalesTabs(): void {
  registerTabs('salesOrder', [
    salesOrderLinesTab,
    salesOrderPricingTab,
    salesOrderFulfillmentTab,
    salesOrderInvoiceTab,
    salesOrderPaymentsTab,
    salesOrderJournalTab,
    salesOrderSuggestionsTab,
  ]);
}
