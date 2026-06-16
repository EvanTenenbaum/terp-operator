# TERP Feature → Mercury UX Retrofit — Complete Mapping

**Date:** 2026-06-15
**Status:** Architecture reference for implementation
**Predecessor:** `mercury-ux-adoption.md` (engineering plan)

---

## 0. The Design Philosophy Shift

### Current TERP: "Everything Visible"
```
┌─Sidebar──┬─Content Area──────────────────────┬─ContextDrawer─┐
│ Nav      │                                    │ (5 states,      │
│ Groups   │  ┌─Workspace Panel 1───────────┐  │  always         │
│          │  │ Grid 1                       │  │  present)       │
│          │  └──────────────────────────────┘  │                 │
│          │  ┌─Workspace Panel 2───────────┐  │  ┌─Tab 1───┐   │
│          │  │ Grid 2 + Filters            │  │  │ Content │   │
│          │  └──────────────────────────────┘  │  ├─Tab 2───┤   │
│          │  ┌─Context Panel────────────────┐  │  │ Content │   │
│          │  │ Vendor info + quick add      │  │  └─────────┘   │
│          │  └──────────────────────────────┘  │                 │
│          │                                     │                 │
└──────────┴─────────────────────────────────────┴─────────────────┘
```
**Problem:** Operators see 4+ panels simultaneously. Context is scattered. Screen real estate fragmented. High cognitive load.

### Target Mercury: "Clean Main View, Context on Demand"
```
┌─Sidebar─┬─Content Area──────────────────┬─Slide-over (optional)─┐
│ Nav     │                               │                       │
│ Bookmrk │  ┌─Filter Toolbar──────────┐  │  Entity Detail:       │
│         │  │ Data views | Date | Amt │  │  Summary card          │
│         │  └─────────────────────────┘  │  Key facts             │
│         │  ┌─Summary Strip────────────┐ │  ┌─Tab 1───┐         │
│         │  │ Net | In | Out           │ │  │ Content │         │
│         │  └─────────────────────────┘  │  ├─Tab 2───┤         │
│         │  ┌─Tab Bar──────────────────┐ │  │ Content │         │
│         │  │ All | Draft | Confirmed  │ │  └─────────┘         │
│         │  └─────────────────────────┘  │                       │
│         │  ┌─Main Table──────────────┐  │  [Close ✕]           │
│         │  │ ▢ | Date | Name | Amt   │  │                       │
│         │  │ ☐ | ...                 │  │                       │
│         │  │ ☐ | ...                 │  │                       │
│         │  └─────────────────────────┘  │                       │
│         │  ┌─Bulk Action Bar─────────┐  │                       │
│         │  │ 3 selected · $450 · Act │  │                       │
│         │  └─────────────────────────┘  │                       │
└─────────┴────────────────────────────────┴───────────────────────┘
```
**Principle:** One main surface at a time. Context accessed through: right-side slide-over (quick detail), full-page navigation (deep work), inline expansion (related data), filter popovers (criteria).

---

## 1. Pattern Migration Map: TERP → Mercury

### 1.1 Context Delivery Patterns

