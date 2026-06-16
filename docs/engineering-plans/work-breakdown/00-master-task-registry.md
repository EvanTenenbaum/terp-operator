# Master Task Registry — Mercury UX Retrofit

**Version:** 1.0
**How to use:** Before starting any task, an AI agent MUST read: (1) this task entry, (2) the referenced spec sheet, (3) the referenced research packet, (4) the dependency graph to confirm all prerequisites are done.

---

## Task ID Convention
`T-[PHASE]-[NN]` — e.g., `T-0-01` = Phase 0, Task 01

## Task Entry Format
```
### T-[ID]: [Title]
- **Phase:** [phase name]
- **Dependencies:** [task IDs that MUST be complete]
- **Inputs:** [spec sheets, research packets, code files to read BEFORE starting]
- **Outputs:** [exact files to create or modify]
- **States to implement:** [every interactive/visual state]
- **Acceptance Criteria:** [verifiable checks]
- **Tests:** [tests that must pass]
- **Agent notes:** [warnings, gotchas, context]
```

---

## Phase 0 — Foundation (Tasks T-0-01 through T-0-16)

### T-0-01: ComboboxCellEditor — Basic Dropdown
- **Phase:** 0 (Week 1)
- **Dependencies:** None
- **Inputs:** `specifications/components/combobox-cell-editor.md`, `research-packets/mercury-combobox-behavior.md`
- **Outputs:** `src/client/components/editors/ComboboxCellEditor.tsx` (basic version)
- **States to implement:**
  - **Empty:** Cell shows placeholder text (e.g., "Select..."). No value selected.
  - **Focused:** Cell has blue focus ring. Dropdown not yet open.
  - **Open:** Dropdown appears below/above cell (position-aware). Options list visible.
  - **Option hovered:** Hovered option has highlight background.
  - **Option selected:** User clicks/presses Enter on option → value set, dropdown closes.
  - **Disabled:** Cell is read-only, greyed out, cannot interact.
- **Acceptance Criteria:**
  - [ ] Implements AG Grid `ICellEditor` interface (`getValue`, `isPopup`, `focusIn`, `afterGuiAttached`)
  - [ ] Renders dropdown with provided `options: {label, value}[]`
  - [ ] Keyboard: ArrowDown/ArrowUp navigate options, Enter selects, Escape closes
  - [ ] `role="combobox"`, `aria-haspopup="listbox"`, `aria-autocomplete="list"`
  - [ ] Single option selects immediately (no "confirm" required)
- **Tests:** Unit test: renders empty state, opens on click, selects on Enter, closes on Escape, calls onCommit with selected value
- **Agent notes:** Must implement `isPopup(): false` — the dropdown is rendered inside the grid cell's DOM, not as a portal. Use `position: absolute` within the cell container.

### T-0-02: ComboboxCellEditor — Typeahead + Async Save
- **Phase:** 0 (Week 1)
- **Dependencies:** T-0-01
- **Inputs:** `specifications/components/combobox-cell-editor.md` (typeahead section), `research-packets/mercury-combobox-behavior.md`
- **Outputs:** `src/client/components/editors/ComboboxCellEditor.tsx` (updated)
- **States to implement:**
  - **Typeahead active:** User types → options filter to matching items. No match → show "No results".
  - **Typeahead loading:** If options are loaded async, show spinner while fetching.
  - **Saving:** After selection, cell shows spinner/loading indicator while save is in flight.
  - **Saved:** Brief green flash/checkmark on successful save.
  - **Error:** Red border + error tooltip on failed save. Retry on click.
  - **Clear:** "×" button appears when value is set. Click clears value.
  - **Create new:** If `allowCreate: true` and typed value doesn't match, show "Create '[value]'" option at bottom.
- **Acceptance Criteria:**
  - [ ] Typeahead filters options client-side (for lists ≤500). Async fetch for larger lists.
  - [ ] Save calls `onCommit` prop → returns Promise. Cell shows saving state during Promise.
  - [ ] On success: brief green indicator (200ms), then cell shows new value.
  - [ ] On error: cell turns red, tooltip shows error message. Retry on re-click.
  - [ ] Clear button visible on hover. Click clears value and calls `onCommit(null)`.
  - [ ] "Create new" option rendered at bottom when no match and `allowCreate: true`.
- **Tests:** Typeahead filters, async save loading state, save success indicator, save error + retry, clear button, create new option
- **Agent notes:** Watch out for AG Grid's cell lifecycle — `afterGuiAttached` must focus the input. `destroy` must clean up event listeners. Typeahead must debounce (150ms) for async fetches.

### T-0-03: ComboboxCellEditor — Accessibility + Edge Cases
- **Phase:** 0 (Week 1)
- **Dependencies:** T-0-02
- **Inputs:** `specifications/components/combobox-cell-editor.md` (a11y section)
- **Outputs:** `src/client/components/editors/ComboboxCellEditor.tsx` (final)
- **States to implement:**
  - **Empty options:** Show "No options available" when options array is empty.
  - **Single option:** If exactly 1 option, auto-select it on open (no need to navigate).
  - **Many options (500+):** Virtual scrolling in dropdown. Async fetch with typeahead.
  - **Tab navigation:** Tab to move to next editable cell. Shift+Tab to previous.
  - **Screen reader:** Announces option count, selected value, filter results.
- **Acceptance Criteria:**
  - [ ] `aria-activedescendant` updates as user navigates options
  - [ ] `aria-expanded="true/false"` on combobox when dropdown opens/closes
  - [ ] Option elements have `role="option"` and `aria-selected`
  - [ ] Escape returns focus to cell without modifying value
  - [ ] Tab commits current value and moves to next cell (AG Grid default behavior)
  - [ ] No memory leaks (event listeners cleaned up in `destroy`)
