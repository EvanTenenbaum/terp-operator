# TERP Operator — UX Design Rules

**Version:** 2.0 — UX-first rewrite
**Date:** 2026-06-16
**Authority:** Derived from [mercury-ux-integrated-analysis.md](../mercury-ux-integrated-analysis.md) (cross-model: Claude Opus 4.7 + GPT-4o)
**Supersedes:** v1.1 (token-first rules; visual tokens retained as subordinate implementation reference below)
**Applies to:** All Phase 0+ implementation — every view, every component, every template.

---

## Core Principle: The Operator's Attention Is Sacred

After six hours of processing orders, the operator's scarcest resource is not screen real estate, not clicks, not keystrokes — it is **attention**. Every panel that is always visible spends attention the operator did not choose to give. Every irrelevant action button is a cognitive triage the operator has to perform before they can do their actual work. Every state lost to a context switch is a betrayal of trust that teaches the operator to mistrust the system. Two independent models — Claude Opus 4.7 and GPT-4o — audited TERP from different angles and converged on the same diagnosis: the system overwhelms operators with simultaneous information, lacks progressive disclosure, and forces context-switching that destroys state. These rules govern **behavior**, not appearance. The visual tokens at the bottom of this document are implementation details that serve the rules; they are not the rules themselves.

> **The rule of thumb:** Would Mercury show this here? If Mercury — a bank handling money for millions of users — does not put eight equal-weight panels in front of the user, TERP should not either. Mercury's domain is narrower; the principle is universal.

---

## Rules

### UX-1: One Primary Surface Per View

**Statement:** Every view has exactly one job. The operator's eye lands on the primary surface in under 1 second. If you describe the view to someone on a phone call, they know what to click first without asking.

**Why it matters:** SalesView's eight simultaneous panels (Orders grid, Draft Lines grid, Suggestions grid, Sale Builder, Customer Purchase History, Photography Queue, Inventory Finder, ContextDrawer) force the operator to visually triage before they can start work. New operators freeze. Veterans develop "panel blindness" — they learn to ignore seven panels to function, which is the same mechanism that causes them to miss a real warning when one appears. A system that trains its users to ignore it is a broken system.

**What this rules out:** Two grids visible simultaneously with equal weight. A "workspace" pre-staged for a workflow the operator didn't ask for. Eight stacked WorkspacePanels on the dashboard. Five tabs in a ContextDrawer that the operator has to scan before clicking the right one.

**Trace:** Friction Point #1 (Claude 2/10, GPT-4o 2/10); Cross-model UX-3 — "The sheer number of panels dilutes focus, demanding significant cognitive effort"; Implementation Implications: "SalesView Must Go from 8 Panels to 1 Primary."

---

### UX-2: Actions Are State-Gated, Not Permanently Visible

**Statement:** Only show actions that apply to the entity in its current state. A draft PO shows `Save Draft` and `Approve & Finalize` only. An Ordered PO shows `Draft Intake`, `Record Prepayment`, and `Cancel` only. Buttons that don't apply are **absent**, not disabled.

**Why it matters:** Disabled buttons still consume attention. The operator's eye still scans them. New operators (under three months) pause on every button, including disabled ones, trying to understand why some are grayed out. Veterans learn to ignore disabled buttons, but the visual noise remains. Absent buttons cost zero attention. The cognitive load of an action ribbon scales with the count of *visible* buttons, not the count of *enabled* buttons.

**What this rules out:** Action ribbons that show `Receive`, `Draft Intake`, `Unfinalize`, `Cancel Order` for every PO regardless of state. Buttons greyed out as the "polite" alternative to hiding them. "Coming soon" stubs.

**Trace:** Friction Point #4 (Claude 5/10, GPT-4o 3/10); Cross-model UX-1 — "Irrelevant action buttons like 'Receive' and 'Unfinalize' further confuse and clutter"; Implementation Implications: "Action Buttons Must Be State-Gated (Not Just Disabled)."

---

### UX-3: Context On Demand, Not By Default

**Statement:** Supporting information lives one click away — in a tab, a slide-over, or a collapsible section. The only information visible on arrival is what the operator is **currently working on**. Permanent reference panels are a design bug, with one exception: live monitoring of a value the operator must watch continuously during the current task (e.g., credit balance while pricing).

