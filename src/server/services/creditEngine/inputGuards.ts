// Centralized WHERE-clause helpers enforcing §1.0 universal input guards.
// Pass the table alias used in the calling query.
//
// Actual invoice/sales_order statuses are `open | partial | paid | reversed`.
// The reversed status is the application-level cancellation marker (see
// commandBus reverseCommand). Legacy `voided` is tolerated defensively so
// historical rows that may carry that value continue to be excluded.
export function invoiceGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status NOT IN ('reversed', 'voided')`;
}
export function salesOrderGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status NOT IN ('reversed', 'voided')`;
}
export function salesOrderLineGuardClause(a: string): string {
  return `${a}.qty > 0 AND ${a}.unit_cost > 0`;
}
export function paymentGuardClause(a: string): string {
  return `${a}.amount >= 0 AND ${a}.created_at <= now() AND ${a}.status = 'posted'`;
}
