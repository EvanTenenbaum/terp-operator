# TERP Agro Recording-Paradigm UI/UX Audit

Date: 2026-05-11
Author: Codex first-pass audit
Status: first-pass analysis before external Opus review

## Evidence Set

This audit compares the current TERP Agro web app against the operating paradigm captured in prior screen-recording analysis artifacts, not against the videos directly.

- `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/04_timeline/comment_timeline.md`
- `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/05_tasks/actionable_tasks.md`
- `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/06_prds/prd_draft.md`
- `../terp-numbers-command-system/artifacts/video-feedback/intake-2026-05-05/intake-flow-findings.md`
- `../terp-numbers-command-system/artifacts/video-feedback/screen-recording-2026-05-05-165120/order-inventory-reconciliation-findings.md`
- `../terp-numbers-command-system/artifacts/video-feedback/screen-recording-2026-05-05-165120/refined-sheet-model-analysis.md`
- Current TERP Agro docs and implementation under `docs/`, `src/client`, `src/server`, and `tests/e2e`.

The 2026-04-27 walkthrough is used as the broad current-system context. The two 2026-05-05 analyses are used as the most concrete current-operator-flow evidence: one intake/receipt flow and one order-to-inventory reconciliation flow.

## Executive Verdict

TERP Agro has the right technical spine and a much better safety model than the Numbers workbook: audited commands, structured data, role-gated writes, live dashboards, reversible posted actions, and dense grid surfaces. The product is no longer a toy mockup.

The main UX risk is subtler: TERP Agro currently feels like a capable ERP console that uses grids, while the current system feels like a shared operating sheet where the row itself is the workflow. Operators are not only entering data into tables. They are using visible rows as memory, task state, confirmation checklist, payment reminder, inventory resolver, customer workspace, and lightweight document generator.

The next UI/UX pass should not mirror Numbers visually. It should preserve the comfort mechanics:

- Start the common work from the exact context where the operator already is.
- Keep every high-frequency flow row-first, keyboard-first, and visible.
- Let operators search, slice, copy, paste, duplicate, mark, and post without turning the row into a form.
- Preserve raw legacy shorthand where meaning is not fully confirmed.
- Make automated consequences explainable in the same visible surface where the operator initiated them.

## Current-System Paradigm

### 1. The spreadsheet is a shared operating canvas

The current workbook is not just storage. It is the place where work is drafted, remembered, corrected, and confirmed. A row can be an intake draft, a stock item, a sale line, a payment reminder, or a fulfillment checklist depending on the sheet and marker columns.

Implication for TERP Agro: a grid is necessary but not sufficient. Rows need visible command state, validation state, consequence previews, and recovery affordances inline.

### 2. Operators trust visible row math

The recording analyses repeatedly identify `Available`, `Intake`, `Ticket`, `Sub`, sale quantity, sale price, total, and receipt totals as visible working math. Operators can inspect the values directly.

Implication for TERP Agro: avoid hiding derived totals in side summaries only. Put row-level calculated cells and reconciliation totals where spreadsheet users expect to see them.

### 3. Client sheets are relationship workspaces

The current sales flow starts from an individual client sheet, then pulls inventory into that context. The sheet is not merely an order form. It is also the mental container for what this customer wants, what was packed, whether inventory was updated, and whether payment/follow-up is done.

Implication for TERP Agro: Sales should have a stronger client-workspace mode, not only a global order queue with a customer selector.

### 4. Inventory lookup is a workflow, not a search box

The operator searches inventory by source/code and item, moves between customer sheet and inventory, and manually reconciles `Available`. Codes like `M15`, `J7`, `C2`, `A4`, and `S5` are useful but not globally unique. Matching requires source/code, item, date/section, source label, and ambiguity handling.

Implication for TERP Agro: the product finder must do more than filter batches. It must support source-row resolution, ambiguity refusal, duplicate awareness, and fast add-to-order from a visible result.

### 5. Markers are shorthand, not clean enums yet

The analyses refined earlier assumptions: `C` should not be treated as simply consignment. It is a legacy inventory marker that likely relates to confirmed standard inventory in many contexts. `ofc`/`OFC` drives office-owned value. `P`, `Iv`, `C`, `M`, and possibly `FT` are sale/order closeout markers whose exact meanings vary by sheet.

