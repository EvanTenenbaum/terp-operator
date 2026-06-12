/**
 * UX-A15 — sheet-export partial-failure pill with a "Retry snapshot" action.
 *
 * The CSV download succeeds locally; only the Recent Sheets snapshot
 * (createCustomerSheetSnapshot) failed. The retry re-runs the EXISTING
 * snapshot call path with the exact payload captured at export time — it
 * never re-downloads the file and never re-derives rows that may have
 * changed since the export.
 */

export interface SnapshotRetryPillProps {
  error: string | null;
  /** False when no captured snapshot payload exists to retry. */
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
}

export function SnapshotRetryPill({ error, canRetry, busy, onRetry }: SnapshotRetryPillProps) {
  if (!error) return null;
  return (
    <>
      <span className="selection-pill danger" data-testid="snapshot-error-pill">{error}</span>
      <button
        type="button"
        className="secondary-button compact-action"
        data-testid="retry-snapshot"
        disabled={busy || !canRetry}
        title={!canRetry ? 'No snapshot payload captured — export the sheet again' : 'Retry saving the Recent Sheets snapshot (the file already downloaded)'}
        onClick={onRetry}
      >
        Retry snapshot
      </button>
    </>
  );
}
