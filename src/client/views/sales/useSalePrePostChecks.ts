/**
 * useSalePrePostChecks — replaces prePostChecks + prePostLineIssues useMemos
 * (SalesView.tsx:687-696).
 *
 * Returns both shapes the view consumes. Purely informational — the strip
 * never changes any button's disabled logic.
 */
import { useMemo } from 'react';
import { buildSalePrePostChecks, prePostIssuesByLineId, type SalePrePostCheck, type SalePrePostLine } from '../../components/SalePrePostStrip';

export interface UseSalePrePostChecksArgs {
  selectedOrder: { total?: unknown } | null | undefined;
  customer: { balance: number; creditLimit: number } | null | undefined;
  lines: SalePrePostLine[];
}

export interface UseSalePrePostChecksResult {
  checks: SalePrePostCheck[];
  issuesByLineId: ReturnType<typeof prePostIssuesByLineId>;
}

export function useSalePrePostChecks(args: UseSalePrePostChecksArgs): UseSalePrePostChecksResult {
  const { selectedOrder, customer, lines } = args;
  const checks = useMemo<SalePrePostCheck[]>(() => {
    if (!selectedOrder || !customer || !lines.length) return [];
    return buildSalePrePostChecks({
      orderTotal: Number(selectedOrder.total ?? 0),
      customerBalance: Number(customer.balance ?? 0),
      creditLimit: Number(customer.creditLimit ?? 0),
      lines
    });
  }, [selectedOrder, customer, lines]);
  const issuesByLineId = useMemo(() => prePostIssuesByLineId(checks), [checks]);
  return { checks, issuesByLineId };
}
