# TERP Agro North Stars

Date: 2026-05-12
Status: active PM guardrail

This document is the product-level source of truth for deciding whether a feature belongs in TERP Agro and where it should live.

## The Product Promise

TERP Agro is a spreadsheet-native cannabis wholesale operator console. It keeps the speed and comfort of the current Numbers workflow while adding reliable ledgers, auditability, reversal, role-gated commands, traceability, and self-hosted privacy.

The goal is not to expose every capability. The goal is to make the next correct operator move obvious, fast, and safe.

## North Stars

1. Spreadsheet first. Operational work happens in dense grids, inline cells, selected rows, keyboard movement, fill-down, paste, filters, and row status.
2. Operator fast. The common path must be faster than the current spreadsheet under pressure.
3. Status first. Rows advertise Draft, Ready, Posted, Needs Fix, Reversed, Archived, or the closest canonical state before the operator has to inspect details.
4. Ledger safe. Connectors, reports, suggestions, previews, and exports never mutate committed truth directly.
5. Reversible by design. Posted consequences need a first-class reversal or a documented reason they are intentionally irreversible.
6. Familiar vocabulary. Operator words win: Files, OFC, 25 flex, Inv Posted, Pay/F-up, New PO, Receive against PO, Buyer credit.
   > **Doc sync note (UX-A09, 2026-06-12):** "Receive Inventory" renamed to "Receive against PO" to reflect TER-1658 PO-first intake policy. The Keel quick-launch chip uses this label and targets the purchase-orders/intake PO-picker flow.
7. Quiet power. Advanced actions exist through row actions, drawers, recovery, or command palette; they do not crowd the daily grid.
8. Customer safe by default. Customer-facing outputs must not leak cost, margin, floors, pricing rules, internal notes, or approval logic.
9. Self-hosted privacy. Operational data stays inside infrastructure controlled by the owner.
10. No bolt-ons. Every new capability must fit the work loops, canvas grammar, placement law, and replication playbook.

## Product Loops

Every feature must map to one primary loop:

- Buy
- Receive
- Sell
- Collect/Pay
- Fulfill
- Recover/Close
- Decide
- Support

If a feature cannot map to one loop, it is likely infrastructure, a report/projection, or out of scope.

## Capability Exposure Classes

Every capability must be classified before implementation:

- `core_workflow`: daily row work that belongs in the grid or selection strip.
- `context`: supporting truth that belongs in the identity ribbon, context drawer, row history, or traceability ribbon.
- `control`: rare, powerful, risky, or admin action that belongs in command palette, row action menu, recovery, closeout, or owner controls.
- `projection`: generated view, dashboard, report, search result, suggestion, packet, or export.
- `infrastructure`: backend/service/internal support with no direct operator surface.
- `rejected`: old-platform implementation detail or concept that should not be built.

## Button Discipline

A visible button must earn its place by answering all four questions:

1. What operator moment needs this here?
2. Why is this the next likely action for the selected status?
3. Why is this not better as a row action, drawer tab, command palette action, or report/export?
4. Which Replication Playbook recipe governs it?

Default rule: one status-aware primary action per surface or selection state.

## Backend Discipline

Any mutation must be:

- typed in the command catalog,
- idempotent,
- role-gated,
- audited in the command journal,
- plain-language on failure,
- replay-safe,
- reversible or intentionally marked non-reversible,
- represented in the capability registry.

## Frontend Discipline

Any new frontend feature must:

- follow the design spec and replication playbook,
- cite the recipe used,
- reuse existing components before creating new ones,
- preserve grid-first work,
- avoid modal wizards for routine work,
- keep advanced tools out of the default line of sight,
- preserve keyboard reachability and focus order,
- avoid new UI libraries, fonts, routing, or CSS-in-JS.

## Drift Alarms

The product is drifting if:

- a non-daily task becomes a top-level route,
- a surface has several competing primary buttons,
- a backend command exists with no registry row,
- a core workflow has no row/grid surface,
- a connector writes ledgers directly,
- pricing can silently change confirmed history,
- recovery requires command archaeology for row-visible mistakes,
- operators need the command palette for routine work,
- customer exports can include internal fields,
- the app becomes slower than the spreadsheet for common work.
