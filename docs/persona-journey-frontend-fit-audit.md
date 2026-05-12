# TERP Agro Persona Journey Frontend Fit Audit

Date: 2026-05-11

## Purpose

This audit extracts the human operator persona journeys from prior TERP and TERP Numbers work, then runs those journeys against the current TERP Agro front end and user tools.

The source material is used only for persona intent, work rhythm, edge cases, and operating language. This audit intentionally does not inherit prior product shapes, old feature layouts, or previous build assumptions. The question is not "did we rebuild the old thing?" The question is "does the current console let these people complete their real work faster, more reliably, and with less cognitive load than the spreadsheet world?"

## Source Set

Primary workflow/persona sources:

- `../terp-numbers-command-system/docs/control/OPERATOR_JOURNEYS.md`
- `../terp-numbers-command-system/docs/control/AI_PERSONA_TEST_PLAN.md`
- `../../TERP/TERP/docs/design/BROKERAGE_OPERATOR_CONTEXT.md`
- `../../TERP/TERP/docs/protocols/BROKERAGE_FIT_REVIEW_FRAMEWORK.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/personas/MAIN_MANAGER.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/personas/SUPPORT.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/personas/ACCOUNTING.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/personas/PHOTOGRAPHER.md`
- `../../TERP/TERP/docs/qa/virtual-brokerage-team/HUMAN_SIGNAL_RUBRIC.md`
- `../../TERP/TERP/docs/testing/archive/USER_PERSONA_TESTING_STRATEGY.md`
- `../../TERP/TERP/docs/reference/USER_FLOW_MATRIX.csv`

Current TERP Agro front-end surfaces reviewed:

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

## Normalized Human Personas

These are the operating personas extracted from prior TERP work and normalized for TERP Agro.

| Persona | Real work | Must feel true in TERP Agro |
| --- | --- | --- |
| Owner / Main Manager | Decides what matters today, handles relationship-sensitive commercial calls, approves exceptions, closes periods. | Dashboard must answer "what needs my attention?" and a sales/customer moment must become a sendable quote quickly. |
| Sales Operator | Finds sellable inventory, builds orders, sends catalogs, handles known-item orders and guided selling. | New sale must be nearly instant. Product finding must work like slicing a spreadsheet, but faster. |
| Inventory Operator | Receives batches, preserves raw shorthand/markers, separates ownership from arrival, posts receipts, fixes mistakes. | Intake must behave like a dense sheet with reliable posting and reversal, not a form workflow. |
| Payments / Accounting Operator | Logs money, allocates invoices, tracks cash/files, pays vendors, explains balances. | Money movement must be easy to start, traceable, reversible, and visible in the relevant ledger context. |
| Warehouse Operator | Picks, weighs, bags, labels, fulfills, and handles mobile scan review surfaces. | Fulfillment must be a tight working queue with very few decisions per row. |
| Support Operator | Answers "where is this?" questions, follows up, reconstructs history, routes requests. | Search and recent activity must reconstruct status without accounting archaeology. |
| Photographer / Readiness Operator | Tracks photo/media/catalog readiness and product presentation blockers. | Media/readiness state must be visible where inventory is sold and shared. |
| Connector Actor | VIP/live/mobile surfaces submit requests but do not mutate ledgers. | Connector review must be reviewable, routeable, and safe by default. |

## Operating Style Captured

The prior journey work describes a human operating paradigm more than a screen layout:

- Spreadsheet-native work: rows are the work unit, not forms.
- Trained operators move fast and expect copy/paste, fill-down, keyboard navigation, and inline edits.
- Many actions begin from messy natural inputs: a buyer text, a vendor drop, a cash handoff, a quick correction.
- Trust comes from source rows, raw markers, command history, and reversible consequences.
- Commercial work is relationship-aware: the same party can be buyer, seller, debtor, creditor, consignment source, and future opportunity.
- The interface should reduce visible buttons, not create a cockpit. The right next action should be obvious from selected rows.
- Connector surfaces are inboxes, not ledger writers.
- Customer-facing output must hide internal cost, margin, floors, and approval logic.

