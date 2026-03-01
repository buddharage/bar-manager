-- Inventory Rework: ingredient-based inventory tracking
--
-- The inventory system now centers on the `ingredients` table (populated from
-- xtraCHEF recipe sync) rather than `inventory_items` (from Toast stock API).
--
-- New capabilities:
--   • Manual stock counts with history
--   • Par levels per ingredient
--   • Expected inventory (computed from sales usage since last count)
--   • Purchase-unit conversions (e.g. 1 bottle = 750 ml)
--   • Alerts when expected inventory falls below par level

-- ============================================================
-- Extend ingredients table with inventory tracking columns
-- ============================================================
alter table ingredients add column current_quantity numeric(10,3) default 0;
alter table ingredients add column par_level numeric(10,3);
alter table ingredients add column expected_quantity numeric(10,3);
alter table ingredients add column purchase_unit text;
alter table ingredients add column purchase_unit_quantity numeric(10,3);
alter table ingredients add column last_counted_at timestamptz;
alter table ingredients add column last_counted_quantity numeric(10,3) default 0;

-- ============================================================
-- Inventory count history
-- ============================================================
create table inventory_counts (
  id              bigint generated always as identity primary key,
  ingredient_id   bigint not null references ingredients(id) on delete cascade,
  quantity        numeric(10,3) not null,
  quantity_raw    text,
  note            text,
  counted_at      timestamptz default now(),
  created_at      timestamptz default now()
);

create index idx_inventory_counts_ingredient on inventory_counts (ingredient_id, counted_at desc);

-- ============================================================
-- Allow inventory_alerts to reference ingredients
-- ============================================================
alter table inventory_alerts alter column item_id drop not null;
alter table inventory_alerts add column ingredient_id bigint references ingredients(id) on delete cascade;

create index idx_inventory_alerts_ingredient on inventory_alerts (ingredient_id)
  where ingredient_id is not null;
