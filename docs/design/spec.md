# TERP Agro Frontend Direction — Design Spec

- **Date**: 2026-05-11
- **Status**: brainstorm complete → awaiting approval → writing-plans
- **Scope**: frontend density / hierarchy / contextual-access pass. **No backend changes.**
- **Audience**: implementation agents executing the next TERP Agro frontend pass.
- **Companion artifacts**: `docs/design/wireframes/01-diagnosis.html` through `07-wireframes-batch-4.html` (rendered HTML wireframes W1-W28).

---

## TL;DR

The TERP Agro app is functionally complete (54 commands / 27 queries, parity green, MR-001..MR-052 + TA-001..TA-048 shipped). The gap is **cohesion and hierarchy**, not capability.

This spec defines:

- **One placement law** with 8 slots — every operator function has exactly one home.
- **Four canvas zones** (Keel · Identity ribbon · Primary work surface · Context Drawer) replacing today's five-band stack.
- **Five drawer states** (closed → peek → expanded → full → max) with tabs swapping by active entity.
- **Status-aware primary action** on every screen, replacing 6-sibling-button cockpits.
- **Inline cells beat strips** wherever rows need editing.
- **Inventory Finder as a global tool** reachable three ways: embedded right rail on Sales, standalone Inventory route Finder mode, `⌘⇧F` overlay anywhere.
- **Purchase Orders rebuilt** with persistent header + status-aware action + drawer Lines tab + Linked-intake traceability ribbon.
- **`QuickStartBar.tsx` deleted**, its 5 launch chips absorbed into the Keel (top strip).
- **One new lane**: Reports (under Decide group). No other IA churn — same 13 existing routes.

28 wireframes (W1-W28) pin every primary state. Backend untouched.

---

## 1. Problem & Operator Paradigm

### 1.1 What's already shipped

- React 18 / Vite / TypeScript / AG Grid / Zustand / TanStack Query / tRPC client.
- Express / tRPC / Socket.io / Drizzle ORM / PostgreSQL backend.
- 54 commands, 27 protected query endpoints, role-aware nav, session auth, idempotent audited command bus.
- 13 operator surfaces (Dashboard · Purchase Orders · Intake · Sales · Orders · Payments · Inventory · Client Ledger · Vendor Payouts · Fulfillment · Connectors · Recovery · Closeout).
- Legacy markers preserved across batches and sales lines (`legacyMarker` / `legacyStatusMarkers`).
- Three independent closeout columns on sales lines: `packed`, `inventoryPosted`, `paymentFollowup`.
- Quick Ledger grid with FIFO / selected / unapplied + auto-buyer-credit on negative money-in.
- `SelectionSummary` sticky footer with sums + issues + ⏱◇⚠⬇ icons.
- `RowCommandHistoryDrawer` · `RelationshipDrawer` · `IssueSidecar`.
- Customer Workspace panel inside `SalesView.tsx`, gated on customer selection.
- Command palette with entity search and legacy-vocabulary aliases.
- Persisted layout (`sideNavCollapsed`, `collapsedPanels`, `activeQuickLaunch`).
- Focus mode + collapsible Quick Start + collapsible side nav.
- Inventory Finder with token search, natural-price parsing, saved slices, compare strip, customer-safe offer copy.

### 1.2 Where it still feels raw (the 9 friction points)

1. **Control-band crush before any row is selected.** Orders shows 6 sibling verbs always (Ready, Post, Reprice, Fulfillment, Pick list, Cancel). PO shows Approve/Receive/Cancel always. Vendor Payouts shows Approve/Schedule/Pay always. Recovery has 3 always-on control bands.
2. **Selection acknowledged but not promoted.** `SelectionSummary` appears as a footer under the grid, not the primary work surface.
3. **Purchase Orders is two grids stacked.** PO grid → click a row → line grid below. No persistent PO header carried into line editing. No status-aware primary.
4. **Inventory Finder locked inside Sales.** The most operator-loved tool is unreachable from Procurement, Intake, Recovery, or standalone scanning.
5. **Customer workspace not durable.** Lives as a panel inside Sales; switching tabs forgets it. No Vendor analog.
6. **Focus mode is binary and lonely.** `WorkspacePanel` returns `null` for siblings when focused, AND `QuickStartBar` returns `null` — operator loses orientation.
7. **Command palette has a JSON payload editor visible in right pane.** Power tool leaks into daily flow.
8. **13 left-nav lanes presented flat.** No spatial grouping for muscle memory.
9. **Density inconsistency.** Dashboard calm; Sales stacks 3 control bands + 2 grids + side panel.

### 1.3 The operator paradigm being designed toward

Seven anchors derived from recording analysis, persona journeys, and audit synthesis:

1. **Row as durable working memory.** A row tolerates uncertain state (`draft` / `needs_resolution`) and ages into a record.
2. **Location is context.** Land on a customer / vendor / PO; do the work *there*.
3. **Math is proof.** Subtotal · available · balance · allocation preview live on the row.
4. **Markers are vocabulary.** Raw legacy text (`C` / `OFC` / `CV` / `T` / `P` / `Iv` / `M`) preserved; normalized fields adjacent, visually distinct.
5. **Receipts and outputs are byproducts of selection.** Any grid selection should be totalable, previewable, exportable.
6. **Money is a ledger row, not a button.** Quick Ledger is the front door; launch chips are convenience starts.
7. **Recovery starts from the row.** Row-level history drawer + reversal preview, not command-search.