| TERP Pattern | Mercury Replacement | What Changes |
|---|---|---|
| **ContextDrawer** (5 states, always present) | **Right-side slide-over panel** (opens on row click, ~420px, dismissible) | Drawer becomes contextual, not persistent. Opens to "standard" width by default, can expand to "wide" via drag handle. Auto-closes on navigation. |
| **WorkspacePanels** (stacked, always visible) | **Single-panel view with tabbed or collapsible sections** | Instead of 3-4 WorkspacePanels stacked vertically, show one main panel with tabs or collapsible sections. "Show more" toggles for supplementary panels. |
| **VendorContextPanel** (side panel in PO authoring) | **Slide-over panel** (opens from grid row or "View vendor" action) | Vendor context accessible on demand, not always taking sidebar space. |
| **Inspector tabs** (bottom tabs in grid) | **Merge into row expansion or slide-over** | Inspector tabs that show related data (invoices, linked orders) move into the detail slide-over as tabs. |
| **Expansion panels** (row detail, collapsible) | **Keep** — Mercury uses "Show details" toggles | Row expansion is a valid progressive disclosure pattern. Keep and standardize. |
| **StatusActionBar** (inline selection actions) | **BulkActionBar** (sticky bottom bar) | Selection actions move to a sticky bottom bar that appears/disappears. Same decision-table logic, different presentation. |
| **ReceiptPanel** (inline receipt preview) | **Slide-over panel** or **row expansion** | Receipt/preview moves to slide-over or inline expansion, not a permanent panel. |
| **CustomerPurchaseHistoryPanel** (always-visible side panel) | **Tab in slide-over** or **collapsible section** | Purchase history accessible via "History" tab when customer is viewed. |
| **PhotographyQueuePanel** (always-visible) | **Dedicated tab or slide-over section** | Photography context available on demand. |
| **SalesSourcePane** (Inventory Finder sidebar) | **Slide-over panel** or **inline modal** | Inventory finder opens as slide-over from the "Add line" action, not a permanent left pane. |

### 1.2 Action Patterns

| TERP Pattern | Mercury Replacement | What Changes |
|---|---|---|
| **FilterPresetStrip** (horizontal status pills) | **ViewTabBar** (horizontal tabs with counts) | Same concept, standardize as ViewTabBar. Add count badges. |
| **AdvancedFilterBuilder** (side panel) | **FilterToolbar** (horizontal chips with popovers) | AdvancedFilterBuilder becomes secondary (behind "Advanced" button). FilterToolbar is the primary UX. |
| **CommandPalette** (Cmd+K, full screen) | **Keep + enhance** — Mercury has "Search for anything" | Same pattern. Add entity search (not just commands). |
| **Expansion actions** (row buttons: Draft intake, Cancel, etc.) | **Keep** — Mercury uses per-row action buttons | Standardize styling and placement. |
| **Grid cell editing** (text, numeric) | **Add ComboboxCellEditor** for discrete values | Status, category, tags, method columns get dropdown editing. Text/numeric stay as-is. |
| **BatchRowActions** (inline mode-based actions) | **Keep** — already Mercury-like | IntakeView's inline batch actions already match Mercury's pattern. |

### 1.3 Navigation Patterns

| TERP Pattern | Mercury Replacement | What Changes |
|---|---|---|
| **Grid → Detail via drawer** | **Grid → Slide-over panel** (row click) | Default row click opens slide-over. Deep navigation ("View all details") goes to full page. |
| **Deep links between views** | **Keep** — filtered navigation between views | Dashboard → filtered grid, Recovery → filtered grid. |
| **Settings tabs** (Connector Requests, Aliases, System, etc.) | **Keep** — Mercury-style tabbed settings | Already matches Mercury's tabbed settings pattern. |
| **Sidebar nav groups** (5 groups) | **Simplify** — fewer groups, add bookmarks | Reduce nav groups. Add bookmark/favorite system for frequently-accessed views. |

---

## 2. View-by-View Retrofit Map

### SALESVIEW — The Hardest View

**Current layout:** 6 panels visible simultaneously (Orders grid, Draft lines grid, Suggestions grid, Sale Builder workspace, Customer purchase history, Photography queue) + ContextDrawer + SalesSourcePane.

**Retrofitted layout:**

```
┌─Sidebar──┬─Content Area──────────────────────────────────┬─Slide-over─┐
│          │  ┌─Filter Toolbar──────────────────────────┐  │             │
│          │  │ Presets: All Open | Confirmed | Posted   │  │             │
│          │  │ Date Range | Customer | Status | Export  │  │             │
│          │  └─────────────────────────────────────────┘  │             │
│          │  ┌─Summary Strip────────────────────────────┐ │             │
│          │  │ Active: 12 | Draft: 3 | Total: $45,200   │ │             │
│          │  └─────────────────────────────────────────┘  │             │
│          │  ┌─Main Sales Orders Table──────────────────┐ │             │
│          │  │ ☐ | #1004 | Acme | Confirmed | $8,200   │ │             │
│          │  │ ☐ | #1005 | Beta | Draft     | $3,500   │ │             │
│          │  │ → Click row: opens order in slide-over   │ │             │
│          │  └─────────────────────────────────────────┘  │             │
│          │  ┌─Bulk Action Bar (when rows selected)─────┐ │             │
│          │  │ 2 orders · $11,700 · [Confirm] [Reprice] │ │             │
│          │  └─────────────────────────────────────────┘  │             │
│          │  [+ New Sale] [Customer: Acme Corp ✕]        │             │
│          │                                               │             │
└──────────┴───────────────────────────────────────────────┴─────────────┘
```

