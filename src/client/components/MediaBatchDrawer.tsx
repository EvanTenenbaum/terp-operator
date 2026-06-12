import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { Copy, ExternalLink } from 'lucide-react';
import { MediaList } from './MediaList';
import { InspectorDrawer } from './templates';

interface MediaBatchDrawerProps {
  batchId: string | null;
  batchCode: string;
  batchName: string;
  onClose: () => void;
}

interface UploadEntry {
  filename: string;
  percent: number;
  done: boolean;
  error?: string;
}

export function MediaBatchDrawer({ batchId, batchCode, batchName, onClose }: MediaBatchDrawerProps) {
  const query = trpc.queries.batchMediaList.useQuery(
    { batchId: batchId ?? '' },
    { enabled: !!batchId }
  );
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canMintShareLink = me.data?.role === 'manager' || me.data?.role === 'owner';
  const { runCommand } = useCommandRunner();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<{ url: string; expiresAt: string; tokenId: string } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  const mobileUrl = `${window.location.origin}/photography/mobile/${batchId ?? ''}`;

  async function copyMobileLink() {
    if (navigator.clipboard) await navigator.clipboard.writeText(mobileUrl);
  }

  function openMobileUpload() {
    window.open(mobileUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleMintShareLink() {
    const result = await runCommand(
      'mintPhotoUploadToken',
      { batchId, ttlMinutes: 120 },
      'Mint upload-only share link for field photographer'
    );
    const delta = result.delta as { token?: string; tokenId?: string; expiresAt?: string } | undefined;
    if (delta?.token && delta?.tokenId && delta?.expiresAt) {
      const url = `${mobileUrl}?token=${encodeURIComponent(delta.token)}`;
      setShareLink({ url, expiresAt: delta.expiresAt, tokenId: delta.tokenId });
      if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => {});
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

  // Fix 2: async per-file handler so handleFiles can await completion
  async function handleFileUpload(file: File): Promise<void> {
    // Fix 2: push progress entry before XHR starts
    setUploads((prev) => [...prev, { filename: file.name, percent: 0, done: false }]);

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      // Fix 1 (CRITICAL): batchId must appear before file in the multipart stream
      // so multer's destination callback can read req.body.batchId synchronously.
      formData.append('batchId', batchId!);
      formData.append('file', file);

      // Fix 2: wire upload progress (capped at 90%; 100% set after command succeeds)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 90);
          setUploads((prev) =>
            prev.map((u) => (u.filename === file.name ? { ...u, percent: pct } : u))
          );
        }
      };

      // Fix 3: surface server and parse errors to the user
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as {
              filePath: string;
              originalFilename: string;
              fileSize: number;
              mimeType: string;
              thumbnailPath: string | null;
              mediumPath: string | null;
            };
            const mediaType = file.type.startsWith('video/') ? 'video' : 'photo';
            void runCommand(
              'uploadBatchMedia',
              {
                batchId: batchId!,
                filePath: data.filePath,
                mediaType,
                originalFilename: data.originalFilename,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                thumbnailPath: data.thumbnailPath,
                mediumPath: data.mediumPath,
              },
              `Upload ${file.name}`
            ).then(() => {
              // Fix 2: mark 100% done after command succeeds
              setUploads((prev) =>
                prev.map((u) => (u.filename === file.name ? { ...u, percent: 100, done: true } : u))
              );
              resolve();
            });
          } catch {
            setUploads((prev) =>
              prev.map((u) =>
                u.filename === file.name
                  ? { ...u, done: true, error: 'Upload succeeded but response was unreadable' }
                  : u
              )
            );
            resolve();
          }
        } else {
          // Fix 3: extract server error message when available
          let msg = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            if (body.error) msg = body.error;
          } catch {
            /* ignore parse errors on error responses */
          }
          setUploads((prev) =>
            prev.map((u) => (u.filename === file.name ? { ...u, done: true, error: msg } : u))
          );
          resolve();
        }
      };

      // Fix 3: surface network errors rather than silently discarding them
      xhr.onerror = () => {
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? { ...u, done: true, error: 'Network error — check your connection' }
              : u
          )
        );
        resolve();
      };

      xhr.open('POST', '/api/upload/media');
      xhr.send(formData);
    });
  }

  // Fix 2: outer handler processes files sequentially, then refetches + schedules cleanup
  async function handleFiles(files: File[]) {
    for (const file of files) {
      await handleFileUpload(file);
    }
    void query.refetch?.();
    setTimeout(() => setUploads((prev) => prev.filter((u) => !u.done)), 3000);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(Array.from(e.target.files ?? []));
  }

  const drawerBody = (
    <>
      {/* Mobile upload section */}
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        {navigator.clipboard ? (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={copyMobileLink}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy mobile upload link
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={openMobileUpload}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open mobile upload
          </button>
        )}
        {canMintShareLink && (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={handleMintShareLink}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Mint share link (2h)
          </button>
        )}
      </div>

      {shareLink && (
        <div className="border-b border-line bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-900">
            Share link minted — copy now, it will not be shown again.
          </div>
          <div className="mt-1 break-all font-mono text-xs text-amber-800">{shareLink.url}</div>
          <div className="mt-1 text-xs text-amber-700">
            Expires {new Date(shareLink.expiresAt).toLocaleString('en-US')}.{' '}
            <button type="button" className="underline" onClick={handleRevokeShareLink}>
              Revoke now
            </button>
          </div>
        </div>
      )}

      {/* Media list */}
      <MediaList
        query={query}
        canWrite={canWrite}
        runCommand={runCommand}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
      />

      {/* Fix 2: per-file upload progress bars — only visible when canWrite */}
      {canWrite && uploads.length > 0 && (
        <div className="space-y-1">
          {uploads.map((u, i) => (
            <div key={`${u.filename}-${i}`} className="media-upload-progress">
              <span className="flex-1 truncate text-xs">{u.filename}</span>
              {u.error ? (
                <span className="text-xs text-red-600">{u.error}</span>
              ) : u.done ? (
                <span className="text-xs text-emerald-600">✓</span>
              ) : (
                <div className="media-upload-progress-bar-track">
                  <div
                    className="media-upload-progress-bar-fill"
                    style={{ width: `${u.percent}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fix 4: <label> so clicking anywhere opens the file picker; input is sr-only */}
      {/* Fix 2: gated by canWrite — viewers should not see the upload zone */}
      {canWrite && (
        <label
          className={`media-upload-zone${isDragActive ? ' media-upload-zone-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragActive(false);
            void handleFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <input aria-label="Choose files"
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={handleInputChange}
          />
          <span>Drop files here or click to upload</span>
        </label>
      )}
    </>
  );

  return (
    <InspectorDrawer
      open={!!batchId}
      title={batchCode}
      subtitle={batchName}
      ariaLabel={`Media for ${batchCode}`}
      tabs={[{ key: 'media', label: 'Media', render: () => drawerBody }]}
      activeTab="media"
      onTabChange={() => {}}
      onClose={onClose}
    />
  );
}
