import { useState } from 'react';
import { Link } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import type { GridRow } from '../../../shared/types';
import { MobileSearchInput } from '../../components/mobile/MobileSearchInput';
import { MobileFilterChips } from '../../components/mobile/MobileFilterChips';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';

const FILTER_OPTIONS = ['All', 'Has Photo', 'No Photos', 'Published', 'Draft'];

const STRAIN_GRADIENTS: Record<string, [string, string]> = {
  'Blue Dream':   ['#87ceeb', '#c8b8db'],
  'OG Kush':      ['#b88a4a', '#6b4a2b'],
  'Gelato':       ['#7c5cbf', '#2d1b5f'],
  'Gelato #33':   ['#7c5cbf', '#2d1b5f'],
  'Wedding Cake': ['#f5ecd4', '#d9c89c'],
  'Gorilla Glue': ['#2d6e4e', '#0e2a20'],
  'Purple Punch': ['#7b4fa6', '#3a2454'],
  'Runtz':        ['#d68fcf', '#6d3b86'],
  'Zkittlez':     ['#2a8fbd', '#f0a560'],
};

const FALLBACK_GRADIENTS: [string, string][] = [
  ['#87ceeb', '#c8b8db'], ['#b88a4a', '#6b4a2b'], ['#7c5cbf', '#2d1b5f'],
  ['#f5ecd4', '#d9c89c'], ['#2d6e4e', '#0e2a20'], ['#7b4fa6', '#3a2454'],
  ['#d68fcf', '#6d3b86'], ['#2a8fbd', '#f0a560'],
];

function gradientFor(name: string): [string, string] {
  return STRAIN_GRADIENTS[name] ?? FALLBACK_GRADIENTS[name.charCodeAt(0) % FALLBACK_GRADIENTS.length];
}

