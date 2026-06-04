-- TER-1651: Add status column to items for catalog management (active/inactive).
-- Allows operators to deactivate items without deleting them.
alter table items
  add column if not exists status varchar(24) not null default 'active';

-- Add a description column for richer item profiles.
alter table items
  add column if not exists description text;