**Why it matters:** VendorContextPanel is always visible on POsView. CustomerPurchaseHistory is always visible on SalesView. PhotographyQueue is always visible on SalesView. The operator did not ask for any of these; the system delivered them anyway. Permanent "everything's fine" panels habituate the operator's eye. When something actually changes in one of them, the operator has trained themselves not to look. The system is teaching its users to ignore it.

**What this rules out:** Always-visible vendor sidebars. Always-visible customer history panels. Always-visible photography queues. Pre-post validation panels that read "All checks passed" 90% of the time. Anything that announces information the operator did not ask for.

**Trace:** Friction Point #7 (Claude 4/10); Cross-model UX-2 — "Context-sensitive interfaces where only relevant actions are exposed. Minimalism in visible options preventing distraction"; Implementation Implications: "PO Authoring Must Be Opt-In (Slide-Over), Not Pre-Staged."

---

### UX-4: Progressive Disclosure Is the Default

**Statement:** Bulk action bars, detail panels, filter popovers, slide-overs, and modal forms appear **only when needed**. The default state of every view is the minimum possible. Interaction reveals the rest.

**Why it matters:** Mercury shows zero bulk bars, zero detail panels, and zero filter popovers on initial page load. The interface starts clean. The first click reveals what the operator needs for *that* moment. The second click reveals what they need for the next moment. TERP today shows everything immediately and forces the operator to triage. Progressive disclosure inverts that: TERP shows nothing, and the operator's first interaction tells the system what to reveal.

**What this rules out:** Pre-staged authoring workspaces. Bulk action bars visible when nothing is selected. Filter builders open by default. Modal dialogs that interrupt routine workflows (slide-overs instead). Always-on detail panels on the right edge of the viewport.

**Trace:** Cross-model UX-2 — "Lack of progressive disclosure and context-awareness severely impacts task efficiency"; Implementation Implications: "PO Authoring Must Be Opt-In (Slide-Over)" and "Every View Must Pass the 'What Do I See First?' Test."

---

### UX-5: The Attention Budget

**Statement:** Every piece of information falls into exactly one tier:

| Tier | Access | Reserved For |
|------|--------|--------------|
| **Tier 0** | 0 clicks, always visible | What the operator is working on right now |
| **Tier 1** | 1 click away (tab, slide-over, popover) | What the operator might need next |
| **Tier 2** | 2+ clicks, or search, or a different view | What the operator rarely needs |

**Anything currently always-visible that belongs in Tier 1 or Tier 2 is a design bug.**

**Why it matters:** This is the single most actionable principle from the integrated analysis. Applied to current TERP:

- CustomerPurchaseHistory on SalesView — Tier 1 (frequent during pricing). **Currently Tier 0. Bug.**
- VendorContextPanel on POsView — Tier 1 (occasional during PO). **Currently Tier 0. Bug.**
- Pre-post validation panel when no issues — Tier 2 (conditional). **Currently Tier 0. Bug.**
- PhotographyQueue on SalesView — Tier 2 (rare during sale). **Currently Tier 0. Bug.**
- Admin tools on RecoveryView — Tier 2 (power user). **Currently Tier 0. Bug.**

The retrofit's job is to move every always-visible surface that belongs in Tier 1 or Tier 2 into its correct tier. The operator should never pay 0-click attention for 1-click information.

**Trace:** "Operator Attention Budget — The Single Most Actionable Principle" (entire section); the five named design bugs are quoted directly from the integrated analysis.

---

### UX-6: State Must Survive Context Switches

**Statement:** Leaving a view mid-task preserves draft state. Returning restores the operator to the exact view they left — same row, same filters, same tab, same slide-over open, same draft text in fields. The URL encodes the full state. Refresh reproduces the view. Browser back works. Sharing the URL produces the same view for a colleague.

