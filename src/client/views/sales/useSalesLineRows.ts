/**
 * useSalesLineRows — replaces lineRowsWithRule useMemo (SalesView.tsx:512-531).
 *
 * Pure derivation: order lines + reference data + customerId → enriched rows
 * with __rule and __dupSource tags. NO query inside — caller passes data.
 */
import { useMemo } from 'react';
import { resolvePricingRuleEntry } from '../../../shared/inventoryPricingShared';
import { duplicateSourceLineIds, type SalePrePostLine } from '../../components/SalePrePostStrip';
import { asRule, computeLineMarkup } from './salesPricing';
import type { GridRow } from '../../../shared/types';

export interface UseSalesLineRowsArgs {
  orderLines: GridRow[] | undefined;
  customers: ReadonlyArray<Record<string, unknown>> | undefined;
  defaultPricingRule: unknown;
  customerId: string;
}

export function useSalesLineRows(args: UseSalesLineRowsArgs): GridRow[] {
  const { orderLines, customers, defaultPricingRule, customerId } = args;
  return useMemo(() => {
    if (!orderLines) return [];
    const customerObj = (customers as Array<Record<string, unknown>> | undefined)
      ?.find((c) => c['id'] === customerId);
    const customerRule = asRule(customerObj?.['pricingRule']);
    const defaultsRule = asRule(defaultPricingRule);
    // UX-F04 — flag lines whose source key duplicates another line of the
    // same order (mirrors the postSalesOrder duplicate-source refusal).
    const dupIds = duplicateSourceLineIds(orderLines as SalePrePostLine[]);
    return (orderLines as GridRow[]).map((row) => {
      const rule = resolvePricingRuleEntry(
        customerRule,
        defaultsRule,
        row.batchCategory as string | null,
        row.batchSubcategory as string | null
      );
      const { markupDollars } = computeLineMarkup(row, rule);
      return { ...row, __rule: rule, markup: Number.isFinite(markupDollars) ? markupDollars : 0, __dupSource: dupIds.has(String(row.id ?? '')) };
    });
  }, [orderLines, customers, defaultPricingRule, customerId]);
}
