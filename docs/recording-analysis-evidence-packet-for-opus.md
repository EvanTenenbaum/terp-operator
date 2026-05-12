# TERP Recording-Analysis Evidence Packet For Opus

Date: 2026-05-11
Purpose: condensed, document-only evidence packet for external review. This file summarizes prior analysis documents created from current-system screen recordings. It does not analyze the original videos.

## Source Documents

- 2026-04-27 current-system walkthrough:
  - `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/04_timeline/comment_timeline.md`
  - `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/05_tasks/actionable_tasks.md`
  - `../artifacts/video-feedback/2026-04-27-cleanshot-125554-2/06_prds/prd_draft.md`
- 2026-05-05 intake recording:
  - `../terp-numbers-command-system/artifacts/video-feedback/intake-2026-05-05/intake-flow-findings.md`
- 2026-05-05 order/inventory reconciliation recording:
  - `../terp-numbers-command-system/artifacts/video-feedback/screen-recording-2026-05-05-165120/order-inventory-reconciliation-findings.md`
  - `../terp-numbers-command-system/artifacts/video-feedback/screen-recording-2026-05-05-165120/refined-sheet-model-analysis.md`

## Broad Current-System Walkthrough Findings

The 2026-04-27 walkthrough says the current Numbers workbook is simple and familiar, but fragile because calculations, copying, and status propagation are manual. The explicit product direction is to avoid overcomplicating the workflow while making it more reliable, efficient, and easier to use.

Key workflow requirements extracted from the walkthrough:

- Preserve the spreadsheet-native mental model while removing fragile manual work.
- Dashboard metrics should preserve current business definitions:
  - `Files` means cash.
  - `Files on Hand` is raw cash across tracked cash locations.
  - `Available Files = Files on Hand - Payables Scheduled`.
  - Office cash and accounting cash are distinct tracked buckets.
  - Receivables, payables, inventory value, and inventory units should update from system records.
- Payables:
  - Scheduled and due are different states.
  - Scheduled means a real appointment or planned payment event exists.
  - Consignment can become due when inventory reaches zero.
  - Net terms can create due status before sellout.
  - Down payments must reduce remaining obligation.
- Manual ledgers:
  - Cash and crypto are logged manually.
  - Quick entry matters more than deep forms.
  - Vendor payments, referral payouts, staff/time payouts, accounting cash movement, and accounting crypto movement need typed categories.
  - Every row needs date, amount, method, location/bucket, counterparty/beneficiary, and notes.
- Inventory:
  - Operators need category, vendor/source, item, available count, intake count, ticket/cost, subtotal, notes, price ranges, and confirmation markers.
  - New lines can be entered before product arrives, then confirmed later.
  - Sales currently require manually reducing `Available`.
- Sales:
  - Operators currently click into an individual client sheet.
  - They copy products from inventory into the client sheet.
  - They set quantity, sale price, total, and notes.
  - The sheet also tracks packed state, inventory-updated state, and payment/follow-up state.
  - Future product should preserve the client-sheet mental model while replacing copy-paste with structured item selection and calculated totals.
- Vendor receipts:
  - The receipt utility is lightweight and operationally real.
  - It should generate vendor, intake date, notes, total value, item, quantity, min cost/unit, total value, and price/range notes from purchasing/intake data.

## Intake Recording Findings

The 2026-05-05 intake analysis observed an `Inventory` sheet in workbook `The Office`.

Visible structure:

- `Code / Date`
- `Source`
- `Category`
- `Item`
- `Available`
- `Intake`
- `Ticket`
- `Sub`
- `Pics Out`
- confirmation/status marker cells
- `Create Sales Sheet` control
- `Unit upcharge amount`
- aging inventory prompt

Operator vocabulary:

- Category dropdown values include `Ins`, `Smalls`, `Other`, `Products`, `Deps`, and `Ins/candy`.
- Shorthand such as `Ins/candy` should be accepted at entry time and normalized later only if it does not slow operators down.

Observed intake example:

- Vendor/source `Scott`
- Date/code `5/5` / `S10`
- Category `Ins`
- Items `GG`, `SD`, `Runts`, `ICC`
- Available starts equal to Intake.
- Ticket values are `0.9`, `1.0`, `0.85`, `0.825`.
- Subtotal values are `9`, `5`, `8.5`, `4.125`.
- Notes/range include `25 flex`.

Quantity implication:

- `Intake` is the original received/entered quantity and should become stable after posting.
- `Available` is the current remaining quantity and changes through sales/adjustments.

Receipt implication:

- A vendor receipt is generated from selected intake rows.
- It does not require a formal PO.
- Receipt total must match selected row totals.
- Selected rows should share compatible vendor/source and intake date unless explicitly overridden.

