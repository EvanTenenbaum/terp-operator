# Entity Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Contacts system giving every TERP Operator entity type (customer, vendor, referee, processor, contractor, employee) a dedicated navigable profile page with multi-role support, appointments, and unified financial views.

**Architecture:** A new `contacts` table acts as the identity anchor for all entity types. Existing operational tables (customers, vendors, referees, payment_processors, users) gain a nullable `contact_id` FK and are not replaced. Profile UI assembles panels based on role flags on the contact record. Running balance in `contact_ledger_entries` is computed via window function at read time — not stored.

**Tech Stack:** React 18 + Vite + TypeScript strict + Zustand (single `useUiStore`) + tRPC v10 + TanStack Query v4 + AG Grid Enterprise v32 + Tailwind v3 + semantic CSS classes. Backend: Express + tRPC + Drizzle ORM + PostgreSQL 16. All mutations via `useCommandRunner` → `commandBus` → DB journal.

**Spec:** `docs/superpowers/specs/2026-05-22-entity-profiles-design.md`

---

## Phase 1: DB Foundation

### Task 1.1: Write the migration

**Files:**
- Create: `migrations/0054_contacts_system.sql`

- [ ] Create the migration file:

```sql
-- migrations/0054_contacts_system.sql
-- Contacts system: universal identity anchor for all entity types

-- 1. Core contacts table
CREATE TABLE contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     varchar(180) NOT NULL,
  display_name             varchar(180),
  phone                    varchar(40),
  secondary_phone          varchar(40),
  email                    varchar(240),
  address                  text,
  company_name             varchar(180),
  contact_kind             varchar(20) NOT NULL DEFAULT 'individual',
  preferred_contact_method varchar(20) NOT NULL DEFAULT 'any',
  notes                    text,
  tags                     text[] NOT NULL DEFAULT '{}',
  is_customer              boolean NOT NULL DEFAULT false,
  is_vendor                boolean NOT NULL DEFAULT false,
  is_referee               boolean NOT NULL DEFAULT false,
  is_processor             boolean NOT NULL DEFAULT false,
  is_contractor            boolean NOT NULL DEFAULT false,
  is_employee              boolean NOT NULL DEFAULT false,
  active                   boolean NOT NULL DEFAULT true,
  archived_at              timestamptz,
  archived_by              uuid REFERENCES users(id),
  archived_reason          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_name_idx       ON contacts(name);
CREATE INDEX contacts_active_idx     ON contacts(active) WHERE active = true;
CREATE INDEX contacts_updated_at_idx ON contacts(updated_at DESC);

-- 2. Appointments table (calendar integration point — list UI now, calendar grid later)
CREATE TABLE appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title            varchar(240) NOT NULL,
  description      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  appointment_type varchar(40) NOT NULL DEFAULT 'meeting',
  status           varchar(32) NOT NULL DEFAULT 'scheduled',
  location         text,
  created_by       uuid REFERENCES users(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appointments_contact_idx   ON appointments(contact_id);
CREATE INDEX appointments_starts_at_idx ON appointments(starts_at);

-- 3. Contact ledger entries (contractor/employee payment tracking)
-- NOTE: No balance_after column — running balance computed via window function at read time
CREATE TABLE contact_ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind        varchar(48) NOT NULL,
  amount      numeric(12, 2) NOT NULL,
  method      varchar(32),
  reference   varchar(120),
  note        text,
  command_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_ledger_contact_idx    ON contact_ledger_entries(contact_id);
CREATE INDEX contact_ledger_created_at_idx ON contact_ledger_entries(contact_id, created_at DESC);

-- 4. Merge candidates (flagged by migration reconciliation step)
CREATE TABLE contact_merge_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  match_reason  varchar(80) NOT NULL,
  reviewed      boolean NOT NULL DEFAULT false,
  dismissed     boolean NOT NULL DEFAULT false,
  merged_into   uuid REFERENCES contacts(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 5. Cross-link FKs on existing tables (UNIQUE enforces 1-contact-per-entity invariant)
ALTER TABLE customers          ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE vendors            ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE referees           ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE payment_processors ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE users              ADD COLUMN contact_id uuid REFERENCES contacts(id);

-- UNIQUE constraints: each entity row maps to at most one contact
CREATE UNIQUE INDEX customers_contact_id_unique_idx          ON customers(contact_id)          WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX vendors_contact_id_unique_idx            ON vendors(contact_id)            WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX referees_contact_id_unique_idx           ON referees(contact_id)           WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX payment_processors_contact_id_unique_idx ON payment_processors(contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX users_contact_id_unique_idx              ON users(contact_id)              WHERE contact_id IS NOT NULL;

-- 6. Migrate existing entities into contacts (1:1, no automatic merging)
DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM customers WHERE contact_id IS NULL LOOP
    INSERT INTO contacts (name, notes, tags, is_customer, active, created_at, updated_at)
    VALUES (r.name, r.notes, r.tags, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE customers SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM vendors WHERE contact_id IS NULL LOOP
    INSERT INTO contacts (name, notes, is_vendor, active, created_at, updated_at)
    VALUES (r.name, r.notes, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE vendors SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM referees WHERE contact_id IS NULL LOOP
    INSERT INTO contacts (name, email, phone, notes, is_referee, active, created_at, updated_at)
    VALUES (r.name, r.email, r.phone, r.notes, true, r.active, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE referees SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM payment_processors WHERE contact_id IS NULL LOOP
    INSERT INTO contacts (name, notes, is_processor, active, created_at, updated_at)
    VALUES (r.name, r.notes, true, r.active, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE payment_processors SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

DO $$ DECLARE r RECORD; new_id uuid; BEGIN
  FOR r IN SELECT * FROM users WHERE active = true AND contact_id IS NULL LOOP
    INSERT INTO contacts (name, email, is_employee, active, created_at, updated_at)
    VALUES (r.name, r.email, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE users SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 7. Flag likely duplicate contacts for manual review
INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
SELECT ca.id, cv.id, 'name_match'
FROM contacts ca
JOIN contacts cv
  ON lower(trim(ca.name)) = lower(trim(cv.name))
  AND ca.is_customer = true AND cv.is_vendor = true AND ca.id != cv.id;

INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
SELECT ca.id, cv.id, 'email_match'
FROM contacts ca
JOIN contacts cv
  ON lower(ca.email) = lower(cv.email)
  AND ca.email IS NOT NULL AND ca.id != cv.id
  AND NOT EXISTS (
    SELECT 1 FROM contact_merge_candidates
    WHERE (contact_a_id = ca.id AND contact_b_id = cv.id)
       OR (contact_a_id = cv.id AND contact_b_id = ca.id)
  );
```

- [ ] Run migration and verify:

```bash
pnpm db:migrate
```

Expected: migration applies without error. Then confirm:

```bash
psql $DATABASE_URL -c "\d contacts" | head -30
psql $DATABASE_URL -c "SELECT count(*) FROM contacts;"
psql $DATABASE_URL -c "SELECT count(*) FROM contact_merge_candidates;"
```

- [ ] Commit:

```bash
git add migrations/0054_contacts_system.sql
git commit -m "feat(contacts): add contacts, appointments, contact_ledger_entries tables + migration"
```

---

### Task 1.2: Add Drizzle schema definitions

**Files:**
- Modify: `src/server/schema.ts` (append four new table exports)

- [ ] Append to `src/server/schema.ts` after the last existing export:

```typescript
// ─── Contacts system ────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id:                     id(),
  name:                   varchar('name', { length: 180 }).notNull(),
  displayName:            varchar('display_name', { length: 180 }),
  phone:                  varchar('phone', { length: 40 }),
  secondaryPhone:         varchar('secondary_phone', { length: 40 }),
  email:                  varchar('email', { length: 240 }),
  address:                text('address'),
  companyName:            varchar('company_name', { length: 180 }),
  contactKind:            varchar('contact_kind', { length: 20 }).notNull().default('individual'),
  preferredContactMethod: varchar('preferred_contact_method', { length: 20 }).notNull().default('any'),
  notes:                  text('notes'),
  tags:                   text('tags').array().notNull().default([]),
  isCustomer:             boolean('is_customer').notNull().default(false),
  isVendor:               boolean('is_vendor').notNull().default(false),
  isReferee:              boolean('is_referee').notNull().default(false),
  isProcessor:            boolean('is_processor').notNull().default(false),
  isContractor:           boolean('is_contractor').notNull().default(false),
  isEmployee:             boolean('is_employee').notNull().default(false),
  active:                 boolean('active').notNull().default(true),
  archivedAt:             timestamp('archived_at', { withTimezone: true }),
  archivedBy:             uuid('archived_by').references(() => users.id),
  archivedReason:         text('archived_reason'),
  createdAt:              now(),
  updatedAt:              updated(),
});

export const appointments = pgTable('appointments', {
  id:              id(),
  contactId:       uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  title:           varchar('title', { length: 240 }).notNull(),
  description:     text('description'),
  startsAt:        timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt:          timestamp('ends_at', { withTimezone: true }),
  appointmentType: varchar('appointment_type', { length: 40 }).notNull().default('meeting'),
  status:          varchar('status', { length: 32 }).notNull().default('scheduled'),
  location:        text('location'),
  createdBy:       uuid('created_by').references(() => users.id),
  notes:           text('notes'),
  createdAt:       now(),
  updatedAt:       updated(),
});

export const contactLedgerEntries = pgTable('contact_ledger_entries', {
  id:        id(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  kind:      varchar('kind', { length: 48 }).notNull(),
  amount:    numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method:    varchar('method', { length: 32 }),
  reference: varchar('reference', { length: 120 }),
  note:      text('note'),
  commandId: uuid('command_id'),
  createdAt: now(),
});

export const contactMergeCandidates = pgTable('contact_merge_candidates', {
  id:          id(),
  contactAId:  uuid('contact_a_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  contactBId:  uuid('contact_b_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  matchReason: varchar('match_reason', { length: 80 }).notNull(),
  reviewed:    boolean('reviewed').notNull().default(false),
  dismissed:   boolean('dismissed').notNull().default(false),
  mergedInto:  uuid('merged_into').references(() => contacts.id),
  createdAt:   now(),
});
```

- [ ] Also add `contact_id` to the existing `customers`, `vendors`, `referees`, `payment_processors`, `users` table definitions:

In the `customers` pgTable definition, add:
```typescript
  contactId: uuid('contact_id').references(() => contacts.id).unique(),
```

In `vendors`, `referees`, `payment_processors`, `users` — same line, same pattern.

- [ ] Verify TypeScript compiles with the new schema:

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] Commit:

```bash
git add src/server/schema.ts
git commit -m "feat(contacts): add Drizzle schema for contacts, appointments, contact_ledger_entries"
```

---

## Phase 2: Shared Layer

### Task 2.1: Update shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] Add `'contacts'` to the `ViewKey` union (after `'photography'`, before `'settings'`):

```typescript
// In the ViewKey type union, add:
  | 'contacts'
```

- [ ] Add contact-specific type aliases after the existing types:

```typescript
export type ContactKind = 'individual' | 'business';
export type ContactRole = 'customer' | 'vendor' | 'referee' | 'processor' | 'contractor' | 'employee';
export type AppointmentType = 'meeting' | 'call' | 'delivery' | 'pickup' | 'vacation' | 'job' | 'other';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type PreferredContactMethod = 'email' | 'phone' | 'text' | 'any';
```

- [ ] Commit:

```bash
git add src/shared/types.ts
git commit -m "feat(contacts): add ContactKind, ContactRole, AppointmentType to shared types"
```

---

### Task 2.2: Add commands to commandCatalog

**Files:**
- Modify: `src/shared/commandCatalog.ts`

- [ ] Add 12 new command names to the `commandNames` array (append before the closing `] as const`):

```typescript
  'createContact',
  'updateContact',
  'archiveContact',
  'addContactRole',
  'linkContactToExistingEntity',
  'linkContactToUser',
  'createAppointment',
  'updateAppointment',
  'cancelAppointment',
  'completeAppointment',
  'updateVendor',
  'updateProcessor',
```