### 1.4 Seven principles for this pass

1. **One status-aware primary action per surface.** Secondary verbs collapse into selection-aware menus.
2. **Pre vs. post-selection clarity.** Before selection = start-work affordances. After = primary + tray + impact strip. Same physical row swaps; never stacks.
3. **Persistent context bands.** Customer · Vendor · PO identity stays visible while you work inside them.
4. **Inventory Finder is global.** `⌘⇧F` overlay anywhere; embeddable panel; standalone route's Finder mode.
5. **Selection summary becomes the context strip, not just a footer.** Sums + issues + primary + tray + history/relationship/issue/packet icons, beside the grid.
6. **Focus mode keeps the keel.** Keel + Identity ribbon + Quick Start chips survive focus; only the grid maximizes.
7. **Nav grouping without IA churn.** Same 13 routes (+ 1 new Reports), rendered in 5 muted section dividers (Decide · Procure · Sell · Money · Resolve).

### 1.5 What is explicitly NOT changing

- No new tRPC commands or queries.
- No new database tables or migrations.
- No new auth/role/RBAC behavior.
- No third-party UI library swaps (still React + AG Grid + Lucide + Tailwind tokens).
- No mobile redesign.
- The Customer Workspace stays a panel inside Sales (no promotion to its own route).
- The 13-route IA stays. Adding only Reports as a 14th.
- The audited command bus, role-aware nav, Drizzle/Postgres, session auth all preserved.
- The visual palette (`amber`, `ink`, `line`, `panel`, `zinc` tokens) preserved.

---

## 2. Canvas Grammar

### 2.1 Four zones

Every operations screen uses this shape:

| Zone | Height | Purpose | Survives focus mode? |
| --- | --- | --- | --- |
| **A — Keel** | 44-48px | Global: `⌘K` search + 5 launch chips (Sale · Receive · $ In · $ Out · Purchase) + health pill + user. | Yes |
| **B — SideNav** | 160px wide (or 56px collapsed) | 14 routes in 5 muted groups. | Yes |
| **C — Identity ribbon** | 28px (only when entity active) | Slim. Holds entity name + status pill + key id + `⌘← back` + `✕ leave`. No rich data. | Yes |
| **D — Primary work surface** | flex | Selection-context strip (band-swap) above the grid. | Yes (the focused panel) |
| **E — Context Drawer** | 24px / 280px / 420px / 60% / 100% of pane | Tabbed, right-edge. Five states (see §2.6). | Follows D |

Total chrome above the grid: **~76px when an entity is active, ~48px otherwise.** (Previously ~140px.)

### 2.2 The keel chips (nav-only, no inline forms)

| Chip | Behavior |
| --- | --- |
| `Sale` | Navigate to Sales. Restore recent customer context if any. Otherwise land on customer-pick state. |
| `Receive` | Navigate to Intake. Pre-selection strip has Vendor ▾ + `+ Receive Row`. |
| `$ In` | Navigate to Payments with Quick Ledger focused on a fresh `money_in` row. |
| `$ Out` | Navigate to Vendor Payouts. Pre-selection: Vendor ▾. |
| `Purchase` | Navigate to Purchase Orders. Pre-selection: Vendor ▾ + `+ New PO`. |

No inline `Client ▾` / `Request ▢` / amount / method forms anywhere global. Customer-aware starts remain available via `⌘K Rich Star` → routes to Sales with that customer active.

### 2.3 SideNav grouping (14 routes in 5 groups)

```
Decide       — Dashboard · Reports
Procure      — Purchase Orders · Intake · Inventory
Sell         — Sales · Orders · Fulfillment · Client Ledger
Money        — Payments · Vendor Payouts
Resolve      — Connectors · Recovery · Closeout
```

Group dividers are 9px uppercase headers with 6px top margin — no horizontal rule. Role visibility logic in `navVisibleForUser` unchanged.

### 2.4 Identity ribbon

Activates only when an entity is active. Carries name + status + key identifier + leave/back. Never carries rich data — balances, credit, notes, history all move into Drawer tabs.

Examples:
- `Sales · Rich Star · draft order RS-2026-05-11 · 3 lines [draft]`
- `Purchase Orders · Greenline Farms · PO-DEMO-001 · approved · 12/40 received [approved]`
- `Vendor Payouts · Scott · 4 open bills · $8,420 due`
- `Closeout · period 2026-04 · locked · 0 unsafe rows`

### 2.5 Selection-context strip (band swap)

Same physical row above the grid. Toggles between pre- and post-selection states. **Replaces — never adds to — the pre-selection band.**

**Pre-selection** (no rows selected): minimal start affordances. "What do you want to start?"

**Post-selection** (≥1 row selected):
- `Selection · N` label
- Σ qty / Σ subtotal / Σ total (compact)
- Status-aware **primary** action (green, `⌘↵`)
- `More ▾` tray with 2-4 secondary verbs
- `⏱ ◇ ⚠ ⬇` icons (History · Relationship · Issue · Packet)
- Warning pills inline (e.g., `1 below floor`)

**Disabled-with-reason** when status is mixed. No silent disable.

