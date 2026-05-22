import { useState } from 'react';
import { X, ImageIcon, VideoIcon } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';

export interface MediaBatchDrawerProps {
  batchId: string;
  batchCode: string;
  batchName: string;
  onClose: () => void;
}

export function MediaBatchDrawer({ batchId, batchCode, batchName, onClose }: MediaBatchDrawerProps) {
  const query = trpc.queries.batchMediaList.useQuery({ batchId });
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const { runCommand } = useCommandRunner();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <aside className="media-batch-drawer media-batch-drawer-open" aria-label="Batch media">
      <div className="media-batch-drawer-header">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{batchCode}</div>
          <div className="truncate text-xs text-zinc-500">{batchName}</div>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close batch media drawer"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="media-batch-drawer-body">
        <MediaList
          query={query}
          canWrite={canWrite}
          runCommand={runCommand}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
        />
      </div>
    </aside>
  );
}

type QueryResult = ReturnType<typeof trpc.queries.batchMediaList.useQuery>;
type RunCommand = ReturnType<typeof useCommandRunner>['runCommand'];

interface BatchMediaRow {
  id: string;
  batchId: string;
  mediaType: string;
  role: string;
  status: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  hasThumbnail: boolean;
  publishedAt: string | null;
  replacedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function MediaList({ query, canWrite, runCommand, confirmDeleteId, setConfirmDeleteId }: {
  query: QueryResult;
  canWrite: boolean;
  runCommand: RunCommand;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
}) {
  if (query.isLoading) return <div className="p-4 text-sm text-zinc-600">Loading media...</div>;
  if (query.isError) return (
    <div className="p-4 text-sm text-red-600">
      Error loading media.
      <button type="button" className="secondary-button compact-action ml-2" onClick={() => query.refetch()}>
        Retry
      </button>
    </div>
  );
  const mediaRows = (query.data ?? []) as BatchMediaRow[];
  if (!mediaRows.length) return <div className="p-4 text-sm text-zinc-600">No media yet.</div>;

  return (
    <div className="finder-table-wrap">
      <table className="finder-table">
        <thead>
          <tr>
            <th>Preview</th>
            <th>Filename</th>
            <th>Type</th>
            <th>Role</th>
            <th>Status</th>
            <th>Published</th>
            {canWrite && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {mediaRows.map((media) => (
            <tr key={media.id}>
              <td>
                {media.hasThumbnail && media.mediaType === 'photo' ? (
                  <img src={`/api/media/${media.id}/thumb`} alt={String(media.originalFilename)} className="h-10 w-10 object-cover" />
                ) : media.mediaType === 'video' ? (
                  <VideoIcon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                )}
              </td>
              <td>{String(media.originalFilename)}</td>
              <td>{String(media.mediaType)}</td>
              <td><span className="selection-pill">{String(media.role)}</span></td>
              <td><span className="selection-pill">{String(media.status)}</span></td>
              <td>{media.publishedAt ? new Date(media.publishedAt).toLocaleDateString() : '—'}</td>
              {canWrite && (
                <td>
                  <div className="flex flex-wrap gap-1">
                    {media.mediaType === 'photo' && media.role !== 'primary_photo' && (
                      <button type="button" className="secondary-button compact-action"
                        onClick={() => runCommand('setBatchMediaRole', { mediaId: media.id, role: 'primary_photo' }, 'Set primary photo')}>
                        Set primary photo
                      </button>
                    )}
                    {media.mediaType === 'video' && media.role !== 'primary_video' && (
                      <button type="button" className="secondary-button compact-action"
                        onClick={() => runCommand('setBatchMediaRole', { mediaId: media.id, role: 'primary_video' }, 'Set primary video')}>
                        Set primary video
                      </button>
                    )}
                    {media.role !== 'additional' && (
                      <button type="button" className="secondary-button compact-action"
                        onClick={() => runCommand('setBatchMediaRole', { mediaId: media.id, role: 'additional' }, 'Demote media')}>
                        Demote
                      </button>
                    )}
                    {media.status === 'draft' && (
                      <button type="button" className="secondary-button compact-action"
                        onClick={() => runCommand('publishBatchMedia', { mediaId: media.id }, 'Publish media')}>
                        Publish
                      </button>
                    )}
                    {confirmDeleteId === media.id ? (
                      <>
                        <button type="button" className="secondary-button compact-action text-red-600"
                          onClick={() => { runCommand('deleteBatchMedia', { mediaId: media.id }, 'Delete media'); setConfirmDeleteId(null); }}>
                          Confirm delete
                        </button>
                        <button type="button" className="secondary-button compact-action" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="secondary-button compact-action" onClick={() => setConfirmDeleteId(media.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
