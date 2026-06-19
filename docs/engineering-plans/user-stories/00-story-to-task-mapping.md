# User Story → Task Mapping

Every operator workflow must be preserved. Every story maps to specific tasks. No task exists without a story it serves. No story is unserved by a task.

---

## Story 1: Grid View Operator ("I can see, filter, and act on records")

**As a:** Wholesale brokerage operator
**I want to:** View records in a clean table with filtering, sorting, and bulk actions
**So that:** I can quickly find and act on the right records

**User journey:**
1. Navigate to view (e.g., Purchase Orders)
2. See KPI summary strip: total count, total value, status breakdown
3. See ViewTabBar: All | Draft (3) | Confirmed (12) | Posted (45) — click to filter
4. See main table with relevant columns. Columns sortable. Hidden columns in menu.
5. Use FilterToolbar: Date range, Keyword search, Amount filter
6. Select rows → BulkActionBar appears with contextual actions
7. Click row → DetailSlideover opens with entity detail

**Covered by tasks:**
- T-0-07 (FilterToolbar), T-0-08 (Filter bridge)
- T-0-09 (BulkActionBar), T-0-10 (ViewTabBar), T-0-11 (GridSummaryStrip)
- T-0-12 (Entity schemas), T-0-13 (Entity state machines)
- T-0-16 (View registry)
- T-1-01 through T-1-09 (PurchaseOrdersView pilot)
- T-2-04 through T-2-06 (GridJourney views rollout)

---

## Story 2: Inline Editing ("I can edit records without leaving the table")

**As a:** Wholesale brokerage operator
**I want to:** Edit status, category, and other discrete fields directly in the table
**So that:** I don't break flow by opening drawers/modals for simple edits

**User journey:**
1. Double-click a combobox cell (e.g., Status column)
2. Dropdown opens with typeahead. Type to filter.
3. Select value with keyboard (Enter) or click
4. Value saves immediately. Green flash confirms success.
5. If save fails, cell shows error. Click to retry.
6. Clear button removes value.

**Covered by tasks:**
- T-0-01 through T-0-04 (ComboboxCellEditor)
- T-1-06 (Combobox in PurchaseOrders)
- T-3B-07 (Combobox in SalesView)
- T-3C-01 (Combobox in IntakeView)

---

## Story 3: Entity Detail ("I can see everything about a record without losing context")

**As a:** Wholesale brokerage operator
**I want to:** View full entity detail (lines, linked records, history) in a side panel
**So that:** I understand the entity without navigating away from my list view

**User journey:**
1. Click a row → DetailSlideover opens in peek (280px): summary + key actions
2. Click "Open" → expands to standard (420px): tabbed detail
3. Switch tabs: Lines, Linked Records, Vendor/Customer, History
4. For complex entities: "Open in full view" → full page with same tabs
5. Close panel → back to list, at same position

**Covered by tasks:**
- T-0-05 (DetailSlideover shell), T-0-06 (Tab registry)
- T-1-05 (PO detail), T-1-08 (PO tab registration)
- T-2-07 (All entity tab registration)
- T-3B-06 (SalesView detail), T-3B-09 (Sales tab registration)

---

## Story 4: Purchase Order Workflow ("I can manage POs end-to-end")

**As a:** Purchasing operator
**I want to:** Create, edit, approve, receive, and manage purchase orders
**So that:** Inventory flows from vendors to warehouse correctly

**User journey:**
1. View POs list with summary KPI strip
2. Click "New PO" → slide-over opens with authoring form
3. Select vendor, add lines (editable grid), set terms
4. Save draft or approve & finalize
5. Select PO from list → BulkActionBar: Receive, Finalize, Cancel
6. Click PO row → slide-over: Lines tab, Linked Intake tab, Vendor tab
7. Edit line quantities in slide-over → inline save
8. "Open in full view" → full page with receipt preview

**Covered by tasks:**
- T-1-01 through T-1-09 (all PO tasks)
- T-0-09 (BulkActionBar for PO actions)

---

## Story 5: Sales Workflow ("I can manage sales orders end-to-end")

**As a:** Sales operator
**I want to:** Create, price, confirm, and manage sales orders with customer context
**So that:** Customers receive correct products at correct prices

**User journey:**
1. View sales orders list
2. Select customer → context header appears (balance, credit, pre-post checks)
3. Customer purchase history visible inline (collapsible, for cross-reference)
4. Draft lines grid shows current order
5. Inventory finder available inline (collapsible, can be pinned)
6. Add lines from finder or suggestions
7. Price and confirm order → BulkActionBar actions
8. Click order → slide-over: Lines, Pricing, Fulfillment, History tabs
9. Release lines for picking from BulkActionBar or slide-over
10. Preview sales sheet in dedicated slide-over
11. "Open in full view" → full page

