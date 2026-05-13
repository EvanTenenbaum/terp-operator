create table if not exists tag_catalog (
  id uuid primary key default gen_random_uuid(),
  slug varchar(80) not null unique,
  label varchar(120) not null,
  color varchar(32) not null default 'gray',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tag_catalog_active_idx on tag_catalog(is_active);

create table if not exists customer_needs (
  id uuid primary key default gen_random_uuid(),
  need_code varchar(80) not null unique,
  customer_id uuid references customers(id) on delete set null,
  product_name varchar(180) not null,
  category varchar(80) not null,
  tags text[] not null default '{}',
  qty_min numeric(12,3) not null default 1,
  qty_max numeric(12,3),
  target_price numeric(12,2),
  needed_by timestamptz,
  urgency varchar(32) not null default 'normal',
  owner_id uuid references users(id) on delete set null,
  notes text,
  status varchar(32) not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_needs_customer_idx on customer_needs(customer_id);
create index if not exists customer_needs_status_idx on customer_needs(status);
create index if not exists customer_needs_category_idx on customer_needs(category);
create index if not exists customer_needs_tags_idx on customer_needs using gin(tags);

create table if not exists vendor_supply (
  id uuid primary key default gen_random_uuid(),
  supply_code varchar(80) not null unique,
  vendor_id uuid references vendors(id) on delete set null,
  product_name varchar(180) not null,
  category varchar(80) not null,
  tags text[] not null default '{}',
  available_qty numeric(12,3) not null default 1,
  asking_price numeric(12,2),
  available_date timestamptz,
  location varchar(120),
  grade varchar(80),
  terms text,
  notes text,
  status varchar(32) not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_supply_vendor_idx on vendor_supply(vendor_id);
create index if not exists vendor_supply_status_idx on vendor_supply(status);
create index if not exists vendor_supply_category_idx on vendor_supply(category);
create index if not exists vendor_supply_tags_idx on vendor_supply using gin(tags);

create table if not exists matchmaking_matches (
  id uuid primary key default gen_random_uuid(),
  customer_need_id uuid not null references customer_needs(id) on delete cascade,
  vendor_supply_id uuid not null references vendor_supply(id) on delete cascade,
  score integer not null default 0,
  reasons text[] not null default '{}',
  status varchar(32) not null default 'open',
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_need_id, vendor_supply_id)
);

create index if not exists matchmaking_matches_need_idx on matchmaking_matches(customer_need_id);
create index if not exists matchmaking_matches_supply_idx on matchmaking_matches(vendor_supply_id);
create index if not exists matchmaking_matches_status_idx on matchmaking_matches(status);
create index if not exists matchmaking_matches_score_idx on matchmaking_matches(score);

insert into tag_catalog (slug, label, color, description)
values
  ('infused', 'Infused', 'purple', 'Infused product family'),
  ('candy', 'Candy', 'orange', 'Candy and edible shorthand'),
  ('premium', 'Premium', 'green', 'Premium buyer or inventory signal'),
  ('flower', 'Flower', 'green', 'Flower product family'),
  ('value', 'Value', 'gray', 'Value buyer or stock signal'),
  ('extract', 'Extract', 'blue', 'Extract product family'),
  ('live', 'Live', 'blue', 'Live resin or live rosin signal'),
  ('vape', 'Vape', 'yellow', 'Vape product family'),
  ('pre-roll', 'Pre-roll', 'gray', 'Pre-roll product family')
on conflict (slug) do nothing;
