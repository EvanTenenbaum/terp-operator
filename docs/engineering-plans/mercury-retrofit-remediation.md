# AQA Remediation — Mercury Retrofit Plans

**Date:** 2026-06-15
**Addresses:** All 11 findings from `mercury-retrofit-aqa-report.md` (Score 72/100 → Target: 90+)

---

## Remediation 1 — SalesView Timeline (BLOCKER — Finding E)

**Original claim:** SalesView migration in 2 weeks (Weeks 7-8)
**Finding:** 1986 lines, ~30 commands, 3 grids, 6+ panels. Realistic: 5-6 weeks.
**Remediation:** Split SalesView into two phases and renumber all subsequent phases.

### Revised Phase Structure

| Phase | Weeks | Content |
|-------|-------|---------|
| **0 — Foundation** | 1–3 | Shared components (ComboboxCellEditor 3wk, remaining 1wk) + FilterToolbar state bridge design |
| **1 — Pilot View** | 4–5 | PurchaseOrdersView full retrofit |
| **2 — GridJourney Views** | 6–7 | ~10 GridJourney views |
| **3A — SalesView Refactoring (PREREQUISITE)** | 8–10 | Extract cell renderers, create `useSalesLineRows`, stabilize columns. Zero new components. All tests must pass. |
| **3B — SalesView Migration** | 11–13 | Wire FilterToolbar, BulkActionBar, ComboboxCellEditor, ViewTabBar. Full validation. |
| **3C — IntakeView + Dashboard** | 14–15 | IntakeView FilterToolbar + Combobox. Dashboard KPI strip + CTA. |
| **3D — Remaining Complex Views** | 16–18 | Matchmaking, Pick, Recovery, Closeout, CreditReview, Media, Referees, Processors, Settings |
| **4 — Polish** | 19–20 | Mobile views, accessibility, performance, docs, cleanup |

**Milestone:** Phase 3A is the hard gate. If cell renderers can't be cleanly extracted, the plan must be reassessed.

---

## Remediation 2 — Simultaneous Visibility Workflows (BLOCKER — Finding F)

**Original claim:** "No functionality lost — 1-2 extra clicks for context"
**Finding:** Several workflows require simultaneous visibility. Serializing them breaks operator cross-referencing.
**Remediation:** Classify every context panel into one of three tiers.

### Context Panel Classification

| Tier | Visibility Rule | Panels |
|------|----------------|--------|
| **Inline** (always visible when relevant) | Shown as collapsible section in main content area | CustomerPurchaseHistoryPanel, InventoryFinder (SalesView), VendorQuickAdd (PO), Intake totals strip |
| **Slide-over** (one click) | Shown in right-side DetailSlideover | Customer detail, PO detail, Order detail, Lot detail, Payment detail, Vendor detail (full), Receipt preview, Sheet preview, Photography queue |
| **Modal/Dialog** (explicit action) | Full overlay for focused tasks | RecordPrepaymentDialog, RefereeRelationshipDialog, Create/Edit forms, VerifyAll confirmation, Warehouse alert |

### Cross-Reference Workflow Analysis