**Why it matters:** This is where GPT-4o gave its single lowest score: **1/10**. The operator is mid-sale building a customer's order. The phone rings — a vendor asks about last week's PO. The operator navigates to look it up. When they return, their draft may or may not be there. Sometimes it is. Sometimes it isn't. Over months, this erodes trust. Operators stop exploring. They stay in rigid, linear paths because any detour might cost data. They keep paper notepads of "the PO I was on." The system is making operators do its job.

**What this rules out:** Drawer states that don't encode into the URL. Refresh that loses the operator's selection. Back button that drops the active filter. Closing a slide-over that loses unsaved draft text. Any flow where the operator has to "remember where I was" because the system won't.

**Trace:** Friction Point #2 (Claude 4/10, **GPT-4o 1/10** — the lowest score either model gave); Cross-model UX-11 — "The inability to preserve state decimates workflow efficiency"; Implementation Implications: "State Must Encode into the URL."

---

### UX-7: Feedback Is Immediate and Actionable

**Statement:** Operators never wonder "did it work?" or "what just happened?" Every action produces immediate feedback at the point of the action: cell edit → green checkmark on the cell, not a toast in the corner. Command success → inline confirmation, not a modal. Failure → red border on the offending field with a fix link, not a separate error panel. Long-running operations show progress; never a silent spinner.

**Why it matters:** Cross-model UX-8: "Lack of feedback on task completion and dashboard refreshment leaves the operator uncertain." The operator finishes a command and wonders whether to refresh, wait, or click again. Uncertainty after action is more expensive than the action itself, because it forces a defensive second action ("let me click it again to be sure") that may corrupt state. Mercury shows balance updates within a fraction of a second of confirming a transfer — the user never has to ask "did it work?"

**What this rules out:** Toasts that fire two seconds after the action and disappear before the operator's eye reaches them. Modals to confirm routine actions. Spinners with no progress information. Navigation to a confirmation page that loses the operator's place in the grid.

**Trace:** Cross-model UX-8 — "State changes resolve in place; no navigation for confirmations"; cross-model finding: "Lack of feedback on task completion and dashboard refreshment leaves the operator uncertain."

---

### UX-8: The Table IS the View

**Statement:** In data views, the table occupies 70–80% of visual weight. Chrome — borders, headers, toolbars, panels, decorations — recedes. The operator's eye must land on the data in under 1 second. Mercury's transactions page: 968px table in a 1440px viewport, with a single filter toolbar above and a single KPI line above that. Nothing else competes.

**Why it matters:** The test "If I describe this view to someone on a phone call, they know what to click first" fails when chrome competes with data for the operator's attention. Operators come to TERP to *do work on data*. Anything that visually equals or exceeds the data is misallocating attention.

**What this rules out:** Heavy view headers with action buttons that compete with the table. Filter toolbars that take 20% of the viewport. KPI strips that pull the eye away from rows. Side panels that crop the table to 50% width. Any chrome that the operator has to consciously visually subtract to find the data.

**Trace:** Implementation Implications: "Every View Must Pass the 'What Do I See First?' Test"; Friction Point #4 (PO authoring buried in a crowded layout); Mercury observation: "968px table in 1440px viewport."

---

### UX-9: Errors Are Safety Nets, Not Interrogations

**Statement:** When something fails, the failure is foregrounded — not buried behind admin tools, not shown as a bare error code, not requiring the operator to figure out which surface holds the failure. The error view shows: what command was attempted, what failed, recent commands for context, and one obvious action (Retry, Reverse, or Mark Resolved). Inline retry available without opening a detail panel for the common case.

**Why it matters:** A posting fails at 5:30 AM. The operator opens RecoveryView half-awake to find three competing surfaces (Action Log grid, Admin tools, Command Reversal panel). The Admin tools are visually prominent. The failure is in the Action Log. The operator's eye lands on Admin tools first. GPT-4o called the lack of error context "debilitating" (2/10). Error recovery is when the operator most needs the system to feel like a safety net. A design that makes failures hard to find makes the system feel punitive.

**What this rules out:** Error views that surface admin tools more prominently than the actual error. Error rows that show identifiers without command context. Separate "recovery" destinations when status filtering would suffice. Bare error codes with no Retry button.

**Trace:** Friction Point #5 (Claude 5/10, GPT-4o 2/10, calling it "debilitating"); Implementation Implications: "Recovery Must Show Command Context, Not Just Error Codes."

