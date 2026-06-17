/**
 * SalesBrowseMode — Phase 3B Mode A (browsing, no customer selected).
 *
 * Renders the existing SalesView layout. When the Mercury retrofit flag is ON
 * and no customer is selected via URL, this is the default surface.
 *
 * In the full Phase 3B, this adopts the GridView template. For the minimum
 * viable layout swap, it delegates to the legacy 1813-line SalesView unchanged.
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 */
import { LegacySalesView } from '../SalesView';

export interface SalesBrowseModeProps {
  /** Called when operator selects a customer — updates URL to ?customer=xxx */
  onCustomerSelect?: (customerId: string) => void;
}

export function SalesBrowseMode(_props: SalesBrowseModeProps) {
  // Minimum viable: render the full legacy SalesView.
  // Mode A → Mode B transition happens via keel bar (global customer selector),
  // which sets activeCustomerId in the store. The legacy SalesView already
  // responds to this. Full Phase 3B wires the customer cell click → URL param.
  return <LegacySalesView />;
}