**Where did everything go?**

| Current TERP Panel | New Location |
|---|---|
| **Sales Orders grid** | Main content area |
| **FilterPresetStrip** | FilterToolbar (presets + date/customer/status quick filters) |
| **ViewTabBar** | Tabs: All Orders | Draft | Confirmed | Posted |
| **Customer Draft Lines grid** | Appears when "New Sale" clicked or customer selected → full-width grid replaces orders table |
| **Sale Builder workspace (customer info, credit, pre-post strip)** | Appears as context header above lines grid when customer selected |
| **Smart Suggestions grid** | Tab in the lines view: "Lines | Suggestions" or collapsible section below lines |
| **Line Validation panel** | Inline warning strip above lines when issues exist |
| **Sheet Preview panel** | Slide-over panel, accessible from "Preview sheet" button |
| **Customer Purchase History** | Tab in slide-over when viewing customer |
| **Photography Queue** | Tab in slide-over when viewing customer |
| **SalesSourcePane (Inventory Finder)** | Slide-over panel opened from "Add line" action |
| **ContextDrawer (customer/salesOrder entity)** | Slide-over panel on row click → shows customer or order detail with tabbed sections |
| **Expansion configs (order actions, line actions)** | Inline row expansion (keep) + available as actions in slide-over |

**The flow:**

1. **Default state:** Clean sales orders table with filter toolbar + summary strip. No customer selected. No side panels.
2. **Select customer** (from header dropdown or "New Sale" button): View transitions to customer workspace. Header shows customer context (name, balance, credit, tags). Draft lines grid replaces orders table. Tabs switch to "Lines | Suggestions".
3. **Click row → Slide-over:** Opens order detail in right-side slide-over panel. Shows order summary + line list + actions (Confirm, Reserve, Cancel).
4. **Add line:** "Add line" button opens Inventory Finder as slide-over. Select batch → adds to grid.
5. **Line issues:** Validation issues appear as inline warning strip above the grid, not a separate panel.
6. **Preview sheet:** "Preview sheet" button opens Sheet Preview as slide-over with CSV export + copy offer actions.
7. **Photography queue / Purchase history:** Accessible as tabs when viewing customer in slide-over.
8. **Bulk actions:** Select rows → BulkActionBar appears at bottom with contextual actions.

**What's preserved:** Every command (~30 in SalesView). Every filter. Every context data point. Every expansion action. Every cell editor. Every navigation path. **Nothing lost.**

**What's cleaner:** One main surface at a time. Context accessed on demand via slide-over (quick peek) or full-page navigation (deep work). No permanent side panels cluttering the view.

---

### PURCHASEORDERSVIEW

**Current layout:** PO grid + PO authoring workspace (with vendor context side panel) + selected PO lines grid + ReceiptPanel.

**Retrofitted layout:**