---

### UX-10: Dashboard Is a Launchpad, Not a Control Tower

**Statement:** The dashboard answers three questions on arrival, in three visual zones:

1. **What needs my attention?** — Quick actions + 4-card KPI strip (default eye landing zone)
2. **What was I working on?** — My drafts + recent activity (recovery zone)
3. **What's the broader state?** — Focus list + work queues (situational awareness zone)

That's three sections, not eight. The eye lands on the KPI strip. The operator knows their position in 2 seconds.

**Why it matters:** Friction Point #3. Opening TERP at 8:14 AM means landing on eight equally-weighted panels. The eye lands nowhere in particular. The operator has to choose where to start — its own small decision tax, paid every morning, every day, for years. A crowded dashboard says "you figure it out." A focused dashboard says "here's where to start." The first five seconds of opening the app shape the operator's emotional posture toward the entire session.

**What this rules out:** Eight stacked WorkspacePanels. KPI tiles competing with Today Focus competing with Pending Queues competing with My Open Work. Equal visual weight across all dashboard sections. Dashboards that try to be a control tower (everything visible) instead of a launchpad (clear next move).

**Trace:** Friction Point #3 (Claude 4/10, GPT-4o 3/10); Cross-model finding — "Dashboard lacks clear prioritization and directive"; Implementation Implications: "Dashboard Must Go from 8 Panels to Focused Overview."

---

### UX-11: Collapsible Sections Over Competing Panels

**Statement:** Multi-section views (SalesView, IntakeView) show **one primary surface** at full width. Supplementary sections (Suggestions, Purchase History, Draft Lines, Photography Queue) appear as **collapsible sections** with `[▸ Section Name]` toggles or as **tabs** in a slide-over. **One section expanded at a time** in any collapsible group. No simultaneous competing panels claiming equal attention.

**Why it matters:** The current TERP pattern of stacking 3–6 WorkspacePanels vertically gives each panel equal visual weight, which means none is unambiguously primary, which means the operator must triage on every interaction. Collapsible sections preserve the information (one click away) while restoring a single focal point. Tabs in a slide-over are even better: they don't take space in the main view at all.

**What this rules out:** Two grids stacked vertically with equal weight. Three panels visible simultaneously where two are "supporting." Accordion sections where multiple are expanded at once. Permanent supporting panels alongside the primary surface.

**Trace:** Friction Point #1; Implementation Implications: "SalesView Must Go from 8 Panels to 1 Primary + Collapsible Sections + Slide-Over"; "What This Does Not Mean" section: "The retrofit doesn't remove information. It sequesters it behind the correct access tier."

---

### UX-12: Inline Editing Is Immediate

**Statement:** Cell-level edits save on `Enter` or blur. No "Save" button. Success: green checkmark flash on the cell, ~600ms. Failure: red left border + inline error message + obvious retry, in place. Multi-field forms (slide-over forms, new-entity wizards) have explicit `Save` because they are atomic; **individual cells are not.**

**Why it matters:** Cross-model UX-10: TERP's current inline edit save behavior is inconsistent across columns. Some cells save immediately. Some require an action. The operator can't predict which is which, so they develop the defensive habit of always pressing a save action — which means they sometimes press it on cells that already saved, which means they sometimes get a confusing "no changes" toast. Consistent behavior is more important than the specific behavior.

**What this rules out:** Cells that save immediately on some columns and require a save action on others within the same grid. Modal dialogs for single-cell edits. Save buttons that appear next to a single inline-edited cell. Save behavior that requires the operator to remember per-column rules.

**Trace:** Cross-model UX-10 — "Cell-level interactions save immediately; multi-field forms have explicit save"; UX-12 — "Empty states give the operator a next step."

---

## Integration Map: UX Rule → TERP Pattern → Mercury Equivalent → Wireframe

This map covers all 38 TERP→Mercury migrations from [terp-feature-to-mercury-mapping.md](../terp-feature-to-mercury-mapping.md) (§1.1, §1.2, §1.3, §3.1). Rows are organized by **primary v2.0 UX rule** (UX-1 → UX-12, as defined in this document); secondary rules appear in the "UX Rule(s)" column. The canonical sortable reference with reverse lookup lives at [INTEGRATION-MAP.md](./INTEGRATION-MAP.md); this section is the authority-side annotated view.

