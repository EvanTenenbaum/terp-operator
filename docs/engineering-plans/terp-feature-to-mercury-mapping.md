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

### 0.1 UX Authority and Operator Attention Budget

The retrofit's philosophy shift is **governed by [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md)** — the single authoritative UX analysis derived from two independent model audits (Claude Opus 4.7 detailed step-by-step walkthrough, GPT-4o adversarial worst-moment audit). Read that document for the underlying diagnosis. This document is the *migration plan* that implements those findings.

**The single most actionable principle (from the integrated analysis — operator attention budget):**

> Show the operator three things:
> 1. **What they're working on** — 0 clicks, always visible (category 1)
> 2. **What they might need next** — 1 click away (category 2)
> 3. **What they rarely need** — 2+ clicks away, or search (category 3)
>
> Anything always-visible that belongs in category 2 or 3 is a design bug.

Every pattern migration in §1 and §2 below should be read with this attention budget in mind. The "what changes" column for each row is not arbitrary — each migration moves something from its current attention-budget category to the category that matches its actual usage frequency. The click-cost increases recorded in §8 and the appendix are the price paid for restoring the operator's category-1 attention to the work they are actually doing.

**Top friction points this retrofit directly addresses** (from the integrated analysis):

| # | Friction Point | Addressed By |
|---|---|---|
| 1 | SalesView's 8 simultaneous panels (Claude 2/10, GPT-4o 2/10 — worst in TERP) | §2 SalesView retrofit — orders/lines is the one primary surface; rest in tabs/slide-overs |
| 2 | Mid-flow context switching destroys state (GPT-4o 1/10 — lowest score given) | §1.1 ContextDrawer → slide-over + URL-encoded session memory (UX-11) |
| 3 | Dashboard has no anchor or landing zone | §2 DashboardView retrofit — KPI strip as visual anchor; 8 panels → 3 sections |
| 4 | PO authoring pre-staged and action-overloaded | §2 PurchaseOrdersView retrofit — authoring is opt-in slide-over; state-gated actions per UX-1 |
| 5 | Error recovery doesn't foreground the failure | §2 RecoveryView retrofit — action log as primary; admin tools sequestered |
| 6 | Customer selection fires six simultaneous panel updates | §2 SalesView retrofit — context header + lines grid; rest in customer slide-over |
| 7 | Permanent auxiliary panels become invisible noise | §1.1 panels → tabs/slide-overs; validation moves to point-of-impact strip (UX-2, UX-5) |

**UX rules cross-confirmed by both Claude and GPT-4o** (highest weight): **UX-1, UX-2, UX-3, UX-5, UX-8, UX-11**. These six are treated as non-negotiable design rules for every migration in this document. The other six (UX-4, UX-6, UX-7, UX-9, UX-10, UX-12) are still applied — they derive from Mercury's well-established design behavior — but they were not flagged by GPT-4o's shorter audit scope.

A full mapping from friction points to migrations and from UX rules to sections lives in §8 of this document.

---

## 1. Pattern Migration Map: TERP → Mercury

### 1.1 Context Delivery Patterns

