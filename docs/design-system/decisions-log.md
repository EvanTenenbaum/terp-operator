# Design System Decision Log

> **Append-only.** Add new entries at the **top**. Don't delete history.

## 2026-05-27 — Finder chrome redesign: pill filter bar, Add filter dropdown, presets strip, builder restyle

**Decision 1:** `InventoryFinderPanel` filter chrome restructured from stacked controls to: filter bar (search + active filter pills + "Add filter" two-step dropdown + Advanced toggle) → presets strip (DB-driven saved views + save/manage) → `AdvancedFilterBuilder` slide-down panel. All filter evaluation logic (`evaluateFilterGroup`, `filterEvaluator.ts`, `filterSchemas.ts`) is unchanged.

**Decision 2:** Active filters shown as removable pills in the filter bar. The "Add filter" button opens a two-step dropdown: pick a field (grouped: Product, Qty & Price, Date & Age, Status) → enter value (operator select + field-specific input). "Save current" in presets strip names and persists the current advanced filter to `saved_filters` via `trpc.filters.saveFilter`.

**Decision 3:** Hardcoded `savedSlices` array removed from `InventoryFinderPanel`. The 5 default views (Aging premium, Consignment risk, Value buyers, Low stock, Office owned) are seeded by migration 0071 as global `saved_filters` rows, so they persist across deploys and are user-editable/deletable.

**Decision 4:** `AdvancedFilterBuilder` restyled with new semantic classes: `.builder-panel`, `.builder-panel-header`, `.builder-panel-body`, `.builder-panel-footer`, `.condition-row`, `.logic-badge`, `.nested-group`. Logic unchanged. Two new props: `onSaveAsView` (callback) and `resultCount` (display in Apply button).

**Decision 5:** Filter chrome CSS classes added to `styles.css`: `.filter-bar`, `.filter-pill`, `.filter-pill-remove`, `.add-filter-btn`, `.add-filter-dropdown`, `.advanced-btn`, `.presets-strip`, `.preset-save-chip`, `.presets-manage-link`, `.presets-label`, plus all builder panel classes.

**Files:** `src/client/components/InventoryFinderPanel.tsx`, `src/client/components/AdvancedFilterBuilder.tsx`, `src/client/styles.css`, `migrations/0071_default_inventory_views.sql`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---

## 2026-05-27 — Pricing redesign: nested CategoryPricingEntry, inline SalesView pricing columns, OrderPricingPanel removed

**Decision 1:** `CustomerPricingRule.categories` changed from `Record<string, PricingRuleEntry>` to `Record<string, CategoryPricingEntry>` where `CategoryPricingEntry = { rule?: PricingRuleEntry; subcategories?: Record<string, PricingRuleEntry> }`. Key collision between same-named subcategories across categories is prevented by nesting under the category key. Existing flat `{ basis, amount }` entries are migrated to `{ rule: { basis, amount } }` transparently in `validatePricingRulePayload`.

**Decision 2:** `resolvePricingRuleEntry` updated with 7-level resolution: customer subcategory → customer category rule → customer default → settings subcategory → settings category rule → settings default → fallback 30%. `PricingRuleApplication.source` union extended with `'customer-subcategory'` and `'settings-subcategory'`. New `subcategory?: string` field on `PricingRuleApplication` populated when source is a subcategory match.

**Decision 3:** `markupDollarsFromPrice(price, rule)` added to `inventoryPricingShared.ts`. For range-COGS batches where price is the primary input, converts markup-on-cost rule% to a dollar amount: `price × (rule% / (1 + rule%))`. This keeps Markup % = Markup $ ÷ COGS consistent with fixed-COGS rows.

**Decision 4:** `OrderPricingPanel` removed from `PricingPanel.tsx` and `RelationshipDrawer.tsx`. Per-line pricing now lives inline in the SalesView sales order lines AG Grid as three new margin-gated columns: `markup` (editable), `markupPct` (calculated), `derivedCogs` (display). All gated by `showMargin` toggle via `MARGIN_COLUMN_FIELDS` in `SalesView.columns.ts`.

**Decision 5:** Two pricing flows in the same grid: fixed-COGS rows use COGS→markup→price; range-COGS rows use price→markup(via markupDollarsFromPrice)→derivedCogs(range-checked). Both display Markup % as markup-on-cost (Markup $ ÷ COGS) for consistency.

**Files:** `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/inventoryPricingShared.ts`, `src/server/services/commandBus.ts`, `src/client/components/DefaultPricingPanel.tsx`, `src/client/components/PricingPanel.tsx`, `src/client/components/RelationshipDrawer.tsx`, `src/client/views/SalesView.tsx`, `src/client/views/SalesView.columns.ts`, `src/client/styles.css`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** Spec `docs/superpowers/specs/2026-05-27-finder-pricing-ui-redesign.md`

---

## 2026-05-27 — CountPill: navigable count badge component (TER-1624)

**Decision:** New `CountPill` component (`src/client/components/CountPill.tsx`) wraps any numeric count in a `<button>` that calls `setGridFilter(filterView, filterValue)` + `navigate(route)` on click.

**API:** `count`, `route` (absolute path), `filterView?` (ViewKey), `filterValue?` (string in the `field:val1,val2` format used by `gridFilterUtils`), `label?`, `className?`.

**Style:** Reuses the existing `selection-pill` semantic CSS class (no new CSS). Adds `hover:border-accent hover:text-accent cursor-pointer` via Tailwind.

**Why not wrap in outer button:** Anywhere a count is already inside a `<button>` (e.g., DashboardView pending queue rows), nesting `CountPill` would create `<button><button>` which is invalid HTML. In those cases, update the outer button's `onClick` directly to apply the filter before navigating. Only replace truly inert `<span>` or `<strong>` count displays with CountPill.

**Adopted at:**
- `PhotographyQueuePanel.tsx` — "ready" and "needs media" inert spans replaced with CountPill targeting `/inventory` with `mediaStatus` filters
- `DashboardView.tsx` — pending queue buttons updated to call `setGridFilter` before navigate (Intake → `status:ready`, Sales → `status:confirmed`)

**Files:** `src/client/components/CountPill.tsx`, `src/client/components/CountPill.test.tsx`, `src/client/components/PhotographyQueuePanel.tsx`, `src/client/views/DashboardView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1624, TER-1611 (Phase 8 UX/Flow audit), GH PR #416.

---

## 2026-05-25 — Wave 3A AQA repair: WorkspacePanel default heading level changed to h2 (GH #325)

**Decision:** `WorkspacePanel` section titles now render as `<h2>` by default (previously defaulted to `<h3>` with an opt-in `headingLevel` prop). The `headingLevel` prop (values `2 | 3 | 4`) still allows call sites to override when the surrounding heading hierarchy requires a different level.
**Rationale:** Parent page views use `<h1>` page titles. Defaulting to `<h3>` created a skip-level violation (h1 → h3) that fails WCAG 2.1 SC 1.3.1. With `<h2>` as the default, panel titles sit correctly in the h1 → h2 → h3 hierarchy. Call sites that genuinely need h3 (e.g., panels nested inside an h2 section) can pass `headingLevel={3}`.
**Files:** `src/client/components/WorkspacePanel.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #325, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: ColumnsMenu click-outside excludes trigger button (GH #326)

**Decision:** The `ColumnsMenu` component uses a capture-phase `pointerdown` listener for click-outside detection. A `triggerRef` is passed from the parent `OperatorGrid` component to the menu; the click-outside handler now excludes both the menu element and the trigger button from detection. This prevents the double-toggle race condition where: (1) capture-phase fires on trigger click → menu closes, (2) button `onClick` fires → menu re-opens.
**Pattern:** Pass `triggerRef: RefObject<HTMLButtonElement | null>` as a prop to any menu component that uses capture-phase click-outside. Attach the ref to the toggle button in the parent.
**Files:** `src/client/components/OperatorGrid.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #326, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: Filter preset labels corrected; preset pattern documented (GH #354)

**Decision:** Filter presets in `OrdersView` and `InventoryView` were renamed for semantic accuracy:
- `InventoryView`: "Low Stock" → "Office Stock" (the preset filters `ownershipStatus:OFC` which means office-owned, not a quantity threshold)
- `OrdersView`: "Open" → "All Open" (filters `status:draft,confirmed`); "Awaiting Pick" → "Confirmed" (filters `status:confirmed`)
**Filter preset pattern:** Presets are toggle buttons that call `setGridFilter(preset)` or clear it. Button labels must match the operator-facing column value semantics (e.g., `ownershipStatus:OFC` = "Office Stock", not "Low Stock"). Presets are applied to `PaymentsView`, `OrdersView`, `InventoryView`, `FulfillmentView` using the same `togglePreset` / `storedGridFilter` pattern.
**Files:** `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #354, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A AQA repair: GH #321 completeness — dialog components fixed (GH #321)

