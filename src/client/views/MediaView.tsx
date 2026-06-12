import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { MediaBatchDrawer } from '../components/MediaBatchDrawer';
import { StatusPill } from '../components/StatusPill';
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

export function MediaView() {
  const grid = trpc.queries.grid.useQuery({ view: 'photography' });
  const rowCount = grid.data?.length ?? 0;
  const [selectedBatch, setSelectedBatch] = useState<{
    id: string;
    batchCode: string;
    name: string;
  } | null>(null);

  function handleSelectionChange(rows: GridRow[]) {
    const row = rows[0];
    setSelectedBatch(
      row
        ? { id: String(row.id), batchCode: String(row.batchCode ?? ''), name: String(row.name ?? '') }
        : null
    );
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
        </div>
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
