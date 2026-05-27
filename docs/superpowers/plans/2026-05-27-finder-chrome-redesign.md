# Inventory Finder Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace InventoryFinderPanel's stacked filter UI with a compact filter bar (pill-based active filters + two-step "Add filter" dropdown), a persistent presets strip with save/manage, and a redesigned AdvancedFilterBuilder panel that slides in below the strip.

**Architecture:** All filter logic unchanged — only visual chrome restructured. The 5 hardcoded `savedSlices` are replaced by DB-driven saved filters (seeded by migration). AdvancedFilterBuilder gets proper semantic CSS classes. No server changes except the one-time migration for default views.

**Tech Stack:** TypeScript, React, Tailwind + semantic CSS, tRPC (`trpc.filters.*`), Vitest/jsdom

**Spec:** `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md` §1

---

## File map

| File | Action | What changes |
|---|---|---|
| `src/client/styles.css` | Modify | Add ~14 filter chrome semantic classes |
| `migrations/0071_default_inventory_views.sql` | Create | Idempotent upsert of 5 default saved filter views |
| `src/client/components/InventoryFinderPanel.tsx` | Rewrite | Filter bar with pills, Add filter dropdown, presets strip, Advanced toggle |
| `src/client/components/AdvancedFilterBuilder.tsx` | Modify | Replace bare class names with new semantic CSS |
| `src/client/components/InventoryFinderPanel.filterManage.test.tsx` | Verify pass | Existing test — must not break |
| `docs/design-system/decisions-log.md` | Modify | Append entry |

---

## Task 1: Add filter chrome CSS classes to styles.css

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Append filter chrome classes**

Append to `src/client/styles.css`:

```css
/* ── Inventory Finder filter chrome ────────────────────── */

.filter-bar {
  @apply flex flex-wrap items-center gap-1.5 px-2.5 py-2 bg-field border-b border-line min-h-[44px];
}

.filter-pill {
  @apply inline-flex h-[26px] items-center gap-1 rounded-full border border-accent-mid bg-accent-light pl-2.5 pr-1 text-[11px] font-medium text-accent-dark;
}

.filter-pill-remove {
  @apply flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent-mid text-white text-[11px] leading-none cursor-pointer hover:bg-accent;
}

.add-filter-btn {
  @apply inline-flex h-[26px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-line bg-transparent px-2.5 text-[11px] font-medium text-zinc-500 cursor-pointer hover:border-accent hover:text-accent;
}

.add-filter-dropdown {
  @apply absolute z-50 w-60 rounded-md border border-line bg-white shadow-md overflow-hidden;
  top: calc(100% + 6px);
  left: 0;
}

.add-filter-dropdown-search {
  @apply flex items-center gap-1.5 border-b border-line px-2.5 py-2 text-xs text-zinc-500;
}

.add-filter-dropdown-group {
  @apply px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400;
}

.add-filter-dropdown-item {
  @apply flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-700 cursor-pointer hover:bg-accent-light hover:text-accent;
}

.add-filter-dropdown-item.active {
  @apply bg-accent-light text-accent;
}

.advanced-btn {
  @apply inline-flex h-[30px] items-center gap-1.5 rounded border border-accent-mid bg-accent-light px-2.5 text-xs font-semibold text-accent-dark cursor-pointer ml-auto;
}

.advanced-btn.open {
  @apply bg-accent text-white border-accent;
}

.presets-strip {
  @apply flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2.5 py-1.5;
}

.presets-label {
  @apply text-[10px] font-bold uppercase tracking-widest text-zinc-400 mr-1 flex-shrink-0;
}

.preset-save-chip {
  @apply inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line bg-transparent px-2.5 text-[11px] font-medium text-zinc-500 cursor-pointer hover:border-accent hover:text-accent;
}

.presets-manage-link {
  @apply ml-auto inline-flex items-center gap-1 text-[11px] text-zinc-500 cursor-pointer rounded px-1 hover:text-accent flex-shrink-0;
}

/* Advanced filter builder panel */
.builder-panel {
  @apply border-b-2 border-accent-mid bg-white;
}

.builder-panel-header {
  @apply flex items-center gap-2 border-b border-line bg-accent-light px-3 py-2;
}

.builder-panel-title {
  @apply flex items-center gap-1.5 text-xs font-bold text-accent-dark;
}

.builder-panel-body {
  @apply flex flex-col gap-1.5 p-3;
}

.builder-panel-footer {
  @apply flex items-center gap-2 border-t border-line bg-panel px-3 py-2;
}

.condition-row {
  @apply flex items-center gap-1.5 rounded border border-line bg-panel px-2 py-1.5 hover:border-accent-mid;
}

.condition-row .select,
.condition-row .input {
  @apply h-[26px] text-[11px];
}

.logic-badge {
  @apply inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-wide bg-accent text-white cursor-pointer select-none;
}

.logic-badge.or {
  @apply bg-violet-600;
}

.nested-group {
  @apply ml-4 border-l-2 border-accent-mid pl-2.5 flex flex-col gap-1.5 py-0.5;
}
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm build 2>&1 | grep -i "error\|postcss\|tailwind" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/styles.css
git commit -m "feat(finder): add filter chrome CSS semantic classes"
```

