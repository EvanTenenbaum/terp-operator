# AQA Report — Mercury UX Retrofit Plans

**Date:** 2026-06-15
**Reviewer:** PM (adversarial review, aqa-reviewer lane unavailable)
**Documents reviewed:** `mercury-ux-adoption.md`, `terp-feature-to-mercury-mapping.md`
**Underlying evidence:** TERP view coupling audit, Mercury pattern census, Mercury progressive disclosure study

---

## Score: 72/100

Reducers applied:
- -10: Missing workflow cross-reference analysis (finding F/H below)
- -8: Effort estimates not calibrated against coupling reality (finding E/G)
- -5: FilterToolbar/AdvancedFilterBuilder interaction unspecified (finding C)
- -5: Research coverage gaps (finding K)

---

## Findings

### FINDING A — "Clean Seams" Overstated
**Severity: Medium**

**Claim challenged:** "TERP's architecture already has clean seams (OperatorGrid, useCommandRunner, useUiStore, GridJourney) that make this tractable"

**Evidence:** The coupling audit found:
- SalesView: 85% of code is data-tangled. Column definitions contain `valueGetter`s that call `resolvePricingRuleEntry`, `parsePriceRange`, `computeLineMarkup`. Inline `cellRenderer`s reference `releaseEligibility.data`, `canWrite`, `isRunning`.
- `fulfillmentActionsColumn` is a `useMemo` re-creating on every `isRunning` change — a known performance bug, not a clean seam.
- `lineRowsWithRule` computes pricing rules in a `useMemo` inside the view.
- PurchaseOrdersView: `purchaseOrderSelectionActions` builds a `StatusActionTable` with closures over `runCommand`, `canWrite`, `selectedLines`, `receiveQtyByLine`.

The seams *exist* (OperatorGrid, useCommandRunner, context drawer), but they are not *clean*. Exploiting them requires significant refactoring before wiring new components. The plan acknowledges this implicitly (Phase 3 tasks include "extract inline cell renderers into separate components", "refactor fulfillmentActionsColumn") but doesn't reflect this extra work in the effort estimates.

**Recommendation:** Rename "clean seams" to "existing seams" and add 1-2 weeks to Phase 3 for the prerequisite refactoring that must happen before new components can be wired in. Specifically: extracting SalesView cell renderers, creating `useSalesLineRows` hook, and stabilizing `fulfillmentActionsColumn` should be Phase 3A tasks, not bundled into the migration.

---

### FINDING B — ComboboxCellEditor Timeline Optimistic
**Severity: Medium**

**Claim challenged:** "ComboboxCellEditor for AG Grid, 2–3 weeks"

**Evidence:** The component must implement:
- AG Grid `ICellEditor` interface (`getValue`, `isPopup`, `focusIn`, `afterGuiAttached`, `destroy`)
- Custom dropdown with typeahead filtering (for lists >500 items — category lists will hit this)
- Async save via `useCommandRunner` through existing `onCellCommit` pipeline
- Three visual states per cell (empty, filled, error) plus loading state
- Full keyboard navigation (Enter/Escape/Arrow keys/Tab)
- Accessibility: `role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-activedescendant`
- "Create new" option for extensibility (Mercury has this)
- Clear button per cell (Mercury has this)
- Integration test with OperatorGrid's `onCellCommit` and undo/redo

This is not a 2-week CRUD component. It's a production-quality custom AG Grid editor with async I/O and full a11y. More realistic: **3–4 weeks** including integration testing and edge cases. Add 1 week to Phase 0.

**Recommendation:** Adjust Phase 0 ComboboxCellEditor estimate to 3 weeks, push non-CRITICAL Phase 0 components (Bookmarks, CTA slot) to Phase 1, net impact +1 week to timeline.

---

### FINDING C — FilterToolbar/AdvancedFilterBuilder Interaction Gap
**Severity: High**

**Claim challenged:** "FilterToolbar can replace AdvancedFilterBuilder as default UX"