**Note on UX rule numbering:** This map uses the **v2.0 UX rule numbering** as defined above (e.g., UX-1 = "One Primary Surface Per View", UX-3 = "Context On Demand", UX-12 = "Inline Editing Is Immediate"). The source mapping document [terp-feature-to-mercury-mapping.md](../terp-feature-to-mercury-mapping.md) uses the older numbering from `mercury-ux-integrated-analysis.md` (e.g., its UX-1 = "Action visibility follows entity state" = v2.0 UX-2). Cross-reference both documents carefully when tracing rationale.

**Access cost notation:** `0→N` means a surface previously visible at 0 clicks now requires N clicks. `selection-gated` / `state-gated` means the surface appears only conditionally. Every cost increase is justified — it resolves a design bug per the operator attention budget (see UX-5 above).

### UX-1 — One Primary Surface Per View

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 2 | UX-1, UX-11 | WorkspacePanels (stacked, all visible) | Single primary + collapsible sections + tabs | View templates + `DetailSlideover` tabs | WF-V-SALES, WF-V-INTAKE, WF-V-DASH, WF-C-SLIDEOVER | 0→1 (Tier 0→1 for supplementary) |
| 25 | UX-1, UX-8 | Sidebar nav groups (5 groups) | Simplified sidebar + bookmarks | Sidebar component | All views | 0→0 (fewer groups, less competition with table) |
| 38 | UX-1, UX-7 | CommandPalette (Cmd+K) | Keep + enhance with entity search | Existing CommandPalette | All views (Command Palette component) | 0→0 (singular full-screen surface) |

### UX-2 — Actions Are State-Gated, Not Permanently Visible

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 28 | UX-2, UX-4 | StatusActionBar (inline, per-view) | Sticky bottom bar on selection | `BulkActionBar` | WF-C-BULK, WF-F-BULK-ACTION | 0→0 (selection-gated) |
| 29 | UX-2 | StatusActionTable (per-view decision logic) | Same logic, rendered in BulkActionBar | `BulkActionBar` + decision tables | WF-C-BULK, WF-F-BULK-ACTION | 0→0 (selection-gated) |
| 31 | UX-2 | Per-row action buttons (Confirm/Reserve/Cancel/etc.) | Keep — per-row, but state-filtered | Row expansion / action slot | WF-C-GRIDVIEW, WF-V-PO, WF-V-SALES, WF-V-ORDERS | 0→0 (state-gated; absent if inapplicable) |
| 32 | UX-2 | Expansion actions (`Receive`, `Unfinalize`, etc., always visible) | Filtered by entity state machine | Entity state machines + `entity-actions.ts` | WF-C-GRIDVIEW, WF-V-PO, WF-F-PO-CREATE, WF-F-PO-RECEIVE | 0→0 (state-gated; absent if inapplicable) |

