# Entity Profiles — Design Spec
**Date:** 2026-05-22
**Status:** Approved (post-AQA)
**Author:** OpenCode PM via Evan

---

## 1. Problem Statement

TERP Operator has no way to navigate to a unified view of any entity in the system. Customer records exist only as rows in the client ledger grid; vendors only appear in the payables view. Some real-world companies are both a customer and a vendor — there is no way to see their combined financial picture. New entity types needed (contractors, employees) have no home at all. Operators have no place to log or view appointments for any entity.

---

## 2. Goals

- Give every entity type a dedicated, URL-navigable profile page
- Support multi-role entities (a contact that is both a customer and a vendor shows a unified financial picture — combined receivables, payables, and net position in one view)
- Cover all entity types: customer, vendor, referee, processor, contractor, employee
- Make appointments first-class on every profile (CRUD today, calendar integration later)
- Allow ledger entries to be posted from any entity's profile
- Introduce a `/contacts` directory as the single place to browse and create all entity types
- Zero breaking changes to existing financial workflows

---

## 3. Out of Scope (v1)

- Full calendar / scheduling UI (appointments are a list view today; calendar grid is deferred)
- Full HR layer: no W-2/1099 classification, tax withholding, time-off requests, schedules
- Automatic merging of existing duplicate customer+vendor records (flagged for manual review; merge tooling is a follow-on)
- Referee or brand standalone profile views (they gain profiles through the contacts system; dedicated non-contact-based profile pages are not built)
- Customer self-service / VIP portal

---

## 4. Architecture

### 4.1 Core Concept: The Contacts Layer

Every entity is a **Contact** first. A new `contacts` table is the identity anchor. It holds universal fields (name, phone, email, address, notes, tags) and **role flags** (`is_customer`, `is_vendor`, etc.).

Existing operational tables (`customers`, `vendors`, `referees`, `payment_processors`, `users`) are **not replaced**. They each gain a nullable `contact_id` FK pointing to the contact that represents them. Financial logic continues to read from those tables. The profile UI assembles panels by fetching all linked records in one round-trip.

A contact with `is_customer = true` AND `is_vendor = true` has both a linked `customers` row and a linked `vendors` row. The profile shows both panels and computes a net position.

### 4.2 New Entity Types

- **Contractor** (`is_contractor = true`): no pre-existing operational table. Contacts-only. Payment tracking via the new `contact_ledger_entries` table. No migration needed — first contractors are created post-deployment.
- **Employee** (`is_employee = true`): source table is `users`. Migration creates a contact record per user and sets `users.contact_id`. Not all contacts marked as employees have a user account (e.g., warehouse staff without system access).

---

## 5. Schema

### 5.1 New Table: `contacts`

```sql
CREATE TABLE contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     varchar(180) NOT NULL,
  display_name             varchar(180),
  phone                    varchar(40),
  secondary_phone          varchar(40),
  email                    varchar(240),
  address                  text,
  company_name             varchar(180),
  contact_kind             varchar(20) NOT NULL DEFAULT 'individual', -- 'individual' | 'business'
  preferred_contact_method varchar(20) NOT NULL DEFAULT 'any',       -- 'email' | 'phone' | 'text' | 'any'
  notes                    text,
  tags                     text[]    NOT NULL DEFAULT '{}',
  -- Role flags
  is_customer              boolean   NOT NULL DEFAULT false,
  is_vendor                boolean   NOT NULL DEFAULT false,
  is_referee               boolean   NOT NULL DEFAULT false,
  is_processor             boolean   NOT NULL DEFAULT false,
  is_contractor            boolean   NOT NULL DEFAULT false,
  is_employee              boolean   NOT NULL DEFAULT false,
  -- Lifecycle
  active                   boolean   NOT NULL DEFAULT true,
  archived_at              timestamptz,
  archived_by              uuid      REFERENCES users(id),
  archived_reason          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_name_idx       ON contacts(name);
CREATE INDEX contacts_active_idx     ON contacts(active) WHERE active = true;
CREATE INDEX contacts_updated_at_idx ON contacts(updated_at DESC);
```

### 5.2 Cross-Links: `contact_id` on Existing Tables

```sql
ALTER TABLE customers         ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE vendors           ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE referees          ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE payment_processors ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE users             ADD COLUMN contact_id uuid REFERENCES contacts(id);

CREATE INDEX customers_contact_id_idx         ON customers(contact_id);
CREATE INDEX vendors_contact_id_idx           ON vendors(contact_id);
CREATE INDEX referees_contact_id_idx          ON referees(contact_id);
CREATE INDEX payment_processors_contact_id_idx ON payment_processors(contact_id);
CREATE INDEX users_contact_id_idx             ON users(contact_id);
```

