import { Camera, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import type { GridRow } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';
import { WorkspacePanel } from './WorkspacePanel';

export function PhotographyQueuePanel() {
  const inventory = trpc.queries.grid.useQuery({ view: 'inventory' });
  const queue = trpc.queries.photographyQueue.useQuery();
  const [batchId, setBatchId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [filterMode, setFilterMode] = useState<'needs-media' | 'all'>('needs-media');
  const { runCommand, isRunning } = useCommandRunner();
  const rows = (inventory.data ?? []) as GridRow[];
  const open = useMemo(
    () => rows.filter((row) => filterMode === 'all' || String(row.mediaStatus ?? 'open') !== 'done'),
    [rows, filterMode]
  );
  const ready = rows.length - open.length;
  const selected = open.find((row) => row.id === batchId) ?? open[0];

  async function attach() {
    if (!selected || !photoUrl.trim()) return;
    await runCommand('attachBatchPhoto', { batchId: selected.id, photoUrl: photoUrl.trim() }, 'Attach photo from media readiness panel');
    setPhotoUrl('');
    await inventory.refetch();
    await queue.refetch();
  }

  return (
    <WorkspacePanel
      panelId="inventory:photography-queue"
      title="Photography Queue"
      subtitle={`${open.length} open / ${ready} ready`}
      contentClassName="p-3"
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="selection-pill success">{ready} ready</span>
          <span className="selection-pill warning">{open.length} needs media</span>
        </div>
      }
    >
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          className={filterMode === 'needs-media' ? 'selection-pill warning' : 'selection-pill'}
          onClick={() => setFilterMode('needs-media')}
        >
          Needs media ({rows.filter((r) => String(r.mediaStatus ?? 'open') !== 'done').length})
        </button>
        <button
          type="button"
          className={filterMode === 'all' ? 'selection-pill success' : 'selection-pill'}
          onClick={() => setFilterMode('all')}
        >
          All ({rows.length})
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Media batch
          <select className="select" value={batchId || selected?.id || ''} onChange={(event) => setBatchId(event.target.value)}>
            <option value="">Choose</option>
            {open.slice(0, 40).map((row) => (
              <option key={row.id} value={row.id}>
                {String(row.batchCode)} / {String(row.name)} / {humanMediaStatus(row.mediaStatus)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline grow">
          Photo URL/path
          <input className="input" value={photoUrl} placeholder="/controlled/media/path/photo.jpg" onChange={(event) => setPhotoUrl(event.target.value)} />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!selected || !photoUrl.trim() || isRunning}
          title={!selected ? 'Select a batch to attach media' : !photoUrl.trim() ? 'Enter a photo URL to attach' : undefined}
          onClick={attach}
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Attach
        </button>
        <span className="selection-pill">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {selected ? `Media: ${String(selected.batchCode)}` : 'No open media rows'}
        </span>
      </div>
      {queue.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Status</th>
                <th>Media</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(queue.data ?? [])
                .filter((row) => filterMode === 'all' || String(row.mediaStatus ?? 'open') !== 'done')
                .map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.batchCode ?? row.batchId)}</td>
                    <td>{humanMediaStatus(row.status)}</td>
                    <td>{humanMediaStatus(row.mediaStatus)}</td>
                    <td>{String(row.notes ?? '')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

function humanMediaStatus(value: unknown) {
  const raw = String(value ?? 'open');
  const labels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In progress',
    done: 'Done'
  };
  return labels[raw] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