### UX-3 — Context On Demand, Not By Default

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 1 | UX-3, UX-4, UX-6 | ContextDrawer (5 states, always present) | Right-side slide-over (420px / 60%) | `DetailSlideover` | WF-C-SLIDEOVER, WF-F-DETAIL-NAVIGATE | 0→1 (Tier 0→1) |
| 3 | UX-3, UX-5 | VendorContextPanel (always-visible side panel) | Tab in PO slide-over | `DetailSlideover` Vendor tab | WF-V-PO, WF-C-SLIDEOVER | 0→1 (Tier 0→1 — UX-5 named example) |
| 4 | UX-3, UX-5 | CustomerPurchaseHistoryPanel (always visible) | Tab in customer slide-over | `DetailSlideover` History tab | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→1 (Tier 0→1 — UX-5 named example) |
| 5 | UX-3, UX-5 | PhotographyQueuePanel (always visible) | Tab in customer slide-over | `DetailSlideover` Photos tab | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→2 (Tier 0→2 — UX-5 named example) |
| 6 | UX-3, UX-4 | SalesSourcePane (Inventory Finder, permanent left pane) | Slide-over from "Add line" | `DetailSlideover` (entityType=finder) | WF-V-SALES, WF-C-SLIDEOVER, WF-F-SALE-CREATE | 0→1 (Tier 0→1) |
| 7 | UX-3, UX-4 | ReceiptPanel (inline, always when applicable) | Tab in PO slide-over or row expansion | `DetailSlideover` Receipt tab | WF-V-PO, WF-C-SLIDEOVER, WF-F-PO-RECEIVE | 0→1 (Tier 0→1) |
| 8 | UX-3, UX-4 | ReceiptPreviewOverlay / ReceiptPreviewDrawer | Slide-over from "Preview receipt" button | `DetailSlideover` | WF-C-SLIDEOVER, WF-V-PO, WF-F-PO-RECEIVE | 0→1 (Tier 0→1) |
| 9 | UX-3, UX-11 | Inspector tabs (bottom of grid) | Tabs inside `DetailSlideover` | `DetailSlideover` tabs | WF-V-ORDERS, WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 17 | UX-3 | RowCommandHistoryDrawer | Tab in entity slide-over | `DetailSlideover` History tab | WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 18 | UX-3 | IssueSidecar | Section in entity slide-over | `DetailSlideover` Issues section | WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 19 | UX-3 | RelationshipDrawer | Tab in PO/sales slide-over | `DetailSlideover` Relationships tab | WF-C-SLIDEOVER, WF-V-PO, WF-V-SALES | 0→1 (Tier 0→1) |

### UX-4 — Progressive Disclosure Is the Default

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 10 | UX-4 | Row expansion panels (inline detail) | Keep — Mercury's "Show details" pattern | AG Grid row expansion | WF-C-GRIDVIEW (All GridViews) | 0→0 (already opt-in) |
| 11 | UX-4, UX-7 | RecordPrepaymentDialog (blocking modal) | Slide-over from "Record Prepayment" action | `DetailSlideover` | WF-V-PO, WF-C-SLIDEOVER | modal→slide-over (no longer blocking) |
| 12 | UX-4, UX-7 | RefereeDialog (blocking modal) | Slide-over for edit | `DetailSlideover` | WF-V-REFEREES, WF-C-SLIDEOVER | modal→slide-over |
| 13 | UX-4, UX-7 | RefereeRelationshipDialog (blocking modal) | Slide-over for add | `DetailSlideover` | WF-V-REFEREES, WF-C-SLIDEOVER | modal→slide-over |
| 14 | UX-4 | RefereeDetailPanel | Slide-over for view | `DetailSlideover` | WF-V-REFEREES, WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 15 | UX-4 | MediaBatchDrawer | Slide-over for batch detail | `DetailSlideover` | WF-V-MEDIA, WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 16 | UX-4 | ProcessorDetailPanel | Slide-over for processor detail | `DetailSlideover` | WF-V-PROCESSORS, WF-C-SLIDEOVER | 0→1 (Tier 0→1) |
| 20 | UX-4 | FilterPresetStrip (horizontal status pills) | Pill toggles with count badges | `ViewTabBar` | WF-C-TABBAR, WF-C-FILTER | 0→0 (unchanged) |
| 21 | UX-4, UX-8 | AdvancedFilterBuilder (always-open side panel) | Behind "Advanced" button in FilterToolbar | `FilterToolbar` + `DetailSlideover` | WF-C-FILTER, WF-F-FILTER-ADVANCED, WF-C-SLIDEOVER | 0→1 for advanced (Tier 0→2 — rare) |
| 22 | UX-4 | SavedFiltersDropdown | "Data views" dropdown in FilterToolbar | `FilterToolbar` | WF-C-FILTER | 0→1 (Tier 0→1) |
| 23 | UX-4 | Grid quick filter text box | Keyword search in FilterToolbar | `FilterToolbar` | WF-C-FILTER | 0→0 (consolidated) |
| 24 | UX-4, UX-9 | Inline filter chips (RecoveryView family chips) | Chips in FilterToolbar | `FilterToolbar` chips | WF-V-RECOVERY, WF-C-FILTER, WF-F-ERROR-RECOVER | 0→0 (unchanged) |
| 30 | UX-4 | IntakeView selection totals strip | Promoted into BulkActionBar | `BulkActionBar` | WF-V-INTAKE, WF-C-BULK, WF-F-INTAKE-VERIFY | 0→0 (selection-gated) |