```
Content Area:
  ┌─Filter Toolbar: Active | Ordered | Finalized | Date | Vendor──┐
  ┌─Summary Strip: 15 POs · $124,500 · 4 Draft · 3 Ordered────────┐
  ┌─Tab Bar: All | Draft | Ordered | Received | Finalized─────────┐
  ┌─PO Table──────────────────────────────────────────────────────┐
  └────────────────────────────────────────────────────────────────┘
  ┌─Bulk Action Bar (when selected)───────────────────────────────┐
  [+ New PO] (opens authoring slide-over)

Slide-over (right, opens on row click or "New PO"):
  When PO row clicked:
    ┌─PO Detail──────────────────────────────────────────────────┐
    │ #1004 · Acme Corp · Ordered · Expected Jun 20              │
    │ Total: $8,200 | Lines: 5 | Received: 0/5                   │
    ├────────────────────────────────────────────────────────────┤
    │ [Draft Intake] [Unfinalize] [Cancel] [Record Prepayment]   │
    ├──Tabs: Lines | Linked Intake | Vendor──────────────────────┤
    │  └─Lines tab: PO lines grid with editable cells            │
    │    Receive qty column when receivable                       │
    └────────────────────────────────────────────────────────────┘

  When "New PO" clicked:
    ┌─New Purchase Order─────────────────────────────────────────┐
    │ Vendor: [________] [Add new]    Expected: [____]           │
    │ Terms: [Net 30 ▾]    Notes: [________]                     │
    ├────────────────────────────────────────────────────────────┤
    │ PO Lines (editable grid)                                    │
    │ [Save Draft] [Approve & Finalize]                          │
    ├──Vendor Context (tab or collapsible section)───────────────┤
    │  Name · Terms · Open bills: 3 · Prior POs: 12              │
    │  Quick add from history                                    │
    │  Market signals                                             │
    └────────────────────────────────────────────────────────────┘
```

**Where did everything go?**

| Current TERP | New Location |
|---|---|
| PO Grid | Main content area |
| PO Authoring (full-width inline-panel) | Slide-over panel (when "New PO" clicked) |
| Vendor context side panel | Tab in slide-over (when creating PO or viewing PO) |
| Selected PO lines grid | Lines tab in slide-over |
| ReceiptPanel | Receipt tab in slide-over (when PO is receivable) |
| ReceiptPreviewOverlay | Slide-over panel (from "Preview receipt" button) |
| RecordPrepaymentDialog | Slide-over panel (from "Record Prepayment" action) |
| AddRefereeRelationshipDrawer | Slide-over panel |
| ContextDrawer (PO entity) | Slide-over panel on row click |

---

### INTAKEVIEW

**Current layout:** Master grid + detail grid (master/detail AG Grid) + totals strip + ReceiptPreviewDrawer.

**Retrofitted layout:**

```
Content Area:
  ┌─Filter Toolbar: Ready | In Progress | Verified | Vendor───┐
  ┌─Summary Strip: 8 POs pending · 142 batches · $67,400──────┐
  ┌─Master Grid (POs)─────────────────────────────────────────┐
  │ ▸ #1004 · Acme · Ordered · 12/15 received · ✓ Verify all  │
  │ ▾ #1005 · Beta · Received · 8/8 received · ✓ Verified     │
  │   └─Detail grid: batches (inline, same as current)        │
  │     ┌─────────────────────────────────────────────────────┐│
  │     │ Batch | Name | Qty | Actual | Reason | Status | Act ││
  │     │ B-001 | Rose | 50  | 48     | Short  | Done   | ... ││
  │     └─────────────────────────────────────────────────────┘│
  └────────────────────────────────────────────────────────────┘
  ┌─Selection Totals Strip (when POs selected)─────────────────┐
  │ 1 PO · 8 batches · 400 units · $2,800 · [Preview Receipt] │
```

**IntakeView is already the closest to Mercury's pattern** — it uses master/detail expansion natively. Minimal changes needed:
- Add FilterToolbar + SummaryStrip above the grid
- Move ReceiptPreviewDrawer to slide-over panel
- Standardize BatchRowActions (already good)
- Add selection totals strip more prominently

---

### DASHBOARDVIEW

**Current layout:** 8 stacked WorkspacePanels (KPI tiles, Today Focus, Pending Queues, My Open Work, Credit Watch, Your Drafts, Recent Activity, Cash Buckets).

**Retrofitted layout:**

