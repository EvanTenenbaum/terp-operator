import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import type { GridRow } from '../../../shared/types';
import { MobileSearchInput } from '../../components/mobile/MobileSearchInput';
import { MobileFilterChips } from '../../components/mobile/MobileFilterChips';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';
import { useCommandRunner } from '../../components/useCommandRunner';
import { MobileConfirmSheet } from '../../components/mobile/MobileConfirmSheet';
import { useMobileToast } from '../../components/mobile/MobileToast';

const STATUS_OPTIONS = ['All', 'Ready', 'Low Stock', 'Needs Review', 'Consignment'];
const CATEGORY_OPTIONS = ['All', 'Flower', 'Concentrate', 'Edible'];

const STATUS_FILTER_MAP: Record<string, string[]> = {
  Ready: ['ready'],
  'Low Stock': ['low_stock'],
  'Needs Review': ['needs_review'],
  Consignment: ['consignment'],
};

function statusBadgeClass(status: string) {
  if (status === 'ready')        return 'm-badge m-badge-ready';
  if (status === 'low_stock')    return 'm-badge m-badge-watch';
  if (status === 'needs_review') return 'm-badge m-badge-danger';
  if (status === 'consignment')  return 'm-badge m-badge-neutral';
  return 'm-badge m-badge-neutral';
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: 'Ready', low_stock: 'Low Stock',
    needs_review: 'Needs Review', consignment: 'Consignment',
  };
  return labels[status] ?? status;
}