Implication for TERP Agro: preserve raw legacy marker text and normalize cautiously. A clean enum can exist behind the scenes, but the UI should show the raw operator marker where it is still part of the workflow vocabulary.

### 6. Payments are quick ledger entries with business rules

The current system expects fast manual cash/crypto logging, vendor payout logging, referral/staff payouts, down payments as negative entries, and a difference between due payables and scheduled appointments.

Implication for TERP Agro: payment entry should feel like a ledger grid with typed quick rows, not like a generic payment form.

### 7. Receipts are selected-row outputs

The intake video shows a vendor receipt generated from selected inventory/intake rows, with totals exactly matching those rows. It does not require a formal purchase order first.

Implication for TERP Agro: "New PO" is useful vocabulary, but receiving/intake must also support selected-row receipt generation as a lightweight command.

## What TERP Agro Already Does Well

- Dense AG Grid surfaces exist for core journeys.
- Quick Start now exposes New Sale, New PO, Receive Inventory, Receive Money, and Pay Vendor globally.
- Inventory Finder now supports search and slicing by category, vendor, tag, location, ownership, quantity, price, and aging.
- Workspace panels can be minimized or focused.
- The command bus is audited, idempotent, role-gated, and reversible for major posted consequences.
- Dashboard, recovery, fulfillment, connector review, vendor payables, closeout, and export surfaces exist.
- The current code has an explicit "do not mutate connectors directly into ledgers" command pattern.

## Core Mismatch

The app's architecture says "spreadsheet-native", but several interaction surfaces still say "ERP console with tables." The difference matters:

- In Numbers, the operator starts by placing or finding the row.
- In TERP Agro, the operator often starts by choosing an action in a toolbar or strip, then the system creates something elsewhere.
- In Numbers, every visible marker is part of the work memory.
- In TERP Agro, many markers have been normalized or hidden behind statuses.
- In Numbers, customer/order/inventory/payment context is stitched by search and visible row proximity.
- In TERP Agro, the surfaces are cleaner but can require mental stitching between queue, finder, order, ledger, and fulfillment panels.

The goal should be a faster row-native console, not a more polished traditional ERP.

## Gap Analysis By Operator Moment

### Start a New Sale

Current build: Quick Start can create a sales order and route to Sales. Sales view has a customer selector, order grid, suggestion grid, and inventory finder.

Gap: the experience still starts as "create an order record." The current paradigm starts as "open the customer's working sheet and add rows." Operators need the customer workspace to appear immediately with a focused empty line, inventory finder already scoped to that customer, customer balance visible, and recent buying patterns nearby.

Needed change: make New Sale open a client workspace state, not just route to Sales. The first visible thing should be "customer + editable sale lines + add inventory", with order metadata secondary.

### Start a Purchase / Receiving Flow

Current build: Quick Start separates `New PO` from `Receive Inventory`. `New PO` creates a planned purchase order header/line workspace; `Receive Inventory` creates draft receiving rows. Approved POs can be received into draft intake rows, and selected intake rows still generate the vendor receipt/payable consequences.

Remaining gap: the recording evidence separates even more nuance inside receiving: product physically arriving, row-by-row marker confirmation, selected-row vendor receipt, and payable/consignment consequences. Those are supported, but the presentation still needs clearer next-action priority and fewer simultaneous controls.

Needed change: create a Purchase/Receiving work surface that supports both planned PO intake and ad hoc receiving. It can still write to the existing command path, but the UI should label the operator moment clearly: `Draft`, `Arrived`, `Ready`, `Posted`, `Receipt generated`.

### Receive or Pay Money

Current build: Quick Start supports Receive Money and Pay Vendor; Payments view supports logging/allocation; Vendor view supports bill scheduling/payout.

Gap: the recording evidence emphasizes fast manual ledger rows and cash/crypto buckets. Current quick actions are helpful but too command-button-like. They need row-grid equivalents for repeated entry, location buckets, category-specific fields, and down-payment conventions.

Needed change: add a quick ledger grid at the top of Payments where each row is a transaction draft with method, bucket, category, counterparty, amount, reference, and allocation intent. Negative buyer-credit/down-payment behavior should be visible, not surprising.

### Find Inventory For A Sale

Current build: InventoryFinderPanel has useful filter controls and add-first quantity inputs.

