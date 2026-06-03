# 01 — Product Overview, Personas & Roles, Navigation

> Developer-handoff "bible", section 1. Ground truth is the code at the paths cited.
> Verified against `src/` on 2026-06-02. File:line citations point at the authoritative source.

---

## 1. What TERP Operator Is

TERP Operator is a **self-hosted wholesale cannabis ERP operator console** — a brokerage operations cockpit that moves a business previously run from Apple Numbers into a web app *without* abandoning the spreadsheet-native operating model: dense grids, inline edits, explicit statuses, keyboard control, audited commands, and reversible postings.

- **Stack** (`README.md:7-13`): React 18 + Vite + TypeScript + AG Grid Enterprise + Zustand + TanStack Query + Tailwind on the client; Express + tRPC + Socket.io + Zod on the server; PostgreSQL 16 with Drizzle ORM + raw SQL migrations for data; server-side sessions with httpOnly cookies stored in Postgres for auth.
- **Command model** (`README.md:13`, `docs/agent-orientation/domain-concepts.md`): typed commands, client-stamped idempotency keys, server-side RBAC, a database command journal plus an append-only JSONL journal, and realtime Socket.io events on success. The Master Inventory counts **130 command-catalog commands** (`docs/handoff/00-MASTER-INVENTORY.md:12`); the per-command role map lives in `src/shared/commandCatalog.ts` (`commandMinRole`, line 336+).
- **Deployment** (`README.md`): a same-origin Express app serving the Vite build (DigitalOcean droplet profile via `docker-compose.prod.yml`).

The design constraint is explicit (`docs/agent-orientation/domain-concepts.md`): the user is an operator who refuses to give up the Numbers operating model — dense data, keyboard control, explicit statuses, reversible postings, no surprise side effects. Every primary screen is an AG Grid (≤8 columns), inline-editable, with status changes modeled as commands rather than silent transitions.

### The brokerage business model

TERP Operator runs a **two-sided wholesale brokerage**: product is bought from **vendors** (via purchase orders and physical intake), turned into inventory **batches/lots**, and sold to **customers** (via sales orders, fulfillment, and collection). Money flows both directions — collect from customers, pay vendors — and the brokerage also tracks **referees/brokers** who introduce counterparties and earn fees, plus **payment processors/connectors** as external money rails. The whole lifecycle is auditable and reversible because the operator is legally and financially accountable for every posting.

---

## 2. The 9 Work Loops

The capability registry organizes every capability under one of nine "work loops" (`docs/product/capability-registry.md:14`). These are the spine of the product: each top-level view and command family maps to one or more loops.

| Work loop | What happens | Primary views | Command families |
| --- | --- | --- | --- |
| **Buy** | Place and manage purchase orders with vendors. | Purchase Orders | CMD-PO, CMD-MATCHMAKING (supply side), CMD-BRANDS |
| **Receive** | Physical intake of product; batches verified/flagged/rejected; receipts posted; inventory state set. | Intake, Inventory, Photography | CMD-INTAKE, CMD-PO (receive), CMD-TAGS |
| **Sell** | Draft, price, confirm, and post customer sales orders; matchmaking; pricing risk. | Sales, Matchmaking, Orders, Clients | CMD-SALES, CMD-POSTING, CMD-MATCHMAKING, CMD-TAGS |
| **Collect/Pay** | Money in (customer payments, allocation, refunds) and money out (vendor bills/payouts, referee credits). | Payments, Vendor Payouts, Clients, Referees, Processors | CMD-PAYMENTS, CMD-VENDOR |
| **Fulfill** | Pick lists, weigh-and-pack, mark fulfilled, print labels, delivery windows. | Fulfillment, Pick Queue, Orders | CMD-FULFILLMENT, CMD-POSTING (allocate/delivery) |
| **Recover/Close** | Undo/reverse commands, correction journal entries, period lock/archive, backup restore preview. | Recovery, Closeout | CMD-RECOVERY, CMD-CLOSEOUT |
| **Decide** | Read-only intelligence: dashboard KPIs, reports, credit review, divergence. | Dashboard, Reports, Credit Review, Matchmaking | (queries router; credit engine) |
| **Support** | Cross-entity glue: global search, connector review, support packets, contact directory, relationship summaries. | Connectors, Contacts | CMD-CONNECTOR |
| **Infrastructure** | Plumbing that has no daily operator surface: media retention, contact merge detection, WS transport, server-side filter path, brand identity model. | Settings (partial) | — |

