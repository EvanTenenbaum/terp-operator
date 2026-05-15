# TERP Agro Context Packet for Opus

Date: 2026-05-11

## Purpose

This file is the pointer packet for Opus. Evan will provide the actual prompt separately.

Use this packet to get oriented quickly, find the current app, inspect the code, review the research and audit artifacts, and understand what Codex most recently changed.

## Workspace

Repo path:

```bash
cd "/Users/evan/spec-erp-docker/Local Computer work etc/terp-agro"
```

Primary app:

- Frontend: React 18, Vite, TypeScript, AG Grid, Zustand, TanStack Query, tRPC client.
- Backend: Express, tRPC, Socket.io, Drizzle ORM.
- Database: PostgreSQL.
- Auth: session cookies, role-based access.
- Package manager: `pnpm`.

Demo users:

```text
owner@terpagro.local / terp-demo
manager@terpagro.local / terp-demo
intake@terpagro.local / terp-demo
sales@terpagro.local / terp-demo
viewer@terpagro.local / terp-demo
```

Useful commands:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm typecheck
pnpm audit:parity
pnpm test:e2e
pnpm build
```

## Current Product North Stars

- Spreadsheet-first operator console.
- Every core workflow is grid-based, not form-wizard based.
- Dense editable grids, inline validation, selected-row actions, copy/paste, sorting, filtering, grouping, and keyboard motion are central.
- Operators should feel continuity with their Apple Numbers workflow while gaining stronger auditability, automation, and recovery.
- Global starts must stay fast:
  - New Sale
  - New PO
  - Receive Inventory
  - Receive Money
  - Pay Vendor
- Status transitions must be explicit:
  - Draft
  - Ready
  - Approved
  - Posted
  - Needs Fix
  - Reversed
- Every write command is idempotent, audited, role-gated, and recorded in the command journal.
- Connectors never directly mutate ledgers.
- Customer-facing surfaces hide internal cost and margin.
- Operational data stays self-hosted.

## What Codex Most Recently Added

The major recent gap was purchase orders: the app previously treated "New PO" as a receiving/intake row, which skipped the actual purchasing step before physical product arrives.

That has been corrected.

Current PO flow:

1. `New PO` creates a purchase order before product arrives.
2. Operators add planned product lines.
3. Managers approve the PO.
4. Approved POs can be received into draft intake rows.
5. Intake posting remains separate: selected intake rows are later processed into purchase receipt, inventory movement, and vendor payable consequences.

Important: receiving a PO does not post inventory or payables. It creates draft intake rows only.

## Most Relevant Changed Files

Database and schema:

- `migrations/0004_purchase_orders.sql`
- `src/server/schema.ts`
- `src/server/seed.ts`

Backend command/query layer:

- `src/server/services/commandBus.ts`
- `src/server/routers/queries.ts`
- `src/shared/commandCatalog.ts`
- `src/shared/schemas.ts`
- `src/shared/types.ts`

Frontend shell and shared surfaces:

- `src/client/App.tsx`
- `src/client/components/Shell.tsx`
- `src/client/components/QuickStartBar.tsx`
- `src/client/components/CommandPalette.tsx`
- `src/client/components/OperatorGrid.tsx`
- `src/client/components/WorkspacePanel.tsx`
- `src/client/components/StatusPill.tsx`

Frontend views:

- `src/client/views/OperationsViews.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/SalesView.tsx`
- `src/client/components/InventoryFinderPanel.tsx`

Tests:

- `tests/e2e/operator-console.spec.ts`
- `tests/e2e/adversarial-command-contracts.spec.ts`
- `scripts/check-backend-frontend-parity.mjs`

## New Purchase Order Implementation Details

New tables:

- `purchase_orders`
- `purchase_order_lines`

New links:

- `batches.purchase_order_id`
- `batches.purchase_order_line_id`
- `purchase_receipts.purchase_order_id`

New commands:

- `createPurchaseOrder`
- `updatePurchaseOrder`
- `addPurchaseOrderLine`
- `updatePurchaseOrderLine`
- `removePurchaseOrderLine`
- `approvePurchaseOrder`
- `receivePurchaseOrder`
- `cancelPurchaseOrder`

New query surface:

- `queries.purchaseOrderLines`

Visible frontend surfaces:

- Side navigation: `Purchase Orders`
- Quick Start: `Purchase` chip with `New PO`
- Quick Start: `Receiving` chip with `Receive Inventory`
- Purchase Orders workspace:
  - PO grid
  - PO line grid
  - `New PO`
  - `Add Line`
  - `Approve`
  - `Receive to Intake`
  - `Receive Lines`
  - `Remove Line`
  - `Cancel`
- Intake workspace:
  - ad hoc receiving row button is now `Receive Row`
  - PO-linked intake rows show PO reference

## Research And Audit Artifacts

Read these to recover the product/workflow context:

- `docs/purchase-order-completion-report.md`
  - Plain-English summary of what was added, what remains, edge cases, and verification.

- `docs/frontend-interaction-surface-audit.md`
  - Frontend requirement capture system, vibe rubric, functional gaps, and product finder extraction.

- `docs/ease-of-use-frontend-pass.md`
  - Click-cost and ease-of-use audit from the last frontend pass.

- `docs/backend-frontend-parity-audit.md`
  - Backend command/query parity report. Current target is 56 user-surfaceable commands, 1 internal command, and 27 protected query endpoints.

- `docs/persona-journey-frontend-fit-audit.md`
  - Persona and journey fit review with specific UI/UX gaps.

- `docs/recording-paradigm-codex-audit.md`
  - Codex analysis of the screen-recording-derived operator paradigm.

- `docs/opus-recording-paradigm-ui-ux-review.md`
  - Prior second-pass review artifact based on the recording documentation.

- `docs/recording-paradigm-master-ui-ux-recommendations.md`
  - Master recommendation list synthesized from recording analysis.

- `docs/recording-analysis-evidence-packet-for-opus.md`
  - Evidence packet prepared from recording analysis.

- `docs/unactioned-findings-atomic-proposal.md`
  - Large backlog of not-yet-fully-actioned findings and implementation proposals.

- `docs/paradigm-pass-drift-ledger.md`
  - Drift ledger for previous frontend passes.

- `docs/workflow-gap-audit.md`
  - Earlier workflow gap audit.

## Current Functional Coverage Snapshot

Backend/frontend parity now reports:

```text
Backend/frontend parity OK: 56 surfaced commands, 1 internal command(s), and 27 query endpoints accounted for.
```

The current app includes:

- Dashboard KPIs, drilldowns, work queues, recent activity, health.
- Purchase Orders workspace.
- Intake grid with shorthand, ownership markers, receipt preview, CSV import, lot tools, ready/process actions.
- Sales workspace with customer context, sales orders, line grid, finder, suggestions, internal/customer-facing sheet output.
- Orders queue with posting, confirmation, fulfillment allocation, reprice, cancel.
- Payments workspace with logging, allocation, unallocation, discounts.
- Vendor Payables workspace with manual bill, approve, schedule, pay, void payout.
- Inventory workspace with quantity/price/lot edits and photography queue.
- Fulfillment workspace with pick lists, packing, labels, manifest behavior.
- Connector request review.
- Recovery tools: search, retry, reverse, correction journal, find/replace preview, support packet, backup preview.
- Closeout tools: preview, adjustment, lock, archive.
- Global command palette.
- Collapsible Quick Start, collapsible navigation, focus mode for panels.

## Known UX Issues To Keep In Mind

The app works, but the frontend still feels too raw.

Likely high-value frontend improvement areas:

- Too many sibling actions are shown at the same priority.
- Many screens do not make the next best action obvious.
- Context is split across grid rows, control bands, drawers, and panels.
- Purchase Orders has the correct workflow now, but it still feels like generic grid tooling.
- Payments and vendor payouts expose too many controls before the operator has selected the relevant row.
- Sales has both finder and suggestions; those should feel more unified.
- Intake receipt preview exists but should become more prominent for selected rows.
- Traceability exists but is not presented as clearly as PO -> intake -> receipt -> bill -> payout.
- Navigation is becoming crowded as more true operator surfaces are added.

## Edge Cases Needing More Investigation

- Partial receiving of a PO line by quantity, not just whole selected line.
- Multiple receives against one PO line.
- Reversal of PO receiving after some linked intake rows were posted.
- Mixed PO-linked and ad hoc receiving rows in one receipt.
- Whether vendor should lock after PO approval.
- Whether low-risk PO approval should be available to operators or manager+ only.
- How unresolved draft/approved/partial POs should block closeout and how the UI should explain that.
- How to keep focus mode useful without hiding global escape/start controls.

## Verification State

Confirmed in this latest run:

```text
pnpm db:migrate
# Applied 0004_purchase_orders.sql

