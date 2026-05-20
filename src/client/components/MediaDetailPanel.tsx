import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { WorkspacePanel } from './WorkspacePanel';
import { ImageIcon, VideoIcon, Copy, ExternalLink } from 'lucide-react';

interface MediaDetailPanelProps {
  batchId: string;
}

export function MediaDetailPanel({ batchId }: MediaDetailPanelProps) {
  const query = trpc.queries.batchMediaList.useQuery({ batchId });
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const { runCommand } = useCommandRunner();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const mobileUrl = `${window.location.origin}/photography/mobile/${batchId}`;

  async function copyMobileLink() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(mobileUrl);
    }
  }

  function openMobileUpload() {
    window.open(mobileUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <WorkspacePanel
      panelId={`media-detail:${batchId}`}
      title="Batch Media"
      actions={
        navigator.clipboard ? (
          <button type="button" className="secondary-button compact-action" onClick={copyMobileLink}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy mobile upload link
          </button>
        ) : (
          <button type="button" className="secondary-button compact-action" onClick={openMobileUpload}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open mobile upload
          </button>
        )
      }
    >
      {query.isLoading ? (
        <div className="p-4 text-sm text-zinc-600">Loading media...</div>
      ) : query.isError ? (
        <div className="p-4 text-sm text-red-600">
          Error loading media.
          <button type="button" className="secondary-button compact-action ml-2" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : !query.data?.length ? (
        <div className="p-4 text-sm text-zinc-600">
          No media yet.
          <button type="button" className="secondary-button compact-action ml-2" onClick={openMobileUpload}>
            Upload media
          </button>
        </div>
      ) : (
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((media) => (
                <tr key={media.id}>
                  <td>
                    {media.hasThumbnail && media.mediaType === 'photo' ? (
                      <img
                        src={`/api/media/${media.id}/thumb`}
                        alt={String(media.originalFilename)}
                        className="h-10 w-10 object-cover"
                      />
                    ) : media.mediaType === 'video' ? (
                      <VideoIcon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                    )}
                  </td>
                  <td>{String(media.originalFilename)}</td>
                  <td>{String(media.mediaType)}</td>
                  <td>
                    <span className="selection-pill">{String(media.role)}</span>
                  </td>
                  <td>
                    <span className="selection-pill">{String(media.status)}</span>
                  </td>
                  <td>{media.publishedAt ? new Date(media.publishedAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {canWrite && (
                        <>
                          {media.mediaType === 'photo' && media.role !== 'primary_photo' && (
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={() =>
                                runCommand('setBatchMediaRole', { mediaId: media.id, role: 'primary_photo' }, 'Set primary photo')
                              }
                            >
                              Set primary photo
                            </button>
                          )}
                          {media.mediaType === 'video' && media.role !== 'primary_video' && (
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={() =>
                                runCommand('setBatchMediaRole', { mediaId: media.id, role: 'primary_video' }, 'Set primary video')
                              }
                            >
                              Set primary video
                            </button>
                          )}
                          {media.role !== 'additional' && (
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={() =>
                                runCommand('setBatchMediaRole', { mediaId: media.id, role: 'additional' }, 'Demote media')
                              }
                            >
                              Demote
                            </button>
                          )}
                          {media.status === 'draft' && (
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={() => runCommand('publishBatchMedia', { mediaId: media.id }, 'Publish media')}
                            >
                              Publish
                            </button>
                          )}
                          {confirmDeleteId === media.id ? (
                            <>
                              <button
                                type="button"
                                className="secondary-button compact-action text-red-600"
                                onClick={() => {
                                  runCommand('deleteBatchMedia', { mediaId: media.id }, 'Delete media');
                                  setConfirmDeleteId(null);
                                }}
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                className="secondary-button compact-action"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="secondary-button compact-action"
                              onClick={() => setConfirmDeleteId(media.id)}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkspacePanel>
  );
}