The same loops are the `WorkLoop` label set on the `users.work_loop` column and the client navigation groups (`Decide / Procure / Sell / Money / Admin` in `src/client/components/Shell.tsx:40-88`). The nav-group labels are a UI grouping; the registry's nine loops are the conceptual model.

---

## 3. Personas / Roles

There are **two distinct axes** of access control, and it is critical to keep them separate:

1. **Role** (`src/shared/types.ts:1`) — `'owner' | 'manager' | 'operator' | 'viewer'`. This is the **security tier**. It is the source of truth for *what commands a user may execute*. Enforced **server-side**.
2. **Work loop** (`src/client/accessPolicy.ts:3`) — `'owner' | 'manager' | 'sales' | 'intake' | 'warehouse' | 'operator' | 'viewer'`. This is a **navigation/persona lane** layered on top of role. It decides *which views and start-chips a user sees*. It is a **client-side convenience filter**, not a security boundary.

Plus a non-user persona:

3. **Photo upload token holder** — an unauthenticated photographer holding a batch-scoped bearer token. Not a `users` row; authorized only for the media upload endpoint.

### 3.1 Role tier (the security model)

The four roles are ranked (`src/server/rbac.ts:5-10`):

```
viewer: 0   operator: 1   manager: 2   owner: 3
```

`canRole(role, minimum)` returns `roleRank[role] >= roleRank[minimum]` (`src/server/rbac.ts:12-14`). Every command has a minimum-role requirement in `commandMinRole` (`src/shared/commandCatalog.ts:336+`), and the command bus enforces it via `assertCommandAccess(user, input.name)` (`src/server/services/commandBus.ts:481`), which throws `TRPCError({ code: 'FORBIDDEN' })` when the caller's role rank is below the command minimum (`src/server/rbac.ts:16-24`). The `role` column is `varchar(32) NOT NULL` on the `users` table (`src/server/schema.ts:31`); `work_loop` is `varchar(32)` nullable (`src/server/schema.ts:36`).

**RBAC enforcement points (cite these):**

- **Authentication gate**: `protectedProcedure` throws `UNAUTHORIZED` if no session user (`src/server/trpc.ts:140-141`). All command and most query routes are built on it.
- **Per-command authorization**: `assertCommandAccess` in the command bus (`src/server/services/commandBus.ts:481`); the single tRPC entry point is `commands.run` (`src/server/routers/commands.ts:6`), a `protectedProcedure` that delegates to `executeCommand`.
- **Generic role assertion** for non-command routes: `assertRole(user, minimum)` (`src/server/rbac.ts:26-32`).
- **Credit router role gates**: `requireRole('manager')` and `requireRole('owner')` build `managerOrOwnerProcedure` / `ownerOnlyProcedure` (`src/server/routers/credit.ts:44-45`; `assertRole` import line 5, tiers lines 29-30).
- **Document-receipt gates**: internal receipts call `assertRole` inside `getInternalReceipt` — operator role is rejected (`src/server/routers/queries.receipts.test.ts:89` documents the FORBIDDEN behavior).
- **Saved-filter global-scope gate**: only `owner`/`manager` may create or manage global filters (`src/server/routers/filters.ts:145, 287, 377`).
- **Inline owner-only thresholds in command handlers**:
  - Setting a credit limit above 1.5× the engine recommendation requires `owner` (`src/server/services/commandBus.ts:6023`).
  - `bulkRevertCustomersToEngine` requires `owner` (`src/server/services/commandBus.ts:6525`).
  - Vendor payouts and referee payouts require `manager`+ (`src/server/services/commandBus.ts:4465, 4470`).