Gap: it does not yet fully replace the operator's inventory slicing and source-row resolution behavior. Search should include source code, code/date, notes, price range, legacy markers, item aliases, and raw shorthand. Adding a result should create a line that remembers the exact source row, resolution confidence, and duplicate conflict state.

Needed change: upgrade the finder into a compact inventory resolver: faceted filters, keyboard movement, composite match warnings, source-row key display, duplicate badges, and one-keystroke add from quantity.

### Post / Fulfill A Sale

Current build: orders can be confirmed, posted, allocated to fulfillment, weighed/packed, fulfilled, and reversed.

Gap: the current-system operator tracks closeout using compact status columns: packed, inventory updated, payment/follow-up done, plus raw sheet-specific labels. TERP Agro has lifecycle statuses, but not a familiar three-check row closeout surface tied directly to the order lines.

Needed change: add explicit closeout columns to sales and fulfillment rows: `Packed`, `Inventory posted`, `Payment/follow-up`, with raw legacy marker display where imported. Keep lifecycle status, but do not make it the only visible state.

### Track Dashboard Money

Current build: KPI cards exist with drilldowns and live data.

Gap: recording evidence has specific money semantics: `Files` means cash, `Available Files = files on hand - scheduled payables`, office/accounting buckets matter, due and scheduled are different, and down payments affect obligations. The current dashboard likely has the broad cards, but the UI must expose these definitions inline and route to the exact ledger rows.

Needed change: each KPI needs a definition popover, source-row drilldown, bucket breakdown, and discrepancy banner when data is incomplete.

### Recover Mistakes

Current build: command journal, reversal, retry, support packet, snapshot diff, and restore preview exist.

Gap: spreadsheet operators recover by finding a visible row and fixing it. TERP Agro recovery is command-centric, which is correct for audit, but the UI must bridge from row to command and command to row.

Needed change: every posted row needs a "history/reverse" affordance, showing the command that last touched it and the expected reversal impact.

## Atomic Recommendations

### P0: Comfort-Critical Start And Row Flow

1. UI-001: Make `New Sale` open a client workspace, not only create an order and route to Sales.
   Acceptance: after choosing a customer, focus lands in the first editable sale line; inventory finder is open and scoped to that customer; balance and recent purchases are visible without another click.

2. UI-002: Add `New Sale` hotkey support through the command palette and a direct shortcut alias.
   Acceptance: operator can press `Cmd+K`, type customer shorthand, hit Enter, and land in an editable line.

3. UI-003: Add a `Start from customer` mode to Sales.
   Acceptance: a customer list/search column can be minimized, and selecting a customer opens that customer's active draft/orders/history in one workspace.

4. UI-004: Keep a visible empty draft line in Sales when a customer is selected.
   Acceptance: operators can paste TSV or type item/quantity/price directly into the line, then resolve inventory matches inline.

5. UI-005: Split `New PO / Intake` into two visible starts: `New PO` and `Receive Inventory`.
   Acceptance: planned purchasing and ad hoc receiving use different labels but can share the same audited backend where appropriate.

6. UI-006: In Intake, create new rows at the current grid focus or selected row position.
   Acceptance: keyboard operator can select a row, trigger new intake row, and keep the row near related vendor/date context.

7. UI-007: Add a Quick Ledger grid for repeated money entries.
   Acceptance: operator can enter five cash/crypto/payment/payout rows without reopening a command form or moving through separate buttons.

8. UI-008: Keep Quick Start visible in a compact command-strip form even when a panel is focused.
   Acceptance: focused mode preserves one-line global actions or exposes them through a fixed command key hint.

### P0: Legacy Marker And Status Fidelity

9. UI-009: Replace `OwnershipStatus = C | OFC | UNKNOWN` in the UI with raw marker plus normalized fields.
   Acceptance: grid shows `Legacy marker`, `Ownership`, and `Arrival` separately; imported `C`, `ofc`, `OFC`, `CV`, `T`, blank are preserved.

10. UI-010: Treat `C` as a legacy marker until confirmed, not as a hard consignment enum.
    Acceptance: consignment logic does not rely solely on `C`; operators can see why a payable is treated as consigned, office-owned, terms-based, or unknown.

11. UI-011: Add sale closeout columns matching current mental model: `Packed`, `Inventory posted`, `Payment/follow-up`.
    Acceptance: sales/order rows expose the three checks independently from lifecycle status.

