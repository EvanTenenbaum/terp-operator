-- migrations/0054_contacts_system.sql
-- Contacts system: universal identity anchor for all entity types
-- CAP-033 / TER-1564 — entity profiles foundation
--
-- This migration is designed to be idempotent on the data side (the DO $$ loops
-- guard with WHERE contact_id IS NULL). DDL statements are not idempotent;
-- re-running this migration would fail at CREATE TABLE / ADD COLUMN if not
-- managed by the migration runner.

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
-- to eliminate the race condition between concurrent inserts.
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

CREATE UNIQUE INDEX contact_merge_candidates_pair_unique_idx
  ON contact_merge_candidates(contact_a_id, contact_b_id);

-- 5. Cross-link FKs on existing tables (UNIQUE enforces 1-contact-per-entity invariant)
ALTER TABLE customers          ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE vendors            ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE referees           ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE payment_processors ADD COLUMN contact_id uuid REFERENCES contacts(id);
ALTER TABLE users              ADD COLUMN contact_id uuid REFERENCES contacts(id);

-- Partial UNIQUE constraints: each entity row maps to at most one contact,
-- but nulls are not constrained (an entity may temporarily lack a contact link).
CREATE UNIQUE INDEX customers_contact_id_unique_idx          ON customers(contact_id)          WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX vendors_contact_id_unique_idx            ON vendors(contact_id)            WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX referees_contact_id_unique_idx           ON referees(contact_id)           WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX payment_processors_contact_id_unique_idx ON payment_processors(contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX users_contact_id_unique_idx              ON users(contact_id)              WHERE contact_id IS NOT NULL;

-- 6. Migrate existing entities into contacts (1:1, no automatic merging).
-- The WHERE contact_id IS NULL guards make these idempotent for re-runs against
-- partially-migrated data: rows already linked to a contact are skipped.
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
  -- Backfill active users only; inactive users do not need contact records until reactivated.
  FOR r IN SELECT * FROM users WHERE active = true AND contact_id IS NULL LOOP
    INSERT INTO contacts (name, email, is_employee, active, created_at, updated_at)
    VALUES (r.name, r.email, true, true, r.created_at, r.updated_at)
    RETURNING id INTO new_id;
    UPDATE users SET contact_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 7. Flag likely duplicate contacts for manual review.
-- Name match across customer/vendor split: an entity that was both a buyer and
-- a seller will appear as two contacts after migration.
INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
SELECT ca.id, cv.id, 'name_match'
FROM contacts ca
JOIN contacts cv
  ON lower(trim(ca.name)) = lower(trim(cv.name))
  AND ca.is_customer = true AND cv.is_vendor = true AND ca.id != cv.id;

-- Email match across any pair: same email implies same person/business.
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
