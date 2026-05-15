-- Strain aliases let operators show a customer-facing name on customer artifacts
-- while keeping the canonical strain name on vendor/audit surfaces.
-- One alias per master item (system-wide). Snapshot fields lock the customer-facing
-- name at the moment of customer commitment so future renames don't mutate history.

alter table items
  add column if not exists alias varchar(180);

alter table sales_order_lines
  add column if not exists display_name varchar(180);

-- Backfill: for rows that predate the column, display_name = canonical item_name
-- so reads keep working without code branching for nulls.
update sales_order_lines
  set display_name = item_name
  where display_name is null;
