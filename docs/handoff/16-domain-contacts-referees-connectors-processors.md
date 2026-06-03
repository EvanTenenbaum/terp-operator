# 16 — Domain: Contacts, Referees/Brokers, Connectors, Payment Processors

> Ground truth is the code. Citations are `file:line` at the commit current on `main`.
> Covers CAP-029 / CAP-033 / TER-1564 (contacts + appointments), CMD-VENDOR referee
> credit system, CMD-CONNECTOR inbound-request review, and CMD-CONNECTOR processor fees.

This domain is the **CRM + financial-counterparty backbone**. A single `contacts` row is
the identity hub; operational tables (`customers`, `vendors`, `referees`,
`payment_processors`, `users`) hang off it via a nullable, partial-unique `contact_id`
FK. Roles are boolean flags on the contact; the heavier financial data lives in the
per-role operational tables and is mutated through their own commands.

All write paths go through the CQRS command bus
(`src/server/services/commandBus.ts:runCommandInTransaction` dispatch table, the giant
`switch` at lines ~900–1081). Every command runs inside one DB transaction `tx` and
returns a `CommandResult` (`{ ok, commandId, affectedIds, toast }`). Roles/labels/reversal
dispositions live in `src/shared/commandCatalog.ts`. Payload Zod schemas live in
`src/shared/schemas.ts`.

---

## SECTION A — JOURNEY MAP

### A0. Mental model & where things live

| Concept | Hub | Operational table | Created by |
| --- | --- | --- | --- |
| Person/org identity + roles | `contacts` | — | `createContact` |
| Customer (buyer) | `contacts.is_customer` | `customers` | `createContact`/`addContactRole`/`linkContactToExistingEntity` |
| Vendor (seller) | `contacts.is_vendor` | `vendors` | same + `createVendor` (standalone) |
| Referee / broker | `contacts.is_referee` | `referees` (+ `referee_relationships`, `referee_credits`) | `createReferee` (flag-only via contact) |
| Payment processor | `contacts.is_processor` | `payment_processors` (+ `processor_fees`) | `createPaymentProcessor` |
| Contractor / employee | `contacts.is_contractor` / `is_employee` | (no op table; ledger = `contact_ledger_entries`) / `users` | `addContactRole` / `linkContactToUser` |
| Appointments | — | `appointments` (FK → contact) | `createAppointment` |
| Inbound connector requests | — | `connector_requests` | external/inbound (no create command in catalog) |

Desktop entry points: **Contacts** (`ContactsView.tsx`), **Contact profile**
(`ContactProfileView.tsx`), **Referees** (`RefereesView.tsx`), **Payment Processors**
(`ProcessorsView.tsx`), **Inbound Requests** (`OperationsViews.tsx:ConnectorsView`),
QuickLedger (processor fee creation). Mobile: `MobileContactsView`,
`MobileContactProfileView`.

---

### A1. Managing contacts

#### A1.1 Create a contact (happy path)
- UI: `ContactsView` → "New Contact" → `ContactCreateModal.tsx`. Form fields: name (required),
  email, phone, **roles** (multi-select checkbox, ≥1 required), and conditional
  role fields — `creditLimit` shows only when `customer` is checked, `termsDays` only
  when `vendor` (`ContactCreateModal.tsx:140-173`).
- Submit blocked client-side unless `name.trim()` and `roles.length > 0`
  (`ContactCreateModal.tsx:32,185`). Runs `createContact`.
- Backend (`commandBus.ts:6698`): inserts the `contacts` row with the six role flags
  derived from `parsed.roles`. **Side effects** — if `customer` role: also inserts a
  `customers` row (creditLimit money-scaled, balance 0, linked via `contactId`). If
  `vendor` role: inserts a `vendors` row (`termsDays` default 14, `consignmentDefault`).
  `referee`/`processor`/`contractor`/`employee` set **only the flag** — their richer
  operational rows are created via their own commands (`commandBus.ts:6762-6764`).
- `affectedIds` returns `[contactId, customerId?, vendorId?]`. Toast: `Contact "<name>" created.`

**Branches / edge cases**
- Multi-role at creation (e.g. customer + vendor) creates a contact **plus both** op
  rows in one transaction → instant dual-role.
- Email is validated (`z.string().email()`) — a malformed email rejects the whole
  command (atomic; nothing inserted).
- `createContact` disposition is **terminal** (`commandCatalog.ts:590`): cannot be
  reverse-unbuilt; use `archiveContact` to deactivate.

#### A1.2 Add a role to an existing contact
- `addContactRole` (`commandBus.ts:6897`). Sets the matching flag; for `customer`/`vendor`
  it **lazily creates** the op row only if one does not already exist for that
  `contactId` (guards at `6933-6970`). Idempotent on the op-row insert.
- Role: `manager` (`commandCatalog.ts:459`). Disposition terminal.

#### A1.3 Link a contact to an existing entity / user
- `linkContactToExistingEntity` (`commandBus.ts:6975`): connects a contact to a pre-existing
  `customer`/`vendor`/`referee`/`processor` row. **Invariant guard**: rejects if that
  entity already has a `contactId` ("This <entity> is already linked to a contact.")
  and also sets the corresponding role flag on the contact. Returns `[contactId, entityId]`.
  Role `manager`.
- `linkContactToUser` (`commandBus.ts:7027`): connects a contact to a system `users` row,
  sets `is_employee = true`. Guards: user must exist and must not already be linked.
  Role `owner` (highest sensitivity — `commandCatalog.ts:461`).
- Both rely on partial-unique indexes (`*_contact_id_unique_idx`, migration 0054:104-108)
  so the 1-contact-per-entity invariant is also DB-enforced; the in-handler check gives
  a friendly error before the constraint fires.

