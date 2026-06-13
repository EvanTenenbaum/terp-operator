import { ImageIcon, VideoIcon } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../server/routers';
import { useCommandRunner } from './useCommandRunner';

type RouterOutput = inferRouterOutputs<AppRouter>;
export type MediaItem = RouterOutput['queries']['batchMediaList'][number];
export type MediaListQuery = {
  isLoading: boolean;
  isError: boolean;
  data: MediaItem[] | undefined;
  refetch: () => void;
};
type RunCommand = ReturnType<typeof useCommandRunner>['runCommand'];

export interface MediaListProps {
  query: MediaListQuery;
  canWrite: boolean;
  runCommand: RunCommand;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
}

export function MediaList({
  query,
  canWrite,
  runCommand,
  confirmDeleteId,
  setConfirmDeleteId,
}: MediaListProps) {
  if (query.isLoading) {
    return <div className="p-4 text-sm text-zinc-600">Loading media...</div>;
  }

  if (query.isError) {
    return (
      <div className="p-4 text-sm text-red-600">
        Error loading media.
        <button
          type="button"
          className="secondary-button compact-action ml-2"
          onClick={() => query.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!query.data?.length) {
    return <div className="p-4 text-sm text-zinc-600">No media yet.</div>;
  }

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
              <td>
                {media.publishedAt
                  ? new Date(media.publishedAt).toLocaleDateString('en-US')
                  : '—'}
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {canWrite && (
                    <>
                      {media.mediaType === 'photo' && media.role !== 'primary_photo' && (
                        <button
                          type="button"
                          className="secondary-button compact-action"
                          onClick={() =>
                            void runCommand(
                              'setBatchMediaRole',
                              { mediaId: media.id, role: 'primary_photo' },
                              'Set primary photo'
                            )
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
                            void runCommand(
                              'setBatchMediaRole',
                              { mediaId: media.id, role: 'primary_video' },
                              'Set primary video'
                            )
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
                            void runCommand(
                              'setBatchMediaRole',
                              { mediaId: media.id, role: 'additional' },
                              'Demote media'
                            )
                          }
                        >
                          Demote
                        </button>
                      )}
                      {media.status === 'draft' && (
                        <button
                          type="button"
                          className="secondary-button compact-action"
                          onClick={() =>
                            void runCommand(
                              'publishBatchMedia',
                              { mediaId: media.id },
                              'Publish media'
                            )
                          }
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
                              void runCommand(
                                'deleteBatchMedia',
                                { mediaId: media.id },
                                'Delete media'
                              );
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
  );
}