## Current Frontend Summary

The current build has strong infrastructure for the intended operator console:

- Grid-first views exist for dashboard, intake, sales, orders, payments, inventory, clients, vendors, fulfillment, connectors, recovery, and closeout.
- `OperatorGrid` supports sorting, filtering, grouping, range selection, copy/paste-style grid behavior, undo/redo cell editing, CSV export, and inline editable columns where enabled.
- `QuickStartBar` gives global starts for new sale, new PO/intake, receive money, and pay vendor.
- `InventoryFinderPanel` provides category, vendor, tag, location, ownership, quantity, price, aging, and free-text filtering.
- `WorkspacePanel` supports collapse and focused panel mode.
- Hotkeys exist for primary navigation, command palette, duplicate intake rows, mark ready, process intake, validate, health, and confirm/post.
- Recovery and closeout have real user surfaces rather than hidden admin-only ideas.

The main issue is not missing page count. The main issue is that the highest-frequency human moments are still too record-first and button-dense. A trained operator should be able to start from "buyer wants Runtz", "vendor just dropped these rows", or "I received $2,000 cash" and land directly in the right context with a small set of obvious next actions.

## Overall Scores

| Dimension | Score | Why |
| --- | --- | --- |
| Journey surface coverage | 7/10 | Most major journeys have a page and command path. |
| Spreadsheet-native feel | 7/10 | Grids are strong, but row-level command history, selected-row footers, raw markers, and fill-down cues need improvement. |
| High-frequency start speed | 5/10 | Quick Start exists, but it is crowded and starts records more than workflows. New sale, new purchase/intake, and money movement need more context-first starts. |
| Product finder power | 7/10 | Facets are solid. It needs natural search/resolution, saved slices, and quote/order/catalog actions from the result set. |
| Simplicity / button pressure | 4/10 | The side nav has 12 lanes and several screens expose many buttons at once. Power should move into selected-row action menus and the command palette. |
| Relationship awareness | 4/10 | Client and vendor views exist, but there is no unified relationship workspace or quick ledger context. |
| Recovery confidence | 6/10 | Recovery page exists with previews and reversal, but recovery is not row-native enough in the daily work surfaces. |
| Connector safety | 8/10 | Connectors are review/routing surfaces rather than direct mutation paths. |
| Front-end role fit | 4/10 | User role is displayed, but navigation and primary actions are not meaningfully simplified by role/persona. |

## Journey Run Matrix

Legend:

- Green: current front end supports the journey with minor polish.
- Yellow: usable but slower, more confusing, or too button-heavy.
- Red: key human moment is not yet adequately supported by the user tools.