- **HTTP-route middleware** (non-tRPC): `requireOperator` (`src/server/middleware/requireOperator.ts:14`) guards CSV export and media serve/delete; `requireOperatorOrUploadToken` (`src/server/middleware/requireOperatorOrUploadToken.ts:48`) guards the upload route; `requirePhotographyEnabled` (`src/server/middleware/requirePhotographyEnabled.ts:17`) feature-gates media routes.

> **Security note** (`docs/agent-orientation/domain-concepts.md`, "RBAC at a Glance"): client-side role checks (e.g. `canWrite = me.data?.role !== 'viewer'`, or reversal gated by `role === 'manager' || 'owner'` in `RowCommandHistoryDrawer.tsx`) are **convenience only**. Server command handlers are the real boundary.

#### Role capability summary (selected, from `commandMinRole`)

| Role | Can do (illustrative) | Representative command minimums |
| --- | --- | --- |
| **viewer** (rank 0) | Read-only. No commands (every command requires ≥ operator). | — |
| **operator** (rank 1) | Day-to-day workflow writes: create/update batches, POs, sales orders, log payments, picks, packs, tags, media upload. | `createBatch`, `createPurchaseOrder`, `createSalesOrder`, `confirmSalesOrder`, `postSalesOrder`, `logPayment`, `allocatePayment`, `createPickList`, `recordWeighAndPack`, `applyTags`, `uploadBatchMedia` (`commandCatalog.ts:337-393`) |
| **manager** (rank 2) | Everything operator does, plus approvals, cancellations, adjustments, money-out, reversals, mint/revoke upload tokens. | `approvePurchaseOrder`, `cancelPurchaseOrder`, `deleteBatch`, `adjustBatchQuantity`, `setInventoryStatus`, `cancelSalesOrder`, `applyClientCredit`, `unallocatePayment`, `refundPayment`, `approveVendorBill`, `recordVendorPayment`, `voidVendorPayment`, `reverseCommandById`, `mintPhotoUploadToken`, `revokePhotoUploadToken`, `markUserFeeCollected` (`commandCatalog.ts:339-445`) |
| **owner** (rank 3) | Everything, plus period control, backup restore, bulk credit-engine reverts, and the over-threshold credit-limit override. | `lockPeriod`, `archivePeriod`, `restoreFromBackupPoint`, `bulkRevertCustomersToEngine`, `setCustomerCreditLimit` above 1.5× recommendation (`commandCatalog.ts:403-407`; `commandBus.ts:6023, 6525`) |

### 3.2 Work-loop persona lanes (the navigation model)

The work loop is resolved per user by `workLoopForUser` (`src/client/accessPolicy.ts:76-85`):

1. No user → `null`.
2. `owner` role → always `'owner'` lane.
3. `manager` role → always `'manager'` lane.
4. `viewer` role → always `'viewer'` lane.
5. Otherwise, if `users.work_loop` is set and recognized (`sales | intake | warehouse | operator`) → use it.
6. Otherwise fall back to a legacy substring heuristic over name+email (`legacyWorkLoopFromSubstring`, lines 53-59): contains `"sales"`→sales; `"intake"`/`"receiv"`→intake; `"warehouse"`/`"fulfill"`/`"pack"`→warehouse; else operator. This heuristic must stay byte-for-byte equivalent to migration `0044_users_work_loop.sql` (documented at lines 31-52).

Each lane has a view allow-list (`viewsByLoop`, `accessPolicy.ts:9-17`) and a start-chip allow-list (`startsByLoop`, lines 19-27). `viewVisibleForUser` (lines 87-91) and `startVisibleForUser` (lines 93-97) filter the SideNav (`Shell.tsx:124`) and Keel start-chips (`Shell.tsx:206`).