pnpm db:seed
# Seeded TERP Agro demo data.

pnpm typecheck
# Passed.

pnpm audit:parity
# Backend/frontend parity OK: 56 surfaced commands, 1 internal command(s), and 27 query endpoints accounted for.

pnpm build
# Passed.
```

E2E state:

- `pnpm test:e2e` ran and the application-level PO contract test passed.
- The remaining failures encountered during the last interrupted run were Playwright selector ambiguity caused by new labels like `Purchase Orders` and `New PO`, not observed product logic failures.
- The test file has been patched to scope those selectors more precisely, but a final full rerun was interrupted and should be repeated before claiming final green.

Recommended first verification command for Opus:

```bash
pnpm db:seed && pnpm test:e2e
```

## Suggested Reading Order

1. `docs/purchase-order-completion-report.md`
2. `docs/backend-frontend-parity-audit.md`
3. `docs/frontend-interaction-surface-audit.md`
4. `docs/ease-of-use-frontend-pass.md`
5. `docs/persona-journey-frontend-fit-audit.md`
6. `docs/recording-paradigm-master-ui-ux-recommendations.md`
7. `src/client/views/OperationsViews.tsx`
8. `src/client/components/QuickStartBar.tsx`
9. `src/server/services/commandBus.ts`
10. `tests/e2e/adversarial-command-contracts.spec.ts`

## Compact Code Map

Frontend routing and shell:

- `src/client/App.tsx`
- `src/client/components/Shell.tsx`
- `src/client/store/uiStore.ts`

Global actions:

- `src/client/components/QuickStartBar.tsx`
- `src/client/components/CommandPalette.tsx`
- `src/client/components/Hotkeys.tsx`
- `src/client/components/useCommandRunner.ts`

Grid system:

- `src/client/components/OperatorGrid.tsx`
- `src/client/components/WorkspacePanel.tsx`
- `src/client/components/SelectionSummary.tsx`
- `src/client/components/IssueSidecar.tsx`
- `src/client/components/RelationshipDrawer.tsx`
- `src/client/components/RowCommandHistoryDrawer.tsx`

Core views:

- `src/client/views/DashboardView.tsx`
- `src/client/views/IntakeView.tsx`
- `src/client/views/SalesView.tsx`
- `src/client/views/OperationsViews.tsx`

Backend:

- `src/server/index.ts`
- `src/server/trpc.ts`
- `src/server/routers/queries.ts`
- `src/server/routers/commands.ts`
- `src/server/services/commandBus.ts`
- `src/server/services/metrics.ts`
- `src/server/services/csv.ts`
- `src/server/services/journal.ts`
- `src/server/schema.ts`
- `src/server/seed.ts`
- `src/server/migrate.ts`

Shared contracts:

- `src/shared/types.ts`
- `src/shared/schemas.ts`
- `src/shared/commandCatalog.ts`

## Important Caution

Do not assume the frontend is finished just because command/query parity is green.

Parity means the actions exist somewhere in the UI. It does not mean the operator experience is clear, fast, calm, or polished enough.

The most important next product work is improving how information, status, next actions, selected-row consequences, and related records are presented while preserving the grid-native workflow.