| Journey | Persona | Run result | Current frontend fit | Main gap | Smallest useful UI change |
| --- | --- | --- | --- | --- | --- |
| JY-01 Owner daily decision view | Owner / Main Manager | Green-yellow | Dashboard has KPI cards, source drilldowns, pending queues, recent activity, health, and refresh. | It is useful, but not yet decisive enough: queues do not expose the best next action or person responsible. | Add a "Today focus" strip that ranks the top 3 actions with one row-level jump each. |
| JY-02 Inbound inventory request: "What do you have in Runtz?" | Main Manager / Sales | Yellow-red | Sales view plus Inventory Finder can filter and search inventory. | Operator must create/select an order before the finder becomes fully useful; output is not message-ready. | Add a sales command input: customer + natural inventory request opens finder, suggestions, and a sendable response draft. |
| JY-03 Known-item fast order | Sales Operator | Yellow | Quick Start can create a sale, Sales view can add finder/suggestion rows, Orders can confirm/post. | Flow crosses Quick Start, Sales grid, finder, then Orders. It is too much for a buyer who already knows the item. | Add "New Sale" as a focused sales workspace: choose customer, search item, quantity, confirm, all without leaving the screen. |
| JY-04 Guided selling / sell aging tagged inventory | Sales Operator / Owner | Yellow | Finder has aging, tag, vendor, ownership, price, qty filters; suggestions explain reasons. | Suggestions and finder are separate mental models; reasons are not tied to client history, margin, or relationship risk strongly enough in the UI. | Merge finder result rows with one-line "why this fits" and expose internal/customer catalog toggle from selected rows. |
| JY-05 Remote share / customer catalog | Sales Operator | Yellow | Sales sheet preview hides cost/margin in catalog mode and exports CSV. | The output is a CSV preview, not a fast customer-ready message/catalog moment. | Add "Copy customer offer" and "Export catalog from selected finder rows" while keeping cost/margin hidden. |
| JY-06 Below-floor negotiation | Owner / Sales | Red | Pricing strategy and margin columns exist internally. | No clear floor/range warning, approval path, or relationship context when price is risky. | Add row-level price risk badges and a single "Request/approve exception" selected-row action. |
| JY-07 Dual-role relationship review | Owner / Accounting / Sales | Red | Client ledger and vendor payouts exist as separate grids. | Same counterparty as buyer/seller/debtor/creditor is not legible in one place. | Create a unified relationship drawer opened from any customer/vendor row showing AR, AP, orders, bills, payments, notes, and recent commands. |
| JY-08 Fast inventory intake / receiving | Inventory Operator | Green-yellow | Intake grid is dense, editable, has shorthand, ownership, arrival, duplicate, ready, process/receipt. `Receive Inventory` now creates ad hoc draft receiving rows. | Receiving has the needed mechanics, but selected-row totals and impact preview are still visually secondary. | Make the selected-row receipt footer more prominent: subtotal, ownership mix, arrival warnings, and "Process selected" impact preview. |
| JY-09 Purchase order / restock / procurement | Inventory Operator / Procurement | Yellow | Dedicated Purchase Orders workspace now supports PO header, planned lines, approve, receive to intake, and cancel. | Flow is functionally correct, but the page still feels like generic grid tooling rather than a crisp procurement document surface. | Improve information/action hierarchy: one primary next action by status, PO header context always visible, line add/edit still spreadsheet-native. |
| JY-10 Inventory adjustment / transfer / slow-moving | Inventory Operator / Owner | Yellow | Inventory grid allows price and quantity edits; dashboard has aging inventory metric. | Quantity adjustment is manager-gated but UI does not explain impact or require a reason inline; storage/location transfer is thin. | Add an inline adjustment sidecar with reason, before/after qty, movement preview, and command history. |
| JY-11 Client order posting with ambiguity/duplicate prevention | Sales Operator | Yellow | Orders queue supports Ready, Post, Reprice, Fulfillment, Cancel; backend commands are idempotent. | UI does not surface ambiguous inventory match, duplicate source row, credit failure, or raw closeout marker preservation well enough before posting. | Add a pre-post checklist panel for selected order: inventory match, credit, duplicates, required fields, customer-facing output status. |
| JY-12 Payment logging and allocation | Payments / Accounting | Yellow | Quick Start and Payments view support client, invoice/FIFO, amount, method, bucket, notes, log, allocate. | Money entry is split across many inline controls; negative amount/down-payment meaning is not obvious; ledger impact preview is missing. | Replace the money controls with a compact "Money In" row: client, amount, method, reference, FIFO toggle, impact preview. |
| JY-13 Vendor payable and payout | Accounting / Owner | Yellow | Vendor grid supports approve, schedule, pay; Quick Start can pay scheduled/unscheduled bill. | "Scheduled means real event" is not visually enforced; consignment sellout explanation is not prominent. | Add due/scheduled badges with event date and a bill detail strip that shows trigger, terms, paid, balance, and source receipt/order. |
| JY-14 Fulfillment / bagging / labels | Warehouse Operator | Green-yellow | Fulfillment queue, fulfillment lines, qty/weight/bag/tracking, label print, fulfilled actions exist. | There are still several controls at once; mobile scan submissions are in connectors, but handoff is not visually tied to the pick line. | Make selected pick the workspace: hide label buttons behind a small print menu and pin pack-line inputs to the selected line. |
| JY-15 Connector request review | Support / Sales / Warehouse | Green-yellow | Connector grid has approve/reject/route and route destinations; requests do not mutate ledgers directly. | Review history is present in payload but not first-class; approved vs routed semantics can feel like duplicate buttons. | Use one primary action, "Route", with approve/reject in a row action menu; show review history in a compact drawer. |
| JY-16 Support follow-up / status reconstruction | Support | Yellow-red | Dashboard recent activity and recovery search exist; grids can be filtered. | Support cannot search one customer/order/bag/payment and see the status story in one place. | Add global entity search results that open a relationship/status timeline rather than only commands. |
| JY-17 Photography / catalog readiness | Photographer / Sales | Red | Schema and commands mention photo/photography queue, but the current front end has no clear photography queue or readiness path. | Product cannot be judged as sell/share-ready from the sales or inventory tools. | Add media readiness columns and a small Photography Queue view or panel accessible from inventory and sales rows. |
| JY-18 Mistake recovery / reversal / retry | Manager / Support / Accounting | Yellow | Recovery page supports search, support packet, backup preview, correction entry, retry, reversal preview. | Recovery is centralized; row-level "what happened to this?" is missing on normal pages. | Add "Command history" and "Reverse posted command" row action from posted rows, opening Recovery with context. |
| JY-19 Archive and closeout | Owner / Accounting | Green-yellow | Closeout has period, unsafe rows, control totals, adjustment, lock, archive, and archive grid. | The page is functional but dense; unsafe rows need direct drilldown before lock/archive. | Make "Unsafe rows" clickable and hide adjustment controls until the owner expands "Adjustment". |
| JY-20 Returns, refunds, disputes, credits | Support / Accounting | Red-yellow | Command catalog includes refund and credit commands; schema includes disputes/credit overrides. | Front end lacks a clear returns/disputes/credit exception operator surface. | Add a small selected-invoice/order "Issue" sidecar: dispute, refund, credit, return note, and reversal/audit links. |