- [ ] Add to `commandLabels`:

```typescript
  createContact:               'Create contact',
  updateContact:               'Update contact',
  archiveContact:              'Archive contact',
  addContactRole:              'Add role to contact',
  linkContactToExistingEntity: 'Link contact to existing entity',
  linkContactToUser:           'Link contact to user account',
  createAppointment:           'Create appointment',
  updateAppointment:           'Update appointment',
  cancelAppointment:           'Cancel appointment',
  completeAppointment:         'Complete appointment',
  updateVendor:                'Update vendor',
  updateProcessor:             'Update processor',
```

- [ ] Add to `commandMinRole` (the `Record<CommandName, Role>` map):

```typescript
  createContact:               'operator',
  updateContact:               'operator',
  archiveContact:              'manager',
  addContactRole:              'manager',
  linkContactToExistingEntity: 'manager',
  linkContactToUser:           'owner',
  createAppointment:           'operator',
  updateAppointment:           'operator',
  cancelAppointment:           'operator',
  completeAppointment:         'operator',
  updateVendor:                'operator',
  updateProcessor:             'owner',
```

- [ ] Add to `reversalPolicies`:

```typescript
  createContact:               { disposition: 'terminal',    guidance: 'Use archiveContact to deactivate.' },
  updateContact:               { disposition: 'offsettable', guidance: 'Run updateContact again with prior values.' },
  archiveContact:              { disposition: 'terminal',    guidance: 'Cannot be reversed; create a new contact.' },
  addContactRole:              { disposition: 'terminal',    guidance: 'Role additions are permanent.' },
  linkContactToExistingEntity: { disposition: 'offsettable', guidance: 'Unlink by setting contact_id = null directly or via admin tool.' },
  linkContactToUser:           { disposition: 'offsettable', guidance: 'Unlink by setting users.contact_id = null.' },
  createAppointment:           { disposition: 'reversible',  guidance: 'Use cancelAppointment.' },
  updateAppointment:           { disposition: 'offsettable', guidance: 'Run updateAppointment with prior values.' },
  cancelAppointment:           { disposition: 'terminal',    guidance: 'Cannot be reversed; create a new appointment.' },
  completeAppointment:         { disposition: 'terminal',    guidance: 'Cannot be reversed.' },
  updateVendor:                { disposition: 'offsettable', guidance: 'Run updateVendor with prior values.' },
  updateProcessor:             { disposition: 'offsettable', guidance: 'Run updateProcessor with prior values.' },
```

- [ ] Verify TypeScript:

```bash
pnpm typecheck
```

Expected: 0 errors. If `CommandName` is used as a key type anywhere, the new names will auto-populate.

- [ ] Commit:

```bash
git add src/shared/commandCatalog.ts
git commit -m "feat(contacts): add 12 new commands to commandCatalog"
```

---

### Task 2.3: Add Zod payload schemas

**Files:**
- Modify: `src/shared/schemas.ts`

- [ ] Write failing test first in `src/tests/contactSchemas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  createContactPayloadSchema,
  updateContactPayloadSchema,
  archiveContactPayloadSchema,
  createAppointmentPayloadSchema,
  updateVendorPayloadSchema,
} from '../shared/schemas';

describe('createContactPayloadSchema', () => {
  it('rejects missing name', () => {
    expect(() => createContactPayloadSchema.parse({ roles: ['customer'] })).toThrow(ZodError);
  });
  it('rejects empty roles array', () => {
    expect(() => createContactPayloadSchema.parse({ name: 'Test', roles: [] })).toThrow(ZodError);
  });
  it('accepts minimal valid payload', () => {
    const result = createContactPayloadSchema.parse({ name: 'ACME Corp', roles: ['customer'] });
    expect(result.name).toBe('ACME Corp');
    expect(result.roles).toContain('customer');
  });
  it('accepts multi-role payload with role-specific fields', () => {
    const result = createContactPayloadSchema.parse({
      name: 'Dual Corp', roles: ['customer', 'vendor'],
      creditLimit: 5000, termsDays: 30,
    });
    expect(result.creditLimit).toBe(5000);
  });
});

describe('createAppointmentPayloadSchema', () => {
  it('rejects missing contactId', () => {
    expect(() => createAppointmentPayloadSchema.parse({ title: 'Meeting', appointmentType: 'meeting', startsAt: new Date().toISOString() })).toThrow(ZodError);
  });
  it('accepts valid appointment', () => {
    const result = createAppointmentPayloadSchema.parse({
      contactId: 'a0000000-0000-0000-0000-000000000000',
      title: 'Client call',
      appointmentType: 'call',
      startsAt: new Date().toISOString(),
    });
    expect(result.title).toBe('Client call');
  });
});

describe('updateVendorPayloadSchema', () => {
  it('rejects missing vendorId', () => {
    expect(() => updateVendorPayloadSchema.parse({ name: 'New Name' })).toThrow(ZodError);
  });
  it('accepts partial update', () => {
    const result = updateVendorPayloadSchema.parse({ vendorId: 'a0000000-0000-0000-0000-000000000000', termsDays: 21 });
    expect(result.termsDays).toBe(21);
  });
});
```

- [ ] Run test to confirm it fails:

```bash
pnpm test src/tests/contactSchemas.test.ts
```

Expected: fails with import errors (schemas don't exist yet).

- [ ] Add schemas to `src/shared/schemas.ts`:

```typescript
import { z } from 'zod';
import type { ContactRole, AppointmentType } from './types';

const contactRoles: [ContactRole, ...ContactRole[]] = ['customer','vendor','referee','processor','contractor','employee'];
const appointmentTypes: [AppointmentType, ...AppointmentType[]] = ['meeting','call','delivery','pickup','vacation','job','other'];

export const createContactPayloadSchema = z.object({
  name:                   z.string().min(1).max(180),
  displayName:            z.string().max(180).optional(),
  phone:                  z.string().max(40).optional(),
  secondaryPhone:         z.string().max(40).optional(),
  email:                  z.string().email().max(240).optional(),
  address:                z.string().optional(),
  companyName:            z.string().max(180).optional(),
  contactKind:            z.enum(['individual', 'business']).default('individual'),
  preferredContactMethod: z.enum(['email','phone','text','any']).default('any'),
  notes:                  z.string().optional(),
  tags:                   z.array(z.string()).default([]),
  roles:                  z.array(z.enum(contactRoles)).min(1),
  // Role-specific optional fields
  creditLimit:            z.number().min(0).optional(),
  termsDays:              z.number().int().min(0).max(365).optional(),
  consignmentDefault:     z.boolean().optional(),
});

export const updateContactPayloadSchema = z.object({
  contactId:              z.string().uuid(),
  name:                   z.string().min(1).max(180).optional(),
  displayName:            z.string().max(180).nullish(),
  phone:                  z.string().max(40).nullish(),
  secondaryPhone:         z.string().max(40).nullish(),
  email:                  z.string().email().max(240).nullish(),
  address:                z.string().nullish(),
  companyName:            z.string().max(180).nullish(),
  contactKind:            z.enum(['individual', 'business']).optional(),
  preferredContactMethod: z.enum(['email','phone','text','any']).optional(),
  notes:                  z.string().nullish(),
});

export const archiveContactPayloadSchema = z.object({
  contactId: z.string().uuid(),
  reason:    z.string().min(1),
});

export const addContactRolePayloadSchema = z.object({
  contactId:          z.string().uuid(),
  role:               z.enum(contactRoles),
  creditLimit:        z.number().min(0).optional(),
  termsDays:          z.number().int().min(0).max(365).optional(),
  consignmentDefault: z.boolean().optional(),
});

export const linkContactToExistingEntityPayloadSchema = z.object({
  contactId:  z.string().uuid(),
  entityType: z.enum(['customer','vendor','referee','processor']),
  entityId:   z.string().uuid(),
});

export const linkContactToUserPayloadSchema = z.object({
  contactId: z.string().uuid(),
  userId:    z.string().uuid(),
});

export const createAppointmentPayloadSchema = z.object({
  contactId:       z.string().uuid(),
  title:           z.string().min(1).max(240),
  appointmentType: z.enum(appointmentTypes).default('meeting'),
  startsAt:        z.string().datetime(),
  endsAt:          z.string().datetime().optional(),
  location:        z.string().optional(),
  description:     z.string().optional(),
  notes:           z.string().optional(),
});

export const updateAppointmentPayloadSchema = z.object({
  appointmentId:   z.string().uuid(),
  title:           z.string().min(1).max(240).optional(),
  appointmentType: z.enum(appointmentTypes).optional(),
  startsAt:        z.string().datetime().optional(),
  endsAt:          z.string().datetime().nullish(),
  location:        z.string().nullish(),
  description:     z.string().nullish(),
  notes:           z.string().nullish(),
});

export const cancelAppointmentPayloadSchema = z.object({
  appointmentId: z.string().uuid(),
  reason:        z.string().optional(),
});

export const completeAppointmentPayloadSchema = z.object({
  appointmentId: z.string().uuid(),
  notes:         z.string().optional(),
});

export const updateVendorPayloadSchema = z.object({
  vendorId:           z.string().uuid(),
  name:               z.string().min(1).max(180).optional(),
  alias:              z.string().max(80).nullish(),
  termsDays:          z.number().int().min(0).max(365).optional(),
  consignmentDefault: z.boolean().optional(),
  contact:            z.string().nullish(),
  notes:              z.string().nullish(),
});

export const updateProcessorPayloadSchema = z.object({
  processorId:           z.string().uuid(),
  name:                  z.string().min(1).max(180).optional(),
  processorType:         z.string().optional(),
  feeType:               z.string().optional(),
  feePercentage:         z.number().min(0).max(100).optional(),
  feeFixedAmount:        z.number().min(0).optional(),
  defaultUserSplit:      z.number().min(0).max(100).optional(),
  defaultProcessorSplit: z.number().min(0).max(100).optional(),
  notes:                 z.string().nullish(),
  active:                z.boolean().optional(),
});
```

- [ ] Run test to confirm it passes:

```bash
pnpm test src/tests/contactSchemas.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add src/shared/schemas.ts src/tests/contactSchemas.test.ts
git commit -m "feat(contacts): add Zod schemas for all contact/appointment commands"
```

---

## Phase 3: Backend Commands

### Task 3.1: Implement createContact, updateContact, archiveContact

**Files:**
- Modify: `src/server/services/commandBus.ts`

- [ ] Add `contacts`, `appointments`, `contactLedgerEntries` to the imports at the top of `commandBus.ts` (alongside existing schema imports):

```typescript
import { contacts, appointments, contactLedgerEntries, contactMergeCandidates } from '../schema';
```

- [ ] Add `createContact` case in the main `switch (command.name)` block:

```typescript
case 'createContact': {
  const { name, displayName, phone, secondaryPhone, email, address, companyName,
          contactKind, preferredContactMethod, notes, tags, roles,
          creditLimit, termsDays, consignmentDefault } = createContactPayloadSchema.parse(payload);

  // Build role flags
  const roleFlags = {
    isCustomer:   roles.includes('customer'),
    isVendor:     roles.includes('vendor'),
    isReferee:    roles.includes('referee'),
    isProcessor:  roles.includes('processor'),
    isContractor: roles.includes('contractor'),
    isEmployee:   roles.includes('employee'),
  };

  const [contact] = await tx.insert(contacts).values({
    name, displayName, phone, secondaryPhone, email, address, companyName,
    contactKind: contactKind ?? 'individual',
    preferredContactMethod: preferredContactMethod ?? 'any',
    notes, tags: tags ?? [],
    ...roleFlags,
  }).returning();

  const affectedIds = [contact.id];

  // Create linked customer record if customer role
  if (roleFlags.isCustomer) {
    const [cust] = await tx.insert(customers).values({
      name,
      creditLimit: String(creditLimit ?? 0),
      balance: '0',
      tags: tags ?? [],
      notes,
      contactId: contact.id,
    }).returning();
    affectedIds.push(cust.id);
  }

  // Create linked vendor record if vendor role
  if (roleFlags.isVendor) {
    const [vend] = await tx.insert(vendors).values({
      name,
      termsDays: termsDays ?? 14,
      consignmentDefault: consignmentDefault ?? false,
      notes,
      contactId: contact.id,
    }).returning();
    affectedIds.push(vend.id);
  }

  return { ok: true, affectedIds, toast: `Contact "${name}" created` };
}
```

- [ ] Add `updateContact` case:

```typescript
case 'updateContact': {
  const { contactId, ...fields } = updateContactPayloadSchema.parse(payload);
  const updateData: Record<string, unknown> = {};
  if (fields.name !== undefined)                   updateData.name = fields.name;
  if (fields.displayName !== undefined)            updateData.displayName = fields.displayName;
  if (fields.phone !== undefined)                  updateData.phone = fields.phone;
  if (fields.secondaryPhone !== undefined)         updateData.secondaryPhone = fields.secondaryPhone;
  if (fields.email !== undefined)                  updateData.email = fields.email;
  if (fields.address !== undefined)                updateData.address = fields.address;
  if (fields.companyName !== undefined)            updateData.companyName = fields.companyName;
  if (fields.contactKind !== undefined)            updateData.contactKind = fields.contactKind;
  if (fields.preferredContactMethod !== undefined) updateData.preferredContactMethod = fields.preferredContactMethod;
  if (fields.notes !== undefined)                  updateData.notes = fields.notes;

  await tx.update(contacts).set(updateData).where(eq(contacts.id, contactId));
  return { ok: true, affectedIds: [contactId], toast: 'Contact updated' };
}
```

- [ ] Add `archiveContact` case with per-role guards:

```typescript
case 'archiveContact': {
  const { contactId, reason } = archiveContactPayloadSchema.parse(payload);

  const contactRows = await tx.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  const contact = contactRows[0];
  if (!contact) throw new Error('Contact not found');

  // Guard: customer has open invoices
  if (contact.isCustomer) {
    const [custRow] = await tx.select({ id: customers.id }).from(customers)
      .where(eq(customers.contactId, contactId)).limit(1);
    if (custRow) {
      const openInvResult = await pool.query(
        `SELECT 1 FROM invoices WHERE customer_id = $1 AND status IN ('open','partial') LIMIT 1`,
        [custRow.id]
      );
      if (openInvResult.rows.length > 0) throw new Error('Cannot archive: customer has open invoices');
    }
  }

  // Guard: vendor has open bills
  if (contact.isVendor) {
    const [vendRow] = await tx.select({ id: vendors.id }).from(vendors)
      .where(eq(vendors.contactId, contactId)).limit(1);
    if (vendRow) {
      const openBillResult = await pool.query(
        `SELECT 1 FROM vendor_bills WHERE vendor_id = $1 AND status NOT IN ('paid','void','cancelled') LIMIT 1`,
        [vendRow.id]
      );
      if (openBillResult.rows.length > 0) throw new Error('Cannot archive: vendor has unpaid bills');
    }
  }

  // Guard: referee has active relationships
  if (contact.isReferee) {
    const [refRow] = await tx.select({ id: referees.id }).from(referees)
      .where(eq(referees.contactId, contactId)).limit(1);
    if (refRow) {
      const activeRelResult = await pool.query(
        `SELECT 1 FROM referee_relationships WHERE referee_id = $1 AND active = true LIMIT 1`,
        [refRow.id]
      );
      if (activeRelResult.rows.length > 0) throw new Error('Cannot archive: referee has active relationships');
    }
  }

  // Guard: contractor/employee has outstanding ledger balance
  if (contact.isContractor || contact.isEmployee) {
    const [balResult] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM contact_ledger_entries WHERE contact_id = $1`,
      [contactId]
    );
    // Amounts in contact_ledger_entries are stored negative (money paid OUT to contact).
    // SUM < 0 means money is owed to the contact; block archive in that case.
    if (Number(balResult.rows[0]?.balance ?? 0) < 0) {
      throw new Error('Cannot archive: contact has outstanding balance owed');
    }
  }

  await tx.update(contacts).set({
    active: false,
    archivedAt: new Date(),
    archivedBy: user.id,
    archivedReason: reason,
  }).where(eq(contacts.id, contactId));

  return { ok: true, affectedIds: [contactId], toast: 'Contact archived' };
}
```

- [ ] Commit:

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(contacts): add createContact, updateContact, archiveContact command handlers"
```