| TERP Pattern | Mercury Replacement | What Changes | UX Mapping |
|---|---|---|---|
| **ContextDrawer** (5 states, always present) | **Right-side slide-over panel** (opens on row click, ~420px, dismissible) | Drawer becomes contextual, not persistent. Opens to "standard" width by default, can expand to "wide" via drag handle. Auto-closes on navigation. | UX-2, UX-11 · addresses friction #2 · cost 0→1 (cat 1→2) |
| **WorkspacePanels** (stacked, always visible) | **Single-panel view with tabbed or collapsible sections** | Instead of 3-4 WorkspacePanels stacked vertically, show one main panel with tabs or collapsible sections. "Show more" toggles for supplementary panels. | UX-2, UX-3 · addresses friction #1, #3 · cost 0→1 (cat 1→2) |
| **VendorContextPanel** (side panel in PO authoring) | **Slide-over panel** (opens from grid row or "View vendor" action) | Vendor context accessible on demand, not always taking sidebar space. | UX-2 · addresses friction #4, #7 · cost 0→1 (cat 1→2) |
| **Inspector tabs** (bottom tabs in grid) | **Merge into row expansion or slide-over** | Inspector tabs that show related data (invoices, linked orders) move into the detail slide-over as tabs. | UX-2, UX-3 · cost 0→1 (cat 1→2) |
| **Expansion panels** (row detail, collapsible) | **Keep** — Mercury uses "Show details" toggles | Row expansion is a valid progressive disclosure pattern. Keep and standardize. | UX-2 · cost unchanged (already opt-in) |
| **StatusActionBar** (inline selection actions) | **BulkActionBar** (sticky bottom bar) | Selection actions move to a sticky bottom bar that appears/disappears. Same decision-table logic, different presentation. | UX-4 · cost unchanged (selection-gated) |
| **ReceiptPanel** (inline receipt preview) | **Slide-over panel** or **row expansion** | Receipt/preview moves to slide-over or inline expansion, not a permanent panel. | UX-2 · addresses friction #7 · cost 0→1 (cat 1→2) |
| **CustomerPurchaseHistoryPanel** (always-visible side panel) | **Tab in slide-over** or **collapsible section** | Purchase history accessible via "History" tab when customer is viewed. | UX-2 · addresses friction #6, #7 · cost 0→1 (cat 1→2) |
| **PhotographyQueuePanel** (always-visible) | **Dedicated tab or slide-over section** | Photography context available on demand. | UX-2 · addresses friction #7 · cost 0→2 (cat 1→3 — rare during sale) |
| **SalesSourcePane** (Inventory Finder sidebar) | **Slide-over panel** or **inline modal** | Inventory finder opens as slide-over from the "Add line" action, not a permanent left pane. | UX-2 · cost 0→1 (cat 1→2 — only relevant when adding lines) |

### 1.2 Action Patterns

| TERP Pattern | Mercury Replacement | What Changes | UX Mapping |
|---|---|---|---|
| **FilterPresetStrip** (horizontal status pills) | **ViewTabBar** (horizontal tabs with counts) | Same concept, standardize as ViewTabBar. Add count badges. | UX-9 · cost unchanged (filter, not navigation) |
| **AdvancedFilterBuilder** (side panel) | **FilterToolbar** (horizontal chips with popovers) | AdvancedFilterBuilder becomes secondary (behind "Advanced" button). FilterToolbar is the primary UX. | UX-2, UX-9 · cost 0→1 for advanced (cat 1→2 — rare) |
| **CommandPalette** (Cmd+K, full screen) | **Keep + enhance** — Mercury has "Search for anything" | Same pattern. Add entity search (not just commands). | UX-11 (partial — supports back/forward) · cost unchanged |
| **Expansion actions** (row buttons: Draft intake, Cancel, etc.) | **Keep** — Mercury uses per-row action buttons | Standardize styling and placement. Apply state-gating: irrelevant actions absent, not disabled. | **UX-1** (state-gated) · addresses friction #4 · cost unchanged |
| **Grid cell editing** (text, numeric) | **Add ComboboxCellEditor** for discrete values | Status, category, tags, method columns get dropdown editing. Text/numeric stay as-is. | UX-10 · cost unchanged |
| **BatchRowActions** (inline mode-based actions) | **Keep** — already Mercury-like | IntakeView's inline batch actions already match Mercury's pattern. | UX-1, UX-10 · cost unchanged |

### 1.3 Navigation Patterns