export function MobileInventoryView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const expandParam = searchParams.get('expand');

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('All');
  const [categoryFilter, setCategory] = useState('All');
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const [actionMode, setActionMode]           = useState<null | 'adjust'>(null);
  const [deltaQty, setDeltaQty]               = useState<string>('');
  const [adjReason, setAdjReason]             = useState<string>('');
  const [flagConfirmId, setFlagConfirmId]     = useState<string | null>(null);
  const [adjConfirmPayload, setAdjConfirmPayload] = useState<{ batchId: string; delta: number; reason: string } | null>(null);

  const me = trpc.auth.me.useQuery();
  const role: string = (me.data as { role?: string } | undefined)?.role ?? 'viewer';
  const isManager = role === 'owner' || role === 'manager';

  const { runCommand } = useCommandRunner();
  const { addToast } = useMobileToast();

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const grid = trpc.queries.grid.useQuery({ view: 'inventory' }, { refetchInterval: 60_000 });
  const rows = (grid.data ?? []) as GridRow[];

  // Handle ?expand on mount — auto-expand the target batch
  useEffect(() => {
    if (!expandParam) return;
    setExpandedId(expandParam);
    setSearchParams(prev => { prev.delete('expand'); return prev; }, { replace: true });
    setTimeout(() => {
      rowRefs.current[expandParam]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter(row => {
    const haystack = `${row.batchCode ?? ''} ${row.name ?? ''} ${row.vendor ?? ''}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (statusFilter !== 'All') {
      const allowed = STATUS_FILTER_MAP[statusFilter] ?? [];
      if (!allowed.includes(String(row.status ?? '').toLowerCase())) return false;
    }
    if (categoryFilter !== 'All') {
      if (String(row.category ?? '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
    }
    return true;
  });

  function resetAction() {
    setActionMode(null);
    setDeltaQty('');
    setAdjReason('');
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => {
      if (prev === id) { resetAction(); return null; }
      resetAction();
      return id;
    });
  }

  function clearFilters() {
    setSearch('');
    setStatus('All');
    setCategory('All');
  }

  return (
    <div>
      {/* Sticky controls */}
      <div
        className="sticky top-0 z-10 border-b px-4 pb-2 pt-3"
        style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)' }}
      >
        <MobileSearchInput value={search} onChange={setSearch} placeholder="Search batches, strains…" />
        <MobileFilterChips className="mt-2" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatus} />
        <MobileFilterChips className="mt-1" options={CATEGORY_OPTIONS} value={categoryFilter} onChange={setCategory} />
        <p className="mt-2 text-xs" style={{ color: 'var(--m-muted-2)' }}>
          Showing {filtered.length} of {rows.length} batches
        </p>
      </div>

      {/* Batch list */}
      {filtered.length === 0 ? (
        <MobileEmptyState
          icon="📦"
          headline="No batches match"
          body="Clear filters to see all inventory."
          ctaLabel="Clear filters"
          onCta={clearFilters}
        />
      ) : (
        <div className="divide-y px-4" style={{ borderColor: 'var(--m-line)' }}>
          {filtered.map(row => {
            const id          = String(row.id);
            const isExpanded  = expandedId === id;
            const status      = String(row.status ?? '');
            const batchCode   = String(row.batchCode ?? '');
            const name        = String(row.name ?? '');
            const vendor      = String(row.vendor ?? '');
            const availableQty = Number(row.availableQty ?? 0);
            const uom         = String(row.uom ?? 'lb');
            const unitPrice   = Number(row.unitPrice ?? 0);
            const unitCost    = Number(row.unitCost ?? 0);
            const location    = String(row.location ?? '—');
            const tags        = String(row.tags ?? '');
            const expDate     = row.expirationDate ? String(row.expirationDate) : null;
            const casePack    = Number(row.casePack ?? 0);
            const draftReserved = Number(row.draftReservedQty ?? 0);

            return (
              <div key={id} ref={el => { rowRefs.current[id] = el; }}>
                <button
                  type="button"
                  className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
                  onClick={() => toggleExpand(id)}
                  aria-expanded={isExpanded}
                  aria-label={`${name} — ${statusLabel(status)}`}
                >
                  {/* Top: batch code · name · status badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--m-muted-2)' }}>
                        {batchCode}
                      </span>
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
                        {name}
                      </span>
                    </div>
                    <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>
                  </div>
                  {/* Middle: vendor · qty+price */}
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--m-muted-2)' }}>
                    <span>{vendor}</span>
                    <span style={{ color: 'var(--m-muted)' }}>
                      {draftReserved > 0
                        ? `${(availableQty - draftReserved).toLocaleString('en-US')} ${uom} free (${draftReserved} reserved)`
                        : `${availableQty.toLocaleString('en-US')} ${uom}`}
                      {' · '}${unitPrice.toLocaleString('en-US')}/lb
                    </span>
                  </div>
                  {/* Expiry warning */}
                  {expDate && (
                    <p className="text-xs" style={{ color: 'var(--m-amber)' }}>
                      ⚠ Expires {new Date(expDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mb-3 rounded-xl p-3" style={{ background: '#f1f3ee' }}>
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div>
                        <p className="font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Cost / Price</p>
                        <p style={{ color: 'var(--m-ink)' }}>
                          ${unitCost.toLocaleString('en-US')} / ${unitPrice.toLocaleString('en-US')} per lb
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Location</p>
                        <p style={{ color: 'var(--m-ink)' }}>{location}</p>
                      </div>
                      {casePack > 0 && (
                        <div>
                          <p className="font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Case Pack</p>
                          <p style={{ color: 'var(--m-ink)' }}>{casePack} {uom} per case</p>
                        </div>
                      )}
                      {draftReserved > 0 && (
                        <div>
                          <p className="font-semibold uppercase" style={{ color: 'var(--m-amber)', fontSize: 10, letterSpacing: '0.06em' }}>Draft Reserved</p>
                          <p style={{ color: 'var(--m-amber)' }}>{draftReserved} {uom}</p>
                        </div>
                      )}
                    </div>
                    {tags && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tags.split(',').filter(Boolean).map(tag => (
                          <span
                            key={tag}
                            className="rounded-lg px-2 py-0.5 text-xs"
                            style={{ background: '#eef1eb', color: 'var(--m-muted)' }}
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Actions */}
                    {actionMode === null && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={!isManager}
                          aria-label="Adjust qty"
                          onClick={() => setActionMode('adjust')}
                          className="m-btn-secondary flex-1"
                          style={{ minHeight: 36, fontSize: 11, padding: '0 8px', opacity: isManager ? 1 : 0.45 }}
                          title={!isManager ? 'Manager role required' : undefined}
                        >
                          Adjust qty
                        </button>
                        <button
                          type="button"
                          aria-label="Flag for review"
                          onClick={() => setFlagConfirmId(id)}
                          className="m-btn-secondary flex-1"
                          style={{ minHeight: 36, fontSize: 11, padding: '0 8px' }}
                        >
                          Flag for review
                        </button>
                      </div>
                    )}

                    {/* Inline adjust form */}
                    {actionMode === 'adjust' && (
                      <div className="mt-3 flex flex-col gap-2">
                        <label>
                          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Delta quantity (+/-)</span>
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Delta quantity"
                            value={deltaQty}
                            onChange={e => setDeltaQty(e.target.value)}
                            style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid var(--m-line)', padding: '0 12px', background: 'var(--m-field)', color: 'var(--m-ink)', fontSize: 14 }}
                          />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Reason (required)</span>
                          <input
                            type="text"
                            aria-label="Reason"
                            value={adjReason}
                            onChange={e => setAdjReason(e.target.value)}
                            placeholder="e.g. recount, damage, correction…"
                            style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid var(--m-line)', padding: '0 12px', background: 'var(--m-field)', color: 'var(--m-ink)', fontSize: 14 }}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!deltaQty || !adjReason.trim()}
                            className="m-btn-primary flex-1"
                            style={{ minHeight: 40, fontSize: 13 }}
                            onClick={() => {
                              const delta = Number(deltaQty);
                              const reason = adjReason.trim();
                              if (!Number.isFinite(delta) || delta === 0 || !reason) return;
                              if (Math.abs(delta) > 10) {
                                setAdjConfirmPayload({ batchId: id, delta, reason });
                              } else {
                                void runCommand('adjustBatchQuantity', { batchId: id, deltaQty: delta, reason })
                                  .then(() => { addToast(`Adjusted ${name} by ${delta}`, 'success'); resetAction(); })
                                  .catch(() => {});
                              }
                            }}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={resetAction}
                            className="m-btn-secondary"
                            style={{ minHeight: 40, fontSize: 13, width: 80 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Adjust quantity confirm sheet (large deltas) */}
      <MobileConfirmSheet
        open={adjConfirmPayload !== null}
        summary={adjConfirmPayload
          ? `Adjust ${adjConfirmPayload.delta > 0 ? '+' : ''}${adjConfirmPayload.delta} lb — ${adjConfirmPayload.reason}`
          : ''}
        confirmLabel="Apply Adjustment"
        onConfirm={async () => {
          const p = adjConfirmPayload;
          setAdjConfirmPayload(null);
          if (!p) return;
          try {
            await runCommand('adjustBatchQuantity', { batchId: p.batchId, deltaQty: p.delta, reason: p.reason });
            addToast(`Adjusted by ${p.delta}`, 'success');
            resetAction();
          } catch {}
        }}
        onCancel={() => setAdjConfirmPayload(null)}
      />

      {/* Flag for review confirm sheet */}
      <MobileConfirmSheet
        open={flagConfirmId !== null}
        summary={flagConfirmId ? `Flag batch for review?` : ''}
        confirmLabel="Flag Batch"
        onConfirm={async () => {
          const bId = flagConfirmId;
          setFlagConfirmId(null);
          if (!bId) return;
          try {
            await runCommand('flagBatch', { batchId: bId, reason: 'Flagged from mobile — needs review' });
            addToast('Batch flagged for review', 'success');
          } catch {}
        }}
        onCancel={() => setFlagConfirmId(null)}
      />
    </div>
  );
}
