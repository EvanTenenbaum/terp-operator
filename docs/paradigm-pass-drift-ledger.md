# TERP Agro Paradigm Pass Drift Ledger

Date: 2026-05-11
Source proposal: `docs/unactioned-findings-atomic-proposal.md`
Purpose: prevent requirement drift while executing the row-native/operator-paradigm pass.

## Drift-Control Process Used

1. Source locked the work against the master proposal and its atomic backlog TA-001 through TA-048.
2. Implemented in slices matching the proposal order: row truth, start-work simplicity, sales/finder, intake/receipt, money/payables/dashboard, support/connector/fulfillment/media/closeout, then QA.
3. Ran typecheck after each major slice. Fixed every TypeScript failure before moving on.
4. Ran production build after UI/CSS changes. Fixed Tailwind token drift (`amber-*` classes were invalid for this project's custom `amber` token).
5. Ran migrations and seed against the local Postgres 16 Docker database.
6. Ran full Playwright E2E after reseeding. Fixed accessibility locator drift in Quick Start, then reran the full suite.
7. Re-ran typecheck, production build, reseed, and full Playwright after the final source-row candidate self-heal.
8. Ran a backend/frontend parity pass against the command catalog and query router, then added `pnpm audit:parity` to keep this from drifting.
9. Added an E2E parity-surface test that visits the operator pages where backend-only gaps were found and verifies the new controls are visible.

## Self-Heal Events

| Check | Failure found | Fix applied | Final proof |
| --- | --- | --- | --- |
| `pnpm typecheck` | `SalesView` referenced `moneyish` before it existed. | Added local helper. | Typecheck green. |
| `pnpm typecheck` | `QuickLedgerGrid` accepted nullable quick-launch mode. | Normalized `null` to `moneyIn`. | Typecheck green. |
| `pnpm build` | Tailwind custom `amber` token invalidated `amber-300` style classes. | Replaced amber scale classes with `border-amber`, `bg-amber/10`, and `text-amber`. | Production build green. |
| Playwright | Quick Start ARIA labels caused strict-mode locator collisions. | Renamed nested launcher group and tightened tests to exact launch-chip names. | Initial 9/9 E2E green; final suite is 10/10 after parity test. |
| Adversarial sales review | Unresolved sale line refusal did not name candidate source rows. | Added candidate source lookup in confirm/post refusal messages. | Typecheck/build/E2E green. |
| Backend/frontend parity | Several typed commands and query-backed records existed server-side without direct operator surfaces. | Added the missing surfaces and a parity script. | `pnpm audit:parity` reports 56 user-surfaceable commands, 1 internal command, and 27 queries covered after the purchase-order workflow was added. |
| Parity-surface E2E | New test revealed ambiguous button/text selectors and terse lot/expiration labels. | Tightened locators, increased one slow adversarial test timeout, and changed labels to `Lot code` / `Expiration`. | 10/10 E2E green. |

## Atomic Backlog Coverage

| ID | Status | Implementation evidence |
| --- | --- | --- |
| TA-001 | Done | `legacy_marker` on batches, raw closeout markers on orders/lines, UI columns in Intake/Inventory/Sales/Orders. |
| TA-002 | Done | `arrival_status`, `due_reason`, payable due explanations, vendor grid due reason. |
| TA-003 | Done | `validation_issues` projections; incomplete intake and sale lines persist as `needs_fix` and cannot post. |
| TA-004 | Done | Quick Start is four expandable chips: Sale, Receiving, Money In, Money Out. |
| TA-005 | Done | New Sale opens active customer workspace and sets active customer state. |
| TA-006 | Done | Customer workspace header includes balance, credit, tags, notes, orders, invoices. |
| TA-007 | Done | Editable draft sales-line grid supports unresolved customer requests. |
| TA-008 | Done | Finder is beside/below customer draft lines in Sales workspace. |
| TA-009 | Done | Finder token search spans source code, shorthand, notes, markers, price/range, vendor, tags. |
| TA-010 | Done | Finder rows show code/date/source/item/availability/ticket/price/marker/media and match reasons. |
| TA-011 | Done | Duplicate-source guard exists in finder and post command; unresolved post errors name candidate source rows. |
| TA-012 | Done | Universal selected-row footer with counts, numeric sums, issues, packet, history, relationship, issue actions. |
| TA-013 | Done | Intake selected-row receipt preview with server-confirmed total. |
| TA-014 | Done | Receipt preview blocks mixed/missing vendors, bad qty/cost, and invalid statuses with exact row messages. |
| TA-015 | Done | Quick Ledger draft grid in Payments. |
| TA-016 | Done | Negative money-in rows self-label buyer credit/down payment and preview impact. |
| TA-017 | Done | Row command history drawer from selected rows. |
| TA-018 | Done | Manager/owner reversal action from row history with before/after snapshot visible. |
| TA-019 | Done | Packed, Inv Posted, Pay/F-up, and raw closeout markers on sales/order surfaces. |
| TA-020 | Done | Posted intake quantity is not editable in grid; inventory quantity changes route through adjustment command. |
| TA-021 | Done | Inventory quantity adjustment supplies an explicit reason and writes inventory movement. |
| TA-022 | Done | Quick Ledger has FIFO/selected/unapplied impact preview using payment allocation preview. |
| TA-023 | Done | Vendor bills project `dueReason` and scheduled event fields. |
| TA-024 | Done | Dashboard has metric definitions, money bucket breakdown, and source-row drilldowns. |
| TA-025 | Done | Relationship drawer opens from selected customer/vendor/order/payment/bill-like rows. |
| TA-026 | Done | Command palette searches grouped entities and routes to matching surfaces. |
| TA-027 | Done | Relationship drawer has customer-safe copy without cost/margin/internal notes. |
| TA-028 | Done | Side navigation is role-adapted; viewer write surfaces are demoted/hidden. |
| TA-029 | Done | Viewer Quick Start and grid action buttons are hidden; command RBAC still enforces server-side. |
| TA-030 | Revised | Connector review defaults to Approve/Reject; routing/default assignment stays backend-internal rather than a user workflow. |
| TA-031 | Done | Connector selected-history panel and no-ledger-change safety note added. |
| TA-032 | Done | Fulfillment focuses on selected pick/line with pinned pack controls. |
| TA-033 | Done | Label formats are behind a compact print selector. |
| TA-034 | Done (baseline) | Connector request routing is traceable to fulfillment/payment/sales lanes; no direct ledger mutation remains enforced. Dedicated scan-to-pick matching should get deeper fixtures when connector payloads stabilize. |
| TA-035 | Done (baseline) | AG Grid range selection, fill handle, undo/redo, and TSV paste remain enabled; E2E keeps grid shell coverage. A 50-row paste fixture should be added when CI runtime budget allows. |
| TA-036 | Done | Shorthand and raw marker fields persist and remain editable for later vocabulary review. |
| TA-037 | Done | Media readiness appears in inventory and finder rows. |
| TA-038 | Done | Compact Photography Queue panel added under Inventory. |
| TA-039 | Done | Issue sidecar supports correction, invoice dispute via correction journal, payment refund, and client credit. |
| TA-040 | Done | Closeout unsafe rows count is clickable and routes to source intake blockers. |
| TA-041 | Done | Closeout adjustment controls are hidden behind an expandable Adjustment control. |
| TA-042 | Done | Closeout artifacts/control totals remain in closeout grid and period review. |
| TA-043 | Done | Layout preferences persist through Zustand storage: nav collapse, panel collapse, quick launch. |
| TA-044 | Done (baseline) | Dense AG Grid defaults retained for 500-row scanning; panel focus maximizes active grid height. A user-facing density toggle can be added if operators want multiple density presets. |
| TA-045 | Done | Command palette aliases cover files, ofc, iv, ticket, receipt, pay vendor, buyer credit, media. |
| TA-046 | Done | Finder saved slices: aging premium, consignment risk, value buyers, low stock, office-owned. |
| TA-047 | Done | Finder compare strip and customer-safe copy output added. |
| TA-048 | Done | Selected-row packet export added from universal selection footer. |

## Verification Evidence

Commands run successfully:

```bash
pnpm typecheck
pnpm audit:parity
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm test:e2e
```

Final verification results:

- TypeScript: green.
- Backend/frontend parity: 56 user-surfaceable commands, 1 internal command, and 27 query endpoints covered.
- Production build: green.
- Migration: `0003_row_native_paradigm.sql` applied.
- Seed: demo data regenerated against the new schema.
- Playwright: 10 passed.
- Docker Postgres: `terp-agro-postgres` healthy on port `55432`.

## Residual Watch Items

These are not blockers for this pass, but they are the next places to harden with deeper fixtures:

1. Finder ambiguity is now named at command refusal and candidates are visible in the finder; a future refinement can make sale-line-to-candidate binding fully inline.
2. Quick Ledger covers client payments, buyer credits, vendor payouts, transfers/corrections through existing typed commands; staff/referral payouts remain outside the current command domain.
3. Find/replace is deliberately limited to approved text fields and runs through correction journal; expanding it should require a new typed command if broader mutation scope is desired.
4. Viewer UI hides primary write actions, and server RBAC is authoritative; very deep custom inline controls should continue to be checked as new surfaces are added.
5. Performance acceptance for 500-row intake is architecture-supported by AG Grid, but this pass did not add a dedicated benchmark harness beyond build/E2E coverage.
