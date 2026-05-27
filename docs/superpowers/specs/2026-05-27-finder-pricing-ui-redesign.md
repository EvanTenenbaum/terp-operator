# Finder & Pricing UI Redesign

**Date:** 2026-05-27  
**Status:** Approved — AQA findings addressed — ready for implementation planning  
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
- Chips: the 5 default views + any user-saved named views from `trpc.filters.listSavedFilters`
- Active preset shown with accent fill (`.finder-chip.success` pattern)
- **`+ Save current`**: dashed chip — saves the current filter bar state (search + pills + advanced filter if set) as a named view via `trpc.filters.saveFilter`. Opens a small name-entry popover with Save/Cancel.
- **`Manage views`**: opens the existing `SavedFiltersManager`. Link at trailing edge of strip.
- **Migration for existing workspaces**: the 5 hardcoded slices (`savedSlices` array in the component) are removed. A new DB migration (or idempotent startup upsert) inserts the 5 default views as saved filters for any workspace with zero saved filters of type `inventory`. This ensures existing workspaces are not broken on deploy — `db:seed` alone is insufficient for live workspaces.

### Advanced filter builder panel

- Slides in between presets strip and AG Grid (pushes grid down, does not overlay)
- **Header**: accent-tinted bar with title, logic badge (`AND`/`OR`, clickable to toggle), and `✕ Close builder` button
- **Body**: one `condition-row` per condition — field select, operator select, value input, remove button. Nested groups shown indented with a left accent border and their own logic badge.
- **Condition row inputs**: use `.select` and `.input` semantic classes (not raw `border px-2`)
- **Footer**: `Apply (N results)` primary button, `Save as view…` secondary button, `Clear all` ghost button
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
- `.presets-strip` — the views strip row

Existing classes reused: `.finder-chip`, `.finder-chip.success`, `.control-band`, `.secondary-button`, `.primary-button`, `.compact-action`

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
- Subcategory rows without an explicit override show "inherits X%" in grey
- "Add subcategory override" link at the bottom of each expanded category
- "Add category override" select at table bottom
- Inputs: `.select` + `.input` semantic classes throughout
- Save: `.primary-button`
- Internal-only: amber `.selection-pill` badge in the card header

### Data model — subcategory key design (AQA fix)

`CustomerPricingRule` type uses a **nested structure** to avoid key collisions between subcategories that share a name across different categories (e.g. `Flower > Indoor` and `Vape > Indoor` must not collide):

```ts
interface CategoryPricingEntry {
  rule?: PricingRuleEntry                           // category-level override
  subcategories?: Record<string, PricingRuleEntry> // subcategory overrides, keyed by subcategory name within this category
}

interface CustomerPricingRule {
  default?: PricingRuleEntry
  categories?: Record<string, CategoryPricingEntry>  // replaces old Record<string, PricingRuleEntry>
}
```

**Migration note**: the existing `categories` field stores `PricingRuleEntry` directly. The new shape wraps it in `CategoryPricingEntry`. The `setDefaultPricingRule` / `setCustomerPricingRule` command handlers must be backward-compatible: when reading an existing rule, if a category value is a bare `PricingRuleEntry` (has `basis` + `amount`), treat it as `{ rule: value }`.

The `resolvePricingRuleEntry` function in `src/shared/inventoryPricingShared.ts` must be updated to walk: `customer category.subcategories[sub]` → `customer category.rule` → `customer default` → `settings category.subcategories[sub]` → `settings category.rule` → `settings default` → fallback.

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
`OrderPricingPanel` component and its usage in `ContextDrawer` are removed entirely. The `PricingPanel.tsx` export `OrderPricingPanel` is deleted. `ContextDrawer.tsx` must be updated to remove the import and render site.

### New grid columns (operator view only, hidden in customer-facing view)

| Column | Type | Notes |
|---|---|---|
| COGS | Display | Fixed: `batch.unitCost` + rule source label. Range: derived value + range check (✓ / ↓ / ↑), informational only |
| Markup $ | Editable | Auto-filled from pricing rule. `rule` badge when auto; `override` badge when manually changed |
| Markup % | Calculated | Display only — **always Markup $ ÷ COGS** (markup-on-cost, consistent for both batch types) |
| Unit price | Editable | Always editable |

All four columns gated behind the existing `showMargin` toggle.

### Markup formula decision (AQA fix)

**Canonical formula**: markup-on-cost for both batch types. `Markup % = Markup $ ÷ COGS`.

This requires a consistent way to auto-fill `Markup $` from the rule when price is the primary input (range batches). The conversion is:

```
Markup $ = Unit price × (rule% / (1 + rule%))
COGS     = Unit price − Markup $
Markup % = Markup $ / COGS   ← always equals rule%  ✓
```