**Evidence:** The plan states AdvancedFilterBuilder is kept behind an "Advanced" button. But it does not specify:
1. **State bridging:** If the user applies filters via FilterToolbar (Date=June, Keyword="acme"), then clicks "Advanced" — does AdvancedFilterBuilder show those filters pre-populated? If not, users lose their filter state on transition. If yes, how does the serialization bridge work?
2. **Two-way sync:** If the user builds a complex filter in AdvancedFilterBuilder (e.g., `(category=flower AND price>100) OR (vendor=acme)`), then dismisses it — does the FilterToolbar show an indicator that complex filters are active? Can a user see at a glance what filters are applied?
3. **Preset interaction:** Filter presets (status:draft,confirmed) from FilterPresetStrip map naturally to FilterToolbar chips. But what about the complex presets some views have? SalesView's suggestion filter bar has nested controls (category dropdown + price bracket + aging checkbox + clear all). Can FilterToolbar represent these?

**Recommendation:** Before Phase 1, define the FilterToolbar ↔ AdvancedFilterBuilder interaction contract. Specifically: filter state serialization format, two-way sync protocol, and how complex active filters are surfaced in the simple toolbar. Add to Phase 0 tasks.

---

### FINDING D — DetailSlideover God Component Risk
**Severity: Medium-High**

**Claim challenged:** "DetailSlideover can replace ~18 drawer/panel components"

**Evidence:** The ~18 components being consolidated have diverse behaviors:
- Some query independently (MediaBatchDrawer, EntityTimelineTab, CustomerCreditPanel)
- Some derive from passed row data (compactFacts, titleFor, entitySubline)
- Some use Zustand global state (ContextDrawer, via `activeDrawerEntityByView`)
- Some have dedicated open/close triggers specific to their parent view (RecordPrepaymentDialog opens from PO expansion button)
- Some have complex internal state machines (ContextDrawer: closed → peek → standard → wide → focus, with drag handles and transitions)

A single `DetailSlideover` component handling all of these would need:
- Dynamic tab registration per entity type
- Mixed data fetching strategies (props vs. queries vs. store)
- Variable width states
- Multiple open triggers
- Complex internal state management

The risk: the DetailSlideover becomes a god component MORE complex than the 18 components it replaced.

**Mitigation (already partially in design):** Use a tab registry pattern. Each entity type registers its tabs as separate components. The slide-over is a shell that renders registered tabs. Data fetching stays WITHIN each tab component (as it does today). The slide-over only manages: open/close state, width, tab selection, and header actions.

**Recommendation:** Explicitly design the tab registry pattern before Phase 1. Define the `DetailTab` interface contract. Confirm that existing tab components (PoLinesTab, LotMovementTab, etc.) can be registered without modification. If this design work isn't done, Phase 3 (complex views) will hit significant rework.

---

### FINDING E — SalesView Timeline Unrealistic
**Severity: Blocker**

**Claim challenged:** "SalesView migration: Week 7-8 (2 weeks)"

**Evidence from the audit:**

SalesView (1986 lines) contains:
- 10 tRPC queries
- ~30 unique `runCommand` calls
- 3 separate grids (Orders, Draft Lines, Suggestions) with distinct column definitions
- `orderColumns` (9 cols), `suggestionColumns` (10 cols), `lineColumns` (21 cols) + `fulfillmentActionsColumn`
- 9 inline cell renderers in lineColumns that reference view-level state
- `fulfillmentActionsColumn` in a `useMemo` depending on `isRunning`, `canWrite`, `runCommand`
- `lineRowsWithRule` pricing computation
- 6 WorkspacePanels (Sale Builder, Line Validation, Sheet Preview, SalesSourcePane, PhotographyQueue, CustomerPurchaseHistory)
- `salesOrderExpansionConfig` + `salesLineExpansionConfig` with action handlers
- `salePrePostChecks` validation logic
- `buildConfirmPayload` complex multi-field payload construction
- Warehouse alert dialog with focus trapping
- Sheet preview with snapshot/retry/export/copy logic

