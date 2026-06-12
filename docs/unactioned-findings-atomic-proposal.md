# TERP Agro Unactioned Findings Atomic Proposal

Date: 2026-05-11
Status: master synthesis of unactioned findings — see audit-status table below for items closed by template waves

---

## Audit Status: UF Items Closed by Template Waves (UX-T04, 2026-06-12)

Items below are **closed** (shipped in the template-wave PRs, workflow-gap pass, or Wave 1 of the UX audit). Future agents should not re-report them as open gaps. Open UF items remain tracked in `docs/ux-audit-2026-06-12.md`.

| ID | Closed by | Date | Evidence |
| --- | --- | --- | --- |
| UF-001 | Workflow gap pass + template waves | 2026-05-xx | `draft`/`needs_resolution`/`ready` row states exist; `validationIssues` projection in sale lines; command failures annotate rows as `needs_fix`. |
| UF-002 | Workflow gap pass (MR-002) | 2026-05-xx | `legacy_marker` preserved; raw marker cells visible in intake and inventory grids. |
| UF-003 | Workflow gap pass (MR-003) | 2026-05-xx | `ownership_status`, `arrival_status`, `legacy_marker` modeled separately; `due_reason` column on payables. |
| UF-004 | Template waves A1–A8 (SalesView customer workspace) | 2026-06-12 | Customer workspace with customer header, editable draft order grid, finder, balance, and recent purchases. CAP-001 fulfilled. |
| UF-005 | Finder redesign (2026-05-27) + template waves | 2026-05-27 | Full-text search across source code, intake date, vendor, item, category, notes, marker, alias; saved filter slices (CAP-031). |
| UF-006 | Template waves A8 + UX-G01 ALREADY_FIXED | 2026-06-12 | Three independent closeout columns (`packed`, `inventoryPosted`, `paymentFollowup`) in OrdersView. |
| UF-007 | Workflow gap pass + template waves | 2026-05-xx | Receipt preview from selected rows (ReceiptPreviewDrawer); `postPurchaseReceipt` with selection totals. |
| UF-008 | Template waves A1–A8 (QuickLedgerGrid) | 2026-06-12 | QuickLedgerGrid ships as default money-entry surface on Payments. |
| UF-009 | Template waves (RowInspector) | 2026-06-xx | RowInspector with History/Relationship/Issue tabs on all OperatorGrid views. |
| UF-016 | Template waves (Fulfillment StatusActionBar) + workflow gap pass | 2026-06-xx | Fulfillment line grid with pack controls; StatusActionBar on FulfillmentView; pick queue and `createPickList`/`recordWeighAndPack`/`markOrderFulfilled`. |
| UF-017 | Photography wave (CAP-023) | 2026-05-xx | Photography route, MediaView, batch media tabs, `mediaStatus` column in inventory. |
| UF-019 | Template waves (CloseoutView StatusActionBar) | 2026-06-11 | CloseoutView uses StatusActionBar engine; blocker drilldown ships (CAP-025, ALREADY_FIXED per triage UX-M03). |

**Note:** UF items not in this table remain open. They are tracked under `UX-§§` IDs in `docs/ux-audit-2026-06-12.md` (e.g., UF-006 partial → UX-F02, UF-010 → UX-B03, UF-011 → UX-B01, UF-012 → UX-E05/K02, UF-013 → UX-H02/H03, UF-014 → UX-N01/U01, UF-015 → UX-A12, UF-018 → UX-Q07, UF-020 → UX-C04).

---

## What This Document Is

This is the consolidated implementation proposal for the work discovered but not yet actioned during the recent TERP Agro audit run.

It is intentionally not another generic roadmap. It is a de-duplicated, atomic, implementation-grade proposal that answers:

- What did the audits repeatedly find?
- What is already built and should be preserved?
- What remains unactioned?
- What is the smallest coherent way to address each gap?
- Which files and surfaces are likely touched?
- What proof closes each item?

The central product rule is: preserve the comfort mechanics of the operators' current spreadsheet-native workflow while using TERP Agro's command bus, audit log, database, RBAC, and reversal architecture to make the workflow safer.

## Source Inputs Synthesized

Recent TERP Agro audit artifacts:

- `docs/workflow-gap-audit.md`
- `docs/frontend-interaction-surface-audit.md`
- `docs/recording-paradigm-codex-audit.md`
- `docs/opus-recording-paradigm-ui-ux-review.md`
- `docs/recording-paradigm-master-ui-ux-recommendations.md`
- `docs/persona-journey-frontend-fit-audit.md`

External source-of-truth artifacts used by those audits:

- `../terp-numbers-command-system/docs/control/OPERATOR_JOURNEYS.md`
- `../terp-numbers-command-system/docs/control/AI_PERSONA_TEST_PLAN.md`
- `../terp-numbers-command-system-roadmap/docs/control/UI_UX_CONTROL_SURFACE_ARC_REPORT.md`
- `../terp-numbers-command-system-roadmap/docs/control/FEATURE_SCOPE_LEDGER.md`
- `../../TERP/TERP/docs/design/BROKERAGE_OPERATOR_CONTEXT.md`
- `../../TERP/TERP/docs/protocols/BROKERAGE_FIT_REVIEW_FRAMEWORK.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/`
- `../../TERP/TERP/docs/reference/USER_FLOW_MATRIX.csv`
- Prior recording-analysis artifacts under `../artifacts/video-feedback/` and `../terp-numbers-command-system/artifacts/video-feedback/`

Current implementation surfaces reviewed:

- `src/client/components/Shell.tsx`
- `src/client/components/QuickStartBar.tsx`
- `src/client/components/WorkspacePanel.tsx`
- `src/client/components/OperatorGrid.tsx`
- `src/client/components/CommandPalette.tsx`
- `src/client/components/Hotkeys.tsx`
- `src/client/views/DashboardView.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/SalesView.tsx`
- `src/client/components/InventoryFinderPanel.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/shared/commandCatalog.ts`
- `src/server/schema.ts`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

## What Is Already Actioned

These are not open recommendations unless a later section explicitly calls for refinement:

| Area | Current actioned state |
| --- | --- |
| Core app architecture | React/Vite frontend, Express/tRPC backend, Drizzle/Postgres schema, command bus, session auth, RBAC, audit journal, JSONL journaling, seed data. |
| Workflow surface coverage | Dashboard, Intake, Sales, Orders, Payments, Inventory, Client Ledger, Vendor Payables, Fulfillment, Connectors, Recovery, Closeout. |
| Command catalog | All required command names exist and role minimums are mapped. |
| Global starts | Quick Start currently supports New Sale, New PO / Intake, Receive Money, and Pay Vendor. |
| Product finder baseline | Sales view has `InventoryFinderPanel` with free search, category, vendor, tag, location, ownership, min qty, max price, aging, quantity input, add action, and active chips. |
| Grid foundation | `OperatorGrid` supports sorting, filtering, grouping, range selection, undo/redo editing, CSV export, inline editable columns, and AG Grid sidebar panels. |
| Panel space control | `WorkspacePanel` supports collapse and focused panel mode; side nav and Quick Start can collapse. |
| Recovery baseline | Recovery view has command search, retry failed command, reversal preview, reverse command, support packet, correction entry, snapshot diff, and restore preview. |
| Closeout baseline | Closeout view has period review, unsafe row count, control totals, adjustments, lock, archive, and archive grid. |
| Connector safety baseline | Connector requests are reviewed, approved/rejected/routed, and do not directly mutate ledgers. |
| Fulfillment baseline | Fulfillment queue, fulfillment lines, pack controls, label print, tracking, fulfill action, and manifest path exist. |

