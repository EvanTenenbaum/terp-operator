// Centralized WHERE-clause helpers enforcing §1.0 universal input guards.
// Pass the table alias used in the calling query.
export function invoiceGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status != 'voided'`;
}
export function salesOrderGuardClause(a: string): string {
  return `${a}.total >= 0 AND ${a}.created_at <= now() AND ${a}.status != 'voided'`;
}
export function salesOrderLineGuardClause(a: string): string {
  return `${a}.qty > 0 AND ${a}.unit_cost > 0`;
}
export function paymentGuardClause(a: string): string {
  return `${a}.amount >= 0 AND ${a}.created_at <= now() AND ${a}.status = 'posted'`;
}
