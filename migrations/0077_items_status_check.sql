-- TER-1651 follow-up: Add CHECK constraint on items.status to enforce
-- only 'active' / 'inactive' values.
alter table items
  add constraint items_status_check check (status in ('active', 'inactive'));