**The plan's Phase 3 tasks for SalesView include** extracting cell renderers to components, refactoring fulfillmentActionsColumn, creating useSalesLineRows hook, adding FilterToolbar, adding GridSummaryStrip, adding BulkActionBar, adding ComboboxCellEditor for status/pricingStrategy/customer/tags columns, wiring ViewTabBar, AND full validation against 5 existing test suites.

**Realistic estimate:** 5–6 weeks for one engineer, assuming the prerequisite refactoring (extracting renderers, stabilizing columns) is done in a pre-phase. If bundled into the same phase: 6–8 weeks.

**Recommendation:** Split SalesView into two sub-phases:
- Phase 3A (Week 7-9): Refactoring only — extract cell renderers, create hooks, stabilize columns. Zero new components. All existing tests must still pass.
- Phase 3B (Week 10-12): Wire new components. FilterToolbar, BulkActionBar, ComboboxCellEditor, ViewTabBar, SummaryStrip. Full validation.
This adds 3 weeks to the timeline but eliminates the risk of breaking TERP's most critical view.

---

### FINDING F — Simultaneous Visibility Workflows Not Analyzed
**Severity: High**

**Claim challenged:** "No functionality will be lost" and "context that was always visible requires 1-2 extra clicks"

**Evidence:** The plan acknowledges the "1-2 click" tradeoff but does NOT analyze which specific workflows break when context moves from simultaneous to serial access. The coupling audit identified several cross-panel workflows:

1. **SalesView: Customer purchase history + current order lines.** Operator needs to see what the customer bought before WHILE editing the current order. Currently: both visible simultaneously (CustomerPurchaseHistoryPanel + Draft Lines grid). After retrofit: purchase history is a slide-over tab, lines are main content. Operator must toggle between them.

2. **SalesView: Inventory Finder + Draft Lines.** Operator searches inventory WHILE seeing the current order. Currently: SalesSourcePane (left) + Draft Lines (center) visible simultaneously. After retrofit: finder is a slide-over, partially obscuring lines.

3. **PurchaseOrdersView: Vendor context + PO lines.** Operator checks vendor reliability (payment history, prior POs) WHILE building PO lines. Currently: vendor context panel + authoring grid visible simultaneously. After retrofit: vendor context is a slide-over tab.

4. **IntakeView: Batch detail + receipt preview.** Currently: master/detail expansion + ReceiptPreviewDrawer. After retrofit: both can't be visible simultaneously in the slide-over.

**Recommendation:** For each view with cross-panel workflows, either:
- (a) Keep critical context inline as collapsible sections (not slide-over tabs), OR
- (b) Allow the slide-over to "pin" crucial tabs as a side panel when the operator needs cross-reference, OR
- (c) Accept the tradeoff but document which workflows are impacted

Option (a) is safest. Recommend: CustomerPurchaseHistory, InventoryFinder, and VendorContext stay as collapsible inline sections in their respective views rather than slide-over tabs. This preserves cross-reference workflows while still collapsing ~15 other components into the slide-over.

---

### FINDING G — Total Timeline Underestimated
**Severity: High**

**Claim challenged:** "10–12 weeks total"

**Evidence:** Summing the adjusted estimates from findings above:
- Phase 0 (Foundation): 3 weeks (ComboboxCellEditor 3wk + remaining components 1wk + FilterToolbar/AdvancedFilterBuilder contract 0.5wk)
- Phase 1 (Pilot — PurchaseOrdersView): 2 weeks (unchanged)
- Phase 2 (GridJourney views): 2 weeks (unchanged)
- Phase 3A (SalesView refactoring): 3 weeks (NEW — prerequisite extraction)
- Phase 3B (SalesView migration): 3 weeks (adjusted from 2)
- Phase 3C (IntakeView + Dashboard): 2 weeks (adjusted from 1)
- Phase 3D (Remaining complex views): 3 weeks (adjusted from 2 — 9 views with unique workflows)
- Phase 4 (Polish): 2 weeks (unchanged)

