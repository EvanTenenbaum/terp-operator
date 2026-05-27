# Finder & Pricing UI Redesign

**Date:** 2026-05-27  
**Status:** Approved — ready for implementation planning  
**Scope:** `InventoryFinderPanel`, `AdvancedFilterBuilder`, `DefaultPricingPanel`, `CustomerPricingPanel`, inline sales order pricing in `SalesView`

---

## 1. Inventory Finder — Filter Chrome Restructure

### Current problems
- Everything stacked vertically in one column with the same visual weight
- `AdvancedFilterBuilder` uses class names (`filter-group`, `filter-condition`, `logic-toggle`, `btn-sm`) with no matching CSS in `styles.css` — effectively unstyled
- "More filters" expando hides secondary filters unpredictably
- Slice presets and saved filter controls are visually indistinct from the rest

### New structure

```
┌─────────────────────────────────────────────────────────┐
│ FILTER BAR                                              │
│ [🔍 Search…] [Category: Flower ×] [Age > 30d ×]        │
│ [+ Add filter] [Clear all]              [Advanced ▾]   │
├─────────────────────────────────────────────────────────┤
│ PRESETS STRIP                                           │
│ Views: [Aging premium] [Consignment risk] [Value buyers]│
│        [Low stock] [Office owned] [+ Save current]     │
│                                          ⚙ Manage views │
├─────────────────────────────────────────────────────────┤
│ ADVANCED BUILDER (slides in when Advanced is open)      │
│ Advanced filters — match [AND] of all conditions        │
│ [Category ▾] [equals ▾] [Flower ▾]               [×]  │
│ [Age (days) ▾] [greater than ▾] [30]             [×]  │
│   └ OR group: [Unit price ▾] [< ▾] [80]          [×]  │
│ [+ Add condition] [+ Add group]                         │
│ [Apply (14)] [Save as view…]              [Clear all]  │
├─────────────────────────────────────────────────────────┤
│ AG GRID (existing — untouched)                          │
└─────────────────────────────────────────────────────────┘
```

### Filter bar

- **Search input**: full-width flex-1 search, existing functionality
- **Active filter pills**: removable pills (`Category: Flower ×`, `Age > 30d ×`) rendered inline after search. Each pill maps to one active filter condition. Clicking × removes that condition.
- **+ Add filter button**: dashed-border pill button. Opens a two-step dropdown:
  - **Step 1 — field picker**: grouped list with inline search (groups: Product, Quantity & Price, Date & Age, Status). Fields: category, subcategory, vendor, tags, location, ownership, availableQty, unitPrice, unitCost, intakeDate, ageDays, mediaStatus.
  - **Step 2 — value entry**: back button + field name header + operator select + value input (select for enum fields, number for numeric, date for dates). "Add filter" button creates the pill. "Cancel" returns to step 1.
- **Clear all**: text button, only shown when any filter is active
- **Advanced button**: accent-tinted secondary button, toggles the builder. Shows `▴` when open, `▾` when closed.

### Presets strip

- Always visible row below the filter bar
- "Views" uppercase label at left
- Chips: existing 5 hardcoded slices + any user-saved named views
- Active preset shown with accent fill (`.finder-chip.success` pattern)
- **`+ Save current`**: dashed chip — saves the current filter bar state (search + pills + advanced filter if set) as a named view. Opens an inline name input in the strip or a small popover with a name field + Save/Cancel.
- **`Manage views`**: opens the existing `SavedFiltersManager` (already implemented). Link at trailing edge of strip.
- Saved views from `trpc.filters.listSavedFilters` replace the hardcoded saved slices concept. The 5 hardcoded slices (`savedSlices` array) are removed from the component and instead pre-seeded as saved filters via `db:seed` so they exist out of the box for all workspaces. They are then user-editable/deletable like any other saved view.

### Advanced filter builder panel

- Slides in between presets strip and AG Grid (pushes grid down, does not overlay)
- **Header**: accent-tinted bar with title, logic badge (`AND`/`OR`, clickable to toggle), and `✕ Close builder` button
- **Body**: one `condition-row` per condition — field select, operator select, value input, remove button. Nested groups shown indented with a left accent border and their own logic badge.
- **Condition row inputs**: use `.select` and `.input` semantic classes (not raw `border px-2`)
- **Footer**: `Apply (N results)` primary button, `Save as view…` secondary button (opens save-name popover, writes to presets strip), `Clear all` ghost button
- **Logic badge**: accent pill showing `AND` or `OR`, click toggles. Nested groups have their own badge.
- The builder is the existing `AdvancedFilterBuilder` component, restyled — logic is unchanged.