- **Tests:** Keyboard nav full cycle, screen reader announcements, empty/single/many options, memory leak check, Tab behavior

### T-0-04: ComboboxCellEditor — Integration Test
- **Phase:** 0 (Week 1)
- **Dependencies:** T-0-03
- **Inputs:** `src/client/components/OperatorGrid.tsx`, `src/client/components/useCommandRunner.ts`
- **Outputs:** `src/client/components/editors/ComboboxCellEditor.test.tsx` (integration section)
- **Acceptance Criteria:**
  - [ ] Test: Create test view with OperatorGrid + one combobox-editable column
  - [ ] Test: Edit cell → select value → verify `onCellCommit` fires with correct value
  - [ ] Test: Save succeeds → verify `useCommandRunner.runCommand` called
  - [ ] Test: Save fails → verify error state shown in cell
  - [ ] Test: Undo (Ctrl+Z) restores previous value
- **Agent notes:** Use a minimal test component — don't wire into real views. Mock `useCommandRunner`.

### T-0-05: DetailSlideover Shell
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/components/detail-slideover.md`, `research-packets/mercury-detail-panel-behavior.md`
- **Outputs:** `src/client/components/DetailSlideover.tsx`
- **States to implement:**
  - **Closed:** Slideover not rendered (or `display: none`).
  - **Peek (280px):** Opens on row hover or single click. Shows entity summary header + 2-3 key action buttons. Table behind remains interactive. Slideover has semi-transparent right edge.
  - **Standard (420px):** Opens on double-click or "Open" button in peek. Shows header + action buttons + tab bar + active tab content. Main content shifts left (margin-right: 420px).
  - **Wide (60%):** Drag left edge or "Expand" button. Main content width reduces to 40%.
  - **Opening:** Slideover animates in from right (300ms ease-out). Content fades in (200ms delay).
  - **Closing:** Slideover animates out to right (200ms ease-in). Main content restores full width.
  - **Tab switching:** Click tab → content swaps. Tab indicator slides horizontally.
  - **Empty state:** If entity has no data, show "No details available."
  - **Loading state:** Skeleton placeholder while tab content loads.
  - **Error state:** Error message with retry button if tab query fails.
- **Acceptance Criteria:**
  - [ ] Props: `entityType: string`, `entityId: string`, `state: 'closed' | 'peek' | 'standard' | 'wide'`
  - [ ] Tab registry: `registerTabs(entityType, tabs)` pattern. Tabs resolve dynamically.
  - [ ] Width transitions: CSS `transition: width 300ms cubic-bezier(0.2, 0.8, 0.4, 1)` (same as current ContextDrawer)
  - [ ] Closes on: (a) "×" button, (b) Escape key, (c) click outside (only in peek mode)
  - [ ] Focus trapped when open (Tab cycles within slideover)
- **Tests:** Open/close states, width transitions, tab switching, focus trap, Escape close, registerTabs pattern
- **Agent notes:** The slide-over is a SHELL. It does NOT render entity-specific content. It renders registered tabs. No entity-specific logic in this component.

### T-0-06: DetailSlideover — Tab Registry
- **Phase:** 0 (Week 2)
- **Dependencies:** T-0-05
- **Inputs:** `specifications/components/detail-slideover.md` (tab registry section)
- **Outputs:** `src/client/components/DetailSlideover.tsx` (updated), `src/client/components/tabs/registry.ts`
- **Acceptance Criteria:**
  - [ ] `registerTabs(entityType: string, tabs: DetailTab[])` function
  - [ ] `getTabs(entityType: string): DetailTab[]` function
  - [ ] Tabs registered at module import time (not in component render)
  - [ ] Tab ordering preserved from registration order
  - [ ] Tab badge count updates reactively
  - [ ] Tab with `requiresRole` hidden if user lacks role
- **Tests:** Register tabs → getTabs returns correct tabs, tab ordering, role gating, badge updates
- **Agent notes:** Existing tab components (PoLinesTab, LotMovementTab, etc.) will register themselves. Don't modify them — just register.

### T-0-07: FilterToolbar
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/components/filter-toolbar.md`, `research-packets/mercury-filter-toolbar-behavior.md`
- **Outputs:** `src/client/components/FilterToolbar.tsx`
- **States to implement:**
  - **Default:** Horizontal bar with: Data views dropdown, Filter chips (Date | Keyword | Amount), Group button, Sort button, Settings button, Export button.
  - **Filter chip open:** Click chip → inline popover appears below chip. Date: calendar or date range inputs. Keyword: text input with suggestions. Amount: min/max number inputs.
  - **Active filter:** Chip shows count badge (e.g., "Date (1)", "Amount (2)"). Dismissible "×" on each active filter pill.
  - **Complex filter active:** Amber pill "[⚙] Complex filter active" when Advanced has AND/OR/nesting. Click opens Advanced mode.
  - **Data views open:** Dropdown with saved views list + "Save current view" option.
  - **Group/Sort open:** Compact popover with group-by field selector / sort field + direction.
  - **Export:** Dropdown: CSV, Excel, PDF. Click triggers download.
  - **Disabled:** Greyed out when no data.
  - **Loading:** Skeleton while view loads.
- **Acceptance Criteria:**
  - [ ] Reads `useUiStore.gridFilters[view]` for active filters
  - [ ] Calls `setGridFilter(view, filterString)` on filter change
  - [ ] "Advanced" button always visible. Click opens AdvancedFilterBuilder in slide-over or modal.
  - [ ] Filter bridge: simple filters serialize to `field:op:value` format
  - [ ] Active complex filters surfaced as amber pill
  - [ ] Keyboard: Tab between chips, Enter to open, Escape to close popover
