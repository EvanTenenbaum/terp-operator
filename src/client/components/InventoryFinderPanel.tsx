import { Filter, PackagePlus, Plus, Search, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../api/trpc';
import type { GridRow } from '../../shared/types';
import { WorkspacePanel } from './WorkspacePanel';
import { FilterGroupInput, FILTER_FIELDS } from '../../shared/filterSchemas';
import type { FilterCondition, FilterFieldName } from '../../shared/filterSchemas';
import { evaluateFilterGroup, calculateAgeDays } from '../utils/filterEvaluator';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder';
import { SavedFiltersManager } from './SavedFiltersManager';
import { INVENTORY_FINDER_RULE_MAP } from './columns';

export interface InventoryFinderBatch extends GridRow {
  batchCode?: string;
  sourceCode?: string | null;
  shorthand?: string | null;
  name?: string;
  itemAlias?: string | null;
  displayName?: string | null;
  category?: string;
  vendorId?: string | null;
  vendor?: string | null;
  availableQty?: string | number;
  unitPrice?: string | number;
  unitCost?: string | number;
  location?: string | null;
  lotCode?: string | null;
  ownershipStatus?: string | null;
  legacyMarker?: string | null;
  intakeDate?: string | null;
  ticketCost?: string | number | null;
  notes?: string | null;
  mediaStatus?: string | null;
  priceRange?: string | null;
  tags?: string[] | string | null;
  ageDays?: number;
  uom?: string | null;
  /**
   * TER-1618 / F-27: item UUID from `b.item_id` — present in batch query.
   * Used for future last-ordered-qty lookup once customerWorkspace or a
   * dedicated panel query surfaces per-item purchase history.
   */
  itemId?: string | null;
  /**
   * TER-1618 / F-27: wholesale case-pack quantity for this item.
   * Not yet in the DB schema — field is reserved for when a `case_pack`
   * column is added to `batches` or `items` and the batch query is updated.
   * When present and > 0, the qty input defaults to this value instead of 1.
   */
  casePack?: number | null;
  /**
   * TER-1634 / F-28: Qty already held in other operators' draft/confirmed sales
   * orders.  Returned by the server-side draftReservedQty projection.  When > 0
   * the Avail cell shows an amber indicator so operators can see reduced effective
   * availability before committing the line.
   */
  draftReservedQty?: string | number | null;
}

interface InventoryFinderPanelProps {
  selectedOrderId?: string;
  /**
   * TER-1618 / F-27: customer UUID for the active sale workspace.
   * Passed through from SalesSourcePane. Reserved for future use when
   * a per-item order-history lookup (Priority 2 of the UOM-aware default)
   * is wired up without violating the no-new-fetch guardrail.
   */
  customerId?: string;
  focusKey?: string;
  addedBatchIds?: Set<string>;
  initialSearch?: string;
  onAddBatch: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Field groups for the "Add filter" two-step dropdown
// ---------------------------------------------------------------------------

const FILTER_FIELD_GROUPS = [
  {
    group: 'Product',
    fields: [
      { field: 'category' as FilterFieldName, label: 'Category' },
      { field: 'subcategory' as FilterFieldName, label: 'Subcategory' },
      { field: 'vendorId' as FilterFieldName, label: 'Vendor' },
      { field: 'tags' as FilterFieldName, label: 'Tags' },
      { field: 'location' as FilterFieldName, label: 'Location' },
      { field: 'ownershipStatus' as FilterFieldName, label: 'Ownership' },
    ],
  },
  {
    group: 'Quantity & Price',
    fields: [
      { field: 'availableQty' as FilterFieldName, label: 'Available qty' },
      { field: 'unitPrice' as FilterFieldName, label: 'Unit price' },
      { field: 'unitCost' as FilterFieldName, label: 'Unit cost' },
    ],
  },
  {
    group: 'Date & Age',
    fields: [
      { field: 'intakeDate' as FilterFieldName, label: 'Intake date' },
      { field: 'ageDays' as FilterFieldName, label: 'Age (days)' },
    ],
  },
  {
    group: 'Status',
    fields: [
      { field: 'status' as FilterFieldName, label: 'Status' },
    ],
  },
];

function getOperatorsForField(field: FilterFieldName): { value: string; label: string }[] {
  const type = FILTER_FIELDS[field]?.type;
  if (type === 'number') {
    return [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'not equals' },
      { value: 'greater_than', label: 'greater than' },
      { value: 'less_than', label: 'less than' },
      { value: 'greater_than_or_equal', label: 'at least' },
      { value: 'less_than_or_equal', label: 'at most' },
      { value: 'between', label: 'between' },
      { value: 'is_null', label: 'is empty' },
      { value: 'is_not_null', label: 'is not empty' },
    ];
  }
  if (type === 'date') {
    return [
      { value: 'equals', label: 'on' },
      { value: 'before', label: 'before' },
      { value: 'after', label: 'after' },
      { value: 'is_null', label: 'is empty' },
    ];
  }
  if (type === 'array') {
    return [
      { value: 'array_contains', label: 'contains' },
      { value: 'array_not_contains', label: 'does not contain' },
      { value: 'is_null', label: 'is empty' },
    ];
  }
  // text / uuid / default
  return [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'text_contains', label: 'contains' },
    { value: 'is_null', label: 'is empty' },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InventoryFinderPanel({
  selectedOrderId,
  focusKey = '',
  addedBatchIds = new Set(),
  initialSearch = '',
  onAddBatch,
}: InventoryFinderPanelProps) {
  const reference = trpc.queries.reference.useQuery();
  const { data: savedFilters } = trpc.filters.listSavedFilters.useQuery({ targetView: 'inventory' });
  const me = trpc.auth.me.useQuery();
  const trpcUtils = trpc.useContext();
  const saveFilterMutation = trpc.filters.saveFilter.useMutation({
    onSuccess: () => {
      void trpcUtils.filters.listSavedFilters.invalidate();
    },
  });

  // Core filter state (kept from original)
  const [search, setSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [advancedFilter, setAdvancedFilter] = useState<FilterGroupInput | null>(null);
  const [selectedSavedFilter, setSelectedSavedFilter] = useState<string | null>(null);
  const [activeSliceIds, setActiveSliceIds] = useState<Set<string>>(new Set());
  const [manageFiltersOpen, setManageFiltersOpen] = useState(false);
  const [filterSaveStatus, setFilterSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Add filter dropdown state
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [addFilterStep, setAddFilterStep] = useState<'field' | 'value'>('field');
  const [addFilterField, setAddFilterField] = useState<FilterFieldName>('category');
  const [addFilterOperator, setAddFilterOperator] = useState('equals');
  const [addFilterValue, setAddFilterValue] = useState<string | number>('');
  const [addFilterSearch, setAddFilterSearch] = useState('');
  const addFilterRef = useRef<HTMLDivElement>(null);

  // Presets save popover
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');

  const lastInitialSearch = useRef('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const rows = ((reference.data?.availableBatches ?? []) as InventoryFinderBatch[]).map((row) => ({
    ...row,
    tags: Array.isArray(row.tags)
      ? row.tags
      : String(row.tags ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
  }));

  const facets = useMemo(() => {
    return {
      categories: unique(rows.map((row) => row.category)),
      vendors: reference.data?.vendors ?? [],
      tags: unique(rows.flatMap((row) => (Array.isArray(row.tags) ? row.tags : []))),
      locations: unique(rows.map((row) => row.location)),
      ownership: unique(rows.map((row) => row.ownershipStatus)),
    };
  }, [reference.data?.vendors, rows]);

  // Click-outside handler for add-filter dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addFilterRef.current && !addFilterRef.current.contains(e.target as Node)) {
        setAddFilterOpen(false);
        setAddFilterStep('field');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const nextSearch = initialSearch.trim();
    if (nextSearch && nextSearch !== lastInitialSearch.current) {
      setSearch(nextSearch);
      lastInitialSearch.current = nextSearch;
    }
  }, [initialSearch]);

  useEffect(() => {
    if (selectedOrderId || focusKey) searchInputRef.current?.focus();
  }, [focusKey, selectedOrderId]);

  const filtered = useMemo(() => {
    // Circuit breaker for large datasets
    let rowsToFilter = rows;
    if (rows.length > 10000) {
      console.warn(`Large dataset (${rows.length} products) - truncating to 10,000 for performance`);
      rowsToFilter = rows.slice(0, 10000);
    }

    const parsed = parseFinderSearch(search);
    const terms = parsed.terms;
    const max = parsed.maxPrice;
    return rowsToFilter
      .filter((row) => {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const haystack = buildFinderHaystack(row, tags);
        if (terms.length && !terms.every((term) => haystack.includes(term))) return false;
        if (max != null && Number(row.unitPrice ?? 0) > max) return false;

        // Advanced filter evaluation
        if (advancedFilter && advancedFilter.conditions.length > 0) {
          const rowWithAge = {
            ...row,
            ageDays: row.ageDays ?? calculateAgeDays(row.intakeDate ?? null),
          };
          if (!evaluateFilterGroup(rowWithAge, advancedFilter)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => Number(b.availableQty ?? 0) - Number(a.availableQty ?? 0))
      .slice(0, 80);
  }, [rows, search, advancedFilter]);

  const compared = useMemo(
    () => rows.filter((row) => compareIds.has(row.id)).slice(0, 4),
    [compareIds, rows],
  );

  const activeFilterCount =
    (search ? 1 : 0) + (advancedFilter?.conditions?.length ?? 0);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function applySavedFilter(sf: { id: string; filterDefinition: FilterGroupInput; name: string }) {
    setAdvancedFilter(sf.filterDefinition);
    setSelectedSavedFilter(sf.id);
    setActiveSliceIds(new Set([sf.id]));
    setAdvancedOpen(true);
  }

  function toggleSlice(sf: { id: string; filterDefinition: FilterGroupInput; name: string }) {
    setActiveSliceIds(prev => {
      const next = new Set(prev);
      if (next.has(sf.id)) {
        next.delete(sf.id);
      } else {
        next.add(sf.id);
      }
      // Compute merged filter from all active slices
      const activeFilters = (savedFilters ?? []).filter(f => next.has(f.id));
      if (activeFilters.length === 0) {
        setAdvancedFilter(null);
      } else {
        const allConditions = activeFilters.flatMap(f => {
          const def = f.filterDefinition as FilterGroupInput;
          return def.conditions ?? [];
        });
        setAdvancedFilter({ logic: 'AND', conditions: allConditions });
      }
      return next;
    });
    // Clear selected saved filter (since we're now using multi-select)
    setSelectedSavedFilter(null);
  }

  function toggleCompare(batchId: string) {
    setCompareIds((current) => {
      const next = new Set(current);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  async function add(batch: InventoryFinderBatch) {
    // TER-1618 / F-27: use smart default (casePack → fallback '1')
    const raw = quantities[batch.id] ?? defaultQtyFor(batch);
    const requested = Math.max(1, Number.parseFloat(raw) || 1);
    const available = Number(batch.availableQty ?? 0);
    await onAddBatch(batch, Math.min(requested, available || requested));
    // Reset to smart default so repeat-add remains UOM-aware
    setQuantities((current) => ({ ...current, [batch.id]: defaultQtyFor(batch) }));
  }

  async function saveCurrentFilter() {
    if (!advancedFilter || !saveViewName.trim()) return;
    await saveFilterMutation.mutateAsync({
      name: saveViewName.trim(),
      targetView: 'inventory',
      filterDefinition: advancedFilter,
      isGlobal: false,
    });
    setSaveViewName('');
    setShowSavePopover(false);
  }

  function renderAddFilterValueInput() {
    if (addFilterOperator === 'is_null' || addFilterOperator === 'is_not_null') return null;
    const type = FILTER_FIELDS[addFilterField]?.type;
    if (addFilterField === 'category') {
      return (
        <select
          className="select compact"
          value={String(addFilterValue)}
          onChange={(e) => setAddFilterValue(e.target.value)}
          aria-label="Category value"
        >
          <option value="">Select…</option>
          {facets.categories.map((c: string) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      );
    }
    if (addFilterField === 'vendorId') {
      return (
        <select
          className="select compact"
          value={String(addFilterValue)}
          onChange={(e) => setAddFilterValue(e.target.value)}
          aria-label="Vendor value"
        >
          <option value="">Select…</option>
          {facets.vendors.map((v: { id: string; name: string }) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      );
    }
    if (type === 'number') {
      return (
        <input
          type="number"
          className="input compact"
          value={String(addFilterValue)}
          onChange={(e) => setAddFilterValue(e.target.value)}
          placeholder="Value"
          aria-label="Filter value"
        />
      );
    }
    if (type === 'date') {
      return (
        <input
          type="date"
          className="input compact"
          value={String(addFilterValue)}
          onChange={(e) => setAddFilterValue(e.target.value)}
          aria-label="Date value"
        />
      );
    }
    return (
      <input
        type="text"
        className="input compact"
        value={String(addFilterValue)}
        onChange={(e) => setAddFilterValue(e.target.value)}
        placeholder="Value"
        aria-label="Filter value"
      />
    );
  }

  function commitAddFilter() {
    if (
      !addFilterValue &&
      addFilterOperator !== 'is_null' &&
      addFilterOperator !== 'is_not_null'
    ) {
      return;
    }
    const newCondition = {
      field: addFilterField,
      operator: addFilterOperator,
      value: addFilterValue,
    } as unknown as FilterCondition;
    const current = advancedFilter ?? { logic: 'AND' as const, conditions: [] };
    setAdvancedFilter({ ...current, conditions: [...current.conditions, newCondition] });
    setAddFilterOpen(false);
    setAddFilterStep('field');
    setAddFilterValue('');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <WorkspacePanel
      panelId="sales:inventory-finder"
      title="Inventory Finder"
      subtitle="Posted batches on hand"
      className="finder-panel"
      contentClassName="finder-panel-content"
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
          <span>
            {filtered.length} / {rows.length} shown
          </span>
          <span className="selection-pill">
            {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </span>
        </div>
      }
      testId="inventory-finder"
    >
      <div>
        {/* Filter bar */}
        <div className="filter-bar">
          <label className="finder-search" style={{ minWidth: 180, maxWidth: 260, flex: '1 1 180px' }}>
            <Search className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, notes, lot, vendor, tag…"
            />
          </label>

          {/* Active filter pills — one per top-level advancedFilter condition */}
          {(advancedFilter?.conditions ?? [])
            .filter((c): c is FilterCondition => 'field' in c)
            .map((condition, i) => (
              <span key={i} className="filter-pill">
                {condition.field}
                {condition.operator !== 'is_null' && condition.operator !== 'is_not_null'
                  ? `: ${String(condition.value)}`
                  : ` ${String(condition.operator).replace(/_/g, ' ')}`}
                <button
                  type="button"
                  className="filter-pill-remove"
                  onClick={() => {
                    const updated = {
                      ...advancedFilter!,
                      conditions: advancedFilter!.conditions.filter((_, idx) => idx !== i),
                    };
                    setAdvancedFilter(updated);
                  }}
                  aria-label={`Remove filter: ${condition.field}`}
                >
                  ×
                </button>
              </span>
            ))}

          {/* Add filter two-step dropdown */}
          <div className="relative" ref={addFilterRef}>
            <button
              type="button"
              className="add-filter-btn"
              onClick={() => setAddFilterOpen((o) => !o)}
              aria-expanded={addFilterOpen}
              aria-haspopup="listbox"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add filter
            </button>

            {addFilterOpen && (
              <div className="add-filter-dropdown" role="dialog" aria-label="Add filter">
                {addFilterStep === 'field' ? (
                  <>
                    <div className="add-filter-dropdown-search">
                      <Search className="h-3 w-3 opacity-50" aria-hidden="true" />
                      <input
                        autoFocus
                        value={addFilterSearch}
                        onChange={(e) => setAddFilterSearch(e.target.value)}
                        placeholder="Search fields…"
                        className="flex-1 bg-transparent text-xs outline-none"
                      />
                    </div>
                    {FILTER_FIELD_GROUPS.filter(({ fields }) =>
                      fields.some((f) =>
                        f.label.toLowerCase().includes(addFilterSearch.toLowerCase()),
                      ),
                    ).map(({ group, fields }) => (
                      <div key={group}>
                        <div className="add-filter-dropdown-group">{group}</div>
                        {fields
                          .filter((f) =>
                            f.label.toLowerCase().includes(addFilterSearch.toLowerCase()),
                          )
                          .map((f) => (
                            <div
                              key={f.field}
                              className="add-filter-dropdown-item"
                              role="option"
                              tabIndex={0}
                              onClick={() => {
                                setAddFilterField(f.field);
                                setAddFilterStep('value');
                                setAddFilterSearch('');
                                setAddFilterOperator(getOperatorsForField(f.field)[0].value);
                                setAddFilterValue('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setAddFilterField(f.field);
                                  setAddFilterStep('value');
                                }
                              }}
                            >
                              {f.label}
                            </div>
                          ))}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="add-filter-dropdown-search">
                      <button
                        type="button"
                        className="text-button compact-action"
                        onClick={() => {
                          setAddFilterStep('field');
                          setAddFilterSearch('');
                        }}
                        aria-label="Back to field selection"
                      >
                        ←
                      </button>
                      <span className="font-semibold text-ink text-xs">
                        {FILTER_FIELD_GROUPS.flatMap((g) => g.fields).find(
                          (f) => f.field === addFilterField,
                        )?.label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 p-2.5">
                      <select
                        className="select compact"
                        value={addFilterOperator}
                        onChange={(e) => setAddFilterOperator(e.target.value)}
                        aria-label="Operator"
                      >
                        {getOperatorsForField(addFilterField).map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      {renderAddFilterValueInput()}
                    </div>
                    <div className="flex gap-1.5 border-t border-line p-2">
                      <button
                        type="button"
                        className="primary-button compact-action flex-1"
                        onClick={commitAddFilter}
                      >
                        Add filter
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-action"
                        onClick={() => setAddFilterOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {filterSaveStatus && (
              <div
                className={filterSaveStatus.ok ? 'text-xs text-green-700' : 'field-error text-xs'}
                role="alert"
              >
                {filterSaveStatus.msg}
              </div>
            )}
          </div>

          {/* Clear all */}
          {search || (advancedFilter?.conditions ?? []).length > 0 ? (
          <button
              type="button"
              className="text-button compact-action"
              onClick={() => {
                setSearch('');
                setAdvancedFilter(null);
                setActiveSliceIds(new Set());
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear all
            </button>
          ) : null}

          {/* Advanced toggle */}
          <button
            type="button"
            className={advancedOpen ? 'advanced-btn open' : 'advanced-btn'}
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Advanced
            <span className="text-[10px]" aria-hidden="true">
              {advancedOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>

        {/* Presets strip — DB-driven saved views */}
        <div className="presets-strip" aria-label="Saved inventory views">
          <span className="presets-label">Views</span>
          {(savedFilters ?? []).map((sf) => (
            <button
              key={sf.id}
              type="button"
              className={activeSliceIds.has(sf.id) ? 'finder-chip success' : 'finder-chip'}
              aria-pressed={activeSliceIds.has(sf.id)}
              onClick={() => toggleSlice(sf)}
            >
              {sf.name}
            </button>
          ))}

          {(advancedFilter?.conditions ?? []).length > 0 ? (
            <button
              type="button"
              className="preset-save-chip"
              onClick={() => setShowSavePopover(true)}
            >
              + Save current
            </button>
          ) : null}

          {showSavePopover && (
            <div className="flex items-center gap-1.5 ml-1">
              <input
                autoFocus
                className="input compact"
                style={{ width: 140 }}
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="View name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveCurrentFilter();
                  if (e.key === 'Escape') setShowSavePopover(false);
                }}
              />
              <button
                type="button"
                className="primary-button compact-action"
                onClick={() => void saveCurrentFilter()}
                disabled={!saveViewName.trim()}
              >
                Save
              </button>
              <button
                type="button"
                className="secondary-button compact-action"
                onClick={() => setShowSavePopover(false)}
              >
                Cancel
              </button>
            </div>
          )}

          <button
            type="button"
            className="presets-manage-link"
            onClick={() => setManageFiltersOpen((o) => !o)}
            aria-expanded={manageFiltersOpen}
            aria-label="Manage saved filters"
          >
            <Settings className="h-3 w-3" aria-hidden="true" />
            Manage views
          </button>
        </div>

        {/* SavedFiltersManager — toggled by "Manage views" */}
        {manageFiltersOpen && (
          <SavedFiltersManager
            savedFilters={savedFilters ?? []}
            currentUserId={me.data?.id}
            canManageGlobal={me.data?.role === 'manager' || me.data?.role === 'owner'}
            onFiltersChanged={() => {
              void trpcUtils.filters.listSavedFilters.invalidate();
            }}
          />
        )}

        {/* Advanced filter builder */}
        {advancedOpen && (
          <AdvancedFilterBuilder
            filter={advancedFilter ?? { logic: 'AND', conditions: [] }}
            onChange={setAdvancedFilter}
            targetView="inventory"
            onSaveAsView={() => setShowSavePopover(true)}
            resultCount={filtered.length}
          />
        )}

        {/* Compare list */}
        {compared.length ? (
          <div className="finder-chip-row" aria-label="Compared inventory">
            <span className="text-xs font-semibold uppercase text-zinc-600">Compare</span>
            {compared.map((row) => (
              <span key={row.id} className="finder-chip success">
                {row.batchCode} / ${moneyish(row.unitPrice)} / {moneyish(row.availableQty)}{' '}
                {row.uom}
              </span>
            ))}
            <button
              type="button"
              className="text-button compact-action"
              disabled={!compared.some((row) => customerShareReady(row.mediaStatus))}
              onClick={() => copyFinderOffer(compared)}
            >
              Copy offer
            </button>
          </div>
        ) : null}

        {/* Results table — kept exactly from original */}
        <div className="finder-table-wrap">
          <table className="finder-table">
            <caption className="sr-only">Filtered inventory batches</caption>
            <thead>
              <tr>
                <th>Qty</th>
                <th>Compare</th>
                <th>Batch</th>
                <th>Lot / date</th>
                <th>Product</th>
                <th>Source</th>
                <th>Avail</th>
                <th>Ticket / Price</th>
                <th>Marker</th>
                <th>Media</th>
                <th>Why shown</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((row) => {
                  const added = addedBatchIds.has(row.id);
                  const available = Number(row.availableQty ?? 0);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="finder-add-cell">
                          <input
                            aria-label={`Quantity for ${row.name ?? row.batchCode}`}
                            value={quantities[row.id] ?? '1'}
                            inputMode="decimal"
                            disabled={!selectedOrderId || added || available <= 0}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [row.id]: event.target.value.replace(/[^\d.]/g, ''),
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void add(row);
                            }}
                          />
                          <button
                            className="secondary-button compact-action finder-add-button"
                            type="button"
                            disabled={!selectedOrderId || added || available <= 0}
                            onClick={() => void add(row)}
                            title={selectedOrderId ? 'Add to selected order' : 'Select an order first'}
                          >
                            <PackagePlus className="h-4 w-4" aria-hidden="true" />
                            Add
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          aria-label={`Add ${row.batchCode} to compare list`}
                          type="checkbox"
                          checked={compareIds.has(row.id)}
                          onChange={() => toggleCompare(row.id)}
                        />
                      </td>
                      <td className="font-medium">
                        <div>{row.batchCode}</div>
                        {added ? <span className="finder-chip success">Already in order</span> : null}
                      </td>
                      <td>
                        <div>{row.sourceCode ?? '-'}</div>
                        <div className="text-[11px] text-zinc-500">{dateish(row.intakeDate)}</div>
                      </td>
                      <td>
                        {row.itemAlias ? (
                          <div>
                            <span style={{ color: '#eab308', marginRight: 4 }} title="Customer-facing alias">
                              ●
                            </span>
                            {row.itemAlias}{' '}
                            <span className="text-[11px] text-zinc-500">— {row.name}</span>
                          </div>
                        ) : (
                          <div>{row.name}</div>
                        )}
                        <div className="text-[11px] text-zinc-500">
                          {row.category} / {Array.isArray(row.tags) ? row.tags.join(', ') : ''}
                        </div>
                      </td>
                      <td>
                        <div>{row.vendor ?? '-'}</div>
                        <div className="text-[11px] text-zinc-500">
                          {row.location ?? '-'} / lot {row.lotCode ?? '-'}
                        </div>
                      </td>
                      <td>
                        {Number(row.draftReservedQty ?? 0) > 0 ? (
                          <span
                            title={`${moneyish(Number(row.availableQty ?? 0) - Number(row.draftReservedQty ?? 0))} avail (${moneyish(row.draftReservedQty)} ${row.uom ?? ''} in draft)`}
                          >
                            {moneyish(Number(row.availableQty ?? 0) - Number(row.draftReservedQty ?? 0))} {row.uom ?? ''}{' '}
                            <span className="finder-chip warning">in draft</span>
                          </span>
                        ) : (
                          <>{moneyish(row.availableQty)} {row.uom ?? ''}</>
                        )}
                      </td>
                      <td>
                        <div>${moneyish(row.ticketCost ?? row.unitCost)}</div>
                        <div className="text-[11px] text-zinc-500">
                          ${moneyish(row.unitPrice)} / {row.priceRange ?? '-'}
                        </div>
                      </td>
                      <td>{row.legacyMarker || row.ownershipStatus || '-'}</td>
                      <td>{mediaLabel(row.mediaStatus)}</td>
                      <td className="finder-match">
                        {matchReasons(row, search, {
                          agingOnly: false,
                          category: '',
                          location: '',
                          maxPrice: '',
                          minQty: '',
                          ownership: '',
                          tag: '',
                        }).join('; ')}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-sm text-zinc-600">
                    <div>No inventory matches these filters.</div>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      {[
                        search && ['Clear search', () => setSearch('')],
                        (advancedFilter?.conditions?.length ?? 0) > 0 && [
                          'Clear filters',
                          () => setAdvancedFilter(null),
                        ],
                      ]
                        .filter(Boolean)
                        .map((entry) => {
                          const [label, handler] = entry as [string, () => void];
                          return (
                            <button
                              key={label}
                              className="text-button compact-action"
                              type="button"
                              onClick={handler}
                            >
                              {label}
                            </button>
                          );
                        })}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <div className="mt-2 border border-dashed border-line bg-panel p-3 text-sm text-zinc-700">
            No matching inventory. Try clearing vendor, removing the price cap, or opening more
            filters.
          </div>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * TER-1618 / F-27: UOM-aware default quantity for an inventory row.
 * Exported for unit testing.
 * Priority 1 — casePack: use the item's wholesale case-pack qty when present.
 * Priority 2 — last-ordered qty (NOT YET IMPLEMENTED).
 * Priority 3 — fallback: '1'
 */
export function defaultQtyFor(row: InventoryFinderBatch): string {
  if (row.casePack != null && Number(row.casePack) > 0) {
    return String(Number(row.casePack));
  }
  return '1';
}

/**
 * TER-1618 / F-27: Returns the "last: N" hint value when the default qty
 * comes from customer order history (Priority 2). Currently always returns null.
 */
export function qtyHintFor(_row: InventoryFinderBatch): string | null {
  return null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function moneyish(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '0';
}

function buildFinderHaystack(row: InventoryFinderBatch, tags: string[]) {
  return [
    row.batchCode,
    row.sourceCode,
    row.shorthand,
    row.name,
    row.category,
    row.vendor,
    row.location,
    row.lotCode,
    row.priceRange,
    row.legacyMarker,
    row.ownershipStatus,
    row.notes,
    row.ticketCost,
    row.unitCost,
    row.unitPrice,
    tags.join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

function parseFinderSearch(value: string) {
  let normalized = value.toLowerCase();
  const maxMatch = normalized.match(
    /(?:under|below|less than|<=)\s*\$?\s*(\d+(?:\.\d+)?)/,
  );
  const maxPrice = maxMatch ? Number(maxMatch[1]) : null;
  if (maxMatch) normalized = normalized.replace(maxMatch[0], ' ');
  const stopWords = new Set([
    'show', 'find', 'need', 'needs', 'want', 'wants', 'for', 'with', 'under', 'below',
    'less', 'than', 'at', 'least', 'qty', 'quantity',
  ]);
  const terms = normalized
    .replace(/[,$]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term && !stopWords.has(term));
  return { terms, maxPrice };
}

function matchReasons(
  row: InventoryFinderBatch,
  search: string,
  filters: {
    agingOnly: boolean;
    category: string;
    location: string;
    maxPrice: string;
    minQty: string;
    ownership: string;
    tag: string;
  },
) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const reasons: string[] = [];
  const fields: Array<[string, unknown]> = [
    ['code', row.batchCode],
    ['source', row.sourceCode],
    ['shorthand', row.shorthand],
    ['note', row.notes],
    ['marker', row.legacyMarker],
    ['tag', tags.join(' ')],
    ['vendor', row.vendor],
    ['price', row.priceRange],
  ];
  for (const term of terms) {
    const hit = fields.find(([, value]) => String(value ?? '').toLowerCase().includes(term));
    if (hit) reasons.push(`${hit[0]} match: ${term}`);
  }
  if (filters.agingOnly) reasons.push(`${row.ageDays ?? 0}d aging`);
  if (filters.ownership) reasons.push(`owner ${row.ownershipStatus}`);
  if (filters.category) reasons.push(`category ${row.category}`);
  if (filters.tag) reasons.push(`tag ${filters.tag}`);
  if (filters.minQty) reasons.push(`qty >= ${filters.minQty}`);
  if (filters.maxPrice) reasons.push(`price <= ${filters.maxPrice}`);
  if (row.mediaStatus !== 'done') reasons.push('catalog media not ready');
  return reasons.length ? [...new Set(reasons)] : ['available posted lot'];
}

function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function mediaLabel(value: unknown) {
  if (value === 'done') return 'Ready';
  if (value === 'in_progress') return 'In progress';
  if (value === 'open') return 'Queued';
  return 'No photo';
}

function customerShareReady(value: unknown) {
  return ['done', 'ready'].includes(String(value ?? '').toLowerCase());
}

function copyFinderOffer(rows: InventoryFinderBatch[]) {
  const shareReady = rows.filter((row) => customerShareReady(row.mediaStatus));
  const text = shareReady
    .map(
      (row) =>
        `${row.name} / ${moneyish(row.availableQty)} ${row.uom ?? ''} available / $${moneyish(row.unitPrice)}`,
    )
    .join('\n');
  void navigator.clipboard?.writeText(text);
}