### CSS additions required

New semantic classes in `styles.css`:
- `.filter-bar` — filter bar container
- `.filter-pill` — active filter pill (builds on `.selection-pill` pattern, adds `×` button)
- `.filter-pill-remove` — the × inside a pill
- `.add-filter-btn` — dashed pill "+ Add filter"
- `.add-filter-dropdown` — the two-step field/value picker dropdown
- `.advanced-btn` — the Advanced toggle button (variant of `.secondary-button`)
- `.builder-panel` — slide-down builder container
- `.builder-panel-header` — accent-tinted header strip
- `.builder-panel-body` — conditions area
- `.builder-panel-footer` — apply/save/clear strip
- `.condition-row` — single filter condition row
- `.logic-badge` — AND/OR toggle pill
- `.nested-group` — indented nested group with left accent border

Existing classes reused: `.finder-chip`, `.finder-chip.success`, `.presets-strip` (new), `.control-band`, `.secondary-button`, `.primary-button`, `.compact-action`

---

## 2. Default Pricing Panel — Redesign

**File:** `src/client/components/DefaultPricingPanel.tsx`

### Current problems
- Raw `border border-line px-2 py-1 text-xs` inputs instead of `.input` / `.select` semantic classes
- Save is a `.text-button` — should be `.primary-button`
- No visual hierarchy between default rule and category overrides
- Category-only overrides — no subcategory level

### New design

```
┌─ Default pricing rule ──────────────── ⚠ Internal only ┐
│ Applied when a customer has no own rule.                │
│                                                         │
│ Default markup                                          │
│ Basis    [% markup ▾]                                   │
│ Amount   [0.30    ]  0.30 = 30%                         │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ Category & subcategory overrides                        │
│ Category / Subcategory    Basis   Amount                │
│ ▾ Flower                  [% ▾]  [0.35]   [✕]          │
│   └ Indoor                [% ▾]  [0.40]   [✕]          │
│   └ Greenhouse  (inherits 35%)                          │
│     + Add subcategory override                          │
│ ▸ Vape                    [% ▾]  [0.25]   [✕]          │
│ ▸ Pre-roll                [$ ▾]  [8.00]   [✕]          │
│ [+ Add category override…]                              │
│                                                         │
│ [Save rule]                                             │
└─────────────────────────────────────────────────────────┘
```

### Behaviour
- Category rows show a summary badge (e.g. `35%`) and a collapse chevron (▾/▸)
- Subcategory rows indent under their category. Only appear when category is expanded.
- Subcategory rows without an explicit override show "inherits X%" in grey — they take the parent category's value
- "Add subcategory override" link appears at the bottom of each expanded category
- "Add category override" select at table bottom for categories not yet overridden
- Inputs: `.select` + `.input` semantic classes throughout
- Save: `.primary-button`
- Internal-only: amber `.selection-pill` badge in the card header

### Data model extension needed
`CustomerPricingRule` type needs a `subcategories` map alongside `categories`:
```ts
interface CustomerPricingRule {
  default?: PricingRuleEntry
  categories?: Record<string, PricingRuleEntry>        // existing
  subcategories?: Record<string, PricingRuleEntry>     // new — key = subcategory name
}
```
The `setDefaultPricingRule` and `setCustomerPricingRule` commands need to accept and persist `subcategories`.

---

## 3. Customer Pricing Panel — Redesign

**File:** `src/client/components/PricingPanel.tsx` (`CustomerPricingPanel`)

Same visual structure as DefaultPricingPanel. Additional elements:
- Card title shows customer name
- Fallback notice at bottom: "Categories without an override use the system default (X%)." — reads from `reference.data.defaultPricingRule`
- Footer has both `Save rule` (primary) and `Discard` (secondary) buttons

---

## 4. Order Pricing — Inline in Sales Order Lines Grid

**File:** `src/client/views/SalesView.tsx` (sales order lines AG Grid)

### Remove
`OrderPricingPanel` component and its usage in `ContextDrawer` are removed entirely. The `PricingPanel.tsx` export `OrderPricingPanel` is deleted.

### New grid columns (operator view only, hidden in customer-facing view)

| Column | Type | Notes |
|---|---|---|
| COGS / Range | Display | Fixed: shows cost + rule source. Range: shows derived COGS + range check (✓ or ↓) |
| Markup $ | Editable | Auto-filled from pricing rule on line add. `rule` badge when auto; `override` badge when manually changed |
| Markup % | Calculated | Display only — always Markup $ ÷ COGS (markup-on-cost). For range rows, COGS is the derived value. |
| Unit price | Editable | Always editable |