---

### Task 3.2: Implement role-link and appointment commands

**Files:**
- Modify: `src/server/services/commandBus.ts`

- [ ] Add `addContactRole` case:

```typescript
case 'addContactRole': {
  const { contactId, role, creditLimit, termsDays, consignmentDefault } = addContactRolePayloadSchema.parse(payload);
  const flagField = `is${role.charAt(0).toUpperCase() + role.slice(1)}` as keyof typeof contacts.$inferInsert;

  await tx.update(contacts).set({ [flagField]: true }).where(eq(contacts.id, contactId));

  const [contact] = await tx.select({ name: contacts.name })
    .from(contacts).where(eq(contacts.id, contactId)).limit(1);
  const affectedIds = [contactId];

  if (role === 'customer') {
    const [cust] = await tx.insert(customers).values({
      name: contact.name, creditLimit: String(creditLimit ?? 0), balance: '0',
      tags: [], contactId,
    }).returning();
    affectedIds.push(cust.id);
  } else if (role === 'vendor') {
    const [vend] = await tx.insert(vendors).values({
      name: contact.name, termsDays: termsDays ?? 14,
      consignmentDefault: consignmentDefault ?? false, contactId,
    }).returning();
    affectedIds.push(vend.id);
  }

  return { ok: true, affectedIds, toast: `Role "${role}" added to contact` };
}
```

- [ ] Add `linkContactToExistingEntity` case:

```typescript
case 'linkContactToExistingEntity': {
  const { contactId, entityType, entityId } = linkContactToExistingEntityPayloadSchema.parse(payload);

  if (entityType === 'customer') {
    const [existing] = await tx.select({ contactId: customers.contactId })
      .from(customers).where(eq(customers.id, entityId)).limit(1);
    if (existing?.contactId) throw new Error('This customer is already linked to a contact');
    await tx.update(customers).set({ contactId }).where(eq(customers.id, entityId));
    await tx.update(contacts).set({ isCustomer: true }).where(eq(contacts.id, contactId));
  } else if (entityType === 'vendor') {
    const [existing] = await tx.select({ contactId: vendors.contactId })
      .from(vendors).where(eq(vendors.id, entityId)).limit(1);
    if (existing?.contactId) throw new Error('This vendor is already linked to a contact');
    await tx.update(vendors).set({ contactId }).where(eq(vendors.id, entityId));
    await tx.update(contacts).set({ isVendor: true }).where(eq(contacts.id, contactId));
  } else if (entityType === 'referee') {
    await tx.update(referees).set({ contactId }).where(eq(referees.id, entityId));
    await tx.update(contacts).set({ isReferee: true }).where(eq(contacts.id, contactId));
  } else if (entityType === 'processor') {
    await tx.update(paymentProcessors).set({ contactId }).where(eq(paymentProcessors.id, entityId));
    await tx.update(contacts).set({ isProcessor: true }).where(eq(contacts.id, contactId));
  }

  return { ok: true, affectedIds: [contactId, entityId], toast: 'Contact linked' };
}
```

- [ ] Add `linkContactToUser` case:

```typescript
case 'linkContactToUser': {
  const { contactId, userId } = linkContactToUserPayloadSchema.parse(payload);
  const [existing] = await tx.select({ contactId: users.contactId })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (existing?.contactId) throw new Error('This user is already linked to a contact');
  await tx.update(users).set({ contactId }).where(eq(users.id, userId));
  await tx.update(contacts).set({ isEmployee: true }).where(eq(contacts.id, contactId));
  return { ok: true, affectedIds: [contactId, userId], toast: 'User account linked to contact' };
}
```

- [ ] Add appointment cases:

```typescript
case 'createAppointment': {
  const parsed = createAppointmentPayloadSchema.parse(payload);
  const [appt] = await tx.insert(appointments).values({
    contactId:       parsed.contactId,
    title:           parsed.title,
    appointmentType: parsed.appointmentType ?? 'meeting',
    startsAt:        new Date(parsed.startsAt),
    endsAt:          parsed.endsAt ? new Date(parsed.endsAt) : null,
    location:        parsed.location ?? null,
    description:     parsed.description ?? null,
    notes:           parsed.notes ?? null,
    createdBy:       user.id,
  }).returning();
  return { ok: true, affectedIds: [appt.id, parsed.contactId], toast: 'Appointment added' };
}

case 'updateAppointment': {
  const { appointmentId, ...fields } = updateAppointmentPayloadSchema.parse(payload);
  const [existing] = await tx.select({ status: appointments.status })
    .from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!existing) throw new Error('Appointment not found');
  if (existing.status !== 'scheduled') throw new Error('Only scheduled appointments can be updated');
  const updateData: Record<string, unknown> = {};
  if (fields.title !== undefined)           updateData.title = fields.title;
  if (fields.appointmentType !== undefined) updateData.appointmentType = fields.appointmentType;
  if (fields.startsAt !== undefined)        updateData.startsAt = new Date(fields.startsAt);
  if (fields.endsAt !== undefined)          updateData.endsAt = fields.endsAt ? new Date(fields.endsAt) : null;
  if (fields.location !== undefined)        updateData.location = fields.location;
  if (fields.description !== undefined)     updateData.description = fields.description;
  if (fields.notes !== undefined)           updateData.notes = fields.notes;
  await tx.update(appointments).set(updateData).where(eq(appointments.id, appointmentId));
  return { ok: true, affectedIds: [appointmentId], toast: 'Appointment updated' };
}

case 'cancelAppointment': {
  const { appointmentId, reason } = cancelAppointmentPayloadSchema.parse(payload);
  await tx.update(appointments)
    .set({ status: 'cancelled', notes: reason ?? null })
    .where(eq(appointments.id, appointmentId));
  return { ok: true, affectedIds: [appointmentId], toast: 'Appointment cancelled' };
}

case 'completeAppointment': {
  const { appointmentId, notes: completionNotes } = completeAppointmentPayloadSchema.parse(payload);
  await tx.update(appointments)
    .set({ status: 'completed', notes: completionNotes ?? null })
    .where(eq(appointments.id, appointmentId));
  return { ok: true, affectedIds: [appointmentId], toast: 'Appointment completed' };
}
```

- [ ] Add `updateVendor` case:

```typescript
case 'updateVendor': {
  const { vendorId, ...fields } = updateVendorPayloadSchema.parse(payload);
  const updateData: Record<string, unknown> = {};
  if (fields.name !== undefined)               updateData.name = fields.name;
  if (fields.alias !== undefined)              updateData.alias = fields.alias;
  if (fields.termsDays !== undefined)          updateData.termsDays = fields.termsDays;
  if (fields.consignmentDefault !== undefined) updateData.consignmentDefault = fields.consignmentDefault;
  if (fields.contact !== undefined)            updateData.contact = fields.contact;
  if (fields.notes !== undefined)              updateData.notes = fields.notes;
  await tx.update(vendors).set(updateData).where(eq(vendors.id, vendorId));
  return { ok: true, affectedIds: [vendorId], toast: 'Vendor updated' };
}
```

- [ ] Add `updateProcessor` case:

```typescript
case 'updateProcessor': {
  const { processorId, ...fields } = updateProcessorPayloadSchema.parse(payload);
  const updateData: Record<string, unknown> = {};
  if (fields.name !== undefined)                  updateData.name = fields.name;
  if (fields.processorType !== undefined)          updateData.processorType = fields.processorType;
  if (fields.feeType !== undefined)                updateData.feeType = fields.feeType;
  if (fields.feePercentage !== undefined)          updateData.feePercentage = String(fields.feePercentage);
  if (fields.feeFixedAmount !== undefined)         updateData.feeFixedAmount = String(fields.feeFixedAmount);
  if (fields.defaultUserSplit !== undefined)       updateData.defaultUserSplit = String(fields.defaultUserSplit);
  if (fields.defaultProcessorSplit !== undefined)  updateData.defaultProcessorSplit = String(fields.defaultProcessorSplit);
  if (fields.notes !== undefined)                  updateData.notes = fields.notes;
  if (fields.active !== undefined)                 updateData.active = fields.active;
  await tx.update(paymentProcessors).set(updateData).where(eq(paymentProcessors.id, processorId));
  return { ok: true, affectedIds: [processorId], toast: 'Processor updated' };
}
```