**Decision:** The Wave 3A commit fixed `bg-primary` / `focus:border-primary` in view files but missed four dialog/modal components. These are now fixed:
- `ContactCreateModal.tsx`: 5 × `focus:border-primary` → `focus:border-accent` on form inputs; submit button `bg-primary` inline styles → `btn-primary`
- `RecordPrepaymentDialog.tsx`: submit button → `btn-primary`
- `UpdateRefereeRelationshipDialog.tsx`: submit button → `btn-primary`
- `RefereeDialog.tsx`: submit button → `btn-primary`
**Files:** `src/client/components/ContactCreateModal.tsx`, `src/client/components/RecordPrepaymentDialog.tsx`, `src/client/components/UpdateRefereeRelationshipDialog.tsx`, `src/client/components/RefereeDialog.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #321, Wave 3A UX Polish AQA repair.

---

## 2026-05-25 — Wave 3A: AG Grid ClipboardModule registered for paste-from-Excel (GH #355)

**Decision:** `ClipboardModule` from `ag-grid-enterprise` is registered in `src/client/main.tsx` via `ModuleRegistry.registerModules`. This enables paste-from-Excel into editable grid cells.
**Files:** `src/client/main.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #355, Wave 3A UX Polish.

---

## 2026-05-25 — Wave 3A: Expansion panel color consistency — green replaces blue (GH #327)

**Decision:** Expansion panel CSS design tokens (`--expansion-border`, `--expansion-border-light`, `--expansion-bg-l1`, `--expansion-bg-l2`, `--expansion-selected-bg`) changed from Tailwind blue palette (`#3b82f6`, `#eff6ff`) to project green palette (`#216e4e`, `#f0f7f4`). Direct color literals in `.expansion-panel-header`, `.expansion-section-header`, `.expansion-section`, and `.expansion-chevron-cell.expanded svg` updated to green equivalents.
**Rationale:** The expansion panel was using raw blue values (`#3b82f6`, `#1e40af`) inconsistent with the project's green `accent` primary color (`#216e4e`). All interactive UI chrome should use the green system. Blue is reserved for status-semantic uses (matched/confirmed state badges).
**Mapping:**
- `--expansion-border: #3b82f6` → `#216e4e` (accent green)
- `--expansion-border-light: #60a5fa` → `#52a87e` (lighter green)
- `--expansion-bg-l1: #eff6ff` → `#f0f7f4` (light green tint)
- `--expansion-bg-l2: #f0f9ff` → `#e8f5ef` (medium green tint)
- `--expansion-selected-bg: #dbeafe` → `#d1ede0` (selected green)
- Header text `#1e40af` → `#154d36` (dark green)
- Hover text `#1e3a8a` → `#0f3825` (deeper green)
- Section divider `#bfdbfe` → `#9dd3b4` (light green border)
**Files:** `src/client/styles.css`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #327, Wave 3A UX Polish.

---

## 2026-05-25 — Wave 3A: Design system fork — raw Tailwind `primary` utilities → semantic classes (GH #321)