All nullable. Migration populates them (see §6).

### 5.3 New Table: `appointments`

Schema designed now; full calendar UI deferred. The list view (CRUD) is fully functional from day one.

```sql
CREATE TABLE appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title            varchar(240) NOT NULL,
  description      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  appointment_type varchar(40) NOT NULL DEFAULT 'meeting',
  -- 'meeting' | 'call' | 'delivery' | 'pickup' | 'vacation' | 'job' | 'other'
  status           varchar(32) NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'completed' | 'cancelled'
  location         text,
  created_by       uuid REFERENCES users(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appointments_contact_idx  ON appointments(contact_id);
CREATE INDEX appointments_starts_at_idx ON appointments(starts_at);
```

### 5.4 New Table: `contact_ledger_entries`

For contractor, employee, and any non-customer-role payments. Running balance is **not stored** — it is computed at read time via window function to eliminate race conditions on concurrent writes.

```sql
CREATE TABLE contact_ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind        varchar(48) NOT NULL,
  -- 'payment_out' | 'advance' | 'reimbursement' | 'adjustment' | 'void'
  amount      numeric(12, 2) NOT NULL, -- signed: negative = money paid out to contact
  method      varchar(32),
  reference   varchar(120),
  note        text,
  command_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_ledger_contact_idx     ON contact_ledger_entries(contact_id);
CREATE INDEX contact_ledger_created_at_idx  ON contact_ledger_entries(contact_id, created_at DESC);
```

Running balance query at read time:
```sql
SELECT *, SUM(amount) OVER (PARTITION BY contact_id ORDER BY created_at) AS running_balance
FROM contact_ledger_entries
WHERE contact_id = $1
ORDER BY created_at DESC;
```

### 5.5 New Table: `contact_merge_candidates`

Populated by migration. Surfaces duplicate-detection results for operator review.