- **Tests:** Chip open/close, filter apply, active pill display, complex filter pill, Data views dropdown, Export
- **Agent notes:** Do NOT remove AdvancedFilterBuilder. Keep it untouched. FilterToolbar coexists with it via the bridge.

### T-0-08: FilterToolbar — Filter Bridge
- **Phase:** 0 (Week 2)
- **Dependencies:** T-0-07
- **Inputs:** `specifications/components/filter-toolbar.md` (bridge section)
- **Outputs:** `src/client/components/FilterToolbar.tsx` (updated), `src/client/utils/filterBridge.ts`
- **Acceptance Criteria:**
  - [ ] `simpleToAdvanced(filters: SimpleFilter[]): FilterGroupInput` — serializes to AND group
  - [ ] `advancedToSimple(filter: FilterGroupInput): { simple: SimpleFilter[], hasComplex: boolean }`
  - [ ] Round-trip test: simple → advanced → simple preserves all filter values
  - [ ] Complex AND/OR detected: `hasComplex: true` when advanced has nested groups or OR logic
  - [ ] Clear all: clears both `gridFilters[view]` and `gridAdvancedFilters[view]`
  - [ ] Preset click with complex active: warns "This will clear your complex filters. Continue?"
- **Tests:** Round-trip preservation, complex detection, clear all, preset warning

### T-0-09: BulkActionBar
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/components/bulk-action-bar.md`, `research-packets/mercury-bulk-actions-behavior.md`
- **Outputs:** `src/client/components/BulkActionBar.tsx`
- **States to implement:**
  - **Hidden:** When `selectedCount === 0`. Not rendered.
  - **Visible:** Animates up from bottom (200ms). Shows: "N [entity] selected · $XX,XXX.XX total" + action buttons.
  - **Actions:** Primary action (prominent, leftmost). Secondary actions (less prominent). Actions from entity state machine.
  - **Bespoke input:** Some actions need inline input (e.g., "Route to [input]"). Rendered next to action button.
  - **Executing:** Action button shows spinner. Other buttons disabled.
  - **Partial success:** If batch action succeeds for some rows but fails for others, show "X succeeded, Y failed. [View failures]".
  - **All success:** Brief green flash. Bar hides.
  - **All failure:** Error message + retry button.
  - **Deselect:** Clicking "×" or pressing Escape clears selection, bar hides.
- **Acceptance Criteria:**
  - [ ] Props: `selectedCount: number`, `selectedTotal?: string`, `actions: BulkAction[]`, `onClear: () => void`
  - [ ] Renders at `position: sticky; bottom: 0` within view container
  - [ ] Animates: `transform: translateY(0)` ←→ `translateY(100%)` with opacity
  - [ ] Action buttons from entity state machine (T-0-13)
  - [ ] Bespoke input slot per action: `action.requiresInput?: { field: string, placeholder: string }`
  - [ ] Keyboard: Escape clears selection, Enter triggers primary action
- **Tests:** All states (hidden, visible, executing, partial success, all success, all failure), keyboard, animation

### T-0-10: ViewTabBar
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/components/view-tab-bar.md`
- **Outputs:** `src/client/components/ViewTabBar.tsx`
- **States:**
  - **Tabs:** Horizontal tabs with label + optional count badge.
  - **Active tab:** Highlighted with bottom border indicator.
  - **Count badge:** "3" in pill next to label. Updates reactively from aggregate query.
  - **Overflow:** If too many tabs for viewport, scroll horizontally with arrow buttons.
  - **Loading:** Skeleton placeholders while counts load.
- **Acceptance Criteria:**
  - [ ] Props: `tabs: { key: string, label: string, count?: number }[]`, `activeKey: string`, `onChange: (key: string) => void`
  - [ ] Auto-generate from entity status enum (e.g., `generateStatusTabs(PO_STATUSES)`)
  - [ ] Wire to `useUiStore.gridFilters[view]` — clicking tab sets status filter
  - [ ] Keyboard: ArrowLeft/ArrowRight between tabs, Enter to select
- **Tests:** Tab rendering, count badges, active state, overflow scroll, keyboard nav