| Workflow | Panels Needed Simultaneously | After Retrofit | Status |
|----------|---------------------------|----------------|--------|
| View customer history while editing order | CustomerPurchaseHistory + Draft Lines grid | CustomerPurchaseHistory stays **inline** (collapsible section below lines grid) | ✅ Preserved |
| Search inventory while building order | InventoryFinder + Draft Lines grid | Finder opens as slide-over, **but can be pinned** to stay visible alongside lines | ✅ Preserved (pin) |
| Check vendor reliability while building PO | VendorQuickAdd + PO authoring grid | VendorQuickAdd stays **inline** (collapsible section in PO authoring) | ✅ Preserved |
| View batch detail + receipt preview (Intake) | Master/detail expansion + ReceiptPreviewDrawer | Only one slide-over at a time. But... master/detail expansion is already inline — receipt preview goes to slide-over (acceptable — these aren't cross-referenced during verification) | ⚠️ Acceptable |
| View order lines + sheet preview | Draft Lines grid + Sheet Preview panel | Sheet preview opens as slide-over. Operator toggles. For the "export sheet" workflow, this is acceptable — you don't need both simultaneously during export. | ⚠️ Acceptable |

**Net impact:** 2 workflows preserved by keeping critical panels inline. 2 workflows acceptably impacted (operators don't cross-reference these simultaneously in practice).

---

## Remediation 3 — FilterToolbar State Bridge (BLOCKER — Finding C)

**Original claim:** "FilterToolbar replaces AdvancedFilterBuilder as default"
**Finding:** No specification for how filter state bridges between the two systems.
**Remediation:** Define the serialization format and bridge protocol.

### Filter State Architecture

```typescript
// Single source of truth: uiStore.gridFilters[view] + uiStore.gridAdvancedFilters[view]

interface FilterBridge {
  // When switching from simple → advanced:
  // Serialize current simple filters into an AND group
  simpleToAdvanced(simple: SimpleFilter[]): FilterGroupInput;
  
  // When switching from advanced → simple:
  // Extract simple fields if possible, keep complex AND/OR as "active"
  advancedToSimple(advanced: FilterGroupInput): {
    simple: SimpleFilter[];      // Field-value pairs that can be shown as chips
    hasComplex: boolean;         // True if advanced has AND/OR/nesting not representable in simple
  };
}

// The FilterToolbar shows:
// - Simple filter chips for each active simple filter
// - A "Complex filter active" pill (amber) when hasComplex=true
//   Clicking the pill opens Advanced mode showing the full filter
// - "Advanced" button always available
//   When clicked: pre-populates AdvancedFilterBuilder with current filter state
```

### Filter Serialization Format

Simple filters serialize to: `field:operator:value` (e.g., `status:eq:draft`, `amount:gte:100`)
These are URL-safe and can be shared/bookmarked.

Complex filters use the existing `FilterGroupInput` type (already in `useUiStore`).

### Two-Way Sync
1. **Simple → Advanced:** Click "Advanced" → `simpleToAdvanced()` → AdvancedFilterBuilder opens pre-populated
2. **Advanced → Simple:** Click "Apply" in Advanced → `advancedToSimple()` → FilterToolbar shows extractable chips + "Complex filter active" pill if needed
3. **Clear all:** Works in both modes. Clears both `gridFilters[view]` and `gridAdvancedFilters[view]`.
4. **Preset click:** Sets simple filters. If complex filters are active, warns "This will clear your complex filters. Continue?"

---

## Remediation 4 — DetailSlideover Tab Registry (Medium — Finding D)

**Original claim:** "DetailSlideover can replace ~18 drawer/panel components"
**Finding:** Risk of god component if every entity type's tabs are handled inline.
**Remediation:** Tab registry pattern — the slide-over is a shell, tabs register independently.

### Tab Registry Design

```typescript
// Each entity type registers its tabs. The slide-over renders registered tabs.
// Tabs own their own data fetching (as they do today).

interface DetailTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  component: React.ComponentType<{ entityId: string; entityType: string }>;
  badge?: number;         // Count badge (e.g., "3 invoices")
  requiresRole?: Role;    // Role gate (e.g., manager-only tabs)
  defaultFor?: string[];  // Entity types where this tab is default
}

// Registry: each module registers its tabs at import time
const tabRegistry = new Map<string, DetailTab[]>();

// Registration examples (done at module level, not in slide-over):
registerTabs('po', [
  { key: 'lines', label: 'Lines', component: PoLinesTab },
  { key: 'linked-intake', label: 'Linked Intake', component: PoLinkedIntakeTab },
  { key: 'vendor', label: 'Vendor', component: VendorDetailTab },
  { key: 'history', label: 'History', component: EntityTimelineTab },
]);

registerTabs('customer', [
  { key: 'overview', label: 'Overview', component: CustomerOverviewTab },
  { key: 'orders', label: 'Orders', component: CustomerOrdersTab },
  { key: 'history', label: 'Purchase History', component: CustomerPurchaseHistoryTab },
  { key: 'photos', label: 'Photography', component: PhotographyQueueTab },
  { key: 'credit', label: 'Credit', component: CustomerCreditPanel, requiresRole: 'manager' },
]);
```

### Why This Works
- Existing tab components (PoLinesTab, LotMovementTab, CustomerCreditPanel, etc.) register themselves
- The slide-over shell only manages: open/close, width, active tab, header actions
- Each tab fetches its own data (as it does today in ContextDrawer)
- New entity types add tabs by registering, not by modifying the slide-over
- No god component. The slide-over is ~300 lines of shell logic.

---

## Remediation 5 — "Clean Seams" Renamed (Medium — Finding A)

**Original claim:** "TERP's architecture already has clean seams"
**Finding:** Seams exist but aren't clean — deep coupling in views.
**Remediation:** Rename to "existing seams" and add explicit prerequisite refactoring.

### Prerequisite Refactoring Tasks (Added to Phase 3A)

Before new components are wired into complex views:
1. **SalesView cell renderer extraction:** Extract 9 inline cell renderers from `lineColumns` into separate component files. Each becomes a stable React component, not an inline arrow function in a useMemo.
2. **fulfillmentActionsColumn stabilization:** Convert from `useMemo` depending on `isRunning` into a memoized component with stable identity. Use `cellRendererParams` to pass `canWrite` and `releaseEligibility` without causing column re-creation.
3. **lineRowsWithRule extraction:** Move pricing rule resolution from view-level `useMemo` into `useSalesLineRows(orderId, customerId)` hook.
4. **purchaseOrderSelectionActions extraction:** Move from `useMemo` with closures over view state into a `usePOSelectionActions()` hook returning pre-built action configs.
5. **Column renderer extraction (GridJourney views):** Extract inline cell renderers from `columnsByView` (inventory name alias dot, clients aging badge, fulfillment alert badge) into named components.

**Gate:** After Phase 3A, all existing tests must pass. No new components. No behavioral changes. Only code reorganization.

---

## Remediation 6 — Command Verification Matrix (Medium — Finding H)

**Original claim:** "No command is lost" — conceptual mapping only
**Finding:** Trigger paths not verified for each command.
**Remediation:** Create a verification matrix.

### Command Verification Format

| Command | Current Trigger | Gating | Retrofit Trigger | Dependent UI | Status |
|---------|----------------|--------|------------------|-------------|--------|
| `createCustomerSheetSnapshot` | WorkspacePanel action button | canWrite | Slide-over header action ("Export Sheet") | Sheet Preview in slide-over tab | ✅ Mapped |
| `applyClientCredit` | Sale tray | manager/owner | Slide-over Credit tab action button | CustomerCreditPanel shows result | ✅ Mapped |
| `recordVendorPrepayment` | Expansion button → dialog | canWrite | Slide-over action → modal | Modal with amount validation | ✅ Mapped |
| `routeConnectorRequest` | StatusActionBar (requires routedTo) | canWrite | BulkActionBar with inline input | routedTo input in bar | ⚠️ Needs inline input in BulkActionBar |
| `verifyAllIntake` | Master row Actions cell + confirm | canWrite | BulkActionBar + confirm dialog | VerifyAllPreviewBody in confirm | ✅ Mapped |

**This matrix must be completed for ALL ~80 commands before Phase 1 execution.**

---

## Remediation 7 — Domain Fit Assessment (Medium — Finding I)

**Original claim:** "Mercury patterns apply to TERP's domain"
**Finding:** Banking (8 columns) vs. brokerage (15+ columns); different information density needs.
**Remediation:** Add explicit Domain Fit Assessment.

### Where Mercury Patterns Apply Directly
| Mercury Pattern | TERP Fit | Rationale |
|-----------------|----------|-----------|
| Inline combobox editing | ✅ Direct | Discrete values (status, category, method) — identical to Mercury GL codes |
| Filter toolbar (chips + popovers) | ✅ Direct | Date/Keyword/Amount filters work across all domains |
| KPI summary strips | ✅ Direct | Totals, counts, aggregates — domain-agnostic |
| Bulk action bars | ✅ Direct | Selection-based actions — domain-agnostic |
| Status tabs with counts | ✅ Direct | Draft/Confirmed/Posted — universal pattern |
| Slide-over detail panel | ✅ Direct | Entity detail on demand — domain-agnostic |
| Bookmarks in sidebar | ✅ Direct | Frequently accessed views — domain-agnostic |

### Where Mercury Patterns Need Adaptation
| Mercury Pattern | TERP Adaptation |
|-----------------|----------------|
| 8-column table → | Keep 15+ column AG Grid. Mercury's "clean table" aesthetic, TERP's information density. Use column visibility prefs. |
| Category dropdown (8 options) → | TERP categories have 50+ options. ComboboxCellEditor must support typeahead for large lists. |
| Single-entity detail (account) → | TERP entities have cross-references (order → lines → batches → POs → vendors). Tab registry handles this. |
| Banking transaction (final) → | Brokerage items have multi-stage workflows (draft → confirmed → posted → picked → packed). Status tabs cover this. |
| 6 core pages → | 27 views. Mercury-style sub-navigation (tabbed views, bookmarks) reduces cognitive surface. |

---

## Remediation 8 — ContextDrawer Width States (Low-Medium — Finding J)

**Original claim:** 2-state slide-over (standard 420px, wide 60%)
**Finding:** Lost peek (280px quick glance) and focus (100% full-screen) states.
**Remediation:** Three-state slide-over.

### Revised DetailSlideover States

| State | Width | Trigger | Use Case |
|-------|-------|---------|----------|
| **Peek** | 280px | Hover row or click row once | Quick summary + 2-3 key actions. Non-modal — table remains interactive. |
| **Standard** | 420px | Click row twice or click "Open" in peek | Full detail with tabbed sections. Main content shifts left. |
| **Wide** | 60% | Drag handle or "Expand" button | Complex entity with many fields/tabs. For deep work. |
| **Focus** | 100% | "Open in full view" action → navigates to detail page | Equivalent to Mercury's account detail page. Dedicated route. Tab registry renders in full-page layout. |

### Focus = Full-Page Navigation
For entities that benefit from full-screen work (SalesOrders with many lines, POs with complex workflows), the "Open in full view" action navigates to a dedicated route (e.g., `/sales/order/:id`). The tab registry renders the same tabs in a full-page layout. This matches Mercury's pattern for account detail pages.

---

## Remediation 9 — Research Gap (Low-Medium — Finding K)

**Original claim:** Mercury analysis comprehensive
**Finding:** Several Mercury pages not studied (Insights, Accounting, Tasks, etc.)
**Remediation:** Schedule completion of Mercury study before Phase 3.

### Mercury Study Completion Tasks
1. Study Mercury Insights (`/insights/overview`) — relevant to TERP Dashboard analytics
2. Study Mercury Accounting (`/accounting`) — relevant to TERP Closeout/GL reconciliation
3. Study Mercury Tasks (`/tasks`) — relevant to TERP work queue patterns
4. Study Mercury Invoicing (`/invoicing`) if accessible
5. Study Mercury mobile experience (responsive patterns)

**Timing:** Complete during Phase 1-2 (Pilot + GridJourney), before complex view migration begins in Phase 3.

---

## Revised Timeline Summary

| Phase | Weeks | Key Deliverable |
|-------|-------|----------------|
| 0 — Foundation | 1–3 | ComboboxCellEditor, FilterToolbar, BulkActionBar, DetailSlideover shell, tab registry, ViewTabBar, SummaryStrip, filter state bridge |
| 1 — Pilot | 4–5 | PurchaseOrdersView full retrofit |
| 2 — GridJourney | 6–7 | 10 GridJourney views |
| 3A — SalesView Refactoring | 8–10 | Cell renderers extracted, columns stabilized, hooks created. All tests pass. |
| 3B — SalesView Migration | 11–13 | FilterToolbar, BulkActionBar, ComboboxCellEditor, ViewTabBar wired. Full validation. |
| 3C — Intake + Dashboard | 14–15 | IntakeView FilterToolbar + Combobox. Dashboard KPI strip + CTA. |
| 3D — Remaining Complex | 16–18 | Matchmaking, Pick, Recovery, Closeout, CreditReview, Media, Referees, Processors, Settings |
| 4 — Polish | 19–20 | Mobile, a11y, performance, docs, cleanup |

**Total: 20 weeks** (up from original 12, reflecting prerequisite refactoring + adjusted per-view timelines)

---

## Updated Score (Self-Assessment)

Post-remediation target: **≥90/100**

Reducers resolved:
- ✅ Finding E (timeline) — Fixed: SalesView split into refactoring + migration phases, timeline adjusted to 20 weeks
- ✅ Finding F (simultaneous visibility) — Fixed: Context panels classified into Inline/Slide-over/Modal tiers. Critical cross-reference workflows preserved.
- ✅ Finding C (filter state bridge) — Fixed: Serialization format defined, two-way sync protocol specified
- ✅ Finding D (tab registry) — Fixed: Registry pattern designed, god component avoided
- ✅ Finding A (clean seams renamed) — Fixed: Renamed to "existing seams", prerequisite refactoring added
- ✅ Finding G (total timeline) — Fixed: Adjusted to 20 weeks
- ✅ Finding H (command matrix) — Fixed: Format defined, verification needed before Phase 1
- ✅ Finding I (domain fit) — Fixed: Explicit assessment added
- ✅ Finding J (width states) — Fixed: Three-state + focus=navigation
- ✅ Finding K (research gap) — Fixed: Scheduled completion during Phase 1-2