#### A1.4 Merge candidates (dedup review)
- Surfaced as a count badge via `mergeCandidateCount` (`queries.ts:2106`) — counts rows
  where `reviewed = false AND dismissed = false`.
- Rows are seeded by **migration 0054** during the contacts backfill: name-match across a
  customer/vendor split (`name_match`, migration 0054:162-167) and email-match across any
  pair (`email_match`, 0054:170-180). There is **no runtime detector** — candidates are a
  migration artifact, not continuously regenerated.
- **Known gap**: there is no merge *action* UI. `ContactsView.tsx:25-28` explicitly TODOs
  this; the count exists but operators cannot execute a merge in-app yet. Handoff item.

#### A1.5 Archive a contact (with open-work guards)
- `archiveContact` (`commandBus.ts:6789`), role `manager`, disposition **terminal**.
- Preconditions: contact exists and is currently `active` (else "already archived").
- **Per-role open-work guards** (all must pass) — each uses a raw `pool.query`:
  - Customer: blocks if any `invoices` with status `open`/`partial` (`6800-6815`).
  - Vendor: blocks if any `vendor_bills` not in `('paid','void','cancelled')` (`6817-6832`).
  - Referee: blocks if any `referee_relationships` still `active` (`6834-6849`).
  - Processor: blocks if any `processor_fees` with `user_fee_status != 'collected'` (`6851-6866`).
  - Contractor/employee: blocks if `SUM(contact_ledger_entries.amount) > 0` — i.e. money
    still owed to them (`6868-6881`). Sign convention: positive = owed *to* the contact.
- On success: sets `active=false`, `archivedAt`, `archivedBy` (session user), `archivedReason`.
- Archived contacts disappear from `contactDirectory` (which filters `WHERE c.active = true`,
  `queries.ts:1815`).
