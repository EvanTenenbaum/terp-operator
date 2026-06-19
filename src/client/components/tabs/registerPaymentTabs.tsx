import { registerTabs, type SlideOverTab, type SlideOverTabProps } from './registry';

/**
 * Payment Ledger tab — placeholder for future per-payment ledger detail.
 * The QuickLedgerGrid remains inline in the prelude for Money In entry;
 * this tab is reserved for when the PaymentsView migrates from GridJourney
 * (RowInspector-based) to GridView (DetailSlideover-based).
 */
function PaymentLedgerTab(_props: SlideOverTabProps): JSX.Element {
  // Return empty fragment as placeholder — content driven by inspectorTabs.
  return <></>;
}

/**
 * Payment Allocations tab — placeholder. The actual PaymentAllocationTools
 * content is rendered via inspectorTabs in GridJourney for now.
 */
function PaymentAllocationsTab(_props: SlideOverTabProps): JSX.Element {
  return <></>;
}

/**
 * Payment Receipt tab — placeholder. Receipt content rendered via
 * inspectorTabs in GridJourney for now.
 */
function PaymentReceiptTab(_props: SlideOverTabProps): JSX.Element {
  return <></>;
}

export const paymentLedgerTab: SlideOverTab = {
  key: 'ledger',
  label: 'Ledger',
  component: PaymentLedgerTab,
  defaultFor: ['payment'],
};

export const paymentAllocationsTab: SlideOverTab = {
  key: 'allocations',
  label: 'Allocations',
  component: PaymentAllocationsTab,
};

export const paymentReceiptTab: SlideOverTab = {
  key: 'receipt',
  label: 'Receipt',
  component: PaymentReceiptTab,
};

/**
 * Register all Payment tabs in the global tab registry.
 * Idempotent — calling twice replaces the previous registration.
 *
 * These tabs are registered so that when the PaymentsView migrates from
 * GridJourney (RowInspector-based) to GridView (DetailSlideover-based),
 * the slide-over tab bar automatically includes Ledger, Allocations, and Receipt.
 */
export function registerPaymentTabs(): void {
  registerTabs('payment', [
    paymentLedgerTab,
    paymentAllocationsTab,
    paymentReceiptTab,
  ]);
}