- [ ] Extend the existing `postTransactionLedgerRow` handler. Find the function and add a new branch for `entityType === 'contact'` before the existing `entityType === 'customer'` branch:

```typescript
// Add at the top of the postTransactionLedgerRow function, before entityType === 'customer':
if (entityType === 'contact') {
  const contactId = requiredId(payload.entityId, 'entityId');
  const kind = stringValue(payload.kind) || 'payment_out';
  const signedAmount = -Math.abs(amount); // contact ledger: positive = owed to contact

  const [entry] = await tx.insert(contactLedgerEntries).values({
    contactId,
    kind,
    amount: String(signedAmount),
    method: method ?? null,
    reference: reference ?? null,
    note: notes ?? null,
    commandId,
  }).returning();

  return { ok: true, affectedIds: [entry.id, contactId], toast: `Payment of $${Math.abs(amount).toFixed(2)} recorded` };
}
```

- [ ] Verify typecheck:

```bash
pnpm typecheck
```

- [ ] Commit:

```bash
git add src/server/services/commandBus.ts
git commit -m "feat(contacts): add all contact/appointment command handlers + contact branch in postTransactionLedgerRow"
```

---

## Phase 4: Backend Queries

### Task 4.1: Add contactDirectory, contactProfile, contactAppointments, contactLedger queries

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] Add `contactDirectory` query (cursor-paginated, KPI stubs via LEFT JOINs):

```typescript
contactDirectory: protectedProcedure
  .input(z.object({
    limit:      z.number().int().min(1).max(100).default(50),
    cursor:     z.string().uuid().optional(),
    roleFilter: z.array(z.enum(["customer","vendor","referee","processor","contractor","employee"])).optional(),
    query:      z.string().optional(),
  }))
  .query(async ({ input }) => {
    const { limit, cursor, roleFilter, query: searchQuery } = input;

    // Cursor is encoded as "updatedAt_ISO|uuid" for stable keyset pagination
    // (avoids skipping rows when multiple contacts share the same updated_at timestamp,
    //  which happens after bulk migration where all contacts get the same timestamp).
    let cursorTs: string | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      const parts = cursor.split('|');
      cursorTs = parts[0] ?? null;
      cursorId = parts[1] ?? null;
    }

    let sql = `
      SELECT
        c.id, c.name, c.display_name AS "displayName", c.company_name AS "companyName",
        c.phone, c.email, c.active,
        c.is_customer AS "isCustomer", c.is_vendor AS "isVendor",
        c.is_referee AS "isReferee", c.is_processor AS "isProcessor",
        c.is_contractor AS "isContractor", c.is_employee AS "isEmployee",
        c.tags, c.updated_at AS "updatedAt",
        cu.balance AS "customerBalance", cu.credit_limit AS "customerCreditLimit",
        COALESCE(vb.open_bills_amount, 0) AS "vendorOpenBills"
      FROM contacts c
      LEFT JOIN customers cu ON cu.contact_id = c.id
      LEFT JOIN (
        SELECT v.contact_id, SUM(vb.amount - vb.amount_paid) AS open_bills_amount
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        WHERE vb.status IN ('approved','scheduled')
        GROUP BY v.contact_id
      ) vb ON vb.contact_id = c.id
      WHERE c.active = true
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (cursorTs && cursorId) {
      sql += ` AND (c.updated_at, c.id) < ($${idx}::timestamptz, $${idx+1}::uuid)`;
      params.push(cursorTs, cursorId); idx += 2;
    }
    if (searchQuery) { sql += ` AND (lower(c.name) LIKE $${idx} OR lower(c.email) LIKE $${idx})`; params.push(`%${searchQuery.toLowerCase()}%`); idx++; }
    if (roleFilter?.length) {
      const ROLE_COL_MAP: Record<string, string> = {
        customer: 'is_customer', vendor: 'is_vendor', referee: 'is_referee',
        processor: 'is_processor', contractor: 'is_contractor', employee: 'is_employee',
      };
      const conditions = roleFilter
        .filter((r) => r in ROLE_COL_MAP)
        .map((r) => `c.${ROLE_COL_MAP[r]} = true`)
        .join(' OR ');
      sql += ` AND (${conditions})`;
    }

    sql += ` ORDER BY c.updated_at DESC, c.id DESC LIMIT $${idx}`;
    params.push(limit + 1);

    const result = await pool.query(sql, params);
    const rows = result.rows;
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow
      ? `${new Date(lastRow.updatedAt).toISOString()}|${lastRow.id}`
      : null;
    return { rows, nextCursor };
  }),
```

- [ ] Add `contactProfile` query:

```typescript
contactProfile: protectedProcedure
  .input(z.object({ contactId: z.string().uuid() }))
  .query(async ({ input: { contactId } }) => {
    const [contactRow] = await pool.query(
      `SELECT * FROM contacts WHERE id = $1`, [contactId]
    );
    const contact = contactRow.rows[0];
    if (!contact) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });

    const [customerRow, vendorRow, refereeRow, processorRow, userRow, orderStats, creditStatus] = await Promise.all([
      contact.is_customer
        ? pool.query(`SELECT cu.*, COUNT(DISTINCT so.id) AS lifetime_order_count,
            COALESCE(SUM(so.total), 0) AS lifetime_revenue,
            COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('open','partial')) AS open_invoices_count,
            COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status IN ('open','partial')), 0) AS open_invoices_amount,
            COALESCE(MAX(EXTRACT(DAY FROM NOW() - i.created_at)) FILTER (WHERE i.status IN ('open','partial')), 0) AS oldest_open_invoice_days,
            MAX(so.created_at) AS last_order_date
          FROM customers cu
          LEFT JOIN sales_orders so ON so.customer_id = cu.id
          LEFT JOIN invoices i ON i.customer_id = cu.id
          WHERE cu.contact_id = $1 GROUP BY cu.id`, [contactId])
        : Promise.resolve({ rows: [] }),
      contact.is_vendor
        ? pool.query(`SELECT v.*,
            COALESCE(SUM(vb.amount_paid), 0) AS total_paid,
            COUNT(DISTINCT vb.id) FILTER (WHERE vb.status NOT IN ('paid','void','cancelled')) AS open_bills_count,
            COALESCE(SUM(vb.amount - vb.amount_paid) FILTER (WHERE vb.status NOT IN ('paid','void','cancelled')), 0) AS open_bills_amount,
            COUNT(DISTINCT po.id) FILTER (WHERE po.status NOT IN ('received','cancelled')) AS open_po_count
          FROM vendors v
          LEFT JOIN vendor_bills vb ON vb.vendor_id = v.id
          LEFT JOIN purchase_orders po ON po.vendor_id = v.id
          WHERE v.contact_id = $1 GROUP BY v.id`, [contactId])
        : Promise.resolve({ rows: [] }),
      contact.is_referee
        ? pool.query(`SELECT * FROM referees WHERE contact_id = $1 LIMIT 1`, [contactId])
        : Promise.resolve({ rows: [] }),
      contact.is_processor
        ? pool.query(`SELECT * FROM payment_processors WHERE contact_id = $1 LIMIT 1`, [contactId])
        : Promise.resolve({ rows: [] }),
      contact.is_employee
        ? pool.query(`SELECT id, name, email, role, work_loop AS "workLoop" FROM users WHERE contact_id = $1 LIMIT 1`, [contactId])
        : Promise.resolve({ rows: [] }),
      pool.query(`SELECT COUNT(*) AS upcoming_count FROM appointments WHERE contact_id = $1 AND starts_at > NOW() AND status = 'scheduled'`, [contactId]),
      Promise.resolve(null), // credit status fetched separately if needed
    ]);

    return {
      contact,
      customer: customerRow.rows[0] ?? null,
      vendor:   vendorRow.rows[0]   ?? null,
      referee:  refereeRow.rows[0]  ?? null,
      processor: processorRow.rows[0] ?? null,
      user:     userRow.rows[0]     ?? null,
      upcomingAppointmentCount: Number(orderStats.rows[0]?.upcoming_count ?? 0),
    };
  }),
```

- [ ] Add `contactAppointments` query:

```typescript
contactAppointments: protectedProcedure
  .input(z.object({ contactId: z.string().uuid() }))
  .query(async ({ input: { contactId } }) => {
    const [upcomingResult, pastResult] = await Promise.all([
      pool.query(
        `SELECT * FROM appointments WHERE contact_id = $1 AND starts_at > NOW() AND status = 'scheduled' ORDER BY starts_at ASC`,
        [contactId]
      ),
      pool.query(
        `SELECT * FROM appointments WHERE contact_id = $1 AND (starts_at <= NOW() OR status IN ('completed','cancelled')) ORDER BY starts_at DESC LIMIT 50`,
        [contactId]
      ),
    ]);
    return {
      upcoming: upcomingResult.rows,
      past:     pastResult.rows,
    };
  }),
```

- [ ] Add `contactLedger` query (window function for running balance):

```typescript
contactLedger: protectedProcedure
  .input(z.object({
    contactId: z.string().uuid(),
    limit:     z.number().int().min(1).max(200).default(50),
    cursor:    z.string().optional(),
  }))
  .query(async ({ input: { contactId, limit, cursor } }) => {
    const result = await pool.query(
      `SELECT id, kind, amount, method, reference, note, created_at,
        SUM(amount) OVER (PARTITION BY contact_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
       FROM contact_ledger_entries
       WHERE contact_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [contactId, limit]
    );
    return { rows: result.rows, nextCursor: null };
  }),
```

- [ ] Add `customerOrderHistory` query:

```typescript
customerOrderHistory: protectedProcedure
  .input(z.object({
    customerId: z.string().uuid(),
    limit:      z.number().int().min(1).max(200).default(50),
    cursor:     z.string().uuid().optional(),
  }))
  .query(async ({ input: { customerId, limit } }) => {
    const result = await pool.query(
      `SELECT id, order_no AS "orderNo", created_at AS "createdAt",
        (SELECT COUNT(*) FROM sales_order_lines WHERE sales_order_lines.order_id = sales_orders.id) AS line_count,
        total, status, posted_at AS "postedAt"
       FROM sales_orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [customerId, limit]
    );
    return { rows: result.rows };
  }),
```

- [ ] Extend `relatedCommands` to accept optional `contactId`. Find the existing `relatedCommands` procedure and modify its input schema and query:

```typescript
// Change input from:
.input(z.object({ entityId: z.string().uuid() }))
// To:
.input(z.object({ entityId: z.string().uuid().optional(), contactId: z.string().uuid().optional() }))

// Then build the ID list for the query:
// If contactId provided, look up all linked entity IDs and union them
```

The body of the modification: after the input change, add logic to expand IDs:
```typescript
  .query(async ({ input }) => {
    let entityIds: string[] = [];
    if (input.entityId) entityIds.push(input.entityId);
    if (input.contactId) {
      const linked = await pool.query(
        `SELECT c.id AS contact_id,
          cu.id AS customer_id, v.id AS vendor_id, r.id AS referee_id, pp.id AS processor_id
         FROM contacts c
         LEFT JOIN customers cu ON cu.contact_id = c.id
         LEFT JOIN vendors v ON v.contact_id = c.id
         LEFT JOIN referees r ON r.contact_id = c.id
         LEFT JOIN payment_processors pp ON pp.contact_id = c.id
         WHERE c.id = $1`,
        [input.contactId]
      );
      const row = linked.rows[0];
      if (row) {
        entityIds.push(row.contact_id, row.customer_id, row.vendor_id, row.referee_id, row.processor_id);
        entityIds = entityIds.filter(Boolean);
      }
    }
    // Use existing GIN array-contains query with entityIds array
    // (replace the single entityId lookup with ANY($1::uuid[]))
  })