```
Content Area:
  ┌─Welcome, Jane───────────────────────────────────────────────┐
  │ Quick Actions: [New Sale] [New PO] [Intake] [Payment]      │
  └─────────────────────────────────────────────────────────────┘
  ┌─KPI Strip (4 cards side by side)────────────────────────────┐
  │ Active Orders: 12   │ Pending Intake: 8  │ ...              │
  └─────────────────────────────────────────────────────────────┘
  ┌─Focus + Pending Queues (two-column)─────────────────────────┐
  │ Today's Focus          │ Work Queues                        │
  │ • 5 orders confirmed   │ Intake Ready: 8                    │
  │ • 3 POs ordered        │ Payments Pending: 3                │
  └─────────────────────────────────────────────────────────────┘
  ┌─Activity Feed───────────────────────────────────────────────┐
  │ ── My Drafts ────────────────────────────────────────────── │
  │ Draft #1004 · $8,200 · [Resume]                            │
  │ ── Recent Activity ─────────────────────────────────────── │
  │ Jane confirmed Order #1003 · 2m ago                         │
  │ ── Credit Watch (manager only) ─────────────────────────── │
  │ Acme Corp · Balance: $12k / Limit: $15k · [Review]         │
  └─────────────────────────────────────────────────────────────┘
```

**Changes:** Collapse 8 separate panels into a 2-3 section layout. KPI tiles become a horizontal strip (Mercury-style). Work queues become compact cards. Activity feed unifies drafts + recent + credit watch.

---

### GRIDJOURNEY VIEWS (~10 views)

**Current layout:** Single OperatorGrid with optional FilterPresetStrip + optional StatusActionBar.

**Retrofitted layout:** Add FilterToolbar + GridSummaryStrip + BulkActionBar above/below the grid. The grid itself doesn't change. StatusActionBar moves to BulkActionBar (sticky bottom).

**Example — OrdersView:**

```
Content Area:
  ┌─Filter Toolbar: All | Confirmed | Posted | Date | Customer──┐
  ┌─Summary Strip: 48 orders · $342,000 · 12 confirmed──────────┐
  ┌─Tab Bar: All | Draft | Confirmed | Posted | Fulfilled───────┐
  ┌─Orders Table────────────────────────────────────────────────┐
  └─────────────────────────────────────────────────────────────┘
  ┌─Bulk Action Bar─────────────────────────────────────────────┐
  │ 3 orders · $24,500 · [Confirm] [Post] [Fulfillment] [Reprice]
```

Slide-over on row click shows order detail with tabs: Summary | Lines | Linked Documents | History.

**Inspector tabs** (Invoice tab, Linked Orders tab) move into the slide-over as tabs.

---

### RECOVERYVIEW

**Current layout:** Action log grid + Admin tools panel (Backup, Correction, Find & Replace tabs) + Command Reversal panel.

**Retrofitted layout:**

```
Content Area:
  ┌─Filter Toolbar: Failed | OK | Pending | Action Type────────┐
  ┌─Search: [______________________________]                    │
  ┌─Filter Chips: CMD-PO | CMD-SALES | CMD-INTAKE──────────────┐
  ┌─Action Log Table───────────────────────────────────────────┐
  └─────────────────────────────────────────────────────────────┘
  ┌─Bulk Action Bar: 5 commands · [Retry All]──────────────────┐

  Admin Tools → accessible via slide-over or dedicated tab
```

**Changes:** Filter search + family chips become FilterToolbar. Admin tools move to slide-over or settings tab. Command reversal accessible from row click.

---

### CLOSEOUTVIEW

**Current layout:** Control band + Adjustment panel + Archive runs table + Blocker drilldown.

**Retrofitted layout:**

```
Content Area:
  ┌─Closeout Header─────────────────────────────────────────────┐
  │ Period: [2026-06]  Status: ⬤ Open work: 3 items             │
  │ [Lock Period] [Archive] [Adjustment]                        │
  └─────────────────────────────────────────────────────────────┘
  ┌─Control Totals──────────────────────────────────────────────┐
  │ Batches: 1,240 | Sales Orders: 89 | POs: 42 | Commands: 2k │
  └─────────────────────────────────────────────────────────────┘
  ┌─Blockers (expandable)───────────────────────────────────────┐
  │ ▸ 3 unsafe batches → [View in Intake]                      │
  │ ▸ 2 open connectors → [View in Settings]                   │
  └─────────────────────────────────────────────────────────────┘
  ┌─Archive Runs Table──────────────────────────────────────────┐
  └─────────────────────────────────────────────────────────────┘
```

