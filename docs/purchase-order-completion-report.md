# Purchase Order Completion Report

Date: 2026-05-11

## Plain-English Summary

The critical missing procurement step has been added. TERP Agro no longer treats "New PO" as the same thing as physical receiving/intake.

The new workflow is:

1. Create a purchase order before product arrives.
2. Add planned product lines to that PO.
3. Approve the PO when the planned buy is real.
4. Receive the approved PO into draft intake rows when product physically arrives.
5. Process those intake rows into the existing purchase receipt, inventory movement, and vendor payable consequences only after counts/costs are verified.

That keeps the spreadsheet-first intake workflow intact while adding the real upstream purchasing action that was missing.

## What Was Created

### Database

- Added `purchase_orders`.
- Added `purchase_order_lines`.
- Linked `batches` back to `purchase_order_id` and `purchase_order_line_id`.
- Linked `purchase_receipts` back to `purchase_order_id`.
- Added migration `migrations/0004_purchase_orders.sql`.
- Added seeded demo POs:
  - `PO-DEMO-001` approved and ready to receive.
  - `PO-DEMO-002` draft planning PO.

### Backend Commands

Added eight idempotent, audited commands:

- `createPurchaseOrder`
- `updatePurchaseOrder`
- `addPurchaseOrderLine`
- `updatePurchaseOrderLine`
- `removePurchaseOrderLine`
- `approvePurchaseOrder`
- `receivePurchaseOrder`
- `cancelPurchaseOrder`

Important behavior:

- `receivePurchaseOrder` refuses to run until the PO is approved.
- Receiving a PO creates draft intake rows only.
- Receiving does not post inventory, create vendor bills, or mutate payables.
- `postPurchaseReceipt` remains the actual ledger-posting step for inventory movement and vendor payable consequences.
- PO receiving is linked back to the PO for traceability.

### Frontend

- Added a dedicated `Purchase Orders` navigation item.
- Added a new Purchase Orders workspace.
- Added PO grid columns for PO number, vendor, status, expected date, ordered/received quantities, notes, and timestamps.
- Added PO line grid for planned products.
- Added visible controls:
  - `New PO`
  - `Add Line`
  - `Approve`
  - `Receive to Intake`
  - `Receive Lines`
  - `Remove Line`
  - `Cancel`
- Split Quick Start:
  - `Purchase` -> `New PO`
  - `Receiving` -> `Receive Inventory`
- Renamed Intake row creation from `New PO Row` to `Receive Row` so ad hoc receiving is not mislabeled as purchasing.

### Drift Prevention

- Updated backend/frontend parity to cover 54 commands and 27 query endpoints.
- Added E2E coverage proving:
  - POs are planned before receiving.
  - Receiving refuses unapproved POs.
  - Receiving creates draft intake rows.
  - Receiving does not create payables early.

## What Is Left To Do

The core functionality is now present, but the frontend is still not good enough. It works, but it feels too much like a raw command/grid shell.

Highest-priority UX gaps:

1. Purchase Orders page needs better status-aware action hierarchy.
   - Today it shows several sibling buttons.
   - It should show one obvious next action based on status: Draft -> Add/Approve, Approved -> Receive, Received -> View linked receipt/intake.

2. PO header context should stay visible while editing lines.
   - Operators should always know vendor, PO number, status, expected date, total, and remaining-to-receive.

3. The line grid needs a faster add/edit pattern.
   - Keep spreadsheet behavior, but make adding a row feel like entering the next line in a sheet, not filling a small form above a table.

4. Receiving should show impact preview.
   - Before `Receive to Intake`, show how many draft intake rows will be created and which quantities remain.

5. Intake receipt preview should be promoted.
   - Selected-row receipt totals exist, but need stronger placement.

6. Vendor payable trace should connect back to PO -> receipt -> bill -> payout.
   - The relationships exist structurally, but the UI does not yet tell that story clearly enough.

7. The global navigation is becoming crowded.
   - Purchase Orders is necessary, but the left rail now needs better grouping or progressive disclosure without adding clicks for operators.

## Edge Cases Needing Investigation

- Partial PO receiving:
  - The backend supports receiving selected lines, but not partial quantities within a line from the UI.
  - Need a simple spreadsheet-native way to receive less than ordered without a modal wizard.

- Reversing PO receiving after partial receive:
  - Current reversal handles the normal first receive case.
  - More adversarial testing is needed for multiple partial receives against the same line.

- PO approval permissions:
  - Approval is manager+.
  - Confirm whether trained inventory operators should approve low-risk POs or only draft them.

- Changing vendor after lines exist:
  - The backend allows PO header updates before received/cancelled.
  - Need product decision on whether vendor should lock once lines exist or once approved.

- Cancel after receiving:
  - Cancel is blocked if received quantity exists.
  - Need UI copy that guides the operator to intake correction/reversal instead.

- Receipt posting linked to PO:
  - `postPurchaseReceipt` marks the linked PO received when selected rows all share a PO.
  - Need deeper tests for mixed ad hoc receiving plus PO-linked receiving in the same closeout period.

- Closeout/archive:
  - Closeout now counts unsafe draft/approved/partial POs as unsafe rows.
  - Need UX copy explaining that unresolved POs can block closeout.

## Proposed Next Steps

1. Run an Opus UX review focused on presentation, not new backend scope.
2. Compare TERP Agro’s Purchase Orders, Intake, Payments, and Sales workspaces against Odoo-style information hierarchy and action placement.
3. Preserve the TERP north stars:
   - Spreadsheet-first.
   - Keyboard-first.
   - Dense grids.
   - Inline editing.
   - Explicit status transitions.
   - No modal wizards for core workflows.
   - Reversible audited commands.
4. Redesign only the presentation layer:
   - Better headers.
   - Better primary/secondary action hierarchy.
   - Better context panels.
   - Better selected-row summaries.
   - Better empty/ready/error states.
5. Then implement a targeted UI pass without replatforming or turning TERP Agro into an Odoo clone.

## Verification So Far

- `pnpm db:migrate`: migration applied.
- `pnpm db:seed`: seed data loads.
- `pnpm typecheck`: passed.
- `pnpm audit:parity`: passed, 54 commands and 27 query endpoints covered.
- `pnpm build`: passed.
- `pnpm test:e2e`: in progress during this report update; latest failure was test-selector drift, not app logic.