12. UI-012: Preserve raw client-sheet status labels `P`, `Iv`, `C`, `M`, and unknown text on imported rows.
    Acceptance: unknown markers display as raw text and do not silently become fulfilled/paid.

13. UI-013: Add marker legend/tooltips per grid.
    Acceptance: operators can hover or keyboard-focus a marker cell and see plain-language meaning plus whether it is confirmed or inferred.

### P0: Inventory Finder / Resolver

14. UI-014: Expand finder search coverage to source code, intake date/code, vendor/source, item, category, tags, notes, price range, lot code, and raw marker.
    Acceptance: searching `m15`, `rich`, `25 flex`, or `ofc` can return matching inventory rows when present.

15. UI-015: Show source-row identity in finder results.
    Acceptance: each finder result displays code/date/source, item, available/intake, ticket/cost, price/range, and legacy marker compactly.

16. UI-016: Add ambiguity warnings when an order line maps to more than one inventory row.
    Acceptance: posting is refused until the operator chooses the exact source row.

17. UI-017: Add duplicate-source badges inside the order and finder.
    Acceptance: if the same source row is already in the order, finder shows `Already added` and blocks accidental duplicate add unless explicitly split.

18. UI-018: Make Enter from finder quantity add the row and return focus to the next result.
    Acceptance: keyboard operator can build a multi-line order from search results without touching the mouse.

19. UI-019: Add saved filter chips for common operator slices.
    Acceptance: one click or command palette action applies filters like `Candies`, `Smalls`, `OFC`, `Consignment`, `Aging 30+`, and `Low available`.

20. UI-020: Add a `Compare selected` strip for finder rows.
    Acceptance: selected rows show cost, price, margin/spread, available, aging, and ownership side by side in a compact footer.

### P1: Intake / Receipt / Purchase Comfort

21. UI-021: Add selected-row receipt preview before posting.
    Acceptance: selecting intake rows and choosing receipt shows vendor, intake date, line totals, and grand total before writing consequences.

22. UI-022: Allow receipt generation from selected rows without a PO.
    Acceptance: ad hoc intake rows can produce a vendor receipt if required fields are present and totals match.

23. UI-023: Refuse mixed vendor/date receipt generation with a plain-language override path.
    Acceptance: mixed selections show exactly which rows conflict and what to change.

24. UI-024: Make `Intake` immutable after posting and visibly locked.
    Acceptance: posted intake quantity cell displays lock/read-only state; adjustments go through an adjustment command.

25. UI-025: Show `Available` as generated/current stock after posting.
    Acceptance: manual edits to posted available quantity become adjustment drafts or exception rows, not silent direct edits.

26. UI-026: Add arrival confirmation separate from ownership.
    Acceptance: row can be `pending arrival`, `arrived`, or `canceled` independent of `office-owned`, `consigned`, or `unknown`.

27. UI-027: Preserve shorthand category entry.
    Acceptance: typing `Ins/candy` is accepted and normalized into category/tags only after preserving the raw shorthand.

28. UI-028: Add fill-down, duplicate, and TSV paste acceptance tests for 500-row intake.
    Acceptance: spreadsheet-native entry actions are tested, not only single-row commands.

### P1: Payments And Payables

29. UI-029: Add cash bucket visibility to every money entry.
    Acceptance: office cash and accounting cash are distinct choices and dashboard drilldowns show both.

30. UI-030: Limit phase-one payment method defaults to cash and crypto in the primary quick-entry path.
    Acceptance: check/card/wire can exist as advanced/admin values if required, but the fast operator path emphasizes the actual current workflow.

31. UI-031: Make negative amount behavior explicit.
    Acceptance: entering a negative client amount immediately labels the row `buyer credit/down payment` and shows balance impact.

32. UI-032: Add manual payout categories beyond vendor bills.
    Acceptance: referral, staff/time payout, accounting cash movement, and accounting crypto movement can be recorded as typed ledger rows.

33. UI-033: Distinguish `Due` from `Scheduled` everywhere payables appear.
    Acceptance: scheduled rows show appointment/payment event time; due rows show why they are due.

34. UI-034: Show consignment depletion trigger on vendor payable rows.
    Acceptance: payable row explains `due because inventory reached zero` when applicable.

35. UI-035: Add down-payment remaining-balance display on vendor bills.
    Acceptance: vendor obligation shows original amount, down payments, paid amount, and remaining balance.

### P1: Dashboard Decision Comfort

