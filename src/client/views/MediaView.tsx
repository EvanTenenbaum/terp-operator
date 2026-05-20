import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { MediaDetailPanel } from '../components/MediaDetailPanel';
import type { GridRow } from '../../shared/types';
import { Copy, ExternalLink } from 'lucide-react';

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
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  function handleSelectionChange(rows: GridRow[]) {
    setSelectedBatchId(rows[0]?.id ?? null);
  }

  function mobileUrl(batchId: string) {
    return `${window.location.origin}/photography/mobile/${batchId}`;
  }

  function copyMobileLink(batchId: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(mobileUrl(batchId));
    }
  }

  function openMobileUpload(batchId: string) {
    window.open(mobileUrl(batchId), '_blank', 'noopener,noreferrer');
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
      <div className="min-h-0 flex-1">
        <OperatorGrid
          view="photography"
          title="Photography Queue"
          rows={grid.data ?? []}
          columns={columns}
          loading={grid.isLoading}
          onSelectionChange={handleSelectionChange}
          selectionActions={(rows) => {
            const batchId = rows[0]?.id;
            if (!batchId || typeof batchId !== 'string') return null;
            return (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Open media</span>
                {navigator.clipboard ? (
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    onClick={() => copyMobileLink(batchId)}
                    title="Copy mobile upload link"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Mobile link
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    onClick={() => openMobileUpload(batchId)}
                    title="Open mobile upload in new tab"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Mobile upload
                  </button>
                )}
              </div>
            );
          }}
        />
      </div>
      {grid.isError ? (
        <div className="border-t border-zinc-200 bg-white px-4 py-3 text-sm text-red-600">
          Error loading queue. Try refreshing the page.
        </div>
      ) : selectedBatchId ? (
        <div className="border-t border-zinc-200">
          <MediaDetailPanel batchId={selectedBatchId} />
        </div>
      ) : (
        <div className="border-t border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          Select a batch to manage its media
        </div>
      )}
    </div>
  );
}