## Master Finding

TERP Agro has broad feature coverage and a good safety architecture. The remaining issue is product shape at the operator moment.

The current UI still asks the operator to think in pages, command buttons, and records. The current human workflow thinks in rows, visible scratch space, selected-row artifacts, customer workspaces, search fragments, and status cells.

The next implementation should not add more modules. It should make the existing surfaces row-native, start-work-first, and less button-heavy.

## Non-Negotiable Product Principles

1. Rows are working memory before they become posted records.
2. New sale starts from customer/request context, not from an abstract order record.
3. New receiving starts from vendor/drop/rows, not from formal purchase-order ceremony.
4. Money entry behaves like a ledger grid, not a one-command-at-a-time form.
5. Finder search must handle whatever operators remember: source codes, notes, markers, aliases, vendor names, price hints, shorthand.
6. Raw markers are operator vocabulary and must be preserved even when normalized fields exist.
7. Posted consequences must be inspectable from the row that caused them.
8. Buttons should shrink as context increases. The selected row should reveal the next likely action.
9. Customer-facing output must never leak cost, margin, internal floors, or approval notes.
10. Connector requests are inbox items. They route to core workflows; they do not mutate ledgers.

## Canonical Unactioned Finding Clusters

### UF-001: Typed Commands Still Need Provisional Row Tolerance

Priority: P0
Gap type: structural gap, workflow gap, trust-control gap

Finding:

The command bus is correctly typed, audited, and idempotent, but the operator paradigm tolerates uncertain rows. The app needs a durable place for incomplete or unresolved work before posting. Without this, command safety can feel brittle compared with the spreadsheet.

Current state:

- Rows have statuses such as `draft`, `ready`, `posted`, `needs_fix`, `reversed`, `confirmed`, `fulfilled`, and others.
- Several command paths still validate at command time rather than letting uncertain row states remain visible with exact errors.
- Recovery exists, but "this row is not ready because..." is not consistently part of the row itself.

Proposal:

Formalize provisional row states across intake, sales order lines, payment drafts, and adjustment drafts:

- `draft`: saved visible row, not ready for posting.
- `needs_resolution`: saved visible row with exact blocking issues.
- `ready`: row has enough data to post.
- `posted`: consequences written.
- `reversed`: consequence reversed by command.

Atomic implementation:

1. Add shared row readiness helpers in `src/shared` for intake, sale line, payment draft, and adjustment draft validation.
2. Add row-level `validationIssues` or equivalent projection fields to the relevant query outputs.
3. Render validation chips in `OperatorGrid` or per-view column definitions.
4. Ensure command failures that are row-specific annotate the row as `needs_resolution` where the row remains editable.
5. Make "Ready" transitions explicit and reversible for drafts.
6. Add tests proving incomplete rows can be saved but cannot be posted.

Likely files:

- `src/shared/types.ts`
- `src/shared/schemas.ts`
- `src/server/schema.ts`
- new migration under `src/server/migrations`
- `src/server/services/commandBus.ts`
- `src/server/routers/queries.ts`
- `src/client/components/OperatorGrid.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/SalesView.tsx`
- `src/client/views/OperationsViews.tsx`

Proof:

- E2E: create incomplete intake row, save it, see `needs_resolution`, fix it, mark ready, post.
- Unit/contract: posting unresolved sale line refuses with exact issue.
- UI: no command payload JSON required for normal recovery.

### UF-002: Raw Legacy Markers Are Over-Normalized

Priority: P0
Gap type: structural gap, visibility gap, trust-control gap

Finding:

Audits agree that markers such as `C`, `ofc`, `OFC`, `CV`, `T`, `P`, `Iv`, `M`, blanks, and unknown values are operator vocabulary, not clean enums yet. Current UI and schema expose normalized ownership as `C | OFC | UNKNOWN`, but this loses the raw vocabulary that operators trust.

Current state:

- `ownershipStatus` exists as `C`, `OFC`, `UNKNOWN`.
- Intake and inventory show ownership status.
- Sale/order closeout raw marker columns do not exist in the current UI.

Proposal:

Preserve raw marker text separately from normalized interpretation.

Atomic implementation:

1. Add `legacy_marker` to batches/inventory rows.
2. Add `legacy_status_markers` or separate raw marker fields to sales order/order line projections for closeout markers.
3. Preserve raw marker values during CSV import and manual entry.
4. Show raw marker as a narrow pinned or near-pinned column in Intake, Inventory, Sales/Orders.
5. Show normalized fields adjacent but visually distinct: ownership, arrival, due reason, packed, inventory posted, payment follow-up.
6. Add a tooltip/legend that says whether the meaning is confirmed, inferred, or unknown.
7. Add a marker review queue later, but do not block the raw preservation on the review UI.

Likely files:

- `src/server/schema.ts`
- migration
- `src/server/services/commandBus.ts`
- `src/server/services/csv.ts`
- `src/server/routers/queries.ts`
- `src/client/views/IntakeView.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/client/views/SalesView.tsx`
- new `src/client/components/MarkerLegend.tsx`

Proof:

- Seed/import rows with `C`, `ofc`, `OFC`, `CV`, `T`, blank, `P`, `Iv`, `M`, and unknown text.
- Verify raw values display unchanged and can be edited.
- Verify normalized ownership does not silently overwrite raw marker history.

### UF-003: Ownership, Arrival, And Payable-Due Logic Are Entangled

Priority: P0
Gap type: structural gap, trust-control gap

Finding:

Ownership, arrival confirmation, and payable due status are separate facts. Treating them as one marker makes intake and vendor payouts less trustworthy.

Current state:

- `ownershipStatus` and `arrivalConfirmed` exist in Intake.
- Consignment depletion can trigger vendor bill due status.
- Vendor payable rows show status and scheduled date, but not enough "why due" logic in the row.

Proposal:

Separate display and persistence for:

- Raw marker.
- Ownership status.
- Arrival status.
- Payable due reason.
- Scheduled payment event.

Atomic implementation:

1. Replace boolean arrival display with `arrivalStatus`: `pending`, `arrived`, `cancelled`.
2. Keep ownership as normalized field but default ambiguous values to `unknown`.
3. Add or project `dueReason` on vendor bills: consigned depleted, net terms reached, manual approval, down payment remaining, scheduled event.
4. Show `dueReason` and `scheduledEvent` in Vendor Payables grid.
5. Add pre-post intake preview that states payable/consignment consequences.