Example: rule = 30%, price = $100 → Markup $ = $100 × (0.30/1.30) = $23.08, COGS = $76.92, Markup % = 30%. Mathematically consistent.

For dollar-basis rules (`basis: 'dollar'`): `Markup $ = rule.amount` (fixed dollar); `Unit price = COGS + rule.amount` for fixed batches; for range batches, `Markup $` is pre-filled to `rule.amount` and COGS is derived as `price - rule.amount`.

### Two flows

**Fixed COGS batch** (batch has a single `unitCost`):
1. COGS = `batch.unitCost` — shown in COGS cell with rule source label
2. Markup $ = `applyPricingRule(COGS, resolvedRule) - COGS` — auto-filled, tagged `rule`
3. Unit price = COGS + Markup $ — editable
4. Editing unit price → Markup $ = Unit price − COGS, tag → `override`
5. Editing Markup $ → Unit price = COGS + Markup $, tag → `override`

**Range COGS batch** (batch has a `priceRange` low–high):
1. Unit price — operator sets this (primary input)
2. Markup $ = Unit price × (rule% / (1 + rule%)) — auto-filled from rule, tagged `rule`
3. COGS = Unit price − Markup $ — derived, shown with range check
4. Range check: ✓ in range / ↓ below / ↑ above — informational only, no gate
5. Editing Markup $ → COGS updates (price stays), tag → `override`
6. Editing Unit price → Markup $ recalculates from rule, COGS updates, tag stays `rule`

### Rule resolution order
`resolvePricingRuleEntry` updated to walk: customer `subcategories[sub]` → customer `categories[cat].rule` → customer `default` → settings `subcategories[sub]` → settings `categories[cat].rule` → settings `default` → fallback 30%.

Rule source label shown under COGS cell: `▲ customer · Indoor`, `▲ customer · Flower`, `▲ default · Vape`, etc.

### "Re-apply rule" toolbar button
Resets all draft lines' Markup $ to rule auto-fill (clears overrides). Reuses or extends existing `priceSalesOrder` command.

### AG Grid cell implementation
- COGS: custom `cellRenderer` — reads `unitCost` vs `priceRange` to choose fixed vs range layout
- Markup $: `editable: true`, `valueSetter` writes to local row state and triggers recalc
- Unit price: `editable: true`, `valueSetter` triggers recalc
- Markup %: `valueGetter` — `markupDollars / derivedCogs`
- All four columns: `headerClass: 'pricing-col-header'` for green-tinted header

### Test coverage (AQA fix)

A new test file `src/client/views/SalesView.pricing.test.tsx` (or extended existing SalesView test) must cover:
- Fixed-COGS: auto-fill markup on line add
- Fixed-COGS: editing unit price → markup recalculates, tag → `override`
- Fixed-COGS: editing Markup $ → price recalculates
- Range-COGS: operator sets price → markup auto-fills, COGS derived
- Range-COGS: range check boundary (in-range ✓, below ↓, above ↑)
- Range-COGS: editing Markup $ → COGS updates, price unchanged
- Re-apply rule: all draft lines reset to `rule` tag values

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
.presets-strip { }

/* Pricing table */
.pricing-rule-table { }
.pricing-cat-row { }
.pricing-sub-row { }
.pricing-col-header { }
```

---

## 6. What is NOT changing

- AG Grid results area in `InventoryFinderPanel` — completely untouched
- `AdvancedFilterBuilder` filter evaluation logic, `filterSchemas.ts`, `filterEvaluator.ts`, `trpc.filters.*` — logic unchanged, restyled only
- `SavedFiltersManager` component — unchanged, surfaced via "Manage views" link
- `useCommandRunner` contract — all mutations still route through it
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
| `src/client/components/ContextDrawer.tsx` | Remove `OrderPricingPanel` import and render site |
| `src/client/views/SalesView.tsx` | Add inline pricing columns to sales order lines grid |
| `src/client/views/SalesView.pricing.test.tsx` | New — covers both pricing flows (7 cases, see §4) |
| `src/client/styles.css` | Add ~14 new semantic classes |
| `src/shared/types.ts` | Update `CustomerPricingRule` to nested `CategoryPricingEntry` structure |
| `src/shared/inventoryPricingShared.ts` | Update `resolvePricingRuleEntry` for subcategory resolution |
| `src/server/services/commandBus.ts` | Accept new `CustomerPricingRule` shape; backward-compat read of old flat `categories` |
| `migrations/XXXX_default_inventory_views.sql` | Idempotent upsert of 5 default saved filter views for existing workspaces |
| `docs/design-system/decisions-log.md` | Append entry |
