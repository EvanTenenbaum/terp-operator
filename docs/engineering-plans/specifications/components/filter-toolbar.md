# FilterToolbar — Component Specification

**Type:** Shared component
**Replaces:** AdvancedFilterBuilder (default UX), FilterPresetStrip
**Research reference:** `research-packets/mercury-filter-toolbar-behavior.md`

---

## Purpose
Horizontal filter bar with popover-based filter chips. Provides Date/Keyword/Amount quick filters + Data views dropdown + Advanced mode access.

---

## API Contract

```typescript
interface FilterToolbarProps {
  view: ViewKey;
  presets?: FilterPreset[];          // Quick filter presets (e.g., "Active", "Ordered")
  quickFilters?: QuickFilterType[];  // Which quick filters to show: 'date' | 'keyword' | 'amount'
  dataViews?: DataView[];            // Saved views dropdown
  groupByFields?: string[];          // Group-by options
  sortFields?: string[];             // Sort options
  exportFormats?: ExportFormat[];    // Export options: 'csv' | 'excel' | 'pdf'
  onExport?: (format: ExportFormat) => void;
  onAdvancedClick?: () => void;      // Opens AdvancedFilterBuilder
  hasComplexFilter?: boolean;        // True when advanced filters with AND/OR are active
}

interface FilterPreset {
  key: string;
  label: string;
  filter: string;                    // e.g., "status:draft,confirmed"
}

type QuickFilterType = 'date' | 'keyword' | 'amount';
type ExportFormat = 'csv' | 'excel' | 'pdf';
```

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [▾ Data views]  │  Date ▾  │  Keyword ▾  │  Amount ▾      │
│ (saved views)    (date range) (text search)  (min/max)     │
│                  │  Group ▾  │  Sort ▾  │ ⚙  │ ⬇ Export   │
│                  (group-by)   (sort-by)  settings (csv/xlsx)
│ [Active filter pills: ✕ status:draft ✕ amount:gte:100]     │
│ [⚙ Complex filter active]                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## States

- **Default:** All chips closed. Active filter pills shown (if any).
- **Chip open:** Popover appears below chip with input controls.
- **Complex filter active:** Amber pill `[⚙ Complex filter active]`. Click opens Advanced mode.
- **Loading:** Skeleton while view data loads.
- **Disabled:** Greyed out when no data.

---

## Filter Bridge

- `simpleToAdvanced(filters): FilterGroupInput` — serialize chips to AND group
- `advancedToSimple(filter): { simple, hasComplex }` — extract simple chips, detect complex
- Round-trip preserves all filter values

---

## File

`src/client/components/FilterToolbar.tsx`
`src/client/utils/filterBridge.ts`