Likely files:

- `src/server/schema.ts`
- migration
- `src/server/services/commandBus.ts`
- `src/server/routers/queries.ts`
- `src/client/views/IntakeView.tsx`
- `src/client/views/OperationsViews.tsx`

Proof:

- Row can be `arrived + unknown ownership`.
- Vendor payable says "due because consigned lot depleted" without relying only on raw `C`.
- Scheduled payable shows a real event date/time, not only a status label.

### UF-004: New Sale Starts As A Record, Not A Customer Workspace

Priority: P0
Gap type: workflow gap, structural gap

Finding:

The biggest repeated sales finding is that `New Sale` must land in a customer-centered working surface. Operators do not want to create an order and then hunt for the right context; they want to open the customer's working sheet and start typing lines.

Current state:

- `QuickStartBar.startSale` runs `createSalesOrder`, selects the created row, and opens `sales`.
- `SalesView` has customer select, order grid, finder, suggestions, and sheet preview.
- There is no customer workspace that combines header, draft lines, finder, credit, notes, recent history, and safe customer output.

Proposal:

Build a focused Sales Workspace mode around the customer.

Atomic implementation:

1. Add UI state for active customer workspace.
2. Modify Quick Start `Sale` to open/resume customer workspace instead of simply routing to global Sales.
3. Add customer header: balance, credit limit, tags, notes, recent purchases, open invoices.
4. Add visible draft order lines grid with first empty line focused.
5. Put Inventory Finder beside or below draft lines, scoped to customer history/tags.
6. Show selected order/cart lines beside finder so the operator does not bounce between separate grids.
7. Add internal/customer output toggle at workspace level.
8. Add "Copy customer offer" and "Export customer catalog" from selected result/order lines.
9. Keep cost/margin only in internal mode.
10. Route posting through existing commands.

Likely files:

- `src/client/views/SalesView.tsx`
- new `src/client/components/SalesWorkspace.tsx`
- `src/client/components/QuickStartBar.tsx`
- `src/client/components/InventoryFinderPanel.tsx`
- `src/client/store/uiStore.ts`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- From any view, start sale for a customer and focus lands in the first editable line.
- Search inventory, add three lines, preview customer-safe output, confirm/post without a modal wizard.
- Customer credit/balance remains visible while building order.

### UF-005: Finder Is Faceted, But It Is Not Yet A Full Resolver

Priority: P0
Gap type: workflow gap, trust-control gap, visibility gap

Finding:

The finder has the right first version, but operators need a resolver: type whatever string they remember, see source identity, detect ambiguity, avoid duplicate source rows, and produce an order/catalog from the result set.

Current state:

- Search includes batch code, name, category, vendor, location, lot code, price range, tags.
- Facets include category, vendor, tag, location, ownership, min qty, max price, aging.
- Finder rows can add a quantity to selected order.
- It does not show enough composite source identity or ambiguity state.

Proposal:

Upgrade `InventoryFinderPanel` into `InventoryResolverPanel`.

Atomic implementation:

1. Expand search haystack to source code, intake date/code, notes, shorthand, raw marker, aliases, unit cost/ticket, price range, customer history signals.
2. Add tokenized search so multi-token queries such as `25 flex` work across fields.
3. Show composite identity: source code/date, vendor/source, product, available/intake, ticket/cost, price/range, raw marker.
4. Show `Already in order` badges for rows already used by selected order.
5. Add match reason per result: exact code, note match, tag match, customer history, aging, ownership, margin band.
6. Add selected-result actions: add to order, reserve, compare, export catalog, copy offer.
7. Add "no results" suggestions that remove filters one at a time.
8. Add keyboard behavior: Enter from qty adds row and moves to next row.
9. Add saved slices: aging premium, consignment due risk, value buyers, low stock/reorder, office-owned.

Likely files:

- `src/client/components/InventoryFinderPanel.tsx`
- `src/client/views/SalesView.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/metrics.ts`
- seed data for aliases/raw markers

Proof:

- Searches for `m15`, `rich`, `25 flex`, `ofc`, and vendor fragments return relevant rows when data exists.
- Duplicate rows are blocked or require explicit split.
- Ambiguous matches prevent posting and name candidate source rows.

### UF-006: Sales Closeout Needs Independent Visible Checks

Priority: P0
Gap type: visibility gap, workflow gap

Finding:

Lifecycle status is useful for the system, but operators track closeout as independent work cells: packed, inventory posted, and payment/follow-up. Those must be visible and independently actionable.

Current state:

- Orders have status, postedAt, fulfilledAt, invoice status, delivery window, notes.
- Fulfillment exists separately.
- There are no independent closeout columns in Sales/Orders that mirror the current mental model.

Proposal:

Add closeout checks to sales/orders:

- `Packed`
- `Inv Posted`
- `Pay/F-up`
- raw legacy closeout marker

Atomic implementation:

1. Add fields or projections for closeout booleans.
2. Add commands or command payloads to toggle each check with audit.
3. Show columns in Orders and customer Sales Workspace.
4. Keep lifecycle status secondary.
5. Add dashboard/work queue filters for each missing check.
6. Preserve raw closeout marker for imported rows.

Likely files:

- `src/server/schema.ts`
- migration
- `src/shared/commandCatalog.ts`
- `src/server/services/commandBus.ts`
- `src/server/routers/queries.ts`
- `src/client/views/SalesView.tsx`
- `src/client/views/OperationsViews.tsx`

Proof:

- Operator can sort/filter by packed not done, inventory posted not done, payment/follow-up not done.
- Toggling each check writes an audit command.
- Imported marker values remain visible.

### UF-007: Selection Totals And Receipt Preview Are Not Universal Enough

Priority: P0
Gap type: output gap, visibility gap, workflow gap

Finding:

Receipt generation and operator confidence often begin with selected rows. Selection totals should be a universal grid capability, not a one-off intake action.

Current state:

- Intake has process/receipt action.
- `OperatorGrid` supports row selection.
- There is no sticky selected-row footer with count, qty sum, subtotal, warnings, and next actions.

Proposal:

Add a selected-row footer to `OperatorGrid` and view-specific action providers.

Atomic implementation:

1. Add `SelectionSummary` component.
2. Compute generic count and visible numeric column sums client-side.
3. Allow views to provide domain totals: intake subtotal, order total, payment amount, vendor bill open balance.
4. Show warnings: mixed vendor, mixed status, posted/unposted mix, unknown ownership, zero qty/cost.
5. Add `Generate receipt from selection` for Intake with preview.
6. Add `Copy/export selected customer catalog` for Sales.
7. Add `Export support packet for selection` for Recovery later.

Likely files:

- `src/client/components/OperatorGrid.tsx`
- new `src/client/components/SelectionSummary.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/SalesView.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- Selecting four intake rows immediately shows row count, qty total, and subtotal.
- Receipt preview total exactly equals selected row subtotal.
- Mixed vendor/date conflicts name offending rows.

### UF-008: Money Entry Should Be A Quick Ledger Grid

Priority: P0
Gap type: workflow gap, visibility gap, trust-control gap

Finding:

Quick Start payment buttons are useful, but repeated money work should feel like appending ledger rows. The current flow exposes many inline controls and command buttons, which is slower and more visually noisy.

Current state:

- Quick Start can receive money and pay vendor.
- Payments view has client, invoice, amount, method, bucket, ref, notes, log.
- Vendor view has approve, schedule, pay.

Proposal:

Build a draft Quick Ledger grid at top of Payments.

Columns:

- Date
- Direction: money in / money out / transfer / adjustment
- Method: cash, crypto, check, card, wire where applicable
- Bucket: office, accounting, configured cash/file bucket
- Category: client payment, vendor payout, staff/referral payout, buyer credit, correction, transfer
- Counterparty
- Invoice/bill suggestion
- Amount
- Reference
- Notes
- Allocation intent: FIFO, selected invoice/bill, unapplied
- Impact preview

Atomic implementation:

1. Add draft ledger client state or persisted draft table.
2. Render Quick Ledger grid in Payments.
3. Map row categories to existing commands: `logPayment`, `allocatePayment`, `scheduleVendorPayment`, `recordVendorPayment`, `createCorrectionJournalEntry`, later staff/referral if in scope.
4. Negative client payment row self-labels buyer credit/down payment.
5. FIFO allocation preview runs before commit.
6. Quick Start `Money In`/`Money Out` chips prefill rows instead of launching one-off commands.
7. Add row validation chips.

Likely files:

- `src/client/views/OperationsViews.tsx`
- new `src/client/components/QuickLedgerGrid.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`
- `src/shared/types.ts`
- seed data for payment scenarios

Proof:

- Operator logs five mixed cash/crypto entries in under 30 seconds with no modal.
- Negative amount immediately shows buyer credit/down payment and balance impact.
- Cash/file bucket appears on every row and dashboard drilldown.

### UF-009: Row-Native Command History And Reversal Are Missing From Daily Surfaces

Priority: P0
Gap type: trust-control gap

Finding:

Recovery exists, but operators notice problems by row. They need row-to-command history and reversal preview directly from the visible row.

Current state:

- Recovery view searches command journal and previews reversal.
- Rows do not generally show last command, actor, or reversal affordance.

Proposal:

Add row-native history and reversal drawers.

Atomic implementation:

1. Add query `relatedCommands(entityType, entityId)` or broaden existing recovery search.
2. Add `RowCommandHistoryDrawer` component.
3. Add row action affordance in `OperatorGrid` for posted rows.
4. Show last command, actor, timestamp, before/after diff, affected IDs, reversible state.
5. Allow "Preview reversal" from drawer.
6. Route actual reversal through `reverseCommandById` with reason.
7. Keep manager/owner role gates visible before action.

Likely files:

- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`
- `src/client/components/OperatorGrid.tsx`
- new `src/client/components/RowCommandHistoryDrawer.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/client/components/useCommandRunner.ts`

Proof:

- From posted payment row, open history and preview reversal in one click.
- Viewer sees history but no reverse action.
- Operator sees manager-gated action with plain-language role message.

### UF-010: Relationship Reality Is Split Across Client And Vendor Grids

Priority: P1
Gap type: structural gap, visibility gap, workflow gap

Finding:

The same party can be buyer, seller, debtor, creditor, consignment source, and future opportunity. Current client and vendor views are separate, so dual-role relationship review requires mental stitching.

Current state:

- Client Ledger grid exists.
- Vendor Payables grid exists.
- Dashboard and recovery search have related rows, but no unified relationship view.

Proposal:

Add a relationship drawer/workspace opened from customer/vendor/order/payment/bill rows.

Atomic implementation:

1. Add a unified entity search endpoint.
2. Add `RelationshipDrawer` with tabs/sections: AR, AP, orders, invoices, payments, vendor bills, vendor payments, batches, notes, connector requests, recent commands.
3. Open drawer from client/vendor names in grids.
4. Show net relationship summary: owes us, we owe them, scheduled, overdue, consignment risk.
5. Allow support-safe copy of relationship/status answer with customer-safe redaction.

Likely files:

- `src/server/routers/queries.ts`
- `src/client/components/RelationshipDrawer.tsx`
- `src/client/components/OperatorGrid.tsx`
- `src/client/views/OperationsViews.tsx`
- `src/client/views/SalesView.tsx`

Proof:

- From a customer row, operator sees invoices, payments, orders, vendor bills if same party exists, and recent commands.
- Customer-safe copy excludes cost/margin/internal notes.

### UF-011: Button Pressure And Navigation Are Too High

Priority: P1
Gap type: workflow gap, accessibility/usability gap

Finding:

The app exposes many actions as visible buttons. This makes coverage obvious but creates cockpit pressure. Operators need fewer visible controls and more context-aware actions.

Current state:

- Side nav shows 12 lanes to every user.
- Quick Start exposes all lane controls in one horizontal strip.
- Several pages expose many buttons at once.
- Backend role gates exist, but front-end role-adaptive simplification is thin.

Proposal:

Reduce default visible actions through role-aware navigation and selected-context menus.

Atomic implementation:

1. Collapse Quick Start into four launch chips: Sale, Receiving, Money In, Money Out.
2. Expand only one launch chip at a time.
3. Move secondary actions into row action menus or command palette.
4. Make side nav role-adaptive:
   - Owner: Dashboard, Sales, Vendors, Recovery, Closeout.
   - Sales: Sales, Orders, Inventory/Finder, Clients.
   - Inventory: Intake, Inventory, Fulfillment.
   - Payments: Payments, Vendors, Client Ledger, Recovery.
   - Warehouse: Fulfillment, Connectors, Inventory lookup.
   - Viewer: Dashboard and read-only grids.
5. Put less-used lanes behind `More`.
6. Hide or demote actions current role cannot run, with plain-language explanation.

Likely files:

- `src/client/components/Shell.tsx`
- `src/client/components/QuickStartBar.tsx`
- `src/client/store/uiStore.ts`
- `src/shared/commandCatalog.ts`
- `src/client/components/OperatorGrid.tsx`

Proof:

- Sales operator does not see Closeout as a primary lane.
- Viewer cannot see write buttons.
- Quick Start default view is not a wall of inputs.

### UF-012: Payments, Payables, And Dashboard Money Need Plain-Language Definitions

Priority: P1
Gap type: visibility gap, trust-control gap

Finding:

Money metrics are trusted only when the operator can see what they mean and where they came from. "Files", "available files", due payables, scheduled payables, down payments, and cash buckets need source-row definitions.

Current state:

- Dashboard has KPI cards with metric definitions and drilldown query.
- Payments have buckets.
- Vendor payables have status and scheduled date.
- Existing UX does not yet make the definitions and exceptions prominent enough.