**Changes:** Compact the control band into a header strip. Blockers become inline expandable sections (already close). Adjustment opens as slide-over, not an inline panel.

---

### REMAINING VIEWS

| View | Changes |
|---|---|
| **MatchmakingView** | 5 grids → tabbed view: Matches | Opportunities | Needs | Stock | Settings. FilterToolbar + SummaryStrip. Slide-over for match detail. |
| **PickView** | Keep 3-screen flow (queue→list→line). It's already a clean wizard. Add context info in header of each screen. |
| **RefereesView** | Grid + FilterToolbar. Detail in slide-over. Edit/create in slide-over/modal. |
| **CreditReviewView** | Table + ViewTabBar (Stale Manual | Engine Disabled | Near Snooze Cap). Slide-over for customer detail. Owner-only divergence panel collapses to toggle. |
| **MediaView** | Grid + FilterToolbar (mediaStatus filter). Slide-over for batch detail (replaces MediaBatchDrawer). Bulk publish via BulkActionBar. |
| **ProcessorsView** | Grid + FilterToolbar. Slide-over for detail (replaces ProcessorDetailPanel). Create via slide-over/modal. |
| **SettingsView** | Keep tabs. Each tab already clean. Connector Requests tab already uses GridJourney. |
| **ItemsView** | Grid + FilterToolbar. Slide-over for create/edit. Activate/deactivate via BulkActionBar. |
| **ContactsView** | Grid + search bar + role filter chips. Slide-over for detail. MergeCandidates accessible from Contacts. |
| **ContactProfileView** | Keep tabs. Each tab already clean. |
| **MergeCandidatesView** | Side-by-side comparison view (already simple). Merge action buttons per row. |
| **ConnectorsView** | GridJourney already. Add FilterToolbar. Timeline in slide-over. |
| **InvoiceDisputesView** | Grid + BulkActionBar (Resolve/Reject). Detail in slide-over. |
| **PurchaseReceiptsView** | GridJourney. Lines sub-grid in slide-over. |

---

## 3. What Gets Consolidated

### 3.1 Drawers → Slide-over Panel (Single Component)

All these TERP drawer/panel types become tabs or sections in one unified slide-over component:

| Current Component | Becomes |
|---|---|
| ContextDrawer (5 states) | `DetailSlideover` (2 states: standard 420px, wide 60%) |
| VendorContextDrawer | Tab in PO slide-over |
| RelationshipDrawer | Tab in PO/sales slide-over |
| InventoryFinderPanel | Slide-over from "Add line" action |
| PhotographyQueuePanel | Tab in customer slide-over |
| RowCommandHistoryDrawer | Tab in entity slide-over |
| IssueSidecar | Section in entity slide-over |
| ReceiptPanel | Tab or section in entity slide-over |
| ReceiptPreviewDrawer | Slide-over from "Preview receipt" button |
| RecordPrepaymentDialog | Slide-over from "Record Prepayment" action |
| RefereeDialog | Slide-over for edit |
| RefereeRelationshipDialog | Slide-over for add |
| RefereeDetailPanel | Slide-over for view |
| MediaBatchDrawer | Slide-over for batch detail |
| ProcessorDetailPanel | Slide-over for processor detail |
| CustomerPurchaseHistoryPanel | Tab in customer slide-over |
| SalesSourcePane | Slide-over from "Add line" action |
| WorkspacePanel (Sale Builder) | Context header + grid (collapsed panels become tabs) |

**Result:** ~18 separate drawer/panel components collapse into 1 `DetailSlideover` component with tabs, sections, and action slots.

### 3.2 Filter Systems → FilterToolbar + ViewTabBar

| Current Component | Becomes |
|---|---|
| AdvancedFilterBuilder | Accessible via "Advanced" button in FilterToolbar |
| FilterPresetStrip (per view) | ViewTabBar tabs |
| SavedFiltersDropdown | Part of FilterToolbar "Data views" dropdown |
| Grid quick filter text | FilterToolbar keyword search |
| Inline filter chips (RecoveryView command families) | FilterToolbar chips |

