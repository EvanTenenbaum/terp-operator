import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  Calendar,
  Search,
  ChevronDown,
  Download,
  Filter,
  X,
  ArrowUpDown,
  GripHorizontal,
} from 'lucide-react';
import type { ViewKey } from '../../shared/types';
import type { FilterGroupInput } from '../../shared/filterSchemas';
import { useUiStore } from '../store/uiStore';
import { StatusFilterPill, type StatusCount } from './StatusFilterPill';

// ============================================================================
// TYPES
// ============================================================================

export interface FilterPreset {
  key: string;
  label: string;
  /** Grid filter string (e.g. "status:draft,confirmed") */
  filter: string;
}

export type QuickFilterType = 'date' | 'keyword' | 'amount';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export interface DataView {
  key: string;
  label: string;
}

// StatusCount re-exported from StatusFilterPill
export type { StatusCount };

export interface FilterToolbarProps {
  view: ViewKey;
  /** Quick filter presets (statuses, flags) */
  presets?: FilterPreset[];
  /** Which quick filter chips to show */
  quickFilters?: QuickFilterType[];
  /** Saved data views dropdown content */
  dataViews?: DataView[];
  /** Group-by field options */
  groupByFields?: readonly string[] | string[];
  /** Sort field options */
  sortFields?: string[];
  /** Which export formats to offer */
  exportFormats?: ExportFormat[];
  /** Called when user triggers an export */
  onExport?: (format: ExportFormat) => void;
  /** Called when user clicks Advanced */
  onAdvancedClick?: () => void;
  /** True when advanced filters with AND/OR/nesting are active */
  hasComplexFilter?: boolean;
  /** Whether the toolbar is disabled (e.g. no data) */
  disabled?: boolean;
  /** Status counts for the multi-select status filter pill (replaces ViewTabBar). */
  statusCounts?: StatusCount[];
  /** Active status filter string (e.g. "draft,confirmed"). Empty = all. */
  activeStatusFilter?: string;
  /** Called when status filter changes. Pass comma-separated statuses or empty string. */
  onStatusFilterChange?: (statusFilter: string) => void;
  /** External active filter pills (e.g., customer/vendor URL param filters from MatchmakingView). */
  activePills?: { key: string; label: string; onRemove: () => void }[];
}

// ============================================================================
// QUICK FILTER STATE
// ============================================================================

interface DateFilterState {
  start: string;
  end: string;
}

interface AmountFilterState {
  min: string;
  max: string;
}

