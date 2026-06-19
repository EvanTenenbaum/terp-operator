/**
 * SalesCustomerContextHeader — Phase 3B Mode B context header (UX-7).
 *
 * Sticky 48px strip shown above the draft lines grid when a customer is
 * selected. Displays customer identity, balance, credit status, and
 * controls for clearing selection or opening customer detail.
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 */
import { X, Pencil } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useUiStore } from '../../store/uiStore';
import { formatMoney } from '../../utils/format';

export interface SalesCustomerContextHeaderProps {
  customerId: string;
  onClear: () => void;
}

export function SalesCustomerContextHeader({ customerId, onClear }: SalesCustomerContextHeaderProps) {
  // Lightweight customer workspace query — React Query deduplicates with the
  // same query key used by the legacy SalesView workspace panel.
  const workspace = trpc.queries.customerWorkspace.useQuery(
    { customerId },
    { enabled: Boolean(customerId), staleTime: 30_000 }
  );
  const creditStatus = trpc.credit.customerCreditStatus.useQuery(
    { customerId },
    { enabled: Boolean(customerId), staleTime: 30_000 }
  );

  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);

  const name = (workspace.data?.customer?.name as string) ?? '…';
  const balance = Number(workspace.data?.customer?.balance ?? 0);
  const creditLimit = Number(
    creditStatus.data?.customer?.creditLimit ?? workspace.data?.customer?.creditLimit ?? 0
  );
  const creditOk = creditLimit > 0 ? balance <= creditLimit : null; // null = no limit set

  function openCustomerDetail() {
    setDrawerEntity('sales', 'customer', customerId);
    setDrawerState('sales', 'standard');
  }

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between h-12 px-4 border-b border-line bg-white shrink-0">
      <div className="flex items-center gap-3 text-sm min-w-0">
        <span className="font-medium text-ink shrink-0">Customer:</span>
        <span className="truncate">{name}</span>
        <span className="text-zinc-400 shrink-0">·</span>
        <span className="shrink-0">Balance: {formatMoney(balance)}</span>
        {creditOk != null ? (
          <>
            <span className="text-zinc-400 shrink-0">·</span>
            <span className={creditOk ? 'text-green-700 shrink-0' : 'text-red-600 shrink-0'}>
              Credit: {creditOk ? '✓' : '⛔'}
            </span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={openCustomerDetail}
          className="secondary-button compact-action"
          type="button"
          title="Open customer detail"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={onClear}
          className="secondary-button compact-action"
          type="button"
          title="Clear customer selection"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