| Lane | Views visible (`viewsByLoop`) | Start chips (`startsByLoop`) |
| --- | --- | --- |
| **owner** | All operator views + `settings`, `credit-review`, `closeout` (`managerPlusViews`) | sale, purchaseOrder, receiving, moneyIn, moneyOut, customerNeed, vendorSupply |
| **manager** | Same as owner (`managerPlusViews`) | Same as owner |
| **sales** | dashboard, reports, sales, matchmaking, orders, inventory, clients, payments, referees | sale, moneyIn, customerNeed |
| **intake** | dashboard, purchaseOrders, intake, matchmaking, inventory, fulfillment, vendors | purchaseOrder, receiving, moneyOut, vendorSupply |
| **warehouse** | dashboard, orders, inventory, fulfillment, **pick** | receiving |
| **operator** (default) | `defaultOperatorViews` — dashboard, reports, purchaseOrders, intake, sales, matchmaking, orders, payments, inventory, clients, vendors, fulfillment, referees, contacts, processors, photography, connectors, recovery | all 7 |
| **viewer** | dashboard, reports, purchaseOrders, sales, matchmaking, orders, payments, inventory, clients, vendors, fulfillment, referees | none (read-only) |

> Note the asymmetries: `pick` (Pick Queue) is only in the `warehouse` lane's nav list; `settings`/`credit-review`/`closeout` are manager/owner-only; `contacts`/`photography`/`connectors`/`recovery` appear for the generic `operator` lane but not the narrower `sales`/`intake`/`warehouse`/`viewer` lanes. Lane filtering is navigation chrome only — direct URL navigation still hits the route, where server-side RBAC governs any write.

### 3.3 Photo upload token persona

