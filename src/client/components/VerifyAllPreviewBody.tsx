import { formatMoney } from '../utils/format';
import type { IntakeBatchRow } from '../views/IntakeView.types';

interface Props {
  batches: IntakeBatchRow[];
  vendor: string | null;
}

/**
 * VerifyAllPreviewBody — rich body rendered inside the useConfirm() dialog
 * when the operator clicks "Verify all" on an intake PO (TER-1621, F-29).
 *
 * Shows one row per pending batch (status, expected qty, actual qty, reason),
 * highlights qty discrepancies in amber, and summarises batch count, total
 * committed value, and the vendor name in a footer.
 *
 * Uses existing finder-table / selection-pill semantic classes — no new CSS.
 */
export function VerifyAllPreviewBody({ batches, vendor }: Props) {
  // Only show batches that are still pending (the ones verify-all will commit).
  const pendingBatches = batches.filter((b) =>
    ['draft', 'ready', 'needs_fix'].includes(b.status)
  );

  // totalCommitted = sum of (actual intake qty × unit cost) across pending batches.
  const totalCommitted = pendingBatches.reduce((sum, b) => {
    return sum + Number(b.intakeQty || 0) * Number(b.unitCost || 0);
  }, 0);

  return (
    <div className="mt-1">
      <p className="mb-2 text-sm text-zinc-600">
        This will accept every pending batch on this PO as-is and post the receipt.
      </p>
      <div className="finder-table-wrap max-h-64 overflow-auto">
        <table className="finder-table">
          <thead>
            <tr>
              <th>Batch</th>
              <th>Status</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {pendingBatches.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-zinc-400">
                  No pending batches
                </td>
              </tr>
            ) : (
              pendingBatches.map((batch) => {
                const expected =
                  batch.expectedQty != null ? Number(batch.expectedQty) : null;
                const actual = Number(batch.intakeQty || 0);
                const hasDiscrepancy =
                  expected != null && actual !== expected;
                return (
                  <tr key={batch.id}>
                    <td className="font-mono text-xs">{batch.batchCode}</td>
                    <td>
                      <span className="selection-pill">{batch.status}</span>
                    </td>
                    <td className="tabular-nums">
                      {expected != null ? expected.toFixed(3) : '—'}
                    </td>
                    <td
                      className={
                        hasDiscrepancy
                          ? 'tabular-nums font-medium text-amber-700'
                          : 'tabular-nums'
                      }
                    >
                      {actual.toFixed(3)}
                      {hasDiscrepancy ? ' ⚠' : ''}
                    </td>
                    <td className="max-w-xs truncate text-xs text-zinc-500">
                      {batch.discrepancyReason ?? ''}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {pendingBatches.length} batch{pendingBatches.length !== 1 ? 'es' : ''}{' '}
        · {formatMoney(totalCommitted)} total committed
        {vendor ? ` · Vendor: ${vendor}` : ''}
      </p>
    </div>
  );
}
