/**
 * Recent Sheets panel for the Sales source tab strip (#62).
 *
 * Lists customer-scoped sheet snapshots (newest first). Opening a snapshot
 * surfaces its sanitized rows; the operator can Add per-row or Add all to
 * the current draft. Out-of-stock / unavailable snapshot items are disabled
 * — no silent substitution.
 *
 * Customer-facing (mode = 'catalog') snapshots never store cost or margin
 * (enforced by `buildCustomerSheetSnapshotRows`). The panel never renders a
 * cost or margin column for catalog snapshots and never reads those keys
 * from the snapshot rows.
 */
import { ChevronRight, PackagePlus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { trpc } from '../api/trpc';
import type { InventoryFinderBatch } from './InventoryFinderPanel';

interface AddAllStatus {
  added: number;
  failed: number;
}

export interface CustomerSheetSnapshotSummary {
  id: string;
  customerId: string;
  mode: 'internal' | 'catalog';
  actorId: string | null;
  actorName: string | null;
  itemCount: number;
  notes?: string | null;
  createdAt: string;
}

interface CustomerSheetSnapshotRow {
  batchId?: string | null;
  batchCode?: string | null;
  name?: string | null;
  itemAlias?: string | null;
  displayName?: string | null;
  category?: string | null;
  vendor?: string | null;
  availableQty?: number | string | null;
  unitPrice?: number | string | null;
  // Issue #62 reviewer fix: snapshots persist the quantity the operator
  // quoted so Add / Add all can replay the quoted qty instead of defaulting
  // to 1. The displayed Add still gets capped by live availability.
  qty?: number | string | null;
  tags?: string[] | string | null;
}

interface CustomerSheetSnapshotDetail {
  id: string;
  customerId: string;
  mode: 'internal' | 'catalog';
  actorName: string | null;
  itemCount: number;
  notes?: string | null;
  createdAt: string;
  rows: CustomerSheetSnapshotRow[];
}

interface RecentSheetsPanelProps {
  customerId: string;
  selectedOrderId: string;
  onAddBatch: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

function formatItemCount(n: number): string {
  return n === 1 ? '1 item' : `${n} items`;
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

export function RecentSheetsPanel({ customerId, selectedOrderId, onAddBatch }: RecentSheetsPanelProps) {
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null);

  const list = trpc.queries.recentCustomerSheets.useQuery(
    { customerId: customerId || '00000000-0000-0000-0000-000000000000', limit: 25 },
    { enabled: Boolean(customerId) }
  );
  // Issue #62 reviewer fix: the server now requires customerId on the
  // snapshot-by-id query so a snapshot cannot be opened outside its owning
  // customer. Pass the current customerId through.
  const detail = trpc.queries.customerSheetSnapshotById.useQuery(
    {
      id: openSnapshotId ?? '00000000-0000-0000-0000-000000000000',
      customerId: customerId || '00000000-0000-0000-0000-000000000000'
    },
    { enabled: Boolean(openSnapshotId) && Boolean(customerId) }
  );

  // Live inventory snapshot used to gate Add buttons against current availability.
  const reference = trpc.queries.reference.useQuery();
  const liveByBatchId = useMemo(() => {
    const map = new Map<string, InventoryFinderBatch>();
    for (const batch of (reference.data?.availableBatches ?? []) as InventoryFinderBatch[]) {
      if (batch.id) map.set(String(batch.id), batch);
    }
    return map;
  }, [reference.data?.availableBatches]);

  const snapshots = (list.data ?? []) as CustomerSheetSnapshotSummary[];
  const activeSnapshot = (detail.data ?? null) as CustomerSheetSnapshotDetail | null;

  if (!customerId) {
    return (
      <div className="p-3 text-sm text-zinc-600">
        Choose a customer to see Recent Sheets.
      </div>
    );
  }

  if (openSnapshotId && activeSnapshot) {
    return (
      <SnapshotDetail
        snapshot={activeSnapshot}
        selectedOrderId={selectedOrderId}
        liveByBatchId={liveByBatchId}
        onAddBatch={onAddBatch}
        onBack={() => setOpenSnapshotId(null)}
      />
    );
  }

  if (openSnapshotId && detail.isLoading) {
    return <div className="p-3 text-sm text-zinc-600">Loading snapshot…</div>;
  }

  return (
    <div className="p-3">
      {list.isLoading ? (
        <div className="text-sm text-zinc-600">Loading recent sheets…</div>
      ) : snapshots.length === 0 ? (
        <div className="text-sm text-zinc-600">
          No recent sheets for this customer yet. Export a sheet to start the trail.
        </div>
      ) : (
        <ul className="recent-sheets-list" aria-label="Recent customer sheets">
          {snapshots.map((snap) => (
            <li key={snap.id} className="recent-sheet-row">
              <button
                type="button"
                className="text-button compact-action"
                aria-label={`Open snapshot from ${formatDate(snap.createdAt)}`}
                onClick={() => setOpenSnapshotId(snap.id)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                Open
              </button>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ink">{formatDate(snap.createdAt)}</span>
                <span className="text-xs text-zinc-600">
                  {snap.actorName ?? 'Unknown actor'} · {snap.mode} · {formatItemCount(snap.itemCount)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotDetail({
  snapshot,
  selectedOrderId,
  liveByBatchId,
  onAddBatch,
  onBack
}: {
  snapshot: CustomerSheetSnapshotDetail;
  selectedOrderId: string;
  liveByBatchId: Map<string, InventoryFinderBatch>;
  onAddBatch: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
  onBack: () => void;
}) {
  const rows = snapshot.rows ?? [];
  const canWrite = Boolean(selectedOrderId);
  const [addAllStatus, setAddAllStatus] = useState<AddAllStatus | null>(null);

  function liveFor(row: CustomerSheetSnapshotRow): InventoryFinderBatch | null {
    const id = row.batchId ? String(row.batchId) : '';
    if (!id) return null;
    return liveByBatchId.get(id) ?? null;
  }

  /**
   * Issue #62 reviewer fix: use the snapshot's quoted qty (fall back to the
   * snapshot's availableQty, then to 1) capped by current live availability,
   * instead of always sending qty=1. We also forward the snapshot unitPrice
   * on the batch object so the call into addSalesOrderLine preserves the
   * price the operator originally quoted to the customer. The downstream
   * `addFinderBatch` reads `batch.unitPrice` so a single overlay is enough.
   */
  function snapshotAddPlan(row: CustomerSheetSnapshotRow, live: InventoryFinderBatch | null) {
    const available = live ? Number(live.availableQty ?? 0) : 0;
    const snapshotQty = Number(row.qty ?? NaN);
    const snapshotAvail = Number(row.availableQty ?? NaN);
    let desired = 1;
    if (Number.isFinite(snapshotQty) && snapshotQty > 0) desired = snapshotQty;
    else if (Number.isFinite(snapshotAvail) && snapshotAvail > 0) desired = snapshotAvail;
    const qty = Math.max(0, Math.min(desired, available));
    const snapshotPrice = Number(row.unitPrice ?? NaN);
    const batchForAdd: InventoryFinderBatch | null = live
      ? {
          ...live,
          // Preserve snapshot price when present so the quoted price sticks.
          unitPrice: Number.isFinite(snapshotPrice) ? snapshotPrice : live.unitPrice
        }
      : null;
    return { batchForAdd, qty, available };
  }

  async function addOne(row: CustomerSheetSnapshotRow) {
    const live = liveFor(row);
    if (!live || !canWrite) return;
    const plan = snapshotAddPlan(row, live);
    if (!plan.batchForAdd || plan.qty <= 0) return;
    await onAddBatch(plan.batchForAdd, plan.qty);
  }

  async function addAll() {
    if (!canWrite) return;
    let added = 0;
    let failed = 0;
    for (const row of rows) {
      const live = liveFor(row);
      if (!live) continue;
      const plan = snapshotAddPlan(row, live);
      if (!plan.batchForAdd || plan.qty <= 0) continue;
      try {
        await onAddBatch(plan.batchForAdd, plan.qty);
        added++;
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      setAddAllStatus({ added, failed });
    } else if (added > 0) {
      setAddAllStatus({ added, failed: 0 });
    } else {
      setAddAllStatus(null);
    }
  }

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" className="text-button compact-action" onClick={onBack}>
            ← Back
          </button>
          <span className="ml-2 text-xs text-zinc-600">
            {formatDate(snapshot.createdAt)} · {snapshot.actorName ?? 'Unknown actor'} · {snapshot.mode} ·{' '}
            {formatItemCount(snapshot.itemCount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {addAllStatus ? (
            <span
              className={
                addAllStatus.failed > 0
                  ? 'selection-pill danger text-xs'
                  : 'selection-pill text-xs'
              }
              data-testid="add-all-status"
            >
              {addAllStatus.failed > 0
                ? `Added ${addAllStatus.added} of ${addAllStatus.added + addAllStatus.failed}; ${addAllStatus.failed} failed.`
                : `Added ${addAllStatus.added} item${addAllStatus.added === 1 ? '' : 's'}.`}
            </span>
          ) : null}
          <button
            type="button"
            className="primary-button compact-action"
            onClick={addAll}
            disabled={!canWrite || rows.every((row) => !isAvailable(liveFor(row)))}
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Add all
          </button>
        </div>
      </div>
      <div className="finder-table-wrap">
        <table className="finder-table" data-testid="snapshot-detail-table">
          <caption className="sr-only">Snapshot rows</caption>
          <thead>
            <tr>
              <th scope="col">Add</th>
              <th scope="col">Batch</th>
              <th scope="col">Product</th>
              <th scope="col">Category</th>
              <th scope="col">Snapshot avail</th>
              <th scope="col">Snapshot price</th>
              <th scope="col">Now available</th>
              <th scope="col">Reason if disabled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const live = liveFor(row);
              const nowAvail = live ? Number(live.availableQty ?? 0) : 0;
              const available = Boolean(live) && nowAvail > 0;
              const disabledReason = !live
                ? 'Batch no longer in current inventory'
                : nowAvail <= 0
                ? 'Out of stock'
                : '';
              return (
                <tr key={String(row.batchId ?? row.batchCode ?? index)}>
                  <td>
                    <button
                      type="button"
                      className="secondary-button compact-action"
                      onClick={() => addOne(row)}
                      disabled={!available || !canWrite}
                      aria-label="Add"
                    >
                      <PackagePlus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </button>
                  </td>
                  <td>{row.batchCode ?? '-'}</td>
                  <td>{row.itemAlias ?? row.displayName ?? row.name ?? '-'}</td>
                  <td>{row.category ?? '-'}</td>
              <td>{row.availableQty ?? '-'}</td>
              <td>
                ${moneyish(row.unitPrice)}
                {live &&
                Number.isFinite(Number(row.unitPrice ?? NaN)) &&
                Number.isFinite(Number(live.unitPrice ?? NaN)) &&
                Number(row.unitPrice ?? NaN) !== Number(live.unitPrice ?? NaN) ? (
                  <span className="text-xs text-amber-600 ml-1" data-testid="price-divergence-warning">
                    (live ${moneyish(live.unitPrice)})
                  </span>
                ) : null}
              </td>
              <td>{live ? nowAvail : '-'}</td>
                  <td className="text-xs text-zinc-600">{disabledReason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isAvailable(live: InventoryFinderBatch | null): boolean {
  if (!live) return false;
  return Number(live.availableQty ?? 0) > 0;
}
