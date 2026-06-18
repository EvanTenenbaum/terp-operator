import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { StatusCountsEntityType } from '../../shared/schemas';

// ============================================================================
// TYPES
// ============================================================================

export interface StatusCount {
  status: string;
  count: number;
}

export interface StatusFilterPillProps {
  /**
   * Entity type key for the statusCounts query (e.g. 'purchaseOrder', 'salesOrder').
   * Passed directly to `trpc.queries.statusCounts.useQuery`.
   */
  entityType: string;
  /**
   * Active status filter string — comma-separated status keys (e.g. "draft,confirmed").
   * Empty string or undefined means no filter active (all statuses shown).
   */
  activeFilter?: string;
  /**
   * Called when the status filter changes.
   * Pass comma-separated statuses string (e.g. "draft,confirmed") or null/empty to clear.
   */
  onFilterChange: (status: string | null) => void;
  /**
   * External active filter pills to display (e.g., from URL params or parent state).
   * When provided, these are rendered in the pills row alongside status pills.
   */
  activePills?: { key: string; label: string; onRemove: () => void }[];
  /**
   * Whether the chip is disabled (e.g., no data loaded yet).
   */
  disabled?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Chip class shared with FilterToolbar's chip styling. */
function chipClass(active: boolean, disabled: boolean): string {
  return [
    'inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2.5 text-xs font-medium transition-colors',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    active
      ? 'border-blue-300 bg-blue-50 text-blue-700'
      : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
  ].join(' ');
}

const badgeClass =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700';

// ============================================================================
// FILTER POPOVER (internal)
// ============================================================================

interface FilterPopoverProps {
  id: string;
  children: ReactNode;
}

function FilterPopover({ id, children }: FilterPopoverProps) {
  return (
    <div
      data-filter-popover={id}
      className="absolute z-40 mt-1 min-w-[180px] rounded-md border border-line bg-white p-3 shadow-lg left-0"
      role="dialog"
      aria-label={`${id} filter options`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatusFilterPill({
  entityType,
  activeFilter,
  onFilterChange,
  activePills,
  disabled = false,
}: StatusFilterPillProps): ReactNode {
  // ── Status counts query ──────────────────────────────────────────────
  const statusCountsQuery = trpc.queries.statusCounts.useQuery(
    { entityType: entityType as StatusCountsEntityType },
    { enabled: entityType.length > 0 },
  );
  const statusCounts: StatusCount[] = statusCountsQuery.data?.statuses ?? [];
  const isLoading = statusCountsQuery.isLoading;

  // ── Popover state ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  // ── Derived state ────────────────────────────────────────────────────
  const selectedStatuses = useMemo((): string[] => {
    if (!activeFilter) return [];
    return activeFilter.split(',').filter(Boolean);
  }, [activeFilter]);

  const hasStatusCounts = statusCounts.length > 0;
  const statusActive = hasStatusCounts && selectedStatuses.length > 0;
  const statusBadgeCount = selectedStatuses.length;
  const allStatusesTotal = hasStatusCounts
    ? statusCounts.reduce((sum, s) => sum + s.count, 0)
    : 0;

  // ── Handlers ─────────────────────────────────────────────────────────
  const togglePopover = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setOpen(false);
  }, []);

  const handleStatusToggle = useCallback(
    (status: string) => {
      const current = selectedStatuses;
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onFilterChange(next.length > 0 ? next.join(',') : null);
    },
    [selectedStatuses, onFilterChange],
  );

  const handleStatusClearAll = useCallback(() => {
    onFilterChange(null);
    closePopover();
  }, [onFilterChange, closePopover]);

  const handleRemoveStatusPill = useCallback(
    (status: string) => {
      const current = selectedStatuses;
      const next = current.filter((s) => s !== status);
      onFilterChange(next.length > 0 ? next.join(',') : null);
    },
    [selectedStatuses, onFilterChange],
  );

  // ── Keyboard & outside-click handlers ────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
        chipRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closePopover]);

  useEffect(() => {
    if (!open) return;

    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !containerRef.current?.contains(target)) {
        closePopover();
      }
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [open, closePopover]);

  // ── Build status filter pills ────────────────────────────────────────
  const statusFilterPills: { key: string; label: string; onRemove: () => void }[] =
    selectedStatuses.map((status) => ({
      key: `status-${status}`,
      label: status.replace(/_/g, ' '),
      onRemove: () => handleRemoveStatusPill(status),
    }));

  const externalActivePills = activePills ?? [];

  const showPillsRow = statusFilterPills.length > 0 || externalActivePills.length > 0;

  // ── Render ───────────────────────────────────────────────────────────
  if (!hasStatusCounts && !isLoading) {
    // No status counts available for this entity type — render nothing.
    return null;
  }

  return (
    <div ref={containerRef} className="relative inline-flex flex-col gap-1">
      {/* ── Chip button ────────────────────────────────────────────── */}
      <button
        type="button"
        data-filter-chip="status"
        ref={chipRef}
        className={chipClass(statusActive, disabled)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={togglePopover}
      >
        <span>Status</span>
        {statusBadgeCount > 0 && <span className={badgeClass}>{statusBadgeCount}</span>}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      {/* ── Popover ────────────────────────────────────────────────── */}
      {open && (
        <FilterPopover id="status">
          {isLoading ? (
            <div className="text-xs text-zinc-400 py-2">Loading status counts…</div>
          ) : (
            <>
              <div className="text-xs font-medium text-zinc-700 mb-2">Filter by status</div>
              {/* "All" quick-select */}
              <button
                type="button"
                className={`w-full rounded px-2 py-1 text-left text-xs ${
                  selectedStatuses.length === 0
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-zinc-100'
                }`}
                onClick={handleStatusClearAll}
              >
                <span className="flex items-center justify-between">
                  <span>All</span>
                  <span className="tabular-nums text-zinc-400">{allStatusesTotal}</span>
                </span>
              </button>
              <div className="border-t border-line my-1" />
              {statusCounts.map((sc) => {
                const isSelected = selectedStatuses.includes(sc.status);
                return (
                  <button
                    key={sc.status}
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left text-xs flex items-center justify-between ${
                      isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-zinc-100'
                    }`}
                    onClick={() => handleStatusToggle(sc.status)}
                  >
                    <span className="flex items-center gap-1.5">
                      {isSelected && <Check className="h-3 w-3 text-blue-600" />}
                      <span className={isSelected ? '' : 'ml-[18px]'}>
                        {sc.status.replace(/_/g, ' ')}
                      </span>
                    </span>
                    <span className="tabular-nums text-zinc-400">{sc.count}</span>
                  </button>
                );
              })}
            </>
          )}
        </FilterPopover>
      )}

      {/* ── Active filter pills row ────────────────────────────────── */}
      {showPillsRow && (
        <div className="flex flex-wrap items-center gap-1 ml-0.5">
          {statusFilterPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="selection-pill text-xs"
              title={`Remove ${pill.label} status filter`}
              aria-label={`Remove ${pill.label} status filter`}
              onClick={pill.onRemove}
            >
              {pill.label}
              <X className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          {statusFilterPills.length > 0 && (
            <button
              type="button"
              className="icon-button"
              title="Clear all status filters"
              aria-label="Clear all status filters"
              onClick={handleStatusClearAll}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}

          {/* External active filter pills */}
          {externalActivePills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="selection-pill text-xs"
              title={`Remove ${pill.label} filter`}
              aria-label={`Remove ${pill.label} filter`}
              onClick={pill.onRemove}
            >
              {pill.label}
              <X className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