**Revised total: 18–20 weeks.** This is the realistic estimate with the prerequisite refactoring and adjusted per-view timelines.

**Recommendation:** Update the plan with adjusted estimates. Be explicit that the 10-12 week number was an optimistic first pass and the engineering reality requires more time. This is not a failure of the plan — it's honest engineering estimation.

---

### FINDING H — Missing Command Path Verification
**Severity: Medium**

**Claim challenged:** "No command is lost"

**Evidence:** The mapping shows *where* each command conceptually lives in the retrofitted layout, but does not verify the *trigger path* for each command. Examples:

| Command | Current Trigger | Retrofit Location | Risk |
|---|---|---|---|
| `createCustomerSheetSnapshot` | WorkspacePanel action button | "Slide-over tab" | Action button needs a clear affordance in the slide-over header or a dedicated tab section |
| `applyClientCredit` | Sale tray (manager/owner gated) | "Context header or slide-over" | Manager/owner gating must work in both locations |
| `recordVendorPrepayment` | Expansion button + dedicated dialog | "Slide-over from action" | The dialog had its own lifecycle (amount validation); must carry over |
| `routeConnectorRequest` | StatusActionBar (requires routedTo input) | BulkActionBar | The 'routedTo' input must be available near the action button |
| `verifyAllIntake` | Master row Actions cell with confirm dialog | "Selection strip" | The confirm dialog (VerifyAllPreviewBody) must still show inline |

**Recommendation:** Before Phase 1, create a command-by-command verification matrix: command name → current trigger → retrofit trigger → gating preserved? → dependent UI preserved? This is a 1-day task that will prevent weeks of rework.

---

### FINDING I — Domain Mismatch Risk
**Severity: Medium**

**Claim challenged:** "Mercury patterns apply to TERP's domain"

**Evidence:** Mercury is banking software (accounts, transactions, cards, payments, invoicing). TERP is wholesale brokerage (inventory, purchase orders, sales orders, batch tracking, pick/pack/ship, photography, credit decisions, matchmaking, closeout).

Key domain differences:
1. **Information density:** Banking transactions are simple (date, amount, counterparty, category). Brokerage transactions have 15-20 fields per line (product, batch, qty, cost, price, markup, COGS, range, availability, status, pick status, release status, validation issues, etc.). Mercury's "clean table" works for 8 columns. TERP needs 15+ visible columns.
2. **Entity relationships:** Banking has accounts → transactions. Brokerage has: customers → orders → lines → batches → POs → vendors → payments → processors. Cross-referencing is inherent, not optional.
3. **Workflow stages:** Banking transactions are mostly final. Brokerage items move through multiple stages (draft → confirmed → posted → picked → packed → shipped → invoiced → paid). Operators need visibility into WHAT stage things are at.

**The plan partially addresses this** by keeping AG Grid (for dense data) and the command palette. But the overall philosophy of "one main surface at a time" may conflict with the brokerage operator's genuine need to see related entities simultaneously.

**Recommendation:** Add a "Domain Fit Assessment" section to the plan that explicitly acknowledges where Mercury patterns must be adapted for brokerage density. Flag the columns visible count (Mercury: 8, TERP: 15+) as a design constraint that means "Mercury-style" doesn't mean "exactly like Mercury" — it means "inspired by Mercury's patterns, adapted for brokerage density."

---

### FINDING J — ContextDrawer Width States Lost
**Severity: Low-Medium**

**Claim challenged:** "Slide-over panel (2 states: standard 420px, wide 60%)"

**Evidence:** TERP's ContextDrawer has 5 width states: closed → peek (280px) → standard (420px) → wide (60%) → focus (100%). Each has a specific use case:
- **Peek (280px):** Quick glance at entity summary without losing table context. Used for rapid scanning.
- **Standard (420px):** Normal detail view.
- **Wide (60%):** When the operator needs more space for complex data (e.g., PO with many lines).
- **Focus (100%):** Full-screen entity work, equivalent to a detail page.

