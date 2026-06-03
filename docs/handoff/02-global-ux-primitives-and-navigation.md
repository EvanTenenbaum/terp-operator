# 02 — Global UX Primitives, Shell & Navigation

> Developer-handoff "bible" for the **cross-cutting** UX building blocks that appear across every TERP Operator journey. Ground truth is the code; every claim below cites `file:line`. Paths are repo-relative to `/home/user/terp-operator`.

This section covers the desktop **shell** and the reusable primitives that journey-specific sections (intake, sales, payments, etc.) compose. It does **not** re-document journey views except where they illustrate a shared pattern (e.g. the status-aware primary action).

---

## 0. How the shell is assembled (`src/client/App.tsx`)

The desktop console mounts (inside `AppContent`, gated by `me.data` auth):

- `<SocketProvider>` wraps everything (`App.tsx:103`, `:150`) — single socket.io connection + live invalidation.
- `<SideNav user={me.data} />` (`App.tsx:112`) — always rendered.
- `<Keel user={me.data} />` and `<IdentityRibbon />` (`App.tsx:114-115`) and `<ContextDrawer />` (`App.tsx:120`) are gated behind `CANVAS_GRAMMAR_ENABLED`.
- Global singletons mounted once near root: `<Hotkeys />` (`:123`), `<CommandPalette />` (`:124`), `<ToastCenter />` (`:125`), `<ConfirmRoot />` (`:126`), `<FeedbackCapture />` (`:127`).
- The whole tree is wrapped in `<ErrorBoundary>` (`App.tsx:156`, `:201`).

`Keel`/`SideNav`/`IdentityRibbon`/`ContextDrawer` are read-driven from the **uiStore** (zustand). `ConfirmRoot` reads the **confirmStore**. So the two zustand stores plus the socket context are the spine that ties the shell together.

---

## 1. The UI store (zustand) — shape, actions, persistence

**File:** `src/client/store/uiStore.ts`. Created with `create<UiState>()(persist(immer(...)))` (`uiStore.ts:182-184`). Immer middleware lets actions mutate `state` directly; `persist` writes an allow-listed slice to `localStorage`.

