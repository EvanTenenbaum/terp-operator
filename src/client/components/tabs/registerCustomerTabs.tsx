/**
 * Phase 3B — Customer entity tab registry for the Mercury SalesView modes.
 *
 * Registers four tabs on the `customer` entity type so that DetailSlideover
 * surfaces consistent customer detail content when the operator opens the
 * credit panel (openCreditPanel in SalesBuildMode) or clicks the customer
 * Edit button in SalesCustomerContextHeader.
 *
 * Tab list:
 *   - Detail    (default — customer identity, balance, credit status)
 *   - Orders    (sales orders for this customer)
 *   - Payments  (applied/open payments and invoice balance)
 *   - Credit    (credit limit, balance, credit status, history)
 *
 * Tab components are intentionally light placeholders that read entity data
 * from the supplied `row`. Real tab bodies migrate from inline panels in
 * later phases; the registry shape is stable and additive.
 *
 * SAFETY: This module is import-time pure; calling `registerCustomerTabs()` is
 * idempotent (the underlying `registerTabs` REPLACES on second call). It
 * never mutates command state, never issues queries, and never affects the
 * legacy SalesView path.
 */
import { registerTabs, type SlideOverTab, type SlideOverTabProps } from './registry';
import type { GridRow } from '../../../shared/types';

// ── Helpers ────────────────────────────────────────────────────────────────

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
    <div className="p-3 text-sm" data-testid={`customer-slideover-${label.toLowerCase()}-tab`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <p className="mt-1 text-zinc-700">{description}</p>
      {row?.id ? (
        <div className="mt-3 text-[11px] text-zinc-500">
          Customer: <span className="font-mono">{String(row.id).slice(0, 8)}</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Tab components ─────────────────────────────────────────────────────────

/**
 * Detail tab — customer identity summary. Renders a compact summary of the
 * customer entity: name, balance, credit status.
 */
function CustomerDetailTab(props: SlideOverTabProps): JSX.Element {
  const { row } = props;
  const name = entityField(row, 'customer');
  const balance = entityField(row, 'balance');
  const creditLimit = entityField(row, 'creditLimit');
  return (
    <div className="p-3 space-y-2 text-sm" data-testid="customer-slideover-detail-tab">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Customer detail</div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">Name</dt>
        <dd className="text-ink">{String(name ?? '—')}</dd>
        <dt className="text-zinc-500">Balance</dt>
        <dd className="text-ink">{balance != null ? `$${Number(balance).toLocaleString()}` : '—'}</dd>
        <dt className="text-zinc-500">Credit limit</dt>
        <dd className="text-ink">{creditLimit != null ? `$${Number(creditLimit).toLocaleString()}` : '—'}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">
        View full customer history and manage relationships in the Contacts view.
      </p>
    </div>
  );
}

function CustomerOrdersTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Orders"
      description="Sales orders for this customer. Open an order in Build Mode to add or edit lines."
      row={props.row}
    />
  );
}

function CustomerPaymentsTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Payments"
      description="Applied payments, open invoices, and remaining balance. Manage receipts and allocations in the Payments view."
      row={props.row}
    />
  );
}

function CustomerCreditTab(props: SlideOverTabProps): JSX.Element {
  return (
    <PlaceholderTab
      label="Credit"
      description="Credit limit, current balance, and credit status. Adjust credit limits in the Client Ledger view."
      row={props.row}
    />
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────

export const customerDetailTab: SlideOverTab = {
  key: 'detail',
  label: 'Detail',
  component: CustomerDetailTab,
  defaultFor: ['customer'],
};

export const customerOrdersTab: SlideOverTab = {
  key: 'orders',
  label: 'Orders',
  component: CustomerOrdersTab,
};

export const customerPaymentsTab: SlideOverTab = {
  key: 'payments',
  label: 'Payments',
  component: CustomerPaymentsTab,
};

export const customerCreditTab: SlideOverTab = {
  key: 'credit',
  label: 'Credit',
  component: CustomerCreditTab,
};

/**
 * Register all customer entity tabs in the global tab registry.
 *
 * Idempotent — second call REPLACES the previous registration (see
 * `registerTabs` in ./registry.ts). Safe to call at module scope from
 * SalesView mode modules.
 */
export function registerCustomerTabs(): void {
  registerTabs('customer', [
    customerDetailTab,
    customerOrdersTab,
    customerPaymentsTab,
    customerCreditTab,
  ]);
}