### UX-6 — State Must Survive Context Switches

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 26 | UX-6, UX-3 | Grid → detail via drawer (ad-hoc state) | Grid → slide-over with URL-encoded state | `DetailSlideover` + URL state | WF-F-DETAIL-NAVIGATE, WF-C-SLIDEOVER | 0→1 (offset by reliable state survival) |
| 27 | UX-6 | Deep links between views (filtered nav) | Keep — Mercury supports filtered URLs | URL state encoder | All views | 0→0 (unchanged) |

### UX-7 — Feedback Is Immediate and Actionable

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 35 | UX-7 | BatchRowActions (IntakeView inline) | Keep — already Mercury-like (immediate feedback in place) | Existing inline actions | WF-V-INTAKE, WF-F-INTAKE-VERIFY | 0→0 (unchanged — model for other views) |

### UX-8 — The Table IS the View

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 36 | UX-8, UX-10 | StatusActionBar / scattered KPI tiles | Single KPI line above table | `GridSummaryStrip` | WF-C-SUMMARY, WF-V-DASH, WF-C-GRIDVIEW | 0→0 (consolidated; table dominance preserved) |

### UX-10 — Dashboard Is a Launchpad, Not a Control Tower

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 37 | UX-10, UX-1 | DashboardView 8 stacked WorkspacePanels | 3-section launchpad (Welcome+Actions / KPI strip / Focus+Queues+Activity) | `DashboardView` template | WF-V-DASH, WF-C-DASHBOARD, WF-F-DASHBOARD | 0→0 (3 sections instead of 8) |

### UX-12 — Inline Editing Is Immediate

| # | UX Rule(s) | TERP Pattern (Current) | Mercury Equivalent | Target Component | Wireframe | Access Cost |
|---|------------|------------------------|--------------------|--------------------|-----------|-------------|
| 33 | UX-12 | Grid cell editing (text, numeric) | Same — already immediate | AG Grid default editors | WF-C-GRIDVIEW (All GridViews) | 0→0 (unchanged) |
| 34 | UX-12, UX-7 | Status/category/method cell editing | Inline combobox with immediate save (Enter / blur) | `ComboboxCellEditor` | WF-C-COMBOBOX, WF-F-SALE-EDIT | 0→0 (unchanged) |

### Rules with no direct primary rows in this 38-row table

- **UX-5** (The Attention Budget) — the meta-rule governing all Tier 0→1 reassignments throughout this map. Appears as the secondary rule on rows 3, 4, 5 (VendorContextPanel, CustomerPurchaseHistoryPanel, PhotographyQueuePanel are named examples in UX-5). Every cost-increase row in this map is governed by UX-5 implicitly.
- **UX-9** (Errors Are Safety Nets, Not Interrogations) — implemented at view-level for RecoveryView (action log foregrounded; admin tools sequestered). Appears as secondary rule on row 24 (RecoveryView family chips). The full RecoveryView retrofit lives in `terp-feature-to-mercury-mapping.md §2 RecoveryView`.
- **UX-11** (Collapsible Sections Over Competing Panels) — implementation detail of UX-1. Appears as secondary rule on rows 2 (WorkspacePanels) and 9 (Inspector tabs).

### Access-cost discipline

Every row where access cost increased (`0→1` or `0→2`) is the resolution of a design bug, not a regression. Per UX-5 (the operator attention budget): *anything always-visible that belongs in Tier 1 or Tier 2 is a design bug.* The cost increases above move each surface to its correct attention-budget tier. In exchange, the operator's Tier 0 attention — the scarcest resource in a six-hour shift — is freed for the work they are actually doing. The pre-post validation panel (not in this 38-row table; handled in SalesView spec) is the one surface whose total attention cost *decreases*: it currently consumes 0-click attention even when there is nothing to say ("All checks passed"), and after the retrofit it is absent when clean — see UX-3 anti-pattern list and `terp-feature-to-mercury-mapping.md §7.5 verification #4`.

