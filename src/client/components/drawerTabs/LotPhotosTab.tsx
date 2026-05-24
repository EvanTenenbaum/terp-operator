import { trpc } from '../../api/trpc';

/**
 * LotPhotosTab — media files attached to this lot/batch.
 *
 * CAP-023 / TER-1501: Surfaces the batch's media readiness status and
 * individual media files (photos, videos) so the operator can confirm
 * catalog photography is complete without leaving the intake grid.
 */

interface LotPhotosTabProps {
  batchId: string | null | undefined;
  mediaStatus?: string | null;
}

function humanMediaStatus(value: unknown) {
  const raw = String(value ?? 'open');
  const labels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In progress',
    done: 'Done',
  };
  return labels[raw] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    primary_photo: 'Primary photo',
    primary_video: 'Primary video',
    additional: 'Additional',
  };
  return labels[role] ?? role.replace(/[_-]+/g, ' ');
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LotPhotosTab({ batchId, mediaStatus }: LotPhotosTabProps) {
  const enabled = Boolean(batchId);
  const media = trpc.queries.batchMediaList.useQuery(
    { batchId: batchId! },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Photos</h2>
        <div className="drawer-empty mt-3">No lot selected.</div>
      </div>
    );
  }

  if (media.isLoading) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Photos</h2>
        <div className="drawer-empty mt-3">Loading media…</div>
      </div>
    );
  }

  const files = media.data ?? [];

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Photos</h2>
      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Media status</span>
          <strong>{humanMediaStatus(mediaStatus)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Files attached</span>
          <strong>{files.length}</strong>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="drawer-empty mt-4">No media files attached yet.</div>
      ) : (
        <section className="mt-4">
          <h3 className="section-title">Media files ({files.length})</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {files.map((file) => (
              <div key={String(file.id)} className="activity-row">
                <span className="font-medium text-ink">{roleLabel(file.role)}</span>
                <span className="text-zinc-500">{String(file.status)}</span>
                <span className="text-zinc-600">{fileSize(file.fileSize)}</span>
                <span className="text-zinc-400">{String(file.originalFilename)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
