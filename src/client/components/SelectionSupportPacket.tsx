import { FileDown } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { GridRow } from '../../shared/types';

/**
 * UX-M02: "Export support packet for selection" — appears on the RowInspector
 * Issue tab for any grid that provides selected rows.
 *
 * Reuses RecoveryView's `downloadJson` pattern (extracted here as a shared
 * util so it is not duplicated). The packet contains the selected row IDs,
 * related command journal entries whose affected_ids overlap the selection,
 * and any command rows whose id matches the selection directly (to capture
 * command journal rows selected in the Recovery grid itself).
 *
 * Mount point for the orchestrator:
 *   In IssueSidecar.tsx / IssueActionsBody, render:
 *     <SelectionSupportPacket rows={[row]} view={view} />
 *   The component is self-contained and safe to add to any canWrite-gated
 *   Issue tab without touching the existing IssueActionsBody logic.
 */
export function SelectionSupportPacket({ rows, view }: { rows: GridRow[]; view: string }) {
  const rowIds = rows.map((r) => r.id).filter((id): id is string => typeof id === 'string' && id.length > 0);

  // Lazy query — only fires when the button is clicked.
  const packet = trpc.queries.selectionSupportPacket.useQuery(
    { rowIds },
    { enabled: false }
  );

  async function handleExport() {
    const result = await packet.refetch();
    if (result.data) {
      downloadJson(
        `terp-support-packet-${view}-${new Date().toISOString().slice(0, 10)}.json`,
        { ...result.data, view, exportedAt: new Date().toISOString() }
      );
    }
  }

  if (rowIds.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <p className="text-xs text-zinc-500 mb-2">
        Export selected rows + their command history as a JSON support packet.
      </p>
      <button
        type="button"
        className="secondary-button w-fit"
        disabled={packet.isFetching}
        onClick={() => void handleExport()}
        data-testid="export-support-packet-btn"
      >
        <FileDown className="h-4 w-4" aria-hidden="true" />
        {packet.isFetching ? 'Preparing…' : 'Export support packet'}
      </button>
    </div>
  );
}

/** Shared JSON download utility — extracted from RecoveryView for reuse. */
export function downloadJson(filename: string, value: unknown) {
  if (!value) return;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
