import { useSearchParams } from 'react-router-dom';
import { SalesBrowseMode } from './sales/SalesBrowseMode';
import { SalesBuildMode } from './sales/SalesBuildMode';

/**
 * SalesView — mode router.
 *
 *   - No ?customer=<uuid> param → SalesBrowseMode (Mode A — browsing)
 *   - ?customer=<uuid> present    → SalesBuildMode (Mode B — building)
 *
 * Mode A → Mode B transition: set ?customer=<uuid> in the URL (e.g., via
 * keel bar global customer selector or customer cell click).
 *
 * Mode B → Mode A transition: clear the ?customer param (via the context
 * header's [Clear] button).
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 */
export function SalesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const customerId = searchParams.get('customer') ?? '';

  function handleClearCustomer() {
    setSearchParams({});
  }

  function handleCustomerSelect(id: string) {
    setSearchParams({ customer: id });
  }

  if (customerId) {
    return (
      <SalesBuildMode
        customerId={customerId}
        onClear={handleClearCustomer}
      />
    );
  }

  return (
    <SalesBrowseMode
      onCustomerSelect={handleCustomerSelect}
    />
  );
}
