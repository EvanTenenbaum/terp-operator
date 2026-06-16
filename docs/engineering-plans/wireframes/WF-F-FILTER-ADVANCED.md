## Wireframe: WF-F-FILTER-ADVANCED — Advanced Filter Flow

### Flow Overview
Operator builds complex filters beyond simple chips. Flow: active chip pills in toolbar → click "Advanced" → AdvancedFilterBuilder opens (replaces chips) → pre-populated AND group → add OR group + fields → Apply → toolbar shows amber badge + chip pills → grid refreshes.

### Step 1: Filter Toolbar with Active Chips
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders          [🔍 Search...]          [+ New PO]  │
│──────────────────────────────────────────────────────────────│
│  Filters:                                                     │
│  [✕ status:draft] [✕ date:this-week]        [+ Add Filter]   │ ← chip pills
│  [Advanced ▸]                                                │
├──────────────────────────────────────────────────────────────┤
│  #     │ Vendor       │ Status   │ Date       │ Total        │
├────────┼──────────────┼──────────┼────────────┼──────────────┤
│  1040  │ GreenLeaf Co │ Draft    │ 2026-06-12 │ $8,920.00    │
│  1042  │ Harvest Inc  │ Draft    │ 2026-06-15 │ $5,600.00    │
│  1046  │ Sunny Farms  │ Draft    │ 2026-06-14 │ $3,200.00    │
└──────────────────────────────────────────────────────────────┘
  Showing 3 of 47 POs  (filtered)
```
#### Before State
- Grid showing filtered results. Two active filter chips visible: `status:draft` and `date:this-week`.
#### User Action
- Click `[Advanced ▸]` button in filter row.
#### After State
- AdvancedFilterBuilder animates open, replacing the chip row. Smooth height transition.
#### Interactive Elements, ARIA, Edge Cases
- Chips: `role="button"`, `aria-label="Remove filter: status is draft"`. `[✕]` removes individual chip.
- `[Advanced ▸]`: `aria-expanded="false"` becomes `true` when builder opens.
- Edge case: No active chips → Advanced starts with empty AND group.

### Step 2: AdvancedFilterBuilder Opens
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders          [🔍 Search...]          [+ New PO]  │
│──────────────────────────────────────────────────────────────│
│  Advanced Filter                                [Simple ▾]   │ ← toggle back
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ╔═ AND ═══════════════════════════════════════════╗ │   │ ← group
│  │  ║ ┌──────────────┬──────────┬───────────────────┐ ║ │   │
│  │  ║ │ status     ▾ │ equals ▾ │ Draft             │ ║ │   │ ← field row pre-populated
│  │  ║ └──────────────┴──────────┴───────────────────┘ ║ │   │
│  │  ║ ┌──────────────┬──────────┬───────────────────┐ ║ │   │
│  │  ║ │ date       ▾ │ is     ▾ │ This Week         │ ║ │   │
│  │  ║ └──────────────┴──────────┴───────────────────┘ ║ │   │
│  │  ╚══════════════════════════════════════════════════╝ │   │
│  │  [+ Add condition]                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Cancel]                              [Apply Filters]      │
├──────────────────────────────────────────────────────────────┤
│  ... grid results ...                                        │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Chip pills visible. Builder hidden.
#### User Action
- (Automatic — builder opens, pre-populated from active chips.)
#### After State
- Builder shows AND group with 2 field rows: `status equals Draft`, `date is This Week`. Each row has: field selector, operator selector, value input.
#### Interactive Elements, ARIA, Edge Cases
- Group wrapper: `role="group"`, `aria-label="AND group"`. Field rows: `role="listitem"`.
- Field selector: combobox with all filterable columns. Operator: context-sensitive (equals, contains, greater than, etc.).
- Keyboard: Tab between field/operator/value. Enter on `[+ Add condition]` adds row. Escape on builder closes, reverts to chips.

### Step 3: Add OR Group + Amount Filter
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Advanced Filter                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ╔═ AND ═══════════════════════════════════════════╗ │   │
│  │  ║ status equals Draft                              ║ │   │
│  │  ║ date is This Week                                ║ │   │
│  │  ╚══════════════════════════════════════════════════╝ │   │
│  │                                                        │   │
│  │  ╔═ OR ════════════════════════════════════════════╗ │   │ ← added OR group
│  │  ║ ┌──────────────┬──────────────┬──────────────┐  ║ │   │
│  │  ║ │ total      ▾ │ greater than▾│ $10,000      │  ║ │   │
│  │  ║ └──────────────┴──────────────┴──────────────┘  ║ │   │
│  │  ║ ┌──────────────┬──────────┬───────────────────┐ ║ │   │
│  │  ║ │ vendor     ▾ │ equals ▾ │ Sunny Farms       │ ║ │   │
│  │  ║ └──────────────┴──────────┴───────────────────┘ ║ │   │
│  │  ╚══════════════════════════════════════════════════╝ │   │
│  │                                                        │   │
│  │  [+ Add condition]  [+ Add OR group]                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Final logic: (status=draft AND date=this-week)              │
│              AND (total > $10,000 OR vendor=Sunny Farms)     │
│                                                              │
│  [Cancel]                              [Apply Filters]      │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Builder shows single AND group with 2 conditions.
#### User Action
- Click `[+ Add OR group]` → new group added. Add `total > 10000` condition. Add `vendor = Sunny Farms` condition.
#### After State
- Builder now shows AND group + OR group. "Final logic" summary displayed below builder for clarity.
#### Interactive Elements, ARIA, Edge Cases
- Group nesting: single level only (no sub-groups). `[+ Add OR group]` disabled when 3 groups exist (max).
- Remove group: `[✕]` on group header. Remove condition: `[✕]` on field row.
- Edge case: Empty group → auto-remove on Apply. Conflicting conditions → no validation; server returns results.

### Step 4: Apply Filters — Amber Badge + Chips
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders          [🔍 Search...]          [+ New PO]  │
│──────────────────────────────────────────────────────────────│
│  ⚙ Complex filter active                                     │ ← amber badge
│  [✕ status:draft] [✕ date:this-week]                        │ ← chip pills
│  [✕ total:>$10,000] [✕ vendor:Sunny Farms]                   │
│  [Advanced ▾]                                                │
├──────────────────────────────────────────────────────────────┤
│  #     │ Vendor       │ Status   │ Date       │ Total        │
├────────┼──────────────┼──────────┼────────────┼──────────────┤
│  1048  │ Sunny Farms  │ Draft    │ 2026-06-14 │ $12,400.00   │ ← result
└──────────────────────────────────────────────────────────────┘
  Showing 1 of 47 POs  (complex filter)
```
#### Before State
- Builder open with complex filter logic.
#### User Action
- Click `[Apply Filters]` or Ctrl+Enter.
#### After State
- Builder closes. Toolbar shows amber "⚙ Complex filter active" badge. All individual filter chips shown as pills. `[Advanced ▾]` now shows expanded state (can re-open builder to edit).
#### Interactive Elements, ARIA, Edge Cases
- Amber badge: `aria-label="Complex filter active"` with `role="status"`.
- Edge case: Complex filter + search text → both applied; search narrows complex filter results.