Proposal:

Add money definition and drilldown layer.

Atomic implementation:

1. Add formula/help popover to every KPI card.
2. Add bucket breakdown for cash/files.
3. Add discrepancy warnings for unallocated payments, unknown ownership, unsafe rows, or ambiguous payables.
4. Add vendor due reason and scheduled event display.
5. Add payment allocation impact preview before commit.
6. Add trace links from vendor payouts to bill, receipt, sale depletion, and command.

Likely files:

- `src/client/components/KpiCard.tsx`
- `src/client/views/DashboardView.tsx`
- `src/server/services/metrics.ts`
- `src/server/routers/queries.ts`
- `src/client/views/OperationsViews.tsx`

Proof:

- "Available Files" explains exact formula and opens contributing rows.
- Vendor payable row says why it is due or scheduled.
- Unallocated payment affects dashboard warning and drilldown.

### UF-013: Intake Needs Receipt, Adjustment, And Validation Sidecars

Priority: P1
Gap type: workflow gap, trust-control gap

Finding:

Intake grid is strong, but the current operator flow needs selected-row totals, raw marker preservation, separate arrival/ownership, posted intake locking, generated available quantity, and plain validation.

Current state:

- Intake grid is dense and editable.
- It has source code, date, shorthand, name, category, vendor, costs, qty, ownership, arrival, lot, notes, status.
- Duplicate, Ready, Process/Receipt actions exist.

Proposal:

Add an Intake sidecar/footer that responds to selected rows.

Atomic implementation:

1. Add selected-row totals.
2. Add validation chips: missing vendor, unknown ownership, zero qty, zero cost, missing arrival, mixed vendor/date.
3. Add receipt preview and conflict handling.
4. Add adjustment draft path for posted quantity changes.
5. Add `intake_qty` lock styling after posting.
6. Add `available_qty` derived indicator after posting.
7. Add reason field for adjustments.

Likely files:

- `src/client/views/IntakeView.tsx`
- `src/client/components/SelectionSummary.tsx`
- `src/server/services/commandBus.ts`
- `src/server/routers/queries.ts`

Proof:

- Posted intake quantity cannot be edited directly.
- Selecting rows shows totals and receipt preview.
- Quantity adjustment requires reason and writes movement.

### UF-014: Support Search Needs Entity Timelines, Not Only Command Search

Priority: P1
Gap type: workflow gap, visibility gap

Finding:

Support operators need to answer "what happened with this?" by searching a customer, order, bag, payment, batch, vendor, or command. Recovery search is command-centric.

Current state:

- Top bar command palette says search commands, rows, and actions, but command palette mainly searches commands.
- Recovery search searches command rows.
- Dashboard recent activity exists.

Proposal:

Build a global entity search and status timeline.

Atomic implementation:

1. Add `globalSearch(q)` endpoint returning grouped results: customers, vendors, orders, invoices, payments, batches, bags/picks, connector requests, commands.
2. Upgrade command palette to include entity results.
3. Add `StatusTimelineDrawer` for selected entity.
4. Include commands, statuses, notes, recent activity, ledger entries, connector review history.
5. Add customer-safe copy answer for support.

Likely files:

- `src/server/routers/queries.ts`
- `src/client/components/CommandPalette.tsx`
- new `src/client/components/StatusTimelineDrawer.tsx`
- `src/client/store/uiStore.ts`

Proof:

- Search an order number and see order, invoice, payment, fulfillment, command timeline.
- Search bag code and see pick/order/customer/tracking.
- Support can copy a status answer without internal margin/cost.

### UF-015: Connector Review Has Too Many Equivalent Actions And Too Little History

Priority: P1
Gap type: workflow gap, trust-control gap

Finding:

Connector surfaces are correctly safe, but approve/route/reject should be simplified and review history should be first-class.

Current state:

- Connectors grid has route selector, notes, approve, reject, route.
- Review history is stored in payload/projection, but not displayed as a drawer.

Proposal:

Make connector review a single-primary-action surface.

Atomic implementation:

1. Use primary action `Route` when routing is the approval path.
2. Put Reject in row action menu or secondary compact action.
3. Show review history drawer for selected request.
4. Show safety indicator: no ledger change until routed work is posted by core workflow.
5. Add internal/copy-safe diff if connector payload contains cost/margin/internal fields.

Likely files:

- `src/client/views/OperationsViews.tsx`
- new `src/client/components/ConnectorReviewHistory.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- Operator sees one obvious primary action.
- Review history is visible without reading raw JSON.
- Connector request cannot mutate ledger directly.

### UF-016: Fulfillment Needs A Selected-Pick Workspace

Priority: P1
Gap type: workflow gap, visibility gap

Finding:

Fulfillment exists, but selected pick line work needs less button pressure and better scan/label/manifest visibility.

Current state:

- Fulfillment view shows pick list grid and fulfillment lines grid.
- Controls include labels 4x6, labels 2x1, fulfilled, qty, weight, bag, tracking, pack line.
- Mobile scan submissions are in connectors but not visually tied to pick/order line.

Proposal:

Make selected pick list the focused work object.

Atomic implementation:

1. Pin pack controls to selected fulfillment line.
2. Hide label format choices behind print menu.
3. Show label status, manifest status, bag count, and scan status in selected-row footer.
4. Link routed mobile scan connector submissions to pick/order line.
5. Add auto bag suggestion plus manual override.

Likely files:

- `src/client/views/OperationsViews.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`
- `src/client/components/SelectionSummary.tsx`

Proof:

- Warehouse operator can select pick, pack lines, print labels, and fulfill without scanning unrelated buttons.
- Routed mobile scan appears on related pick/order line.

### UF-017: Photography And Media Readiness Are Missing From Frontend

Priority: P2
Gap type: visibility gap, output gap

Finding:

Schema/commands mention photo attachments and photography queue, but sales/inventory surfaces do not clearly show whether inventory is catalog-ready.

Current state:

- `attachBatchPhoto` command exists in catalog.
- `photography_queue` exists in schema/seed path.
- No clear Photography Queue view or media readiness panel appears in the front end.

Proposal:

Add media readiness indicators and a compact queue.

Atomic implementation:

1. Add media readiness columns to Inventory and Finder rows: no photo, queued, in progress, ready.
2. Add attach-photo row action where inventory context exists.
3. Add compact Photography Queue panel or view under Inventory/Sales, not as a new top-level module unless role needs it.
4. Block or warn customer catalog export for not-ready rows depending on operator override.

Likely files:

- `src/client/views/OperationsViews.tsx`
- `src/client/components/InventoryFinderPanel.tsx`
- new `src/client/components/PhotographyQueuePanel.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- Sales operator can see whether a product is share-ready.
- Photographer can process open/in-progress/done queue.

### UF-018: Returns, Refunds, Disputes, And Credits Lack A Clear Operator Surface

Priority: P2
Gap type: workflow gap, trust-control gap

Finding:

Commands and schema cover refunds, credit overrides, and invoice disputes, but there is no compact support/accounting surface for these moments.

