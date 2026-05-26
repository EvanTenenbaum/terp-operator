create table matchmaking_settings (
  id uuid primary key default gen_random_uuid(),
  match_quality_floor integer not null default 35,
  work_queue_threshold integer not null default 75,
  history_lookback_days integer not null default 90,
  repeat_threshold integer not null default 3,
  gap_floor_qty integer not null default 0,
  show_clients_column boolean not null default false,
  show_vendors_column boolean not null default false,
  work_queue_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

-- Insert the single workspace row with defaults on migration
insert into matchmaking_settings default values;
