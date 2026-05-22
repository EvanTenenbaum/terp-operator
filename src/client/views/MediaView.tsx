import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { MediaBatchDrawer } from '../components/MediaBatchDrawer';
import type { GridRow } from '../../shared/types';

const columns: ColDef<GridRow>[] = [
  { field: 'batchCode', headerName: 'Batch Code', pinned: 'left', width: 160 },
  { field: 'name', headerName: 'Batch Name', width: 200 },
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