36. UI-036: Add plain-language KPI definitions inline.
    Acceptance: `Files`, `Available Files`, `Receivables`, `Payables Due`, `Payables Scheduled`, and inventory value each explain formula and source rows.

37. UI-037: Add one-click KPI source-row grid overlay or routed workspace.
    Acceptance: clicking any KPI shows the rows that make up the number with deterministic columns.

38. UI-038: Add dashboard discrepancy/incomplete-data flags.
    Acceptance: if unknown ownership, missing bucket, unallocated payment, or ambiguous inventory match affects a metric, the card shows a warning and row count.

39. UI-039: Add owner assignment/action queue from dashboard work queues.
    Acceptance: owner can assign or route pending work from dashboard without opening each lane.

### P1: Workspace Control

40. UI-040: Persist panel collapsed/focused state per user and route.
    Acceptance: operator's preferred Sales layout survives reload/login.

41. UI-041: Add keyboard commands for focus/minimize/restore current panel.
    Acceptance: `Cmd+Shift+.` or command-palette aliases can focus/minimize the current panel; `Esc` restores.

42. UI-042: Add compact density mode for all operational grids.
    Acceptance: row height, header height, and toolbar height can be set to dense without losing readable status and errors.

43. UI-043: Make side panels resizable, not only collapsible.
    Acceptance: finder, suggestions, and support panels can be dragged between preset widths with keyboard alternatives.

### P1: Recovery And Trust

44. UI-044: Add row-level command history drawer.
    Acceptance: every posted row can show command ID, actor, time, before/after, and reversal availability.

45. UI-045: Add reversal preview from the row itself.
    Acceptance: operator can preview undo consequences without first searching the command journal by ID.

46. UI-046: Add failed-command row annotations.
    Acceptance: rows that failed posting show `Needs Fix` with exact validation text and retry action.

47. UI-047: Add source-row search across legacy code, customer, vendor, item, and command ID.
    Acceptance: `Cmd+K` can find rows by `M15`, `Scott`, `Rich`, `GG`, or `CMD-...`.

### P2: Output And Communication

48. UI-048: Add one-click customer-facing sales catalog copy/export from Sales.
    Acceptance: export hides cost/margin and can be copied/sent without manual cleanup.

49. UI-049: Add internal sales sheet preview with margin and pricing-rule explanation.
    Acceptance: operator can inspect cost, price, spread, and rule reason before confirming.

50. UI-050: Add receipt print/export layout matching selected-row receipt fields.
    Acceptance: receipt includes vendor, intake date, total value, notes, item, quantity, min cost/unit, total value, and price range/notes.

51. UI-051: Add bag manifest and labels to the fulfillment row workflow.
    Acceptance: pack/weigh lines show print status and manifest inclusion without leaving the fulfillment surface.

### P2: Data-Model / Naming Surface

52. UI-052: Reconsider operator-facing word `Batch` in high-frequency screens.
    Acceptance: grid may store batches internally but labels visible to operators use `inventory row`, `item`, or `lot` where clearer.

53. UI-053: Add aliases for workbook terms in command palette.
    Acceptance: searching `files`, `ticket`, `sub`, `ofc`, `iv`, or `receipt` finds the relevant modern command/surface.

54. UI-054: Add migration/import review view for unknown marker vocabulary.
    Acceptance: imported markers are grouped with counts, examples, proposed meaning, and approval status.

55. UI-055: Add field-level provenance for migrated rows.
    Acceptance: operators can see whether a value came from imported workbook, direct operator edit, command consequence, or system calculation.

## Acceptance Criteria For The Next UI/UX Pass

The next pass should not be considered done until these can be demonstrated:

1. A trained operator can start a customer sale, find inventory, add three lines, confirm, and post using keyboard-first interactions with no modal wizard.
2. A trained operator can receive four ad hoc intake rows, preserve shorthand, generate a selected-row receipt, and process intake while seeing totals match.
3. A trained operator can log five mixed cash/crypto entries in a ledger-like grid and see cash bucket effects.
4. A trained operator can see why a payable is due, scheduled, partially paid, or blocked.
5. A trained operator can focus the active grid/finder, collapse secondary panels, and recover the layout from the keyboard.
6. Any imported ambiguous marker remains visible as raw text until explicitly mapped.
7. Every posted row has a visible route to command history and reversal preview.