### State shape (`UiState`, `uiStore.ts:76-180`)
Key fields:
- Navigation: `activeView: ViewKey` (`:77`), `activeCustomerId` (`:78`), `activeQuickLaunch: QuickLaunchMode | null` (`:79`), `activeSettingsTab` (`:80`), `routeHistory: RouteHistoryEntry[]` (`:97`).
- Selection: `selectedRows: Partial<Record<ViewKey, GridRow[]>>` (`:82`).
- Command palette / finder: `commandPaletteOpen`, `commandPaletteAdvancedOpen`, `commandPaletteTab: 'commands' | 'entities'` (`:83-86`), `finderOpen` (`:163`).
- Layout: `rightPanelOpen`, `sideNavCollapsed`, `collapsedPanels: Record<string,boolean>`, `focusedPanelId`, `focusMode` (`:87-92`).
- Drawer: `drawerByView: Record<string, DrawerState>` (`:93`), `activeDrawerEntityByView: Partial<Record<ViewKey, DrawerEntityRef>>` (`:94`), `lastUsedDrawerStateByView` (`:148`).
- Grid: `gridFilters: Partial<Record<ViewKey,string>>` (`:95`), `gridColumnPrefs: Record<string, GridColumnPref[]>` (`:96`).
- Toasts + a11y: `toasts: Toast[]` (`:98`), `announcement: string` (`:99`) — every action sets `announcement` for the live region.
- Feature flags / prefs: `dismissedShadowBanner` (`:103`), `showMargin` (`:109`, default `true`).
- Ephemeral cross-component slices: `salesSheetState` (`:112-117`, synced from SalesView, **not** persisted), `pickQueueFilters: Set<string>` (`:166`), `ledgerDrafts: LedgerDraft[]` (`:171`), `isCellEditing: boolean` (`:178`, GH #409 — defers socket invalidations during cell edit).

`LedgerDraft` shape and the `makeLedgerRow()` factory (CAP-024) live here too (`:11-59`) so QuickLedgerGrid and the store share one definition.

### Persistence (`persist` config, `uiStore.ts:480-502`)
- Storage key is `'terp-agro-ui'` (`:483`) — intentionally retains the **legacy** name (PR #66) for preference continuity across the product rename.
- `partialize` allow-list (`:488-501`): only `activeView`, `sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`, `activeSettingsTab`, `drawerByView`, `gridColumnPrefs`, `dismissedShadowBanner`, `showMargin`, `lastUsedDrawerStateByView` are persisted.
- **Security edge case (UX-A1 / #15):** `activeDrawerEntityByView` and `gridFilters` are deliberately **NOT** persisted (`:484-487`) — on a shared workstation they would leak the prior operator's drawer entity UUIDs and typed search text (often customer names) to the next operator before `auth.me` resolves.

### Notable actions / derivation helpers
- `setActiveView` (`:215-233`): pushes a `RouteHistoryEntry` for the prior view, resets focus, derives `activeQuickLaunch` from `launchForView(view)` (`:555-564`), sets announcement.
- `setSelectedRows` (`:251-259`): stores rows, infers the drawer entity via `inferDrawerEntity(view,row)` (`:566-590`), ensures a default drawer entry, and bumps a `peek` drawer to `standard` when rows exist.
- Drawer width model: `toggleDrawer` is a binary toggle closed↔last-used (`:342-359`, TER-1630); `cycleDrawer` (shift) cycles `standard → wide → focus → standard` (`:362-372`); `setDrawerState`/`setDrawerTab` operate on the active entity's keyed entry.
- `goBackRouteHistory` (`:391-408`): pops `routeHistory` (capped at 20 by `pushRouteEntry`, `:592-595`) and restores view + drawer entity + drawer state.
- `pushToast`/`dismissToast` (`:409-418`): toasts get a `crypto.randomUUID()` id; pushing also sets `announcement`.
- `resetSession` (`:428-449`): clears entity-specific session state on logout (selected rows, drawer refs, filters, sales sheet, customer context, pick filters, ledger drafts) but **preserves** persisted operator prefs.

### Drawer keying helpers (exported, `uiStore.ts:506-553`)
`drawerStorageKey(view, entity)` → `"{view}:queue"` for queue/no-id, else `"{view}:{type}:{id}"` (`:506-508`). `defaultTabForEntity(type)` maps entity type → default tab (`:516-535`). `activeEntityForState`, `storedDrawerForState`, `drawerStateNameForState`, `currentDrawerForState` are pure selectors reused by ContextDrawer / Hotkeys / IdentityRibbon.

### Cross-tab sync (`src/client/store/uiStoreStorageSync.ts`)
`registerUiStoreStorageSync()` adds a `storage` event listener (`:71`) keyed on `'terp-agro-ui'` (`:30`). On a foreign-tab write it calls `useUiStore.persist.rehydrate()` (`:60`) so only the persisted allow-list replays — transient entity/filter state is untouched (preserves the shared-workstation guarantee). Edge cases handled: unrelated keys ignored; `newValue === null` (logout/clear) ignored to avoid clobbering live state (`:57`); rehydrate rejection logged as a warning; SSR no-op (`:35`); idempotent double-registration (`:41-48`).

---

## 2. Identity Ribbon (`src/client/components/IdentityRibbon.tsx`)

**Function:** thin context bar above the workspace showing the active view label, the selected row's title/detail/status, a Back button, and a Leave-context button.

**Context / use case:** orients the operator to "what am I acting on" once a grid row is selected (or a sales customer is in context). Only rendered when `CANVAS_GRAMMAR_ENABLED` (`App.tsx:115`).

**Wiring (props/state/queries):** no props. Reads `activeView`, `selectedRows`, `activeCustomerId` from uiStore (`:36-38`). `row = selectedRows[activeView]?.[0]` (`:46`). For sales customer context it resolves a name from `trpc.queries.reference` (enabled only when `activeCustomerId` set, `:43-44`). `buildIdentity()` (`:75-86`) returns `null` (component renders nothing, `:49`) unless there's a row or a sales customer. Renders `<StatusPill status={identity.status} />` (`:66`).

**Edge cases:** `leaveContext()` (`:51-55`) clears selected rows, clears `activeCustomerId` only on the sales view, and resets the drawer entity to `queue`. Back button calls `goBackRouteHistory`. `viewLabels` (`:9-33`) is an exhaustive `Record<ViewKey,string>` — adding a new `ViewKey` requires a label here or the ribbon shows `undefined`.

---

## 3. Context Drawer + URL sync (`src/client/components/ContextDrawer.tsx`, `src/client/hooks/useDrawerUrlSync.ts`)

**Function:** the right-hand entity inspector. One drawer per (view, selected-entity) keyed in `drawerByView`; tabs are entity-type-specific. Holds five width states: `closed | peek | standard | wide | focus` (`DrawerStateName`).

**Context / use case:** when a row is selected, the drawer surfaces relationship/balance/lines/history/etc. for that entity without leaving the grid.

**Wiring:** reads `activeView`, `selectedRows`, `activeDrawerEntityByView[activeView]` and the stored drawer via `storedDrawerForState` (`:136-141`). `drawerTabs` (`:27-125`) is the master tab registry per entity type (queue, customer, vendor, lot, order, salesOrder, po, vendorBill, payment, pick, connector, recovery, closeout, report, settings). `activeTab` falls back to `defaultTabForEntity` when the stored tab is invalid (`:148`).

- **Width controls:** header toggle button — plain click `toggleDrawer`, shift-click `cycleDrawer` (`:192-200`).
- **Focus trap:** `useFocusTrap(drawerOpen, () => setDrawerState(view,'closed'))` (`:158`) traps Tab inside the drawer (Escape is handled globally by Hotkeys). When open it renders `role="dialog" aria-modal="true"` (`:179-180`).
- **Closed state:** renders a slim "Context" reopen rail unless entity is `queue` with no row, in which case it returns `null` (`:160-169`).
- **Content router `ContextDrawerContent` (`:231-433`):** large `if (activeTab===… && isXEntity)` ladder delegating to drawer-tab components (`PoLinesTab`, `LotMovementTab`, `SalesPricingTab`, `VendorBillDetailsTab`, `CustomerCreditPanel`, etc.). It fetches `trpc.queries.relationshipSummary` (enabled when a customer or vendor id is inferable, `:235`) and `trpc.queries.salesOrderLines` for the active salesOrder (`:264-267`). The `output` tab builds and downloads a sales-sheet CSV via `buildSheetCsv` reading `salesSheetState` + `showMargin` (`:314-337`).
- **Relationship render (`RelationshipContext`, `:436-477`):** computes "Owes us" / "We owe them" / dual-role net position (CAP-022), plus mini-row lists.

**URL sync (`useDrawerUrlSync`, TER-1601):** called from ContextDrawer (`:152`). On mount it restores `?drawer=&entityType=&entityId=` if present (`:38-49`); on every drawer/entity change it writes those params with `{ replace: true }` (no history spam, `:53-79`). Browser Back/Forward thus restores drawer state. **Edge case/security:** entity UUIDs appear in the URL bar (same exposure as a detail page); data stays auth-gated, and `resetSession` clears in-memory state on logout (`useDrawerUrlSync.ts:19-22`).

---

## 4. Status-aware primary action pattern (`src/client/views/OperationsViews.tsx`)

**Function / pattern:** one prominent "primary" button whose **label, icon, and disabled state are derived from the selected row's `status`**, so the operator always sees the single correct next step in a lifecycle.

**Canonical examples:**
- Purchase orders: `purchaseOrderPrimaryLabel(status)` returns `Finalize PO → Approve PO → Receive PO → Received` across `draft/finalized/approved.../received` (`OperationsViews.tsx:1004-1010`); `purchaseOrderPrimaryDisabled(status)` disables on terminal `received/cancelled` (`:1012-1014`). The button at `:862` / `:895` binds `disabled={… || purchaseOrderPrimaryDisabled(selectedPoStatus)}` and `onClick={runPurchaseOrderPrimary}`.
- Vendor payouts: `vendorPrimaryLabel` (`approved→Schedule`, `scheduled→Pay`, `paid→Paid`, `:1965-1967`) + `vendorPrimaryDisabled` (`:1972`) + status icon helper (`:1976-1977`); button at `:1878`.
- Sales/orders: Confirm vs Post split (`confirmSalesOrder` `:1114`, `handlePostOrder` `:1118`).
- Connectors: Route is primary; Approve/Reject secondary (`:2467-2469`).

The shared mechanic: a pure `…Label(status)` + `…Disabled(status)` helper pair drives a single `primary-button`, executing through `useCommandRunner().runCommand`.

---

## 5. Command Palette + Hotkeys

### Command Palette (`src/client/components/CommandPalette.tsx`, TER-1633)
**Function:** unified spotlight overlay with **two tabs** in one component: **Commands** (⌘K) and **Entities** (⌘⇧F). Replaced the retired standalone GlobalFinderPanel (`:1-11`).

**Wiring:** reads `commandPaletteOpen`, `commandPaletteAdvancedOpen`, `commandPaletteTab` from uiStore (`:58-63`); `useFocusTrap(open, ()=>setOpen(false))` (`:64`). Returns `null` when closed (`:130`).
- **Commands tab:** fires `trpc.queries.globalSearch` on every keystroke once `query.length>1` (`:105-108`); also filters `reference.data.commands` client-side with `commandAliasText` alias expansion (`:117-121`, aliases `:494-516`). "Start work" launch actions (`launchActions`, `:40-54`) are visibility-filtered by `viewVisibleForUser`/`startVisibleForUser` (`:123-128`). Running a command (`run`, `:137-146`) merges `contextPayload` (selected ids + source view, `:132-134`) with the operator's advanced JSON textarea (parse failure falls back to context payload). Advanced panel shows current context JSON + payload editor (`:339-353`).
- **Entities tab:** debounced 200ms search (`:87-90`), `trpc.queries.globalSearch` enabled when `entityDebounced.length>1` (`:110-113`), filtered by a **frame** chip (`all/sales/inventory/procurement` → `FRAME_GROUPS`, `:32-37`). Selecting a result calls `navigateEntity` → sets view, selects the row, sets drawer entity to `standard` (`:190-215`).
- **Entity→view/drawer mapping:** `viewForEntity` (`:465-481`) and `drawerTypeForEntity` (`:454-463`); `connector`/`command` types route into the settings view tabs (`:148-165`, `:190-207`).

**Edge cases:** all tab-local state (`query`, `payloadText`, `entityQuery`, frame) resets when the overlay closes (`:93-101`); `maxLength={200}` on inputs; backdrop click closes (`:238`); empty-result and "type 2+ chars" affordances (`:335-337`, `:400-410`).

### Hotkeys (`src/client/components/Hotkeys.tsx`)
**Function:** global `keydown` listener (window-level, `:177`) returning `null` (no DOM).

Key bindings:
- ⌘K → `openPalette('commands')` (`:56-61`); ⌘⌥K → open advanced (`:51-55`); ⌘⇧F → `openPalette('entities')` (`:63-67`).
- Escape ladder (`:69-85`): closes drawer → palette → focus mode, in that priority.
- `]` (BracketRight) toggles drawer; Shift+`]` cycles width (`:89-94`).
- Digit `1–5` while drawer open selects a drawer tab via `tabForIndex(view,index)` (`:96-102`, table `:212-231`).
- `f` (no meta) toggles focus mode (`:106-110`).
- ⌘`1–6` switches views via `numberViews` map (`:8-15`, `:114-123`); if the lane isn't visible for the operator it pushes a "lane not part of this workspace" toast (`:117-120`).
- Action hotkeys (`d` duplicate intake, ⌥⇧R mark Ready, ⌥I process intake, Enter confirm/post/allocate) run through `useCommandRunner` (`:130-174`).

**Edge cases:** `isEditingText(target)` (`:205-210`) suppresses ⌘K and most hotkeys while typing in inputs/contenteditable; destructive/command hotkeys are guarded when any `[role="dialog"]` is open (`:128`), but Escape/⌘K/nav remain unguarded by design.

---

## 6. Operator Grid (`src/client/components/OperatorGrid.tsx`)

**Function:** the universal AG Grid wrapper used by every desktop list view. Wraps `<WorkspacePanel>` and renders `<AgGridReact>` (ag-grid-community + ag-grid-react, `:1-2`).

**Props (`OperatorGridProps`, `:47-71`):** `view`, `title`, `subtitle`, `rows`, `columns`, `loading`, `isError`, `onRetry`, `actions`, `selectionActions`, `onSelectionChange`, `onCellCommit`, `emptyTitle/emptyChildren`, `tableKey`, `rowClassRules`, and `expansionConfig` (master/detail).

**Selection model:** `rowSelection` is `multiRow`, checkboxes off, click-to-select (`:169-177`); `cellSelection` is `range` mode (`:178`). `onSelectionChanged` reads `getSelectedRows()`, stores locally, calls `onSelectionChange`, and clears range stats (`:464-470`).

**Range stats (range selection):** `onRangeSelectionChanged` (`:273-317`) walks all cell ranges, accumulates numeric values per column field, and emits `CellRangeStat[]` (total/average/count/min/max) into `<SelectionSummary cellRangeStats=…>` (`:479`).

**Column prefs persistence:** `defaultColDef` enables sort/filter/resize/group/pivot/value (`:115-129`). Column moves/resizes/visibility/pins/sorts persist to `gridColumnPrefs[tableKey]` via `persistColumnState` → `columnStateToPrefs` (`:251-255`, handlers `:456-462`); `tableKey` defaults to `view:{view}` (`:102`). On grid-ready, stored state is applied (`applyColumnState`) or `sizeColumnsToFit()` (`:447-454`). The Columns menu (`ColumnsMenu`, `:495-569`) toggles visibility and resets layout.

**Quick filter + chips:** the toolbar input writes `gridFilters[view]` via `writeQuickFilter` and pushes free text into AG Grid's `quickFilterText` (`:242-249`). `field:value` tokens parse into removable chips (`parseGridFilter`/`filterChips`/`removeFilterChip` in `gridFilterUtils.ts:10-71`); chips render at `:381-401`.

**Cell editing:** `tabToNextCell` (`:181-211`) confines Tab navigation to editable columns and wraps to the next row. `onCellEditingStarted/Stopped` flip `uiStore.isCellEditing` (`:471-472`) so peer socket invalidations defer (GH #409). `undoRedoCellEditing` enabled (`:417`).

**Renderers / decoration:** `withStatusRenderer` swaps the `status` column for `<StatusPill>` (`:589-604`); `withCreatedAtFormatter` formats `createdAt` (`:606-616`); `withRowNumbers` prepends a pinned `#` column (`:618-640`); `formatGridValue` renders arrays/objects/dates compactly (`:571-587`).

**Master/detail expansion:** when `expansionConfig.enabled`, a pinned chevron column is injected (`:137-161`) and `detailCellRenderer` renders `<ExpansionPanel>` (`:426-437`); `isRowMaster` decides which rows expand (`:438-446`).

**A11y:** `localeText` pins accessible names for AG Grid filter/sort/menu affordances (`:217-235`); `aria-busy={loading}` on the shell (`:402`).

**States:** error → retry block (`:403-408`); empty → `<EmptyState>` (`:475-477`); footer always renders `<SelectionSummary>`, `<RowCommandHistoryDrawer>`, `<RelationshipDrawer>`, `<IssueSidecar>` (`:479-482`).

---

## 7. Inventory/Product Finder + Advanced Filter Builder + saved filters + facets

### InventoryFinderPanel (`src/client/components/InventoryFinderPanel.tsx`, CAP-005)
**Function:** the sales-builder product picker — searches posted on-hand batches, layers an advanced filter, supports saved "Views", per-row qty + Add, and a compare/offer flow.

**Data:** rows come from `trpc.queries.reference` `availableBatches` (`:164`, `:201-209`); saved filters from `trpc.filters.listSavedFilters({targetView:'inventory'})` (`:165`); `me` for global-filter management rights (`:166`). `saveFilter` mutation invalidates the list on success (`:168-172`).

**Facets:** derived client-side from the row set — categories/tags/locations/ownership uniqued, vendors from reference (`facets` memo, `:211-219`).

**Search/filter:** `parseFinderSearch` extracts price caps ("under $X") and stop-word-filtered terms (`:1011-1028`); `filtered` memo applies term match over a built haystack, price cap, and `evaluateFilterGroup(rowWithAge, advancedFilter)` (`:245-278`). Circuit breaker truncates >10k rows (`:248-251`); results capped at 80 (`:277`). `ageDays` is computed via `calculateAgeDays` when absent (`:266`).

**Two-step "Add filter" dropdown:** field-group → operator → value, with field-type-aware operators (`getOperatorsForField`, `:114-151`) and facet-backed value inputs (`renderAddFilterValueInput`, `:355-423`); commit appends a condition (`:425-443`).

**Saved Views strip:** chips toggle slices (`toggleSlice` merges all active slices into one AND group, `:299-322`); "Save current" popover persists via `saveFilterMutation` (`:343-353`); "Manage views" opens `<SavedFiltersManager>` (`:737-746`).

**Add flow + edge cases:** `defaultQtyFor(row)` is UOM-aware — uses `casePack` when >0 else `'1'` (`:960-965`, TER-1618 F-27); `add()` clamps requested to available (`:333-341`). "Avail" cell shows an amber "in draft" chip when `draftReservedQty>0` (`:872-878`, TER-1634 F-28). `copyFinderOffer` only copies rows whose `mediaStatus` is share-ready (`:1083-1096`). "Why shown" column surfaces `matchReasons` (`:1030-1068`).

### AdvancedFilterBuilder (`src/client/components/AdvancedFilterBuilder.tsx`)
**Function:** recursive AND/OR condition-group builder. Takes a controlled `FilterGroupInput` + `onChange` (`:6-16`). Facets come from `trpc.filters.getFacets` (`:17`). Mutations clone via `structuredClone` and operate at a `groupPath` (`addCondition`/`addGroup`/`removeCondition`/`updateCondition`/`toggleLogic`, `:19-78`). Nesting capped at depth 5 (`:177-178`). `getGroupAtPath` (`:526-559`) hard-validates path segments (integer/bounds/type) and throws on malformed paths. Operators and value inputs are field-type-aware, including facet dropdowns for category/subcategory/brand/vendor/tags and between-range inputs (`:274-477`).

### SavedFiltersDropdown (`src/client/components/SavedFiltersDropdown.tsx`)
Splits filters into Global vs Personal optgroups (`:11-12`) and renders a top-5-by-recency chip row plus a `<select>` (`:14-18`, `:20-64`). Pure presentational — `savedFilters`/`selectedId`/`onSelect` props only.

### SavedFiltersManager (`src/client/components/SavedFiltersManager.tsx`)
Rename/delete management with inline edit + delete-confirm states (`:19-23`). `canEdit` enforces the permission rule: global filters require manager/owner regardless of creator; personal filters require creator match (`:34-39`). Uses `trpc.filters.updateFilter`/`deleteFilter` with per-op error strings (`:25-32`). Renders Global vs My groups (`:185-190`).

---

## 8. Dashboard / Today Focus / My Drafts / Work Queue (`src/client/views/DashboardView.tsx`)

**Function:** the owner daily-decision landing view. Polls three queries on a 15s interval: `dashboard`, `workQueue`, `myDrafts` (`:30-35`); drilldown is lazy on `drilldownMetric` (`:32`).

- **KPI cards** map `dashboard.data.metrics` → `<KpiCard onOpen={setDrilldownMetric}>` (`:132-136`).
- **Today Focus** ranks work rows via `workUrgencySort`/`urgencyScore` (`needs_fix/failed`=100, ready/confirmed=80, …, `:356-370`) and shows the top 3 plus 5 KPI tiles wired to drilldown/navigate (`:138-202`).
- **Money Buckets** (`:205-222`) and **Pending work queues** (`:249-273`) — queue rows navigate and optionally pre-apply a grid filter via `QUEUE_FILTER` + `setGridFilter` (`:19-23`, `:251-267`).
- **Your drafts** (TER-1632) renders `myDrafts` rows only when non-empty (`:224-245`).
- **My Open Work** is an `<OperatorGrid>` with a Matchmaking-only `expansionConfig` (dismiss-for-30-days action, `:37-84`).

**Server queries:**
- `dashboard` → `getDashboardData(role)` (`queries.ts:124`; `metrics.ts:45-…`). Sensitive money metrics (`cash/receivables/payables/inventory_value/moneyBuckets/debt`) are **manager-gated** — non-managers get `null`/empty (`metrics.ts:47-62`). Returns `metrics[]`, `pendingQueues`, `moneyBuckets`, `recentActivity` (last 12 journal rows), `health`.
- `workQueue` (`queries.ts:527-638`): a big `union all` across intake/PO/sales/payments/vendor/connector/fulfillment plus an optional matchmaking union (gated by `matchmaking_settings.work_queue_enabled` and a clamped score threshold, `:531-585`); excludes items dismissed within 30 days; limit 100.
- `myDrafts` (`queries.ts:2143-2192`): draft POs and sales orders attributable to `ctx.user.id` (via `ordered_by` or a `command_journal` create record); ordered newest first.
- `drilldown` (`queries.ts:485-491`): manager-gated for sensitive metric keys, returns source rows.

---

## 9. Global search (`globalSearch`, `queries.ts:967-1009`)

Single `q` (trimmed, 1–200 chars). Runs 12 parallel `ilike` queries (customers, vendors, purchaseOrders, orders, invoices, payments, batches, customerNeeds, vendorStock, picks, connectors, commands), each `limit 8–12`, returning `{ groups: {...} }` where each row carries `id`, `label`, `detail`, `type`, and a relationship id (`customerId`/`vendorId`). Batch rows compute an `alias` vs `canonical` source flag (`:982-983`). Consumed by both Command Palette tabs (Section 5).

---

## 10. KPI cards & pills

### KpiCard (`src/client/components/KpiCard.tsx`)
Clickable card; `onClick → onOpen(metric.key)` (`:6`). Severity dot colors by `metric.severity` (`good/watch/bad/neutral`, `:13-21`) with an `sr-only` severity label (`:22`). Renders value + 2-line-clamped definition.

### StatusPill (`src/client/components/StatusPill.tsx`)
Maps ~18 statuses to tone classes (`toneByStatus`, `:3-22`) and re-labels `routed → "in progress"` (`:24-26`). **A11y (phase7):** non-color shape indicator — circle for active statuses, diamond for warnings, square otherwise (`:38-56`), plus `sr-only` category ("Active"/"Warning"/"Inactive", `:32-36`). Unknown statuses fall back to a neutral zinc tone (`:45`).

### CountPill (`src/client/components/CountPill.tsx`)
Navigable count badge. On click optionally applies `setGridFilter(filterView, filterValue)` then `navigate(route)` (`:49-54`). Renders even when count is 0; reuses the `selection-pill` class. Default aria label `"{count} items — click to view"` (`:58`).

---

## 11. Selection Summary (`src/client/components/SelectionSummary.tsx`)

Aggregation bar rendered under every grid. Returns `null` when no rows and no range stats (`:49`). Two modes:
- **Range mode** (when `cellRangeStats` present): shows total cell count + per-column sum/avg/count for up to 4 numeric columns (`:69-79`).
- **Row mode:** sums known numeric fields (`sumFields`, `:45`) across selected rows with total/avg/count (`:80-91`), plus a validation-issue warning pill aggregating `row.validationIssues` (`:92-97`).
Action buttons (Relationship/Issue/History) appear conditionally — `hasRelationship` requires a customer/vendor id or clients/vendors view (`:122-125`); `hasIssueSurface` limited to clients/orders/payments (`:127-130`). `aria-live="polite"` (`:67`).

---

## 12. Inline expansion panels (`ExpansionPanel.tsx`, `ExpansionChevronColumn.tsx`)

`ExpansionPanel` (`ExpansionPanel.tsx:13-84`) renders an always-visible Actions section plus collapsible History and Child-Items sections, each toggled by a keyboard-accessible `role="button"` header (Enter/Space, `:32-53`, `:57-79`). Renderers are injected from the grid's `expansionConfig`. `ExpansionChevronCell` (`ExpansionChevronColumn.tsx:10-34`) is the AG Grid chevron cell — `stopPropagation` so toggling doesn't select the row, with `aria-expanded` and Enter/Space handling.

---

## 13. Row Command History Drawer (`src/client/components/RowCommandHistoryDrawer.tsx`)

**Function:** per-row audit drawer showing inventory movements + the command journal for a row, with manager-gated reverse.

**Wiring:** queries `trpc.queries.relatedCommands({entityId})` and `trpc.queries.inventoryMovements({batchId})`, both enabled only when `row?.id` exists (`:14-15`). `me` gates reverse to manager/owner (`:25`). `useFocusTrap(Boolean(row), onClose)` (`:22`). Renders `null` when no row (`:24`).

**Each command card:** shows label (`commandLabelFor`), actor·status, reason/error, a `<details>` before/after snapshot, and a Preview/Reverse button disabled unless `status==='ok' && !reversedByCommandId && canReverse` (`:57-83`), running `reverseCommandById` via `useCommandRunner`.

**Server:** `relatedCommands` (`queries.ts:854-889`) accepts `entityId` or `contactId`; for a contact it expands to all linked entity ids (customer/vendor/referee/processor) and matches `affected_ids && $1::uuid[]`, newest 25.

---

## 14. Toasts & confirm dialogs

### ToastCenter (`src/client/components/ToastCenter.tsx`)
Renders `uiStore.toasts` bottom-right plus a visually-hidden `aria-live="polite"` region echoing `uiStore.announcement` (`:21-23`). **Auto-dismiss edge case (UX-A4):** success/info toasts auto-dismiss after 4200ms; **error toasts persist** until clicked (`:13-16`). Each toast is a button that dismisses on click; tone drives color (`:26-38`).

### Confirm primitive (`confirmStore.ts`, `useConfirm.ts`, `ConfirmRoot.tsx`)
Promise-based confirmation. `confirmStore` (`confirmStore.ts:30-45`) holds a single `pending` request; `show(opts)` returns a `Promise<boolean>` resolved by `settle(value)`. `useConfirm()` (`useConfirm.ts:20-22`) returns the stable `show`. `ConfirmRoot` (`ConfirmRoot.tsx:22-119`) portals to `document.body`, is focus-trapped with the primary button DOM-first (auto-focused) but visually right via `flex-row-reverse` (`:96-114`). Edge cases: Escape → cancel (`:32`); backdrop click cancels unless `persist:true` (`:45-47`); `tone:'danger'` styles the primary button (`:51-54`); rich `ReactNode` bodies widen the dialog (`:56-60`). Returns `null` with no pending (`:34`).

---

## 15. Empty & error states

### EmptyState (`src/client/components/EmptyState.tsx`)
Dashed-border centered placeholder; `role` defaults to `status` (`:3-5`). Title + optional children.

### ErrorBoundary (`src/client/components/ErrorBoundary.tsx`)
Class component (`:33-94`) wrapping the app root. `getDerivedStateFromError` captures the error; `componentDidCatch` forwards to optional `onError` (`:36-42`). Recovery UI (UX-06): **Try again** resets state (preserves sibling drafts) as the primary path; **Reload page** is secondary (`:44-50`, `:74-89`). Shows the raw error message only in dev (`isDev` prop overridable for tests, `:56-59`, `:71-73`); `role="alert"`.

---

## 16. Feedback capture (`src/client/components/FeedbackCapture.tsx`)

Loads the Crikket "Report Issue" launcher SDK. Renders `null` (side-effect only). On mount it fetches `/api/client-config` for runtime config (`:62-67`), falls back to `VITE_CRIKKET_*` env (`:131-136`), and no-ops when disabled or keyless (`:128-132`). Injects the script once (idempotent via `SCRIPT_ID`/`scriptPromise`/`didInit`, `:69-91`, `:143-146`), then re-positions the launcher by injecting CSS into the Crikket shadow root, retrying up to 200×50ms until the root appears (`:104-118`). Failures log a warning, never throw (`:150-152`).

---

## 17. Receipt preview overlays

### ReceiptPreviewDrawer (`src/client/components/ReceiptPreviewDrawer.tsx`)
Intake-side preview of what `postPurchaseReceipt` would produce for an order's pending batches. Computes `previewBatchIds` from batches in `draft/ready/needs_fix` (`:16-20`), queries `trpc.queries.receiptPreview({batchIds})` (enabled when non-empty, `:22-25`). Renders vendor/row-count/total/ok-or-conflicts pills and a line table; handles loading/error/empty-batches (`:89-95`). Focus-trapped (`:14`); `null` when no order.

### ReceiptPreviewOverlay (`src/client/components/ReceiptPreviewOverlay.tsx`)
Full-screen finalized-PO receipt viewer with External/Internal tabs. External via `purchaseOrderExternalReceipt`; Internal via `purchaseOrderInternalReceipt` **enabled only for manager/owner** (`:41-48`); the Internal tab button is disabled otherwise (`:98`) and an "INTERNAL — DO NOT SEND" watermark is always in the DOM, hidden by class in external mode (`:114-120`). `handlePrint` toggles a `print-receipt-only` body class around `window.print()` (`:57-63`). Local `ProjectionLike` types mirror server projections without a client→server import (`:11-27`).

---

## 18. Socket-driven live updates (`src/client/context/SocketContext.tsx`)

**Function:** one socket.io connection per session, driving targeted React Query invalidation + peer toasts. Mounted as `<SocketProvider>` (desktop only; mobile has its own path, `:8-9`). Exposes `subscribeOrder`/`unsubscribeOrder` for per-order rooms (`:22-27`, `:155-161`).

**Connection:** opens `io(VITE_SOCKET_URL ?? '/', {withCredentials:true})` once `me.data` resolves (`:64-67`); closes on unmount.

**Events handled:**
- `command:completed` (`:87-105`): invalidates queries referencing `affectedIds` via `invalidateAffectedQueries`; peer (non-self) toasts are **debounced 2s** and coalesced to "N team actions completed" (GH #408, `:72-104`). **GH #409:** while `isCellEditing`, invalidations are buffered into `pendingPeerIds` and flushed when editing ends (`:55-62`, `:90-95`), showing one "Inventory updated by another user…" info toast.
- `command:failed` (`:108-111`): error toast for peer failures + targeted invalidation.
- `pick:queue` (`:114-118`): invalidates any query whose key includes `pickQueue`.
- `onAny` (`:124-145`): `pick:order:{id}` and `sales:order:{id}:line:changed` invalidate by order id (and pickQueue), received only for explicitly subscribed order rooms (GH #329).

### Targeted invalidation (`src/client/components/useCommandRunner.ts`)
`buildAffectedQueryPredicate(affectedIds)` (`:21-41`) returns `()=>false` for empty ids (no full-cache refetch) else a substring-match predicate over stringified query keys. `invalidateAffectedQueries` (`:50-56`) applies it. `useCommandRunner` (`:58-88`) is the universal write path: `commands.run` mutation toasts result, invalidates by `affectedIds` (#44), and **forces a non-null journal reason** — falls back to `Internal: ${name}` when caller omits/under-supplies one (`:79-84`), with an auto `idempotencyKey` (`:84`).

### tRPC client (`src/client/api/trpc.ts`)
`createTRPCReact<AppRouter>()` (`:6`); `httpBatchLink` with `superjson` transformer, URL `VITE_TRPC_URL ?? '/trpc'`, `credentials:'include'` (`:8-23`).

---

## 19. Supporting hooks

- **useFocusTrap** (`src/client/hooks/useFocusTrap.ts`): traps Tab within a container, focuses the first focusable on activate, restores focus on teardown, and calls `onClose` on Escape (`:35-84`). Used by ContextDrawer, CommandPalette, ConfirmRoot, RowCommandHistoryDrawer, ReceiptPreviewDrawer.
- **useDrawerUrlSync** — see Section 3.
- **useConfirm** — see Section 14.
- **usePickWorkLoopGuard** (`src/client/hooks/usePickWorkLoopGuard.ts`): route guard for `/pick` (CAP-030). Managers/owners always allowed; viewers and non-`warehouse` operators are redirected to `/dashboard` (`:14-33`).

---

## Cross-cutting notes / gotchas

- **Feature flag:** Keel, IdentityRibbon, and ContextDrawer only render under `CANVAS_GRAMMAR_ENABLED` (`App.tsx:114-120`). The classic `TopBar` is an alias of `Keel` (`Shell.tsx:296`).
- **Access policy:** nav items, keel chips, palette launches, and ⌘number hotkeys are filtered through `viewVisibleForUser`/`startVisibleForUser` (`Shell.tsx:124,206`; `CommandPalette.tsx:125`; `Hotkeys.tsx:117`).
- **Logout hygiene:** `Keel` logout success runs `resetSession()` + `persist.clearStorage()` then invalidates `auth.me` (`Shell.tsx:194-204`).
- **Manager-gating recurs everywhere:** dashboard money metrics, drilldown, grid sensitive columns (`queries.ts:135-145`), recovery payloads, internal receipts, and reverse actions all check `canRole(role,'manager')` or role equality.