All four columns are gated behind the existing `showMargin` toggle — hidden in customer screen-share posture.

### Two flows

**Fixed COGS batch** (batch has a single `unitCost` value):
1. COGS = `batch.unitCost` — known, shown in COGS cell with rule source label
2. Markup $ = COGS × rule% (or + rule$) — auto-filled on line add, tagged `rule`
3. Unit price = COGS + Markup $ — editable
4. Editing unit price → Markup $ = Unit price − COGS, tag changes to `override`
5. Editing Markup $ → Unit price = COGS + Markup $, tag changes to `override`

**Range COGS batch** (batch has a `priceRange` low–high):
1. Unit price — operator sets this first (primary input)
2. Markup $ = Unit price × rule% — auto-filled from rule on price entry, tagged `rule`
3. COGS = Unit price − Markup $ — derived, shown with range check
4. Range check: if derived COGS is within `[rangeLow, rangeHigh]` → show ✓ in range; if outside → show ↓ below or ↑ above (informational only, no gate, no approval required)
5. Editing Markup $ → COGS updates (price stays), tag changes to `override`
6. Editing Unit price → Markup $ recalculates from rule, COGS updates

### Rule resolution order
Same as existing `resolvePricingRuleEntry`: customer subcategory → customer category → customer default → settings subcategory → settings category → settings default → fallback 30%.

The rule source label under the COGS cell identifies which level matched: `▲ customer · Indoor`, `▲ customer · Flower`, `▲ default · Vape`, etc.

### "Re-apply rule" toolbar button
Resets all draft lines' Markup $ back to the current pricing rule (clears overrides). Existing `priceSalesOrder` command or equivalent.

### AG Grid cell implementation
- COGS / Range: custom `cellRenderer` — reads `unitCost` vs `priceRange` to decide which layout to render
- Markup $: `editable: true`, `valueSetter` writes to local state and triggers recalc
- Unit price: `editable: true`, `valueSetter` triggers recalc
- Markup %: `valueGetter` — computed from Markup $ and COGS/price depending on batch type
- All four columns use `headerClass: 'pricing-col-header'` for the green-tinted header background

---

## 5. Design System Additions

All new classes follow the hybrid Tailwind+semantic-class pattern. New entries in `styles.css`:

```css
/* Filter bar */
.filter-pill { }
.filter-pill-remove { }
.add-filter-btn { }
.add-filter-dropdown { }
.builder-panel { }
.builder-panel-header { }
.builder-panel-body { }
.builder-panel-footer { }
.condition-row { }
.logic-badge { }
.nested-group { }
.presets-strip { }  /* if not already present */

/* Pricing table */
.pricing-rule-table { }      /* the cat/subcat override table */
.pricing-cat-row { }
.pricing-sub-row { }
.pricing-col-header { }      /* green-tinted AG Grid header for pricing cols */
```

---

## 6. What is NOT changing

- AG Grid results area in `InventoryFinderPanel` — completely untouched
- `AdvancedFilterBuilder` logic, `filterSchemas.ts`, `filterEvaluator.ts`, `trpc.filters.*` — logic unchanged, restyled only
- `SavedFiltersManager` component — unchanged, surfaced via "Manage views" link
- `useCommandRunner` contract — all mutations still route through it
- `priceSalesOrder` command — reused as-is for "Re-apply rule"
- `showMargin` toggle behaviour — pricing columns remain gated

---

## 7. Files affected

| File | Change |
|---|---|
| `src/client/components/InventoryFinderPanel.tsx` | Full restructure |
| `src/client/components/AdvancedFilterBuilder.tsx` | Restyle (logic unchanged) |
| `src/client/components/DefaultPricingPanel.tsx` | Redesign + subcategory support |
| `src/client/components/PricingPanel.tsx` | Remove `OrderPricingPanel`; redesign `CustomerPricingPanel` |
| `src/client/components/PricingPanel.test.tsx` | Remove `OrderPricingPanel` test suite; update `CustomerPricingPanel` tests |
| `src/client/views/SalesView.tsx` | Add inline pricing columns to sales order lines grid |
| `src/client/styles.css` | Add ~12 new semantic classes |
| `src/shared/types.ts` | Add `subcategories` to `CustomerPricingRule` |
| `src/server/services/commandBus.ts` | Accept `subcategories` in `setDefaultPricingRule` + `setCustomerPricingRule` |
| `docs/design-system/decisions-log.md` | Append entry |
