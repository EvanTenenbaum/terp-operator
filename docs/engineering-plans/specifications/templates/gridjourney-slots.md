# GridJourney/PrimaryGridView — Slot Contracts

**Type:** Template slot specification
**Target:** `src/client/templates/GridView.tsx` (today's `GridView`; renamed `PrimaryGridView` per R-23)
**Authority:** `REMAINING-WORK-EXECUTION-PLAN.md` R-08; reflection-reviewer amendment to extend GridJourney with typed `prelude` / `tabBar` slots replacing today's free-form `ReactNode` props.
**Status:** Draft — awaiting `claude-architect` approval before code-level enforcement.

---

> ⚠️ **ARCHITECTURE GATE:** This spec must comply with [MERCURY-ARCHITECTURE-MANIFESTO.md](../../MERCURY-ARCHITECTURE-MANIFESTO.md). Read §§1–3, §6 before implementing.

## Manifesto Anchoring

| Field | Value |
|--------|-------|
| **UX Rule(s) Served** | UX-3 (one primary surface — slots are narrow, opinionated, prevent surface sprawl), UX-4 (bulk bar gates visibility), UX-9 (filtering is fluid — tabBar is flow-filters, not navigation) |
| **ARCH Rule(s) Followed** | ARCH-1 (typed over `ReactNode`), ARCH-4 (progressive disclosure — slot visibility tied to selection state), ARCH-8 (template-owned chrome — template decides where slots render, not the caller) |
| **Attention Budget Tier** | 1-hop (slots are auxiliary to the primary grid surface; they may surface 1-hop supporting info but must not compete with the grid) |
| **Old Pattern Replaced** | Today's `GridView` accepts `summarySlot?: ReactNode` (untyped, caller can render anything anywhere). The legacy `GridJourney` factory accepted `prelude?: (runCommand) => ReactNode` (untyped, tightly coupled to `useCommandRunner`). Both are replaced by `preludeSlot?` and `tabBarSlot?` with typed interfaces. |
| **URL State Encoded** | `tabBarSlot` active key survives in URL (`?tab=<key>` or `?status=<key>`); `preludeSlot` visibility may survive in URL (`?prelude=open`) for views where the prelude is a primary-task surface (PaymentsView allocation panel). |
| **Existing Infra Leveraged** | `useViewUrlState` (R-10, in-flight), `trpc.queries.statusCounts` (T-B-04, shipped), `useUiStore.selectedRows[viewKey]` (existing selection gate), `useUiStore.gridFilters[viewKey]` (existing filter string). |
| **Anti-Patterns Avoided** | No `ReactNode` slot props — every slot is typed; no `useCommandRunner` injection through slot callbacks (consumers call it directly per ARCH-7); no inline callback factories in slot definitions; no slot that circumvents the template's render order. |
| **Compliance Check** | Search `src/client/templates/GridView.tsx`: `preludeSlot` and `tabBarSlot` props are typed with interfaces, not `ReactNode`. Views passing these slots pass TypeScript compile. Views that don't use a slot render the same layout without empty slot chrome. No `ReactNode` summary or prelude props remain on the template. |

---

## 1. Purpose

Define narrow, typed slot contracts for the `prelude` and `tabBar` extension surfaces on `PrimaryGridView` (today's `GridView`). These slots replace today's free-form `ReactNode` props (`summarySlot`, legacy `prelude` callback) with compile-time-checked interfaces that prevent the five bespoke pre-grid surfaces (PaymentsView Quick Ledger, VendorPayablesView money-out band, ConnectorsView notes/route band, MatchmakingView search header, RecoveryView search header) from diverging again.

---

## 2. Slot Layout (Chrome Stack)

The `PrimaryGridView` renders slots in a fixed order. Slots appear between template-owned chrome in this sequence:

```
┌─────────────────────────────────────────────────┐
│ preludeSlot (optional, typed)                    │  ← above FilterToolbar
├─────────────────────────────────────────────────┤
│ FilterToolbar (template-owned, always rendered)   │
├─────────────────────────────────────────────────┤
│ GridSummaryStrip (template-owned, optional)       │
├─────────────────────────────────────────────────┤
│ tabBarSlot (optional, typed)                      │  ← between summary and grid
├─────────────────────────────────────────────────┤
│ OperatorGrid (template-owned, always rendered)    │
├─────────────────────────────────────────────────┤
│ BulkActionBar (selection-gated, template-owned)   │
└─────────────────────────────────────────────────┘
│ DetailSlideover (drawer-gated, template-owned)    │  ← overlays right side
```

Both slots are **optional** — when absent, the template renders no placeholder chrome for them. This is consistent with ARCH-4: don't render UI the operator isn't using.

---

## 3. Slot Contract: `preludeSlot`

### 3a. Type

```typescript
import type { ReactElement } from 'react';

/**
 * PreludeSlot — a typed, narrow contract for pre-grid header content.
 *
 * The component passed to `preludeSlot` receives only the props it needs
 * to render primary-task context. It does NOT receive `runCommand`, store
 * slices, or query results — it owns its own data dependencies per ARCH-7.
 */
export interface PreludeSlotProps {
  /** View key — for URL-state reads and store-scoped lookups. */
  viewKey: ViewKey;
  /** The entity type driving this view (from view-registry). */
  entityType: string;
  /** Whether the slot should collapse to a minimal state (e.g., BulkActionBar active). */
  compact?: boolean;
}

/**
 * PreludeSlot — a React component satisfying the prelude contract.
 * The template mounts this component above FilterToolbar.
 */
export type PreludeSlot = (props: PreludeSlotProps) => ReactElement;
```

### 3b. Position

Renders **above** `FilterToolbar`, full-width, in its own horizontal band. It is the first child of the `.view-stack` flex column.

### 3c. BulkActionBar Behavior

When `selectedRows[viewKey].length > 0` (BulkActionBar mounted), the `preludeSlot` component receives `compact: true`. The component SHOULD collapse to a minimal summary band (≤ 48px height) or hide entirely, at the component's discretion. The template does NOT unmount the slot — the component decides its compact representation.

**Rationale:** In PaymentsView, the Quick Ledger + allocation panel is the operator's primary task context. Collapsing it entirely would disorient the operator mid-bulk-action. The compact band preserves context ("You are allocating payment XYZ to 3 invoices") without competing for attention with the bulk action bar.

### 3d. Height Constraints

| State | Max Height | Rationale |
|-------|-----------|-----------|
| **Default (expanded)** | 400px (≈25% of viewport at 1600px) | Must not crowd out the grid; operators are here for the grid, not the prelude. |
| **Compact** | 48px | Single-line summary band; operator is mid-bulk-action. |
| **Overflow** | `overflow-y: auto` within the prelude band | If content exceeds max height, scroll within the band rather than pushing the grid off-screen. |

The template enforces `max-height` via a CSS class (`.prelude-slot`) rather than inline styles. The slot component receives a `className` from the template and must spread it onto its outermost element.

### 3e. Animation

- **Expand → Compact:** 200ms `max-height` transition with `ease-out`. Content below the fold clips with `overflow: hidden`.
- **Compact → Expand:** 200ms `max-height` transition with `ease-in`.
- **Mount/Unmount:** If the slot is conditionally rendered by the caller (not by the template), the template applies a 150ms `opacity` + `max-height` enter/exit transition.

Implementation: CSS transition classes on the `.prelude-slot` wrapper. No JS animation library.

### 3f. Views Using `preludeSlot`

| View | ViewKey | Component | Rationale |
|------|---------|-----------|-----------|
| **PaymentsView** | `payments` | `PaymentsHeader` (Quick Ledger + allocation panel) | Primary-task context — operator is mid-allocation and the ledger is their working surface. |
| **VendorPayablesView** | `vendors` | `VendorMoneyOutBand` (money-out commit + bill tools) | Primary-task header — operator selects a bill and commits payment from this band. |
| **ConnectorsView** | `connectors` | `ConnectorRouteBand` (notes + route-to input) | Primary-task header — operator routes connector requests from this surface. |
| **MatchmakingView** | `matchmaking` | None (uses `tabBarSlot` instead) | Matchmaking's search header is a filter, not primary-task context → `tabBarSlot`. |
| **RecoveryView** | `recovery` | None (uses `tabBarSlot` instead) | Recovery's search header is a filter → `tabBarSlot`. |

---

## 4. Slot Contract: `tabBarSlot`

### 4a. Type

```typescript
import type { ReactElement } from 'react';

/**
 * Tab definition for the tab bar slot.
 */
export interface TabBarTab {
  /** Unique key — used for URL encoding and active-tab tracking. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Optional badge count (e.g., number of items in this status). */
  count?: number;
}

/**
 * TabBarSlotProps — the contract for a component rendered in the tab bar slot.
 */
export interface TabBarSlotProps {
  /** View key — for URL-state reads. */
  viewKey: ViewKey;
  /** Pre-built tab definitions. The slot component renders these, not fetches them. */
  tabs: TabBarTab[];
  /** Currently active tab key (from URL or internal state). */
  activeKey: string;
  /** Called when the operator selects a tab. */
  onChange: (key: string) => void;
  /** Whether the slot is in a loading state (e.g., status counts pending). */
  loading?: boolean;
}

/**
 * TabBarSlot — a React component satisfying the tab bar contract.
 * The template mounts this component between GridSummaryStrip and OperatorGrid.
 */
export type TabBarSlot = (props: TabBarSlotProps) => ReactElement;
```

### 4b. Default Implementation

When `tabBarSlot` is **not provided** by the caller and the view registry declares a status-counts entity type, the template renders a default `StatusTabBar` component that fetches `queries.statusCounts` and renders the standard pill-style tab bar. This is the behavior of today's `ViewTabBar` in `GridView`.

When `tabBarSlot` **is provided**, the template defers entirely to the slot component. The caller is responsible for fetching status counts (or any other data driving the tabs). This enables MatchmakingView's custom search-header tab bar without forcing every view to understand it.

### 4c. Position

Renders **between** `GridSummaryStrip` and `OperatorGrid`, full-width. It is a horizontal band with `h-10` (40px) default height.

### 4d. BulkActionBar Behavior

When `selectedRows[viewKey].length > 0` (BulkActionBar mounted), the `tabBarSlot` **hides**. The template unmounts the slot component from the DOM (not just `visibility: hidden`).

**Rationale:** The tab bar is a filter mechanism (per UX-9: filtering is fluid, not navigation). When the operator has selected rows and is executing a bulk action, filtering is irrelevant — the selection is the operator's current context. Hiding the tab bar reduces visual noise and reinforces the bulk-action mode.

### 4e. Height Constraints

| State | Height | Notes |
|-------|--------|-------|
| **Visible** | 40px (`h-10`) | Fixed — the tab bar is a single-row horizontal strip. |
| **Hidden** | 0px (unmounted) | No placeholder, no reserved space. |

The template wraps the slot in a `<div className="tab-bar-slot h-10">` when mounted, and removes the `<div>` entirely when unmounted. The grid below naturally expands to fill the reclaimed space.

### 4f. Animation

- **Mount:** 150ms `max-height` transition from 0 → 40px, with `overflow: hidden`.
- **Unmount:** 150ms `max-height` transition from 40px → 0, with `overflow: hidden`. After the transition completes, the element is removed from the DOM.

Implementation: CSS transition on the `.tab-bar-slot` wrapper. The template uses a short `setTimeout` equal to the transition duration before removing the DOM node, or a React `onTransitionEnd` handler.

### 4g. Views Using `tabBarSlot`

| View | ViewKey | Slot Component | Tabs Driven By |
|------|---------|---------------|----------------|
| **PurchaseOrdersView** | `purchaseOrders` | Default (built-in) | `queries.statusCounts` → status tabs |
| **Sales/OrdersView** | `orders` | Default (built-in) | `queries.statusCounts` → status tabs |
| **InventoryView** | `inventory` | Default (built-in) | `queries.statusCounts` → status tabs |
| **PaymentsView** | `payments` | Default (built-in) | `queries.statusCounts` → status tabs |
| **FulfillmentView** | `fulfillment` | Default (built-in) | `queries.statusCounts` → status tabs |
| **MatchmakingView** | `matchmaking` | Custom `MatchmakingSearchHeader` | Custom (search + status hybrid) |
| **RecoveryView** | `recovery` | Custom `RecoverySearchHeader` | Custom (search + command type filter) |
| **ConnectorsView** | `connectors` | Default (built-in) | `queries.statusCounts` → status tabs |
| **CloseoutView** | `closeout` | None | Closeout has no tab bar — statuses are archive phases, not filters. |
| **VendorPayablesView** | `vendors` | Default (built-in) | `queries.statusCounts` → status tabs |
| **ClientLedgerView** | `clients` | None | Client ledger has no statuses to filter by (customer entity). |

---

## 5. Typed Slot Enforcement

The `PrimaryGridViewProps` interface is:

```typescript
export interface PrimaryGridViewProps {
  /** View key — drives all registry lookups and queries. */
  viewKey: ViewKey;

  /**
   * Optional prelude slot — typed, not ReactNode.
   * Renders above FilterToolbar. Use for primary-task header context.
   */
  preludeSlot?: PreludeSlot;

  /**
   * Optional tab bar slot — typed, not ReactNode.
   * Renders between GridSummaryStrip and OperatorGrid.
   * Falls back to default StatusTabBar when omitted and view registry
   * declares a status-counts entity.
   */
  tabBarSlot?: TabBarSlot;
}
```

The following are **removed** from the props surface as part of this refactor:
- `summarySlot?: ReactNode` → use `preludeSlot?` with a component that renders summary content.
- Legacy `prelude?: (runCommand) => ReactNode` (from old `GridJourney`) → use `preludeSlot?`.

The legacy `GridJourney` deprecation wrapper (Phase 0b, §10 of `primary-grid-view.md`) continues to accept the old `prelude` callback and maps it to the new slot internally. This shim is deleted in Phase 4 cleanup.

---

## 6. Acceptance Criteria

- [ ] `PreludeSlot` and `TabBarSlot` types exported from `src/client/templates/GridView.tsx` (or `PrimaryGridView.tsx` after R-23 rename).
- [ ] `PrimaryGridViewProps` declares `preludeSlot?: PreludeSlot` and `tabBarSlot?: TabBarSlot` (not `ReactNode`).
- [ ] `summarySlot?: ReactNode` prop removed from `GridView`/`PrimaryGridView`.
- [ ] Default `StatusTabBar` renders when `tabBarSlot` is omitted and view registry declares a status-counts entity.
- [ ] `tabBarSlot` unmounts when `BulkActionBar` is mounted (selection-gated).
- [ ] `preludeSlot` receives `compact: true` when `BulkActionBar` is mounted.
- [ ] Height constraints enforced via CSS classes (`.prelude-slot`, `.tab-bar-slot`), not inline styles.
- [ ] Transitions defined in CSS, not JS animation libraries.
- [ ] Typecheck clean.
- [ ] Existing view tests pass unchanged (views that don't use these slots continue to render identically).
- [ ] Decisions-log entry added linking this spec to R-08 and the reflection-reviewer amendment.

---

## 7. Dependencies

| Dependency | Status | Blocker? |
|-----------|--------|----------|
| `useViewUrlState` hook (R-10) | In-flight | Soft — slots can encode state to `useUiStore` temporarily; migrate to URL when R-10 lands. |
| `queries.statusCounts` (T-B-04) | Shipped | No |
| `view-registry.ts` entries for all 11 primaryGrid views | Shipped (Phase 0) | No |
| `GridJourney` → `PrimaryGridView` rename (R-23) | After R-08 | No — slot contracts apply to whichever name is current. |
| `StatusFilterPill` extraction (R-09) | In-flight | Soft — `tabBarSlot` default implementation uses the extracted pill internally; can inline temporarily. |

---

## 8. Risk Notes

- **Five views have bespoke pre-grid surfaces today.** Migrating them to typed slots without regression requires audit of each view's current `prelude` or `summarySlot` behavior (height, scroll, data dependencies, command-runner coupling).
- **MatchmakingView and RecoveryView currently share no template.** They render standalone grids. Adding `tabBarSlot` support to their grid surface may require refactoring them into `PrimaryGridView` callers (out of scope for R-08; noted for R-11 audit).
- **`compact` semantics on `preludeSlot`** are advisory, not enforced by the template beyond passing the prop. A non-compliant slot component could ignore `compact` and continue rendering at full height. This is acceptable for the initial contract — the review gate catches violations.
- **The default `StatusTabBar`** (rendered when no `tabBarSlot` is provided) must be extracted from today's inline `ViewTabBar` usage in `GridView.tsx` into a stable component so it can be tested independently and replaced per-view without touching the template.

---

## Agent Notes

- This is a **design doc**, not an implementation task. The `claude-architect` must approve the slot contracts before any code-level migration.
- The `TabBarTab` type intentionally mirrors the existing `TabDef` from `ViewTabBar.tsx` — the migration path from `ViewTabBar` to `tabBarSlot` should be mechanical.
- The `PreludeSlot` type deliberately omits `runCommand` — this forces views to wire command execution themselves per ARCH-7, breaking the legacy `GridJourney.prelude(runCommand)` coupling.
- When implementing, do not remove `ViewTabBar` or `GridSummaryStrip` — the slot contracts ADD to the template without removing existing functioning chrome. Removal of superseded components happens in Phase 4 cleanup.