For the photographer mobile-upload flow (issue #73), a manager+ mints a batch-scoped bearer token via `mintPhotoUploadToken` (`commandCatalog.ts:444`, manager-min) and can revoke it (`revokePhotoUploadToken`, line 445). The token authorizes **only** `POST /api/upload/media`:

- `requireOperatorOrUploadToken` accepts either an operator+ session cookie OR an `Authorization: Bearer <token>` header (`src/server/middleware/requireOperatorOrUploadToken.ts:48`).
- The token is **batch-scoped** (`?batchId=` must match the token's batch), **upload-only** (wired into the upload route only — never read/serve/delete), and **never logged** (`requireOperatorOrUploadToken.ts` header docblock, lines ~30-46).
- Client entry point: `MediaUploadMobileRoute` at `/photography/mobile/:batchId` (`src/client/App.tsx:192`).

---

## 4. Route / Navigation Map

Two shells. The **desktop shell** (`AppContent` in `App.tsx:71-152`) renders SideNav + Keel + IdentityRibbon + ContextDrawer around an `<Outlet/>`. The **mobile shell** (`MobileShell`) has no SideNav/Keel and handles its own auth. Mobile viewports (`window.innerWidth < 768`) auto-redirect to `/mobile/dashboard` unless the user has set the `terp-prefer-desktop` localStorage flag (`App.tsx:79-88`).

### 4.1 Desktop routes (`App.tsx:171-198`)

| Path | View component | What it shows |
| --- | --- | --- |
| `/` | → redirect to `/dashboard` | — |
| `/dashboard` | `DashboardView` | Operator home: KPIs, work queue, health. Hotkey ⌘1. |
| `/reports` | `ReportsRouteShell` | Read-only aggregations (CAP-021): sales/inventory/vendors/payments/clients. |
| `/purchaseOrders` | `PurchaseOrdersView` | PO header + lines lifecycle (Draft→Finalized→Approved→Received). |
| `/intake` | `IntakeView` | Physical receipt queue; verify/flag/reject batches. Hotkey ⌘2. |
| `/sales` | `SalesView` | Customer sales workspace: draft/price/confirm/post. Hotkey ⌘3. |
| `/matchmaking` | `MatchmakingView` | Customer needs ↔ vendor supply board (CAP-029). |
| `/orders` | `OrdersView` | Open order book once confirmed. |
| `/payments` | `PaymentsView` | Money in: log/allocate/unallocate/refund. Hotkey ⌘4. |
| `/inventory` | `InventoryView` | Receipted lots: qty, status, location, price, photos. Hotkey ⌘5. |
| `/clients` | `ClientLedgerView` | Customer roster + balance + credit. Hotkey ⌘6 (Client Balances). |
| `/vendors` | `VendorPayablesView` | Vendor bills/payouts (create/approve/schedule/pay/void). |
| `/fulfillment` | `FulfillmentView` | Pick lists, weigh-and-pack, mark fulfilled, labels. |
| `/connectors` | `ConnectorsView` | Connector request review (approve/reject/route). |
| `/recovery` | `RecoveryView` | Search/undo past commands by entity (CAP-009/026). |
| `/closeout` | `CloseoutView` | End-of-period archival, control totals, blockers (CAP-020/025). |
| `/referees` | `RefereesView` | Referee/broker relationships + fee structures + credits. |
| `/processors` | `ProcessorsView` | Payment processors + fees. |
| `/credit-review` | `CreditReviewView` | Credit engine ops surfaces (CAP-032); manager+. Carries SideNav badge. |
| `/photography` | `MediaView` | Media/photography queue and batch media. |
| `/photography/mobile/:batchId` | `MediaUploadMobileRoute` | Token-auth photographer mobile uploader. |
| `/pick` | `PickView` | Warehouse pick queue (CAP-030 lane). |
| `/contacts` | `ContactsView` | Unified contact directory. |
| `/contacts/:id` | `ContactProfileView` | Single contact profile (customer/vendor/referee/processor tabs). |
| `/settings` | `SettingsView` | System settings; manager/owner lane only. |
| `*` (unknown) | → redirect to `/dashboard` | Catch-all. |

The active route also drives `activeView` state via `LocationSync`, using the first path segment (`App.tsx:59-69`).

### 4.2 SideNav groups (`Shell.tsx:40-88`)

Nav items are grouped into five labeled lanes, each filtered by `viewVisibleForUser`:

- **Decide**: Dashboard (⌘1), Reports
- **Procure**: Purchase Orders, Intake (⌘2), Inventory (⌘5), Photography
- **Sell**: Sales (⌘3), Matchmaking, Orders, Fulfillment, Pick Queue, Client Balances (⌘6), Credit Review
- **Money**: Payments (⌘4), Vendor Payouts, Referees, Contacts, Processors
- **Admin**: Recovery, Closeout, Connectors, Settings

A red badge appears on **Credit Review** showing the credit review queue total (`creditReviewQueue` query, manager/owner only, 60s refetch — `Shell.tsx:104-109, 131`).

### 4.3 Keel (global top bar, `Shell.tsx:185-294`)

The Keel hosts: Command Palette search (⌘K), Global Finder (⌘⇧F), a **Quick actions** start-chip menu (chips filtered by both `viewVisibleForUser` and `startVisibleForUser`, line 206), a health status chip (`queries.health`, 30s refetch), the user name, and Sign out (which clears persisted UI state — `Shell.tsx:194-204`). Start chips (`keelChips`, lines 90-96): New Sale, New PO, Receive, Money in, Money out.

### 4.4 Mobile routes (`App.tsx:160-168`)

`/mobile/*` under `MobileShell`: `dashboard` (`MobileDashboardView`), `inventory` (`MobileInventoryView`), `catalog` (`MobileCatalogView`), `payments` (`MobilePaymentsView`), `contacts` (`MobileContactsView`), `contacts/:id` (`MobileContactProfileView`); index → `dashboard`.

### 4.5 Canvas grammar feature flag

The Keel, IdentityRibbon, and ContextDrawer (the "canvas grammar" — CAP-006/007/008) render only when `CANVAS_GRAMMAR_ENABLED`, which is on by default and disabled by `VITE_CANVAS_GRAMMAR_ENABLED=false` (`App.tsx:52-54, 114-120`).