Current state:

- `refundPayment`, `applyClientCredit`, `credit_overrides`, and `invoice_disputes` exist in domain.
- No clear issue sidecar exists on invoice/order/payment rows.

Proposal:

Add an Issue sidecar from selected invoice/order/payment.

Atomic implementation:

1. Add row action `Issue / dispute / credit`.
2. Sidecar supports dispute, refund, credit, return note, correction note.
3. Each action previews ledger impact and audit command.
4. Show issue status in client relationship timeline.

Likely files:

- `src/client/views/OperationsViews.tsx`
- new `src/client/components/IssueSidecar.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- Support can create invoice dispute from selected invoice row.
- Accounting can refund/credit with preview and audit.

### UF-019: Closeout Is Functional But Too Dense

Priority: P2
Gap type: visibility gap, workflow gap

Finding:

Closeout has the required mechanics, but unsafe rows and adjustments need progressive disclosure.

Current state:

- Closeout control band shows period, unsafe rows, totals, adjustment amount/memo, adjustment, lock, archive.

Proposal:

Simplify closeout default view.

Atomic implementation:

1. Make unsafe rows clickable and open source rows.
2. Hide adjustment controls under expandable `Adjustment`.
3. Show artifacts with preview links and control totals.
4. Make restore preview read-only state unmistakable.
5. Add grid-scoped find-and-replace with preview before write.

Likely files:

- `src/client/views/OperationsViews.tsx`
- `src/server/routers/queries.ts`
- `src/server/services/commandBus.ts`

Proof:

- Owner cannot archive while unsafe rows exist and can jump directly to blockers.
- Adjustment controls do not crowd default closeout review.

### UF-020: Layout Persistence And Workspace Control Need Persistence

Priority: P2
Gap type: workflow gap

Finding:

Operators can collapse/focus panels now, but preferences are not durable enough for daily trained use.

Current state:

- `WorkspacePanel` uses store state for collapsed/focused panels.
- Side nav and Quick Start can collapse.

Proposal:

Persist layout preferences per user and route.

Atomic implementation:

1. Persist collapsed panels, nav collapse, density, focused panel preference, and finder width.
2. Add compact density mode for grids.
3. Add resize presets for side panels.
4. Add keyboard shortcut to minimize secondary panels.
5. Keep compact command strip available in focus mode.

Likely files:

- `src/client/store/uiStore.ts`
- `src/client/components/WorkspacePanel.tsx`
- `src/client/components/Shell.tsx`
- `src/client/components/QuickStartBar.tsx`
- CSS/Tailwind styles

Proof:

- Operator's Sales layout survives reload and login.
- 500-row intake remains dense and readable.

## Consolidated Atomic Backlog

This table is the de-duplicated backlog. The IDs are stable enough for tickets.

| ID | Priority | Atomic work item | Depends on | Primary proof |
| --- | --- | --- | --- | --- |
| TA-001 | P0 | Add raw legacy marker fields for inventory and order/sales rows. | none | Raw markers survive import/edit/display. |
| TA-002 | P0 | Split ownership, arrival, and payable due reason in schema/projections. | TA-001 | Row can be arrived + unknown ownership; bill explains due reason. |
| TA-003 | P0 | Add provisional row validation model with draft/needs_resolution/ready states. | none | Incomplete row saves, cannot post, shows exact fix. |
| TA-004 | P0 | Refactor Quick Start into four expandable launch chips. | none | Only one lane expands; fewer always-visible controls. |
| TA-005 | P0 | Make Sale launch open customer workspace. | TA-004 | Customer workspace opens from anywhere with first line focused. |
| TA-006 | P0 | Add customer workspace header with credit, balance, tags, notes, recent history. | TA-005 | Credit context visible while building order. |
| TA-007 | P0 | Add editable draft sale-line grid inside customer workspace. | TA-005 | Operator types/pastes into first line immediately. |
| TA-008 | P0 | Move/augment finder beside customer draft lines. | TA-005 | Finder and draft order visible together. |
| TA-009 | P0 | Expand finder full-text resolver search fields. | TA-008 | `m15`, `25 flex`, `ofc` can match source rows. |
| TA-010 | P0 | Add finder source identity display and match reasons. | TA-009 | Result row shows code/date/source/item/avail/ticket/marker. |
| TA-011 | P0 | Add ambiguity and duplicate-source guards to finder/order lines. | TA-010 | Ambiguous post refuses with candidate rows. |
| TA-012 | P0 | Add selected-row footer to `OperatorGrid`. | none | Selection shows count and numeric totals. |
| TA-013 | P0 | Add intake receipt preview from selected rows. | TA-012 | Receipt total equals selected subtotal. |
| TA-014 | P0 | Add selected-row conflict handling for receipt generation. | TA-013 | Mixed vendor/date rows named before post. |
| TA-015 | P0 | Add Quick Ledger draft grid. | TA-004 | Five money rows logged without modal. |
| TA-016 | P0 | Add negative payment buyer-credit self-label and impact preview. | TA-015 | Negative amount labels and previews balance effect. |
| TA-017 | P0 | Add row command history drawer. | none | Posted row opens last commands in one click. |
| TA-018 | P0 | Add row reversal preview from command history drawer. | TA-017 | Reversal impact visible before action. |
| TA-019 | P0 | Add sales/order closeout columns: Packed, Inv Posted, Pay/F-up. | TA-001 | Sort/filter/toggle each independent check. |
| TA-020 | P1 | Lock posted intake quantity and derive posted available quantity. | TA-003 | Posted intake edit refused; adjustment draft required. |
| TA-021 | P1 | Add inventory adjustment sidecar with reason and preview. | TA-020 | Adjustment writes movement with reason. |
| TA-022 | P1 | Add payment allocation preview in Quick Ledger. | TA-015 | FIFO/selected invoice impact shown before commit. |
| TA-023 | P1 | Add vendor due reason and scheduled event badges. | TA-002 | Every due/scheduled bill explains itself. |
| TA-024 | P1 | Add KPI formula/help popovers and bucket drilldowns. | TA-022 | Available Files formula and source rows visible. |
| TA-025 | P1 | Add relationship drawer opened from customer/vendor/order/payment/bill rows. | TA-017 | AR/AP/orders/bills/payments/timeline visible together. |
| TA-026 | P1 | Upgrade command palette to global entity search. | TA-025 | Search order/bag/payment opens timeline. |
| TA-027 | P1 | Add support-safe copy status answer. | TA-026 | No cost/margin/internal fields leak. |
| TA-028 | P1 | Role-adapt primary navigation. | none | Viewer sees read-only surfaces; sales sees sales lanes. |
| TA-029 | P1 | Hide/demote role-gated actions in UI with plain explanation. | TA-028 | Operator sees why manager action is unavailable. |
| TA-030 | P1 | Simplify Connector review to Approve/Reject and keep routing/default assignment backend-internal. | none | No user-facing route workflow or approve/route ambiguity. |
| TA-031 | P1 | Add connector review history drawer and no-ledger-change indicator. | TA-030 | Review history visible without raw JSON. |
| TA-032 | P1 | Focus Fulfillment around selected pick/line. | TA-012 | Pack controls pin to selected line. |
| TA-033 | P1 | Hide fulfillment label formats behind compact print menu. | TA-032 | Fewer visible buttons; print still works. |
| TA-034 | P1 | Link routed mobile scan connector requests to pick/order line. | TA-031 | Scan submission visible on related fulfillment work. |
| TA-035 | P1 | Enable TSV paste and fill-down proof for intake and sales grids. | TA-003 | 50-row paste creates drafts with validation. |
| TA-036 | P1 | Preserve shorthand inputs and add vocabulary review queue. | TA-001 | `Ins/candy` saves raw and maps later. |
| TA-037 | P2 | Add media readiness columns to inventory/finder. | none | Sales sees catalog readiness. |
| TA-038 | P2 | Add compact Photography Queue panel. | TA-037 | Photographer can process open/in-progress/done. |
| TA-039 | P2 | Add Issue sidecar for disputes/refunds/credits/returns. | TA-025 | Invoice dispute/refund preview from row. |
| TA-040 | P2 | Make unsafe closeout rows clickable. | TA-017 | Owner jumps from unsafe count to blockers. |
| TA-041 | P2 | Hide closeout adjustments behind expandable section. | none | Default closeout is calmer. |
| TA-042 | P2 | Add artifact preview/control totals to closeout rows. | TA-040 | CSV/JSONL/PDF totals visible. |
| TA-043 | P2 | Persist layout preferences per user/route. | none | Layout survives reload/login. |
| TA-044 | P2 | Add compact grid density preference. | TA-043 | Dense mode supports 500-row scanning. |
| TA-045 | P2 | Add command palette aliases for legacy terms. | TA-026 | `files`, `ofc`, `iv`, `ticket`, `sub` resolve. |
| TA-046 | P2 | Add saved finder slices. | TA-009 | Common slices apply from chip or palette. |
| TA-047 | P2 | Add selected finder compare strip. | TA-012 | Selected lots compare side by side. |
| TA-048 | P2 | Add selected-row support packet export. | TA-017 | Packet includes selected rows and related commands. |

## Recommended Implementation Order

This is an execution order, not a timeline or artificial phase gate.

### Slice A: Row Truth Foundation

Purpose:

Make the system safe for uncertain spreadsheet-native work before changing high-frequency UI flows.

Include:

- TA-001 raw markers
- TA-002 split ownership/arrival/due reason
- TA-003 provisional row validation
- TA-017 row command history
- TA-018 reversal preview

Why first:

Customer workspace, finder resolution, receipt preview, and Quick Ledger all depend on row truth, not just page layout.

Close proof:

- Incomplete rows can exist visibly.
- Raw markers survive unchanged.
- Posted row can explain its command history.

### Slice B: Start-Work Simplicity

Purpose:

Fix the top-of-list user concern: new sale, new purchase/receiving, receive money, and pay money must be incredibly easy to start.

Include:

- TA-004 Quick Start launch chips
- TA-005 customer workspace launch
- TA-015 Quick Ledger draft grid
- TA-028 role-adaptive nav
- TA-029 role-gated action visibility

Why second:

This directly reduces button pressure and changes how operators enter work.

Close proof:

- Sale, Receiving, Money In, Money Out each starts from a compact chip.
- Only one chip expands at a time.
- Role no longer sees every lane/action by default.

### Slice C: Sales Workspace And Finder Resolver

Purpose:

Make sales work feel like a customer sheet plus powerful product finder, not a global order grid.

Include:

- TA-006 customer header
- TA-007 draft sale-line grid
- TA-008 finder beside draft lines
- TA-009 full-text resolver search
- TA-010 source identity display
- TA-011 ambiguity/duplicate guards
- TA-019 closeout columns

Why third:

This is the highest-pressure operator moment and the clearest current mismatch.

Close proof:

- From anywhere, start customer sale, type remembered inventory string, add lines, see credit, confirm.
- Posting refuses ambiguous source rows with exact resolution choices.

### Slice D: Intake, Receipt, And Adjustment Comfort

Purpose:

Make receiving and inventory correction behave like rows selected in a sheet with visible totals and explicit consequences.

Include:

- TA-012 selected-row footer
- TA-013 receipt preview
- TA-014 receipt conflict handling
- TA-020 posted intake lock/available derived
- TA-021 adjustment sidecar
- TA-035 TSV paste/fill-down
- TA-036 shorthand/vocabulary review

Why fourth:

Intake already has a good grid; this adds trust and speed.

Close proof:

- Select rows, see totals, generate receipt without formal PO.
- Pasting rows and fill-down are tested.
- Posted quantity edits route to adjustment drafts.

### Slice E: Money, Payables, Dashboard Trust

Purpose:

Make money movement fast, explainable, and source-row traceable.

Include:

- TA-016 negative payment self-label
- TA-022 allocation preview
- TA-023 vendor due/scheduled badges
- TA-024 KPI formulas/buckets
- TA-025 relationship drawer

Why fifth:

The ledger model gets stronger once Quick Ledger and row history exist.

Close proof:

- Five mixed money entries in under 30 seconds.
- Dashboard metrics explain formulas and source rows.
- Vendor bill explains why due and what scheduled means.

### Slice F: Support, Connector, Fulfillment

Purpose:

Make cross-role handoffs and status reconstruction clear without adding more top-level pages.

Include:

- TA-026 entity search
- TA-027 support-safe copy answer
- TA-030 connector primary action simplification
- TA-031 connector history/safety
- TA-032 selected-pick fulfillment
- TA-033 label print menu
- TA-034 scan-to-pick linkage

Why sixth:

These workflows benefit from row history, relationship drawer, and entity search already being available.

Close proof:

- Search any entity and see timeline.
- Connector routing is safe and history is visible.
- Warehouse view has fewer controls and clearer selected-pick workflow.

### Slice G: Remaining Visibility And Polish

Purpose:

Close important lower-frequency gaps after the core operator paradigm works.

Include:

- TA-037 media readiness
- TA-038 Photography Queue
- TA-039 Issue sidecar
- TA-040 unsafe closeout rows clickable
- TA-041 closeout adjustment progressive disclosure
- TA-042 closeout artifact previews
- TA-043 layout persistence
- TA-044 compact density
- TA-045 command aliases
- TA-046 saved finder slices
- TA-047 finder compare strip
- TA-048 selection support packet

Close proof:

- Catalog readiness visible.
- Closeout is calmer and more drillable.
- Layout survives reload.
- Legacy terms work in command palette.

## Data And API Changes Required

Minimum schema/projection changes:

| Change | Reason |
| --- | --- |
| `legacy_marker` on batches/inventory | Preserve raw operator marker vocabulary. |
| raw closeout marker field(s) on sales/order lines | Preserve `P`, `Iv`, `C`, `M`, unknown text. |
| `arrival_status` | Separate arrival from ownership. |
| `due_reason` projection or stored field on vendor bills | Explain payable state. |
| closeout booleans | Represent packed, inventory posted, payment/follow-up independently. |
| row validation issue projection | Show exact row readiness blockers. |
| command-to-entity relation query | Row-native command history. |
| entity search endpoint | Support status reconstruction and global search. |
| draft ledger representation | Quick Ledger rows before commit, either client-only or persisted. |
| media readiness projection | Sales and inventory catalog readiness. |

Command/API additions or adaptations:

| Command/API | Need |
| --- | --- |
| `updateBatch` payload support for raw marker/arrival status | Preserve and edit raw intake state. |
| `createBatch` defaults for provisional receiving rows | Save incomplete receiving rows. |
| `updateSalesOrderLine` support for unresolved source text and raw marker | Draft sale lines before inventory resolution. |
| New or adapted closeout commands | Toggle Packed, Inv Posted, Pay/F-up independently. |
| `relatedCommands` query | Row command history drawer. |
| `globalSearch` query | Entity search in command palette. |
| `selectionReceiptPreview` query or client calculation plus server validation | Receipt preview from selected rows. |
| `paymentAllocationPreview` query | Quick Ledger allocation impact before commit. |
| `relationshipSummary` query | Unified buyer/seller/debtor/creditor view. |

## Frontend Components To Extract

Recommended reusable components:

| Component | Purpose |
| --- | --- |
| `LaunchChipsBar` | Replaces crowded Quick Start strip with Sale, Receiving, Money In, Money Out. |
| `CustomerWorkspace` | Customer-centered sale surface. |
| `DraftOrderLinesGrid` | Editable sale lines with inline inventory resolution. |
| `InventoryResolverPanel` | Finder upgraded for full-text resolver and result-set actions. |
| `SelectionSummary` | Universal selected-row totals/footer. |
| `ReceiptPreviewPanel` | Selected-row vendor receipt preview and conflict handling. |
| `QuickLedgerGrid` | Payment/payout ledger row entry. |
| `RowCommandHistoryDrawer` | Row-to-command history and reversal preview. |
| `RelationshipDrawer` | Unified AR/AP/orders/bills/payments/timeline view. |
| `StatusTimelineDrawer` | Entity status reconstruction for support. |
| `ConnectorReviewHistory` | Connector route/review audit without raw JSON. |
| `MarkerLegend` | Raw marker meaning, confidence, and source. |
| `IssueSidecar` | Disputes/refunds/credits/returns. |
| `PhotographyQueuePanel` | Media readiness processing. |

## QA And Acceptance Harness

The next implementation should be verified by operator-moment tests, not only page smoke tests.

Golden scenarios:

1. Customer sale from anywhere:
   - Start Sale.
   - Choose customer.
   - Focus first sale line.
   - Search inventory by remembered fragment.
   - Add three lines.
   - Preview customer-safe output.
   - Confirm/post.

2. Ambiguous source-row refusal:
   - Enter inventory fragment that matches multiple rows.
   - Attempt post.
   - UI marks line `needs_resolution`.
   - Candidate rows are named.
   - Choosing exact row allows post.

3. Intake receipt from selection:
   - Create/paste several intake rows.
   - Select rows.
   - See totals.
   - Generate receipt preview.
   - Mixed vendor/date conflict blocks post with exact rows.
   - Valid selection posts and totals match.

4. Quick Ledger:
   - Enter five mixed rows: cash customer payment, crypto customer payment, negative buyer credit, vendor payout, correction.
   - Verify buckets and impact preview.
   - Commit rows.
   - Dashboard metrics update.

5. Row history and reversal:
   - Post intake, sale, payment.
   - Open row history from each row.
   - Preview reversal.
   - Reverse one manager-gated row.
   - Verify ledger/inventory impact.

6. Relationship timeline:
   - Search a dual-role counterparty.
   - See AR/AP/orders/bills/payments/commands in one drawer.
   - Copy customer-safe status answer.

7. Connector safety:
   - Route connector request to Sales/Fulfillment.
   - Verify no ledger mutation until core command posts.
   - Review history remains visible.

8. Fulfillment selected-pick workflow:
   - Select pick.
   - Pack lines with qty/weight/bag.
   - Print labels from compact menu.
   - Fulfill order.
   - Manifest/bag status updates.

9. Closeout blocker drilldown:
   - Open closeout.
   - Unsafe rows count appears.
   - Click unsafe rows.
   - Fix blocker.
   - Lock/archive only after safe.

10. Role simplification:
   - Login as owner, operator, viewer.
   - Verify visible nav/actions differ.
   - Viewer cannot see write buttons.
   - Role-gated command gives plain-language explanation.

Test layers:

- Unit/contract tests for command validation and projections.
- Component tests for row state, finder, selection summary, Quick Ledger validation.
- Playwright E2E for golden scenarios.
- Accessibility checks for keyboard-only flow and status announcement.
- Performance checks for 500-row grid rendering and finder filtering.

## Done Definition For The Next Paradigm Pass

The pass is done when these can be demonstrated in the browser:

1. New Sale opens a customer workspace with editable first line and finder in under three seconds.
2. Finder resolves remembered operator strings and refuses ambiguous posting.
3. Selected intake rows produce live totals and vendor receipt preview without a PO.
4. Five money rows can be entered in Quick Ledger without modal workflows.
5. Raw markers are preserved and visible alongside normalized meanings.
6. Posted rows show command history and reversal preview from the row.
7. Vendor payable rows explain due vs scheduled.
8. Dashboard money metrics explain formulas and drill to source rows.
9. Role-specific UI hides/demotes irrelevant lanes and gated actions.
10. The UI has fewer always-visible buttons than today while exposing more contextually useful actions.

## What Not To Build Yet

- Do not add more top-level modules to solve each missing moment.
- Do not build a modal wizard for sale, receiving, payment, or closeout.
- Do not copy old TERP screens or Numbers layout pixel-for-pixel.
- Do not normalize raw markers before preserving them.
- Do not make command payload JSON part of normal operator work.
- Do not add third-party SaaS or external operational-data integrations.
- Do not build bank/card/crypto wallet integrations.
- Do not make every possible command visible as a toolbar button.

## Final Recommendation

The next build should be treated as a row-native paradigm pass, not a feature-count pass.

The highest-leverage move is to build the shared row-trust primitives first:

- raw markers,
- provisional row states,
- selected-row summaries,
- row command history,
- role-aware actions.

Then use those primitives to fix the daily operator moments:

- customer workspace for sales,
- resolver-grade inventory finder,
- selected-row receipt preview,
- quick ledger money entry,
- relationship timeline,
- due/scheduled payable visibility.

That route addresses almost every unactioned finding without fighting the existing architecture. It keeps TERP Agro's safety model, but makes the human workflow feel closer to the spreadsheet's speed, tolerance, and visible trust.