### 2.6 Context Drawer

Right-edge tabbed drawer. **Five states:**

| State | Width | Layout |
| --- | --- | --- |
| `closed` | 24px nub on right edge | grid full width |
| `peek` | 280px | grid + drawer side-by-side |
| `expanded` | 420px | grid + drawer side-by-side, drawer has tabs visible |
| `full` | 60% of pane | grid compressed to 40%, drawer dominates |
| `max` | edge-to-edge | grid hidden, drawer takes the full pane |

State persisted per route × entity in `uiStore.drawerByView`. Read-only by default — clicks inside the drawer route to that surface and select the row; `⌘←` restores prior drawer state.

**The single exception to read-only:** PO Lines tab is editable, because PO line editing IS the PO's primary work surface. No second grid stacked below the PO grid.

### 2.7 Drawer tab catalog (by active entity)

| Active entity | Tabs |
| --- | --- |
| Customer | Profile · Balance · Purchases · Pricing · Buyer fit · Notes · Recent · Disputes/credits · History |
| Vendor | Profile · Open bills · Payouts · POs · Consignment · Performance · Scheduled · Tools · Notes · History |
| Batch / Inventory row | Movement · Sales (recent) · Reservations · Photos · Sourced from PO · Tags · Transfer · History |
| Order / Sale | Lines · Allocation · Customer card · Pricing · Validation · Output · Fulfillment status · History |
| PO | Lines · Vendor card · Linked intake · Linked receipts · History |
| Vendor bill / Payout | Due reason · Source receipt · Linked PO · Payouts · Consignment trigger · History |
| Payment | Allocations · Customer card · Impact · Buckets · History |
| Pick / Fulfillment | Lines · Order card · Bag/labels · Manifest · Scan history · Tracking · History |
| Connector request | Session/payload · Routing · Review history · Linked order |
| Recovery row (command) | Reversal/Retry · Snapshot diff · Source map · Find/Replace · Correction · Backup · Markers · System · History |
| Closeout period | Control totals · Unsafe rows · Adjustments · Artifacts |
| (Inventory queue, no row) | Tags · Aging · Movement (recent) · Photos queue |
| (Intake queue, no row) | Receipt preview (selection-driven) · CSV import · Lot info · Linked PO |
| Report row | Definition · Export · Saved views |

### 2.8 Focus mode revised

**Today:** `WorkspacePanel.tsx` line ~25 returns `null` for siblings when focused; `QuickStartBar.tsx` returns `null` when `focusedPanelId` is set. Operator loses orientation.

**Revised:**
- Zone A Keel survives focus.
- Zone B SideNav survives focus.
- Zone C Identity ribbon survives focus.
- Zone E Context Drawer follows the focused panel.
- Sibling Zone D panels collapse to header-only (not `null`).
- `Esc` exits focus.

### 2.9 Keyboard model

| Key | Effect |
| --- | --- |
| `⌘K` | Open palette — entities + commands (single pane default; JSON payload editor moves behind `⌘⌥K`). |
| `⌘⇧F` | Global Inventory Finder overlay (search · slice · add to active order if applicable). |
| `/` | Focus active grid's quick filter. |
| `]` | Toggle Context Drawer: closed → peek → expanded → closed. |
| `⇧]` | Cycle expanded → full → max → expanded. |
| `1..5` | Inside drawer, switch tab by index. |
| `⌘↵` | Commit status-aware primary on selected row(s). |
| `⌘D` | Duplicate row (existing on Intake; extend to Sales/PO/Inventory). |
| `F` | Toggle focus mode on current panel. |
| `⌘←` | Navigate back to previous surface; drawer state restores. |
| `Esc` | Close drawer → close palette → exit focus → clear selection (descending scope). |

---

## 3. Placement Law (8 slots, one rule)

**Every operator-facing function lives in exactly one of these eight slots.** No fluid mix.

| # | Slot | Use when | Don't use when |
| --- | --- | --- | --- |
| 1 | Keel | Truly global. | View-specific. |
| 2 | Side nav route | Frequently-visited dedicated surface. | Reachable via row or drawer. |
| 3 | Pre-selection strip | Affordances to start work on this view. | Requires a row to exist. |
| 4 | Selection strip primary + More tray | Status-aware action(s) on selected rows. | Reference content. |
| 5 | Grid column / inline cell | Per-row attribute scanned and edited. | Not a per-row attribute. |
| 6 | Context Drawer tab | Referential / supporting context for active entity. | Needs to be edited inside drawer (except PO Lines). |
| 7 | `⌘K` palette + alias | Power command, rare admin action, anything searched by name. | Daily high-frequency work. |
| 8 | Hotkey | Truly repeated motion (commit, duplicate, filter, drawer, focus). | Anything that isn't repeated. |

**The five questions before adding any new control:**

1. Per-row attribute scanned and edited? → grid column.
2. Obvious primary action for the row at its status? → selection strip primary.
3. Less-frequent but row-specific action? → selection strip `More ▾`.
4. Reference data or supporting context? → drawer tab.
5. Rare admin / power command? → `⌘K` palette + alias.

If a function answers no to all five, it's almost certainly not needed. If it answers yes to multiple, use the smaller surface.

---

## 4. Components — keep · rework · kill · new

### 4.1 Shell + global chrome