- **Error states**: each guard throws a specific message ("Cannot archive: customer has
  open or partially-paid invoices." etc.) and aborts the transaction — nothing changes.
- **Recovery**: not reversible. Re-create a fresh contact if archiving was a mistake.

#### A1.6 Update a contact
- `updateContact` (`commandBus.ts:6769`), role `operator`, disposition **offsettable**
  (re-run with prior values to undo, `commandCatalog.ts:591`). Patch-style: only
  provided fields are written; `updatedAt` bumped. Throws "Contact not found." if the id
  misses.

#### A1.7 Contact profile (read)
- `ContactProfileView.tsx` drives off `contactProfile` (`queries.ts:1856`). Tabs are
  role-gated: Customer/Vendor tabs only when the flag is set; Money tab when any
  money-bearing role; Settings tab when referee/processor/employee; Overview/Appointments/
  History always (`ContactProfileView.tsx:35-43`).
- `contactProfile` fan-outs (Promise.all) only the op-table queries whose role flag is
  true, and returns enriched stats (lifetime orders/revenue, open invoices + oldest-days,
  vendor bill/PO rollups) plus `upcomingAppointmentCount`. Explicit column lists guard
  against leaking sensitive fields (GH #315 — referee `tax_id`/`payment_details`, processor
  fee config).
- Header (`ContactProfileHeader.tsx`) renders role pills, customer/vendor KPIs, and
  **risk signals**: over-credit-limit (danger), 30+ day overdue (warning), upcoming
  appointment count (info) at `:24-33`. Write actions hidden for `viewer` role.

---

### A2. Appointments lifecycle

State machine on `appointments.status`: `scheduled` → (`completed` | `cancelled`),
default `scheduled`.

- **Create** (`createAppointment`, `commandBus.ts:7044`, role `operator`): validates the
  contact exists (anchor invariant), stores `startsAt`/`endsAt`, `appointmentType`
  (`meeting|call|delivery|pickup|vacation|job|other`), `createdBy = userId`. Zod
  `.refine` enforces `endsAt > startsAt` (`schemas.ts:242-245`). UI: `AppointmentModal.tsx`
  converts local datetime to UTC ISO before sending.
- **Update** (`updateAppointment`, `:7069`): **only `scheduled` appointments are
  editable** — throws "Only scheduled appointments can be updated." otherwise. Patch-style.
- **Cancel** (`cancelAppointment`, `:7096`): idempotent if already `cancelled` (returns ok);
  **blocks** cancelling a `completed` appointment. Appends `[Cancelled] <reason>` to notes,
  preserving operator-authored prior notes (does not clobber).
- **Complete** (`completeAppointment`, `:7127`): idempotent if already `completed`;
  **blocks** completing a `cancelled` one. Appends `[Completed] <note>` to notes.
- **Read** (`contactAppointments`, `queries.ts:1991`): splits **upcoming**
  (`starts_at > NOW() AND status='scheduled'`, ASC) vs **past** (`starts_at <= NOW()` OR
  status in completed/cancelled, DESC, limit 50).
- UI (`ContactAppointmentsPanel.tsx`): upcoming rows expose Edit / Complete / Cancel;
  refetches after each command. Past rows are read-only with a status pill.

**Edge cases**: an appointment whose `starts_at` is in the past but still `scheduled`
falls into "past" by the query's OR clause yet remains editable per the command guard —
the two definitions of "past" differ intentionally (read view vs. write gate).

---

### A3. Dual-role (customer + vendor) relationships

- A contact with both `is_customer` and `is_vendor` is **dual-role**. The
  `RelationshipDrawer.tsx` renders a "Dual-role" pill and a **Net position** =
  `customerOpen − vendorOpen` (owed-to-us minus we-owe-them), colored green/red
  (`RelationshipDrawer.tsx:21-22,69-76`). Powered by `relationshipSummary`
  (`queries.ts:922`) which pulls orders, invoices, payments, POs, bills, vendor payments,
  ledger, credit overrides, disputes, receipts, and recent commands.
- `relationshipSummary` will infer the vendor side by **name match** when only a customer
  id is supplied (`queries.ts:924`) — a heuristic bridge for legacy data where the same
  business existed as separate customer and vendor rows.
- On the contact profile, `ContactMoneyPanel.tsx` shows a dual-role band (Receivable /
  Payable / Net favorable-or-unfavorable) and, for contractor/employee, the direct
  `contact_ledger_entries` running-balance table.
- **External-safe status**: `RelationshipDrawer.copySafeStatus` produces a redacted,
  copy-pasteable summary (vendor-only vs customer view) for sharing without leaking
  internal credit data.

---

### A4. Referee / broker relationships & credits (CMD-VENDOR)

Referees are brokers who earn a **credit** (fee) when a transaction they introduced
posts. Credits accrue, can be partially or fully paid out (FIFO), and can be voided.

#### A4.1 Create / edit a referee
- `createReferee` (`refereeCommands.ts:247`): name + optional email/phone/taxId/
  paymentMethod (default `check`)/paymentDetails/notes. Role `manager`. The standalone
  RefereesView create flow uses `prompt()` (`RefereesView.tsx:54-66`).
- `updateReferee` (`refereeCommands.ts:277`): patch-style; can toggle `active`.
  UI `RefereeDialog.tsx`.

#### A4.2 Referee relationship (fee contract to an entity)
- `addRefereeRelationship` (`refereeCommands.ts:311`): links a referee to a
  `customer` or `vendor` (`entityType`/`entityId`) with a fee config (`feeType`
  percentage|fixed|hybrid, `feePercentage`, `feeFixedAmount`, `applyByDefault`,
  `effectiveFrom`). **Before inserting it deactivates any existing active relationship
  for the same referee+entity** (sets `active=false`, `effectiveUntil=now`) so only one
  is live — backed by a partial unique index `referee_relationships_active_unique`.
- `updateRefereeRelationship` (`:365`) / `deactivateRefereeRelationship` (`:396`,
  sets `active=false`, `effectiveUntil=now`). All role `manager`.
- UI: `RefereeRelationshipDialog` (add), `UpdateRefereeRelationshipDialog`,
  `DeactivateRefereeRelationshipDialog`; listed in `RefereeRelationshipsList.tsx` which
  shows **only active** relationships (the `reference` query filters `WHERE rr.active`),
  so deactivated ones vanish from this list.
- **Combined create-referee-and-relationship drawer** (`AddRefereeRelationshipDrawer.tsx`,
  used from the vendor/PO flow): two-step — optionally `createReferee`, then
  `addRefereeRelationship`. It has explicit **partial-failure recovery**: if step 1
  succeeds but step 2 fails, it stashes `pendingRefereeId` so a retry skips re-creating
  the referee (no duplicate), shows an amber recovery banner, and switches the button to
  "Complete setup" (`:80-130, 202-207`).

#### A4.3 Credit accrual (automatic, on transaction post)
- Accrual is **not** a standalone command — it fires inside PO finalize / SO post when the
  payload carries `refereeRelationshipId` and `logRefereeCredit !== false`
  (`commandBus.ts:1813-1827` for PO, `:3575-3586` for SO), calling
  `accrueRefereeCredit` (`refereeCommands.ts:58`).
- `calculateRefereeCredit` (`:25`): percentage → `total × pct/100`; fixed → fixed amount;
  hybrid → `total × pct/100 + fixed`. Uses `decimal.js`, rounds to 2dp. Rejects negative
  totals (BLOCKER FIX M3, `:31`).
- Insert into `referee_credits` with `status='accrued'`, snapshotting the fee config and
  `transactionTotal` at accrual time. The unique index
  `referee_credits_transaction_unique` (type+id) makes accrual idempotent per transaction.
- The referee `balance` and `lifetime_earned` are **never written by app code** — a DB
  trigger maintains them (see Section B).

#### A4.4 Payout (FIFO, partial-payment aware)
- Triggered via QuickLedger `postTransactionLedgerRow` with `entityType='referee'`,
  `direction='paying'` (`commandBus.ts:4469-4503`). **Requires manager/owner role**.
  Creates a correction journal entry for the cash movement, then
  `processRefereePayout` (`refereeCommands.ts:140`).
- `processRefereePayout`: validates `amount <= balance` and `amount > 0`; pulls
  `accrued`+`partially_paid` credits ordered by `createdAt` (FIFO); applies the payment
  across them, setting each to `partially_paid` or `paid` and stamping
  `paidViaTransactionId`/`paidAt`. Verifies the exact amount could be applied (±$0.01)
  else throws.
- **Error states**: over-balance payout → "Cannot pay $X. Referee balance is only $Y.";
  zero/negative → "Payout amount must be greater than zero."

#### A4.5 Void a credit
- `voidRefereeCredit` command (`refereeCommands.ts:422` → helper `:118`): sets
  `status='voided'`, `voidedAt`, `voidedReason`. **Reversible** disposition
  (`commandCatalog.ts:559`) — restores accrued status / balance on reverse.
- UI: `RefereeCreditsList.tsx` shows a Void button **only** for `status==='accrued'`
  rows (`:73`); `VoidRefereeCreditDialog.tsx` **requires a reason** (client validation at
  `:27`). Voided rows render at 50% opacity with the reason on hover.
- Voiding flips the credit out of the trigger's balance window → balance/lifetime
  recompute automatically.

---

### A5. Connector (inbound) request review (CMD-CONNECTOR)

Inbound requests from external/connector sources land in `connector_requests` (status
`open`). Operators triage them in **Inbound Requests** (`OperationsViews.tsx:ConnectorsView`,
`:2421`). **There is no create command** in the catalog — rows arrive via ingestion/seed.

**Safety model (critical):** reviewing a connector request performs **no ledger
mutation**. `reviewConnectorRequest` (`commandBus.ts:4320`) only updates the request's
`status`, `routedTo`, `operatorNotes`, and appends to `reviewHistory`. The table even
carries a column `safety_note` defaulting to *"No ledger change until an operator posts
the routed row."* (schema `:485`). Routing merely **reassigns** the request to a team;
an operator must then separately post the real ledger row through the normal command
flow. This isolates untrusted inbound payloads from financial state.

**Three review actions** (all share `reviewConnectorRequest`):
- `approveConnectorRequest` → status `approved`. `routedTo` defaults to existing value or
  `routeFromRequest(requestType)` heuristic (`:4328`, `:7380` — keyword map: payment→
  payments, fulfillment/bag/scan→fulfillment, intake/vendor→intake, else sales).
  Disposition **reversible** (returns to open review).
- `rejectConnectorRequest` → status `rejected`. Disposition **terminal** — rejected stays
  rejected; create/approve a new request instead (`commandCatalog.ts:532`).
- `routeConnectorRequest` → status `routed`; **requires** `routedTo`
  (`requiredString(payload.routedTo)`, `:4328`). Disposition **reversible** — described as
  internal reassignment only (`commandCatalog.ts:533`). All three are role `operator`.

**UI behavior** (`ConnectorsView`):
- **Persistent safety banner** for external sources: when the selected request's `source`
  is not in `('internal','web','phone')`, an amber `role="alert"` banner shows
  *"⚠ External connector request — verify source identity before routing or approving."*
  (`:2426, 2434-2440`).
- **Route is the primary action**; Approve/Reject secondary (`:2467-2485`). The Route
  button is disabled until `routedTo` is non-empty, with a guiding tooltip (`:2470-2471`).
- A **ConnectorTimeline** (`:2492`) renders the review history (Received → each history
  entry → current status), capped at 5 steps, colour-coded (rejected = blocked tone).
- Open connector requests also surface in the global `workQueue` under lane "Connector"
  (`queries.ts:620-624`) and are a closeout blocker ("openConnectors", `:2820`).

**Edge cases**: `reviewHistory` is append-only JSONB capturing `{status, actorId,
actorName, at, note, routedTo}` per action — full audit trail. `restoreFromBackupPoint`
can reset connector requests back to `status='open', routedTo=null` (`:4959-4960`).

---

### A6. Payment processor setup & fee tracking (CMD-CONNECTOR / processor fees)

Processors handle crypto/check/wire payments whose fees are **split between the user
(Terp Operator) and the processor**. See also `docs/features/payment-processors.md`.

#### A6.1 Create a processor
- `ProcessorsView` → "New Processor" uses `prompt()` to gather name, type, feeType, and
  splits (`ProcessorsView.tsx:71-97`), then `createPaymentProcessor`
  (`processorCommands.ts:104`, role `manager`).
- **Validation** (`:109-132`): feeType-specific required fields; non-negative fee/split;
  and **`userSplit + processorSplit` must sum to 100%** using a tolerance check
  (`Math.abs(sum-100) >= 0.01` rejects — GH #289 float-safety fix, `:128-131`).

#### A6.2 Fee calculation (canonical formulas)
- `calculateProcessingFee(amount, processor)` (`processorCommands.ts:18`): percentage /
  fixed / hybrid, decimal.js, 2dp; rejects negative amount and missing config.
- `splitProcessingFee(feeTotal, userSplitPercent)` (`:62`): `userShare = feeTotal ×
  pct/100`; `processorShare = feeTotal − userShare` (so rounding never loses a cent).
  Rejects pct outside 0–100.
- `calculateCustomerCredit(gross, processorShare, userShare)` (`:84`): net the customer is
  credited on cash-in = `gross − processorShare − userShare`.
- These run **client-side too** in QuickLedger (`QuickLedgerGrid.tsx:84-99,482-499`):
  the operator picks a processor, sees the calculated fee / user-split / net-to-customer
  (all overridable), and the `processor_fees` row is created through the QuickLedger
  ledger-post path. The server helpers are the source-of-truth math.

#### A6.3 Fee lifecycle & tracking
- Each `processor_fees` row tracks two independent statuses:
  - `user_fee_status`: `collectible` (default) → `collected`.
  - `processor_fee_status`: `paid` (default — processor already deducted) ↔ `unpaid`.
- `markUserFeeCollected` (`processorCommands.ts:164`): sets user status `collected` +
  timestamp; verifies the row exists. **Reversible** (`commandCatalog.ts:561`).
- `updateProcessorFeeStatus` (`:210`): toggles paid/unpaid (validates the enum), stamps/
  clears `processorFeePaidAt`. **Terminal** disposition. Both role `manager`.
- `updateProcessor` (`commandBus.ts:7178`, role **owner**): patch processor config; numeric
  fields preserved as strings for the `numeric(p,s)` contract.
- UI: `ProcessorDetailPanel.tsx` shows four roll-up KPIs (total processed, user
  collectible/collected, processor unpaid) from `processorWithTotals` (`queries.ts:1380`);
  `ProcessorFeesGrid.tsx` lists fees with user/processor status filters, a "Mark
  Collected" button (only when collectible) and a paid/unpaid Toggle, plus a 200-row
  truncation banner.

---

## SECTION B — BACKEND SPEC

### B1. Command catalog reference (this domain)

| Command | Handler (file:line) | Role | Reversal disposition | Core effect |
| --- | --- | --- | --- | --- |
| `createContact` | commandBus.ts:6698 | operator | terminal | insert contact (+customer/+vendor op rows by role) |
| `updateContact` | commandBus.ts:6769 | operator | offsettable | patch contact |
| `archiveContact` | commandBus.ts:6789 | manager | terminal | soft-delete after per-role open-work guards |
| `addContactRole` | commandBus.ts:6897 | manager | terminal | set role flag (+lazy op row) |
| `linkContactToExistingEntity` | commandBus.ts:6975 | manager | n/a | link contact↔customer/vendor/referee/processor |
| `linkContactToUser` | commandBus.ts:7027 | owner | n/a | link contact↔user, set is_employee |
| `createAppointment` | commandBus.ts:7044 | operator | n/a | insert appointment (contact anchor) |
| `updateAppointment` | commandBus.ts:7069 | operator | n/a | patch (only `scheduled`) |
| `cancelAppointment` | commandBus.ts:7096 | operator | n/a | status→cancelled (idempotent; blocks completed) |
| `completeAppointment` | commandBus.ts:7127 | operator | n/a | status→completed (idempotent; blocks cancelled) |
| `createVendor` | commandBus.ts:1393 | operator | terminal | insert vendor (+auto default brand); name-dedup ilike |
| `updateVendor` | commandBus.ts:7157 | operator | — | patch vendor |
| `createReferee` | refereeCommands.ts:247 | manager | terminal | insert referee |
| `updateReferee` | refereeCommands.ts:277 | manager | terminal | patch referee (incl. active) |
| `addRefereeRelationship` | refereeCommands.ts:311 | manager | terminal | deactivate prior active + insert new |
| `updateRefereeRelationship` | refereeCommands.ts:365 | manager | terminal | patch relationship |
| `deactivateRefereeRelationship` | refereeCommands.ts:396 | manager | terminal | active=false, effectiveUntil=now |
| `voidRefereeCredit` | refereeCommands.ts:422 | manager | reversible | status=voided + reason (trigger recomputes balance) |
| `approveConnectorRequest` | commandBus.ts:4320 (via reviewConnectorRequest 'approved') | operator | reversible | status=approved; routedTo heuristic |
| `rejectConnectorRequest` | reviewConnectorRequest 'rejected' | operator | terminal | status=rejected |
| `routeConnectorRequest` | reviewConnectorRequest 'routed' | operator | reversible | status=routed; routedTo required |
| `createPaymentProcessor` | processorCommands.ts:104 | manager | terminal | insert processor (split-sum=100 guard) |
| `updateProcessor` | commandBus.ts:7178 | owner | — | patch processor config |
| `markUserFeeCollected` | processorCommands.ts:164 | manager | reversible | user_fee_status=collected |
| `updateProcessorFeeStatus` | processorCommands.ts:210 | manager | terminal | processor_fee_status paid/unpaid |

(Referee payout has **no own command** — it runs through `postTransactionLedgerRow`
entityType=referee; processor fee *creation* runs through the QuickLedger ledger-post
path, not a dedicated command.)

---

### B2. Table column docs

#### `contacts` (schema.ts:1198; migration 0054)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | varchar(180) NOT NULL | canonical/legal name |
| display_name | varchar(180) | optional alias |
| phone / secondary_phone | varchar(40) | |
| email | varchar(240) | indexed (`contacts_email_idx`, migration 0070 / GH #296) |
| address | text | |
| company_name | varchar(180) | |
| contact_kind | varchar(20) NOT NULL default `individual` | individual\|business |
| preferred_contact_method | varchar(20) NOT NULL default `any` | |
| notes | text | |
| tags | text[] NOT NULL default `{}` | |
| is_customer / is_vendor / is_referee / is_processor / is_contractor / is_employee | boolean NOT NULL default false | role flags |
| active | boolean NOT NULL default true | false = archived |
| archived_at | timestamptz | |
| archived_by | uuid → users.id | |
| archived_reason | text | |
| created_at / updated_at | timestamptz | |
Indexes: name, updated_at (keyset pagination), partial active (GH #341), email.

#### `appointments` (schema.ts:1232)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| contact_id | uuid NOT NULL → contacts.id ON DELETE CASCADE | anchor |
| title | varchar(240) NOT NULL | |
| description | text | |
| starts_at | timestamptz NOT NULL | |
| ends_at | timestamptz | optional; must be > starts_at (Zod) |
| appointment_type | varchar(40) NOT NULL default `meeting` | meeting/call/delivery/pickup/vacation/job/other |
| status | varchar(32) NOT NULL default `scheduled` | scheduled/completed/cancelled |
| location | text | |
| created_by | uuid → users.id | |
| notes | text | cancel/complete annotations appended here |
| created_at / updated_at | timestamptz | |
Indexes: contact_id, starts_at.

#### `contact_ledger_entries` (schema.ts:1251) — flat append-only ledger for contractors/employees/standalone contacts
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| contact_id | uuid NOT NULL → contacts.id CASCADE | |
| kind | varchar(48) NOT NULL | e.g. payment_out, adjustment |
| amount | numeric(12,2) NOT NULL | **signed**: + = owed to contact, − = paid out (`postTransactionLedgerRow` `:4401`) |
| method | varchar(32) | |
| reference | varchar(120) | |
| note | text | |
| command_id | uuid | provenance |
| created_at | timestamptz | |
Running balance computed at read time via window `SUM(amount) OVER (...)` (`queries.ts:2037`);
not stored. No invoice allocation, no `client_ledger_entries` touch.

#### `contact_merge_candidates` (schema.ts:1266; migration 0054:81)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| contact_a_id / contact_b_id | uuid NOT NULL → contacts.id CASCADE | the duplicate pair |
| match_reason | varchar(80) NOT NULL | `name_match` \| `email_match` |
| reviewed | boolean default false | |
| dismissed | boolean default false | |
| merged_into | uuid → contacts.id | set when (eventually) merged |
| created_at | timestamptz | |
Unique index on `(contact_a_id, contact_b_id)`.

#### `referees` (schema.ts:747; migration 0014:10)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | varchar(180) NOT NULL | |
| email / phone / tax_id | varchar | tax_id, payment_details are sensitive |
| balance | numeric(12,2) NOT NULL default 0 | **trigger-maintained**, CHECK ≥ 0 |
| lifetime_earned | numeric(12,2) NOT NULL default 0 | **trigger-maintained**, CHECK ≥ 0 |
| payment_method | varchar(32) default `check` | |
| payment_details | text | |
| notes | text | |
| active | boolean NOT NULL default true | |
| contact_id | uuid → contacts.id | partial-unique |
| created_at / updated_at | timestamptz | |

#### `referee_relationships` (schema.ts:773; migration 0014:41)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| referee_id | uuid NOT NULL → referees.id CASCADE | |
| entity_type | varchar(16) NOT NULL | customer\|vendor |
| entity_id | uuid NOT NULL | polymorphic; validated by DB trigger (BLOCKER FIX B2) |
| fee_type | varchar(16) NOT NULL default `percentage` | percentage\|fixed\|hybrid |
| fee_percentage | numeric(5,2) | |
| fee_fixed_amount | numeric(12,2) | |
| apply_by_default | boolean NOT NULL default true | |
| active | boolean NOT NULL default true | |
| notes | text | |
| effective_from / effective_until | timestamptz | |
| created_at / updated_at | timestamptz | |
**Invariant**: partial unique `referee_relationships_active_unique (referee_id, entity_type,
entity_id)` ensures at most one active relationship per referee+entity; the handler
deactivates the prior one before inserting.

#### `referee_credits` (schema.ts:802; migration 0014:93)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| referee_id | uuid NOT NULL → referees.id CASCADE | |
| referee_relationship_id | uuid NOT NULL → referee_relationships.id CASCADE | |
| transaction_type | varchar(32) NOT NULL | purchase_order\|sales_order |
| transaction_id | uuid NOT NULL | |
| transaction_no | varchar(80) NOT NULL | PO/SO number snapshot |
| transaction_total | numeric(12,2) NOT NULL | snapshot at accrual |
| fee_type / fee_percentage / fee_fixed_amount | | fee config snapshot |
| credit_amount | numeric(12,2) NOT NULL | computed accrual |
| amount_paid | numeric(12,2) NOT NULL default 0 | grows on FIFO payout |
| status | varchar(32) NOT NULL default `accrued` | accrued\|partially_paid\|paid\|voided |
| paid_via_transaction_id | uuid | |
| paid_at / voided_at / voided_reason | | |
| command_id | uuid | |
| notes | text | |
| created_at / updated_at | timestamptz | |
**Invariant**: unique `referee_credits_transaction_unique (transaction_type, transaction_id)`
→ one credit per source transaction (idempotent accrual).

#### `payment_processors` (schema.ts:843; migration 0015:5)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | varchar(180) NOT NULL | |
| processor_type | varchar(32) NOT NULL | crypto/check/wire |
| fee_type | varchar(16) NOT NULL default `hybrid` | percentage\|fixed\|hybrid |
| fee_percentage | numeric(5,2) | |
| fee_fixed_amount | numeric(12,2) | |
| default_user_split | numeric(5,2) NOT NULL | + processor split = 100 |
| default_processor_split | numeric(5,2) NOT NULL | |
| notes | text | |
| active | boolean NOT NULL default true | |
| contact_id | uuid → contacts.id | partial-unique |
| created_at / updated_at | timestamptz | |

#### `processor_fees` (schema.ts:867; migration 0015:22)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| processor_id | uuid NOT NULL → payment_processors.id CASCADE | |
| transaction_type | varchar(32) NOT NULL | |
| transaction_id | uuid NOT NULL | |
| transaction_no | varchar(80) NOT NULL | |
| transaction_amount | numeric(12,2) NOT NULL | gross |
| processing_fee_total | numeric(12,2) NOT NULL | |
| user_fee_share | numeric(12,2) NOT NULL | |
| processor_fee_share | numeric(12,2) NOT NULL | |
| user_fee_status | varchar(16) NOT NULL default `collectible` | →collected |
| user_fee_collected_at | timestamptz | |
| processor_fee_status | varchar(16) NOT NULL default `paid` | ↔unpaid |
| processor_fee_paid_at | timestamptz | |
| processor_fee_paid_via | uuid | |
| command_id | uuid | |
| notes | text | |
| created_at / updated_at | timestamptz | |
Migration 0015 also adds `processor_fee_id` FK columns (ON DELETE SET NULL) to the linking
ledger/payment tables (0015:52,59).

#### `connector_requests` (schema.ts:475; CAP-017)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| source | varchar(80) NOT NULL | `internal`/`web`/`phone` = trusted; else external (banner) |
| request_type | varchar(80) NOT NULL | drives `routeFromRequest` heuristic |
| customer_id | uuid → customers.id SET NULL | optional |
| payload | jsonb NOT NULL default `{}` | untrusted inbound data |
| status | varchar(32) NOT NULL default `open` | open\|approved\|rejected\|routed |
| routed_to | varchar(80) | team/person |
| operator_notes | text | |
| review_history | jsonb[] NOT NULL default `[]` | append-only audit `{status,actorId,actorName,at,note,routedTo}` |
| safety_note | text NOT NULL default "No ledger change until an operator posts the routed row." | **the safety model, encoded in data** |
| created_at / updated_at | timestamptz | |

#### `vendors` (schema.ts:44)
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | varchar(180) NOT NULL | createVendor dedups on ilike(name) |
| alias | varchar(80) | |
| terms_days | integer NOT NULL default 14 | payment terms |
| consignment_default | boolean NOT NULL default false | |
| contact | text | free-text legacy contact string (distinct from contact_id) |
| notes | text | |
| contact_id | uuid → contacts.id | CRM link (migration 0054); partial-unique |
| created_at / updated_at | timestamptz | |
Note: `createVendor` auto-creates a default `brand` for the vendor (TER-1585,
`commandBus.ts:1416`, migration 0068 adds `brands.vendor_id`).

---

### B3. Merge-candidate detection mechanics
- Populated **once**, by migration 0054 during the contacts backfill — there is no
  continuous detector.
  - `name_match` (0054:162-167): a contact flagged `is_customer` and a contact flagged
    `is_vendor` sharing `lower(trim(name))` — catches a business that existed as both a
    buyer and seller before the contacts unification.
  - `email_match` (0054:170-180): any two contacts sharing `lower(email)` (non-null),
    skipping pairs already inserted by the name pass.
- Read surface: `mergeCandidateCount` (`queries.ts:2106`) counts unreviewed/undismissed.
- `merged_into` and `reviewed`/`dismissed` exist for an eventual workflow but **no command
  writes them** today — open handoff item (no merge execution path).

### B4. Referee credit accrual / void / balance mechanics
- **Accrual** is embedded in PO/SO post (`commandBus.ts:1813`, `:3575`) via
  `accrueRefereeCredit` — never a standalone command. Idempotent per source transaction
  (unique index). Credit math in `calculateRefereeCredit` (decimal.js, 2dp, non-negative
  guard).
- **Void**: `voidRefereeCredit` flips status to `voided` (+reason/timestamp). Reversible.
- **Payout**: `processRefereePayout` — FIFO across accrued/partially_paid, balance-checked,
  exact-amount-checked, manager/owner-gated, creates a correction journal entry for cash.
- **Balance is trigger-maintained, never app-written** (migration 0014:194-246):
  - `recalculate_referee_balance(p_referee_id)`: `balance = SUM(credit_amount −
    amount_paid)` over status ∈ {accrued, partially_paid}; `lifetime_earned =
    SUM(credit_amount)` over {accrued, partially_paid, paid}. Both exclude `voided`.
  - Trigger `maintain_referee_balance` fires `AFTER INSERT/UPDATE/DELETE ON referee_credits`
    (handles referee-reassignment edge case by recomputing both old and new referee).
  - DB CHECK constraints keep `balance >= 0` and `lifetime_earned >= 0`.
- A separate trigger validates the polymorphic `referee_relationships.entity_id`
  (BLOCKER FIX B2, migration 0014:252).

### B5. Connector routing safety model (no direct ledger mutation)
- `reviewConnectorRequest` writes **only** to `connector_requests` (status/routedTo/notes/
  history) — it touches **no financial table**. By design, an inbound request can never
  move money; an operator must afterward post the actual ledger row through the standard
  command path. The `safety_note` column literally stores this contract per row.
- `routedTo` resolution: explicit `routedTo` wins; on approve it falls back to existing
  value then `routeFromRequest(requestType)` keyword heuristic
  (payments/fulfillment/intake/sales). Route action **requires** an explicit `routedTo`.
- Untrusted `payload` (jsonb) is stored verbatim and never auto-applied. External-source
  banner (`source ∉ {internal,web,phone}`) nudges identity verification in the UI.
- **Failure modes**: missing request → "Connector request not found."; route without
  `routedTo` → required-field error. `restoreFromBackupPoint` can reset requests to open.

### B6. Processor fee calculation
- `calculateProcessingFee` → percentage `amt×pct/100` | fixed | hybrid `amt×pct/100 +
  fixed` (decimal.js, 2dp, negative/missing-config guards).
- `splitProcessingFee` → `userShare = total×pct/100`, `processorShare = total − userShare`
  (subtraction keeps the sum exact). Rejects pct ∉ [0,100].
- `calculateCustomerCredit` (cash-in net) → `gross − processorShare − userShare`.
- `createPaymentProcessor` enforces `userSplit + processorSplit ≈ 100` (±0.01 tolerance,
  GH #289) and non-negative fees/splits.
- Fee rows are produced through the QuickLedger ledger-post flow (client pre-computes
  using the mirrored helpers `QuickLedgerGrid.tsx:84-99`); status transitions thereafter
  via `markUserFeeCollected` / `updateProcessorFeeStatus`. Roll-ups computed in
  `processorWithTotals` (`queries.ts:1380`) by conditional SUMs over fee statuses.
- **Failure modes**: status-update / mark-collected verify the row exists post-write
  ("Processor fee not found"); `updateProcessorFeeStatus` rejects non paid/unpaid values.

### B7. Query procedures (read model)
| Proc | file:line | Purpose / notes |
| --- | --- | --- |
| `contactDirectory` | queries.ts:1777 | keyset-paginated active-contact list; role filter; name/email search; customer balance + vendor open-bills rollup |
| `contactProfile` | queries.ts:1856 | header + role-gated op rows + enriched stats + upcoming appt count; explicit columns (GH #315) |
| `contactAppointments` | queries.ts:1991 | upcoming vs past split |
| `contactLedger` | queries.ts:2020 | contact_ledger_entries with window running balance, keyset cursor (GH #300) |
| `mergeCandidateCount` | queries.ts:2106 | unreviewed+undismissed count |
| `relationshipSummary` | queries.ts:922 | dual-role 360°: orders/invoices/payments/POs/bills/payments/ledger/disputes/commands; name-infers vendor |
| `refereeCredits` | queries.ts:1428 | all credits for a referee, newest-first |
| `activeProcessors` | queries.ts:1372 | active processors A–Z (dropdowns) |
| `processorFees` | queries.ts:1402 | fees filtered by processor/user-status/proc-status, limit 200 |
| `processorWithTotals` | queries.ts:1380 | processor + SUM roll-ups by fee status |
| `workQueue` | queries.ts:527 | global queue incl. "Connector" lane for `status='open'` requests (:620) |

### B8. Components (read/write UI)
- Desktop views: `ContactsView` (directory + create modal), `ContactProfileView` (tabbed
  profile), `RefereesView` (grid + create/edit/relationship/detail), `ProcessorsView`
  (grid + create + detail), `OperationsViews.ConnectorsView` (review + safety banner +
  timeline).
- Profile panels (`components/profile/*`): `ContactProfileHeader` (roles/KPIs/risk
  signals), `ContactOverviewPanel`, `ContactCustomerPanel`, `ContactVendorPanel`,
  `ContactMoneyPanel` (dual-role net + contractor ledger), `ContactAppointmentsPanel`
  (lifecycle actions), `ContactSettingsPanel` (referee/processor/employee settings),
  `ContactHistoryPanel`, `EntityProfileTabs`, `AppointmentModal`.
- Referee components: `RefereeDialog` (edit), `RefereeRelationshipDialog`,
  `UpdateRefereeRelationshipDialog`, `DeactivateRefereeRelationshipDialog`,
  `RefereeDetailPanel` (relationships/credits tabs), `RefereeRelationshipsList`
  (active-only), `RefereeCreditsList`, `VoidRefereeCreditDialog` (reason-required),
  `AddRefereeRelationshipDrawer` (2-step create+link with partial-failure recovery).
- Processor components: `ProcessorDetailPanel` (KPIs), `ProcessorFeesGrid` (filters +
  mark-collected + toggle).
- Cross-domain drawers: `RelationshipDrawer` (dual-role net + external-safe copy),
  `VendorContextDrawer`, `ContactCreateModal`.
- Mobile: `MobileContactsView` (`contactDirectory`), `MobileContactProfileView`
  (`contactProfile` + `relatedCommands`), `MobileContactCard`.
```

---

## Summary

This domain centers on a unified `contacts` identity hub (CAP-029/CAP-033/TER-1564) where
six boolean role flags drive lazily-created operational rows (`customers`, `vendors`,
`referees`, `payment_processors`, `users`) linked back by a partial-unique `contact_id`,
with appointments and a flat signed `contact_ledger_entries` for contractors/employees;
referee/broker credits (CMD-VENDOR) accrue automatically inside PO/SO posting, are paid
out FIFO and voided reversibly, with `referees.balance`/`lifetime_earned` maintained
exclusively by a DB trigger over non-voided credits; inbound connector requests
(CMD-CONNECTOR) are triaged via approve/reject/route actions that mutate **only** the
request row (status/routedTo/append-only history) and never touch the ledger — a safety
contract encoded in the `safety_note` column and surfaced as an external-source UI banner;
and payment processors (CMD-CONNECTOR) compute percentage/fixed/hybrid fees split between
user and processor (split-sum enforced to 100% with float tolerance), tracked through
`collectible→collected` and `paid↔unpaid` statuses, with fee rows produced via the
QuickLedger post path rather than a dedicated command. Archive is gated by per-role
open-work guards; merge candidates are a one-time migration artifact with no execution UI
yet (handoff gap).

## Checklist of documented artifacts

**Commands (24):** createContact, updateContact, archiveContact, addContactRole,
linkContactToExistingEntity, linkContactToUser, createAppointment, updateAppointment,
cancelAppointment, completeAppointment, createVendor, updateVendor, createReferee,
updateReferee, addRefereeRelationship, updateRefereeRelationship,
deactivateRefereeRelationship, voidRefereeCredit, approveConnectorRequest,
rejectConnectorRequest, routeConnectorRequest, createPaymentProcessor,
markUserFeeCollected, updateProcessorFeeStatus, updateProcessor (+ embedded referee
accrual & FIFO payout via postTransactionLedgerRow).

**Tables (11):** contacts, appointments, contact_ledger_entries, contact_merge_candidates,
referees, referee_relationships, referee_credits, payment_processors, processor_fees,
connector_requests, vendors.

**Query procs (11):** contactDirectory, contactProfile, contactAppointments,
contactLedger, mergeCandidateCount, relationshipSummary, refereeCredits, activeProcessors,
processorFees, processorWithTotals, workQueue.

**Components / views (28):** ContactsView, ContactProfileView, RefereesView,
ProcessorsView, ConnectorsView (OperationsViews), ContactCreateModal, AppointmentModal,
ContactProfileHeader, ContactOverviewPanel, ContactCustomerPanel, ContactVendorPanel,
ContactMoneyPanel, ContactAppointmentsPanel, ContactSettingsPanel, ContactHistoryPanel,
EntityProfileTabs, RefereeDialog, RefereeDetailPanel, RefereeRelationshipsList,
RefereeCreditsList, AddRefereeRelationshipDrawer, VoidRefereeCreditDialog,
ProcessorDetailPanel, ProcessorFeesGrid, RelationshipDrawer, VendorContextDrawer,
MobileContactsView, MobileContactProfileView, MobileContactCard.

**Triggers/migrations:** recalculate_referee_balance + maintain_referee_balance +
polymorphic-entity validation (0014), processor fee FKs (0015), contacts system + merge
seeding + entity contact_id links (0054), set-based contact update (0062), email idx
(0070), vendor brand wiring (0068).