**Covered by tasks:**
- T-3A-01 through T-3A-12 (SalesView refactoring)
- T-3B-01 through T-3B-10 (SalesView migration)
- T-0-03 (ComboboxCellEditor for status/pricing/tags columns)

---

## Story 6: Intake Workflow ("I can verify received inventory")

**As a:** Inventory operator
**I want to:** Verify received batches against purchase orders
**So that:** Inventory is accurately recorded in the system

**User journey:**
1. View intake queue with master/detail expansion
2. Master rows: POs grouped. Detail rows: batches within each PO.
3. Summary strip: POs pending, batch count, total value
4. Edit batch quantity directly in detail grid
5. Set discrepancy reason via combobox
6. BatchRowActions inline (verify, reject, note, set market name)
7. Bulk verify all for a PO
8. Click batch → slide-over: Movement, Sales, Photos tabs
9. Preview receipt in slide-over

**Covered by tasks:**
- T-3C-01 (IntakeView migration)
- T-0-01 (MasterDetailView template)
- T-0-03 (ComboboxCellEditor for arrivalStatus/discrepancyReason)

---

## Story 7: Dashboard ("I can see what needs attention")

**As a:** Any operator
**I want to:** See KPIs, work queues, and what needs my attention on a dashboard
**So that:** I start my day knowing what to work on

**User journey:**
1. Open dashboard
2. See KPI strip: Active orders, pending intake, total value
3. Quick action buttons: New Sale, New PO, Intake, Payment
4. Today's Focus section: items needing immediate attention
5. Work queues: counts by lane (Intake: 8 ready, Payments: 3 pending)
6. My Drafts: draft orders/POs I started
7. Recent Activity: what happened recently
8. Credit Watch (manager): at-risk customers
9. Click any item → navigates to filtered view

**Covered by tasks:**
- T-3C-02, T-3C-03 (DashboardView migration)
- T-0-10 (DashboardView template)

---

## Story 8: Recovery ("I can fix things that went wrong")

**As a:** System operator
**I want to:** See failed commands, retry them, and recover data
**So that:** Errors don't create permanent data problems

**User journey:**
1. View recovery log
2. Filter by command family (CMD-PO, CMD-SALES, etc.)
3. Search by entity ID
4. Select failed commands → BulkActionBar: Retry All
5. Click command → slide-over: command details, payload, error
6. Admin tools: backup snapshots, corrections, find & replace
7. Command reversal from slide-over

**Covered by tasks:**
- T-3D-03 (RecoveryView migration)
- T-0-09 (BulkActionBar for retry)

---

## Story 9: Closeout ("I can close accounting periods")

**As a:** Accounting operator
**I want to:** Lock and archive accounting periods with confidence
**So that:** Financial reports are accurate and periods are immutable

**User journey:**
1. Enter period to close
2. See control totals: batches, sales orders, POs, commands
3. See blocker drilldown: what's preventing closeout
4. Click blocker → navigate to source view with filter
5. After blockers resolved: Lock period
6. After locked: Run archive
7. View artifacts (CSV, JSONL, PDF)
8. Adjustments available as needed

**Covered by tasks:**
- T-3D-04 (CloseoutView migration)

---

## Story 10: Cross-Reference Workflows ("I can see related data simultaneously")

**As a:** Experienced operator
**I want to:** See purchase history while editing orders, inventory while building POs
**So that:** I make informed decisions without constantly switching views

**User journey:**
1. **Sales + Purchase History:** While editing customer order lines, see what customer bought before (inline collapsible section)
2. **Sales + Inventory Finder:** While building order, search inventory for matching products (inline section, can be pinned)
3. **PO + Vendor Context:** While building PO, see vendor payment history and prior POs (inline section)

**Covered by tasks:**
- T-3B-08 (Customer workspace context header — keeps history + finder inline)
- T-1-07 (VendorQuickAdd stays inline in PO authoring)

**Design decision:** These panels stay INLINE (collapsible sections), NOT slide-over tabs. Cross-reference workflows require simultaneous visibility. This was validated in AQA Finding F.

---

## Story Coverage Matrix

| Story | Tasks Covered | Views Affected |
|-------|--------------|----------------|
| 1 — Grid View Operator | 14 | All 27 |
| 2 — Inline Editing | 7 | PurchaseOrders, SalesView, IntakeView, + all with discrete fields |
| 3 — Entity Detail | 8 | All 27 |
| 4 — PO Workflow | 9 | PurchaseOrdersView |
| 5 — Sales Workflow | 22 | SalesView |
| 6 — Intake Workflow | 5 | IntakeView |
| 7 — Dashboard | 3 | DashboardView |
| 8 — Recovery | 2 | RecoveryView |
| 9 — Closeout | 1 | CloseoutView |
| 10 — Cross-Reference | 2 | SalesView, PurchaseOrdersView |

**Total unique tasks:** 77 tasks serving 10 user stories. Every task serves at least one story. Every story is served by at least one task.

