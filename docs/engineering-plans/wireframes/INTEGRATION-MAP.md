# TERP → Mercury Integration Map (Canonical)

**Version:** 1.0
**Date:** 2026-06-16
**Status:** Canonical reference. All agents consult this map to resolve TERP→Mercury migrations.

**Sources:**
- Design rules (v2.0 UX-first authority): [DESIGN-RULES.md](./DESIGN-RULES.md)
- UX analysis: [mercury-ux-integrated-analysis.md](../mercury-ux-integrated-analysis.md)
- Feature migrations: [terp-feature-to-mercury-mapping.md](../terp-feature-to-mercury-mapping.md) (§1.1, §1.2, §1.3, §3.1)
- Wireframe inventory: 47 files in this directory (27 views + 10 components + 10 flows)

**Mirrored to:** [DESIGN-RULES.md § Integration Map](./DESIGN-RULES.md#integration-map-ux-rule--terp-pattern--mercury-equivalent--wireframe), [MASTER-EXECUTION-DOCUMENT.md §17.10](../MASTER-EXECUTION-DOCUMENT.md). This file is the authority; the other two are faithful subsets.

---

## UX Rule Numbering — Important

This map uses the **v2.0 UX rule numbering** defined in [DESIGN-RULES.md](./DESIGN-RULES.md):

| # | v2.0 Rule (used in this map) |
|---|---|
| UX-1 | One Primary Surface Per View |
| UX-2 | Actions Are State-Gated, Not Permanently Visible |
| UX-3 | Context On Demand, Not By Default |
| UX-4 | Progressive Disclosure Is the Default |
| UX-5 | The Attention Budget (Tier 0 / Tier 1 / Tier 2) |
| UX-6 | State Must Survive Context Switches |
| UX-7 | Feedback Is Immediate and Actionable |
| UX-8 | The Table IS the View |
| UX-9 | Errors Are Safety Nets, Not Interrogations |
| UX-10 | Dashboard Is a Launchpad, Not a Control Tower |
| UX-11 | Collapsible Sections Over Competing Panels |
| UX-12 | Inline Editing Is Immediate |

**Do not confuse with the older numbering used in `mercury-ux-integrated-analysis.md` and `terp-feature-to-mercury-mapping.md`.** Those documents use a different rule list where, for example, their UX-1 = "Action visibility follows entity state" = v2.0 **UX-2** in this map. When tracing rationale across documents, always check which numbering applies.

---

## How to Use This Map

**Forward lookup (TERP feature → wireframe):** Search the "TERP Pattern" column. The row gives the governing UX rule(s) and the wireframe(s) you should consult before implementing.

**Reverse lookup (wireframe → coverage):** See the [Reverse Lookup](#reverse-lookup-wireframe--migrations-covered) table below.

**By UX rule:** The default sort below is v2.0 UX-1 → UX-12. Within each UX-rule group, rows are listed in the same order as the source document (`terp-feature-to-mercury-mapping.md §1.1 → §1.2 → §1.3 → §3.1`). Each row's *primary* governing rule determines its group; secondary rules appear in the "UX Rule(s)" cell.

**Access cost notation:** `0→N` means a surface previously visible at 0 clicks now requires N clicks. `0→0` means cost is unchanged. `selection-gated` means the surface appears only when rows are selected. `state-gated` means the surface appears only when the entity is in the relevant state. **Every cost increase is justified** in the "Friction Point" column — the source friction in TERP that the increase resolves.

---

## All 38 Migrations (Sorted by Primary v2.0 UX Rule)

| # | TERP Pattern | Mercury Equivalent | UX Rule(s) | Wireframe(s) | Access Cost | Friction Point |
|---|---|---|---|---|---|---|
| **UX-1 — One Primary Surface Per View** | | | | | | |
| 2 | WorkspacePanels (stacked, all visible) | Single primary + collapsible sections + tabs | UX-1, UX-11 | WF-V-SALES, WF-V-INTAKE, WF-V-DASH, WF-C-SLIDEOVER | 0→1 (Tier 0→1 for supplementary) | #1 SalesView's 8 simultaneous panels (worst friction in TERP — Claude 2/10, GPT-4o 2/10) |
| 25 | Sidebar nav groups (5 groups) | Simplified sidebar + bookmarks | UX-1, UX-8 | All views (sidebar component) | 0→0 (fewer groups) | #3 dashboard has no anchor — fewer nav groups reduce competition with primary surface |
| 38 | CommandPalette (Cmd+K) | Keep + enhance with entity search | UX-1, UX-7 | All views (Command Palette component) | 0→0 (singular surface) | none — already Mercury-aligned; entity search enhancement |
| **UX-2 — Actions Are State-Gated, Not Permanently Visible** | | | | | | |
| 28 | StatusActionBar (inline, per-view) | Sticky bottom bar on selection | UX-2, UX-4 | WF-C-BULK, WF-F-BULK-ACTION | 0→0 (selection-gated) | #7 inline action bars consume row space even when empty |
| 29 | StatusActionTable (per-view decision logic) | Same logic, rendered in BulkActionBar | UX-2 | WF-C-BULK, WF-F-BULK-ACTION | 0→0 (selection-gated) | none — decision-table logic preserved, presentation unified |
| 31 | Per-row action buttons (Confirm/Reserve/Cancel/etc.) | Keep — per-row, state-filtered | UX-2 | WF-C-GRIDVIEW, WF-V-PO, WF-V-SALES, WF-V-ORDERS | 0→0 (state-gated; absent if inapplicable) | #4 PO action overload — inapplicable actions absent, not disabled |
| 32 | Expansion actions (`Receive`, `Unfinalize`, etc., always visible) | Filtered by entity state machine | UX-2 | WF-C-GRIDVIEW, WF-V-PO, WF-F-PO-CREATE, WF-F-PO-RECEIVE | 0→0 (state-gated; absent if inapplicable) | #4 PO action overload — disabled buttons still cost attention; absent ones don't |
| **UX-3 — Context On Demand, Not By Default** | | | | | | |
| 1 | ContextDrawer (5 states, always present) | Right-side slide-over (420px standard, 60% wide) | UX-3, UX-4, UX-6 | WF-C-SLIDEOVER, WF-F-DETAIL-NAVIGATE | 0→1 (Tier 0→1) | #2 mid-flow context destroys state — slide-over has reliable URL state |
| 3 | VendorContextPanel (always-visible side panel) | Tab in PO slide-over | UX-3, UX-5 | WF-V-PO, WF-C-SLIDEOVER | 0→1 (Tier 0→1, UX-5 named example) | #7 permanent panels become invisible noise — vendor context occasional, not continuous |
| 4 | CustomerPurchaseHistoryPanel (always visible) | Tab in customer slide-over | UX-3, UX-5 | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→1 (Tier 0→1, UX-5 named example) | #6 customer selection fires 6 panel updates — history only relevant during pricing |
| 5 | PhotographyQueuePanel (always visible) | Tab in customer slide-over | UX-3, UX-5 | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→2 (Tier 0→2, UX-5 named example) | #7 panel becomes invisible noise — photography rarely consulted during sale |
| 6 | SalesSourcePane (Inventory Finder, permanent left pane) | Slide-over from "Add line" action | UX-3, UX-4 | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→1 (Tier 0→1) | #1 eight simultaneous panels — finder only relevant when adding lines |
| 7 | ReceiptPanel (inline, always when applicable) | Tab in PO slide-over or row expansion | UX-3, UX-4 | WF-V-PO, WF-C-SLIDEOVER, WF-F-PO-RECEIVE | 0→1 (Tier 0→1) | #7 permanent panels — receipt only relevant when reconciling a specific PO |
| 8 | ReceiptPreviewOverlay / ReceiptPreviewDrawer | Slide-over from "Preview receipt" button | UX-3, UX-4 | WF-C-SLIDEOVER, WF-V-PO, WF-F-PO-RECEIVE | 0→1 (Tier 0→1) | #7 always-visible overlays — preview is deliberate action, not default |
| 9 | Inspector tabs (bottom of grid) | Tabs inside `DetailSlideover` | UX-3, UX-11 | WF-V-ORDERS, WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #1 panel proliferation — inspector data is per-entity, not per-list |
| 17 | RowCommandHistoryDrawer | Tab in entity slide-over | UX-3 | WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #2 mid-flow state loss — history one click away, URL-encoded |
| 18 | IssueSidecar | Section in entity slide-over | UX-3 | WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #7 always-visible auxiliary panels — issues are entity-scoped, belong in Tier 1 |
| 19 | RelationshipDrawer | Tab in PO/sales slide-over | UX-3 | WF-C-SLIDEOVER, WF-V-PO, WF-V-SALES | 0→1 (Tier 0→1) | #7 always-visible auxiliary panels — relationships are entity-scoped |
| **UX-4 — Progressive Disclosure Is the Default** | | | | | | |
| 10 | Row expansion panels (inline detail) | Keep — Mercury's "Show details" pattern | UX-4 | All GridViews (WF-C-GRIDVIEW) | 0→0 (already opt-in) | none — preserves existing progressive disclosure |
| 11 | RecordPrepaymentDialog (blocking modal) | Slide-over from "Record Prepayment" action | UX-4, UX-7 | WF-V-PO, WF-C-SLIDEOVER | modal→slide-over (no longer blocking) | #4 PO action overload — blocking modal loses operator's place in grid |
| 12 | RefereeDialog (blocking modal) | Slide-over for edit | UX-4, UX-7 | WF-V-REFEREES, WF-C-SLIDEOVER | modal→slide-over | #7 blocking modal interrupts routine workflow |
| 13 | RefereeRelationshipDialog (blocking modal) | Slide-over for add | UX-4, UX-7 | WF-V-REFEREES, WF-C-SLIDEOVER | modal→slide-over | #7 blocking modal interrupts routine workflow |
| 14 | RefereeDetailPanel | Slide-over for view | UX-4 | WF-V-REFEREES, WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #7 always-visible detail panels — view detail belongs in Tier 1 |
| 15 | MediaBatchDrawer | Slide-over for batch detail | UX-4 | WF-V-MEDIA, WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #7 always-visible detail panels — batch detail belongs in Tier 1 |
| 16 | ProcessorDetailPanel | Slide-over for processor detail | UX-4 | WF-V-PROCESSORS, WF-C-SLIDEOVER | 0→1 (Tier 0→1) | #7 always-visible detail panels — processor detail belongs in Tier 1 |
| 20 | FilterPresetStrip (horizontal status pills) | Pill toggles with count badges | UX-4 | WF-C-TABBAR, WF-C-FILTER | 0→0 (unchanged) | none — preserves preset-pill behavior, adds count badges |
| 21 | AdvancedFilterBuilder (always-open side panel) | Behind "Advanced" button in FilterToolbar | UX-4, UX-8 | WF-C-FILTER, WF-F-FILTER-ADVANCED, WF-C-SLIDEOVER | 0→1 for advanced (Tier 0→2 — rare) | #7 always-visible filter builder consumes attention even when not in use |
| 22 | SavedFiltersDropdown | "Data views" dropdown in FilterToolbar | UX-4 | WF-C-FILTER | 0→1 (Tier 0→1) | none — preserves dropdown behavior, consolidates into toolbar |
| 23 | Grid quick filter text box | Keyword search in FilterToolbar | UX-4 | WF-C-FILTER | 0→0 (consolidated) | none — preserves quick-filter behavior |
| 24 | Inline filter chips (RecoveryView command families) | Chips in FilterToolbar | UX-4, UX-9 | WF-V-RECOVERY, WF-C-FILTER, WF-F-ERROR-RECOVER | 0→0 (unchanged) | #5 error recovery doesn't foreground failure — chips remain at 0 clicks |
| 30 | IntakeView selection totals strip | Promoted into BulkActionBar | UX-4 | WF-V-INTAKE, WF-C-BULK, WF-F-INTAKE-VERIFY | 0→0 (selection-gated) | #7 selection totals shown even when 0 selected = noise |
| **UX-6 — State Must Survive Context Switches** | | | | | | |
| 26 | Grid → detail via drawer (ad-hoc state) | Grid → slide-over with URL-encoded state | UX-6, UX-3 | WF-F-DETAIL-NAVIGATE, WF-C-SLIDEOVER | 0→1 (offset by reliable state survival) | #2 mid-flow context switching destroys state (GPT-4o 1/10, lowest score given) |
| 27 | Deep links between views (filtered navigation) | Keep — Mercury supports filtered URLs | UX-6 | All views (URL state encoder) | 0→0 (unchanged) | #2 reliable state — already URL-encoded |
| **UX-7 — Feedback Is Immediate and Actionable** | | | | | | |
| 35 | BatchRowActions (IntakeView inline) | Keep — already Mercury-like (immediate feedback in place) | UX-7 | WF-V-INTAKE, WF-F-INTAKE-VERIFY | 0→0 (unchanged) | none — IntakeView is the model other views converge toward |
| **UX-8 — The Table IS the View** | | | | | | |
| 36 | StatusActionBar / scattered KPI tiles | Single KPI line above table | UX-8, UX-10 | WF-C-SUMMARY, WF-V-DASH, WF-C-GRIDVIEW | 0→0 (consolidated; table dominance preserved) | #3 no anchor or landing zone — single KPI line is the visual anchor, table stays 70-80% |
| **UX-10 — Dashboard Is a Launchpad, Not a Control Tower** | | | | | | |
| 37 | DashboardView 8 stacked WorkspacePanels | 3-section launchpad (Welcome+Actions / KPI strip / Focus+Queues+Activity) | UX-10, UX-1 | WF-V-DASH, WF-C-DASHBOARD, WF-F-DASHBOARD | 0→0 (3 sections instead of 8) | #3 dashboard has no anchor or landing zone (Claude 4/10, GPT-4o 3/10) |
| **UX-12 — Inline Editing Is Immediate** | | | | | | |
| 33 | Grid cell editing (text, numeric) | Same — already immediate | UX-12 | All GridViews (WF-C-GRIDVIEW) | 0→0 (unchanged) | none — already Mercury-aligned |
| 34 | Status/category/method cell editing | Inline combobox with immediate save (Enter / blur) | UX-12, UX-7 | WF-C-COMBOBOX, WF-F-SALE-EDIT | 0→0 (unchanged) | UX-12 inconsistency — some cells saved immediately, some required action |

---

## Reverse Lookup: Wireframe → Migrations Covered

| Wireframe | Migrations Covered | Purpose |
|---|---|---|
| **WF-C-SLIDEOVER** | 1, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 26 | The universal slide-over component — replaces ~18 drawer/panel/modal components |
| **WF-C-FILTER** | 20, 21, 22, 23, 24 | FilterToolbar — replaces AdvancedFilterBuilder + FilterPresetStrip + filter chips |
| **WF-C-TABBAR** | 20 | ViewTabBar — replaces FilterPresetStrip with count-badged pills |
| **WF-C-BULK** | 28, 29, 30 | BulkActionBar — replaces per-view StatusActionBar |
| **WF-C-SUMMARY** | 36 | GridSummaryStrip — single KPI line above grids |
| **WF-C-COMBOBOX** | 34 | ComboboxCellEditor — replaces inconsistent status/category cell editors |
| **WF-C-DASHBOARD** | 37 | DashboardView template — 3-section launchpad |
| **WF-C-GRIDVIEW** | 10, 28, 31, 32, 33, 36 | GridView template — primary surface for ~15 views |
| **WF-C-MASTERDETAIL** | (IntakeView preservation) | Master/detail template — preserves IntakeView's existing pattern |
| **WF-C-WIZARD** | (PickView preservation) | WizardView template — preserves PickView's 3-screen flow |
| **WF-V-SALES** | 2, 4, 5, 6, 19 | SalesView retrofit — UX-1 primary surface; tabs/slide-overs replace 8 panels |
| **WF-V-PO** | 3, 7, 8, 11, 19, 31, 32 | PurchaseOrdersView retrofit — UX-2 state-gated actions, opt-in authoring |
| **WF-V-INTAKE** | 2, 30, 35 | IntakeView — already closest to Mercury; minimal changes |
| **WF-V-DASH** | 2, 36, 37 | DashboardView — UX-10 3-section launchpad |
| **WF-V-ORDERS** | 9, 31 | OrdersView — inspector tabs migrate to slide-over |
| **WF-V-RECOVERY** | 24 | RecoveryView — UX-9 action log as primary; admin tools sequestered |
| **WF-V-REFEREES** | 12, 13, 14 | RefereesView — modals become slide-overs |
| **WF-V-MEDIA** | 15 | MediaView — MediaBatchDrawer becomes slide-over |
| **WF-V-PROCESSORS** | 16 | ProcessorsView — ProcessorDetailPanel becomes slide-over |
| **WF-F-DETAIL-NAVIGATE** | 1, 26 | Flow: Grid → slide-over → URL state survives refresh (UX-6) |
| **WF-F-BULK-ACTION** | 28, 29, 30 | Flow: Selection → BulkActionBar appears → action runs |
| **WF-F-FILTER-ADVANCED** | 21 | Flow: Click "Advanced" → filter builder slide-over opens |
| **WF-F-DASHBOARD** | 37 | Flow: Open dashboard → eye lands on KPI strip in <1s |
| **WF-F-ERROR-RECOVER** | 24 | Flow: Posting fails → operator lands on failure, not admin tools (UX-9) |
| **WF-F-INTAKE-VERIFY** | 30, 35 | Flow: Master/detail intake verification (UX-3 continuous-monitoring exception) |
| **WF-F-PO-CREATE** | 32 | Flow: New PO → opt-in slide-over with vendor context tab (UX-2 state-gated) |
| **WF-F-PO-RECEIVE** | 7, 8, 32 | Flow: Receive PO → UX-2 state-gated `Receive`; receipt preview slide-over |
| **WF-F-SALE-CREATE** | 4, 5, 6 | Flow: Customer → context header → "Add line" → Inventory Finder slide-over |
| **WF-F-SALE-EDIT** | 34 | Flow: Inline ComboboxCellEditor → Enter to commit → green flash |

---

## Notes

### Why some v2.0 rules have no primary rows in this 38-row table

- **UX-5** (The Attention Budget) — the *meta-rule* governing every Tier 0→1 reassignment. Appears as the secondary rule on rows 3, 4, 5 (VendorContextPanel, CustomerPurchaseHistoryPanel, PhotographyQueuePanel — all three are *named examples* in the UX-5 design-bug list). Every cost-increase row in this map is governed by UX-5 implicitly; we do not give it its own group because that would duplicate the UX-3 group.
- **UX-9** (Errors Are Safety Nets, Not Interrogations) — implemented at view-level in RecoveryView (action log foregrounded as the primary surface; admin tools sequestered to slide-over or settings tab). Appears as secondary rule on row 24 (RecoveryView family chips). The full RecoveryView retrofit lives in [terp-feature-to-mercury-mapping.md § RecoveryView](../terp-feature-to-mercury-mapping.md).
- **UX-11** (Collapsible Sections Over Competing Panels) — implementation detail of UX-1. Appears as secondary rule on rows 2 (WorkspacePanels) and 9 (Inspector tabs). The collapsible-section pattern is the technique by which UX-1's "one primary surface" is achieved without removing information.

### Why row 6 (SalesSourcePane) references WF-F-SALE-CREATE, not a dedicated "WF-F-ADDLINE"

The "Add line" interaction lives inside the broader sale-creation flow. WF-F-SALE-CREATE covers the full sequence: orders grid → customer context → "Add line" → Inventory Finder slide-over → batch selection. A dedicated WF-F-ADDLINE wireframe was considered during planning but consolidated into WF-F-SALE-CREATE to keep the flow continuous.

### Access-cost philosophy

Every row where access cost increased (`0→1` or `0→2`) is the resolution of a design bug, not a regression. Per UX-5 ([DESIGN-RULES.md § UX-5](./DESIGN-RULES.md#ux-5-the-attention-budget)): *anything always-visible that belongs in Tier 1 or Tier 2 is a design bug.* The cost increases above move each surface to its correct attention-budget tier. In exchange, the operator's Tier 0 attention — the scarcest resource in a six-hour shift — is freed for the work they are actually doing.

The one row that *decreased* cost is the pre-post validation panel (handled in SalesView spec, not in this 38-row table). Today it consumes 0-click attention even when it has nothing to say ("All checks passed" — the worst kind of habituating noise, called out explicitly in UX-3's "What this rules out"). After the retrofit it is absent when clean, so its access cost drops from "0 clicks of attention for no information" to "no surface at all." See `terp-feature-to-mercury-mapping.md` appendix row 12.

### Cross-numbering sanity check

The source mapping document `terp-feature-to-mercury-mapping.md` uses an older UX rule numbering from `mercury-ux-integrated-analysis.md`. The translation between the two systems:

| Source-doc rule | What it means | v2.0 rule (this map) |
|---|---|---|
| Source UX-1 | Action visibility follows entity state | **v2.0 UX-2** |
| Source UX-2 | Supporting info one click away | **v2.0 UX-3** |
| Source UX-3 | One primary surface per view | **v2.0 UX-1** |
| Source UX-4 | Bulk actions appear only on selection | **v2.0 UX-4** (also UX-2 for state-gating) |
| Source UX-5 | Validation at point of impact | not in v2.0 as a standalone rule (covered by UX-3 anti-pattern: no "All checks passed" panels) |
| Source UX-6 | Tools/forms in slide-overs, modals for confirmations | **v2.0 UX-4** (progressive disclosure rules out blocking modals) |
| Source UX-7 | System never hides operator's mode | **v2.0 UX-1, UX-7** (mode visibility through primary-surface focus and immediate feedback) |
| Source UX-8 | State changes resolve in place | **v2.0 UX-7** |
| Source UX-9 | Filtering fluid; navigation durable | **v2.0 UX-4** (progressive filter disclosure) |
| Source UX-10 | Cell-level immediate save | **v2.0 UX-12** |
| Source UX-11 | URL is session memory | **v2.0 UX-6** |
| Source UX-12 | Empty states give next step | not in v2.0 as a standalone rule (covered by UX-10 dashboard launchpad) |

When tracing rationale across the source document and this map, always check which numbering system applies. This map and DESIGN-RULES.md use v2.0 exclusively.

### Source-document trace

All 38 rows trace back to:
- `terp-feature-to-mercury-mapping.md §1.1` (Context Delivery Patterns, 10 rows) → migrations 1–10
- `terp-feature-to-mercury-mapping.md §3.1` (Drawers → Slide-over consolidation, 9 additional rows not in §1.1) → migrations 11–19
- `terp-feature-to-mercury-mapping.md §1.2` (Action Patterns) + `§1.3` (Navigation Patterns) → migrations 20–27, 33–35, 38
- `terp-feature-to-mercury-mapping.md §1.1` rows 5–6 + `§1.2` Expansion actions → migrations 10, 28–32
- `terp-feature-to-mercury-mapping.md` view sections (Dashboard, GridJourney) → migrations 36–37

Wireframe IDs were verified against the actual files in `docs/engineering-plans/wireframes/` on 2026-06-16. All links resolve.