---

## Visual Token Reference (Subordinate Implementation Detail)

> **Important:** The values below are implementation details that serve the UX rules above. They are **not** design drivers. A component can satisfy all visual tokens and still violate UX rules; the visual tokens cannot rescue a design that puts eight panels on screen at once. When tokens and UX rules conflict, the UX rules win.

These tokens are reproduced from Mercury demo app analysis (see [MASTER-EXECUTION-DOCUMENT.md §14](../MASTER-EXECUTION-DOCUMENT.md)) and tuned for TERP's domain (denser data, accessibility-grade contrast, system-font identity).

### Typography

- **Font stack:** Inter, system-ui (TERP identity, not Mercury's brand font)
- **Weight range:** 400–600 (Mercury caps at 480; TERP allows 500–600 for dense-data scannability)
- **Table headers:** 13px, regular case, muted color; **no uppercase, no bold**
- **Table cells:** 15–16px regular
- **Body text:** 14px regular
- **Section labels:** 13px medium

### Color & Contrast

- **Borders:** 0.08–0.12 opacity (cards: shadow-only with optional faint border for dense-view accessibility)
- **Pill borders:** 0.16 opacity (selected pill: solid)
- **Error states:** `#d92d20` (TERP-adjusted from Mercury's `rgb(176,23,95)` for AA contrast)
- **Success flash:** green checkmark, ~600ms duration
- **Muted text:** `text-muted-foreground` (semantic class, not hardcoded hex)

### Spacing & Layout

- **Card style:** shadow-only, no border
- **Pill radius:** 8px
- **Slide-over standard width:** 420px
- **Slide-over wide width:** 60% of viewport
- **Table visual weight:** 70–80% of view area
- **KPI strip:** 4 cards max, horizontal
- **Filter toolbar height:** ≤48px

### Component Tokens (semantic classes; never inline `style={{...}}`)

- Status pills: `status-pill-{open|confirmed|posted|draft|...}` — uses entity status enum
- Severity: `severity-{info|warning|error|success}` — for inline strips
- Density: `grid-density-{compact|standard|comfortable}` — operator preference

### What These Tokens Do Not Do

- They do **not** decide what's on screen — UX-1 through UX-12 decide that.
- They do **not** decide what's always visible vs. on-demand — UX-3 and UX-5 decide that.
- They do **not** decide which actions appear — UX-2 decides that.
- They do **not** decide layout hierarchy — UX-1, UX-8, UX-11 decide that.

Visual tokens are the **last** decision after the UX rules are satisfied.

---

## References

- **Canonical UX analysis:** [mercury-ux-integrated-analysis.md](../mercury-ux-integrated-analysis.md) (cross-model: Claude Opus 4.7 + GPT-4o)
- **Feature migration map:** [terp-feature-to-mercury-mapping.md](../terp-feature-to-mercury-mapping.md) (38 TERP→Mercury mappings)
- **Mercury demo tokens:** [MASTER-EXECUTION-DOCUMENT.md §14](../MASTER-EXECUTION-DOCUMENT.md)
- **Wireframe inventory:** [MASTER-EXECUTION-DOCUMENT.md §17.4](../MASTER-EXECUTION-DOCUMENT.md)
- **Visual review artifact:** [wireframes/review.html](./review.html) (10 high-res wireframes with traceability)
- **Source wireframes:** `WF-*.md` (47 files: 27 views + 10 components + 10 flows)

---

## What This Does Not Mean

- **Not a visual redesign.** These rules govern behavior — what's shown, when, how many clicks away. Pixel values are subordinate.
- **Not feature removal.** Every piece of information TERP surfaces today is useful to someone, sometime. The retrofit sequesters it behind the correct access tier; it does not remove it.
- **Not "make TERP look like Mercury."** Mercury is a bank. TERP is a wholesale brokerage in a richer domain. The retrofit adds tabs, slide-overs, context headers, and inline strips where the domain genuinely requires more than banking does. The principle — respect operator attention — is identical. The implementation is domain-appropriate.