```

- [ ] Add optional `vendorId` filter paths to the `grid` procedure for `inventory`, `vendors`, `purchaseOrders` views. Find where those views build their SQL and add:

```sql
-- For inventory view, add after existing WHERE clause conditions:
-- AND ($vendorId IS NULL OR b.vendor_id = $vendorId)
```

- [ ] Run typecheck:

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] Commit:

```bash
git add src/server/routers/queries.ts
git commit -m "feat(contacts): add contactDirectory, contactProfile, contactAppointments, contactLedger, customerOrderHistory queries"
```

---

## Phase 5: Contacts Directory (Frontend)

### Task 5.1: Create ContactsView

**Files:**
- Create: `src/client/views/ContactsView.tsx`

- [ ] Create the view:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';

const ROLE_FILTERS = ['customer','vendor','referee','contractor','employee','processor'] as const;

export function ContactsView() {
  const navigate = useNavigate();
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = trpc.queries.contactDirectory.useQuery({
    limit: 50,
    roleFilter: roleFilter.length ? roleFilter : undefined,
    query: searchQuery || undefined,
  });

  const columnDefs: ColDef<GridRow>[] = [
    {
      field: 'name', headerName: 'Name', flex: 2,
      cellRenderer: (params: { data: GridRow; value: string }) => (
        <button
          className="text-button font-medium text-left"
          onClick={() => navigate(`/contacts/${params.data.id}`)}
        >
          {params.value}
        </button>
      ),
    },
    {
      field: 'roles', headerName: 'Roles', flex: 2,
      valueGetter: (params) => {
        const d = params.data as Record<string, unknown>;
        const roles = [];
        if (d.isCustomer)   roles.push('Customer');
        if (d.isVendor)     roles.push('Vendor');
        if (d.isReferee)    roles.push('Referee');
        if (d.isContractor) roles.push('Contractor');
        if (d.isEmployee)   roles.push('Employee');
        if (d.isProcessor)  roles.push('Processor');
        return roles.join(', ');
      },
    },
    { field: 'companyName', headerName: 'Company', flex: 2 },
    { field: 'phone',       headerName: 'Phone',   flex: 1 },
    { field: 'email',       headerName: 'Email',   flex: 2 },
    {
      field: 'customerBalance', headerName: 'Balance', flex: 1,
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '—',
    },
  ];

  return (
    <div className="view-stack">
      <WorkspacePanel
        panelId="contacts-directory"
        title="Contacts"
        subtitle={data ? `${data.rows.length} contacts` : undefined}
        actions={
          <button className="primary-button compact-action" onClick={() => { /* open ContactCreateModal */ }}>
            New Contact
          </button>
        }
      >
        <div className="control-band">
          <input
            className="input compact"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search contacts"
          />
          {ROLE_FILTERS.map((role) => (
            <button
              key={role}
              className={`secondary-button compact-action ${roleFilter.includes(role) ? 'font-semibold' : ''}`}
              onClick={() =>
                setRoleFilter((prev) =>
                  prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
                )
              }
              aria-pressed={roleFilter.includes(role)}
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>
      </WorkspacePanel>

      <OperatorGrid
        view="contacts"
        title="All Contacts"
        rows={data?.rows ?? []}
        columns={columnDefs}
        isLoading={isLoading}
        emptyTitle="No contacts yet"
        emptyChildren={<p className="text-sm text-zinc-500">Create your first contact with the button above.</p>}
      />
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/views/ContactsView.tsx
git commit -m "feat(contacts): add ContactsView directory"
```

---

### Task 5.2: ContactCreateModal

**Files:**
- Create: `src/client/components/ContactCreateModal.tsx`

- [ ] Create the modal (role checkboxes + conditional role-specific fields):

```typescript
import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import type { ContactRole } from '../../shared/types';

const ALL_ROLES: ContactRole[] = ['customer','vendor','referee','contractor','employee','processor'];

interface Props { onClose: () => void; }

export function ContactCreateModal({ onClose }: Props) {
  const { runCommand, isRunning } = useCommandRunner();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [roles, setRoles]       = useState<ContactRole[]>(['customer']);
  const [creditLimit, setCreditLimit] = useState('');
  const [termsDays, setTermsDays]     = useState('14');

  function toggleRole(role: ContactRole) {
    setRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || roles.length === 0) return;
    const result = await runCommand('createContact', {
      name: name.trim(),
      email: email || undefined,
      phone: phone || undefined,
      roles,
      creditLimit: roles.includes('customer') && creditLimit ? Number(creditLimit) : undefined,
      termsDays:   roles.includes('vendor')   && termsDays   ? Number(termsDays)   : undefined,
    }, 'Create contact from directory');
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog" aria-modal="true" aria-labelledby="create-contact-title">
      <div className="bg-white rounded shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="create-contact-title" className="section-title">New Contact</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="field-inline flex-col items-start gap-1">
            Name <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field-inline">Email <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field-inline">Phone <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <fieldset>
            <legend className="text-xs font-medium text-zinc-500 mb-1">Roles (select at least one)</legend>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={roles.includes(role)}
                    onChange={() => toggleRole(role)} aria-label={role} />
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>
          {roles.includes('customer') && (
            <label className="field-inline">Credit limit ($) <input type="number" className="input" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0" /></label>
          )}
          {roles.includes('vendor') && (
            <label className="field-inline">Payment terms (days) <input type="number" className="input" value={termsDays} onChange={(e) => setTermsDays(e.target.value)} /></label>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={isRunning || !name.trim() || roles.length === 0}>
              {isRunning ? 'Creating…' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] Wire the "New Contact" button in `ContactsView.tsx` to show this modal:

```typescript
// In ContactsView, add state and import:
import { ContactCreateModal } from '../components/ContactCreateModal';
const [showCreate, setShowCreate] = useState(false);

// Replace the button onClick:
onClick={() => setShowCreate(true)}

// After the role filter block, render the modal:
{showCreate && <ContactCreateModal onClose={() => setShowCreate(false)} />}
```

- [ ] Commit:

```bash
git add src/client/components/ContactCreateModal.tsx src/client/views/ContactsView.tsx
git commit -m "feat(contacts): add ContactCreateModal with role checkboxes"
```

---

### Task 5.3: Wire routing and SideNav

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/Shell.tsx`

- [ ] In `App.tsx`, add imports and routes:

```typescript
// Add imports (lazy-load):
import { ContactsView } from './views/ContactsView';
import { ContactProfileView } from './views/ContactProfileView';

// Add routes (after /photography, before /settings):
<Route path="/contacts" element={<ContactsView />} />
<Route path="/contacts/:id" element={<ContactProfileView />} />
```

- [ ] In `Shell.tsx`, find the SideNav nav items array and add a Contacts entry. The pattern follows existing items:

```typescript
// After the Clients nav item, add:
{ view: 'contacts', label: 'Contacts', icon: <Users className="h-4 w-4" aria-hidden="true" /> },
```

Make sure `Users` is imported from `lucide-react`.

- [ ] Commit:

```bash
git add src/client/App.tsx src/client/components/Shell.tsx
git commit -m "feat(contacts): add /contacts routes + SideNav entry"
```

---

## Phase 6: Profile Shell

### Task 6.1: EntityProfileTabs

**Files:**
- Create: `src/client/components/profile/EntityProfileTabs.tsx`

- [ ] Create the component:

```typescript
interface Tab { key: string; label: string; show: boolean; }

interface EntityProfileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function EntityProfileTabs({ tabs, activeTab, onTabChange }: EntityProfileTabsProps) {
  const visibleTabs = tabs.filter((t) => t.show);
  return (
    <nav role="tablist" aria-label="Profile sections" className="flex gap-1 border-b border-line px-4">
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`text-button px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
            activeTab === tab.key
              ? 'font-semibold border-accent text-ink'
              : 'border-transparent text-zinc-500 hover:text-ink'
          }`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/EntityProfileTabs.tsx
git commit -m "feat(contacts): add EntityProfileTabs component"
```

---

### Task 6.2: ContactProfileView shell

**Files:**
- Create: `src/client/views/ContactProfileView.tsx`
- Create: `src/client/components/profile/ContactProfileHeader.tsx`
- Create: `src/client/components/profile/ContactOverviewPanel.tsx`
- Create: `src/client/components/profile/ContactHistoryPanel.tsx`

- [ ] Create `ContactProfileView.tsx`:

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { trpc } from '../api/trpc';
import { EntityProfileTabs } from '../components/profile/EntityProfileTabs';
import { ContactProfileHeader } from '../components/profile/ContactProfileHeader';
import { ContactOverviewPanel } from '../components/profile/ContactOverviewPanel';
import { ContactHistoryPanel } from '../components/profile/ContactHistoryPanel';
import { ContactCustomerPanel } from '../components/profile/ContactCustomerPanel';
import { ContactVendorPanel } from '../components/profile/ContactVendorPanel';
import { ContactMoneyPanel } from '../components/profile/ContactMoneyPanel';
import { ContactAppointmentsPanel } from '../components/profile/ContactAppointmentsPanel';
import { ContactSettingsPanel } from '../components/profile/ContactSettingsPanel';