---

## Task 2: DB migration — default inventory views

**Files:**
- Create: `migrations/0071_default_inventory_views.sql`

- [ ] **Step 1: Create migration file**

```sql
-- migrations/0071_default_inventory_views.sql
-- Idempotent upsert of 5 default inventory saved filter views.
-- Uses a system user_id sentinel ('00000000-0000-0000-0000-000000000001')
-- for global filters so they appear for every workspace user.
-- Safe to run multiple times — ON CONFLICT DO NOTHING.

DO $$
DECLARE
  system_user_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO saved_filters (user_id, name, description, target_view, filter_definition, schema_version, is_global, created_by, updated_by)
  VALUES
    (system_user_id, 'Aging premium', 'Aged inventory priced under $100 with qty available', 'inventory',
      '{"logic":"AND","conditions":[{"field":"ageDays","operator":"greater_than","value":30},{"field":"availableQty","operator":"greater_than","value":0},{"field":"unitPrice","operator":"less_than","value":100}]}'::jsonb,
      1, true, system_user_id, system_user_id),
    (system_user_id, 'Consignment risk', 'Consignment-owned batches with qty available', 'inventory',
      '{"logic":"AND","conditions":[{"field":"ownershipStatus","operator":"equals","value":"C"},{"field":"availableQty","operator":"greater_than","value":0}]}'::jsonb,
      1, true, system_user_id, system_user_id),
    (system_user_id, 'Value buyers', 'Lower-priced inventory', 'inventory',
      '{"logic":"AND","conditions":[{"field":"unitPrice","operator":"less_than","value":30}]}'::jsonb,
      1, true, system_user_id, system_user_id),
    (system_user_id, 'Low stock', 'Batches with qty available', 'inventory',
      '{"logic":"AND","conditions":[{"field":"availableQty","operator":"greater_than","value":0},{"field":"availableQty","operator":"less_than","value":5}]}'::jsonb,
      1, true, system_user_id, system_user_id),
    (system_user_id, 'Office owned', 'Office-owned batches', 'inventory',
      '{"logic":"AND","conditions":[{"field":"ownershipStatus","operator":"equals","value":"OFC"}]}'::jsonb,
      1, true, system_user_id, system_user_id)
  ON CONFLICT (user_id, name, target_view) DO NOTHING;
END $$;
```

- [ ] **Step 2: Run migration**

```bash
pnpm db:migrate 2>&1 | tail -10
```

Expected: `0071_default_inventory_views.sql` runs without errors.

- [ ] **Step 3: Verify rows inserted**

```bash
pnpm db:query "SELECT name, is_global FROM saved_filters WHERE target_view = 'inventory' AND is_global = true ORDER BY name" 2>&1
```

Expected: 5 rows — Aging premium, Consignment risk, Low stock, Office owned, Value buyers.