| TERP Pattern | Mercury Replacement | What Changes | UX Mapping |
|---|---|---|---|
| **Grid → Detail via drawer** | **Grid → Slide-over panel** (row click) | Default row click opens slide-over. Deep navigation ("View all details") goes to full page. State (open entity, active tab, filters) encodes into the URL. | UX-2, UX-8, **UX-11** · addresses friction #2 · cost 0→1 (offset by reliable state) |
| **Deep links between views** | **Keep** — filtered navigation between views | Dashboard → filtered grid, Recovery → filtered grid. | UX-11 · cost unchanged |
| **Settings tabs** (Connector Requests, Aliases, System, etc.) | **Keep** — Mercury-style tabbed settings | Already matches Mercury's tabbed settings pattern. | UX-9 · cost unchanged |
| **Sidebar nav groups** (5 groups) | **Simplify** — fewer groups, add bookmarks | Reduce nav groups. Add bookmark/favorite system for frequently-accessed views. | UX-3, UX-12 · cost unchanged |

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

**UX Mapping:**
- **Friction points addressed:** #1 (eight simultaneous panels), #6 (customer selection avalanche), #7 (always-visible noise — especially the pre-post validation panel).
- **UX rules applied:** **UX-2** (supporting info one click away), **UX-3** (orders/lines is the one primary surface), **UX-5** (validation appears inline at point of impact, never in a permanent panel), **UX-7** (customer context lives in context header so the operator never loses sight of mode), **UX-11** (URL encodes selected customer + active slide-over + tab). Continuous-monitoring exception applies to credit/balance — those stay at cost 0 (UX-2 explicit carve-out).
- **Net access cost:** orders grid 0→0 · customer context 0→0 (header) · purchase history 0→1 (cat 1→2) · photography 0→1-2 (cat 1→3) · inventory finder 0→1 (cat 1→2) · pre-post validation 0→0 when issues exist, absent when clean.
- **Hard gate:** Phase 3A in `MASTER-EXECUTION-DOCUMENT.md`. Failure to apply UX-3 on this view nullifies the retrofit's value.

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

**UX Mapping:**
- **Friction points addressed:** #4 (PO authoring pre-staged and action-overloaded), #7 (vendor context always visible).
- **UX rules applied:** **UX-1** (state-gated actions — a draft PO shows only `Save Draft` and `Approve & Finalize`; `Receive`/`Unfinalize`/`Cancel Order` are **absent**, not disabled, until the PO is in a state where they apply), **UX-2** (vendor context one click away in slide-over tab), **UX-3** (PO list is the primary surface; authoring is opt-in, not pre-staged), **UX-6** (PO authoring lives in slide-over; RecordPrepaymentDialog moves out of blocking modal into slide-over).
- **Net access cost:** PO grid 0→0 · vendor context 0→1 (cat 1→2) · selected PO lines 0→1 (cat 1→2) · receipt 0→1 (cat 1→2). The "+ New PO" interaction is the deliberate trigger for the authoring surface, not a default visible state.

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

**UX Mapping:**
- **Friction points addressed:** none directly — this view scored highest in the integrated analysis (Claude 7/10). It is the model the other views should converge toward.
- **UX rules applied:** **UX-4** (selection totals strip is a bulk-action surface that appears only when POs are selected, not a permanent header), **UX-2** (receipt preview moves to slide-over from "Preview Receipt" action). Master/detail expansion is the explicit continuous-monitoring exception in UX-2 — batch detail stays at cost 0 because the operator is actively verifying each batch.
- **Net access cost:** master/detail unchanged (0 clicks) · selection totals 0→0 when selected · receipt preview 0→1 (cat 1→2).

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

**UX Mapping:**
- **Friction points addressed:** #3 (no anchor or landing zone — "the eye lands nowhere in particular").
- **UX rules applied:** **UX-3** (KPI strip becomes the primary visual anchor; 8 equally-weighted panels → 3 visually weighted sections — Welcome+Actions, KPI strip, Focus+Queues+Activity), **UX-12** (Quick Actions give every operator a default next step at 8:14 AM). Activity feed unification respects UX-2 — drafts, recent activity, and credit watch are related "what happened recently" surfaces that share one slot rather than three.
- **Net access cost:** KPI 0→0 · work queues 0→0 (consolidated into a single Focus+Queues column) · credit watch 0→0 (within activity feed). The morning ritual cost drops from "scan 8 panels" to "scan 3 sections" with no information loss.

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

