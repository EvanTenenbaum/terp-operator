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
  const canMintShareLink = me.data?.role === 'manager' || me.data?.role === 'owner';
  const { runCommand } = useCommandRunner();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<{ url: string; expiresAt: string; tokenId: string } | null>(null);

  const mobileUrl = `${window.location.origin}/photography/mobile/${batchId}`;

  async function copyMobileLink() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(mobileUrl);
    }
  }

  function openMobileUpload() {
    window.open(mobileUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleMintShareLink() {
    // Mint a 120-minute upload-only share link for a field photographer.
    // The raw token is returned exactly once in result.delta and embedded in
    // the share URL — neither the token nor the URL is ever persisted in
    // client state once the photographer has used it.
    const result = await runCommand(
      'mintPhotoUploadToken',
      { batchId, ttlMinutes: 120 },
      'Mint upload-only share link for field photographer'
    );
    const delta = result.delta as { token?: string; tokenId?: string; expiresAt?: string } | undefined;
    if (delta?.token && delta?.tokenId && delta?.expiresAt) {
      const url = `${mobileUrl}?token=${encodeURIComponent(delta.token)}`;
      setShareLink({ url, expiresAt: delta.expiresAt, tokenId: delta.tokenId });
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url).catch(() => {});
      }
    }
  }

  async function handleRevokeShareLink() {
    if (!shareLink) return;
    await runCommand(
      'revokePhotoUploadToken',
      { tokenId: shareLink.tokenId },
      'Revoke upload share link'
    );
    setShareLink(null);
  }

  return (
    <WorkspacePanel
      panelId={`media-detail:${batchId}`}
      title="Batch Media"
      actions={
        <div className="flex flex-wrap gap-2">
          {navigator.clipboard ? (
            <button type="button" className="secondary-button compact-action" onClick={copyMobileLink}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy mobile upload link
            </button>
          ) : (
            <button type="button" className="secondary-button compact-action" onClick={openMobileUpload}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open mobile upload
            </button>
          )}
          {canMintShareLink && (
            <button type="button" className="secondary-button compact-action" onClick={handleMintShareLink}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Mint share link (2h)
            </button>
          )}
        </div>
      }
    >
      {shareLink && (
        <div className="border border-line bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-900">Share link minted — copy now, it will not be shown again.</div>
          <div className="mt-1 break-all font-mono text-xs text-amber-800">{shareLink.url}</div>
          <div className="mt-1 text-xs text-amber-700">
            Expires {new Date(shareLink.expiresAt).toLocaleString()}.{' '}
            <button type="button" className="underline" onClick={handleRevokeShareLink}>
              Revoke now
            </button>
          </div>
        </div>
      )}
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
