import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import type { GridRow } from '../../../shared/types';
import { MobileSearchInput } from '../../components/mobile/MobileSearchInput';
import { MobileFilterChips } from '../../components/mobile/MobileFilterChips';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';

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

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
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
            const id = String(row.id);
            const isExpanded = expandedId === id;
            const status = String(row.status ?? '');

            return (
              <div key={id} ref={el => { rowRefs.current[id] = el; }}>
                <button
                  type="button"
                  className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
                  onClick={() => toggleExpand(id)}
                  aria-expanded={isExpanded}
                  aria-label={`${row.name} — ${statusLabel(status)}`}
                >
                  {/* Top: batch code · name · status badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--m-muted-2)' }}>
                        {row.batchCode}
                      </span>
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
                        {row.name}
                      </span>
                    </div>
                    <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>
                  </div>
                  {/* Middle: vendor · qty+price */}
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--m-muted-2)' }}>
                    <span>{row.vendor}</span>
                    <span style={{ color: 'var(--m-muted)' }}>
                      {Number(row.availableQty ?? 0).toLocaleString()} {row.uom ?? 'lb'} · ${Number(row.unitPrice ?? 0).toLocaleString()}/lb
                    </span>
                  </div>
                  {/* Expiry warning */}
                  {row.expirationDate && (
                    <p className="text-xs" style={{ color: 'var(--m-amber)' }}>
                      ⚠ Expires {new Date(String(row.expirationDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                          ${Number(row.unitCost ?? 0).toLocaleString()} / ${Number(row.unitPrice ?? 0).toLocaleString()} per lb
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Location</p>
                        <p style={{ color: 'var(--m-ink)' }}>{String(row.location ?? '—')}</p>
                      </div>
                    </div>
                    {row.tags && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {String(row.tags).split(',').filter(Boolean).map(tag => (
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
                    {/* Quick action stubs */}
                    <div className="mt-3 flex gap-2">
                      {['Adjust qty', 'Mark needs review', 'Call vendor'].map(action => (
                        <button
                          key={action}
                          type="button"
                          className="m-btn-secondary flex-1"
                          style={{ minHeight: 36, fontSize: 11, padding: '0 8px' }}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