function initialsFor(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function hasPhotos(row: GridRow): boolean {
  return Number(row.publishedMediaCount ?? 0) > 0 || Boolean(row.hasPrimaryPhoto);
}

export function MobileCatalogView() {
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('All');
  const [activeRow, setActiveRow] = useState<GridRow | null>(null);

  const grid = trpc.queries.grid.useQuery({ view: 'photography' }, { refetchInterval: 60_000 });
  const rows = (grid.data ?? []) as GridRow[];

  const filtered = rows.filter(row => {
    const name = String(row.name ?? '');
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'Has Photo' && !hasPhotos(row))  return false;
    if (filter === 'No Photos' && hasPhotos(row))   return false;
    return true;
  });

  const noPhotoCount = rows.filter(r => !hasPhotos(r)).length;

  return (
    <div>
      {/* Sticky controls */}
      <div
        className="sticky top-0 z-10 border-b px-4 pb-2 pt-3"
        style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)' }}
      >
        <MobileSearchInput value={search} onChange={setSearch} placeholder="Search catalog…" />
        <MobileFilterChips className="mt-2" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <p className="mt-1 text-xs" style={{ color: 'var(--m-muted-2)' }}>
          {filtered.length} strain{filtered.length !== 1 ? 's' : ''}
          {noPhotoCount > 0 ? ` · ${noPhotoCount} need photos` : ''}
        </p>
      </div>

      {/* 2-column grid */}
      {filtered.length === 0 ? (
        <MobileEmptyState
          icon="🖼"
          headline="No catalog items"
          body="Clear filters to see all."
          ctaLabel="Clear filters"
          onCta={() => { setSearch(''); setFilter('All'); }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {filtered.map(row => {
            const name       = String(row.name ?? '');
            const [from, to] = gradientFor(name);
            const photoCount = Number(row.publishedMediaCount ?? 0);

            return (
              <button
                key={String(row.id)}
                type="button"
                className="m-card overflow-hidden p-0 text-left"
                onClick={() => setActiveRow(row)}
                aria-label={`Open ${name} catalog detail`}
              >
                {/* Photo area */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ aspectRatio: '1', background: `linear-gradient(150deg, ${from}, ${to})` }}
                >
                  <span className="text-2xl font-bold text-white opacity-80" aria-hidden="true">
                    {initialsFor(name)}
                  </span>
                  <span
                    className={`absolute bottom-2 right-2 m-badge ${hasPhotos(row) ? 'm-badge-ready' : 'm-badge-neutral'}`}
                  >
                    {photoCount > 0
                      ? `${photoCount} photo${photoCount > 1 ? 's' : ''}`
                      : 'No Photos'}
                  </span>
                </div>
                {/* Info */}
                <div className="px-3 py-2">
                  <p className="truncate text-xs font-semibold" style={{ color: 'var(--m-ink)' }}>{name}</p>
                  <p className="font-mono text-xs" style={{ color: 'var(--m-muted-2)' }}>{String(row.batchCode ?? '')}</p>
                  <p className="text-xs" style={{ color: 'var(--m-muted)' }}>
                    {Number(row.availableQty ?? 0)} lb · ${Number(row.unitPrice ?? 0).toLocaleString()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail bottom sheet */}
      {activeRow != null && (() => {
        const name        = String(activeRow.name ?? '');
        const id          = String(activeRow.id);
        const [from, to]  = gradientFor(name);
        const photoCount  = Number(activeRow.publishedMediaCount ?? 0);

        return (
          <>
            <div
              data-testid="catalog-sheet-backdrop"
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(24,33,31,0.4)' }}
              onClick={() => setActiveRow(null)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Catalog detail"
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white shadow-2xl"
              style={{ animation: 'm-fade-slide-in 200ms ease-out', maxHeight: '72vh', overflowY: 'auto' }}
            >
              <div className="sticky top-0 flex justify-center bg-white pt-3 pb-2">
                <div className="h-1.5 w-10 rounded-full bg-zinc-200" aria-hidden="true" />
              </div>
              {/* Large swatch */}
              <div
                className="flex items-center justify-center"
                style={{ height: 180, background: `linear-gradient(150deg, ${from}, ${to})` }}
              >
                <span className="text-4xl font-bold text-white opacity-80" aria-hidden="true">
                  {initialsFor(name)}
                </span>
              </div>
              {/* Content */}
              <div className="p-4">
                <p className="text-xl font-bold" style={{ color: 'var(--m-ink)' }}>{name}</p>
                <p className="font-mono text-sm" style={{ color: 'var(--m-muted-2)' }}>{String(activeRow.batchCode ?? '')}</p>
                <div className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
                  {([
                    ['Available', `${activeRow.availableQty} lb`],
                    ['Unit Price', `$${Number(activeRow.unitPrice ?? 0).toLocaleString()}`],
                    ['Status',    String(activeRow.status  ?? '—')],
                    ['Vendor',    String(activeRow.vendor  ?? '—')],
                  ] as const).map(([label, val]) => (
                    <div key={label}>
                      <p
                        className="text-xs font-semibold uppercase"
                        style={{ color: 'var(--m-muted-2)', letterSpacing: '0.06em' }}
                      >
                        {label}
                      </p>
                      <p style={{ color: 'var(--m-ink)' }}>{val}</p>
                    </div>
                  ))}
                </div>
                {/* Add Photo CTA */}
                <a
                  href={`/photography/mobile/${id}`}
                  className="m-btn-primary mt-4 flex items-center justify-center no-underline"
                  style={{ textDecoration: 'none' }}
                >
                  {photoCount > 0 ? 'Replace Photo' : 'Add Photo'}
                </a>
                {/* View in Inventory */}
                <Link
                  to={`/mobile/inventory?expand=${id}`}
                  aria-label="View in Inventory"
                  className="mt-3 flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium no-underline"
                  style={{ background: 'var(--m-panel)', color: 'var(--m-accent)' }}
                  onClick={() => setActiveRow(null)}
                >
                  View in Inventory →
                </Link>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