### 3.3 Selection Actions → BulkActionBar

| Current Component | Becomes |
|---|---|
| StatusActionBar (inline, per-view) | BulkActionBar (sticky bottom, unified) |
| StatusActionTable (decision table per view) | Decision table logic preserved, rendered in BulkActionBar |
| Selection totals strip (IntakeView) | BulkActionBar |
| Per-row expansion actions | Keep in row expansion (Mercury pattern) |

---

## 4. What Stays the Same

These TERP features require **no changes** — they already match Mercury patterns or are genuine differentiators:

| Feature | Reason to Keep |
|---|---|
| AG Grid (sorting, filtering, grouping, selection, expansion) | Richer than Mercury's native tables; operators depend on these features |
| CommandPalette (Cmd+K) | Mercury has equivalent "Search for anything"; TERP's is already more powerful |
| useCommandRunner + toast invalidation | Already a clean command abstraction; no changes needed |
| useUiStore (Zustand) | Already granular selectors; filter/drawer/selection state already centralized |
| BatchRowActions (IntakeView inline actions) | Already matches Mercury's inline editing pattern |
| PickView 3-screen flow | Already a clean wizard pattern |
| ContactProfileView tabs | Already Mercury-style tabbed detail |
| SettingsView tabs | Already clean |
| RecoveryView search + filter chips | Already Mercury-style |
| CloseoutView blocker drilldown | Already a clean progressive disclosure pattern |
| DashboardView KPI cards | Already has cards; just need horizontal strip layout |
| Mobile views | Separate component set; adapt independently |

---

## 5. Component Architecture — The Unification

### 5.1 DetailSlideover (Replaces ~18 drawer/panel components)

```typescript
// Single component, used everywhere
interface DetailSlideoverProps {
  entityType: string;       // 'salesOrder', 'po', 'customer', 'vendor', 'lot', 'payment', etc.
  entityId: string;
  state: 'closed' | 'standard' | 'wide';  // 420px | 60% | hidden
  tabs?: DetailTab[];       // Dynamic tabs based on entity type
  actions?: DetailAction[]; // Action buttons in header
  headerSummary?: ReactNode; // Entity summary in header
}

interface DetailTab {
  key: string;
  label: string;
  content: ReactNode;       // The tab's content component
  count?: number;           // Badge count
}
```

**Usage examples:**
- **PO row click:** `entityType="po"`, tabs: [Lines, LinkedIntake, Vendor, History]
- **Customer view:** `entityType="customer"`, tabs: [Overview, Orders, PurchaseHistory, Photography, Credit]
- **Sales order:** `entityType="salesOrder"`, tabs: [Lines, Pricing, Fulfillment, History]
- **Intake batch:** `entityType="lot"`, tabs: [Movement, Sales, Photos, History]
- **"Add line" (Inventory Finder):** `entityType="finder"`, tabs: [Available, Recent, Search]

### 5.2 FilterToolbar (Replaces AdvancedFilterBuilder + FilterPresetStrip + filter chips)

```typescript
interface FilterToolbarProps {
  view: ViewKey;
  presets?: FilterPreset[];        // Status presets (was FilterPresetStrip)
  quickFilters?: QuickFilter[];    // Date range, keyword, amount, etc.
  dataViews?: DataView[];          // Saved views dropdown
  onAdvancedClick?: () => void;    // Opens AdvancedFilterBuilder in slide-over
  exportEnabled?: boolean;
}
```

### 5.3 BulkActionBar (Replaces StatusActionBar per view)

```typescript
interface BulkActionBarProps {
  selectedCount: number;
  selectedTotal?: string;
  actions: BulkAction[];           // From decision table
  decisionTable: ActionDecisionTable; // Same decision table as current StatusActionTable
}
```

---

## 6. Implementation Sequence (Revised)

The engineering plan from `mercury-ux-adoption.md` can now be refined with this mapping:

