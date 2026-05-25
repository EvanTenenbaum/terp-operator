-- migrations/0057_payment_allocations_amount_positive.sql
-- GH #298: Enforce that payment_allocations.amount is strictly positive.
-- A zero or negative allocation amount is never valid — an allocation is
-- always a portion of a payment being applied to an invoice, so the amount
-- must be > 0. Without this constraint, a buggy caller could insert a $0
-- row and leave invoice.amountPaid / customer.balance desynchronized.
--
-- This migration is safe on an existing table: a CHECK constraint added via
-- ALTER TABLE is validated immediately in PostgreSQL. If any existing rows
-- violate the constraint (amount <= 0) the migration will fail and protect
-- the schema from further drift.

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0);