Marker implication from intake-only pass:

- Initial analysis suspected `C = consigned` and `OFC = office-owned`.
- Later refined analysis says this was overfit and `C` should remain a raw legacy marker until confirmed.

## Order / Inventory Reconciliation Recording Findings

The 2026-05-05 order/inventory recording shows an order/customer-sheet to inventory reconciliation flow, not another intake flow.

Observed customer/order sheet:

- Sheet `Others`, section `Rich Star`.
- Visible fields include `W`, `#`, `Item`, second `#`, `Tic`, `T`, `I`, `Note`, `P`, `Iv`, `C`.
- Visible line items include products like `Candy Mediums`, `Sugar High`, `Black Truffle`, `Alien Runts`, `Space Rocks`, `Gelato 33`, `Gelato`, `Toad Venom`, and more.
- Source/code values include `J2`, `F2`, `M15`, `J7`, `C2`, `A4`.
- Rows have compact values like `0.025`, `0.075`, `0.05`, `0.1`, and `X` markers.

Inventory lookup:

- Operator switches to `Inventory`.
- Operator uses search / Find & Replace with terms such as `m15` and `rich`.
- Visible inventory fields include code/date, source, category, item, available, intake, ticket, sub, notes/cost, ownership/status marker.
- Notes include values such as `.035 less is cost`, `0.565 cost`, `0.615 cost`, and `Returned 16 on 4/29`.

Matching implication:

- Order lines should link to inventory rows by a composite identity: source code, source label, item label, category, date/section, legacy row id, and available-at-match time.
- Source code alone is not unique enough.
- Automatic posting should refuse ambiguous matches.

Inventory decrement:

- Current workflow includes manual edits to `Inventory.Available` after a sale/allocation.
- Future workflow should make order posting or fulfillment command-owned:
  - mark order line ready/fulfilled
  - write inventory movement
  - update generated available quantity
  - mark order line posted/fulfilled
- Manual `Available` edits should become exceptions or adjustment drafts, not silent committed consequences.

Status markers:

- Customer/order sheets contain compact closeout columns.
- Prior transcript says the business meanings are packed, inventory updated, and payment or follow-up done.
- `P` likely maps to packed in many contexts.
- `Iv` likely maps to inventory updated.
- `C` or `M` may map to final closeout/payment/message/customer marker depending on sheet.
- `FT` is unconfirmed and should remain raw text if present.

## Refined Marker / Data Model Findings

The refined sheet model analysis corrects earlier over-simplification:

- `C` in inventory should not be treated only as consignment.
- `legacy_inventory_marker` should preserve raw values such as `C`, `ofc`, `Ofc`, `CV`, `T`, and blank.
- `arrival_status` is separate from ownership.
- `ownership_status` is separate from arrival.
- `ofc` implies office-owned or paid/partly paid inventory and drives office-owned value formulas.
- Blank should not be assumed confirmed.
- Sale-sheet `P`, `Iv`, `C`/`M` should become explicit closeout states while preserving raw labels per sheet.
- `FT` is not confirmed enough to normalize.
- Down payments are first-class, not casual notes.
- Tags and smart suggestions are core, but should stay compact and explainable.

## Current TERP Agro Implementation Summary

Current implemented strengths:

- React/Vite/TypeScript app with dense AG Grid views.
- Quick Start bar includes:
  - `New Sale`
  - `New PO / Intake`
  - `Receive Money`
  - `Pay Vendor`
- Sales view includes customer-aware order creation, order grid, suggestions, and an Inventory Finder side panel.
- Inventory Finder filters by search, category, vendor, tag, location, ownership, min quantity, max price, and aging.
- Operator panels can be minimized/focused; side navigation and Quick Start can collapse.
- Backend has typed command bus, idempotency keys, audit journal, RBAC, session auth, Drizzle/Postgres, seed data, and many reversals.
- Workflow gap audit claims all 10 journeys have implementation coverage.

Known current UI/UX gaps from Codex first-pass audit:

- Quick Start starts records but does not always open the row-native workspace operators expect.
- Sales lacks a strong client-sheet/client-workspace feeling.
- New PO / Intake blends planned PO, ad hoc receiving, arrival confirmation, selected-row receipt, and payable consequences.
- Payment quick actions are not yet a fast repeated ledger grid.
- Finder is useful but not yet a full inventory resolver with source-row ambiguity handling.
- `OwnershipStatus = C | OFC | UNKNOWN` is too simplified for the refined marker evidence.
- Sales/fulfillment lacks familiar packed / inventory posted / payment-follow-up closeout columns.
- Dashboard needs clearer current-system definitions, bucket breakdowns, and source-row drilldowns.
- Recovery is command-centric and needs row-to-command affordances.

