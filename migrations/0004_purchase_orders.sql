create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no varchar(80) not null unique,
  vendor_id uuid references vendors(id) on delete set null,
  status varchar(32) not null default 'draft',
  expected_date timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  total numeric(12,2) not null default 0,
  ordered_by uuid references users(id) on delete set null,
  buyer_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_status_idx on purchase_orders(status);
create index if not exists purchase_orders_vendor_idx on purchase_orders(vendor_id);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  product_name varchar(180) not null,
  category varchar(80) not null,
  tags text[] not null default '{}',
  qty numeric(12,3) not null default 0,
  received_qty numeric(12,3) not null default 0,
  uom varchar(24) not null default 'lb',
  unit_cost numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  source_code varchar(120),
  shorthand varchar(120),
  legacy_marker varchar(120),
  ownership_status varchar(16) not null default 'UNKNOWN',
  notes text,
  status varchar(32) not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_order_lines_po_idx on purchase_order_lines(purchase_order_id);
create index if not exists purchase_order_lines_status_idx on purchase_order_lines(status);

alter table batches add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null;
alter table batches add column if not exists purchase_order_line_id uuid references purchase_order_lines(id) on delete set null;
create index if not exists batches_purchase_order_idx on batches(purchase_order_id);

alter table purchase_receipts add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null;
create index if not exists purchase_receipts_purchase_order_idx on purchase_receipts(purchase_order_id);
