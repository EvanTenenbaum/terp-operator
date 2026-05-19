import { describe, it, expect } from 'vitest';
import {
  invoiceGuardClause,
  salesOrderGuardClause,
  salesOrderLineGuardClause,
  paymentGuardClause
} from './inputGuards';

describe('input guard clauses', () => {
  it('invoice guard rejects negative totals, future dates, and voided rows', () => {
    expect(invoiceGuardClause('inv')).toBe(
      `inv.total >= 0 AND inv.created_at <= now() AND inv.status != 'voided'`
    );
  });
  it('sales_order guard rejects negative totals, future-posted, and voided rows', () => {
    expect(salesOrderGuardClause('so')).toBe(
      `so.total >= 0 AND so.created_at <= now() AND so.status != 'voided'`
    );
  });
  it('sales_order_lines guard rejects non-positive qty and unit_cost', () => {
    expect(salesOrderLineGuardClause('sol')).toBe(
      `sol.qty > 0 AND sol.unit_cost > 0`
    );
  });
  it('payment guard rejects negative amounts, future, non-posted', () => {
    expect(paymentGuardClause('p')).toBe(
      `p.amount >= 0 AND p.created_at <= now() AND p.status = 'posted'`
    );
  });
});
