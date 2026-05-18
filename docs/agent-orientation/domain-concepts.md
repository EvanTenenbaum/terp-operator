# Domain Concepts

> The operator mental model, the entities behind the views, and the vocabulary the codebase uses. Read this when domain language in a ticket or grid column feels ambiguous.

## What This Product Is

TERP Operator is a **wholesale cannabis ERP operator console**. The user is an operator who used to run the business from Apple Numbers and refuses to give up that operating model: dense data, keyboard control, explicit statuses, reversible postings, no surprise side effects.

The whole product design follows from that constraint. If you find yourself reaching for cards, drawers-without-data, modal forms with five fields, or anything resembling a typical SaaS dashboard, you're probably drifting away from the model.

## Operator Workflow (the lifecycle the views follow)

1. **Purchase Orders** (`view: 'purchaseOrders'`) — operator places orders with vendors. Lines, finalize, approve, receive, cancel.
2. **Intake** (`view: 'intake'`) — physical receipt of product. Vendor batches arrive, get verified, flagged, or rejected.
3. **Inventory** (`view: 'inventory'`) — receipted batches become lots with quantities, statuses, locations, pricing, photos.
4. **Matchmaking** (`view: 'matchmaking'`) — customer needs ↔ vendor supply pairing.
5. **Sales** (`view: 'sales'`) — customer orders are drafted, priced, confirmed, posted.
6. **Orders** (`view: 'orders'`) — the open order book once confirmed.
7. **Fulfillment** (`view: 'fulfillment'`) — pick lists, weigh-and-pack, mark fulfilled, print labels.
8. **Payments** (`view: 'payments'`) — money in: log payment, allocate (FIFO / unapplied / to a specific invoice), unallocate, refund.
9. **Vendors** (`view: 'vendors'`) — vendor bills: create, approve, schedule payment, record payment, void.
10. **Clients** (`view: 'clients'`) — customer roster + balance + credit.
11. **Closeout** (`view: 'closeout'`) — end-of-period archival with control totals + artifacts.
12. **Recovery** (`view: 'recovery'`) — undo / search past commands by entity.
13. **Reports** (`view: 'reports'`) — read-only views over sales / inventory / vendors / payments / clients.

Two ancillary screens:
- **Referees** (`view: 'referees'`) — referee/broker relationships with fee structures.
- **Processors** (`view: 'processors'`) — payment processors / connectors.

The canonical list is the `ViewKey` union in `src/shared/types.ts`.

## Spreadsheet-Native Principles