```sql
CREATE TABLE contact_merge_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  match_reason  varchar(80) NOT NULL, -- 'name_match' | 'email_match'
  reviewed      boolean NOT NULL DEFAULT false,
  dismissed     boolean NOT NULL DEFAULT false,
  merged_into   uuid REFERENCES contacts(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## 6. Migration

**Migration file:** `0055_contacts_system.sql`

One DO $$ block per entity type, executed in order. No automatic merging. A reconciliation step at the end flags likely duplicates.

```sql
-- 1. Create contacts for all existing CUSTOMERS
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM customers LOOP
    INSERT INTO contacts (name, notes, tags, is_customer, active, created_at, updated_at)
    VALUES (r.name, r.notes, r.tags, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE customers SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Create contacts for all existing VENDORS
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM vendors LOOP
    INSERT INTO contacts (name, notes, is_vendor, active, created_at, updated_at)
    VALUES (r.name, r.notes, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE vendors SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Create contacts for all existing REFEREES
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM referees LOOP
    INSERT INTO contacts (name, email, phone, notes, is_referee, active, created_at, updated_at)
    VALUES (r.name, r.email, r.phone, r.notes, true, r.active, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE referees SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Create contacts for all existing PAYMENT PROCESSORS
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM payment_processors LOOP
    INSERT INTO contacts (name, notes, is_processor, active, created_at, updated_at)
    VALUES (r.name, r.notes, true, r.active, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE payment_processors SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Create contacts for all existing USERS (employees)
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM users WHERE active = true LOOP
    INSERT INTO contacts (name, email, is_employee, active, created_at, updated_at)
    VALUES (r.name, r.email, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE users SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 6. Flag likely customer+vendor duplicates for manual review
INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
SELECT ca.id, cv.id, 'name_match'
FROM contacts ca
JOIN contacts cv
  ON lower(trim(ca.name)) = lower(trim(cv.name))
  AND ca.is_customer = true
  AND cv.is_vendor = true
  AND ca.id != cv.id;

-- Also flag by email when both have one
INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
SELECT ca.id, cv.id, 'email_match'
FROM contacts ca
JOIN contacts cv
  ON lower(ca.email) = lower(cv.email)
  AND ca.email IS NOT NULL
  AND ca.id != cv.id
  AND NOT EXISTS (
    SELECT 1 FROM contact_merge_candidates
    WHERE (contact_a_id = ca.id AND contact_b_id = cv.id)
       OR (contact_a_id = cv.id AND contact_b_id = ca.id)
  );
```

**Contractors:** no pre-existing data. First contractors created post-deployment via `createContact` with `is_contractor: true`.

---

## 7. Routes

```
/contacts           →  ContactsView          (entity directory)
/contacts/:id       →  ContactProfileView    (unified profile)
```

`LocationSync` already handles `/contacts/uuid` → `activeView = 'contacts'` via first-path-segment logic. Add `'contacts'` to `ViewKey` in `shared/types.ts`.

Existing `/clients`, `/vendors`, `/referees`, `/processors` routes are **unchanged** — they remain operational workflow grids. Entity name columns in those grids become links to `/contacts/:contactId`.

---

## 8. Contacts Directory (`/contacts`)

A new top-level view with its own SideNav entry. Positioned after Clients in the nav (within the existing entity group).

**Layout:** standard `view-stack` with one `WorkspacePanel`.

**Control band:**
- Quick filter text input (searches name, company, email)
- Role filter chips: All / Customers / Vendors / Referees / Contractors / Employees / Processors (multi-select via existing `AdvancedFilterBuilder` pattern)
- **New Contact** primary button → opens `ContactCreateModal`

**OperatorGrid columns** (≤8 per design system rule):
`Name` (link) | `Roles` (badge chips) | `Company` | `Phone` | `Email` | `Balance` (customer balance if is_customer) | `Open Bills` (vendor bills if is_vendor) | `Status` (active chip)

**Merge candidates banner:** If `contact_merge_candidates` has unreviewed rows, a dismissable amber banner appears above the grid: *"X possible duplicate contacts found. Review and merge."* → opens the merge candidates view (a filtered grid of candidates with Confirm Merge / Dismiss actions).

**Pagination:** cursor-based, default 50 rows. `queries.contactDirectory` accepts `{ limit, cursor, roleFilter[], query }`.

---

## 9. Contact Profile (`/contacts/:id`)

### 9.1 Header (`WorkspacePanel panelId="contact-profile-header"`)

**Left column:**
- `page-title`: contact name (display_name in parens if set and different)
- Role badges: `.selection-pill` chips per active role — `Customer`, `Vendor`, `Referee`, `Contractor`, `Employee`, `Processor`
- `page-subtitle`: company name if set; otherwise contact kind + active status

**Center — KPI cards** (conditional by role combination, using existing `KpiCard` component):

| Role combination | Cards |
|---|---|
| Customer only | Balance · Credit Headroom · Open Invoices · Last Order |
| Vendor only | Open Bills $ · Open POs · Active Batches · Last PO |
| Customer + Vendor | Balance (receivable) · Open Bills (payable) · Net Position · Last Activity |
| Contractor or Employee | Total Paid Out · Last Payment · Upcoming Appointments |
| Referee | Referee Balance · Lifetime Earned · Active Relationships |
| Processor | (no financial KPIs — fees in their own reporting) |

**Right — action buttons** (canWrite gated, role-aware):
- `is_customer` → **New Order** (primary-button): `setActiveCustomerId(id)` + `navigate('/sales')`
- `is_vendor` → **New PO** (primary if no customer role, secondary otherwise): `navigate('/purchaseOrders')`
- Any financial role or contractor/employee → **Log Payment** (secondary-button): opens a role-discriminated modal. If the contact has only one financial role, it targets that role directly. If the contact has multiple financial roles (e.g., customer + contractor), the modal shows a role selector: "Receiving money from them (customer)" or "Paying money to them (contractor/employee)". This dispatches to `postTransactionLedgerRow` with the correct `entityType` and `entityId`. Operators who want to skip the selector can use the per-section "Post payment" or "Log payment" buttons within the Money tab.
- **Add Appointment** (secondary-button): opens `AppointmentModal`
- **Edit** (icon-button, pencil)
- **⋮** (icon-button): Apply Tags, Archive (manager+), Add Role (manager+), Link to existing record (manager+)

**Signals strip** (computed client-side, shown when non-empty):
- Balance > credit limit → `.selection-pill.danger` "Over credit limit"
- Oldest open invoice > 30 days → `.selection-pill.warning` "Invoice 30+ days overdue"
- No orders in 45+ days (if is_customer) → `.selection-pill` "No orders in 45+ days"
- Upcoming appointment today or tomorrow → `.selection-pill` "[Title] tomorrow at [time]"
- Credit engine reminder active → `.selection-pill.warning` from creditStatus.reminder

### 9.2 Tab Assembly

Tabs are assembled at render time. A tab is not rendered (not hidden via CSS) when its role condition is false.

| Tab | Condition |
|---|---|
| Overview | Always |
| Customer | `contact.is_customer` |
| Vendor | `contact.is_vendor` |
| Money | `is_customer OR is_vendor OR is_referee OR is_contractor OR is_employee` |
| Appointments | Always |
| Settings | `is_referee OR is_processor OR is_employee` |
| History | Always |

Tab chrome: `EntityProfileTabs` component. Renders a `<nav role="tablist">` with `.text-button` tab buttons. Active tab: `font-semibold border-b-2 border-accent`. Active tab state is `useState` inside `ContactProfileView` — not persisted (URL is source of truth for navigation; tab state resets on navigation).

Minimum configuration (contractor or employee with no config-bearing role): Overview + Money + Appointments + History (4 tabs).

### 9.3 Tab: Overview

**Contact info card** (`context-drawer-card`):
Rows of `field-inline` label + value: Phone, Secondary phone, Email, Address, Company name, Contact kind (Individual / Business), Preferred contact method. Blank-slated as "—" when empty. `Edit` text-button in card header → `ContactEditModal`.

**Notes card** (`context-drawer-card`):
Free-text content area. Click to edit inline. Saves on blur via `updateContact`. Character count shown during editing.

**Tags row:** `.selection-pill` chips per tag. `+ Add tag` → tag picker from `reference.tags`. Remove via `×` chip → both use `applyTags` command.

**Linked accounts card** (`context-drawer-card`, shown only when role records exist):
One row per linked operational record. Example rows:
- "Customer record — Balance: $1,200 · Credit: $5,000" + "View" link → `/clients` filtered
- "Vendor record — Net-14 terms · No consignment" + "View" link → `/vendors` filtered

**Link to existing record** (manager+): button within the linked accounts card. Opens a picker that searches existing `customers` / `vendors` / `referees` records not yet linked to any contact and allows associating them with this contact via `linkContactToExistingEntity`.

### 9.4 Tab: Customer *(if `is_customer`)*

Pulls from linked `customers` row.

**WorkspacePanel** "Customer Account":
- Balance, credit limit, pricing rule summary
- `CustomerCreditPanel` (existing component) — full credit engine display
- "Edit credit limit" (manager+) → existing `setCustomerCreditLimit` command

**WorkspacePanel** "Order History":
- OperatorGrid via `queries.customerOrderHistory({ customerId, limit: 50, cursor? })`
- Columns: Order # · Date · Lines · Total · Status
- Empty state: "No orders yet."
- `New Order` action button in panel header

**WorkspacePanel** "Pricing":
- Current `pricingRule` in human-readable form
- "Edit pricing" (manager+) → `setCustomerPricingRule` command
- `CustomerPurchaseHistoryPanel` (existing component) — item-level purchase history

### 9.5 Tab: Vendor *(if `is_vendor`)*

Pulls from linked `vendors` row.

**WorkspacePanel** "Vendor Account":
- Name, alias, terms, consignment status
- Inline "Edit" (operator+) → `updateVendor` command (new)

**WorkspacePanel** "Open Bills":
- OperatorGrid of vendor bills filtered to `vendorId` (existing grid query + optional vendorId filter)
- Same Approve / Schedule / Pay actions as `VendorPayablesView`

**WorkspacePanel** "Purchase Orders":
- OperatorGrid of POs filtered to `vendorId`

**WorkspacePanel** "Inventory":
- OperatorGrid of batches filtered to `vendorId`

### 9.6 Tab: Money

Assembled by active roles. Each section is a `WorkspacePanel` with its own `panelId`.

**Net Position strip** (`subtle-band`) — shown only for contacts with both `is_customer` and `is_vendor`:
Receivable (customer balance owed to you) | Payable (vendor open bills owed to them) | **Net** chip. Net = receivable − payable. `.selection-pill.warning` if net is negative.

**Section: Receivables** (if `is_customer`):
- Customer balance, credit utilization bar
- Open invoices summary from `relationshipSummary`
- Payments received grid (existing `payments` table, filtered to customerId)
- "Log payment" action → existing `postTransactionLedgerRow`

**Section: Payables** (if `is_vendor`):
- Open vendor bills summary
- Payments made to vendor grid (existing vendor payment records)

**Section: Referee Credits** (if `is_referee`):
- Referee balance and lifetime earned from linked `referees` row
- "Void credit" (manager+) → existing `voidRefereeCredit`

**Section: Direct Payments** (if `is_contractor` OR `is_employee`):
- `contact_ledger_entries` records for this contact via `queries.contactLedger`
- Running balance computed via window function at query time
- Columns: Date · Kind · Amount · Running Balance · Method · Reference · Note
- "Post payment" (manager+) → extended `postTransactionLedgerRow` with `entityType: 'contact'`

**Section: All Transactions** (always, at bottom of tab):
- Combined time-sorted list across all sections. Unified timeline view. Useful for dual-role contacts. Read-only list; no actions.

### 9.7 Tab: Appointments

**WorkspacePanel** "Upcoming" (subtitle: count of scheduled future appointments):
- `queries.contactAppointments({ contactId }).upcoming` — sorted ascending by `starts_at`
- Each row: date + time · type badge · title · location (if set) · notes snippet
- Row actions: Edit → `AppointmentModal` · Complete → `completeAppointment` · Cancel → `cancelAppointment`
- Empty state: "No upcoming appointments. Add one to track interactions."

**WorkspacePanel** "Past":
- `queries.contactAppointments({ contactId }).past` — sorted descending
- Read-only rows (no actions on completed/cancelled appointments)
- Empty state: "No past appointments on record."

**"Add Appointment"** button in the Upcoming panel header → opens `AppointmentModal`.

`AppointmentModal` fields:
- Title (required, text input)
- Type (select: Meeting / Call / Delivery / Pickup / Vacation / Job / Other)
- Date (date input)
- Start time (time input)
- End time (optional time input)
- Location (optional text)
- Notes (optional textarea)

Saves via `createAppointment`. Updates via `updateAppointment` (same modal, different mode prop).

**Calendar integration note:** When calendaring lands, the two `WorkspacePanel` list views in this tab are replaced by a calendar grid component. The data model (`appointments` table + `createAppointment` / `updateAppointment` / `cancelAppointment` / `completeAppointment` commands + `queries.contactAppointments`) does not change. The tab is not a stub — it is fully functional today as a list view.

### 9.8 Tab: Settings *(referee, processor, employee)*

**Referee section** (if `is_referee`):
- Commission rate, payment method, payment details — from linked `referees` row
- Active referee relationships → `RefereeRelationshipDialog` triggers
- "Void credit" (manager+) → existing `voidRefereeCredit`

**Processor section** (if `is_processor`):
- Fee type, fee percentage, fixed fee, default splits, active flag — from linked `payment_processors` row
- Display only with "Edit" (owner+) → `updateProcessor` command (new)

**Employee section** (if `is_employee`):
- User account link row: if `users.contact_id` is set → show role, work loop, account email (read-only from `users`)
- If no user link: "No system account linked" + "Link user account" (owner+) → opens user picker, runs `linkContactToUser` command (sets `users.contact_id = contactId`)
- Appointment types available for this employee: listed as chips (read-only config, not user-editable in v1)

### 9.9 Tab: History

Command journal via extended `queries.relatedCommands` — accepts `contactId` and fans the query across all linked entity IDs (contactId + customerId + vendorId + refereeId as applicable). Returns a time-sorted union of command journal entries referencing any of those IDs.

Columns: When · Command · Actor · Result
Filter dropdown: All / Orders / Payments / Credit / Vendor / Appointments / Other

---

## 10. New Commands

All new commands follow existing patterns: added to `commandNames` + `commandLabels` + `commandMinRole` + `reversalPolicies` in `commandCatalog.ts`. Zod schemas in `schemas.ts`. Handlers in `commandBus.ts` case blocks.

### `createContact` (operator+)
**Payload:** `name`, `displayName?`, `phone?`, `email?`, `address?`, `companyName?`, `contactKind?`, `preferredContactMethod?`, `notes?`, `tags?`, `roles: Array<'customer'|'vendor'|'referee'|'contractor'|'employee'|'processor'>`, plus role-specific fields: `creditLimit?` (customer), `termsDays?` (vendor), `consignmentDefault?` (vendor).

**Effect (single transaction):**
1. INSERT into `contacts` with role flags set from `roles` array
2. If `'customer'` in roles → INSERT into `customers` (name, creditLimit, tags) + link contact_id
3. If `'vendor'` in roles → INSERT into `vendors` (name, termsDays, consignmentDefault) + link contact_id
4. Other roles: set flag only (no separate record needed for contractor/employee in v1)

**Returns:** `{ ok: true, contactId, toast: "'[name]' added" }`
**Reversal:** terminal (use archiveContact)

### `updateContact` (operator+)
**Payload:** `contactId` + any subset of: `name`, `displayName`, `phone`, `secondaryPhone`, `email`, `address`, `companyName`, `contactKind`, `preferredContactMethod`, `notes`.
**Note:** Role flags and financial fields are NOT updated here — they have dedicated commands.
**Reversal:** offsettable

### `archiveContact` (manager+)
**Payload:** `contactId`, `reason`.
**Guards (block-if-any role has open work):**
| Role | Guard predicate |
|---|---|
| `is_customer` | `SELECT 1 FROM invoices WHERE customer_id = [linked customerId] AND status IN ('open','partial')` |
| `is_vendor` | `SELECT 1 FROM vendor_bills WHERE vendor_id = [linked vendorId] AND status NOT IN ('paid','void','cancelled')` |
| `is_referee` | `SELECT 1 FROM referee_relationships WHERE referee_id = [linked refereeId] AND active = true` |
| `is_contractor` / `is_employee` | `SELECT 1 FROM contact_ledger_entries WHERE contact_id = contactId AND SUM(amount) > 0` |
| `is_processor` | `SELECT 1 FROM processor_fees WHERE processor_id = [linked processorId] AND user_fee_status != 'collected'` |

**Effect:** SET `active = false`, `archived_at`, `archived_by`, `archived_reason` on the contact row.
**Reversal:** terminal

### `addContactRole` (manager+)
**Payload:** `contactId`, `role` (one of the six), plus role-specific fields.
**Effect:** Sets the role flag on contact; INSERT into the corresponding operational table if needed (customer, vendor); links `contact_id`.
**Reversal:** terminal

### `linkContactToExistingEntity` (manager+)
**Payload:** `contactId`, `entityType` (`customer|vendor|referee|processor`), `entityId`.
**Effect:** Sets `contact_id` on the existing entity row; sets the corresponding role flag on the contact.
**Guard:** `entityId` must not already have a non-null `contact_id` (prevents double-linking).
**Reversal:** offsettable

### `linkContactToUser` (owner+)
**Payload:** `contactId`, `userId`.
**Effect:** SET `users.contact_id = contactId` where `users.id = userId`; SET `contacts.is_employee = true`.
**Guard:** `userId` must not already have a non-null `contact_id`.
**Reversal:** offsettable

### `createAppointment` (operator+)
**Payload:** `contactId`, `title`, `appointmentType`, `startsAt`, `endsAt?`, `location?`, `notes?`.
**Effect:** INSERT into `appointments`.
**Returns:** `{ ok: true, appointmentId, toast: "Appointment added" }`
**Reversal:** use cancelAppointment

### `updateAppointment` (operator+)
**Payload:** `appointmentId`, any subset of: `title`, `appointmentType`, `startsAt`, `endsAt`, `location`, `notes`.
**Guard:** status must be `'scheduled'`.
**Reversal:** offsettable

### `cancelAppointment` (operator+)
**Payload:** `appointmentId`, `reason?`.
**Effect:** SET `status = 'cancelled'`.
**Reversal:** terminal

### `completeAppointment` (operator+)
**Payload:** `appointmentId`, `notes?`.
**Effect:** SET `status = 'completed'`; optionally appends notes.
**Reversal:** terminal

### `postTransactionLedgerRow` — extend existing (manager+)
Add a new branch in the existing handler for `entityType === 'contact'`:
- Reads `contactId` from `payload.entityId`
- Writes directly to `contact_ledger_entries` (kind, amount, method, reference, note, command_id)
- No invoice allocation logic — simple signed ledger entry
- Running balance NOT stored; computed at read time via window function
- Does not touch `client_ledger_entries` or existing customer/vendor payment logic

### `updateVendor` (operator+) — from previous design
**Payload:** `vendorId`, any subset of: `name`, `alias`, `termsDays`, `consignmentDefault`, `contact`, `notes`.
**Effect:** UPDATE vendors SET.
**Reversal:** offsettable

### `updateProcessor` (owner+) — new
**Payload:** `processorId`, any subset of: `name`, `processorType`, `feeType`, `feePercentage`, `feeFixedAmount`, `defaultUserSplit`, `defaultProcessorSplit`, `notes`, `active`.
**Effect:** UPDATE payment_processors SET.
**Reversal:** offsettable

---

## 11. New tRPC Queries

### `queries.contactDirectory({ limit, cursor, roleFilter, query })`
Cursor-based pagination, default limit 50. KPI stubs defined as specific LEFT JOIN aggregates (not subqueries per row):
- `customer_balance` — from `customers.balance` via `LEFT JOIN customers ON customers.contact_id = contacts.id`
- `customer_credit_limit` — same join
- `vendor_open_bills` — pre-aggregated `LEFT JOIN (SELECT vendor_id, SUM(amount - amount_paid) FROM vendor_bills WHERE status IN ('approved','scheduled') GROUP BY vendor_id) vb ON vb.vendor_id = vendors.id`

Required indexes: `contacts(active, updated_at)`, `customers(contact_id)`, `vendors(contact_id)` (added in migration §6).

Returns: `{ rows: ContactDirectoryRow[], nextCursor: string | null }`

### `queries.contactProfile({ contactId })`
Single `Promise.all` across:
- Full `contacts` row
- Linked `customers` row + `customerStats` (`lifetimeRevenue`, `openInvoicesCount`, `openInvoicesAmount`, `oldestOpenInvoiceDays`, `lastOrderDate`, `lastOrderAmount`) if `is_customer`
- Linked `vendors` row + `vendorStats` (`totalPaid`, `openBillsCount`, `openBillsAmount`, `openPOCount`, `lastPODate`) if `is_vendor`
- Linked `referees` row (balance, lifetimeEarned) if `is_referee`
- Linked `payment_processors` row if `is_processor`
- Linked `users` row — role + workLoop only, no auth fields — if `is_employee`
- Credit status (same shape as `credit.customerCreditStatus`) if `is_customer`
- Signals computed server-side

Returns: `ContactProfileData` typed shape with all fields nullable based on role flags.

### `queries.contactAppointments({ contactId })`
Returns `{ upcoming: Appointment[], past: Appointment[] }`. No pagination in v1 (appointments are sparse per contact). Upcoming: `starts_at > now() AND status = 'scheduled'`, sorted ascending. Past: `starts_at <= now() OR status IN ('completed','cancelled')`, sorted descending, limited to last 50.

### `queries.contactLedger({ contactId, limit, cursor })`
Paginated `contact_ledger_entries` with running balance computed via window function. Default limit 50. Returns `{ rows: ContactLedgerRow[], nextCursor: string | null }`.

### `queries.customerOrderHistory({ customerId, limit, cursor })` — from previous design
Paginated sales orders for one customer. Default limit 50.

### `queries.vendorProfile({ vendorId })` — from previous design
Vendor row + stats. Superseded by `contactProfile` for linked contacts but retained for direct vendor lookups from non-profile surfaces.

### Extensions to existing grid queries
Add optional `vendorId?: string` filter to:
- `queries.grid({ view: 'inventory', vendorId? })` — vendor profile Inventory panel
- `queries.grid({ view: 'vendors', vendorId? })` — vendor profile Bills panel
- `queries.grid({ view: 'purchaseOrders', vendorId? })` — vendor profile POs panel

These are additive WHERE conditions. No existing call sites break.

### Extension to `queries.relatedCommands`
Add optional `contactId?: string` parameter. When provided, fans the query across the contact's `id` plus all linked entity IDs (`customerId`, `vendorId`, `refereeId`) found via contact_id joins. Returns a time-sorted union. Uses UNION ALL with explicit `affected_ids @> ARRAY[id]::uuid[]` GIN index lookups (index already exists from migration 0043).

---

## 12. Frontend Files

### New Files

```
src/client/views/
  ContactsView.tsx                   Contact directory (/contacts)
  ContactProfileView.tsx             Unified profile (/contacts/:id)

src/client/components/profile/       New subdirectory — follows credit/ precedent
  EntityProfileTabs.tsx              Tab strip + conditional assembly from role flags
  ContactProfileHeader.tsx           KPI cards, signals strip, role badges, actions
  ContactOverviewPanel.tsx           Contact info card, notes, tags, linked accounts
  ContactCustomerPanel.tsx           Credit panel + orders grid + pricing
  ContactVendorPanel.tsx             Bills + POs + inventory panels
  ContactMoneyPanel.tsx              Net position, receivables, payables, direct payments
  ContactAppointmentsPanel.tsx       Upcoming + past appointment lists
  ContactSettingsPanel.tsx           Referee / processor / employee config
  ContactHistoryPanel.tsx            Command journal (extended relatedCommands)
  AppointmentModal.tsx               Create + edit (dual-mode via mode prop)
  ContactCreateModal.tsx             New contact with role checkboxes
  ContactEditModal.tsx               Edit identity fields
```

### Modified Files

| File | Change |
|---|---|
| `src/client/App.tsx` | Add `/contacts` + `/contacts/:id` routes; lazy-import both views |
| `src/shared/types.ts` | Add `'contacts'` to `ViewKey` union |
| `src/shared/commandCatalog.ts` | Add 12 new command names, labels, minRoles, reversal policies |
| `src/shared/schemas.ts` | Add Zod schemas for all new command payloads |
| `src/server/routers/queries.ts` | Add 5 new/extended procedures; add vendorId filter paths; extend relatedCommands |
| `src/server/services/commandBus.ts` | Add case handlers for all new commands; extend postTransactionLedgerRow |
| `src/client/components/ContextDrawer.tsx` | Add "Open full profile →" text-button link to customer, vendor, referee, processor tab bodies |
| `src/client/views/OperationsViews.tsx` | Name columns in ClientLedgerView + VendorPayablesView → link to /contacts/:contactId; add "New Client" button |
| `src/client/views/RefereesView.tsx` | Referee name → link to /contacts/:contactId |
| `src/client/views/ProcessorsView.tsx` | Processor name → link to /contacts/:contactId |
| `src/client/components/Shell.tsx` | Add "Contacts" nav item to SideNav |
| `docs/design-system/decisions-log.md` | Append entry: contacts model, profile/ subdirectory, appointment schema, contact ledger pattern |

---

## 13. RBAC Matrix

| Action | viewer | operator | manager | owner |
|---|---|---|---|---|
| View any profile, all tabs | ✅ | ✅ | ✅ | ✅ |
| View appointments | ✅ | ✅ | ✅ | ✅ |
| Create / update contact | ❌ | ✅ | ✅ | ✅ |
| Create / update / complete / cancel appointment | ❌ | ✅ | ✅ | ✅ |
| Add role to contact, link to existing entity | ❌ | ❌ | ✅ | ✅ |
| Post ledger entry (contractor / employee) | ❌ | ❌ | ✅ | ✅ |
| Edit credit limit, pricing rule | ❌ | ❌ | ✅ | ✅ |
| Archive contact | ❌ | ❌ | ✅ | ✅ |
| Update processor config | ❌ | ❌ | ❌ | ✅ |
| Link user account to contact | ❌ | ❌ | ❌ | ✅ |

Server-side RBAC is the real gate. UI gating via `canWrite = me.data?.role !== 'viewer'` and `canManage = ['manager','owner'].includes(me.data?.role)` follows existing pattern in the codebase.

---

## 14. Design System Notes

**`profile/` subdirectory:** Follows the `credit/` subdirectory precedent. Append a `decisions-log.md` entry: feature-scoped subdirectories are permitted for multi-file clusters; flat placement is still preferred for standalone components.

**Tab assembly:** `EntityProfileTabs` takes the contact's role flags and returns an ordered `Array<{ key, label, Component }>`. Tabs not matching the contact's roles are not rendered — not hidden. This keeps the DOM clean and prevents empty panels from being keyboard-navigable.

**No new Zustand state:** `useParams()` provides the contact ID. Active tab state is `useState` local to `ContactProfileView`. It is not persisted (the URL is the navigation source of truth; tab state resets intentionally on navigation away and back).

**`EntityProfileShell` is not a component (v1):** The profile chrome (back nav + header + tab nav) is composed inside `ContactProfileView` directly. With only one unified profile type in v1, a shared shell is premature. Extract if a second profile type diverges enough to need different chrome.

**Dual-role net position:** Computed client-side in `ContactMoneyPanel` from the stats objects returned by `queries.contactProfile`. Simple arithmetic on pre-fetched numbers; no extra server round-trip.

**Running balance for `contact_ledger_entries`:** Computed server-side via window function at query time. Not stored. This eliminates the race condition identified in AQA and matches the append-only nature of the ledger.

---

## 15. AQA Findings Resolved

| Finding | Severity | Resolution in this spec |
|---|---|---|
| Race condition on `contact_ledger_entries.balance_after` | Critical | Column removed; running balance computed via window function at read time (§5.4) |
| Migration creates duplicates for dual-role entities | High | `contact_merge_candidates` table + migration reconciliation query + merge-candidates banner in ContactsView (§6, §8) |
| Employees and contractors missing migration path | High | Employee migration leg from `users` table added (§6); contractors explicitly noted as new entity type with no pre-existing data (§4.2) |
| `contactDirectory` unbounded, KPI stubs undefined | Medium | Cursor pagination (default 50) specified; KPI columns defined as specific LEFT JOIN aggregates with required indexes (§11) |
| `archiveContact` guards unnamed | Medium | Explicit per-role guard predicates with block-if-any policy defined (§10) |

