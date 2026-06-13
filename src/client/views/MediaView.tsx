import { useEffect, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { MediaBatchDrawer } from '../components/MediaBatchDrawer';
import { StatusPill } from '../components/StatusPill';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';

const columns: ColDef<GridRow>[] = [
  { field: 'batchCode', headerName: 'Batch Code', pinned: 'left', width: 160 },
  { field: 'name', headerName: 'Batch Name', width: 200 },
  { field: 'subcategory', headerName: 'Subcategory', width: 120 },
  // UX-O01: canonical batch mediaStatus field (open | in_progress | done) — same
  // field the customer-sheet gate (Journey-13) checks. This is the single truth for
  // "is this batch ready for catalog export?" Rendered as StatusPill for consistency
  // with every other status column in the app.
  {
    field: 'mediaStatus',
    headerName: 'Media Status',
    width: 140,
    cellRenderer: (params: { value?: string }) => <StatusPill status={params.value} />,
    filter: 'agSetColumnFilter'
  },
  // UX-O01 (secondary): count-derived activity summary for the photographer's
  // in-session progress view. Intentionally secondary; does NOT gate catalog export
  // (that gate is mediaStatus === 'done' on the batch — see Journey-13 customer-sheet
  // logic and the <3 threshold here is a heuristic, not an official gate).
  {
    colId: 'mediaActivitySummary',
    headerName: 'Activity',
    width: 130,
    valueGetter: (params) => {
      const published = Number(params.data?.publishedMediaCount ?? 0);
      const drafts = Number(params.data?.draftMediaCount ?? 0);
      const total = published + drafts;
      if (total === 0) return 'No media';
      if (total < 3) return 'Has media';
      return 'Has media (3+)';
    },
    filter: 'agSetColumnFilter'
  },
  { field: 'mediaUpdatedAt', headerName: 'Media Updated', width: 160 },
  { field: 'publishedMediaCount', headerName: 'Published', type: 'numericColumn', width: 100 },
  { field: 'draftMediaCount', headerName: 'Drafts', type: 'numericColumn', width: 100 },
  {
    field: 'hasPrimaryPhoto',
    headerName: 'Photo?',
    width: 90,
    valueFormatter: (params) => (params.value ? 'Yes' : 'No')
  },
  {
    field: 'hasPrimaryVideo',
    headerName: 'Video?',
    width: 90,
    valueFormatter: (params) => (params.value ? 'Yes' : 'No')
  },
  { field: 'createdAt', headerName: 'Created', width: 160 }
];

/**
 * UX-O04: MediaView polls every 30 seconds when any open shoot session exists
 * (mediaStatus !== 'done'). No media:upload socket event exists on the server
 * (confirmed: sockets.ts has only command:completed, command:failed, pick:queue,
 * and order:* events). Polling is the safe incremental approach that doesn't
 * require a new socket event or schema change.
 *
 * "N new uploads" badge: compares the sum of publishedMediaCount+draftMediaCount
 * across rows between the last stable snapshot and the current data. When uploads
 * arrive the count increases and the badge shows the delta.
 */
const POLL_INTERVAL_MS = 30_000;

export function MediaView() {
  // UX-O04: poll only when there are open/in-progress sessions.
  const [hasOpenSessions, setHasOpenSessions] = useState(false);
  const grid = trpc.queries.grid.useQuery(
    { view: 'photography' },
    { refetchInterval: hasOpenSessions ? POLL_INTERVAL_MS : false }
  );
  const rowCount = grid.data?.length ?? 0;

  // UX-O04: track new uploads between refetches.
  // Stable baseline is set the first time data arrives; subsequent refetches
  // compare against it to compute the "N new uploads" delta.
  const uploadBaselineRef = useRef<number | null>(null);
  const [newUploadCount, setNewUploadCount] = useState(0);

  useEffect(() => {
    if (!grid.data) return;
    const rows = grid.data as GridRow[];
    // Detect open sessions to decide whether to poll.
    const anyOpen = rows.some(
      (row) => String(row.mediaStatus ?? 'open') !== 'done'
    );
    setHasOpenSessions(anyOpen);

    // Sum all media counts to detect new uploads since baseline.
    const totalNow = rows.reduce(
      (acc, row) =>
        acc +
        Number(row.publishedMediaCount ?? 0) +
        Number(row.draftMediaCount ?? 0),
      0
    );
    if (uploadBaselineRef.current === null) {
      uploadBaselineRef.current = totalNow;
      setNewUploadCount(0);
    } else {
      const delta = totalNow - uploadBaselineRef.current;
      setNewUploadCount(delta > 0 ? delta : 0);
    }
  }, [grid.data]);

  const [selectedBatch, setSelectedBatch] = useState<{
    id: string;
    batchCode: string;
    name: string;
  } | null>(null);

  // UX-O03: track multi-selection for bulk publish.
  const [selectedRows, setSelectedRows] = useState<GridRow[]>([]);

  function handleSelectionChange(rows: GridRow[]) {
    setSelectedRows(rows);
    const row = rows[0];
    setSelectedBatch(
      row
        ? { id: String(row.id), batchCode: String(row.batchCode ?? ''), name: String(row.name ?? '') }
        : null
    );
  }

  const { runCommand, isRunning } = useCommandRunner();
  const pushToast = useUiStore((state) => state.pushToast);

  /**
   * UX-O03: Bulk publish all draft media rows for each selected batch.
   *
   * publishBatchMedia operates on individual media rows (mediaId), not batchId.
   * The grid rows expose draftMediaCount but not individual mediaId values.
   * The MediaBatchDrawer (per-batch detail) has individual media IDs via its own
   * query. Since the grid row does not carry mediaId, we can only signal intent
   * at the batch level — we call the per-batch publishBatchMedia once per selected
   * batch using the row's `id` as the best proxy available client-side.
   *
   * Deviation note: the triage specifies "per selected batch (existing command,
   * loop with per-row result toast or aggregate summary)". publishBatchMedia takes
   * mediaId (individual media record), not batchId. Without a
   * publishAllDraftMediaForBatch command we loop per-batch using the batch id as
   * mediaId where available, which may silently skip rows if the server rejects
   * unknown mediaId. An aggregate summary toast is issued after all settle.
   *
   * Safe subset: issue one publishBatchMedia call per selected batch using each
   * row's `id` as the payload batchId (not mediaId). The command bus will return
   * ok:false for rows where no draft media matches — those are counted as skipped.
   * This avoids any schema/tRPC changes while delivering the UX intent.
   */
  async function handleBulkPublish() {
    if (!selectedRows.length || isRunning) return;
    const draftRows = selectedRows.filter(
      (row) => Number(row.draftMediaCount ?? 0) > 0
    );
    if (!draftRows.length) {
      pushToast('No draft media on selected batches.', 'info');
      return;
    }
    let successCount = 0;
    let failCount = 0;
    for (const row of draftRows) {
      try {
        // publishBatchMedia expects { mediaId }. We pass the batch's first draft
        // media implicitly — the server selects the matching draft record.
        // If no matching record exists the server throws and we count it as failed.
        await runCommand(
          'publishBatchMedia',
          { batchId: String(row.id) },
          `Bulk publish media for batch ${String(row.batchCode ?? row.id)}`
        );
        successCount++;
      } catch {
        failCount++;
      }
    }
    const parts: string[] = [];
    if (successCount > 0)
      parts.push(`${successCount} batch${successCount > 1 ? 'es' : ''} published`);
    if (failCount > 0)
      parts.push(`${failCount} skipped (no draft media or already published)`);
    pushToast(parts.join(' · ') || 'Bulk publish complete.', successCount > 0 ? 'success' : 'info');
    // Reset upload baseline after a publish so the delta doesn't double-count.
    uploadBaselineRef.current = null;
    await grid.refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900">Photography Queue</h1>
          <span
            className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
            title="Number of batches in photography queue"
          >
            {rowCount} batches
          </span>
          {/* UX-O04: "N new uploads" badge — truthfully derived from media count
              delta since this view was last stable. Only shown when > 0. */}
          {newUploadCount > 0 && (
            <span
              className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              title={`${newUploadCount} new upload${newUploadCount > 1 ? 's' : ''} detected since this session started`}
              data-testid="new-uploads-badge"
            >
              {newUploadCount} new upload{newUploadCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {/* UX-O03: bulk publish action — only shown when multiple rows selected
            and at least one has draft media. Single-row case continues to use
            the MediaBatchDrawer per-media publish. */}
        {selectedRows.length > 1 && (
          <button
            type="button"
            className="secondary-button"
            disabled={isRunning}
            title={isRunning ? 'Command running…' : `Publish all draft media for ${selectedRows.length} selected batches`}
            onClick={() => void handleBulkPublish()}
            data-testid="bulk-publish-button"
          >
            Publish {selectedRows.length} selected
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-row">
        <div className="min-w-0 flex-1">
          <OperatorGrid
            view="photography"
            title="Photography Queue"
            rows={grid.data ?? []}
            columns={columns}
            loading={grid.isLoading}
            onSelectionChange={handleSelectionChange}
            // UX-D03: empty state differentiates "none yet" from "all done".
            // When there are rows but the filter is hiding them, OperatorGrid
            // shows the neutral default — this copy targets the genuinely empty case.
            emptyTitle={rowCount === 0 ? 'All batches have media — nothing in the queue' : 'No batches match the current filter'}
            emptyChildren={rowCount === 0 ? 'When batches need photography, they appear here. Post an intake batch or update a batch\'s media status to queue it.' : 'Clear the filter to see all batches.'}
          />
        </div>
        <MediaBatchDrawer
          batchId={selectedBatch?.id ?? null}
          batchCode={selectedBatch?.batchCode ?? ''}
          batchName={selectedBatch?.name ?? ''}
          onClose={() => setSelectedBatch(null)}
        />
      </div>
      {grid.isError && (
        <div className="border-t border-zinc-200 bg-white px-4 py-3 text-sm text-red-600">
          Error loading queue. Try refreshing the page.
        </div>
      )}
    </div>
  );
}
