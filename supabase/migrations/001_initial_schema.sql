-- Bar Manager - Initial Schema
-- Phase 1: Inventory & Sales core tables
-- Phase 2+: Tax, scheduling, payroll tables included for forward-compatibility

-- ============================================================
-- Inventory
-- ============================================================
create table inventory_items (
  id            bigint generated always as identity primary key,
  toast_guid    text unique,
  name          text not null,
  category      text,
  current_stock numeric(10,2) default 0,
  par_level     numeric(10,2),
  unit          text default 'each',
  cost_per_unit numeric(10,2),
  last_synced_at timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table inventory_alerts (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references inventory_items(id) on delete cascade,
  alert_type  text not null check (alert_type in ('low_stock', 'out_of_stock', 'overstock')),
  threshold   numeric(10,2),
  message     text,
  resolved    boolean default false,
  created_at  timestamptz default now(),
  resolved_at timestamptz
);

create index idx_inventory_alerts_unresolved on inventory_alerts (resolved, created_at desc)
  where not resolved;

-- ============================================================
-- Sales
-- ============================================================
create table daily_sales (
  id                 bigint generated always as identity primary key,
  date               date not null unique,
  gross_sales        numeric(10,2) default 0,
  net_sales          numeric(10,2) default 0,
  tax_collected      numeric(10,2) default 0,
  tips               numeric(10,2) default 0,
  discounts          numeric(10,2) default 0,
  payment_breakdown  jsonb default '{}',
  created_at         timestamptz default now()
);

create table order_items (
  id              bigint generated always as identity primary key,
  date            date not null,
  menu_item_guid  text,
  name            text not null,
  quantity        integer not null default 1,
  revenue         numeric(10,2) default 0,
  created_at      timestamptz default now()
);

create index idx_order_items_date on order_items (date);
create index idx_order_items_menu_item on order_items (menu_item_guid, date);

-- ============================================================
-- Tax (Phase 2)
-- ============================================================
create table tax_periods (
  id             bigint generated always as identity primary key,
  period_start   date not null,
  period_end     date not null,
  taxable_sales  numeric(12,2) default 0,
  tax_collected  numeric(12,2) default 0,
  tax_due        numeric(12,2) default 0,
  status         text default 'pending' check (status in ('pending', 'computed', 'filed')),
  filed_at       timestamptz,
  created_at     timestamptz default now()
);

-- ============================================================
-- Employees, Scheduling & Payroll (Phase 3)
-- ============================================================
create table employees (
  id          bigint generated always as identity primary key,
  toast_id    text unique,
  sling_id    text unique,
  name        text not null,
  role        text,
  hourly_rate numeric(8,2),
  active      boolean default true,
  created_at  timestamptz default now()
);

create table time_entries (
  id              bigint generated always as identity primary key,
  employee_id     bigint not null references employees(id) on delete cascade,
  date            date not null,
  regular_hours   numeric(6,2) default 0,
  overtime_hours  numeric(6,2) default 0,
  tips            numeric(8,2) default 0,
  created_at      timestamptz default now()
);

-- ============================================================
-- System
-- ============================================================
create table sync_logs (
  id              bigint generated always as identity primary key,
  source          text not null,
  status          text not null check (status in ('started', 'success', 'error')),
  records_synced  integer default 0,
  error           text,
  started_at      timestamptz default now(),
  completed_at    timestamptz
);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