The plan's 2-state slide-over (standard 420px, wide 60%) loses peek and focus. This means: no quick-scan mode (must fully open the panel to see anything), and no full-screen mode (must navigate to a separate page for deep work).

**Recommendation:** Add a "peek" state to DetailSlideover. It can be a simplified mode (just summary + key actions) triggered by hover or single-click, with a second click opening standard width. Keep "focus" as an explicit "Open in full view" action that navigates to a detail page (Mercury does this for accounts).

---

### FINDING K — Research Coverage Gaps
**Severity: Low-Medium**

**Claim challenged:** The Mercury analysis is comprehensive

**Evidence:** The Mercury reconnaissance agents hit step limits. Not studied:
- Mercury Insights page (`/insights/overview`) — likely analytics/dashboards
- Mercury Accounting page (`/accounting`) — GL reconciliation
- Mercury Tasks page (`/tasks`) — task management
- Mercury Invoicing detail (`/invoicing`) — create/send invoices
- Mercury Recipients (`/payments/recipients`) — payee management
- Mercury Bill Pay (`/bill-pay`)
- Mercury Taxes, Wire Drawdowns, ACH Authorizations
- Mobile Mercury experience
- Multi-user/admin patterns
- Notification system (partially studied)

These gaps don't invalidate the plan (the core patterns — inline editing, filter toolbar, KPI strips, slide-over, bulk actions — were well-studied), but they mean the plan may miss useful patterns from Mercury's more advanced pages.

**Recommendation:** Before Phase 3 (complex views), complete the Mercury study for Insights, Accounting, and Tasks pages. These are most likely to contain patterns relevant to Dashboard, Closeout, and Recovery views.

---

## Summary

### Top 3 Blockers

1. **FINDING E — SalesView timeline.** 2 weeks is unrealistic. SalesView requires 5-6 weeks minimum, including prerequisite refactoring. This alone adds 3-4 weeks to the timeline.

2. **FINDING F — Simultaneous visibility workflows.** The plan does not analyze which workflows break when context moves from simultaneous to serial access. Several cross-panel workflows in SalesView and PurchaseOrdersView would be disrupted.

3. **FINDING C — FilterToolbar/AdvancedFilterBuilder interaction.** The two filter systems must bridge state, and the plan doesn't specify how. Without this, the "Advanced" button creates a disconnected parallel system.

### Required Remediation (Before Execution)

1. **Adjust timeline to 18-20 weeks** with explicit buffers for prerequisite refactoring (especially SalesView).
2. **Analyze cross-reference workflows** — identify which panels MUST remain simultaneously visible and keep those as inline collapsible sections, not slide-over tabs.
3. **Define FilterToolbar/AdvancedFilterBuilder state bridge** — serialization format and two-way sync protocol.
4. **Design DetailSlideover tab registry** before Phase 1 to prevent god-component syndrome.
5. **Create command-by-command verification matrix** verifying every trigger path.
6. **Add Domain Fit Assessment** acknowledging where Mercury patterns must be adapted for brokerage density.
7. **Complete Mercury study** for Insights, Accounting, and Tasks pages.

### Verdict

**Pass with findings — DO NOT execute without remediation of Blockers 1-3.**

The plan is well-structured, thoroughly researched, and correctly identifies the right patterns to adopt. The feature mapping is comprehensive. The core architectural decisions (keep AG Grid, keep CommandPalette, keep useCommandRunner pattern) are sound.

But the effort estimates are calibrated against an idealized scenario where the codebase has cleaner seams than it actually does, and the plan doesn't fully account for the domain-specific needs of wholesale brokerage operators who genuinely need simultaneous visibility of related data. Fix those two things and this is a solid execution plan.

**Score: 72/100**