interface KeywordFilterState {
  text: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FilterToolbar({
  view,
  presets,
  quickFilters,
  dataViews,
  groupByFields,
  sortFields,
  exportFormats,
  onExport,
  onAdvancedClick,
  hasComplexFilter = false,
  disabled = false,
  statusCounts,
  activeStatusFilter,
  onStatusFilterChange,
  activePills,
}: FilterToolbarProps) {
  // ── Store ──────────────────────────────────────────────────────────
  const storedGridFilter = useUiStore((s) => s.gridFilters?.[view] ?? '');
  const setGridFilter = useUiStore((s) => s.setGridFilter);
  const storedAdvancedFilter = useUiStore((s) => s.gridAdvancedFilters?.[view]);
  const setGridAdvancedFilter = useUiStore((s) => s.setGridAdvancedFilter);
  const clearGridAdvancedFilter = useUiStore((s) => s.clearGridAdvancedFilter);
  // P6: group-by read/write via uiStore (replaces local groupBy state)
  const groupBy = useUiStore((s) => s.gridGroupByField?.[view] ?? '');
  const setGridGroupByField = useUiStore((s) => s.setGridGroupByField);

  // ── Popover state ──────────────────────────────────────────────────
  type PopoverId = 'dataViews' | 'date' | 'keyword' | 'amount' | 'group' | 'sort' | 'export' | 'status';

  const [openPopover, setOpenPopover] = useState<PopoverId | null>(null);

  // ── Quick filter internal state ────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ start: '', end: '' });
  const [keywordFilter, setKeywordFilter] = useState<KeywordFilterState>({ text: '' });
  const [amountFilter, setAmountFilter] = useState<AmountFilterState>({ min: '', max: '' });
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Refs ───────────────────────────────────────────────────────────
  const toolbarRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // ── Active quick filter detection ───────────────────────────────────
  const dateActive = dateFilter.start !== '' || dateFilter.end !== '';
  const keywordActive = keywordFilter.text !== '';
  const amountActive = amountFilter.min !== '' || amountFilter.max !== '';
  const groupActive = groupBy !== '';
  const sortActive = sortBy !== '';

  // ── Status multi-select filter (delegated to StatusFilterPill component) ──

  const quickFilterActiveCount = [
    dateActive,
    keywordActive,
    amountActive,
  ].filter(Boolean).length;

  const advancedHasConditions = (storedAdvancedFilter?.conditions?.length ?? 0) > 0;
  const complexActive = hasComplexFilter || hasNestedOr(storedAdvancedFilter ?? null);

  // ── Keyboard handlers ──────────────────────────────────────────────
  const closePopover = useCallback(() => setOpenPopover(null), []);

  const togglePopover = useCallback(
    (id: PopoverId) => {
      setOpenPopover((prev) => (prev === id ? null : id));
    },
    [],
  );

  useEffect(() => {
    if (!openPopover) return;

    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
        // Refocus the trigger chip
        const chip = chipRefs.current.get(openPopover);
        chip?.focus();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openPopover, closePopover]);

  // Click outside to close
  useEffect(() => {
    if (!openPopover) return;

    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-filter-popover]') && !target.closest('[data-filter-chip]')) {
        closePopover();
      }
    };

    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [openPopover, closePopover]);

  // ── Filter application helpers ──────────────────────────────────────
  const applyPreset = useCallback(
    (preset: FilterPreset) => {
      const isActive = storedGridFilter === preset.filter;
      setGridFilter(view, isActive ? '' : preset.filter);
    },
    [view, storedGridFilter, setGridFilter],
  );

  const buildQuickFilterString = useCallback((): string => {
    const parts: string[] = [];

    if (dateActive) {
      const range = [dateFilter.start, dateFilter.end].filter(Boolean).join(',');
      if (range) parts.push(`date:${range}`);
    }
    if (keywordActive) {
      parts.push(`text:${keywordFilter.text}`);
    }
    if (amountActive) {
      const vals = [amountFilter.min, amountFilter.max].filter(Boolean).join(',');
      if (vals) parts.push(`amount:${vals}`);
    }

    // Preserve existing non-quick-filter parts of the grid filter
    const existing = storedGridFilter;
    const existingParts = existing.split(/\s+/).filter((p) => {
      return !p.startsWith('date:') && !p.startsWith('text:') && !p.startsWith('amount:');
    });

    return [...existingParts, ...parts].join(' ').trim();
  }, [dateActive, dateFilter, keywordActive, keywordFilter.text, amountActive, amountFilter, storedGridFilter]);

  // Apply quick filters whenever they change
  useEffect(() => {
    const filterString = buildQuickFilterString();
    setGridFilter(view, filterString);
    // buildQuickFilterString intentionally excluded: it depends on storedGridFilter,
    // and including it would cause the effect to re-apply quick filters whenever
    // the user edits filters manually (feedback loop).
    // setGridFilter is a stable Zustand setter — no re-render risk, but adding
    // it to deps would violate the existing convention of omitting Zustand setters.
  }, [dateActive, dateFilter, keywordActive, keywordFilter.text, amountActive, amountFilter, view]);

  const clearQuickFilters = useCallback(() => {
    setDateFilter({ start: '', end: '' });
    setKeywordFilter({ text: '' });
    setAmountFilter({ min: '', max: '' });
    // Remove quick filter parts from stored filter
    const existing = storedGridFilter;
    const cleaned = existing
      .split(/\s+/)
      .filter((p) => !p.startsWith('date:') && !p.startsWith('text:') && !p.startsWith('amount:'))
      .join(' ')
      .trim();
    setGridFilter(view, cleaned);
  }, [storedGridFilter, view, setGridFilter]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      onExport?.(format);
      closePopover();
    },
    [onExport, closePopover],
  );

  // ── Render helpers ──────────────────────────────────────────────────
  const showQuickFilter = (type: QuickFilterType): boolean =>
    quickFilters ? quickFilters.includes(type) : true;

  const chipClass = (active: boolean, hasPopover: boolean) =>
    [
      'inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2.5 text-xs font-medium transition-colors',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      active
        ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
      hasPopover ? '' : '',
    ].join(' ');

  const badgeClass =
    'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700';

  // ── Active filter pills ────────────────────────────────────────────
  const activeQuickPills: { key: string; label: string; onRemove: () => void }[] = [];
  if (dateActive) {
    activeQuickPills.push({
      key: 'date',
      label: `Date: ${dateFilter.start || '…'} – ${dateFilter.end || '…'}`,
      onRemove: () => setDateFilter({ start: '', end: '' }),
    });
  }
  if (keywordActive) {
    activeQuickPills.push({
      key: 'keyword',
      label: `Text: ${keywordFilter.text}`,
      onRemove: () => setKeywordFilter({ text: '' }),
    });
  }
  if (amountActive) {
    activeQuickPills.push({
      key: 'amount',
      label: `Amount: ${amountFilter.min || '0'} – ${amountFilter.max || '∞'}`,
      onRemove: () => setAmountFilter({ min: '', max: '' }),
    });
  }

  // ── Complex filter pill ─────────────────────────────────────────────
  const showComplexPill = complexActive;

  // ── External active filter pills (delegated to StatusFilterPill) ─────

  // ── Compute if we need to show filter pills row ─────────────────────
  const showPillsRow =
    activeQuickPills.length > 0 ||
    showComplexPill;

  return (
    <div
      ref={toolbarRef}
      className="filter-toolbar flex flex-col gap-1.5 border-b border-line bg-panel px-3 py-1.5"
      role="toolbar"
      aria-label={`Filter toolbar for ${view}`}
    >
      {/* ── Main chip row ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Data views dropdown */}
        {dataViews && dataViews.length > 0 && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="dataViews"
              className={chipClass(false, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'dataViews'}
              aria-haspopup="listbox"
              onClick={() => togglePopover('dataViews')}
              ref={(el) => { chipRefs.current.set('dataViews', el); }}
            >
              <span>Data views</span>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'dataViews' && (
              <FilterPopover id="dataViews">
                <div className="text-xs text-zinc-500 mb-1">Saved views</div>
                {dataViews.map((dv) => (
                  <button
                    key={dv.key}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100"
                    onClick={() => closePopover()}
                  >
                    {dv.label}
                  </button>
                ))}
                <div className="border-t border-line mt-1 pt-1">
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50"
                    onClick={() => closePopover()}
                  >
                    + Save current view
                  </button>
                </div>
              </FilterPopover>
            )}
          </div>
        )}

        {/* Preset chips */}
        {presets?.map((preset) => {
          const isActive = storedGridFilter === preset.filter;
          return (
            <button
              key={preset.key}
              type="button"
              data-filter-chip={preset.key}
              className={chipClass(isActive, false)}
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => applyPreset(preset)}
              ref={(el) => { chipRefs.current.set(preset.key, el); }}
            >
              {preset.label}
              {isActive && <X className="h-3 w-3" aria-hidden="true" />}
            </button>
          );
        })}

        {/* Status multi-select filter pill (replaces ViewTabBar) */}
        {statusCounts && statusCounts.length > 0 && (
          <StatusFilterPill
            entityType={view}
            activeFilter={activeStatusFilter}
            onFilterChange={(status) => onStatusFilterChange?.(status ?? '')}
            disabled={disabled}
            activePills={activePills}
          />
        )}

        {/* Separator */}
        {((presets?.length ?? 0) > 0 || (statusCounts && statusCounts.length > 0)) && (quickFilters?.length ?? 0) > 0 && (
          <div className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
        )}

        {/* Date filter chip */}
        {quickFilters && showQuickFilter('date') && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="date"
              className={chipClass(dateActive, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'date'}
              aria-haspopup="dialog"
              onClick={() => togglePopover('date')}
              ref={(el) => { chipRefs.current.set('date', el); }}
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Date</span>
              {dateActive && <span className={badgeClass}>1</span>}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'date' && (
              <FilterPopover id="date">
                <div className="text-xs font-medium text-zinc-700 mb-2">Date range</div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFilter.start}
                    onChange={(e) => setDateFilter((prev) => ({ ...prev, start: e.target.value }))}
                    className="input compact text-xs w-36"
                    aria-label="Start date"
                  />
                  <span className="text-xs text-zinc-400">to</span>
                  <input
                    type="date"
                    value={dateFilter.end}
                    onChange={(e) => setDateFilter((prev) => ({ ...prev, end: e.target.value }))}
                    className="input compact text-xs w-36"
                    aria-label="End date"
                  />
                </div>
                {dateActive && (
                  <button
                    type="button"
                    className="text-button compact-action mt-2"
                    onClick={() => setDateFilter({ start: '', end: '' })}
                  >
                    Clear
                  </button>
                )}
              </FilterPopover>
            )}
          </div>
        )}

        {/* Keyword filter chip */}
        {quickFilters && showQuickFilter('keyword') && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="keyword"
              className={chipClass(keywordActive, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'keyword'}
              aria-haspopup="dialog"
              onClick={() => togglePopover('keyword')}
              ref={(el) => { chipRefs.current.set('keyword', el); }}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Keyword</span>
              {keywordActive && <span className={badgeClass}>1</span>}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'keyword' && (
              <FilterPopover id="keyword">
                <div className="text-xs font-medium text-zinc-700 mb-2">Text search</div>
                <input
                  type="text"
                  value={keywordFilter.text}
                  onChange={(e) => setKeywordFilter({ text: e.target.value })}
                  className="input compact text-xs w-52"
                  placeholder="Search across all fields…"
                  aria-label="Keyword search"
                  autoFocus
                />
                {keywordActive && (
                  <button
                    type="button"
                    className="text-button compact-action mt-2"
                    onClick={() => setKeywordFilter({ text: '' })}
                  >
                    Clear
                  </button>
                )}
              </FilterPopover>
            )}
          </div>
        )}

        {/* Amount filter chip */}
        {quickFilters && showQuickFilter('amount') && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="amount"
              className={chipClass(amountActive, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'amount'}
              aria-haspopup="dialog"
              onClick={() => togglePopover('amount')}
              ref={(el) => { chipRefs.current.set('amount', el); }}
            >
              <span>$</span>
              <span>Amount</span>
              {amountActive && <span className={badgeClass}>1</span>}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'amount' && (
              <FilterPopover id="amount">
                <div className="text-xs font-medium text-zinc-700 mb-2">Amount range</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={amountFilter.min}
                    onChange={(e) => setAmountFilter((prev) => ({ ...prev, min: e.target.value }))}
                    className="input compact text-xs w-24"
                    placeholder="Min"
                    aria-label="Minimum amount"
                  />
                  <span className="text-xs text-zinc-400">to</span>
                  <input
                    type="number"
                    value={amountFilter.max}
                    onChange={(e) => setAmountFilter((prev) => ({ ...prev, max: e.target.value }))}
                    className="input compact text-xs w-24"
                    placeholder="Max"
                    aria-label="Maximum amount"
                  />
                </div>
                {amountActive && (
                  <button
                    type="button"
                    className="text-button compact-action mt-2"
                    onClick={() => setAmountFilter({ min: '', max: '' })}
                  >
                    Clear
                  </button>
                )}
              </FilterPopover>
            )}
          </div>
        )}

        {/* Separator before group/sort/advanced */}
        <div className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />

        {/* Group chip */}
        {groupByFields && groupByFields.length > 0 && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="group"
              className={chipClass(groupActive, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'group'}
              aria-haspopup="listbox"
              onClick={() => togglePopover('group')}
              ref={(el) => { chipRefs.current.set('group', el); }}
            >
              <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Group</span>
              {groupActive && <span className={badgeClass}>1</span>}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
              {openPopover === 'group' && (
              <FilterPopover id="group">
                <div className="text-xs font-medium text-zinc-700 mb-2">Group by</div>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left text-xs ${groupBy === '' ? 'bg-blue-50 text-blue-700' : 'hover:bg-zinc-100'}`}
                    onClick={() => { setGridGroupByField(view, null); closePopover(); }}
                  >
                    None
                  </button>
                  {groupByFields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left text-xs ${groupBy === field ? 'bg-blue-50 text-blue-700' : 'hover:bg-zinc-100'}`}
                      onClick={() => { setGridGroupByField(view, field); closePopover(); }}
                    >
                      {field}
                    </button>
                  ))}
                </div>
              </FilterPopover>
            )}
          </div>
        )}

        {/* Sort chip */}
        {sortFields && sortFields.length > 0 && (
          <div className="relative">
            <button
              type="button"
              data-filter-chip="sort"
              className={chipClass(sortActive, true)}
              disabled={disabled}
              aria-expanded={openPopover === 'sort'}
              aria-haspopup="listbox"
              onClick={() => togglePopover('sort')}
              ref={(el) => { chipRefs.current.set('sort', el); }}
            >
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sort</span>
              {sortActive && <span className={badgeClass}>1</span>}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'sort' && (
              <FilterPopover id="sort">
                <div className="text-xs font-medium text-zinc-700 mb-2">Sort by</div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    className={`text-xs px-2 py-0.5 rounded border ${sortDir === 'asc' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-line'}`}
                    onClick={() => setSortDir('asc')}
                  >
                    Asc
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-0.5 rounded border ${sortDir === 'desc' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-line'}`}
                    onClick={() => setSortDir('desc')}
                  >
                    Desc
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  {sortFields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left text-xs ${sortBy === field ? 'bg-blue-50 text-blue-700' : 'hover:bg-zinc-100'}`}
                      onClick={() => { setSortBy(field); closePopover(); }}
                    >
                      {field}
                    </button>
                  ))}
                </div>
              </FilterPopover>
            )}
          </div>
        )}

        {/* Advanced filter button */}
        <button
          type="button"
          data-filter-chip="advanced"
          className={`inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2.5 text-xs font-medium transition-colors ${
            disabled
              ? 'cursor-not-allowed opacity-50'
              : advancedHasConditions
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
          }`}
          disabled={disabled}
          onClick={() => onAdvancedClick?.()}
          ref={(el) => { chipRefs.current.set('advanced', el); }}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Advanced</span>
          {advancedHasConditions && (
            <span className={badgeClass}>{storedAdvancedFilter!.conditions.length}</span>
          )}
        </button>

        {/* Export dropdown */}
        {exportFormats && exportFormats.length > 0 && (
          <div className="relative ml-auto">
            <button
              type="button"
              data-filter-chip="export"
              className={`inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2.5 text-xs font-medium transition-colors ${
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
              disabled={disabled}
              aria-expanded={openPopover === 'export'}
              aria-haspopup="menu"
              onClick={() => togglePopover('export')}
              ref={(el) => { chipRefs.current.set('export', el); }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {openPopover === 'export' && (
              <FilterPopover id="export" alignRight>
                <div className="text-xs font-medium text-zinc-700 mb-1">Export as</div>
                {exportFormats.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100"
                    onClick={() => handleExport(fmt)}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </FilterPopover>
            )}
          </div>
        )}
      </div>

      {/* ── Active filter pills + Complex pill row ──────────────────── */}
      {showPillsRow && (
        <div className="flex flex-wrap items-center gap-1">
          {activeQuickPills.map((pill) => (
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

          {activeQuickPills.length > 0 && (
            <button
              type="button"
              className="icon-button"
              title="Clear all quick filters"
              aria-label="Clear all quick filters"
              onClick={clearQuickFilters}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}

          {/* Status filter pills + external pills are now rendered by StatusFilterPill */}

          {showComplexPill && (
            <button
              type="button"
              className="selection-pill warning cursor-pointer text-xs"
              title="Complex filter active — click to open Advanced"
              aria-label="Complex filter active. Click to open Advanced filters."
              onClick={() => onAdvancedClick?.()}
            >
              <Filter className="h-3 w-3" aria-hidden="true" />
              Complex filter active
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FILTER POPOVER (internal)
// ============================================================================

interface FilterPopoverProps {
  id: string;
  children: ReactNode;
  alignRight?: boolean;
}

function FilterPopover({ id, children, alignRight = false }: FilterPopoverProps) {
  return (
    <div
      data-filter-popover={id}
      className={`absolute z-40 mt-1 min-w-[180px] rounded-md border border-line bg-white p-3 shadow-lg ${alignRight ? 'right-0' : 'left-0'}`}
      role="dialog"
      aria-label={`${id} filter options`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Detects whether a FilterGroupInput has AND/OR complexity beyond a simple
 * flat AND group. Returns true for:
 *   - Nested groups (conditions containing `logic` property)
 *   - OR logic at the top level
 *   - Mixed AND/OR at any level
 */
function hasNestedOr(filter: FilterGroupInput | null): boolean {
  if (!filter) return false;

  // Top-level OR is complex
  if (filter.logic === 'OR') return true;

  // Check for nested groups
  for (const condition of filter.conditions) {
    if (typeof condition === 'object' && condition !== null && 'logic' in condition) {
      const group = condition as FilterGroupInput;
      // Nested group or OR at any level
      if (group.logic === 'OR') return true;
      if (hasNestedOr(group)) return true;
    }
  }

  return false;
}