## Edge-Case Coverage Run

The prior persona test plan requires each journey to be tested against missing required fields, duplicate/retry/idempotency, bad quantity or invalid state, reversal/recovery, and simplicity compared with the current spreadsheet process.

| Edge case | Current support | Frontend gap |
| --- | --- | --- |
| Missing required field | Backend validation and disabled buttons cover some cases. | Inline grid errors need to name the exact cell and next fix; several buttons simply disable without saying why. |
| Duplicate/retry/idempotency | Command layer is idempotent; Recovery has retry. | UI does not consistently expose duplicate source-row prevention before posting. |
| Bad quantity / invalid state | Backend commands validate; some front-end min/max logic exists in Inventory Finder. | Quantity warnings are not row-native enough in intake, orders, inventory adjustment, and fulfillment. |
| Ambiguous inventory match | Finder supports filtering but does not present ambiguity as an explicit state. | Posting should show "ambiguous match" with candidate rows and one-click resolution. |
| Credit limit/debt | Customer balances and credit limits are visible in client grid. | New sale/order creation does not keep credit context in the operator's face. |
| Customer-facing cost/margin hiding | Sales Catalog mode hides cost/margin. | Need stronger guardrails: copy/export customer output should never include internal columns. |
| Connector safety | Connector review is routeable and separate from ledgers. | Review history and "no ledger mutation yet" should be visually explicit. |
| Reversal/recovery | Recovery page exists; reversible commands are cataloged. | Reversal should be discoverable from the row that looks wrong, not only from command search. |
| Interruption/resume | Collapsible/focused panels help. | Current active selections and partially entered Quick Start state need a clearer "resume where I was" affordance. |
| Role mismatch | Backend role gates commands. | Front end should hide or demote actions the current role cannot run, with plain-language explanations. |
| Simplicity/button pressure | Panels can collapse; nav can collapse. | Default views still show too many controls; role/task context should reduce visible actions. |

## Button Pressure Review

The current front end has a useful but risky pattern: many pages expose every action as a visible button. This is understandable in a first working console, but it is not how the final operator surface should feel.

High-pressure areas:

- Side navigation shows 12 lanes to every user.
- Quick Start exposes client, new sale, vendor, new PO/intake, money amount, method, FIFO, receive money, bill, money out, and pay vendor in one horizontal strip.
- Sales view exposes customer, order, add line, price/confirm, sheet/catalog toggle, export, finder controls, suggestions, and sheet preview.
- Payments view exposes client, invoice, amount, method, bucket, ref, notes, log, and FIFO allocate.
- Recovery and closeout expose powerful actions in dense control bands.

Recommended principle:

- Keep only one primary visible action per current selected context.
- Move secondary actions into row action menus, command palette, or collapsed "More" sections.
- Keep keyboard shortcuts and command palette as the power layer.
- Keep grids as the main visible tool, not a surrounding button cockpit.

## Required Frontend Changes, Atomic and Ordered

### P0 - High-Frequency Starts

1. Replace the crowded global Quick Start strip with four compact launch chips: `Sale`, `Receiving`, `Money In`, `Money Out`.
2. When a launch chip is selected, expand only that lane's minimal fields; collapse the others.
3. Make `Sale` default to customer search plus inventory request input, not just customer select plus create order.
4. Make `Receiving` default to vendor search plus empty receiving grid rows, not a prefilled fake PO row.
5. Make `Money In` default to client search, amount, method, reference, and live allocation preview.
6. Make `Money Out` default to vendor/bill search, amount, scheduled event status, and source bill preview.
7. Preserve keyboard speed: each launch chip should be addressable from the command palette and hotkeys.

### P0 - Sales Workspace

8. Create a single focused sales workspace that starts from customer, request text, or inventory search.
9. Keep customer credit/balance/tags visible while building the order.
10. Let operators add inventory directly from finder rows with quantity and price inline.
11. Show selected-order lines beside the finder so the operator does not bounce between grids.
12. Add a customer-safe copy/export action that hides internal cost, margin, floor, and approval logic.
13. Keep internal margin visible only in internal mode.
14. Add a price-risk badge for below-floor or low-margin lines.
15. Add a one-action exception request/approval path for risky pricing.

### P0 - Product Finder

16. Keep current slicing variables: category, vendor, tag, location, ownership, minimum quantity, maximum price, and aging.
17. Add natural search that accepts shorthand, product fragments, vendor fragments, lot codes, tags, and price hints.
18. Add saved slices such as aging premium, consigned sellout risk, value buyer fit, and fast reorder candidates.
19. Add "selected result set" actions: add to order, export customer catalog, copy offer, reserve, compare.
20. Show why a row matches: tag match, customer history, margin band, aging, ownership, availability.
21. Treat "no results" as an operator moment with suggestions: remove price cap, include low quantity, include older lots, clear vendor.

### P0 - Row-Native Trust And Recovery

22. Add a selected-row footer to every operational grid with status, next action, last command, actor, and reversible state.
23. Add a row action menu for command history, reverse, retry, export row, copy row ID, and open source rows.
24. Add command history drawers to intake, orders, payments, vendor bills, inventory, and fulfillment rows.
25. From any posted row, offer "Preview reversal" if the command is reversible.
26. Show plain-language impact before posting or reversal.

### P1 - Intake / Receiving

27. Preserve and display raw shorthand/markers as first-class columns, not only normalized values.
28. Keep ownership status and arrival confirmation visually separate.
29. Add selected-row receipt totals before processing intake.
30. Show payable/consignment consequences before `Process / Receipt`.
31. Make `intake_qty` visually locked after posting while keeping `available_qty` live.
32. Add a row-level duplicate affordance that mirrors `⌘D`.
33. Add validation chips for missing vendor, unknown ownership, zero qty, zero cost, and arrival mismatch.

### P1 - Payments And Accounting

34. Add a quick ledger drawer from customer, invoice, payment, vendor, and bill rows.
35. Show payment allocation impact before logging: paid invoices, unapplied amount, buyer credit if negative.
36. Make negative payment/down-payment behavior explicit in the UI.
37. Show cash/file bucket impact after logging payment.
38. Add "why this bill is due" for vendor payables: terms, consignment depletion, down payment, manual approval.
39. Require a visible scheduled event/date before a vendor bill can be shown as scheduled.
40. Add trace links from vendor payouts back to bill, receipt, sale depletion, and command.