**Phase 0 — Foundation (Weeks 1–2):** Build `DetailSlideover`, `FilterToolbar`, `BulkActionBar`, `ViewTabBar`, `ComboboxCellEditor`. 

**Phase 1 — Pilot (Weeks 3–4):** Retrofit PurchaseOrdersView. Prove DetailSlideover replaces VendorContextDrawer + PO ContextDrawer + ReceiptPreview + RecordPrepaymentDialog.

**Phase 2 — GridJourney (Weeks 5–6):** Retrofit ~10 views. Add FilterToolbar + SummaryStrip + BulkActionBar to GridJourney factory.

**Phase 3 — Complex (Weeks 7–12):** SalesView (hardest, 3 weeks), IntakeView (1 week), Dashboard (1 week), remaining ~9 views (2 weeks).

---

## 7. Feature Coverage Verification

### Every TERP command is preserved

The Retrofit does not remove any `runCommand` call. Commands that were triggered from:
- Expansion buttons → Keep in expansion or move to slide-over actions
- StatusActionBar → Move to BulkActionBar
- ContextDrawer tabs → Move to DetailSlideover tabs
- WorkspacePanel actions → Move to context header or slide-over actions

**No command is lost.** Every `createSalesOrder`, `confirmSalesOrder`, `receivePurchaseOrder`, `updateBatch`, `verifyAllIntake`, etc. remains accessible.

### Every context data point is preserved

Data that was shown in:
- Vendor context panels → Shown in slide-over vendor tab
- Customer purchase history → Shown in slide-over customer tab
- Market signals → Shown in slide-over PO/vendor tab
- Credit status → Shown in slide-over customer tab or context header
- Photography queue → Shown in slide-over customer tab
- Sheet preview → Shown in dedicated slide-over
- Pre-post checks → Shown in context header (when customer selected)
- Selection totals → Shown in BulkActionBar

**No context is lost.** It's just behind one click instead of always visible.

### Every filter is preserved

- FilterPresetStrip → ViewTabBar tabs
- AdvancedFilterBuilder → FilterToolbar "Advanced" button
- Recovery command family chips → FilterToolbar chips
- Grid quick filter → FilterToolbar keyword

### Every cell editor is preserved

- Text/numeric editing → Same (AG Grid default editors)
- Status/arrivalStatus → ComboboxCellEditor (upgrade)
- Category/subcategory → ComboboxCellEditor (upgrade, where beneficial)
- BoolCol checkboxes → Same
- Date pickers → Same

---

## Appendix: Context Accessibility Comparison

| Data Point | Current TERP Visibility | After Retrofit | Access Cost |
|---|---|---|---|
| Vendor name + terms | Always visible in side panel | One click (row click → slide-over vendor tab) | 1 click |
| Customer balance + credit | Always visible in workspace header | Always visible in context header when customer selected | 0 clicks |
| PO line details | Always visible when PO expanded | One click (row click → slide-over lines tab) | 1 click |
| Intake batch details | Always visible in master/detail | Same (master/detail preserved) | 0 clicks |
| Photography queue | Always visible side panel | One click (customer → slide-over photos tab) | 1-2 clicks |
| Purchase history | Always visible side panel | One click (customer → slide-over history tab) | 1-2 clicks |
| Inventory finder | Always visible left pane | One click ("Add line" → slide-over finder) | 1 click |
| Sheet preview | Always visible panel | One click ("Preview sheet" → slide-over) | 1 click |
| Order actions (Confirm/Reserve/Cancel) | Expansion buttons | Same (row expansion) or slide-over actions | 0-1 clicks |
| Selection bulk actions | Inline StatusActionBar | Sticky BulkActionBar | 0 clicks |
| Market signals | Inline panel | Slide-over vendor tab | 1 click |
| Pre-post validation issues | Inline panel | Inline warning strip (when issues exist) | 0 clicks |

**Key tradeoff:** Some context that was always visible now requires 1-2 clicks to access. In exchange, the main view becomes dramatically cleaner. This matches Mercury's philosophy: "show what's needed for the current task, make everything else one click away."