| Disposition | File | Change |
| --- | --- | --- |
| KEEP | `src/client/App.tsx` | No change. |
| REWORK | `src/client/components/Shell.tsx → SideNav` | Same 13 routes + Reports. Add 5 muted section dividers. Role visibility unchanged. |
| REWORK | `src/client/components/Shell.tsx → TopBar` | Becomes the **Keel**. Absorbs 5 nav chips from Quick Start. Drawer-toggle icon on right when view has a drawer. |
| KILL | `src/client/components/QuickStartBar.tsx` | File deleted. Inline forms gone. `App.tsx` stops rendering `<QuickStartBar />`. |
| REWORK | `src/client/components/CommandPalette.tsx` | Single-pane default. JSON payload editor moves behind `⌘⌥K`. Aliases stay. |
| REWORK | `src/client/components/Hotkeys.tsx` | Add `]` / `⇧]` / `1..5` / `⌘↵` / `⌘⇧F` / `F` / descending-scope `Esc`. |
| KEEP | `src/client/components/ToastCenter.tsx` | No change. |

### 4.2 Grid + selection

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/components/OperatorGrid.tsx` | When 0 rows selected → renders pre-selection strip. When ≥1 selected → renders selection-context strip. Strips swap, not stack. AG Grid wiring unchanged. |
| REWORK | `src/client/components/SelectionSummary.tsx` | Lifted from footer to header. Adds `primaryAction` prop (status-aware, view-supplied) and `moreActions` tray. |
| REWORK | `src/client/components/WorkspacePanel.tsx` | Focus mode no longer returns `null` for siblings — siblings collapse to header-only. Keel + Identity ribbon survive focus. |
| KEEP | `src/client/components/StatusPill.tsx` | No change. |
| KEEP | `src/client/components/EmptyState.tsx` | No change. |
| KEEP | `src/client/components/KpiCard.tsx` | No change. |
| KEEP | `src/client/components/useCommandRunner.ts` | No change. |

### 4.3 Drawers + context

| Disposition | File | Change |
| --- | --- | --- |
| NEW | `src/client/components/ContextDrawer.tsx` | Right-edge tabbed drawer. 5 states (closed / peek / expanded / full / max). Tabs declared by active view × entity. |
| NEW | `src/client/components/IdentityRibbon.tsx` | Slim Zone C. Renders only when active entity present. |
| NEW | `src/client/components/drawerTabs/*` | Per-tab subcomponents (~30-80 lines each). All backed by existing tRPC queries. |
| REWORK | `src/client/components/RelationshipDrawer.tsx` | Data source for Customer/Vendor drawer tabs. Standalone drawer unmounted. |
| REWORK | `src/client/components/RowCommandHistoryDrawer.tsx` | Becomes `History` tab in `ContextDrawer`. |
| REWORK | `src/client/components/IssueSidecar.tsx` | Becomes `Disputes/credits` (Customer) / `Issue` (Order/Payment) tab. |

### 4.4 Inventory Finder + Quick Ledger

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/components/InventoryFinderPanel.tsx` | Becomes thin wrapper around new `InventoryFinder` core. |
| NEW | `src/client/components/InventoryFinder.tsx` | Extracted core. Accepts `mode: 'embed' \| 'overlay' \| 'standalone'`. Reused 3 ways. |
| NEW | `src/client/components/InventoryFinderOverlay.tsx` | `⌘⇧F` modal overlay. Dimmed backdrop, ESC closes, `]` pins as right rail. |
| KEEP | `src/client/components/QuickLedgerGrid.tsx` | No structural change. May tighten 14-col layout via Notes/Reference expand row. |
| REWORK | `src/client/components/PhotographyQueuePanel.tsx` | Becomes `Photos` tab in Batch context drawer. Standalone panel deprecated. |

### 4.5 Views

| Disposition | File | Change |
| --- | --- | --- |
| REWORK | `src/client/views/DashboardView.tsx` | Add "Today focus" strip. Drop Money-Definitions panel (definitions move to KPI `?` drawer tab). |
| REWORK | `src/client/views/IntakeView.tsx` | Pre-selection: Vendor ▾ + `+ Receive Row`. CSV import + Lot info + Receipt preview move to drawer tabs. |
| REWORK | `src/client/views/SalesView.tsx` | Drop the *existing single-panel* customer header (the `WorkspacePanel panelId="sales:customer-workspace"`). The Customer Workspace *concept* survives, distributed across Identity ribbon (identity) + Drawer tabs (Balance / Purchases / Notes / Pricing / Buyer fit / Recent / Disputes). Suggestions → `Buyer fit` drawer tab. Sheet preview → `Output` drawer tab. |
| REWORK | `src/client/views/OperationsViews.tsx` | Split into per-view files: `PurchaseOrdersView.tsx`, `OrdersView.tsx`, `PaymentsView.tsx`, `InventoryView.tsx`, `ClientLedgerView.tsx`, `VendorPayablesView.tsx`, `FulfillmentView.tsx`, `ConnectorsView.tsx`, `RecoveryView.tsx`, `CloseoutView.tsx`. Each applies band-swap + drawer pattern. `GridJourney` helper stays as shared util. |
| NEW | `src/client/views/ReportsView.tsx` | Chip-row report picker + parameters strip + report grid + drawer Definition tab. |
| KEEP | `src/client/views/LoginView.tsx` | No change. |

### 4.6 State (`src/client/store/uiStore.ts`)

```typescript
interface DrawerState {
  state: 'closed' | 'peek' | 'expanded' | 'full' | 'max';
  activeTab: string;
  entityType: string | null;
  entityId: string | null;
}

// New fields on UiState:
drawerByView: Partial<Record<ViewKey, DrawerState>>;
inventoryFinderOverlayOpen: boolean;

// New actions:
setDrawerState(view: ViewKey, state: DrawerState['state']): void;
setDrawerTab(view: ViewKey, tab: string): void;
setDrawerEntity(view: ViewKey, entityType: string | null, entityId: string | null): void;
openInventoryFinderOverlay(): void;
closeInventoryFinderOverlay(): void;
```

Persisted keys add `drawerByView` to existing `partialize`.

### 4.7 Backend / schema / commands / queries

**No backend changes in this pass** with one possible flagged exception: if `customers.pricingStrategy` / floor data isn't already a clean projection on `queries.salesOrderLines`, a thin additive query may be required to expose `pricingRule` / `ruleFloor` / `ruleReason` for Phase 1's warning pill. Out of scope: new commands, new schema, new auth, new RBAC.

All drawer tabs otherwise render from existing tRPC queries:

`queries.customerWorkspace` · `queries.relationshipDrawer` · `queries.salesSuggestions` · `queries.salesOrderLines` · `queries.purchaseOrderLines` · `queries.receiptPreview` · `queries.paymentAllocations` · `queries.paymentAllocationPreview` · `queries.vendorPayments` · `queries.fulfillmentLines` · `queries.recoverySearch` · `queries.snapshotDiff` · `queries.findReplacePreview` · `queries.reversalPreview` · `queries.supportPacket` · `queries.closeoutPreview` · `queries.drilldown` · `queries.workQueue` · `queries.dashboard` · `queries.reference` · `queries.grid` · `queries.globalSearch`.

### 4.8 CSS

- Palette unchanged: `amber`, `ink`, `line`, `panel`, `zinc` tokens.
- New classes: `.keel`, `.identity-ribbon`, `.context-drawer`, `.context-drawer-peek`, `.context-drawer-expanded`, `.context-drawer-full`, `.context-drawer-max`, `.drawer-tab`, `.drawer-tab-active`, `.selection-strip`, `.pre-selection-strip`.
- Existing `.selection-summary` repurposed for header position.
- AG Grid Quartz theme unchanged.

---

## 5. Wireframe Index (W1-W28)

All rendered HTML at `docs/design/wireframes/`. Each wireframe carries a spec annotation describing its behavior contract.

| # | Surface · state | File |
| --- | --- | --- |
| W1 | Shell · default · 14 routes in 5 groups · drawer closed | `04-wireframes-batch-1.html` |
| W2 | Dashboard · Today focus + KPIs + queues + Unified Work Queue | `04-wireframes-batch-1.html` |
| W3 | Sales · customer pick · drawer closed · Finder visible | `04-wireframes-batch-1.html` |
| W4 | Sales · customer active, no row selected · drawer peek · Balance tab | `04-wireframes-batch-1.html` |
| W5 | Sales · 3 lines selected · drawer expanded · Buyer fit tab | `04-wireframes-batch-1.html` |
| W6 | Sales · drawer FULL · Purchases tab (history while building sale) | `04-wireframes-batch-1.html` |
| W7 | Intake · default · 25-column grid in 4 visual groups · drawer closed | `05-wireframes-batch-2.html` |
| W8 | Intake · 3 draft rows selected · drawer peek · Receipt preview tab | `05-wireframes-batch-2.html` |
| W9 | Purchase Orders · default · PO grid only (no stacked line grid) | `05-wireframes-batch-2.html` |
| W10 | PO selected (approved) · drawer expanded · Lines tab editable | `05-wireframes-batch-2.html` |
| W11 | PO · drawer FULL · Linked intake tab with traceability ribbon | `05-wireframes-batch-2.html` |
| W12 | Inventory · Finder mode toggle (standalone route) | `05-wireframes-batch-2.html` |
| W13 | `⌘⇧F` Inventory Finder overlay over Sales | `05-wireframes-batch-2.html` |
| W14 | Orders · queue with status chips + "Next action" column · drawer closed | `06-wireframes-batch-3.html` |
| W15 | Orders · confirmed order selected · primary Post · drawer Lines tab + impact preview | `06-wireframes-batch-3.html` |
| W16 | Payments · Quick Ledger + payment list · drawer closed | `06-wireframes-batch-3.html` |
| W17 | Payments · unapplied payment selected · primary Allocate FIFO · drawer Allocation tab | `06-wireframes-batch-3.html` |
| W18 | Vendor Payouts · queue · Due reason as first-class column · drawer closed | `06-wireframes-batch-3.html` |
| W19 | Vendor Payouts · approved bill selected · primary Schedule · drawer Due reason tab + trace ribbon | `06-wireframes-batch-3.html` |
| W20 | Fulfillment · pick queue · status chips + "Next action" column · drawer closed | `07-wireframes-batch-4.html` |
| W21 | Fulfillment · pick selected · inline pack cells · drawer Bag/labels tab | `07-wireframes-batch-4.html` |
| W22 | Connectors · queue with inline routeTo + operatorNotes columns · drawer Session tab | `07-wireframes-batch-4.html` |
| W23 | Recovery · command queue with filter chips · drawer closed (tools in drawer) | `07-wireframes-batch-4.html` |
| W24 | Recovery · failed command selected · primary Retry · drawer Reversal/Retry tab | `07-wireframes-batch-4.html` |
| W25 | Closeout · default · current-period card + archived periods grid | `07-wireframes-batch-4.html` |
| W26 | Closeout · period active · primary Fix unsafe rows · drawer Unsafe rows tab | `07-wireframes-batch-4.html` |
| W27 | Reports · default = Revenue · chip-row picker + parameters + chart + grid | `07-wireframes-batch-4.html` |
| W28 | Reports · Aging inventory · row selected · drawer Definition tab | `07-wireframes-batch-4.html` |

---

## 6. Acceptance Criteria — done definition

The frontend pass is complete when a trained operator can demonstrate, without modal wizards and without leaving the keyboard for routine work:

1. **Customer-aware sale start.** From any view: `⌘K Rich Star → ↵`. Lands in Sales with Rich Star active, identity ribbon visible, drawer in peek with Balance tab, first draft line ready to type. Elapsed: <3 seconds, <4 keystrokes after typing the name.
2. **Inventory scanning by remembered fragment.** From any view: `⌘⇧F`. Type `m15` or `25 flex` or `rich`. See matches across source code, notes, markers, vendor, item alias. Press `↵` to add to active order if one exists.
3. **Three closeout cells independent.** On a sales line, `Packed`, `Inv Posted`, `Pay/F-up` toggle individually, each writing its own audited command. Sort and filter by each.
4. **Quick Ledger 5-row mixed entry.** Append 5 rows in Payments: client cash payment, buyer-credit (negative amount auto-flips), vendor payout, transfer, correction. <30 seconds, no modal.
5. **Vendor receipt from selection.** Select 3-4 intake rows. Open drawer Receipt preview tab. See vendor + date conflict checks + live totals. Post in one click with totals matching selection.
6. **Imported markers preserved.** A migrated row with raw `C` / `ofc` / `CV` / `T` markers shows them verbatim in the legacy-marker column on Intake / Inventory / Sales / Orders.
7. **Ambiguous post refused with named candidates.** Try to post an order with two lines pointing at the same source row. Drawer Reversal/Retry tab (after the failed command is selected in Recovery) shows the candidate source rows for resolution.
8. **Row-level reversal preview.** From any posted row's selection strip, hit ⏱ History. Drawer opens at History tab showing last 5 commands. Click "Preview reversal" → drawer pivots to Reversal/Retry tab with plain-language impact before commit.
9. **PO traceability in one glance.** With an approved PO selected, drawer Linked intake tab → trace ribbon at bottom shows `PO → intake rows → receipts → vendor bill → payouts`. Each link routes with state preservation.
10. **Focus mode preserves orientation.** While focused on the Intake grid, the Keel + Identity ribbon + drawer remain functional. `Esc` exits focus.

---

## 7. Phased Implementation Plan

8 phases. Each ships as a chunky atomic PR that keeps typecheck + build + parity + E2E green. **Each phase guarded by feature flag where the public-facing surface changes.**

### Phase 0 — Foundation (canvas primitives)

**Deliverables:**
- `ContextDrawer.tsx` (NEW) — 5 states, tab swap, persistence wiring
- `IdentityRibbon.tsx` (NEW)
- `uiStore.ts` — `drawerByView` field + actions + partialize update
- CSS classes for new components
- `Hotkeys.tsx` — add `]` / `⇧]` / `1..5` / `⌘↵` / `⌘⇧F` / descending-`Esc`
- KILL `QuickStartBar.tsx`; `App.tsx` stops rendering it
- `Shell.tsx → TopBar` becomes the Keel (absorbs 5 launch chips)
- `Shell.tsx → SideNav` adds 5 group dividers + Reports lane

**Acceptance:** typecheck + build + E2E pass. No screen logic changes yet. Visual: keel + groups visible, drawer nub on right of every view.

**Risk:** Removing QuickStartBar without rewiring the launch chips would break the "start a sale from anywhere" flow. Mitigated by Keel absorbing chips in same PR.

### Phase 1 — Sales / Customer Workspace

**Deliverables:**
- `SalesView.tsx` — drop the `WorkspacePanel` customer header; identity ribbon takes over
- `drawerTabs/CustomerBalanceTab.tsx`, `CustomerPurchasesTab.tsx`, `CustomerNotesTab.tsx`, `CustomerBuyerFitTab.tsx`, `CustomerRecentTab.tsx`, `CustomerPricingTab.tsx`, `CustomerDisputesTab.tsx`
- Sales line columns add `pricingRule` / `ruleFloor` / `ruleReason` as **computed projections** in the existing `queries.salesOrderLines` payload, sourcing from `customers.pricingStrategy` (and per-line `unitPrice` vs. customer floor). No new schema, no new commands. If a tighter projection turns out to be needed during build, it's a thin additive query — flagged as the only place this pass might touch backend.
- Below-floor pill component (dismissible per-customer setting on Pricing tab)
- `InventoryFinderPanel.tsx` → wraps new `InventoryFinder.tsx` core
- Add-signal pattern (green tint + `+1 ✓` chip → "just added · in draft")

**Acceptance:** W3 / W4 / W5 / W6 demos pass. Customer workspace works end-to-end without the old panel.

### Phase 2 — Procurement (Intake + PO + Inventory)

**Deliverables:**
- `IntakeView.tsx` — pre-selection slim, CSV/Lot/Receipt move to drawer tabs
- `drawerTabs/IntakeReceiptPreviewTab.tsx`, `IntakeCsvImportTab.tsx`, `IntakeLotInfoTab.tsx`, `IntakeVendorCardTab.tsx`, `IntakeLinkedPOTab.tsx`
- Split `OperationsViews.tsx` (phase-spanning refactor; see Phase 4 note)
- `PurchaseOrdersView.tsx` — status-aware primary cascade · persistent PO header (identity ribbon) · drop the line-grid-stacked-below pattern
- `drawerTabs/POLinesTab.tsx` (the one editable drawer tab) · `POVendorCardTab.tsx` · `POLinkedIntakeTab.tsx` · `POLinkedReceiptsTab.tsx`
- Line-add as last row of line grid (no separate strip)
- Traceability ribbon component (reused in Phase 3)
- `InventoryView.tsx` — Grid / Finder mode toggle
- `InventoryFinderOverlay.tsx` (NEW) — `⌘⇧F` modal
- `drawerTabs/BatchMovementTab.tsx` · `BatchSalesTab.tsx` · `BatchReservationsTab.tsx` · `BatchPhotosTab.tsx` · `BatchSourcedFromPOTab.tsx` · `BatchTagsTab.tsx` · `BatchTransferTab.tsx`

**Acceptance:** W7-W13 demos pass. Operator can scan inventory three ways (embed/standalone/overlay). PO has persistent header + drawer Lines + Linked-intake trace.

### Phase 3 — Money (Payments + Vendor Payouts)

**Deliverables:**
- `PaymentsView.tsx` — Quick Ledger remains primary; old PaymentAllocationTools panel deleted
- `drawerTabs/PaymentAllocationsTab.tsx` · `PaymentCustomerCardTab.tsx` · `PaymentImpactTab.tsx` · `PaymentBucketsTab.tsx`
- `VendorPayablesView.tsx` — VendorBillTools panel deleted; "Due reason" + "Next action" as columns
- `drawerTabs/BillDueReasonTab.tsx` · `BillSourceReceiptTab.tsx` · `BillLinkedPOTab.tsx` · `BillPayoutsTab.tsx` · `BillConsignmentTab.tsx`
- `drawerTabs/VendorOpenBillsTab.tsx` · `VendorPayoutsTab.tsx` · `VendorPOsTab.tsx` · `VendorConsignmentTab.tsx` · `VendorPerformanceTab.tsx` · `VendorScheduledTab.tsx` · `VendorToolsTab.tsx` (manual bill + void payout)

**Acceptance:** W16-W19 demos pass. Money flow has one front door (Quick Ledger) and one explainable due-reason column on vendor side.

### Phase 4 — Sell flow (Orders + Fulfillment + Connectors)

**Deliverables:**
- Finish splitting `OperationsViews.tsx` into per-view files (started in Phase 2)
- `OrdersView.tsx` — 6 sibling actions collapse to status-aware primary + tray + "Next action" column
- `drawerTabs/OrderLinesTab.tsx` · `OrderAllocationTab.tsx` · `OrderCustomerCardTab.tsx` · `OrderPricingTab.tsx` · `OrderValidationTab.tsx` · `OrderOutputTab.tsx` · `OrderFulfillmentTab.tsx`
- `FulfillmentView.tsx` — pack-line inputs become inline cells; old strip deleted
- `drawerTabs/PickLinesTab.tsx` · `PickOrderCardTab.tsx` · `PickBagLabelsTab.tsx` · `PickManifestTab.tsx` · `PickScanHistoryTab.tsx` · `PickTrackingTab.tsx`
- `ConnectorsView.tsx` — `routeTo` + `operatorNotes` become inline columns
- `drawerTabs/ConnectorSessionTab.tsx` · `ConnectorRoutingTab.tsx` · `ConnectorReviewHistoryTab.tsx` · `ConnectorLinkedOrderTab.tsx`

**Acceptance:** W14-W15, W20-W22 demos pass.

### Phase 5 — Resolve (Recovery + Closeout)

**Deliverables:**
- `RecoveryView.tsx` — 3-band layout deleted; one grid + drawer
- `drawerTabs/RecoveryReversalTab.tsx` · `RecoverySnapshotTab.tsx` · `RecoverySourceMapTab.tsx` · `RecoveryFindReplaceTab.tsx` · `RecoveryCorrectionTab.tsx` · `RecoveryBackupTab.tsx` · `RecoveryMarkersTab.tsx` · `RecoverySystemTab.tsx`
- `CloseoutView.tsx` — current-period card + archived grid; period as entity
- `drawerTabs/CloseoutControlTotalsTab.tsx` · `CloseoutUnsafeRowsTab.tsx` · `CloseoutAdjustmentsTab.tsx` · `CloseoutArtifactsTab.tsx`

**Acceptance:** W23-W26 demos pass.

### Phase 6 — Decide (Dashboard + Reports)

**Deliverables:**
- `DashboardView.tsx` — "Today focus" strip added; Money-Definitions panel removed (now in drawer per KPI)
- `drawerTabs/KpiDefinitionTab.tsx` · `KpiDrilldownTab.tsx`
- `ReportsView.tsx` (NEW) — chip-row picker, parameters strip, mini chart, grid, drawer
- `drawerTabs/ReportDefinitionTab.tsx` · `ReportExportTab.tsx` · `ReportSavedViewsTab.tsx`
- Seven report types implemented: Revenue, Aging inventory, Payables due rollup, Cash movement, Vendor performance, Category analytics, Client sales history (each just a `queries.grid` / `queries.dashboard` view shaped client-side)

**Acceptance:** W2, W27-W28 demos pass. Today focus surfaces top 3 actions.

### Phase 7 — Polish + global

**Deliverables:**
- Drawer state persistence across reload verified across all routes
- Focus mode revised behavior across `WorkspacePanel` instances
- `OperatorGrid.tsx` band-swap pattern verified across every view
- Selection summary `primaryAction` + `moreActions` props wired everywhere
- Per-grid `/` filter consistent
- Add-signal animation tightened (CSS transition timing)
- E2E coverage: 10 demo scenarios (Acceptance Criteria above) each becomes a Playwright test
- Accessibility sweep: ARIA labels, focus order, keyboard navigation verified

**Acceptance:** All 10 demos green in CI. No regressions.

---

## 8. Verification Checklist (hard rule from brief)

Every visible button, screen, action, nav item, panel, filter, chart, card, modal, and affordance must be:

- [ ] **Real** — wired to an existing command or query, or to a documented client-side aggregation.
- [ ] **Useful** — solves an operator moment that's in the persona-journey or 67-task inventory.
- [ ] **Operationally justified** — reducing burden, not adding visibility-for-visibility.

Per-surface checklist (applied to all 14 routes):

- [ ] No stubs.
- [ ] No placeholders.
- [ ] No fake affordances.
- [ ] No dead nav.
- [ ] No unwired controls.
- [ ] No decorative metrics.
- [ ] No disconnected workflows.
- [ ] No unnecessary UI.
- [ ] Pre-selection strip has ≤3 affordances.
- [ ] Selection strip primary is status-aware (no static "do everything" buttons).
- [ ] Secondary verbs in tray, not adjacent buttons.
- [ ] Drawer state persisted per route × entity.
- [ ] Drawer is read-only (except PO Lines tab — documented exception).
- [ ] `/` opens grid filter.
- [ ] `⌘↵` commits primary.
- [ ] `]` toggles drawer.
- [ ] `Esc` follows descending scope.

Backend invariants (no change but must remain):

- [ ] Backend/frontend parity stays green (54 commands / 27 queries minimum).
- [ ] Audited command bus untouched.
- [ ] Role-aware nav untouched (`navVisibleForUser`).
- [ ] No new tRPC commands or queries introduced.
- [ ] No new database migrations.

---

## 9. Out of Scope

- Mobile redesign. Connector mobile pick-pack covers warehouse use case.
- Promotion of Customer Workspace to its own route.
- New Vendor Workspace route (Vendor remains a context inside Vendor Payouts).
- New tRPC commands. If a tab needs a tighter projection, it's a thin additive query — out of scope for this design pass.
- Design-system extraction into a separate package.
- Theming / dark mode.
- New auth/role/RBAC behavior.
- Replacing AG Grid or any other UI library.
- Customer Workspace as standalone route (Section 1.5 — Option B from wedge decision was rejected).
- Nav consolidation into modes (Section 1.5 — Option C from wedge decision was rejected).

---

## 10. References

### Source artifacts consumed

- `docs/recording-paradigm-master-ui-ux-recommendations.md` — MR-001..MR-052 master list.
- `docs/paradigm-pass-drift-ledger.md` — TA-001..TA-048 shipped state.
- `docs/opus-recording-paradigm-ui-ux-review.md` — earlier Opus second-pass review.
- `docs/persona-journey-frontend-fit-audit.md` — JY-01..JY-20 journey scoring.
- `docs/ease-of-use-frontend-pass.md` — pre/post density measurements.
- `docs/frontend-interaction-surface-audit.md` — FE-START / FE-FINDER / FE-SHEET requirement matrix.
- `docs/workflow-gap-audit.md` — J01-J10 implementation coverage.
- `docs/purchase-order-completion-report.md` — current PO state.
- `docs/unactioned-findings-atomic-proposal.md` — UF-001+ residual finding set.
- TERP Numbers Master Manifest (provided in-conversation) — cockpit tables, commands, contracts, hotkeys, scenarios, 67-task audit, 28 operational gaps.

### Visual companion files

`docs/design/wireframes/01-diagnosis.html` · `02-canvas-grammar.html` · `02-canvas-grammar-v2.html` · `03-components.html` · `035-coverage-map.html` · `04-wireframes-batch-1.html` · `05-wireframes-batch-2.html` · `06-wireframes-batch-3.html` · `07-wireframes-batch-4.html`.

### GitHub

`https://github.com/EvanTenenbaum/terp-agro-operator-console`

---

*End of spec.*
