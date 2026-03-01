-- Recipes & Ingredients (synced from xtraCHEF internal API)
--
-- xtraCHEF has no public API. Data is fetched by calling the same endpoints
-- the xtraCHEF SPA (app.sa.toasttab.com) uses, authenticated with the
-- user's session cookie.
--
-- API endpoints (host: ecs-api-prod.sa.toasttab.com):
--   Summary: /api.recipes-query/api/1.0/recipes-v2/tenants/{t}/location/{l}/recipe-summary
--   Detail:  /api.recipes-query/api/1.0/recipes-v2/{recipeId}/tenants/{t}/locations/{l}/recipe-details
--
-- Env vars required:
--   XTRACHEF_TENANT_ID    — numeric, from the API URL (e.g. 39494)
--   XTRACHEF_LOCATION_ID  — numeric, from the API URL (e.g. 12802)
--   XTRACHEF_COOKIE       — session cookie (or set via Settings page UI)

-- ============================================================
-- Recipes (cocktails, dishes, prep batches)
-- ============================================================
create table recipes (
  id                bigint generated always as identity primary key,
  xtrachef_id       integer unique not null,
  xtrachef_guid     text unique not null,
  name              text not null,
  type              text not null check (type in ('recipe', 'prep_recipe')),
  recipe_group      text,
  status            text,
  menu_price        numeric(10,2),
  prime_cost        numeric(10,4),
  food_cost_pct     numeric(10,4),
  toast_item_guid   text,
  serving_size      numeric(10,3),
  batch_size        numeric(10,3),
  batch_uom         text,
  last_modified_at  timestamptz,
  last_modified_by  text,
  last_synced_at    timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_recipes_type on recipes (type);
create index idx_recipes_group on recipes (recipe_group);
create index idx_recipes_toast_item on recipes (toast_item_guid)
  where toast_item_guid is not null;

-- ============================================================
-- Recipe ingredients (bill of materials)
-- Each line references either a raw ingredient or a prep recipe.
-- type = 'Ingredient' | 'Prep recipe'
-- ============================================================
create table recipe_ingredients (
  id                bigint generated always as identity primary key,
  recipe_id         bigint not null references recipes(id) on delete cascade,
  xtrachef_id       integer,
  name              text not null,
  type              text not null,
  quantity          numeric(10,3),
  uom               text,
  cost              numeric(10,4),
  reference_id      text,
  reference_guid    text,
  ingredient_yield  numeric(10,3),
  created_at        timestamptz default now()
);

create index idx_recipe_ingredients_recipe on recipe_ingredients (recipe_id);
create index idx_recipe_ingredients_ref on recipe_ingredients (reference_guid)
  where reference_guid is not null;

-- ============================================================
-- Ingredients (unique raw materials across all recipes)
-- Populated during sync from recipe_ingredients where type != 'Prep recipe'.
-- inventory_item_id can be manually linked to Toast inventory.
-- ============================================================
create table ingredients (
  id                bigint generated always as identity primary key,
  name              text unique not null,
  category          text,
  unit              text,
  cost_per_unit     numeric(10,4),
  inventory_item_id bigint references inventory_items(id) on delete set null,
  last_synced_at    timestamptz,
  created_at        timestamptz default now()
);

create index idx_ingredients_name on ingredients (name);
create index idx_ingredients_inventory on ingredients (inventory_item_id)
  where inventory_item_id is not null;
