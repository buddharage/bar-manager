-- Recipes & Ingredients (synced from xtraCHEF)
-- Supports recipes, prep recipes, and raw ingredients with
-- recipe-ingredient links for cost roll-up and ordering alerts.

-- ============================================================
-- Recipes (cocktails, dishes, prep batches)
-- ============================================================
create table recipes (
  id              bigint generated always as identity primary key,
  xtrachef_id     text unique,
  name            text not null,
  category        text,
  type            text not null default 'recipe' check (type in ('recipe', 'prep_recipe')),
  yield_quantity  numeric(10,3),
  yield_unit      text,
  cost            numeric(10,4),
  last_synced_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_recipes_type on recipes (type);
create index idx_recipes_category on recipes (category);

-- ============================================================
-- Ingredients (raw materials: limes, vodka, pineapple juice…)
-- ============================================================
create table ingredients (
  id              bigint generated always as identity primary key,
  xtrachef_id     text unique,
  name            text not null,
  category        text,
  unit            text,
  cost_per_unit   numeric(10,4),
  inventory_item_id bigint references inventory_items(id) on delete set null,
  last_synced_at  timestamptz,
  created_at      timestamptz default now()
);

create index idx_ingredients_name on ingredients (name);
create index idx_ingredients_inventory on ingredients (inventory_item_id)
  where inventory_item_id is not null;

-- ============================================================
-- Recipe ingredients (bill of materials)
-- A recipe line can reference either a raw ingredient or a
-- sub-recipe (prep recipe used as a component).
-- ============================================================
create table recipe_ingredients (
  id              bigint generated always as identity primary key,
  recipe_id       bigint not null references recipes(id) on delete cascade,
  ingredient_id   bigint references ingredients(id) on delete set null,
  sub_recipe_id   bigint references recipes(id) on delete set null,
  name            text not null,
  quantity        numeric(10,3),
  unit            text,
  cost            numeric(10,4),
  created_at      timestamptz default now()
);

create index idx_recipe_ingredients_recipe on recipe_ingredients (recipe_id);
create index idx_recipe_ingredients_ingredient on recipe_ingredients (ingredient_id)
  where ingredient_id is not null;
create index idx_recipe_ingredients_sub_recipe on recipe_ingredients (sub_recipe_id)
  where sub_recipe_id is not null;