- [ ] **Step 4: Commit**

```bash
git add migrations/0071_default_inventory_views.sql
git commit -m "feat(finder): migration 0071 — default inventory saved filter views"
```

---

## Task 3: Rewrite InventoryFinderPanel

**Files:**
- Rewrite: `src/client/components/InventoryFinderPanel.tsx`

The component keeps all existing filter logic. Only the JSX structure changes: stacked controls → filter bar with pills + Add filter dropdown + presets strip + AdvancedFilterBuilder toggle.

- [ ] **Step 1: Verify existing filter tests still pass before touching the file**

```bash
pnpm vitest run src/client/components/InventoryFinderPanel.filterManage.test.tsx 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 2: Replace the JSX return in InventoryFinderPanel.tsx**

Keep all existing state, hooks, and filter logic (lines 1–290 approximately — everything before `return (`). Replace only the JSX return value with:

```tsx
  return (
    <WorkspacePanel title="Inventory finder" headingLevel={2}>
      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <label className="finder-search flex-none" style={{ minWidth: 200, maxWidth: 280, flex: '1 1 200px' }}>
          <Search className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, notes, lot, vendor, tag…"
          />
        </label>

        {/* Active filter pills */}
        {activeFilterLabels.map((label) => (
          <span key={String(label)} className="filter-pill">
            {String(label)}
            <button
              type="button"
              className="filter-pill-remove"
              onClick={() => removeFilterByLabel(String(label))}
              aria-label={`Remove filter: ${String(label)}`}
            >×</button>
          </span>
        ))}

        {/* Add filter dropdown */}
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
                    <Search className="h-3 w-3 opacity-50" />
                    <input
                      autoFocus
                      value={addFilterSearch}
                      onChange={(e) => setAddFilterSearch(e.target.value)}
                      placeholder="Search fields…"
                      className="flex-1 outline-none bg-transparent text-xs"
                    />
                  </div>
                  {FILTER_FIELD_GROUPS.filter(({ fields }) =>
                    fields.some((f) => f.label.toLowerCase().includes(addFilterSearch.toLowerCase()))
                  ).map(({ group, fields }) => (
                    <div key={group}>
                      <div className="add-filter-dropdown-group">{group}</div>
                      {fields
                        .filter((f) => f.label.toLowerCase().includes(addFilterSearch.toLowerCase()))
                        .map((f) => (
                          <div
                            key={f.field}
                            className="add-filter-dropdown-item"
                            role="option"
                            tabIndex={0}
                            onClick={() => { setAddFilterField(f.field); setAddFilterStep('value'); setAddFilterSearch(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setAddFilterField(f.field); setAddFilterStep('value'); } }}
                          >
                            {f.label}
                          </div>
                        ))}
                    </div>
                  ))}
                </>
              ) : (
                /* Value entry step */
                <>
                  <div className="add-filter-dropdown-search">
                    <button
                      type="button"
                      className="text-button compact-action"
                      onClick={() => setAddFilterStep('field')}
                      aria-label="Back to field selection"
                    >←</button>
                    <span className="font-semibold text-ink">{FILTER_FIELD_GROUPS.flatMap((g) => g.fields).find((f) => f.field === addFilterField)?.label}</span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <select
                      className="select compact"
                      value={addFilterOperator}
                      onChange={(e) => setAddFilterOperator(e.target.value)}
                      aria-label="Operator"
                    >
                      {getOperatorsForField(addFilterField).map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {renderAddFilterValueInput()}
                  </div>
                  <div className="flex gap-1.5 border-t border-line p-2">
                    <button type="button" className="primary-button compact-action flex-1" onClick={commitAddFilter}>Add filter</button>
                    <button type="button" className="secondary-button compact-action" onClick={() => setAddFilterOpen(false)}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {hasActiveFilter(search, category, vendorId, tag, location, ownership, minQty, maxPrice, agingOnly) || advancedFilter?.conditions.length ? (
          <button type="button" className="text-button compact-action" onClick={resetFilters}>
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
          <span className="text-[10px]" aria-hidden="true">{advancedOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      {/* ── Presets strip ── */}
      <div className="presets-strip" aria-label="Saved inventory views">
        <span className="presets-label">Views</span>
        {(savedFilters ?? []).map((sf) => (
          <button
            key={sf.id}
            type="button"
            className={selectedSavedFilter === sf.id ? 'finder-chip success' : 'finder-chip'}
            aria-pressed={selectedSavedFilter === sf.id}
            onClick={() => applySavedFilter(sf)}
          >
            {sf.name}
          </button>
        ))}
        {advancedFilter && advancedFilter.conditions.length > 0 ? (
          <button type="button" className="preset-save-chip" onClick={() => setShowSavePopover(true)}>
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
              onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentFilter(); if (e.key === 'Escape') setShowSavePopover(false); }}
            />
            <button type="button" className="primary-button compact-action" onClick={() => void saveCurrentFilter()} disabled={!saveViewName.trim()}>Save</button>
            <button type="button" className="secondary-button compact-action" onClick={() => setShowSavePopover(false)}>Cancel</button>
          </div>
        )}
        <button type="button" className="presets-manage-link" onClick={() => setManageFiltersOpen((o) => !o)} aria-expanded={manageFiltersOpen}>
          <Settings className="h-3 w-3" aria-hidden="true" />
          Manage views
        </button>
      </div>

      {manageFiltersOpen && (
        <SavedFiltersManager
          savedFilters={savedFilters ?? []}
          currentUserId={me.data?.id}
          canManageGlobal={me.data?.role === 'manager' || me.data?.role === 'owner'}
          onFiltersChanged={() => { void trpcUtils.filters.listSavedFilters.invalidate(); }}
        />
      )}

      {/* ── Advanced builder ── */}
      {advancedOpen && (
        <AdvancedFilterBuilder
          filter={advancedFilter ?? { logic: 'AND', conditions: [] }}
          onChange={setAdvancedFilter}
          targetView="inventory"
          onSaveAsView={() => setShowSavePopover(true)}
          resultCount={filtered.length}
        />
      )}

      {/* ── Compare list ── */}
      {compared.length ? (
        <div className="finder-chip-row" aria-label="Compared inventory">
          <span className="text-xs font-semibold uppercase text-zinc-600">Compare</span>
          {compared.map((row) => (
            <span key={row.id} className="finder-chip success">
              {row.batchCode} / ${moneyish(row.unitPrice)} / {moneyish(row.availableQty)} {row.uom}
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

      {/* ── Results table (existing) ── */}
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
            {filtered.slice(0, 80).map((row) => (
              <tr key={row.id}>
                <td className="finder-add-cell">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={quantities[row.id] ?? '1'}
                    onChange={(e) => setQuantities((q) => ({ ...q, [row.id]: e.target.value }))}
                    className="finder-add-cell input"
                    aria-label={`Quantity for ${row.name ?? row.batchCode}`}
                  />
                  <button
                    type="button"
                    className="finder-add-button secondary-button compact-action"
                    disabled={!selectedOrderId}
                    onClick={() => void add(row)}
                    aria-label={`Add ${row.name ?? row.batchCode}`}
                  >+</button>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={compareIds.has(row.id)}
                    onChange={() => toggleCompare(row.id)}
                    aria-label={`Compare ${row.name ?? row.batchCode}`}
                  />
                </td>
                <td><span className="font-mono text-[11px]">{row.batchCode}</span></td>
                <td><span className="finder-match">{row.lotCode ?? '—'} {row.ageDays != null ? `· ${row.ageDays}d` : ''}</span></td>
                <td><span className="finder-match">{row.displayName ?? row.name}</span></td>
                <td><span className="finder-match text-zinc-500">{row.shorthand ?? row.sourceCode ?? '—'}</span></td>
                <td>{moneyish(row.availableQty)} {row.uom ?? ''}</td>
                <td>
                  <div className="text-xs">${moneyish(row.unitPrice)}</div>
                  {row.priceRange ? <div className="text-[11px] text-zinc-500">{row.priceRange}</div> : null}
                </td>
                <td><span className="finder-match text-zinc-500">{row.legacyMarker ?? row.ownershipStatus ?? '—'}</span></td>
                <td>
                  {row.mediaStatus === 'ready' ? <span className="selection-pill success" style={{ fontSize: 10 }}>ready</span> : row.mediaStatus ? <span className="selection-pill" style={{ fontSize: 10 }}>{row.mediaStatus}</span> : null}
                </td>
                <td><span className="finder-match text-zinc-400">{(row as Record<string, unknown>).__whyShown as string ?? ''}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-zinc-400 py-6 text-sm">No inventory matches filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
```

- [ ] **Step 3: Add new state variables and helpers at the top of the component function**

Alongside the existing state declarations, add:

```ts
  // Add filter dropdown state
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [addFilterStep, setAddFilterStep] = useState<'field' | 'value'>('field');
  const [addFilterField, setAddFilterField] = useState<FilterFieldName>('category');
  const [addFilterOperator, setAddFilterOperator] = useState('equals');
  const [addFilterValue, setAddFilterValue] = useState<string | number>('');
  const [addFilterSearch, setAddFilterSearch] = useState('');
  const addFilterRef = useRef<HTMLDivElement>(null);

  // Presets save popover state
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');

  // Click-outside for add filter dropdown
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
```

- [ ] **Step 4: Add `FILTER_FIELD_GROUPS` constant and helpers above the component**

```ts
const FILTER_FIELD_GROUPS = [
  {
    group: 'Product',
    fields: [
      { field: 'category' as FilterFieldName, label: 'Category' },
      { field: 'subcategory' as FilterFieldName, label: 'Subcategory' },
      { field: 'vendorId' as FilterFieldName, label: 'Vendor' },
      { field: 'tags' as FilterFieldName, label: 'Tags' },
      { field: 'location' as FilterFieldName, label: 'Location' },
      { field: 'ownershipStatus' as FilterFieldName, label: 'Ownership' }
    ]
  },
  {
    group: 'Quantity & Price',
    fields: [
      { field: 'availableQty' as FilterFieldName, label: 'Available qty' },
      { field: 'unitPrice' as FilterFieldName, label: 'Unit price' },
      { field: 'unitCost' as FilterFieldName, label: 'Unit cost' }
    ]
  },
  {
    group: 'Date & Age',
    fields: [
      { field: 'intakeDate' as FilterFieldName, label: 'Intake date' },
      { field: 'ageDays' as FilterFieldName, label: 'Age (days)' }
    ]
  },
  {
    group: 'Status',
    fields: [
      { field: 'mediaStatus' as FilterFieldName, label: 'Media status' }
    ]
  }
];

function getOperatorsForField(field: FilterFieldName): { value: string; label: string }[] {
  const type = FILTER_FIELDS[field]?.type;
  if (type === 'number') return [
    { value: 'equals', label: 'equals' }, { value: 'not_equals', label: 'not equals' },
    { value: 'greater_than', label: 'greater than' }, { value: 'less_than', label: 'less than' },
    { value: 'greater_than_or_equal', label: 'at least' }, { value: 'less_than_or_equal', label: 'at most' },
    { value: 'between', label: 'between' }, { value: 'is_null', label: 'is empty' }, { value: 'is_not_null', label: 'is not empty' }
  ];
  if (type === 'date') return [
    { value: 'equals', label: 'on' }, { value: 'before', label: 'before' },
    { value: 'after', label: 'after' }, { value: 'is_null', label: 'is empty' }
  ];
  if (type === 'array') return [
    { value: 'array_contains', label: 'contains' }, { value: 'array_not_contains', label: 'does not contain' },
    { value: 'is_null', label: 'is empty' }
  ];
  return [
    { value: 'equals', label: 'equals' }, { value: 'not_equals', label: 'not equals' },
    { value: 'text_contains', label: 'contains' }, { value: 'is_null', label: 'is empty' }
  ];
}
```

- [ ] **Step 5: Add `renderAddFilterValueInput` and `commitAddFilter` helpers inside the component**

```ts
  function renderAddFilterValueInput() {
    if (addFilterOperator === 'is_null' || addFilterOperator === 'is_not_null') return null;
    const type = FILTER_FIELDS[addFilterField]?.type;
    if (addFilterField === 'category') {
      return <select className="select compact" value={String(addFilterValue)} onChange={(e) => setAddFilterValue(e.target.value)} aria-label="Category value"><option value="">Select…</option>{facets.categories.map((c) => <option key={c}>{c}</option>)}</select>;
    }
    if (addFilterField === 'vendorId') {
      return <select className="select compact" value={String(addFilterValue)} onChange={(e) => setAddFilterValue(e.target.value)} aria-label="Vendor value"><option value="">Select…</option>{facets.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>;
    }
    if (type === 'number') return <input type="number" className="input compact" value={String(addFilterValue)} onChange={(e) => setAddFilterValue(e.target.value)} placeholder="Value" aria-label="Filter value" />;
    if (type === 'date') return <input type="date" className="input compact" value={String(addFilterValue)} onChange={(e) => setAddFilterValue(e.target.value)} aria-label="Date value" />;
    return <input type="text" className="input compact" value={String(addFilterValue)} onChange={(e) => setAddFilterValue(e.target.value)} placeholder="Value" aria-label="Filter value" />;
  }

  function commitAddFilter() {
    if (!addFilterValue && addFilterOperator !== 'is_null' && addFilterOperator !== 'is_not_null') return;
    const newCondition = { field: addFilterField, operator: addFilterOperator as any, value: addFilterValue };
    const current = advancedFilter ?? { logic: 'AND' as const, conditions: [] };
    setAdvancedFilter({ ...current, conditions: [...current.conditions, newCondition] });
    setAddFilterOpen(false);
    setAddFilterStep('field');
    setAddFilterValue('');
  }
```

- [ ] **Step 6: Add `removeFilterByLabel` helper inside the component**

```ts
  function removeFilterByLabel(label: string) {
    if (!advancedFilter) return;
    const updated = {
      ...advancedFilter,
      conditions: advancedFilter.conditions.filter((c) => {
        if (!('field' in c)) return true;
        return String(c.field) + (c.value !== undefined ? `: ${String(c.value)}` : '') !== label;
      })
    };
    setAdvancedFilter(updated);
  }
```

- [ ] **Step 7: Update `saveCurrentFilter` to use the popover name**

Replace the existing `saveCurrentFilter` function:

```ts
  async function saveCurrentFilter() {
    if (!advancedFilter || !saveViewName.trim()) return;
    await saveFilterMutation.mutateAsync({
      name: saveViewName.trim(),
      targetView: 'inventory',
      filterDefinition: advancedFilter,
      isGlobal: false
    });
    setSaveViewName('');
    setShowSavePopover(false);
  }
```

- [ ] **Step 8: Add missing imports**

Ensure the component imports include:
```ts
import { Plus, Settings } from 'lucide-react';
import { FILTER_FIELDS } from '../../shared/filterSchemas';
import { useRef } from 'react';
```

- [ ] **Step 9: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "InventoryFinderPanel\|error TS" | head -20
```

- [ ] **Step 10: Run existing filter tests**

```bash
pnpm vitest run src/client/components/InventoryFinderPanel.filterManage.test.tsx 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/client/components/InventoryFinderPanel.tsx
git commit -m "feat(finder): restructure filter chrome — pill bar, Add filter dropdown, presets strip"
```

---

## Task 4: Restyle AdvancedFilterBuilder

**Files:**
- Modify: `src/client/components/AdvancedFilterBuilder.tsx`

The logic is unchanged. Replace bare class names with new semantic classes, and expose `onSaveAsView` and `resultCount` props.

- [ ] **Step 1: Update AdvancedFilterBuilder props interface**

```ts
interface AdvancedFilterBuilderProps {
  filter: FilterGroupInput;
  onChange: (filter: FilterGroupInput) => void;
  targetView?: string;
  onSaveAsView?: () => void;   // new
  resultCount?: number;        // new
}
```

- [ ] **Step 2: Replace the JSX return in AdvancedFilterBuilder**

```tsx
  return (
    <div className="builder-panel" data-testid="advanced-filter-builder">
      <div className="builder-panel-header">
        <div className="builder-panel-title">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Advanced filters — match
          <button
            type="button"
            className={`logic-badge${filter.logic === 'OR' ? ' or' : ''}`}
            onClick={() => onChange({ ...filter, logic: filter.logic === 'AND' ? 'OR' : 'AND' })}
            data-testid="filter-logic-toggle"
            aria-label={`Toggle logic operator (currently ${filter.logic})`}
          >
            {filter.logic}
          </button>
          of all conditions
        </div>
        <button
          type="button"
          className="secondary-button compact-action ml-auto"
          onClick={() => onChange({ logic: 'AND', conditions: [] })}
        >
          ✕ Close builder
        </button>
      </div>

      <div className="builder-panel-body">
        <FilterGroupComponent
          group={filter}
          groupPath={[]}
          facets={facets}
          onAddCondition={addCondition}
          onAddGroup={addGroup}
          onRemoveCondition={removeCondition}
          onUpdateCondition={updateCondition}
          onToggleLogic={toggleLogic}
          depth={0}
        />
      </div>

      <div className="builder-panel-footer">
        <button type="button" className="primary-button compact-action" onClick={() => {/* filter already live */}}>
          Apply
          {resultCount != null ? (
            <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{resultCount}</span>
          ) : null}
        </button>
        {onSaveAsView ? (
          <button type="button" className="secondary-button compact-action" onClick={onSaveAsView}>
            Save as view…
          </button>
        ) : null}
        <button
          type="button"
          className="text-button compact-action ml-auto"
          onClick={() => onChange({ logic: 'AND', conditions: [] })}
        >
          Clear all
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 3: Restyle `FilterGroupComponent` JSX**

Replace the returned JSX in `FilterGroupComponent`:

```tsx
  return (
    <div className={depth > 0 ? 'nested-group' : ''} data-testid={`filter-group-depth-${depth}`}>
      {depth > 0 && (
        <div className="flex items-center gap-1.5 pb-1 text-xs text-zinc-500">
          Match
          <button
            type="button"
            className={`logic-badge${group.logic === 'OR' ? ' or' : ''}`}
            onClick={() => onToggleLogic(groupPath)}
            data-testid="filter-logic-toggle"
            aria-label={`Toggle logic operator (currently ${group.logic})`}
          >
            {group.logic}
          </button>
          of:
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {group.conditions.map((condition, index) => {
          if ('field' in condition) {
            return (
              <FilterConditionComponent
                key={index}
                condition={condition}
                conditionIndex={index}
                groupPath={groupPath}
                facets={facets}
                onUpdate={(updates) => onUpdateCondition(groupPath, index, updates)}
                onRemove={() => onRemoveCondition(groupPath, index)}
              />
            );
          } else {
            return (
              <FilterGroupComponent
                key={index}
                group={condition}
                groupPath={[...groupPath, index]}
                facets={facets}
                onAddCondition={onAddCondition}
                onAddGroup={onAddGroup}
                onRemoveCondition={onRemoveCondition}
                onUpdateCondition={onUpdateCondition}
                onToggleLogic={onToggleLogic}
                depth={depth + 1}
              />
            );
          }
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <button type="button" className="add-filter-btn" onClick={() => onAddCondition(groupPath)} data-testid="filter-add-condition" aria-label="Add filter condition">
          + Add condition
        </button>
        {canNest && (
          <button type="button" className="add-filter-btn" onClick={() => onAddGroup(groupPath)} data-testid="filter-add-group" aria-label="Add filter group">
            + Add group
          </button>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 4: Restyle `FilterConditionComponent` JSX**

Replace the returned JSX in `FilterConditionComponent`:

```tsx
  return (
    <div className="condition-row" data-testid="filter-condition">
      <select
        className="select compact"
        style={{ minWidth: 110 }}
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value as FilterFieldName, operator: 'equals', value: '' })}
        data-testid="filter-field-select"
        aria-label="Filter field"
      >
        {Object.keys(FILTER_FIELDS).map((field) => (
          <option key={field} value={field}>{field.replace(/([A-Z])/g, ' $1').trim()}</option>
        ))}
      </select>
      <select
        className="select compact"
        style={{ minWidth: 110 }}
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as any })}
        data-testid="filter-operator-select"
        aria-label="Filter operator"
      >
        {getOperators().map((op) => (
          <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
        ))}
      </select>
      {renderValueInput()}
      <button
        type="button"
        className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded border border-line bg-white text-zinc-400 text-sm hover:border-danger hover:text-danger hover:bg-red-50"
        onClick={onRemove}
        data-testid="filter-remove-condition"
        aria-label="Remove this filter condition"
      >×</button>
    </div>
  );
```

- [ ] **Step 5: Add Filter icon import**

```ts
import { Filter } from 'lucide-react';
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "AdvancedFilterBuilder\|error TS" | head -10
```

- [ ] **Step 7: Commit**

```bash
git add src/client/components/AdvancedFilterBuilder.tsx
git commit -m "feat(finder): restyle AdvancedFilterBuilder with semantic CSS classes"
```

---

## Task 5: Append decisions-log entry

**Files:**
- Modify: `docs/design-system/decisions-log.md`

- [ ] **Step 1: Prepend entry**

Add at the top (after the `> **Append-only.**` line):

```markdown
## 2026-05-27 — Finder chrome redesign: pill filter bar, Add filter dropdown, presets strip, builder restyle

**Decision 1:** `InventoryFinderPanel` filter chrome restructured from stacked controls to: filter bar (search + active filter pills + "Add filter" two-step dropdown + Advanced toggle) → presets strip (DB-driven saved views + save/manage) → `AdvancedFilterBuilder` slide-down panel. All filter evaluation logic (`evaluateFilterGroup`, `filterEvaluator.ts`, `filterSchemas.ts`) is unchanged.

**Decision 2:** Active filters shown as removable pills in the filter bar. The "Add filter" button opens a two-step dropdown: pick a field (grouped: Product, Qty & Price, Date & Age, Status) → enter value (operator select + field-specific input). "Save current" in presets strip names and persists the current advanced filter to `saved_filters` via `trpc.filters.saveFilter`.

**Decision 3:** Hardcoded `savedSlices` array removed from `InventoryFinderPanel`. The 5 default views (Aging premium, Consignment risk, Value buyers, Low stock, Office owned) are seeded by migration 0071 as global `saved_filters` rows, so they persist across deploys and are user-editable.

**Decision 4:** `AdvancedFilterBuilder` restyled with new semantic classes: `.builder-panel`, `.builder-panel-header`, `.builder-panel-body`, `.builder-panel-footer`, `.condition-row`, `.logic-badge`, `.nested-group`. Logic is unchanged. Two new props: `onSaveAsView` (callback) and `resultCount` (display in Apply button).

**Files:** `src/client/components/InventoryFinderPanel.tsx`, `src/client/components/AdvancedFilterBuilder.tsx`, `src/client/styles.css`, `migrations/0071_default_inventory_views.sql`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/decisions-log.md
git commit -m "docs: decisions-log entry for finder chrome redesign"
```

---

## Final verification

- [ ] **Run all finder-related tests**

```bash
pnpm vitest run src/client/components/InventoryFinderPanel.filterManage.test.tsx src/client/components/SavedFiltersDropdown.a11y.test.tsx src/client/components/SavedFiltersManager.test.tsx 2>&1 | tail -20
```

Expected: all suites pass.

- [ ] **Typecheck clean**

```bash
pnpm typecheck 2>&1 | grep -c "error TS" || echo "0"
```

Expected: same baseline count (no new errors).