- **Dense grids.** Every primary screen is an AG Grid. Cards and dashboards lose to grids unless there's a strong reason.
- **≤8 columns per grid.** Numbers-native operators scan horizontally. The audit (issue #31, commit `f5c33d8`) enforces this rule across the app. `docs/GRID_COLUMN_AUDIT.md` tracks compliance.
- **Inline edits.** AG Grid's `editable` columns are the default for operator-owned fields. Modal forms are an escape hatch, not the norm.
- **Explicit statuses.** A batch is `Draft`, `Ready`, `Live`, `Sold`, `Depleted`, `Rejected`, `Flagged`. Status changes are commands, not silent transitions.
- **Keyboard first.** Command Palette (Cmd+K), view switching (Cmd+1..N — see `Hotkeys.tsx`), AG Grid native shortcuts (Tab, Enter, Esc, Cmd+C/V).
- **Audited + reversible.** See `RowCommandHistoryDrawer` for per-row history; reversal is its own command.

## Key Entities

Read `src/server/db/schema.ts` for the authoritative shape. Below is what the operator means by each term.

### Batch (Inventory Lot)
A unit of product received from a vendor. Statuses progress Draft → Ready → Live → Sold/Depleted. Off-paths: Rejected, Flagged. Carries quantity, unit cost, COA references, photos.

### Purchase Order (PO)
Operator-placed order with a vendor. Lifecycle: Draft → Finalized → Approved → Received → Closed. Cancelled is a side-exit. Receipt creates batches.

### Sales Order
Customer order. Lifecycle: Draft → Priced → Confirmed → Posted → Fulfilled → Closed. Reserves inventory via `reserveInventoryForOrder`. Posting creates the invoice transaction-ledger row.

### Invoice / Transaction Ledger Row
The financial event a posted sales order creates. The system uses a transaction ledger (see `postTransactionLedgerRow`) rather than a separate invoices table.

### Payment
Money received from a customer. Has an allocation intent (`fifo`, `unapplied`, or `selected_invoice` — see `QuickLedgerGrid.tsx`). `allocatePayment` / `unallocatePayment` move money between invoices and unapplied balance. Issue #26 (DYN-H3): `logPayment` doesn't allocate even when `allocationIntent='fifo'` — there's an open audit ticket on this.

### Vendor Bill
Money owed to a vendor. Lifecycle: Created → Approved → Scheduled → Paid (or Voided).

### Pick / Fulfillment
Pick list created from a sales order. `recordWeighAndPack` captures actual weights. `markOrderFulfilled` closes the loop.

### Command
A typed mutation. There are 83 named commands in `src/shared/commandCatalog.ts` (the union type `CommandName`). Each command:
- Has a Zod payload schema enforced server-side.
- Carries a client-stamped idempotency key (`${name}-${uuid}`).
- Writes to the DB command journal + JSONL journal.
- Emits a Socket.io event after success.
- Can be reversed via `reverseCommandById` (when supported).

### Customer Need / Vendor Supply
The two sides of the matchmaking view. A customer's outstanding "I want X" is a need; a vendor's "I have Y" is a supply. The matchmaking view pairs them. Both have unconstrained status transitions today (issue #27, DYN-H4).

### Referee
A broker who introduced a customer or vendor. Tracked separately on the Referees view with fee structures (percentage, fixed, or hybrid — see `RefereeRelationshipDialog.tsx`).

### Connector / Processor
External integrations (payment processors, data connectors). Approve/reject via the connectors view.

## Workflow Vocabulary

| Term | Meaning |
|---|---|
| **Intake** | Physical receipt of product from a vendor. Different from the PO that ordered it. |
| **Ready** | Operator-set status meaning "this is good to advance to the next stage." Explicit, not implicit. |
| **Post** | Commit a financial transaction. Once posted, only a reversal command can undo it. |
| **Allocate / Unallocate** | Tie a payment to specific invoices (or back out). FIFO is the default intent. |
| **Reverse** | Run a reversal command against an existing command ID. Doesn't delete — appends a compensating entry. |
| **Closeout** | End-of-period archival. Produces control totals and CSV/JSONL/PDF artifacts. |
| **Recovery** | Search and undo past commands by entity. Distinct from per-row history. |
| **Matchmaking** | Pairing customer needs to vendor supply. |
| **Drawer** | The right-side contextual panel. State machine: closed → peek → standard → wide → focus → standard. See `uiStore.ts`. |
| **Quick Launch** | The Cmd+K palette's top-of-flow shortcut: `sale`, `purchaseOrder`, `receiving`, `moneyIn`, `moneyOut`, `customerNeed`, `vendorSupply`. |
| **Connector request** | An external integration awaiting operator approval. |

## RBAC at a Glance

User roles are inferred from `me.data?.role`:
- **viewer** — read-only. `canWrite = me.data?.role !== 'viewer'` is the standard gating idiom.
- **operator** — default read+write.
- **manager** / **owner** — elevated. Reversal is gated by `me.data?.role === 'manager' || me.data?.role === 'owner'` (see `RowCommandHistoryDrawer.tsx`).

Server-side RBAC is enforced in the command handlers — UI gating is convenience, not security.

## Where to Look When the Terminology Is New to You

1. **`src/shared/types.ts`** — `ViewKey`, `Role`, `GridRow`, drawer/entity types.
2. **`src/shared/commandCatalog.ts`** — every mutation name in the system (the authoritative list of "verbs").
3. **`src/server/db/schema.ts`** — table definitions = nouns.
4. **`src/server/routers/`** — what the server exposes.
5. **`src/client/store/uiStore.ts`** — the UI state machine (drawers, route history, palette, focus mode).
6. **Existing views in `src/client/views/`** — pick the closest neighbor and mimic.

When the doc you're reading uses a word that's not in this glossary, grep `src/shared/` and `src/server/db/schema.ts` before guessing — the codebase invents domain language sparingly.