### P1 - Support / Relationship Timeline

41. Add global entity search results grouped by customer, vendor, order, invoice, payment, batch, bag, and command.
42. Open a compact relationship timeline from any entity result.
43. Include orders, payments, bills, connector requests, command history, notes, disputes, and recent activity in that timeline.
44. Let support copy a status answer without exposing internal cost/margin.

### P1 - Fulfillment

45. Make selected pick list the focused work object.
46. Pin current line pack controls to the selected fulfillment line.
47. Hide label format choices behind a compact print menu.
48. Show mobile scan connector submissions directly on the related pick/order line after routing.
49. Add manifest status and bag count summary to the selected-row footer.

### P1 - Connector Review

50. Collapse approve/route into one primary "Route" action when routing is the intended approval.
51. Keep reject as a secondary row action.
52. Show request review history in a drawer.
53. Display a safety indicator: "No ledger change until an operator posts the routed row."
54. For customer-facing connector payloads, show an internal/copy-safe diff if margin/cost fields are present.

### P1 - Role-Based Simplicity

55. Keep backend role gates, but also adapt visible navigation and actions by role.
56. Owner default: dashboard, sales, vendors, recovery, closeout.
57. Sales operator default: sales, orders, inventory finder, clients.
58. Inventory operator default: intake, inventory, fulfillment.
59. Payments operator default: payments, vendors, client ledger, recovery.
60. Warehouse operator default: fulfillment, connectors, inventory lookup.
61. Viewer default: dashboard and read-only grids with write actions hidden.
62. Put less-used lanes behind `More` or command palette instead of always visible.

### P2 - Photography / Readiness

63. Add media readiness to inventory and finder rows.
64. Add a compact Photography Queue surface or panel.
65. Show whether a product can be included in a customer catalog.
66. Add attach-photo action where inventory context already exists.
67. Track open/in-progress/done status for photos in a way sales can understand.

### P2 - Closeout And Recovery Polish

68. Make unsafe rows clickable from Closeout.
69. Hide closeout adjustment inputs until expanded.
70. Add closeout artifact preview links with control totals beside each artifact.
71. Add restore-from-backup preview as read-only with unmistakable "no writes yet" status.
72. Add find-and-replace as a grid-scoped recovery tool with preview before write.

## What Not To Do

- Do not add more top-level pages to solve every gap.
- Do not turn core workflows into modal wizards.
- Do not make a separate form for every command.
- Do not copy old TERP module shapes just because the old source had those modules.
- Do not expose every possible command as a visible button.
- Do not make operators understand command payload JSON for normal work.
- Do not require the operator to know whether a flow is "sales", "orders", or "client ledger" before starting the task.

## Best Next Implementation Sequence

1. Refactor Quick Start into four expandable launch chips and remove always-visible cross-lane controls.
2. Build the focused New Sale workspace around customer + inventory request + finder + order lines.
3. Add selected-row footers and command history drawers to `OperatorGrid`.
4. Add quick ledger / relationship drawer.
5. Add intake receipt preview and validation chips.
6. Simplify payments into a money movement row with allocation preview.
7. Add role-adaptive navigation/action visibility.
8. Add photography/readiness state to inventory and sales surfaces.

This order improves the daily human workflow without fighting the current architecture. It uses the existing grids, commands, router data, hotkeys, and panels, but changes what is visible by default.

## Final Assessment

TERP Agro currently has a good technical foundation and broad journey coverage. It does not yet fully match the human operator paradigm captured in prior TERP research because the UI still thinks in pages and command buttons more than human work moments.

The most important correction is to make high-frequency work start from the real trigger:

- Buyer wants something.
- Vendor dropped inventory.
- Money came in.
- Money needs to go out.
- A row looks wrong.
- Someone asks "what happened with this?"

If those triggers become fast, contextual, and row-native, the app can preserve the comfort of the spreadsheet workflow while being safer and more automated than the spreadsheet ever was.