export function ContactProfileView() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading } = trpc.queries.contactProfile.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );

  if (isLoading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-zinc-500">Contact not found.</div>;

  const { contact } = data;

  const tabs = [
    { key: 'overview',     label: 'Overview',     show: true },
    { key: 'customer',     label: 'Customer',     show: contact.is_customer },
    { key: 'vendor',       label: 'Vendor',       show: contact.is_vendor },
    { key: 'money',        label: 'Money',        show: contact.is_customer || contact.is_vendor || contact.is_referee || contact.is_contractor || contact.is_employee },
    { key: 'appointments', label: 'Appointments', show: true },
    { key: 'settings',     label: 'Settings',     show: contact.is_referee || contact.is_processor || contact.is_employee },
    { key: 'history',      label: 'History',      show: true },
  ];

  // Ensure active tab is visible; fall back to overview if not
  const validTab = tabs.find((t) => t.show && t.key === activeTab) ? activeTab : 'overview';

  return (
    <div className="view-stack">
      {/* Back nav */}
      <div className="flex items-center gap-2 px-1">
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-zinc-500">Back</span>
      </div>

      <ContactProfileHeader data={data} />
      <EntityProfileTabs tabs={tabs} activeTab={validTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {validTab === 'overview'     && <ContactOverviewPanel data={data} />}
        {validTab === 'customer'     && <ContactCustomerPanel data={data} />}
        {validTab === 'vendor'       && <ContactVendorPanel data={data} />}
        {validTab === 'money'        && <ContactMoneyPanel data={data} />}
        {validTab === 'appointments' && <ContactAppointmentsPanel contactId={contactId!} />}
        {validTab === 'settings'     && <ContactSettingsPanel data={data} />}
        {validTab === 'history'      && <ContactHistoryPanel contactId={contactId!} />}
      </div>
    </div>
  );
}
```

- [ ] Create `ContactProfileHeader.tsx` (KPI cards + signals + role badges + action buttons):

```typescript
import { useNavigate } from 'react-router-dom';
import { KpiCard } from '../KpiCard';
import { useCommandRunner } from '../useCommandRunner';
import { useUiStore } from '../../store/uiStore';
import { trpc } from '../../api/trpc';

interface Props { data: Awaited<ReturnType<typeof trpc.queries.contactProfile.useQuery>>['data']; }

export function ContactProfileHeader({ data }: Props) {
  const navigate = useNavigate();
  const me = trpc.auth.me.useQuery();
  const setActiveCustomerId = useUiStore((s) => s.setActiveCustomerId);
  const { isRunning } = useCommandRunner();
  if (!data) return null;

  const { contact, customer, vendor } = data;
  const canWrite = me.data?.role !== 'viewer';
  const isMultiRole = contact.is_customer && contact.is_vendor;

  const roleLabels: Record<string, string> = {
    is_customer: 'Customer', is_vendor: 'Vendor', is_referee: 'Referee',
    is_processor: 'Processor', is_contractor: 'Contractor', is_employee: 'Employee',
  };

  const signals: Array<{ label: string; tone: 'danger' | 'warning' | 'info' }> = [];
  if (customer && Number(customer.balance) > Number(customer.credit_limit)) {
    signals.push({ label: 'Over credit limit', tone: 'danger' });
  }
  if (customer && Number(customer.oldest_open_invoice_days ?? 0) > 30) {
    signals.push({ label: 'Invoice 30+ days overdue', tone: 'warning' });
  }
  if (data.upcomingAppointmentCount > 0) {
    signals.push({ label: `${data.upcomingAppointmentCount} upcoming appointment${data.upcomingAppointmentCount > 1 ? 's' : ''}`, tone: 'info' });
  }

  return (
    <div className="inline-panel space-y-3">
      {/* Name + role badges */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="page-title">{contact.name}</h1>
        {contact.display_name && contact.display_name !== contact.name && (
          <span className="text-sm text-zinc-500">({contact.display_name})</span>
        )}
        <div className="flex flex-wrap gap-1">
          {Object.entries(roleLabels).map(([flag, label]) =>
            contact[flag as keyof typeof contact] ? (
              <span key={flag} className="selection-pill text-xs">{label}</span>
            ) : null
          )}
        </div>
      </div>

      {/* Subtitle */}
      {contact.company_name && <p className="page-subtitle">{contact.company_name}</p>}

      {/* KPI cards */}
      <div className="flex flex-wrap gap-3">
        {contact.is_customer && customer && (
          <>
            <KpiCard label="Balance" value={`$${Number(customer.balance).toFixed(2)}`}
              severity={Number(customer.balance) > Number(customer.credit_limit) ? 'bad' : 'neutral'} />
            <KpiCard label="Credit Headroom"
              value={`$${Math.max(0, Number(customer.credit_limit) - Number(customer.balance)).toFixed(2)}`}
              severity={Number(customer.balance) > Number(customer.credit_limit) ? 'bad' : 'good'} />
            <KpiCard label="Open Invoices" value={String(customer.open_invoices_count ?? 0)}
              severity={Number(customer.oldest_open_invoice_days ?? 0) > 30 ? 'watch' : 'neutral'} />
          </>
        )}
        {contact.is_vendor && vendor && (
          <KpiCard label="Open Bills" value={`$${Number(vendor.open_bills_amount ?? 0).toFixed(2)}`}
            severity={Number(vendor.open_bills_count ?? 0) > 0 ? 'watch' : 'neutral'} />
        )}
        {isMultiRole && customer && vendor && (
          <KpiCard label="Net Position"
            value={`$${(Number(customer.balance) - Number(vendor.open_bills_amount ?? 0)).toFixed(2)}`}
            severity="neutral" />
        )}
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signals.map((s) => (
            <span key={s.label} className={`selection-pill ${s.tone === 'danger' ? 'danger' : s.tone === 'warning' ? 'warning' : ''}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {contact.is_customer && customer && (
            <button className="primary-button compact-action" disabled={isRunning}
              onClick={() => { setActiveCustomerId(customer.id); navigate('/sales'); }}>
              New Order
            </button>
          )}
          {contact.is_vendor && (
            <button className={`${contact.is_customer ? 'secondary-button' : 'primary-button'} compact-action`}
              onClick={() => navigate('/purchaseOrders')}>
              New PO
            </button>
          )}
          <button className="secondary-button compact-action">Add Appointment</button>
          <button className="icon-button" aria-label="Edit contact">✎</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] Create `ContactOverviewPanel.tsx`:

```typescript
import { useCommandRunner } from '../useCommandRunner';
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';

interface Props { data: NonNullable<ReturnType<typeof trpc.queries.contactProfile.useQuery>['data']>; }

export function ContactOverviewPanel({ data }: Props) {
  const { contact } = data;
  const { runCommand } = useCommandRunner();

  const contactFields: Array<{ label: string; value: string | null | undefined }> = [
    { label: 'Phone',              value: contact.phone },
    { label: 'Secondary phone',    value: contact.secondary_phone },
    { label: 'Email',              value: contact.email },
    { label: 'Address',            value: contact.address },
    { label: 'Company',            value: contact.company_name },
    { label: 'Kind',               value: contact.contact_kind },
    { label: 'Preferred contact',  value: contact.preferred_contact_method },
  ];

  return (
    <div className="space-y-4">
      <WorkspacePanel panelId="contact-overview-info" title="Contact Info"
        actions={<button className="text-button text-sm">Edit</button>}>
        <div className="context-drawer-card space-y-1 p-3">
          {contactFields.map(({ label, value }) => (
            <label key={label} className="field-inline">
              <span className="text-zinc-500">{label}</span>
              <span>{value ?? '—'}</span>
            </label>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel panelId="contact-overview-notes" title="Notes">
        <div className="context-drawer-card p-3">
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{contact.notes ?? 'No notes.'}</p>
        </div>
      </WorkspacePanel>
    </div>
  );
}
```

- [ ] Create `ContactHistoryPanel.tsx`:

```typescript
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { commandLabelFor } from '../../../shared/commandCatalog';

interface Props { contactId: string; }

export function ContactHistoryPanel({ contactId }: Props) {
  const { data } = trpc.queries.relatedCommands.useQuery({ contactId }, { enabled: Boolean(contactId) });
  const commands = data ?? [];

  return (
    <WorkspacePanel panelId="contact-history" title="Command History"
      subtitle={`${commands.length} entries`}>
      <div className="finder-table-wrap">
        <table className="finder-table w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">When</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Command</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Actor</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-sm text-zinc-400 text-center">No commands yet.</td></tr>
            )}
            {commands.map((cmd: Record<string, unknown>) => (
              <tr key={String(cmd.id)} className="border-t border-line">
                <td className="px-3 py-2 text-xs text-zinc-500">{new Date(String(cmd.createdAt)).toLocaleString()}</td>
                <td className="px-3 py-2 text-sm">{commandLabelFor(String(cmd.commandName))}</td>
                <td className="px-3 py-2 text-sm">{String(cmd.actorName ?? '—')}</td>
                <td className="px-3 py-2 text-sm">{String(cmd.toast ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
}
```

- [ ] Commit:

```bash
git add src/client/views/ContactProfileView.tsx \
        src/client/components/profile/ContactProfileHeader.tsx \
        src/client/components/profile/ContactOverviewPanel.tsx \
        src/client/components/profile/ContactHistoryPanel.tsx
git commit -m "feat(contacts): add profile shell — ContactProfileView, header, overview, history"
```

---

## Phase 7: Role Tabs

### Task 7.1: ContactCustomerPanel

**Files:**
- Create: `src/client/components/profile/ContactCustomerPanel.tsx`

- [ ] Create the panel (reuses existing `CustomerCreditPanel` and `CustomerPurchaseHistoryPanel`):

```typescript
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { OperatorGrid } from '../OperatorGrid';
import { CustomerCreditPanel } from '../credit/CustomerCreditPanel';
import { CustomerPurchaseHistoryPanel } from '../CustomerPurchaseHistoryPanel';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../../shared/types';

interface Props { data: NonNullable<ReturnType<typeof trpc.queries.contactProfile.useQuery>['data']>; }

export function ContactCustomerPanel({ data }: Props) {
  const customerId = data.customer?.id;

  const { data: orders } = trpc.queries.customerOrderHistory.useQuery(
    { customerId: customerId ?? '' },
    { enabled: Boolean(customerId) }
  );

  const orderColumns: ColDef<GridRow>[] = [
    { field: 'orderNo',   headerName: 'Order #',  width: 110 },
    { field: 'createdAt', headerName: 'Date',      width: 120,
      valueFormatter: (p) => p.value ? new Date(String(p.value)).toLocaleDateString() : '—' },
    { field: 'lineCount', headerName: 'Lines',     width: 80 },
    { field: 'total',     headerName: 'Total',     width: 100,
      valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
    { field: 'status',    headerName: 'Status',    width: 120 },
  ];

  if (!customerId) return <p className="text-sm text-zinc-500 p-4">No customer record linked.</p>;

  return (
    <div className="space-y-4">
      <WorkspacePanel panelId="contact-customer-credit" title="Credit & Account">
        <div className="p-3">
          <div className="flex gap-4 mb-3 text-sm">
            <span>Balance: <strong>${Number(data.customer?.balance ?? 0).toFixed(2)}</strong></span>
            <span>Credit limit: <strong>${Number(data.customer?.credit_limit ?? 0).toFixed(2)}</strong></span>
          </div>
          <CustomerCreditPanel customerId={customerId} />
        </div>
      </WorkspacePanel>

      <OperatorGrid
        view="contacts-customer-orders"
        title="Order History"
        rows={(orders?.rows ?? []) as GridRow[]}
        columns={orderColumns}
        emptyTitle="No orders yet"
      />

      <WorkspacePanel panelId="contact-customer-purchase-history" title="Purchase History">
        <CustomerPurchaseHistoryPanel customerId={customerId} />
      </WorkspacePanel>
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/ContactCustomerPanel.tsx
git commit -m "feat(contacts): add ContactCustomerPanel"
```

---

### Task 7.2: ContactVendorPanel

**Files:**
- Create: `src/client/components/profile/ContactVendorPanel.tsx`

- [ ] Create the panel (reuses existing grid query with vendorId filter):

```typescript
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { OperatorGrid } from '../OperatorGrid';

interface Props { data: NonNullable<ReturnType<typeof trpc.queries.contactProfile.useQuery>['data']>; }

export function ContactVendorPanel({ data }: Props) {
  const vendorId = data.vendor?.id;

  const { data: bills }     = trpc.queries.grid.useQuery({ view: 'vendors',       vendorId }, { enabled: Boolean(vendorId) });
  const { data: pos }       = trpc.queries.grid.useQuery({ view: 'purchaseOrders', vendorId }, { enabled: Boolean(vendorId) });
  const { data: inventory } = trpc.queries.grid.useQuery({ view: 'inventory',      vendorId }, { enabled: Boolean(vendorId) });

  if (!vendorId) return <p className="text-sm text-zinc-500 p-4">No vendor record linked.</p>;

  return (
    <div className="space-y-4">
      <WorkspacePanel panelId="contact-vendor-info" title="Vendor Account">
        <div className="context-drawer-card p-3 space-y-1">
          <label className="field-inline"><span className="text-zinc-500">Terms</span><span>Net-{data.vendor?.terms_days ?? 14}</span></label>
          <label className="field-inline"><span className="text-zinc-500">Consignment</span><span>{data.vendor?.consignment_default ? 'Yes' : 'No'}</span></label>
          <label className="field-inline"><span className="text-zinc-500">Contact info</span><span>{data.vendor?.contact ?? '—'}</span></label>
        </div>
      </WorkspacePanel>
      <OperatorGrid view="contact-vendor-bills" title="Bills" rows={(bills?.rows ?? []) as any} columns={[
        { field: 'billNo',   headerName: 'Bill #',  width: 110 },
        { field: 'amount',   headerName: 'Amount',  width: 100 },
        { field: 'amountPaid', headerName: 'Paid',  width: 100 },
        { field: 'status',   headerName: 'Status',  width: 120 },
      ]} emptyTitle="No bills" />
      <OperatorGrid view="contact-vendor-pos" title="Purchase Orders" rows={(pos?.rows ?? []) as any} columns={[
        { field: 'poNo',     headerName: 'PO #',    width: 110 },
        { field: 'total',    headerName: 'Total',   width: 100 },
        { field: 'status',   headerName: 'Status',  width: 120 },
      ]} emptyTitle="No POs" />
      <OperatorGrid view="contact-vendor-inventory" title="Inventory" rows={(inventory?.rows ?? []) as any} columns={[
        { field: 'name',         headerName: 'Batch',   flex: 2 },
        { field: 'availableQty', headerName: 'Qty',     width: 80 },
        { field: 'unitPrice',    headerName: 'Price',   width: 90 },
        { field: 'status',       headerName: 'Status',  width: 100 },
      ]} emptyTitle="No inventory" />
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/ContactVendorPanel.tsx
git commit -m "feat(contacts): add ContactVendorPanel"
```

---

### Task 7.3: ContactMoneyPanel

**Files:**
- Create: `src/client/components/profile/ContactMoneyPanel.tsx`

- [ ] Create the unified money view:

```typescript
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { useCommandRunner } from '../useCommandRunner';

interface Props { data: NonNullable<ReturnType<typeof trpc.queries.contactProfile.useQuery>['data']>; }

export function ContactMoneyPanel({ data }: Props) {
  const { contact, customer, vendor } = data;
  const contactId = contact.id;

  const { data: ledger } = trpc.queries.contactLedger.useQuery(
    { contactId },
    { enabled: contact.is_contractor || contact.is_employee }
  );

  const receivable = Number(customer?.balance ?? 0);
  const payable    = Number(vendor?.open_bills_amount ?? 0);
  const net        = receivable - payable;
  const isDualRole = contact.is_customer && contact.is_vendor;

  return (
    <div className="space-y-4">
      {/* Net position strip — dual role only */}
      {isDualRole && (
        <div className="subtle-band flex items-center gap-6 px-4 py-2 text-sm">
          <span>Receivable (owed to you): <strong>${receivable.toFixed(2)}</strong></span>
          <span>Payable (owed to them): <strong>${payable.toFixed(2)}</strong></span>
          <span className={`selection-pill ${net < 0 ? 'warning' : ''}`}>
            Net: ${net.toFixed(2)} {net >= 0 ? '(favorable)' : '(unfavorable)'}
          </span>
        </div>
      )}

      {/* Receivables section */}
      {contact.is_customer && customer && (
        <WorkspacePanel panelId="contact-money-receivables" title="Receivables (Customer)">
          <div className="p-3 text-sm space-y-1">
            <div>Open invoices: <strong>{customer.open_invoices_count ?? 0}</strong> totaling <strong>${Number(customer.open_invoices_amount ?? 0).toFixed(2)}</strong></div>
            <div>Balance: <strong>${Number(customer.balance).toFixed(2)}</strong></div>
          </div>
        </WorkspacePanel>
      )}

      {/* Payables section */}
      {contact.is_vendor && vendor && (
        <WorkspacePanel panelId="contact-money-payables" title="Payables (Vendor)">
          <div className="p-3 text-sm space-y-1">
            <div>Open bills: <strong>{vendor.open_bills_count ?? 0}</strong> totaling <strong>${Number(vendor.open_bills_amount ?? 0).toFixed(2)}</strong></div>
          </div>
        </WorkspacePanel>
      )}

      {/* Direct payments — contractor / employee */}
      {(contact.is_contractor || contact.is_employee) && (
        <WorkspacePanel panelId="contact-money-direct" title="Payment Ledger">
          <div className="finder-table-wrap">
            <table className="finder-table w-full">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Kind</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Running Balance</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Reference</th>
                </tr>
              </thead>
              <tbody>
                {(ledger?.rows ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-sm text-zinc-400 text-center">No payments recorded.</td></tr>
                )}
                {(ledger?.rows ?? []).map((row: Record<string, unknown>) => (
                  <tr key={String(row.id)} className="border-t border-line">
                    <td className="px-3 py-2 text-xs text-zinc-500">{new Date(String(row.created_at)).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-sm">{String(row.kind)}</td>
                    <td className="px-3 py-2 text-sm">${Math.abs(Number(row.amount)).toFixed(2)}</td>
                    <td className="px-3 py-2 text-sm">${Number(row.running_balance).toFixed(2)}</td>
                    <td className="px-3 py-2 text-sm text-zinc-500">{String(row.reference ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/ContactMoneyPanel.tsx
git commit -m "feat(contacts): add ContactMoneyPanel with dual-role net position and contact ledger"
```

---

## Phase 8: Appointments Tab

### Task 8.1: AppointmentModal

**Files:**
- Create: `src/client/components/profile/AppointmentModal.tsx`

- [ ] Create the modal (create + edit modes):

```typescript
import { useState } from 'react';
import { useCommandRunner } from '../useCommandRunner';
import type { AppointmentType } from '../../../shared/types';

const APPOINTMENT_TYPES: AppointmentType[] = ['meeting','call','delivery','pickup','vacation','job','other'];

interface Props {
  contactId: string;
  appointmentId?: string;   // present in edit mode
  initialValues?: { title?: string; appointmentType?: AppointmentType; startsAt?: string; endsAt?: string; location?: string; notes?: string; };
  onClose: () => void;
}

export function AppointmentModal({ contactId, appointmentId, initialValues, onClose }: Props) {
  const { runCommand, isRunning } = useCommandRunner();
  const isEdit = Boolean(appointmentId);

  const [title, setTitle]                   = useState(initialValues?.title ?? '');
  const [appointmentType, setType]          = useState<AppointmentType>(initialValues?.appointmentType ?? 'meeting');
  const [startsAt, setStartsAt]             = useState(initialValues?.startsAt?.slice(0, 16) ?? '');
  const [endsAt, setEndsAt]                 = useState(initialValues?.endsAt?.slice(0, 16) ?? '');
  const [location, setLocation]             = useState(initialValues?.location ?? '');
  const [notes, setNotes]                   = useState(initialValues?.notes ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;
    const payload = {
      title: title.trim(),
      appointmentType,
      startsAt: new Date(startsAt).toISOString(),
      endsAt:   endsAt ? new Date(endsAt).toISOString() : undefined,
      location: location || undefined,
      notes:    notes || undefined,
    };
    if (isEdit && appointmentId) {
      const result = await runCommand('updateAppointment', { appointmentId, ...payload }, 'Update appointment from profile');
      if (result.ok) onClose();
    } else {
      const result = await runCommand('createAppointment', { contactId, ...payload }, 'Create appointment from profile');
      if (result.ok) onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="appt-modal-title">
      <div className="bg-white rounded shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="appt-modal-title" className="section-title">{isEdit ? 'Edit Appointment' : 'Add Appointment'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="field-inline flex-col items-start gap-1">
            Title <input required className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field-inline">
            Type
            <select className="select" value={appointmentType} onChange={(e) => setType(e.target.value as AppointmentType)}>
              {APPOINTMENT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </label>
          <label className="field-inline">
            Starts
            <input required type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field-inline">
            Ends (optional)
            <input type="datetime-local" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="field-inline flex-col items-start gap-1">
            Location <input className="input w-full" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="field-inline flex-col items-start gap-1">
            Notes <textarea className="input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={isRunning || !title.trim() || !startsAt}>
              {isRunning ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/AppointmentModal.tsx
git commit -m "feat(contacts): add AppointmentModal (create + edit)"
```

---

### Task 8.2: ContactAppointmentsPanel

**Files:**
- Create: `src/client/components/profile/ContactAppointmentsPanel.tsx`

- [ ] Create the panel:

```typescript
import { useState } from 'react';
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { useCommandRunner } from '../useCommandRunner';
import { AppointmentModal } from './AppointmentModal';

interface Props { contactId: string; }

export function ContactAppointmentsPanel({ contactId }: Props) {
  const { data, refetch } = trpc.queries.contactAppointments.useQuery({ contactId });
  const { runCommand, isRunning } = useCommandRunner();
  const [showModal, setShowModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Record<string, unknown> | null>(null);

  const upcoming = data?.upcoming ?? [];
  const past     = data?.past     ?? [];

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function handleCancel(appointmentId: string) {
    await runCommand('cancelAppointment', { appointmentId }, 'Cancel appointment from profile');
  }

  async function handleComplete(appointmentId: string) {
    await runCommand('completeAppointment', { appointmentId }, 'Complete appointment from profile');
  }

  return (
    <div className="space-y-4">
      {showModal && (
        <AppointmentModal
          contactId={contactId}
          appointmentId={editingAppt ? String(editingAppt.id) : undefined}
          initialValues={editingAppt ? {
            title: String(editingAppt.title ?? ''),
            appointmentType: editingAppt.appointment_type as any,
            startsAt: String(editingAppt.starts_at ?? ''),
            endsAt: editingAppt.ends_at ? String(editingAppt.ends_at) : undefined,
            location: editingAppt.location ? String(editingAppt.location) : undefined,
            notes: editingAppt.notes ? String(editingAppt.notes) : undefined,
          } : undefined}
          onClose={() => { setShowModal(false); setEditingAppt(null); refetch(); }}
        />
      )}

      <WorkspacePanel
        panelId="contact-appointments-upcoming"
        title="Upcoming"
        subtitle={upcoming.length ? `${upcoming.length} scheduled` : undefined}
        actions={
          <button className="primary-button compact-action" onClick={() => { setEditingAppt(null); setShowModal(true); }}>
            Add Appointment
          </button>
        }
      >
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-400 p-4">No upcoming appointments. Add one to track interactions.</p>
        ) : (
          <div className="divide-y divide-line">
            {upcoming.map((appt: Record<string, unknown>) => (
              <div key={String(appt.id)} className="flex items-start justify-between p-3 gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{String(appt.title)}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(String(appt.starts_at))}</p>
                  {appt.location && <p className="text-xs text-zinc-400">{String(appt.location)}</p>}
                  <span className="selection-pill text-xs">{String(appt.appointment_type)}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-button text-xs" onClick={() => { setEditingAppt(appt); setShowModal(true); }}>Edit</button>
                  <button className="text-button text-xs" disabled={isRunning} onClick={() => handleComplete(String(appt.id))}>Complete</button>
                  <button className="text-button text-xs text-danger" disabled={isRunning} onClick={() => handleCancel(String(appt.id))}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>

      <WorkspacePanel panelId="contact-appointments-past" title="Past" subtitle={past.length ? `${past.length} entries` : undefined}>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-400 p-4">No past appointments on record.</p>
        ) : (
          <div className="divide-y divide-line">
            {past.map((appt: Record<string, unknown>) => (
              <div key={String(appt.id)} className="p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{String(appt.title)}</p>
                  <span className={`selection-pill text-xs ${String(appt.status) === 'cancelled' ? 'warning' : ''}`}>{String(appt.status)}</span>
                </div>
                <p className="text-xs text-zinc-500">{formatDateTime(String(appt.starts_at))}</p>
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/ContactAppointmentsPanel.tsx
git commit -m "feat(contacts): add ContactAppointmentsPanel with upcoming/past lists"
```

---

## Phase 9: Settings Tab + Integration

### Task 9.1: ContactSettingsPanel

**Files:**
- Create: `src/client/components/profile/ContactSettingsPanel.tsx`

- [ ] Create the panel (referee + processor + employee sections):

```typescript
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { RefereeRelationshipDialog } from '../RefereeRelationshipDialog';

interface Props { data: NonNullable<ReturnType<typeof trpc.queries.contactProfile.useQuery>['data']>; }

export function ContactSettingsPanel({ data }: Props) {
  const { contact, referee, processor, user: linkedUser } = data;

  return (
    <div className="space-y-4">
      {contact.is_referee && referee && (
        <WorkspacePanel panelId="contact-settings-referee" title="Referee Settings">
          <div className="context-drawer-card p-3 space-y-1">
            <label className="field-inline"><span className="text-zinc-500">Balance</span><span>${Number(referee.balance ?? 0).toFixed(2)}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Lifetime earned</span><span>${Number(referee.lifetime_earned ?? 0).toFixed(2)}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Payment method</span><span>{String(referee.payment_method ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Payment details</span><span>{String(referee.payment_details ?? '—')}</span></label>
          </div>
        </WorkspacePanel>
      )}

      {contact.is_processor && processor && (
        <WorkspacePanel panelId="contact-settings-processor" title="Processor Settings">
          <div className="context-drawer-card p-3 space-y-1">
            <label className="field-inline"><span className="text-zinc-500">Type</span><span>{String(processor.processor_type ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fee type</span><span>{String(processor.fee_type ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fee %</span><span>{String(processor.fee_percentage ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fixed fee</span><span>{processor.fee_fixed_amount ? `$${Number(processor.fee_fixed_amount).toFixed(2)}` : '—'}</span></label>
            <label className="field-inline"><span className="text-zinc-500">User split</span><span>{String(processor.default_user_split ?? '—')}%</span></label>
          </div>
        </WorkspacePanel>
      )}

      {contact.is_employee && (
        <WorkspacePanel panelId="contact-settings-employee" title="Employee Settings">
          <div className="context-drawer-card p-3 space-y-1">
            {linkedUser ? (
              <>
                <label className="field-inline"><span className="text-zinc-500">Account email</span><span>{String(linkedUser.email)}</span></label>
                <label className="field-inline"><span className="text-zinc-500">Role</span><span>{String(linkedUser.role)}</span></label>
                <label className="field-inline"><span className="text-zinc-500">Work loop</span><span>{String(linkedUser.workLoop ?? 'Auto-detected')}</span></label>
              </>
            ) : (
              <p className="text-sm text-zinc-400">No system account linked.</p>
            )}
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}
```

- [ ] Commit:

```bash
git add src/client/components/profile/ContactSettingsPanel.tsx
git commit -m "feat(contacts): add ContactSettingsPanel (referee, processor, employee)"
```

---

### Task 9.2: Add "Open full profile" links to ContextDrawer

**Files:**
- Modify: `src/client/components/ContextDrawer.tsx`

- [ ] Find each entity tab body render in `ContextDrawer.tsx`. At the top of the `customer`, `vendor`, `referee`, and `processor` tab bodies, add a "Open full profile" link. Find the section that renders content for the `relationship` tab and add before existing content:

```typescript
// In the entity tab render, at the top — find by searching for 'customer' entityType rendering
// and add this snippet inside the tab body, before existing content:
import { useNavigate } from 'react-router-dom';

// Inside the component:
const navigate = useNavigate();
const entityId = activeEntity?.entityId;

// At the top of each entity tab body (customer, vendor, referee, processor):
{entityId && (
  <div className="flex justify-end px-2 pt-2 pb-1">
    <button
      className="text-button text-xs"
      onClick={() => {
        // Look up contact_id for this entity — use activeDrawerEntityByView
        navigate(`/contacts/${entityId}`); // entityId here is actually contactId after migration
      }}
      aria-label="Open full profile"
    >
      Open full profile →
    </button>
  </div>
)}
```

**Note to implementer:** After migration, the `contact_id` on each entity record is the ID to navigate to. The drawer's `entityId` is currently the `customerId`/`vendorId`/`refereeId`. You will need to look up `contact_id` for the given entity ID. Add a tRPC query `queries.contactIdForEntity({ entityType, entityId })` or use the contact's `id` directly if the grid rows already expose `contactId` after the migration adds the FK column to the grid query.

- [ ] Commit:

```bash
git add src/client/components/ContextDrawer.tsx
git commit -m "feat(contacts): add Open full profile links to ContextDrawer entity tabs"
```

---

### Task 9.3: Make entity name columns link to profiles

**Files:**
- Modify: `src/client/views/OperationsViews.tsx`
- Modify: `src/client/views/RefereesView.tsx`
- Modify: `src/client/views/ProcessorsView.tsx`

- [ ] In `ClientLedgerView` (OperationsViews.tsx, line ~1444), the view currently renders `<GridJourney view="clients" title="Client Ledger and Credit" />`. Add a custom name column renderer to the grid. Find where the `GridJourney` columns are defined (or add custom columnDefs prop):

```typescript
// Modify ClientLedgerView to add a "New Client" button and name column link:
export function ClientLedgerView() {
  const navigate = useNavigate();
  const nameColumn: ColDef<GridRow> = {
    field: 'name',
    headerName: 'Client',
    flex: 2,
    cellRenderer: (params: { data: GridRow; value: string }) => (
      <button className="text-button text-left" onClick={() => {
        // contactId is on the row after migration adds it to the grid query
        const contactId = (params.data as any).contactId;
        if (contactId) navigate(`/contacts/${contactId}`);
      }}>
        {params.value}
      </button>
    ),
  };
  return (
    <div className="view-stack">
      <WorkspacePanel panelId="clients-toolbar" title="Client Ledger and Credit"
        actions={<button className="primary-button compact-action" onClick={() => { /* open ContactCreateModal with customer role */ }}>New Client</button>}>
      </WorkspacePanel>
      <GridJourney view="clients" title="Client Ledger and Credit" extraColumnDefs={[nameColumn]} />
    </div>
  );
}
```

**Note:** If `GridJourney` doesn't accept `extraColumnDefs`, add the prop or switch to using `OperatorGrid` directly with the full column set.

- [ ] Apply the same name-column-link pattern to `VendorPayablesView`, `RefereesView`, and `ProcessorsView`. Each name column cell navigates to `/contacts/:contactId`.

- [ ] Add `contactId` to the relevant grid queries in `queries.ts` so the grid rows include it:

For the `clients` view SQL, add:
```sql
c.contact_id AS "contactId"
```
For `vendors`, `referees`, `processors` views similarly.

- [ ] Commit:

```bash
git add src/client/views/OperationsViews.tsx src/client/views/RefereesView.tsx src/client/views/ProcessorsView.tsx src/server/routers/queries.ts
git commit -m "feat(contacts): make entity name columns link to /contacts/:contactId from all grids"
```

---

### Task 9.4: Merge candidates banner

**Files:**
- Modify: `src/client/views/ContactsView.tsx`
- Modify: `src/server/routers/queries.ts`

- [ ] Add a `mergeCandidateCount` query to `queries.ts`:

```typescript
mergeCandidateCount: protectedProcedure.query(async () => {
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM contact_merge_candidates WHERE reviewed = false AND dismissed = false`
  );
  return { count: Number(result.rows[0]?.count ?? 0) };
}),
```

- [ ] In `ContactsView.tsx`, fetch the count and show the banner above the grid when count > 0:

```typescript
const { data: mergeMeta } = trpc.queries.mergeCandidateCount.useQuery();
const mergeCount = mergeMeta?.count ?? 0;

// Above the OperatorGrid:
{mergeCount > 0 && (
  <div className="selection-pill warning flex items-center gap-2 px-4 py-2 text-sm" role="alert">
    <span>{mergeCount} possible duplicate contact{mergeCount > 1 ? 's' : ''} found.</span>
    <button className="text-button text-xs">Review and merge</button>
  </div>
)}
```

- [ ] Commit:

```bash
git add src/client/views/ContactsView.tsx src/server/routers/queries.ts
git commit -m "feat(contacts): add merge candidates banner to ContactsView"
```

---

### Task 9.5: Final verification

- [ ] Run typecheck:

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] Run unit tests:

```bash
pnpm test
```

Expected: all existing tests pass + new `contactSchemas.test.ts` passes.

- [ ] Write E2E test in `tests/e2e/contacts.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

test('owner can navigate contacts directory and view a profile', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForBackend(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Owner Daily Decision View')).toBeVisible();

  // Navigate to Contacts
  await page.getByRole('navigation').getByRole('button', { name: /Contacts/ }).click();
  await expect(page.getByText('All Contacts')).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();

  // Click into the first contact
  const firstContactLink = page.locator('button.text-button').first();
  await firstContactLink.click();

  // Profile page should load
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();

  // Switch to Appointments tab
  await page.getByRole('tab', { name: 'Appointments' }).click();
  await expect(page.getByText('Upcoming')).toBeVisible();
  await expect(page.getByText('Past')).toBeVisible();

  // Add an appointment
  await page.getByRole('button', { name: 'Add Appointment' }).click();
  await expect(page.getByRole('dialog', { name: /Appointment/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', { name: /Title/ }).fill('Test meeting');
  const tomorrow = new Date(Date.now() + 86400000);
  const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T10:00`;
  await page.getByRole('dialog').locator('input[type="datetime-local"]').first().fill(dateStr);
  await page.getByRole('button', { name: 'Add Appointment' }).last().click();
  await expect(page.getByText('Appointment added')).toBeVisible();
  await expect(page.getByText('Test meeting')).toBeVisible();
});
```

- [ ] Run E2E test:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/contacts.spec.ts --project=chromium --workers=1
```

Expected: test passes end-to-end.

- [ ] Final commit:

```bash
git add tests/e2e/contacts.spec.ts
git commit -m "test(contacts): add E2E test for contacts directory + profile + appointments"
```

---

## File Map Summary

| File | Action |
|---|---|
| `migrations/0054_contacts_system.sql` | Create |
| `src/server/schema.ts` | Modify — add 4 table exports, add contactId to 5 existing tables |
| `src/shared/types.ts` | Modify — add 'contacts' to ViewKey, new type aliases |
| `src/shared/commandCatalog.ts` | Modify — 12 new commands across all 4 maps |
| `src/shared/schemas.ts` | Modify — 10 new Zod schemas |
| `src/tests/contactSchemas.test.ts` | Create |
| `src/server/services/commandBus.ts` | Modify — 12 new command handlers + postTransactionLedgerRow extension |
| `src/server/routers/queries.ts` | Modify — 5 new queries, 3 extended queries, contactId in grid rows |
| `src/client/views/ContactsView.tsx` | Create |
| `src/client/views/ContactProfileView.tsx` | Create |
| `src/client/components/profile/EntityProfileTabs.tsx` | Create |
| `src/client/components/profile/ContactProfileHeader.tsx` | Create |
| `src/client/components/profile/ContactOverviewPanel.tsx` | Create |
| `src/client/components/profile/ContactHistoryPanel.tsx` | Create |
| `src/client/components/profile/ContactCustomerPanel.tsx` | Create |
| `src/client/components/profile/ContactVendorPanel.tsx` | Create |
| `src/client/components/profile/ContactMoneyPanel.tsx` | Create |
| `src/client/components/profile/AppointmentModal.tsx` | Create |
| `src/client/components/profile/ContactAppointmentsPanel.tsx` | Create |
| `src/client/components/profile/ContactSettingsPanel.tsx` | Create |
| `src/client/components/ContextDrawer.tsx` | Modify — "Open full profile" links |
| `src/client/views/OperationsViews.tsx` | Modify — name column links + New Client button |
| `src/client/views/RefereesView.tsx` | Modify — name column link |
| `src/client/views/ProcessorsView.tsx` | Modify — name column link |
| `src/client/App.tsx` | Modify — 2 new routes |
| `src/client/components/Shell.tsx` | Modify — Contacts SideNav entry |
| `tests/e2e/contacts.spec.ts` | Create |


---

## AQA Findings Applied (post-review)

AQA run: `~/.codex-runs/claude-qa/20260522T204108Z-.../report.md`

| Finding | Severity | Fix Applied |
|---|---|---|
| SQL injection via unvalidated `roleFilter` — `z.array(z.string())` allows arbitrary string interpolation into column names | Critical | Changed to `z.array(z.enum([...contactRoles]))` + static `ROLE_COL_MAP` — no user string touches SQL |
| `const [x] = await pool.query(...)` destructuring crashes — `QueryResult` is not iterable, `x.rows` throws | High | Fixed to `const result = await pool.query(...); const x = result.rows[0]` throughout archiveContact |
| No `UNIQUE` constraint on `contact_id` FK columns — allows multiple entities per contact, breaks 1:1 | High | Added `CREATE UNIQUE INDEX ... WHERE contact_id IS NOT NULL` to all 5 tables; `.unique()` in Drizzle schema |
| archiveContact ledger guard `SUM(amount) > 0` never fires — amounts stored negative for payments out | High | Changed guard to `< 0`; added comment explaining sign convention |
| Cursor pagination skips rows on `updated_at` collision — bulk migration creates identical timestamps | Medium | Changed to keyset cursor `"updatedAt_ISO\|uuid"` with `(updated_at, id)` boundary condition |
| `ContactCreateModal` never implemented — referenced in ContactsView but no task | Missing | Added Task 5.2 with full modal implementation |
| Migration loops not idempotent — re-running after partial failure creates duplicates | Missing | Added `WHERE contact_id IS NULL` to all 5 `DO $$` loops |

