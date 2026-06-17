/**
 * SalesBuildMode — Phase 3B Mode B (building, customer selected).
 *
 * Renders when the Mercury retrofit flag is ON and a customer is selected
 * via ?customer=<uuid> URL param.
 *
 * Layout:
 *   1. SalesCustomerContextHeader — sticky 48px customer identity bar (UX-7)
 *   2. Primary surface below — the legacy SalesView (draft lines, suggestions,
 *      inventory finder, sale builder panel)
 *
 * Syncs the URL customer param → uiStore.activeCustomerId so the legacy
 * SalesView picks up the customer context. On unmount or clear, resets.
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 */
import { useEffect } from 'react';
import { LegacySalesView } from '../SalesView';
import { SalesCustomerContextHeader } from './SalesCustomerContextHeader';
import { useUiStore } from '../../store/uiStore';

export interface SalesBuildModeProps {
  customerId: string;
  onClear: () => void;
}

export function SalesBuildMode({ customerId, onClear }: SalesBuildModeProps) {
  const setActiveCustomerId = useUiStore((s) => s.setActiveCustomerId);

  // Sync URL customer param → store. The legacy SalesView's useEffect
  // (SalesView.tsx ~801-807) will pick up activeCustomerId and set its
  // local customerId, triggering workspace queries.
  useEffect(() => {
    setActiveCustomerId(customerId);
    // On unmount (e.g., navigated away), clear the global customer context
    // so the next view load doesn't re-enter build mode with a stale customer.
    return () => {
      setActiveCustomerId(null);
    };
  }, [customerId, setActiveCustomerId]);

  return (
    <div className="flex flex-col h-full">
      <SalesCustomerContextHeader customerId={customerId} onClear={onClear} />
      <div className="flex-1 overflow-hidden">
        <LegacySalesView />
      </div>
    </div>
  );
}