### Step 5: Grid Refreshes with Filtered Data
#### Layout (ASCII)
```
┌──────────────────────────────────────────────────────────────┐
│  Purchase Orders                                             │
│──────────────────────────────────────────────────────────────│
│  ⚙ Complex filter active  [✕ Clear all]                     │
│──────────────────────────────────────────────────────────────│
│  #     │ Vendor       │ Status   │ Date       │ Total        │
├────────┼──────────────┼──────────┼────────────┼──────────────┤
│  1048  │ Sunny Farms  │ Draft    │ 2026-06-14 │ $12,400.00   │
│──────────────────────────────────────────────────────────────│
│  Summary: 1 result  │  $12,400.00 total                      │
│                                                              │
│  [Save this filter as...]  [Bookmark ☆]                     │
└──────────────────────────────────────────────────────────────┘
```
#### Before State
- Grid showing 3 results (simple filter).
#### User Action
- (Automatic — grid data refreshes after Apply.)
#### After State
- Grid shows 1 result matching complex filter. Summary strip reflects filtered count/total. "Save this filter" and bookmark actions offered for reusable complex filters.
#### Interactive Elements, ARIA, Edge Cases
- Summary strip: `aria-live="polite"` announces "1 result".
- `[✕ Clear all]`: removes all filters, restores full grid. `[Save this filter as...]`: opens name dialog, saves to "Saved Filters" dropdown.
- Edge case: Zero results → empty state "No purchase orders match this filter. [Clear filters]".
- Edge case: Filter URL shareable → URL encodes filter parameters via query string.