**Decision:** Replace all raw Tailwind `bg-primary`, `text-primary`, `ring-primary`, `border-primary` utility classes in `src/client/views/` with the project's semantic CSS classes and design tokens.
**Rationale:** `primary` is not a color in `tailwind.config.ts`. These classes were silently ineffective (Tailwind generates no CSS for undefined color names). The correct semantic classes and tokens are: `btn-primary` / `primary-button` for filled green CTA buttons; `border-accent` / `ring-accent` for focus/active ring states on input elements and filter buttons.
**Resolved mappings:**
- `className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"` → `className="btn-primary"` (RefereesView, ProcessorsView, ContactsView)
- `focus:border-primary` on `<input>` → `focus:border-accent` (ContactsView search input)
- `ring-1 ring-primary` on active filter button → `ring-1 ring-accent` (ContactsView role filter buttons)
**Files:** `src/client/views/RefereesView.tsx`, `src/client/views/ProcessorsView.tsx`, `src/client/views/ContactsView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** GH #321, Wave 3A UX Polish.

## 2026-05-25 — Testing convention: 3-tier pyramid

**Decision**: All ongoing testing follows a 3-tier pyramid enforced by GitHub Actions.

| Tier | Location | Trigger | Purpose |
|------|----------|---------|---------|
| Smoke | `tests/smoke/` | Post-deploy + nightly | Is the app alive and usable? |
| Core e2e | `tests/e2e/` | Nightly | Do all operator workflows still work? |
| Unit | `src/**/*.test.*` | Every PR | Does business logic hold? |

**Convention for new work**:
- New top-level view or workflow → add a smoke spec to `tests/smoke/` (login + grid/heading visible, < 15s/step)
- New operator command or e2e flow → add a full spec to `tests/e2e/`
- New server service or business logic → unit test in `src/server/services/`

Nightly picks up new specs automatically in both `tests/smoke/` and `tests/e2e/`.
Smoke tests must be independent (no shared state between tests), fast, and assertion-minimal.
Failures create or update a GitHub Issue automatically via `scripts/report-test-failure.sh`.

**Rationale**: Catches live regressions during user testing rollout without requiring manual QA runs.
**Spec**: `docs/superpowers/specs/2026-05-25-ongoing-testing-strategy-design.md`

---


## Format

```markdown
## YYYY-MM-DD: [Short Title]
**Decision:** What was decided
**Rationale:** Why (problem solved, tradeoff accepted)
**Example:** File path showing implementation (or "N/A" for meta-decisions)
**Author:** Agent name via Evan
**Related:** Optional — links to issues, prior decisions, audits
```

---

## 2026-05-25 — Phase 6 Reports live: client-side aggregation, EmptyState role, clickable report rows

**Decision 1:** All 8 report aggregations in `ReportsRouteShell` are pure client-side JavaScript functions (`buildRows → build*Rows`) over live `trpc.queries.grid` data. No new server endpoints were added. Each report calls the narrowest existing grid view it needs (`vendors`, `payments`, `inventory`, `clients`, `sales`). Aggregation intentionally stays simple (group-reduce-sort) to keep it traceable and replaceable with server-side SQL projections later.
**Decision 2:** `EmptyState` gained an optional `role` prop so callers can add `role="status"` for aria-live regions. The default is no role (preserving existing usages). All new report and dashboard EmptyState usages set `role="status"`.
**Decision 3:** Report table rows are clickable and keyboard-navigable (`tabIndex=0`, `onKeyDown Enter/Space`) when a `REPORT_DRILLDOWN_VIEW` entry maps the active report to a source view. Each row carries `aria-label="Open source records in {view} view"`. The Closeout Period report has no drilldown.
**Decision 4:** `TodayFocusTile` was wired with `value` and `onClick` props. The "Today's Top Decisions" section (top 3 from `rankedWorkRows`) lives inside an `aria-live="polite"` wrapper. The entire Today Focus panel is wrapped in a `div[aria-busy]` reflecting `workQueue.isLoading`.
**Decision 5:** CSV export filename now appends ISO date: `terp-operator-{key}-YYYY-MM-DD.csv`. Values are quoted only when they contain commas, quotes, or newlines. Column order is deterministic from `REPORT_DEFS[n].columns`.
**Example:** `src/client/components/ReportsRouteShell.tsx`, `src/client/views/DashboardView.tsx`, `src/client/components/EmptyState.tsx`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1572, TER-1573, TER-1574, TER-1575, TER-1576, TER-1577, TER-1578.

---

## 2026-05-25 — Phase 6 Reports scaffold: static stub pattern, TodayFocusTile, CSV prefix fix
**Decision 1:** `ReportsRouteShell` was rewritten to remove live `trpc.queries.grid` calls and replace them with static stub data. All 7 report tabs now render an empty `report-table` with realistic column headers. A `never[]` rows array keeps the Export button disabled. Each report is defined in a `REPORT_DEFS` constant with `key`, `label`, `description`, `columns`, and optional `gated` flag. Gated reports (Closeout Period) show an `EmptyState` notice instead of a table.
**Rationale:** Shipping the shell before math fixtures avoids blocking the nav entry and gives Phase 6 implementers clear scaffolding with exact query names in `TODO(phase6)` comments. Live queries against `queries.grid` were incorrect semantically (reporting needs aggregated projections, not raw grid rows).
**Decision 2:** Added `TodayFocusTile` inline helper to `DashboardView.tsx` — a simplified read-only tile (label + "--" stub + View link) added to a new "Today Focus" `WorkspacePanel`. Does NOT extend `KpiCard` because `KpiCard` requires a `KpiMetric` shape and `onOpen` callback; the stub tiles have no interaction model yet.
**Decision 3:** Fixed CSV export filename prefix in `ReportsRouteShell` from `terp-agro-` (legacy) to `terp-operator-` (canonical). Consistent with the 2026-05-20 decision that aligned export filenames with the current product name.
**Example:** `src/client/components/ReportsRouteShell.tsx`, `src/client/views/DashboardView.tsx`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1499, docs/roadmap/phase-readiness/6.md.

---

## 2026-05-24 — Mobile views: CSS scoped under .mobile-shell with --m- prefix
**Decision:** All mobile CSS custom properties declared in `styles-mobile.css` under `.mobile-shell { }`, using `--m-` prefix. NOT declared on `:root`.
**Rationale:** `styles.css` already declares `--accent`, `--line`, and others globally. Scoping + prefix prevents silent cascade pollution of desktop AG Grid views, drawers, and the keel header.
**Example:** `src/client/styles-mobile.css`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** AQA finding M5 from 2026-05-24 spec review.

---

## 2026-05-24 — Mobile views: no AG Grid on any mobile view
**Decision:** All five mobile views use Tailwind card/list layouts. AG Grid is explicitly excluded from all /mobile/* routes.
**Rationale:** AG Grid is keyboard-first, spreadsheet-native, and breaks on touch input. Mobile views need tap-first dense lists with 44–56px minimum tap targets.
**Example:** `src/client/views/mobile/*.tsx`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile payments: canonical confirm-sheet trigger table
**Decision:** Pay Vendor tab always triggers a confirm sheet. Receive Payment triggers only when amount ≥ $20,000 OR amount ≠ invoice total.
**Rationale:** Vendor payments are unconditionally high-risk (external financial relationship). Customer receipts at small exact amounts have lower reversal impact.
**Example:** `src/client/views/mobile/MobilePaymentsView.tsx` → exported `shouldConfirm()`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile views: URL search param for cross-view batch targeting
**Decision:** `MobileCatalogView` passes `?expand={batchId}` to `/mobile/inventory`. `MobileInventoryView` reads this on mount, expands that row, and removes the param via `setSearchParams`.
**Rationale:** Local `useState` is ephemeral per view instance. `useUiStore` would pollute global state. URL params are the standard React Router cross-view handoff and are testable.
**Example:** `src/client/views/mobile/MobileInventoryView.tsx` (useSearchParams expand effect).
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile contacts: delivery-gated stub
**Decision:** `MobileContactsView` and `MobileContactProfileView` ship as stubs with a gate message until `queries.contactDirectory` and `queries.contactProfile` are available in the tRPC router (CAP-033 Phase 4).
**Rationale:** Shipping real UI against missing backend queries causes runtime failures. The stub makes the Contacts tab visible and navigable without a failure path.
**Example:** `src/client/views/mobile/MobileContactsView.tsx`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-24 — Mobile payments: recordVendorPayment requires manager role
**Decision:** The Record Payment button in `MobilePaymentsView` is disabled with a tooltip "Manager role required." for users with `role < manager` (i.e., `operator` or `viewer`). The form fields remain visible.
**Rationale:** `recordVendorPayment` requires manager minimum per `commandCatalog.ts`. Silently failing after a confirm flow is a worse UX than a clear disabled state at the action point.
**Example:** `src/client/views/mobile/MobilePaymentsView.tsx` → `canPayVendor`.
**Author:** Claude Sonnet 4.6 via Evan

---

## 2026-05-22 — CAP-030 pick-status chip colors (TER-1508)
**Decision:** Pick-status chips use Tailwind utility classes directly (`bg-blue-100 text-blue-800` etc.) rather than a semantic CSS class.
**Rationale:** Five states, one-off use in SalesView line expansion. If pick-status chips appear elsewhere, extract to `.pick-status-chip-*` semantic pattern then.
**Example:** `src/client/views/SalesView.tsx` → `PickStatusChip` helper function.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508.

---

## 2026-05-22 — CAP-030 PickView mobile layout (TER-1513)
**Decision:** PickView uses Tailwind-only layout (no AG Grid) per spec for mobile picker route.
**Rationale:** Mobile pick workflow is linear card-by-card (Queue → List → Line). AG Grid's spreadsheet-native layout is inappropriate here; Tailwind stacked list buttons match the physical warehouse-scan UX. Minimum button height 56px on primary actions, 44px elsewhere. BarcodeDetector falls back gracefully — manual entry field always visible. Alert interrupt uses `role="alertdialog"` + `aria-modal="true"`; no click-outside dismiss per spec requirement.
**Example:** `src/client/views/PickView.tsx`, `src/client/components/pick/`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1513.

---

## 2026-05-22 — CAP-030 pickQueueFilters in uiStore (TER-1510)
**Decision:** Added `pickQueueFilters: Set<string>` as a non-persisted uiStore slice (NOT in `partialize`). Uses a Set for multi-chip selection vs. gridFilters' string approach. Pre-filters the dataset rows passed to OperatorGrid `rows` prop.
**Rationale:** Chip multi-select requires a Set rather than a string. Non-persisted so filter state resets on reload (shared-workstation safety). Pre-filtering rows in the component keeps the grid API free for its own column filter model.
**Example:** `src/client/store/uiStore.ts` → `pickQueueFilters`, `setPickQueueFilter`, `clearPickQueueFilters`; `src/client/views/OperationsViews.tsx` → `FulfillmentView`.
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1510.

---

## 2026-05-22: Keel header establishes its own stacking context (z-20)
**Decision:** `.keel` (`src/client/styles.css`) receives `position: relative; z-index: 20` (Tailwind: `relative z-20`) so the global header forms its own CSS stacking context at z-20 in the document flow.
**Rationale:** `.keel` was `position: static`, meaning it had no stacking context. The `.quick-action-popover` (z-30) was therefore competing at the document level against AG Grid rows, which create stacking contexts via `transform: translate3d`. This caused the Quick Actions dropdown to render behind grid content. Adding `relative z-20` to `.keel` makes the header a self-contained stacking context above the content area (z-auto < z-20). The popover's z-30 is now local to the header's stacking context, which is correct. Drawers/modals at z-40/z-50 remain in the document stacking context and still render above the header.
**Example:** `src/client/styles.css` `.keel` rule; `.quick-action-popover` stays at z-30 (local to header stacking context).
**Author:** OpenCode via Evan
**Related:** Page feedback: Quick Actions dropdown rendering behind grid content on /purchaseOrders.

---

## 2026-05-21: #64 PR-3 — COGS exception correction journal entries at postSalesOrder
**Decision:** When `postSalesOrder` runs, insert one `correctionJournalEntries` row per posted line that carries a `belowFloorReason`. Variance = `max(0, (priceFloor - unitPrice) × qty)` — measures revenue shortfall; unitCost = priceFloor always (both set together by setLineLandedCost), so the gap that matters is between the floor and what we actually charged (unitPrice). This matches `computeOrderExceptionTotals.marginWaivedTotal`. Uses the `salesOrderLines.priceFloor` column pinned at set-time (not re-read from `batches.priceRange`) for audit reproducibility. The period check (`assertPeriodUnlocked`) runs once per posting on the first exception line. Entry IDs are added to `affectedIds` so they participate in the `afterSnapshot`. Reversal of `postSalesOrder` marks any snapshotted exception entries as `status = 'reversed'` rather than deleting them. For `vendor_approval_pending` lines, append a note to the vendor's open bill `discrepancyNotes` (text-only annotation, no dollar/status mutation, bill ID NOT added to `affectedIds`, and the annotation is NOT reversed on `postSalesOrder` reversal — it persists as AP audit). The vendor-bill read uses `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent `postSalesOrder` calls for orders sharing the same vendor bill do not silently lose annotations OR deadlock — if the bill is locked, this call skips the annotation rather than blocking.
**Rationale:** PR-3 closes the accounting propagation gap for below-range COGS exceptions captured in PR-1/PR-2. Writing one correction journal entry per exceptional line keeps the audit trail line-grained and reuses the existing correction-journal infrastructure rather than introducing a new ledger. Pinning to the set-time `priceFloor` column (instead of re-reading the live `batches.priceRange`) means the entry remains reproducible even if the batch range is later edited. The `vendorBills.discrepancyNotes` append is an explicit override of the prior `saleLineCostExceptions.ts` "do not touch vendor bills" note, which was written before Evan approved this AP-visibility behavior on 2026-05-21. Using `FOR UPDATE SKIP LOCKED` (rather than plain `FOR UPDATE`) matches the read-modify-write locking discipline used for customers and batches elsewhere in `postSalesOrder` while preventing deadlocks across concurrent orders sharing a vendor bill.
**Example:** `src/server/services/commandBus.ts` (postSalesOrder exception-journal loop after `update(salesOrders)`; `reverseCommandById` postSalesOrder branch correction-journal reversal loop).
**Author:** OpenCode via Evan
**Related:** Issue #64; PR-1 (#137), PR-2 (#151); Issue #150 (snapshotByAffectedIds pool-vs-tx capture gap noted in reversal comment); Issue #154 (pre-existing test regex mismatch — separately addressed by upstream PR #141 / commit b78a786); migration baseline 0049 — no new migration for PR-3.

## 2026-05-22 — ReceiptPanel widened to four kinds (Phase 4: money receipts)

The `ReceiptPanel` discriminated union now accepts `'purchase_order' | 'sales_order' | 'payment' | 'vendor_payment'`. Payment and vendor_payment kinds are wired in `PaymentsView` (after `PaymentAllocationTools`, gated on a selected payment row) and `VendorBillTools` (after the payouts table, gated on `chosenPaymentId`). Body now hides the lines table when `projection.lines` is empty (money receipts carry no line items). Internal-notes section renamed to "Internal reconciliation notes". See Phase 4 plan.

---

## 2026-05-21 — ReceiptPanel `kind` discriminator + Sales/Invoice wiring (#113 Phase 3)

**Widened component:** `src/client/components/ReceiptPanel.tsx` now accepts a discriminated `kind` prop (`'purchase_order'` | `'sales_order'`). Backward compatible — existing `<ReceiptPanel purchaseOrderId={...} />` call sites keep working because `kind` defaults to `'purchase_order'`.

**Convention:** When a panel must dispatch between two parallel tRPC endpoints, prefer a discriminated-union prop type + `enabled: false` on the inactive hooks over conditional rendering of two near-identical panels.

**Convention:** Sales receipt procedures resolve "invoice wins over confirmation" inside the procedure. The panel just renders whatever is returned.

**Convention:** `ReceiptPanel` renders inside the Sale Builder WorkspacePanel in `SalesView` for `confirmed`, `posted`, and `fulfilled` statuses.

---

## 2026-05-21: Accessibility conventions for interactive components
**Decision:** Establish five accessibility patterns for icon-only buttons, bare `<select>` elements, sidenav current-page semantics, dialog accessible names, and disclosure toggles. All five were introduced in PRs #135 and #136 but were not recorded at merge time.

**Rationale:**
1. **Icon-only button accessible name** — `aria-label` (not `title`) provides the accessible name and must include an action verb so screen-reader users know what the control does.
2. **Bare `<select>` accessible name** — when no visible `<label>` is present, `aria-label` on the `<select>` itself is required for screen readers to announce the control's purpose.
3. **Sidenav current-page semantics** — `aria-current="page"` on the active nav item lets screen readers announce the current location; inactive items must use `undefined` (not `false`) so the attribute is omitted entirely.
4. **Dialog accessible name** — `aria-labelledby` must reference a co-located `<h2>` id inside the same component, giving the dialog a programmatic name tied to its visible title.
5. **Disclosure toggle state** — `aria-expanded` bound to the controlling state variable lets assistive tech announce whether the controlled region is open or closed.

**Example:**
- Icon-only button: `src/client/components/OperatorGrid.tsx:295` (`aria-label="Remove {field}:{value} filter"`)
- Bare select: `src/client/components/SavedFiltersDropdown.tsx:17` (`aria-label="Load saved filter"`)
- Sidenav current page: `src/client/components/Shell.tsx:137` (`aria-current={isActive ? "page" : undefined}`)
- Dialog name: `src/client/components/VoidRefereeCreditDialog.tsx:43` (`aria-labelledby="vrc-title"` paired with `<h2 id="vrc-title">`)
- Disclosure toggle: `src/client/components/QuickLedgerGrid.tsx:264` (`aria-expanded={!hidden}`); `src/client/components/CommandPalette.tsx:218` (`aria-expanded={advancedOpen}`)

**Author:** OpenCode via Evan
**Related:** `PR #135`, `PR #136`, `Issue #140`

---

## 2026-05-21: Below-range COGS exception chip shared by PricingPanel + SalesView (#64 PR-2)
**Decision:** Below-range `setLineLandedCost` exceptions (PR-1) are surfaced to operators via a shared `LandedCostExceptionChip` component + matching AG Grid `LandedCostExceptionCellRenderer`. Both reuse the existing `.selection-pill.warning` (amber border / amber/10 fill / amber text) — no new colors. The operator-vocabulary reason labels (`keep_margin`, `waive_margin`, `take_loss`, `vendor_approval_pending`, `renegotiate`) live in the chip module as `LANDED_COST_EXCEPTION_REASON_LABELS` and are imported by `PricingPanel` so the picker and the projected-state chip share a single vocabulary source. The chip data comes from a server-side projection (`projectLandedCostException`) over the latest successful `setLineLandedCost` command journal `result.delta.exceptionReason`, attached via a LATERAL join in `salesOrderLines` and a GIN array-contains lookup on `command_journal.affected_ids` (migration 0043). The `landedCostExceptionReason` column is gated behind the existing `showMargin` toggle (added to `MARGIN_COLUMN_FIELDS`) to prevent vendor/COGS relationship state from leaking during customer screen-share.
**Rationale:** PR-2 is vendor-UX only — no DB schema change, no PO/vendor-bill/accounting writes (those land in PR-3). The command-journal projection lets the operator see `vendor_approval_pending` and other below-range exceptions on the very next page render without touching the existing line table. Sharing the chip across `OrderPricingPanel` and the Customer Draft Lines grid keeps the warning vocabulary consistent across both surfaces.
**Example:** `src/client/components/LandedCostExceptionChip.tsx`, `src/server/projections/landedCostException.ts`, `src/server/projections/landedCostExceptionSql.ts`, `src/server/routers/queries.ts` `salesOrderLines`, `src/client/views/SalesView.tsx` lineColumns `COGS exception` column.
**Author:** OpenCode via Evan
**Related:** Issue #64 PR-2; reconciles PR #144 (kebab-case) onto snake_case vocab from PRs #137 and #145. `exceptionReason` in `setLineLandedCostPayloadSchema` is `z.enum(BELOW_FLOOR_REASONS)` (snake_case).

## 2026-05-21 — ReceiptPreviewDrawer + intake UX improvements (TER-1529)

### ReceiptPreviewDrawer component
New component in `src/client/components/ReceiptPreviewDrawer.tsx`. Uses existing `.context-drawer context-drawer-standard` CSS classes (already defined in `styles.css`) for consistent 420px width and 180ms slide transition. Does NOT use the full `ContextDrawer` entity/tab system — the receipt preview is a single-purpose, no-tab panel that should stay open while the operator works batch rows. A full ContextDrawer integration would add unnecessary entity routing and tab management overhead.

### Batch line-item action set change
BatchRowActions now offers: Verify / Reject / Add note / Market name. Removed Flag (was rarely used) and Delete draft (too destructive next to Verify). Deletion remains accessible via the command palette.

### AG Grid header text wrap
Added `wrapHeaderText: true` + `autoHeaderHeight: true` to OperatorGrid defaultColDef and CSS `white-space: normal` to `.ag-theme-quartz .ag-header-cell-label`. Reduces horizontal column width for multi-word headers across all operator grids.

### "Market name" label standard
`itemAlias` field displays as "Market name" in all operator-facing surfaces (intake, inventory, operations). In customer-facing surfaces (SalesView, CustomerPurchaseHistoryPanel) it displays as "Product name". Field name `itemAlias` is unchanged in code.

---

## 2026-05-20: Sales sheet/catalog export filenames use `terp-operator-*` prefix
**Decision:** Sales sheet and catalog CSV export filenames in `src/client/views/SalesView.tsx` now use the `terp-operator-*` prefix (e.g. `terp-operator-sales-sheet.csv`, `terp-operator-sales-catalog.csv`, `terp-operator-customer-offer.csv`) instead of the historical `terp-agro-*` prefix. The `OperatorGrid.csvExport.ts` filename helper already uses `terp-operator-*`.
**Rationale:** The product canonical name is TERP Operator. Aligning export filenames with the current branding reduces confusion for downstream consumers and prevents import scripts from breaking when they expect the new prefix.
**Example:** `src/client/views/SalesView.tsx` (link.download assignments); `src/client/components/OperatorGrid.csvExport.ts`.
**Author:** OpenCode via Evan
**Related:** TERP Operator canonical identity; downstream consumer/import scripts should be communicated this change.

---

## 2026-05-20: Sale-line exception controls move from window.prompt to inline form; hide-margin posture hides cost-revealing UI
**Decision:** Introduce `src/client/components/SaleLineExceptionControls.tsx` to host the inline form for the `setLineLandedCost` / `setLineBelowFloorReason` / `resolveVendorApproval` commands inside the sale-line expansion row. The component reuses `BELOW_FLOOR_REASONS` and `LANDED_COST_BASIS_VALUES` from `src/shared/saleLineCostExceptions.ts` so prompt copy and server validation stay in lockstep. The whole strip — plus the "Range / Exceptions" badge column — is gated by the current `showMargin` value so a customer-facing screen-share posture cannot leak cost, floor, or vendor-approval context. Persistence behavior remains the existing #63 contract (`showMargin` is persisted via zustand `persist`).
**Rationale:** The previous `window.prompt` chain was hostile to keyboard-only operators, untestable in jsdom, and revealed cost context (range labels, basis vocabulary) even when the operator had toggled hide-margin. Splitting the action surface into its own component keeps `SalesView` lean and lets `showMargin` gate the entire strip with a single early return.
**Example:** `src/client/components/SaleLineExceptionControls.tsx`, `src/client/views/SalesView.tsx`.
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #60–#64; reviewer fix to skeptical frontend/system quality pass.

---

## 2026-05-20: Customer sheet snapshot reads are scoped + viewer-safe + re-sanitized
**Decision:** `queries.customerSheetSnapshotById` now requires both `id` and `customerId`, filters on both, and routes the row through a new `getViewerSafeSnapshot(snapshot, role)` helper in `src/shared/customerSheetSnapshot.ts`. The helper returns null when a `viewer`-role user requests an `internal` (operator) snapshot and re-runs `buildCustomerSheetSnapshotRows` on the way out so even historically-polluted `rows_json` cannot leak cost or margin to catalog reads.
**Rationale:** The previous endpoint accepted only `id`, which let any signed-in caller open any customer's snapshot — including internal-mode snapshots whose `rows_json` may carry cost/margin from older or hand-edited writes. Read-side privacy must not depend on the write-side sanitizer being perfect.
**Example:** `src/server/routers/queries.ts` (customerSheetSnapshotById), `src/shared/customerSheetSnapshot.ts` (`getViewerSafeSnapshot`).
**Author:** Claude Opus 4.7 via Evan
**Related:** Issues #62, #63.

---

## 2026-05-20: Finalization receipt workspaces use shared document renderer primitives and internal/external view labeling
**Decision:** Finalization receipt workspaces (PO vendor receipt, Sales customer confirmation, later payment/payout receipts) will be built on a shared `document_snapshots` table with per-type pure projection modules. The UI will use common receipt renderer primitives and explicit internal/external view labeling. External projection is server-side allowlisted; the client never hides internal fields via CSS or conditional rendering.
**Rationale:** A shared foundation prevents N per-domain receipt tables and fragmented security models. Server-side projection guarantees that a client bug or malicious request cannot expose `unitCost`, `internalMargin`, or `internalNotes` to vendors/customers. Internal/external labeling in the UI makes the boundary obvious to operators and supports the required `INTERNAL — DO NOT SEND` watermark on copy/print.
**Example:** `document_snapshots` table design, `poProjection.ts` module contract (`EXTERNAL_FIELDS`, `projectExternal`), receipt preview components inside `PurchaseOrdersView`. `SalesView` receipt integration is planned but not yet implemented.
**Author:** OpenCode documentation worker via Evan
**Related:** `docs/roadmap/2026-finalization-receipts-roadmap.md`, GitHub issue #113

---

## 2026-05-20: Photography MediaDetailPanel wires media lifecycle commands
**Decision:** The Photography route uses a dedicated `MediaDetailPanel` under the queue grid to show per-batch media rows and expose set-primary, publish, delete, and mobile-upload handoff actions through existing `useCommandRunner` and tRPC query patterns.
**Rationale:** Completing the feature required first-class UI for backend media commands instead of leaving curation in CommandPalette/JSON; panel keeps batch aggregate queue and per-media lifecycle in one operator workspace while preserving authenticated mobile upload route.
**Example:** `src/client/components/MediaDetailPanel.tsx`, `src/client/views/MediaView.tsx`
**Author:** `OpenCode PM + Claude/AQA via Evan`
**Related:** `PR #65`, `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md`

---

## 2026-05-26: Crikket feedback capture mounts as a root utility
**Decision:** Mount the Crikket capture widget from the TERP root shell after login, using a vendored browser bundle, `/api/client-config` runtime settings, Vite local fallbacks, and CSP allowances for the configured Crikket host plus direct upload storage instead of adding the unpublished workspace package as an app dependency.
**Rationale:** User-testing feedback should be one click inside TERP without requiring the Chrome extension flow. The Crikket npm package currently depends on workspace packages from its monorepo, while the built global browser bundle is stable for local operator testing and can be pointed at the hosted Crikket server. Runtime config avoids Docker/Vite build-time env drift in DigitalOcean.
**Example:** `src/client/components/FeedbackCapture.tsx`, `src/server/app.ts`, `public/vendor/crikket/capture.global.js`.
**Author:** Codex via Evan
**Related:** `docs/agent-orientation/feedback-capture.md`.

---

## 2026-05-27: Crikket launcher defaults to top-left
**Decision:** Add `VITE_CRIKKET_POSITION` and default the Crikket launcher to `top-left`, applied from `FeedbackCapture.tsx` after the Crikket SDK mounts.
**Rationale:** Agentation occupies the bottom-right corner during user testing, and Crikket's public SDK init options expose z-index but not launcher placement. A runtime-configured shadow-root style override keeps the hosted widget usable without editing the vendored SDK bundle.
**Example:** `src/client/components/FeedbackCapture.tsx`, `src/server/env.ts`, `src/server/app.ts`.
**Author:** Codex via Evan
**Related:** `docs/agent-orientation/feedback-capture.md`.

---

## 2026-05-18: Documentation grounded in actual codebase, not aspirational spec
**Decision:** When the original 2026-05-18 spec for the agent-orientation/design-system docs referenced files and structures that didn't exist (a `Button` component, `ui/`/`grids/`/`forms/`/`layout/` subfolders, `@/` path aliases, `cn()` helper, `IntakeToolbar` / `StatusCellRenderer` / `CurrencyCellRenderer` components, raw TanStack mutation patterns), the docs were rewritten from the actual codebase rather than transcribed from the spec.
**Rationale:** Documentation that misrepresents the codebase is worse than no documentation — it teaches agents to write code that doesn't compile (`@/lib/utils`) or that bypasses the audit/journal contract (raw `useMutation` instead of `useCommandRunner`). The spec's value was its structural outline (which docs to write, what topics each should cover). The code is the source of truth for content.
**Example:** `docs/agent-orientation/*.md`, `docs/design-system/*.md` (all rewritten from `src/client/`, `src/server/`, `src/shared/`, `package.json`, `tailwind.config.ts`, `tsconfig.json` reads).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/patterns/extracted-2026-05-18.md` (pattern extraction report that surfaced the spec/reality gap).

---

## 2026-05-18: Hybrid styling — Tailwind utilities + semantic classes via @apply
**Decision:** Continue the existing pattern: Tailwind v3 utility layer with custom theme tokens (`ink`, `panel`, `field`, `line`, `accent`, `amber`, `danger`) underneath ~209 semantic CSS classes in `src/client/styles.css` composed with `@apply`. Components reach for semantic classes (`primary-button`, `field-inline`, `control-band`, `view-stack`) for vocabulary nouns, and Tailwind utilities for one-off layout glue.
**Rationale:** Pure Tailwind would mean re-writing the same 5+ utility chain across the codebase for common shapes (buttons, toolbars, view stacks). Pure semantic CSS would mean rebuilding the utility flexibility Tailwind already provides. The hybrid lets vocabulary stay short and consistent, while leaving Tailwind utilities for the long tail.
**Example:** `src/client/styles.css` (`.primary-button`, `.field-inline`, `.control-band`, etc.); `tailwind.config.ts` for the token palette.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/styling-guide.md`.

---

## 2026-05-18: useCommandRunner is the only mutation contract for business state
**Decision:** All state-changing operations on business data (intake, orders, payments, batches, vendors, fulfillment, etc.) must route through `useCommandRunner.runCommand(name, payload, reason)`. Direct `trpc.<router>.<endpoint>.useMutation` is reserved for auth (`trpc.auth.login.useMutation` in `LoginView.tsx`) and a tiny set of bookkeeping operations.
**Rationale:** `useCommandRunner` stamps the idempotency key, invokes `trpc.commands.run` which dispatches to the server-side command handler, writes the DB + JSONL command journal, broadcasts a Socket.io event, pushes the success/error toast, and invalidates all cached queries. Bypassing this hook bypasses the audit + reversibility contract that the entire product is built on.
**Example:** `src/client/components/useCommandRunner.ts` (27 lines, the contract); `RefereeRelationshipDialog.tsx`, `IntakeView.tsx`, `OperatorGrid.tsx`'s `onCellCommit` consumer pattern.
**Author:** Claude Opus 4.7 via Evan
**Related:** Audit #23 (idempotency-key payload binding gap), audit #13 (Socket.io auth gap), `docs/design-system/state-patterns.md`.

---

## 2026-05-18: One Zustand store (useUiStore), not many
**Decision:** All UI state shared across components lives in a single `useUiStore` at `src/client/store/uiStore.ts`. Do not create additional Zustand stores.
**Rationale:** A single store keeps the UI state surface auditable and lets the `persist` middleware partialize a single shape. Multiple stores would fragment the persisted state and obscure where to look for cross-cutting state (drawer state, palette state, route history, toasts).
**Example:** `src/client/store/uiStore.ts` (~350 lines, ~30 state fields + actions, `persist` + `immer`).
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/design-system/state-patterns.md`.

---

## 2026-05-18: Initial design system documentation created
**Decision:** Establish a living documentation system under `docs/agent-orientation/` and `docs/design-system/` to reduce Evan's per-prompt context overhead and prevent frontend drift.
**Rationale:** Repeating architectural patterns, component locations, styling conventions, and state-management approaches in every agent prompt wastes Evan's time and produces inconsistent results. Living docs that agents read at session start solve this without ongoing manual effort.
**Example:** `docs/agent-orientation/START_HERE.md`, `docs/design-system/INDEX.md`.
**Author:** Claude Opus 4.7 via Evan
**Related:** `docs/superpowers/specs/2026-05-18-agent-orientation-design-system-design.md` (original spec), `docs/superpowers/plans/2026-05-18-agent-orientation-design-system.md` (implementation plan).

---

## 2026-05-21: Finalization receipts Tranche 1 — document_snapshots foundation (#113)
**Decision:** Establish a `document_snapshots` table with a per-`document_type` pure-projection architecture. PO finalization writes a `purchase_order` snapshot (internal + server-generated external payload). A tRPC router exposes role-gated endpoints: viewers get finalized-only minimized external shapes; operator+ gets internal payloads and draft-preview paths. `ReceiptPreview` renders via React portal to `document.body` for correct print-stylesheet behavior.
**Key invariants locked:**
- One active row per `(document_type, subject_id)` enforced by partial unique index.
- `documentSnapshots` is excluded from `snapshotByAffectedIds` tablePairs and snapshot UUIDs never enter `affectedIds` — command-history leak guard.
- Finalize consumes an active draft IN PLACE (same row id, status flips); no `superseded` row on Tranche 1 normal paths.
- `EXTERNAL_FIELDS` allowlist pinned in `poProjection.ts` with inline-snapshot change-control test; any allowlist change MUST bump `PROJECTION_VERSION` in the same commit.
- Viewer callers never receive `includeDrafts=true` results; the router throws FORBIDDEN.
**Files:** `migrations/0047_document_snapshots.sql`, `src/shared/documentSnapshots.ts`, `src/server/services/documentSnapshots/` (poInternalBuilder, poProjection, index, snapshotService), `src/server/routers/documentSnapshots.ts`, `src/client/components/ReceiptPreview.tsx`, CSS in `styles.css`, wiring in `commandBus.ts` + `OperationsViews.tsx`.
**Author:** Claude Sonnet 4.6 / Opus 4.7 via Evan (subagent-driven parallel waves)
**Related:** `docs/roadmap/2026-finalization-receipts-roadmap.md`, `docs/superpowers/plans/2026-05-20-finalization-receipts-tranche-1.md`, GitHub #113.

---

## 2026-05-21 — ReceiptPanel + server-rendered Signal text (#113 Phase 2)

**New component:** `src/client/components/ReceiptPanel.tsx` — read-only finalization receipt viewer with `external` / `internal` tabs, an "INTERNAL — DO NOT SEND" marker on the internal tab, and a "Copy for Signal" affordance on the external tab. Used in `OperationsViews.PurchaseOrdersView` under the PO header strip whenever the selected PO is at or past `finalized` status.

**Convention:** The signal-text renderer (`renderSignalText` in `src/server/services/documentSnapshots.ts`) is exposed via a dedicated tRPC query `queries.purchaseOrderSignalText` rather than imported into the client. Rationale: `documentSnapshots.ts` imports server-only `pg` and rbac code; copying the renderer into a shared module expands surface area unnecessarily. The tRPC indirection keeps the renderer in one place and lets us extend it (formatting, locale, watermark) without client redeploys.

**Convention:** Role-gated tRPC procedures should let the underlying service throw `TRPCError(FORBIDDEN)` via `assertRole(...)` rather than gating in the procedure body. `queries.purchaseOrderInternalReceipt` follows this pattern by passing `ctx.user` directly into `getInternalReceipt`. Single source of truth for the gate.

## 2026-05-22: PO authoring UX — notes consolidation, record-prepayment relocation, status filter presets (TER-1528)

**Decision 1:** Rename `buyerNotes` column header from "Buyer notes" to "Internal notes". Rename `internalNotes` column header to "Internal notes (ops)". Update authoring form labels to match.
**Rationale:** "Buyer notes" implied vendor-facing content. Both fields are internal. Using distinct labels avoids confusion while preserving separate DB columns.

**Decision 2:** Move "Record Prepayment" button from the top toolbar into the per-row expansion panel (alongside Draft intake / Unfinalize / Cancel draft PO).
**Rationale:** The toolbar button was confusing as a headline action — it only applied to one selected row and its enabled state depended on row-level data (prepaymentAmount > 0, status = approved). Row-level actions belong in the row expansion, not the global toolbar.

**Decision 3:** Add status filter preset buttons (Active / Ordered / Finalized) to the PO table toolbar.
**Rationale:** Operators frequently need to scope the PO list by workflow phase. Typed `status:` filter syntax is available but not obvious. Preset toggle buttons make the three most common views one click away. Buttons use `aria-pressed` and live outside the `canWrite` gate (filtering is a read-only operation).

**Files:** `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1528, PR #156, PR #158.

---

## 2026-05-22: PO authoring — remove permanent vendor-context aside, use VendorContextDrawer on demand (TER-1530)

**Decision:** Remove the permanent 320px `aside.po-context-panel` from the PO authoring workspace. The `VendorContextDrawer` (triggered by the "Context" button) already covers all of the aside's content (vendor facts, quick adds, historical POs tabs).

**Rationale:** The aside forced a two-column layout at all widths and presented the same data twice. The on-demand drawer pattern is consistent with the rest of the app and recovers screen real estate for the authoring form and PO lines grid.

**Convention:** When a permanent panel and an on-demand drawer cover the same content, prefer the drawer. Keep the trigger button visible and discoverable (next to related controls). Never silently remove functionality — ensure the drawer covers everything the panel did.

**Files:** `src/client/views/OperationsViews.tsx`, `src/client/styles.css` (removed `.po-authoring-layout`, `.po-authoring-main`, `.po-context-list`, `.po-context-row`)
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1530, PR #158.

---

## 2026-05-22: PO authoring — AddRefereeRelationshipDrawer (TER-1532)

**New component:** `src/client/components/AddRefereeRelationshipDrawer.tsx` — 440px fixed slide-in drawer for creating a referee credit relationship inline from PO authoring. Triggered by an "Add referee" button next to the referee credit select.

**Decision:** Use a two-mode design (Use existing referee / Create new referee) with a shared fee structure section, rather than a separate creation flow.
**Rationale:** Operators frequently need to assign a referee they don't yet have in the system. Making this possible without navigating to /referees reduces context switches during PO authoring.

**Orphan safety pattern:** After `createReferee` succeeds but before `addRefereeRelationship` succeeds, the component enters a "retry" state: `pendingRefereeId` is set, the newly created referee is appended to `localReferees`, the mode flips to "existing", and a recovery banner explains the situation. On retry, step 1 (createReferee) is skipped — no duplicate created. The "Create new referee" tab is disabled during retry.

**Convention:** Any two-command sequence where step 1 creates a record and step 2 links it should track `pendingFirstStepId` in component state and skip step 1 on retry if the ID is already set.

**Files:** `src/client/components/AddRefereeRelationshipDrawer.tsx`, `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1532, PR #161.

---

## 2026-05-22: Photography — MediaBatchDrawer replaces bottom Batch Media panel (TER-1537)

**New component:** `src/client/components/MediaBatchDrawer.tsx` — 480px push side drawer (no overlay) that replaces the `MediaDetailPanel` bottom panel on `/photography`.

**Decision:** Use a push-style side drawer (grid shrinks via flex) rather than an overlay drawer.
**Rationale:** The photography queue and batch media are companion views — operators need to see both simultaneously. An overlay would hide the queue. The push pattern mirrors how detail panels work in other grid-plus-detail surfaces in the app.

**Decision:** Desktop file upload uses XHR (`XMLHttpRequest`) with `upload.onprogress` rather than `fetch`.
**Rationale:** `fetch` does not expose upload progress events. XHR is required for per-file progress bars on upload.

**Upload XHR contract:**
- `batchId` must be appended to FormData BEFORE `file` — the server's multer `destination` callback reads `req.body.batchId` synchronously while parsing the multipart stream. Order matters.
- Non-2xx responses and `onerror` must surface to the user via the upload progress state — never silently swallow.
- Progress caps at 90% during XHR upload; the final 10% resolves after the `uploadBatchMedia` command succeeds.

**Files:** `src/client/components/MediaBatchDrawer.tsx`, `src/client/views/MediaView.tsx`, `src/client/styles.css` (new `.media-batch-drawer*`, `.media-upload-zone*`, `.media-upload-progress` classes). `MediaDetailPanel.tsx` and `MediaDetailPanel.test.tsx` deleted.
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1537, PR #168.

---

## 2026-05-22: Finalization receipts Phase 4 — customer_payment and vendor_payout projections (TER-1534)

**New modules:**
- `src/server/services/projections/customerPaymentProjection.ts` — external allowlist for customer payment receipts (7 fields: kind, paymentDate, amount, method, reference, customerName, notes). Blocks: customerId, direction, category, allocationIntent, status.
- `src/server/services/projections/vendorPayoutProjection.ts` — external allowlist for vendor payout receipts (8 fields). Blocks: vendorId, vendorBillId, purchaseOrderId, status.

**Convention:** External projection allowlists use `as const satisfies readonly string[]` for compile-time enforcement. Tests must cover both directions: (1) only expected keys are present, (2) each prohibited key is explicitly absent (`toBeUndefined()`).

**Post-commit hook placement:** `createPaymentReceivedReceipts` and `createVendorPayoutReceipts` run as best-effort post-commit hooks after `logPayment` and `recordVendorPayment`. Failure is non-fatal (try/catch + console.warn). The hooks run on the raw `pool` (not inside the command's Drizzle tx) because the pg-native advisory-lock pattern in `finalizeSnapshot` requires its own `BEGIN/COMMIT`.

**Known gap:** The snapshot functions share the command transaction's connection when called inside `tx`. A Postgres-level error inside the snapshot call puts the transaction into aborted state, potentially rolling back the parent command despite the JS try/catch. Tracked for future savepoint mitigation.

**Files:** `src/server/services/projections/customerPaymentProjection.ts`, `vendorPayoutProjection.ts`, `src/server/services/commandBus.ts`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1534, PR #180.

---

## 2026-05-22: Finalization receipts — print HTML, watermark hardening, seed guarantee (TER-1535)

**Decision 1:** Replace `<pre className="receipt-preview-body">` with `<div className="receipt-preview-body-html">` using `white-space: pre-wrap` and page font (not monospace).
**Rationale:** Receipt text is prose sentences, not column-aligned tabular output. Proportional fonts render correctly and print better. Monospace was a holdover from early prototyping.

**Decision 2:** Internal watermark ("INTERNAL — DO NOT SEND") is always in the DOM, toggled via `className={mode === 'internal' ? 'selection-pill danger' : 'hidden'}` rather than conditional rendering.
**Rationale:** Print CSS targets `[data-testid="internal-watermark"]` — conditional rendering would make the element unavailable to the print stylesheet in the window between React re-render and `window.print()`. Always-in-DOM with `display:none` is safe because `aria-live` regions are suppressed on hidden elements.

**Critical print CSS rule:** The watermark print rule MUST use `:not(.hidden)` to avoid showing the watermark on external-mode prints:
```css
body.print-receipt-only [data-testid="internal-watermark"]:not(.hidden) {
  display: block !important; ...
}
```
Without `:not(.hidden)`, `!important` overrides the `hidden` class and the watermark bleeds onto external receipts.

**Decision 3:** The dev seed includes a finalized PO (`PO-DEMO-003`) with a seeded `document_snapshots` row so E2E receipt-preview tests run unconditionally. Uses `createPoFinalizationReceipts(pool, ...)` — not a Drizzle transaction, because the pg advisory-lock pattern requires its own BEGIN/COMMIT.

**Files:** `src/client/components/ReceiptPreview.tsx`, `src/client/styles.css`, `tests/e2e/receipt-preview.spec.ts`, `src/server/seed.ts`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1535, PRs #179, #183, #184.

## 2026-05-26: Phase 7 Wave 3D — Feature Flag Audit (TER-1604)

**Decision:** Feature flag audit completed. One product feature flag and three infrastructure env vars found.

| Flag / Var | Location | Classification | Disposition |
|------------|----------|----------------|-------------|
| `VITE_CANVAS_GRAMMAR_ENABLED` | `src/client/App.tsx:55` | **Product feature flag** — Default-on. Controls whether the canvas grammar shell is active. | **Keep as documented escape hatch.** The canvas grammar (CAP-007/CAP-008) is stable and shipped in all views. The flag exists to allow operators to revert to the pre-canvas shell if a regression surfaces. Removing it would require a full shell revert, which is low-risk but unnecessary. Document: set `VITE_CANVAS_GRAMMAR_ENABLED=false` in `.env` to disable. |
| `VITE_TRPC_URL` | `src/client/api/trpc.ts:13` | Infrastructure config — tRPC endpoint URL | Not a feature flag. Default `/trpc` is correct for all deployments. Override only for custom reverse proxy path prefix. |
| `VITE_SOCKET_URL` | `src/client/App.tsx:96` | Infrastructure config — Socket.IO server URL | Not a feature flag. Default `/` is correct. Override only for separate WebSocket host. |
| `VITE_AG_GRID_LICENSE_KEY` | `src/client/main.tsx:19,56` | Infrastructure config — AG Grid Enterprise license | Not a feature flag. Required for production; missing key shows AG Grid watermark. |

**No dead-code feature flags found.** The codebase does not use `process.env.REACT_APP_*` or `FEATURE_*` patterns.

**Files:** `src/client/App.tsx`, `src/client/api/trpc.ts`, `src/client/main.tsx` (audit only, no code changes)
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1604, Wave 3D Phase 7 hardening.

---

## 2026-05-26: Phase 7 Wave 3D — Keyboard accessibility fixes (TER-1600)

Fixes applied from `docs/roadmap/phase7-keyboard-a11y-audit.md` blocking gaps K1–K3 and accessibility gap A4/A9.

**K1 + A4 — ContextDrawer focus trap and dialog role:**
- Added `useFocusTrap(drawerOpen, closeDrawer)` to `ContextDrawer`. The `drawerRef` is attached to the `<aside>` element when the drawer is open.
- Added `role="dialog"` and `aria-modal="true"` to the open drawer `<aside>` so screen readers know a modal-like context panel is active. Matches the `VendorContextDrawer` gold standard.
- The global Escape handler in `Hotkeys.tsx` already closes the drawer; `useFocusTrap` adds Tab trapping to prevent keyboard bleed into the background AG Grid.

**K2 — RowCommandHistoryDrawer focus trap:**
- Added `useFocusTrap(Boolean(row), onClose)` to `RowCommandHistoryDrawer`. The `drawerRef` is attached to the `<aside className="row-history-drawer">` element.
- Pattern is identical to `AddRefereeRelationshipDrawer`. Escape closes the drawer.

**K3 + A9 — RecoveryView admin tools label association:**
- Added explicit `id` attributes (`recovery-period`, `recovery-amount`, `recovery-memo`) to the three inputs in the correction journal entry band.
- Added matching `htmlFor` on each `<label>` element. Previously, the `field-inline` CSS class provided visual containment but no programmatic label association.

**Major/minor gaps not addressed in this wave (tracked, not silently ignored):**
- K4: VendorContextDrawer focus trap — deferred; VendorContextDrawer has `role="dialog"` but no trap. Filed as known gap for next keyboard wave.
- K5: ReceiptPreviewDrawer focus trap — deferred.
- K6: QuickLedgerGrid transaction type drawer — deferred.
- K7: PaymentsView allocation workflow label association — deferred.
- K8: FulfillmentView alerts drawer — deferred.
- K9–K12: Minor gaps — deferred.
- A1–A11 (except A4, A9 fixed above): Accessibility gaps — deferred for dedicated a11y pass.

**Files:** `src/client/components/ContextDrawer.tsx`, `src/client/components/RowCommandHistoryDrawer.tsx`, `src/client/views/OperationsViews.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1600, `docs/roadmap/phase7-keyboard-a11y-audit.md`, Wave 3D Phase 7 hardening.

---

## 2026-05-26: Phase 7 Wave 3D — Drawer/focus state persistence per route (TER-1601)

**Decision:** URL query param approach for drawer state persistence.

**Approach:** Added `src/client/hooks/useDrawerUrlSync.ts`. The hook is called inside `ContextDrawer` (which already has access to `activeView`, drawer state, and active entity). It:
1. On mount: reads `?drawer=<state>&entityType=<type>&entityId=<id>` URL params and restores drawer state + entity if valid params are present.
2. On drawer state change: writes current params to URL with `replace: true` (no history spam).

This means:
- Navigating Back in the browser restores the drawer state for the previous view (URL params survive history navigation).
- Refreshing the page restores drawer state (URL params survive reload).
- Opening a shared URL with `?drawer=standard&entityType=salesOrder&entityId=xxx` opens the correct drawer context.

**Why URL params over Zustand persist:**
- `drawerByView` is already persisted via Zustand (drawer open/closed state per entity). What was missing was `activeDrawerEntityByView` (which entity is active per view), which is intentionally NOT persisted for security (entity UUIDs would leak between operators on shared workstations before auth resolves).
- URL params are visible only in the current browser tab session and are cleared when the user closes the tab. They do not persist to localStorage.
- URL params are explicit — the state is observable and debuggable.

**Security note:** Entity IDs in URL params are auth-gated at the data layer. Viewing the URL gives you the UUID, not the data. The existing `resetSession()` on logout clears in-memory state; the URL will show stale params until the next navigation, at which point the server auth check gates data access.

**Files:** `src/client/hooks/useDrawerUrlSync.ts` (new), `src/client/components/ContextDrawer.tsx`
**Author:** Claude Sonnet 4.6 / Sonnet 4.6 build agent via Evan
**Related:** TER-1601, Wave 3D Phase 7 hardening.

---

[Future decisions append above this line, in reverse chronological order.]

---

## 2026-05-22: CAP-030 — pick-status chip color mapping (TER-1508)

**Decision:** Use a five-state color scheme for pick-status chips in `SalesView`: gray `unreleased`, blue `released`, amber `picking`, green `picked`, red `recall_pending`.
**Rationale:** Colors map to operator urgency. Gray = no action needed. Blue = released and awaiting warehouse. Amber = in motion. Green = complete. Red = warehouse problem, operator action required.
**Implementation:** `PickStatusChip` function at the bottom of `SalesView.tsx` returns a `<span className="selection-pill ...">` with `data-pick-status` attribute for CSS targeting.
**Files:** `src/client/views/SalesView.tsx`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508, PR #190.

---

## 2026-05-22: CAP-030 — expansion-panel Remove gate for released lines (TER-1508)

**Decision:** The per-row expansion panel Remove button must gate through `setPendingLineEdit` when the line's `pickStatus` is `released` or `picking`, identical to the selection-bar Remove path.
**Rationale:** Warehouse has claimed the line. Removing without notification leaves the picker with no work and a dangling fulfillment record. Both removal paths (expansion panel AND selection bar) must invoke the same confirmation modal, which triggers the warehouse alert on confirm.
**Convention:** Any action that modifies a line with `pickStatus` in `['released', 'picking']` must go through `pendingLineEdit` — not `runCommand` directly. This applies to both the expansion panel and selection bar. Test QA finding caught this gap in the expansion panel path.
**Files:** `src/client/views/SalesView.tsx` — `salesLineExpansionConfig.actionsRenderer`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1508, PR #190, QA finding fix.

---

## 2026-05-22: CAP-030 — non-persisted pick queue filter slice in uiStore (TER-1510)

**Decision:** `pickQueueFilters: Set<string>` is stored in `uiStore` but intentionally excluded from the `partialize` whitelist. Filter state resets to empty on page reload.
**Rationale:** Pick queue filters are session-context (what the manager is looking at right now). Persisting them across sessions would surface stale chips on reload and make it unclear why data is filtered. Unlike column layout prefs (`gridColumnPrefs`), queue filter chips are transient work state.
**Convention:** Operator session state that should NOT survive reload goes in uiStore WITHOUT being added to `partialize`. Query/search/filter state is usually non-persistent unless explicitly scoped to user preferences.
**Files:** `src/client/store/uiStore.ts`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1510, PR #190.

---

## 2026-05-22: CAP-030 — PickView mobile-first layout (TER-1513)

**Decision:** PickView uses Tailwind only (no AG Grid), touch-sized inputs (`minHeight: 56px` for primary actions, 44px minimum everywhere), and a three-screen push-navigation pattern (QueueScreen → PickListScreen → PickLineScreen) driven by component state rather than URL params.
**Rationale:** AG Grid is the wrong tool for a warehouse flow on a phone. Touch targets need to be large. URL-param navigation adds latency and history complexity for a sequential workflow (queue item → list → line → back).
**BarcodeDetector:** `typeof window.BarcodeDetector !== 'undefined'` in `useEffect` sets `barcodeSupported` state. Manual entry is always visible. Scan button renders in both states (shows `—` when unsupported). Never hide the fallback.
**Alert interrupt:** Must use `role="alertdialog"`, `aria-modal="true"`. Must NOT be dismissable by Escape or click-outside. Focus trap is required (tracked in TER-1560 as a pre-condition before the backend activates real alerts).
**Files:** `src/client/views/PickView.tsx`, `src/client/components/pick/QueueScreen.tsx`, `PickListScreen.tsx`, `PickLineScreen.tsx`, `pickTypes.ts`
**Author:** Claude Sonnet 4.6 via Evan
**Related:** TER-1513, PR #190.