**UX Mapping:**
- **UX rules applied:** **UX-2** (inspector tabs → slide-over tabs; one click away, not always visible), **UX-3** (one primary surface — the grid; toolbar/strip/tabs are supporting weight), **UX-4** (BulkActionBar appears only when rows are selected), **UX-9** (FilterToolbar and ViewTabBar are fluid filtering, not navigation — they don't change the operator's location).
- **Net access cost:** grid 0→0 · detail 0→1 (cat 1→2) · bulk actions 0→0 (selection-gated). The GridJourney factory makes these defaults free for the ~10 views that adopt it.

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

**UX Mapping:**
- **Friction points addressed:** #5 (failure not foregrounded — operators land on Admin tools first because they are visually prominent; the failure is buried in the Action Log).
- **UX rules applied:** **UX-3** (action log is the unambiguous primary surface; admin tools sequestered to slide-over or settings tab so the operator's eye lands on the failure first), **UX-12** (search + family chips give the operator a next step when scanning failures rather than dropping them into an undifferentiated table).
- **Net access cost:** action log / failures 0→0 · admin tools 0→1-2 (cat 1→3 — power-user surface, rare). This is the right inversion: failures are the reason operators land in this view, admin tools are not.

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

**UX Mapping:**
- **UX rules applied:** **UX-3** (header strip + control totals + blockers + archive runs in a clear top-down visual hierarchy, not four equal panels — the operator's eye flows from period status → totals → blockers → runs), **UX-6** (adjustment opens in slide-over rather than as an inline panel that consumes layout permanently).
- **Net access cost:** period status 0→0 (header) · control totals 0→0 · blockers 0→0 (inline expandable) · adjustment 0→1 (cat 1→2 — rare action, deliberate trigger).

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

**UX Mapping across remaining views:** Every retrofit applies **UX-2** (supporting info one click away — entity detail in slide-overs), **UX-3** (one primary surface per view — grid + supporting toolbar/strip, never two equal-weight grids), and **UX-9** (filtering is fluid via FilterToolbar; ViewTabBar tabs filter rather than navigate).
- **MatchmakingView** additionally addresses overcrowding under UX-3 (5 simultaneous grids → tabbed view).
- **CreditReviewView** addresses the always-visible owner divergence panel under UX-2 (collapses to toggle — owners can opt in; non-owners never see it).
- **MediaView**, **ProcessorsView**, **InvoiceDisputesView** all apply UX-2 (detail panels → slide-overs) and UX-4 (bulk actions on selection only).
- **Net access cost (typical):** grid 0→0 · detail 0→1 (cat 1→2) · bulk actions 0→0 (selection-gated).

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

### 7.5 UX Fidelity Verification

Feature coverage proves that no commands, data, filters, or cell editors are lost. **UX fidelity verification** is the separate check that the *operator experience* meets the integrated analysis's standards — that "nothing lost" doesn't quietly become "nothing usable."

For every retrofitted view, the implementing agent must verify:

**1. Attention budget audit (against §0.1)**

For every surface that is always visible after the retrofit (cost 0), confirm it belongs in category 1 of the attention budget — what the operator is actively working on, or continuous-monitoring information they need at a glance (credit/balance, mode/state).

For every surface moved to slide-over or tab (cost 1), confirm it belongs in category 2 — useful during the current task but not part of the active surface.

For every surface moved to 2+ clicks (cost 2+), confirm it belongs in category 3 — rare, power-user, or only relevant in specific failure modes.

If any always-visible surface belongs in category 2 or 3, **it is a design bug** and must be moved before the view ships. The pre-post validation panel on SalesView when there are no issues is the canonical example.

**2. State-gating verification (UX-1)**

For every action button or row action shown on the view, confirm: is this action **applicable** to the entity in its current state? If not, the button must be **absent**, not disabled. Disabled buttons still consume attention. The check: take a draft PO and confirm `Receive`, `Unfinalize`, and `Cancel Order` are absent from its action set.

**3. Progressive disclosure default**

For every panel, drawer, tab, or expansion that is currently visible by default, ask: did the operator request this, or did the system pre-stage it for a workflow they may not need? If pre-staged, it must move to opt-in (slide-over, "+ New X" trigger, row click).

The check: arrive at the view fresh. Does the eye land on exactly one primary surface in under 1 second? If the operator has to triage between multiple panels of equal weight, UX-3 is failing.

**4. Validation surfacing (UX-5)**

For every validation, confirm: does it appear at the point of impact (the field, the line, the row), or in a dedicated panel? Dedicated panels that read "All checks passed" must be removed — they habituate the operator's eye to ignore the panel, which means a real warning will go unnoticed.

**5. URL state preservation (UX-11)**

For every view, perform this test: open a slide-over, switch tabs in the slide-over, apply filters, refresh the browser. Does the view reproduce exactly? If not, mid-flow context switching (friction #2) is still present.

**6. "Nothing lost" attention budget check**

The "Nothing lost" claim in §2 (especially for SalesView) means *no information or capability is removed* — it does not mean *every piece of information remains at cost 0*. Verify by walking the appendix table: each data point that moved from cost 0 to cost 1 must be deliberate (the data belongs in category 2), and each data point that stayed at cost 0 must be defensible against the attention budget.

---

## 8. UX Analysis Cross-Reference

This section provides the explicit two-way mapping between the integrated UX analysis (the authority) and this migration plan (the implementation).

**Authority:** [mercury-ux-integrated-analysis.md](./mercury-ux-integrated-analysis.md) — read first for diagnosis.

### 8.1 Friction Points → Migrations

Each of the 7 top friction points identified in the integrated analysis is addressed by one or more migrations in this document:

| # | Friction Point | Score (Claude / GPT-4o) | Migrations That Address It |
|---|---|---|---|
| 1 | SalesView's 8 simultaneous panels | 2/10 / 2/10 (worst) | §2 SalesView (orders/lines as one primary surface; others in tabs/slide-overs); §1.1 WorkspacePanels → tabbed/collapsible; §3.1 panels → DetailSlideover |
| 2 | Mid-flow context switching destroys state | 4/10 / 1/10 (lowest) | §1.1 ContextDrawer → slide-over; §1.3 Grid → Detail with URL-encoded state; §7.5 verification #5 |
| 3 | Dashboard has no anchor or landing zone | 4/10 / 3/10 | §2 DashboardView (8 panels → 3 sections, KPI strip as anchor); §1.1 WorkspacePanels |
| 4 | PO authoring pre-staged and action-overloaded | 5/10 / 3/10 | §2 PurchaseOrdersView (authoring as opt-in slide-over); §1.2 Expansion actions (state-gated); §7.5 verification #2 |
| 5 | Error recovery doesn't foreground the failure | 5/10 / 2/10 | §2 RecoveryView (action log as primary; admin tools sequestered) |
| 6 | Customer selection fires six panel updates | 3/10 step / part of 2/10 | §2 SalesView (context header + lines; rest in customer slide-over); §1.1 CustomerPurchaseHistoryPanel; §1.1 PhotographyQueuePanel |
| 7 | Permanent auxiliary panels become invisible noise | 4/10 / "irrelevant data" | §1.1 VendorContextPanel, ReceiptPanel, CustomerPurchaseHistoryPanel, PhotographyQueuePanel; §2 SalesView (validation strip at point of impact); §7.5 verification #4 |

### 8.2 UX Rules → Sections That Implement Them

The 12 UX rules derived in the integrated analysis are implemented across this document as follows:

| Rule | Description | Cross-confirmed? | Sections Implementing |
|---|---|---|---|
| **UX-1** | Action visibility follows entity state (absent, not disabled) | ✅ Yes | §1.2 Expansion actions; §2 PurchaseOrdersView; §7.5 #2 |
| **UX-2** | Supporting info one click away, never zero (except continuous monitoring) | ✅ Yes | §1.1 (all rows); §1.3 Grid → Detail; §2 all views; §3.1 DetailSlideover consolidation; §7.5 #1 |
| **UX-3** | One primary surface per view | ✅ Yes | §0.1 (philosophy); §1.1 WorkspacePanels; §1.3 Sidebar nav; §2 SalesView, Dashboard, Recovery, Closeout; §7.5 #3 |
| **UX-4** | Bulk actions appear only on selection | — | §1.1 StatusActionBar → BulkActionBar; §2 GridJourney, IntakeView; §3.3 BulkActionBar |
| **UX-5** | Validation errors at point of impact, never in dedicated panel | ✅ Yes | §2 SalesView (inline warning strip); §7.5 #4 |
| **UX-6** | Tools and forms live in slide-overs; modals for confirmations only | — | §1.1 ReceiptPanel; §2 PurchaseOrdersView (RecordPrepaymentDialog → slide-over); §2 CloseoutView (Adjustment → slide-over); §3.1 |
| **UX-7** | System never hides what mode the operator is in | — | §2 SalesView (customer context header) |
| **UX-8** | State changes resolve in place; no navigation for confirmations | ✅ Yes | §1.3 Grid → Detail (slide-over resolution); §3.1 DetailSlideover |
| **UX-9** | Filtering is fluid; navigation is durable | — | §1.2 FilterPresetStrip → ViewTabBar; §1.2 AdvancedFilterBuilder → FilterToolbar; §1.3 Settings tabs; §3.2 |
| **UX-10** | Cell-level interactions save immediately; multi-field forms have explicit save | — | §1.2 Grid cell editing; §1.2 BatchRowActions |
| **UX-11** | URL is the session memory | ✅ Yes | §1.1 ContextDrawer → slide-over; §1.3 Grid → Detail; §2 SalesView; §7.5 #5 |
| **UX-12** | Empty states give the operator a next step | — | §1.3 Sidebar nav (bookmarks); §2 DashboardView (Quick Actions); §2 RecoveryView (search/chips) |

The six cross-confirmed rules (UX-1, UX-2, UX-3, UX-5, UX-8, UX-11) appear in this document as bold emphasis in every UX Mapping callout. These six should be treated as non-negotiable acceptance criteria for any view's retrofit being considered complete.

### 8.3 Workflow Scores → Expected Retrofit Impact

Per the integrated analysis's workflow scores (Claude / GPT-4o), the migrations above are expected to lift each workflow above the 7/10 threshold both models flagged as the ceiling on the current design. The retrofit's success criterion at the view level is: a rerun of the same audit methodology against the retrofitted views should produce scores no lower than 7/10 on either model, and ideally 8-9/10 on the views (SalesView, Dashboard, Recovery) that scored 5/10 or worse pre-retrofit.

This is the closing verification — not run by the implementing agent at the view level, but referenced when a phase gate closes (Phase 1, 2, 3A, 3B, 3C, 3D, 4).

---

## Appendix: Context Accessibility Comparison

The table below extends the original comparison with the UX rule that governs each access-cost decision. Rows where access cost **increased** (e.g., 0 clicks → 1-2 clicks) are explicitly justified — the increase is always because the data point moved from attention-budget category 1 (always-visible) to category 2 (one click) or category 3 (2+ clicks), per the principle in §0.1.

| Data Point | Current TERP Visibility | After Retrofit | Access Cost (Δ) | UX Rule / Category Justification |
|---|---|---|---|---|
| Vendor name + terms | Always visible in side panel | One click (row click → slide-over vendor tab) | 1 click (**0→1, increase**) | UX-2 · cat 1→2: vendor context is occasional reference during PO authoring, not continuous-monitoring. Belongs in category 2. |
| Customer balance + credit | Always visible in workspace header | Always visible in context header when customer selected | 0 clicks (unchanged) | UX-2 (continuous-monitoring exception) · cat 1: operators check credit on every line — genuine category 1 data. |
| PO line details | Always visible when PO expanded | One click (row click → slide-over lines tab) | 1 click (**0→1, increase**) | UX-2 · cat 1→2: line detail is needed when working a specific PO, not while scanning the list. Belongs in category 2. |
| Intake batch details | Always visible in master/detail | Same (master/detail preserved) | 0 clicks (unchanged) | UX-2 (continuous-monitoring exception) · cat 1: batch verification IS the active work. Genuine category 1. |
| Photography queue | Always visible side panel | One click (customer → slide-over photos tab) | 1-2 clicks (**0→1-2, increase**) | UX-2 · cat 1→3: photography is rarely consulted during a sale (most operators never look at it). Belongs in category 3. |
| Purchase history | Always visible side panel | One click (customer → slide-over history tab) | 1-2 clicks (**0→1-2, increase**) | UX-2 · cat 1→2: purchase history is occasional reference during pricing decisions. Belongs in category 2. |
| Inventory finder | Always visible left pane | One click ("Add line" → slide-over finder) | 1 click (**0→1, increase**) | UX-2 · cat 1→2: finder is only relevant when adding lines, not during order review. Belongs in category 2 (triggered by the deliberate "Add line" action). |
| Sheet preview | Always visible panel | One click ("Preview sheet" → slide-over) | 1 click (**0→1, increase**) | UX-2 · cat 1→2: preview is consulted at the end of a sale, not throughout. Belongs in category 2. |
| Order actions (Confirm/Reserve/Cancel) | Expansion buttons | Same (row expansion) or slide-over actions | 0-1 clicks (unchanged) | UX-1, UX-4 · cat 1-2: actions are state-gated; relevant actions stay visible, irrelevant ones become absent (not disabled). |
| Selection bulk actions | Inline StatusActionBar | Sticky BulkActionBar | 0 clicks (unchanged) | UX-4 · cat 1 (selection-gated): bulk actions appear only when rows are selected — same access cost, different presentation. |
| Market signals | Inline panel | Slide-over vendor tab | 1 click (**0→1, increase**) | UX-2 · cat 1→2: market signals are occasional reference for PO decisions, not continuous-monitoring. Belongs in category 2. |
| Pre-post validation issues | Inline panel (always, even when "All checks passed") | Inline warning strip (only when issues exist) | 0 clicks when present, **absent when clean** | **UX-5** · cat 1 when an issue exists, otherwise no surface: validation only appears at the point of impact. The "All checks passed" state — which currently consumes 0-click attention for no information — is eliminated. This is the canonical fix for friction #7. |
| Admin tools (RecoveryView) | Always visible panel | One click (slide-over or settings tab) | 1-2 clicks (**0→1-2, increase**) | UX-3 · cat 1→3: admin tools are power-user surfaces rarely needed when recovering from a failure. Belongs in category 3 so the failure log stays in category 1. |
| Action button ribbon (PO) | Always visible with disabled buttons | State-gated: irrelevant buttons absent | 0 clicks for relevant, **absent for irrelevant** | **UX-1** · cat 1 for applicable actions, no surface for inapplicable. Disabled buttons consume attention; absent ones don't. |

**Key tradeoff:** Multiple data points that were previously at 0 clicks (always visible) now require 1 or 2 clicks. **Every increase is intentional** and corresponds to a data point that the integrated analysis identified as belonging in category 2 or category 3 of the attention budget. The principle from §0.1 is the canonical test: *anything always-visible that belongs in category 2 or 3 is a design bug.* These cost increases are the resolution of those design bugs, not a regression. In exchange, the operator's category 1 attention — the most precious resource in a six-hour shift — is freed for the work they're actually doing.

**One row goes the other direction:** the pre-post validation panel previously consumed 0-click attention even when it had nothing to say ("All checks passed" is the worst kind of habituating noise — friction #7). The retrofit eliminates this surface when clean, so its access cost drops from "0 clicks of attention for no information" to "no surface at all when no issue exists." This is the rare case where the retrofit reduces total attention cost rather than merely re-categorizing it.

