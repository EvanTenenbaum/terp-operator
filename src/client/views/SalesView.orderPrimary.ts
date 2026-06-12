import type { StatusAction, StatusActionTable } from '../components/templates';

/**
 * UX-T03 — order-level primary for SalesView, expressed as a spec §10
 * decision table so it runs through the SAME engine (resolveStatusActions)
 * as the line-level StatusActionBar. The control-band button is structurally
 * not a grid-selection bar (it must offer "New Sale" before any order
 * exists), so SalesView consumes the resolved primary (label / disabled /
 * reason / run) directly instead of mounting a second <StatusActionBar> —
 * no duplicated status-rule logic remains.
 *
 * Real order statuses (schema + commandBus verified): draft → confirmed →
 * posted, plus cancelled and fulfilled as terminal states. Pre-confirm
 * statuses (draft / unknown) fall through to the Price + Confirm path,
 * matching the deleted salesPrimaryLabel/isOrderTerminal helpers exactly.
 */
export interface SalesOrderPrimaryDeps {
  /** Whether the selected order already has lines (label only). */
  hasLines: boolean;
  reserve: () => unknown | Promise<unknown>;
  priceConfirm: () => unknown | Promise<unknown>;
}

export function buildSalesOrderPrimaryTable({ hasLines, reserve, priceConfirm }: SalesOrderPrimaryDeps): StatusActionTable {
  const draftLabel = hasLines ? 'Price + Confirm' : 'Add first line';
  return {
    rules: [
      { when: 'confirmed', primary: { key: 'reserve', label: 'Reserve', run: () => reserve() } },
      // Terminal statuses keep the button visible-but-disabled (legacy
      // behavior of the pre-template helpers — zero functionality change).
      { when: 'posted', primary: { key: 'posted', label: 'Posted', disabled: true, disabledReason: 'Posted orders are terminal', run: () => undefined } },
      { when: 'cancelled', primary: { key: 'cancelled', label: 'Cancelled', disabled: true, disabledReason: 'Cancelled orders are terminal', run: () => undefined } },
      { when: 'fulfilled', primary: { key: 'fulfilled', label: draftLabel, disabled: true, disabledReason: 'Fulfilled orders are terminal', run: () => undefined } },
      // Catch-all: draft and any unknown status → Price + Confirm path.
      { when: () => true, primary: { key: 'price-confirm', label: draftLabel, run: () => priceConfirm() } }
    ]
  };
}

/** Primary when no order is selected: start a sale for the active customer. */
export function newSalePrimary(customerId: string, createOrder: () => unknown | Promise<unknown>): StatusAction {
  return {
    key: 'new-sale',
    label: 'New Sale',
    disabled: !customerId,
    disabledReason: 'Choose a customer to start a sale',
    run: () => createOrder()
  };
}