### T-0-11: GridSummaryStrip
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/components/grid-summary-strip.md`
- **Outputs:** `src/client/components/GridSummaryStrip.tsx`
- **States:**
  - **Loading:** Skeleton cards.
  - **Loaded:** 3-5 metric cards in horizontal strip. Each: label, value, optional delta/trend arrow.
  - **Error:** "Could not load summary" with retry.
  - **Empty:** "No data" when no metrics.
- **Acceptance Criteria:**
  - [ ] Props: `metrics: { label: string, value: string, delta?: { value: string, direction: 'up' | 'down' | 'neutral' } }[]`
  - [ ] Responsive: wraps to 2 rows on narrow viewports
- **Tests:** All states, responsive wrapping

### T-0-12: Entity Schemas — GridJourney Entities
- **Phase:** 0 (Week 2)
- **Dependencies:** None
- **Inputs:** `specifications/config/entity-schemas.md`, `src/client/views/operations/shared.tsx` (current `columnsByView`)
- **Outputs:** `src/config/entity-schemas.ts`
- **Entities to define:** PurchaseOrder, Order, Payment, Inventory/Lot, Client, Vendor, Fulfillment/Pick, Connector, PurchaseReceipt, InvoiceDispute, CloseoutPeriod, RecoveryCommand
- **Acceptance Criteria:**
  - [ ] Each entity has complete field definitions (matching current `columnsByView` fields)
  - [ ] Field types: `'string' | 'number' | 'money' | 'date' | 'boolean' | 'enum'`
  - [ ] Editor mapping: `enum → 'combobox'`, `money → 'numeric'`, `boolean → 'checkbox'`, `date → 'datePicker'`, default `→ 'text'`
  - [ ] Hidden columns marked `hide: true` (matching current defaults)
  - [ ] Custom cell renderers supported via `cellRenderer` override
- **Agent notes:** Source of truth is `columnsByView` in `shared.tsx`. Match every field in the current column definitions. Don't add or remove fields.

### T-0-13: Entity State Machines — GridJourney Entities
- **Phase:** 0 (Week 3)
- **Dependencies:** None
- **Inputs:** `specifications/config/entity-actions.md`, current StatusActionTable entries in per-view files
- **Outputs:** `src/config/entity-actions.ts`
- **Entities to define:** PurchaseOrder, Order, Payment, Connector, CloseoutPeriod, RecoveryCommand, FulfillmentPick, VendorBill, SalesOrder
- **For each entity, define:**
  - Statuses with available actions per status
  - Primary action per status (shown prominently in BulkActionBar)
  - Multi-row constraints (e.g., "can only confirm if all rows are draft and have customer")
  - Role gates (e.g., approve requires manager)
- **Acceptance Criteria:**
  - [ ] Every action from current StatusActionTable entries is represented
  - [ ] Primary actions match current behavior
  - [ ] Multi-row constraints match current gating logic
- **Agent notes:** Source of truth is the StatusActionTable entries in each view file. Extract every status → action mapping. Don't invent new actions or remove existing ones.

### T-0-14: useEntityActions Hook
- **Phase:** 0 (Week 3)
- **Dependencies:** T-0-13
- **Inputs:** `specifications/hooks/use-entity-actions.md`
- **Outputs:** `src/client/hooks/useEntityActions.ts`
- **Acceptance Criteria:**
  - [ ] `useEntityActions(entityType, selectedRows, userRole): BulkAction[]`
  - [ ] Returns actions filtered by: current status (all selected rows must be in compatible states), multi-row constraints, role gates, entity state machine
  - [ ] If selected rows have mixed statuses, only actions available to ALL statuses are shown
  - [ ] Actions sorted: primary first, then alphabetically
- **Tests:** Single status, mixed statuses, role gating, multi-row constraints, empty selection

### T-0-15: useColumnDefs Hook
- **Phase:** 0 (Week 3)
- **Dependencies:** T-0-12
- **Inputs:** `specifications/hooks/use-column-defs.md`
- **Outputs:** `src/client/hooks/useColumnDefs.ts`
- **Acceptance Criteria:**
  - [ ] `useColumnDefs(entityType: string, overrides?: Partial<ColDef>[]): ColDef[]`
  - [ ] Generates AG Grid ColDef array from entity schema
  - [ ] Maps field types to: column type (`numericColumn` for money/number), cell editor (`ComboboxCellEditor` for enum), value formatter (currency for money), filter type (set filter for enum)
  - [ ] Respects `hide: true` from schema
  - [ ] Overrides allow per-view customizations (e.g., different width, custom cellRenderer)
  - [ ] Merges with `mergeColumnDefsWithPrefs` (existing column visibility/width/pin prefs)
- **Tests:** Schema → ColDef for each entity, overrides, hidden columns, editor mapping

### T-0-16: View Registry
- **Phase:** 0 (Week 3)
- **Dependencies:** T-0-12, T-0-13
- **Inputs:** `specifications/config/view-registry.md`
- **Outputs:** `src/config/view-registry.ts`
- **Acceptance Criteria:**
  - [ ] `registerView(config: ViewConfig)` function
  - [ ] `getViewConfig(viewKey: ViewKey): ViewConfig`
  - [ ] ViewConfig: `{ key, template, title, entity, stateMachine, summaryQuery, detailTabs, filterPresets }`
  - [ ] All existing views registered
- **Agent notes:** This is the configuration layer. Views declare what they need; templates render from the config.

---

## Phase 1 — Pilot: PurchaseOrdersView (Tasks T-1-01 through T-1-09)

### T-1-01: PurchaseOrdersView — Adopt GridView Template
- **Phase:** 1 (Week 4)
- **Dependencies:** T-0-11, T-0-16
- **Inputs:** `specifications/views/purchase-orders-view.md`, `src/client/templates/GridView.tsx`
- **Outputs:** `src/client/views/PurchaseOrdersView.tsx` (refactored)
- **Acceptance Criteria:**
  - [ ] View renders via `<GridView viewKey="purchaseOrders" />`
  - [ ] All existing PO functionality preserved: create, edit, receive, finalize, approve, cancel
  - [ ] PO authoring opens in DetailSlideover (from "New PO" button), not inline panel
  - [ ] VendorQuickAdd stays as inline collapsible section within authoring slide-over
- **Tests:** `PurchaseOrdersView.ux-wave7.test.tsx` must pass unchanged

### T-1-02: FilterToolbar — PurchaseOrders
- **Phase:** 1 (Week 4)
- **Dependencies:** T-1-01, T-0-07
- **Inputs:** `specifications/views/purchase-orders-view.md` (filter section)
- **Outputs:** PurchaseOrdersView updated
- **Acceptance Criteria:**
  - [ ] FilterToolbar shows presets: Active | Ordered | Finalized
  - [ ] Date filter filters by expectedDate
  - [ ] Keyword filter searches vendor name + poNo
  - [ ] "Advanced" opens AdvancedFilterBuilder pre-populated with current filters

### T-1-03: SummaryStrip + ViewTabBar — PurchaseOrders
- **Phase:** 1 (Week 4)
- **Dependencies:** T-1-01, T-0-10, T-0-11
- **Acceptance Criteria:**
  - [ ] SummaryStrip shows: Total POs, Total Value, Draft count, Ordered count, Received count
  - [ ] ViewTabBar tabs: All | Draft | Ordered | Received | Finalized (with counts)
  - [ ] Clicking tab filters grid by status

### T-1-04: BulkActionBar — PurchaseOrders
- **Phase:** 1 (Week 4)
- **Dependencies:** T-1-01, T-0-09, T-0-14
- **Acceptance Criteria:**
  - [ ] Select rows → BulkActionBar appears with actions from PurchaseOrder state machine
  - [ ] Draft: Finalize (primary), Cancel
  - [ ] Finalized: Approve (primary, manager-gated), Unfinalize, Cancel
  - [ ] Approved/Ordered: Receive (primary), Receive partial, Record prepay, Cancel
  - [ ] All existing StatusActionBar behavior preserved

### T-1-05: DetailSlideover — PurchaseOrders
- **Phase:** 1 (Week 4)
- **Dependencies:** T-1-01, T-0-05, T-0-06
- **Inputs:** `specifications/views/purchase-orders-view.md` (detail section)
- **Acceptance Criteria:**
  - [ ] Click PO row → DetailSlideover opens in peek (280px): PO #, vendor, status, total, key actions
  - [ ] Click "Open" → standard (420px) with tabs: Lines, Linked Intake, Vendor, History
  - [ ] Lines tab: PO lines grid (same columns as current selected PO lines)
  - [ ] Vendor tab: vendor name, terms, open bills, prior POs, quick add
  - [ ] "Open in full view" → navigates to `/purchase-orders/:id`

### T-1-06: ComboboxCellEditor — PurchaseOrders
- **Phase:** 1 (Week 4)
- **Dependencies:** T-1-01, T-0-03
- **Acceptance Criteria:**
  - [ ] `status` column uses ComboboxCellEditor (options: draft, ordered, approved, finalized, received, cancelled)
  - [ ] `paymentTerms` column uses ComboboxCellEditor (options: Net 15, Net 30, Net 60, Due on receipt, etc.)
  - [ ] Edit → save via existing `onCellCommit` → `runCommand('updatePurchaseOrder')`

### T-1-07: PO Authoring in Slide-over
- **Phase:** 1 (Week 4)
- **Dependencies:** T-0-05
- **Acceptance Criteria:**
  - [ ] "New PO" button opens DetailSlideover with authoring form
  - [ ] Vendor select, expected date, payment terms, notes, prepayment amount fields
  - [ ] "Add new vendor" toggle expands vendor form inline
  - [ ] Draft lines grid (editable) below header
  - [ ] "Save Draft" and "Approve & Finalize" buttons
  - [ ] Total strip at bottom
  - [ ] Vendor context (prior POs, market signals) as collapsible section

### T-1-08: Register PO Entity Tabs
- **Phase:** 1 (Week 4)
- **Dependencies:** T-0-06
- **Acceptance Criteria:**
  - [ ] `registerTabs('po', [...])` called at module import
  - [ ] Tabs: Lines (PoLinesTab), Linked Intake (PoLinkedIntakeTab), Vendor (VendorDetailTab), History (EntityTimelineTab)
  - [ ] Existing tab components registered without modification

### T-1-09: Validate PurchaseOrdersView
- **Phase:** 1 (Week 5)
- **Dependencies:** T-1-01 through T-1-08
- **Acceptance Criteria:**
  - [ ] `pnpm typecheck` passes
  - [ ] `PurchaseOrdersView.ux-wave7.test.tsx` passes
  - [ ] Playwright e2e passes
  - [ ] Manual browser QA: create PO, add lines, edit cells, finalize, approve, receive, cancel, record prepay
  - [ ] No regressions

---

## Phase 2 — GridJourney Views (Tasks T-2-01 through T-2-08)

### T-2-01: Complete Entity Schemas — Remaining Entities
- **Phase:** 2 (Week 6)
- **Dependencies:** T-0-12
- **Inputs:** `columnsByView` in `shared.tsx`
- **Outputs:** `src/config/entity-schemas.ts` (updated)
- **Acceptance Criteria:**
  - [ ] All GridJourney entities have complete schemas: Order, Payment, Inventory, Client, Vendor, FulfillmentPick, Connector, PurchaseReceipt, InvoiceDispute, CloseoutPeriod, RecoveryCommand
  - [ ] Every field from `columnsByView` represented
  - [ ] Custom cell renderers specified as overrides (name alias dot, aging badge, alert badge, whyShown, status pill)

### T-2-02: Complete Entity State Machines — Remaining Entities
- **Phase:** 2 (Week 6)
- **Dependencies:** T-0-13
- **Outputs:** `src/config/entity-actions.ts` (updated)
- **Acceptance Criteria:**
  - [ ] State machines for: Order, Payment, Connector, CloseoutPeriod, RecoveryCommand, FulfillmentPick, VendorBill

### T-2-03: useViewData Hook — All Views
- **Phase:** 2 (Week 6)
- **Dependencies:** T-0-15
- **Outputs:** `src/client/hooks/useViewData.ts` (updated)
- **Acceptance Criteria:**
  - [ ] Query map covers all GridJourney viewKeys
  - [ ] Each view has: main grid query, aggregate query
  - [ ] Enabled flags for conditional queries

### T-2-04: GridView Template — OrdersView
- **Phase:** 2 (Week 6)
- **Dependencies:** T-0-16, T-2-01, T-2-02, T-2-03
- **Acceptance Criteria:**
  - [ ] OrdersView renders via GridView template
  - [ ] All existing functionality preserved: confirm, post, allocate, create pick list, cancel, reprice
  - [ ] ViewTabBar: All | Draft | Confirmed | Posted | Fulfilled
  - [ ] DetailSlideover: order detail with lines + documents + history tabs
  - [ ] Inspector tabs (Invoice, Linked Orders) become slide-over tabs

### T-2-05: GridView Template — First Wave (5 views)
- **Phase:** 2 (Week 6)
- **Dependencies:** T-0-16
- **Views:** PaymentsView, InventoryView, ClientsView, VendorsView, FulfillmentView
- **Acceptance Criteria:**
  - [ ] Each view renders via GridView template
  - [ ] All existing tests pass
  - [ ] ViewTabBar tabs auto-generated from entity status enum
  - [ ] BulkActionBar with entity state machine actions
  - [ ] DetailSlideover with registered entity tabs

### T-2-06: GridView Template — Second Wave (5 views)
- **Phase:** 2 (Week 7)
- **Dependencies:** T-0-16
- **Views:** VendorPayablesView, ConnectorsView, PurchaseReceiptsView, InvoiceDisputesView, CloseoutView
- **Acceptance Criteria:** Same as T-2-05

### T-2-07: Register Entity Tabs — All Entities
- **Phase:** 2 (Week 7)
- **Dependencies:** T-0-06
- **Acceptance Criteria:**
  - [ ] Every entity type has registered tabs
  - [ ] Existing tab components (PoLinesTab, LotMovementTab, etc.) registered without modification
  - [ ] New simple tabs created where needed (EntityTimelineTab generic enough?)

### T-2-08: Validate GridJourney Views
- **Phase:** 2 (Week 7)
- **Dependencies:** T-2-01 through T-2-07
- **Acceptance Criteria:**
  - [ ] All GridJourney views functional
  - [ ] All existing per-view tests pass
  - [ ] Playwright e2e passes
  - [ ] No regressions

---

## Phase 3A — SalesView Prerequisite Refactoring (Tasks T-3A-01 through T-3A-12)

### T-3A-01: Extract displayName Cell Renderer
- **Phase:** 3A (Week 8)
- **Dependencies:** None (reads current SalesView.tsx)
- **Inputs:** SalesView.tsx lineColumns `displayName` definition
- **Outputs:** `src/client/components/cells/DisplayNameCell.tsx`
- **Acceptance Criteria:**
  - [ ] Component renders yellow dot (●) if itemAlias exists, then name
  - [ ] Props: `value: string, data: GridRow` (from AG Grid cellRendererParams)
  - [ ] Used as `cellRenderer: DisplayNameCell` in column def
  - [ ] Behavior identical to current inline renderer

### T-3A-02 through T-3A-07: Extract Remaining Cell Renderers
Same pattern as T-3A-01 for: BatchCodeCell, MarkupCell, DerivedCogsCell, PickStatusCell, WhyShownCell, LandedCostExceptionCell

### T-3A-08: Stabilize fulfillmentActionsColumn
- **Phase:** 3A (Week 9)
- **Dependencies:** T-3A-01 through T-3A-07
- **Acceptance Criteria:**
  - [ ] Column definition no longer re-creates on `isRunning` change
  - [ ] `cellRendererParams` contain `canWrite`, `releaseEligibility` — passed as params, not closures
  - [ ] Release/Recall/Queued/Packed buttons render correctly
  - [ ] Behavior identical to current

### T-3A-09: Extract useSalesLineRows Hook
- **Phase:** 3A (Week 9)
- **Dependencies:** None (reads current SalesView.tsx)
- **Outputs:** `src/client/hooks/useSalesLineRows.ts`
- **Acceptance Criteria:**
  - [ ] `useSalesLineRows(orderId, customerId): { rows: GridRow[], pricingRule, dupSource }`
  - [ ] Moves `lineRowsWithRule` computation from view
  - [ ] Pricing rule resolution identical

### T-3A-10: Extract useSalePrePostChecks Hook
- **Phase:** 3A (Week 9)
- **Dependencies:** None
- **Outputs:** `src/client/hooks/useSalePrePostChecks.ts`

### T-3A-11: Extract buildConfirmPayload
- **Phase:** 3A (Week 10)
- **Dependencies:** None
- **Outputs:** `src/client/utils/buildConfirmPayload.ts`

### T-3A-12: Validate SalesView Refactoring
- **Phase:** 3A (Week 10)
- **Dependencies:** T-3A-01 through T-3A-11
- **Acceptance Criteria (HARD GATE):**
  - [ ] All 5 SalesView test suites pass: `SalesView.ux-f03`, `SalesView.ux-d04`, `SalesView.ux-f06`, `SalesView.marginToggle`, `SalesView.pricing`
  - [ ] Manual QA: create order, add lines, price, confirm, release, recall, cancel. No behavioral changes.
  - [ ] If any test fails, fix before proceeding to Phase 3B.

---

## Phase 3B — SalesView Migration (Tasks T-3B-01 through T-3B-10)

### T-3B-01: Adopt GridView Template Base
- **Phase:** 3B (Week 11)
- **Dependencies:** T-3A-12
- **Acceptance Criteria:**
  - [ ] SalesView uses GridView template as base layout
  - [ ] Orders grid renders via template
  - [ ] ViewTabBar: All Open | Draft | Confirmed | Posted | Fulfilled

### T-3B-02: Adopt SalesOrder Entity Schema + State Machine
- **Phase:** 3B (Week 11)
- **Dependencies:** T-2-01, T-2-02

### T-3B-03 through T-3B-06: Wire FilterToolbar, SummaryStrip, BulkActionBar, DetailSlideover
- **Phase:** 3B (Weeks 11-12)
- **Detailed AC in per-task spec sheets**

### T-3B-07: Wire ComboboxCellEditor for SalesView Columns
- **Phase:** 3B (Week 12)
- **Acceptance Criteria:**
  - [ ] `status` → ComboboxCellEditor
  - [ ] `pricingStrategy` → ComboboxCellEditor
  - [ ] `tags` → ComboboxCellEditor (multi-select variant if needed)
  - [ ] `customer` → ComboboxCellEditor (typeahead, large list)

### T-3B-08: Customer Workspace Context Header
- **Phase:** 3B (Week 12)
- **Acceptance Criteria:**
  - [ ] When customer selected: context header appears above lines grid (balance, credit limit, tags, open invoices)
  - [ ] Credit engine indicator (amber pill)
  - [ ] Pre-post check strip inline
  - [ ] CustomerPurchaseHistoryPanel stays as inline collapsible section (cross-reference preserved)
  - [ ] InventoryFinder stays as inline collapsible section (can be pinned open)

### T-3B-09: Register SalesOrder + Customer Tabs
- **Phase:** 3B (Week 12)

### T-3B-10: Validate SalesView Migration
- **Phase:** 3B (Week 13)
- **Acceptance Criteria:**
  - [ ] All 5 SalesView test suites pass
  - [ ] Playwright e2e passes
  - [ ] Manual browser QA: full sales workflow

---

## Phase 3C — IntakeView + DashboardView (Tasks T-3C-01 through T-3C-06)

### T-3C-01: IntakeView — Adopt MasterDetailView Template
- **Phase:** 3C (Week 14)
- **Acceptance Criteria:**
  - [ ] IntakeView uses MasterDetailView template
  - [ ] Master grid: PO rows (expandable). Detail: batch rows (inline expansion).
  - [ ] FilterToolbar: Ready | In Progress | Verified
  - [ ] SummaryStrip: POs pending, batches, total value
  - [ ] ComboboxCellEditor: arrivalStatus, discrepancyReason
  - [ ] All existing IntakeView tests pass

### T-3C-02 through T-3C-03: DashboardView — Adopt DashboardView Template, Wire KPI Strip + Quick Actions
- **Phase:** 3C (Week 15)
- **Acceptance Criteria:**
  - [ ] 4 KPI cards in horizontal strip
  - [ ] Quick action buttons (New Sale, New PO, Intake, Payment)
  - [ ] 8 panels collapsed into 2-3 section layout
  - [ ] Task count badge on sidebar nav items
  - [ ] All DashboardView tests pass

---

## Phase 3D — Remaining Complex Views (Tasks T-3D-01 through T-3D-10)

### T-3D-01: MatchmakingView
- **Phase:** 3D (Week 16)
- **Acceptance Criteria:**
  - [ ] 5 grids → tabbed GridView with ViewTabBar
  - [ ] Tabs: Matches | Opportunities | Needs | Stock | Settings
  - [ ] All matchmaking workflow preserved

### T-3D-02: PickView — Adopt WizardView Template
- **Phase:** 3D (Week 16)
- **Acceptance Criteria:**
  - [ ] WizardView template with 3 steps: Queue → List → Line
  - [ ] Step indicator at top
  - [ ] Auto-advance preserved

### T-3D-03 through T-3D-10: Recovery, Closeout, CreditReview, Media, Referees, Processors, Items, Contacts

---

## Phase 4 — Polish (Tasks T-4-01 through T-4-09)

### T-4-01: Mobile Adaptations
- **Phase:** 4 (Week 19)
- **Acceptance Criteria:**
  - [ ] FilterToolbar: collapsible/bottom sheet on mobile
  - [ ] BulkActionBar: full-width sticky on mobile
  - [ ] DetailSlideover: full-screen on mobile (replaces current mobile drawer patterns)
  - [ ] 7 mobile views adapted

### T-4-02: Accessibility Audit
### T-4-03: Performance Check
### T-4-04: Documentation Update
### T-4-05: Persona Flow QA
### T-4-06: Cleanup + Final Test Suite

---

## Task Summary

| Phase | Task Count | Weeks |
|-------|-----------|-------|
| 0 — Foundation | 16 | 1-3 |
| 1 — Pilot | 9 | 4-5 |
| 2 — GridJourney | 8 | 6-7 |
| 3A — Sales Refactor | 12 | 8-10 |
| 3B — Sales Migration | 10 | 11-13 |
| 3C — Intake + Dashboard | 6 | 14-15 |
| 3D — Remaining Complex | 10 | 16-18 |
| 4 — Polish | 9 | 19-20 |
| **Total** | **80** | **20** |


---

## Phase 0-C — Cleanup Tasks (Stubs + Disconnects)

### T-0-C1: Fix CAP-030 Stubs in PickView
- **Phase:** 0-C
- **Dependencies:** None
- **Inputs:** `src/client/components/pick/QueueScreen.tsx`, `PickLineScreen.tsx`, `PickListScreen.tsx`
- **Outputs:** Updated PickView component files
- **Acceptance Criteria:**
  - [ ] Hardcoded static data extracted to `src/client/components/pick/pickMockData.ts` with clear comment: "TODO: Replace with trpc.queries.pickQueue when CAP-030 backend merges (TER-1498)"
  - [ ] Production components import from mock module, not inline
  - [ ] No hardcoded data in production render paths
  - [ ] Typecheck passes
- **Agent notes:** Do NOT wire to tRPC queries if they don't exist yet. The goal is clean separation, not forcing broken integration.

### T-0-C2: Fix SalesCommandHistoryTab Stub
- **Phase:** 0-C
- **Dependencies:** None
- **Outputs:** `src/client/components/drawerTabs/SalesCommandHistoryTab.tsx`
- **Acceptance Criteria:**
  - [ ] "Coming soon" language removed
  - [ ] Shows empty state: "No commands recorded for this order yet" OR wired to real `trpc.queries.entityTimeline`
  - [ ] If unwired, comment explains what query to use when available

### T-0-C3: Fix RefereeCreditsList Disabled Button
- **Phase:** 0-C
- **Dependencies:** None
- **Outputs:** `src/client/components/RefereeCreditsList.tsx`
- **Acceptance Criteria:**
  - [ ] Payout button HIDDEN (not disabled) until CAP-039 lands
  - [ ] Comment: "Show payout button when CAP-039 ships — tracked in Linear [TER-XXXX]"

### T-0-C4: Remove Dead Backend Procedures
- **Phase:** 0-C
- **Dependencies:** None
- **Outputs:** `src/server/routers/filters.ts`, `media.ts`, `subscriptions.ts`, `queries.ts`
- **Acceptance Criteria:**
  - [ ] `applyBatchFilters` removed or wired to frontend consumer
  - [ ] `runCleanup` removed or wired
  - [ ] `heartbeat` removed or wired
  - [ ] `customerLastOrderedQty` (singular) removed (bulk version is used)
  - [ ] Each removal has a comment explaining why
  - [ ] Typecheck + tests pass after removal

### T-0-C5: Fix Merge-Candidates Zero Counter
- **Phase:** 0-C
- **Dependencies:** None
- **Outputs:** Component that shows `mergeCandidateCount`
- **Acceptance Criteria:**
  - [ ] Counter hidden until BE-014 ships `contact_merge_candidates`
  - [ ] Comment: "Re-enable when BE-014 lands"

---

## Phase 0-T — Test Resilience Tasks

### T-0-T1: Replace CSS Class Assertions
- **Phase:** 0-T
- **Dependencies:** None
- **Outputs:** All affected test files
- **Affected files:** `MediaBatchDrawer.test.tsx`, `ErrorBoundary.test.tsx`, `WorkspacePanel.test.tsx`, `EditCreditLimitModal.test.tsx`
- **Acceptance Criteria:**
  - [ ] No `.toHaveClass('primary-button')` or similar CSS class assertions
  - [ ] Replaced with `getByRole` / `getByLabelText` / `data-testid` queries
  - [ ] Components add `data-testid` or `aria-label` where needed for testing
  - [ ] All tests pass

### T-0-T2: Replace DOM Structure Coupling
- **Phase:** 0-T
- **Dependencies:** None
- **Affected files:** `IntakeView.ux-wave7.test.tsx`, `ux-s01.a11y.test.tsx`, `IdentityRibbon.uxb08.test.tsx`, `CreditQueueHealthWidget.test.tsx`, `SaleLineExceptionControls.test.tsx`
- **Acceptance Criteria:**
  - [ ] No `container.firstChild` or `wrapper.children[0].children[2]` assertions
  - [ ] Replaced with semantic queries
  - [ ] All tests pass

### T-0-T3: Replace Hardcoded Magic Numbers
- **Phase:** 0-T
- **Dependencies:** None
- **Affected files:** `MobileCatalogView.ux-r03.test.tsx`, `SalesView.pricing.test.tsx`, `QuickLedgerGrid.impactPreview.test.tsx`, `commandBus.partialReceive.test.ts`, `cap030.integration.test.ts`, `commandBus.picking.test.ts`
- **Acceptance Criteria:**
  - [ ] Magic numbers replaced with derived values (computed from inputs) or relative assertions (`toBeGreaterThan`, `toBeLessThan`)
  - [ ] Where seed data is the source, values extracted to named constants with comments
  - [ ] All tests pass

### T-0-T4: Fix Drizzle ORM Mock Coupling
- **Phase:** 0-T
- **Dependencies:** None
- **Outputs:** `src/server/services/matchmakingStatus.test.ts`
- **Acceptance Criteria:**
  - [ ] Drizzle ORM chain mocking (`.select().from().where().limit()`) replaced with service-layer mocks
  - [ ] Tests assert behavior, not ORM call structure
  - [ ] All tests pass

### T-0-T5: Fix Seed-Data-Dependent E2E Skips
- **Phase:** 0-T
- **Dependencies:** None
- **Affected files:** `sales-cost-range-exceptions.spec.ts`, `sales-workspace-layout.spec.ts`, `credit-engine.spec.ts`, `payment-processor-qa.spec.ts`, `phase2-inline-expansion-qa.spec.ts`
- **Acceptance Criteria:**
  - [ ] Each test creates its own data via tRPC mutations in `beforeEach`, OR uses guaranteed seed data
  - [ ] No `test.skip(true, ...)` remaining
  - [ ] All E2E tests pass

### T-0-T6: Fix or Delete Skipped Unit Tests
- **Phase:** 0-T
- **Dependencies:** None
- **Outputs:** `DashboardView.ux-e01-e02-e04.test.tsx`
- **Acceptance Criteria:**
  - [ ] Skipped test implemented or deleted with comment
  - [ ] No `it.skip` remaining

