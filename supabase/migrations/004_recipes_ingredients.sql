-- Recipes & Ingredients Schema
-- Supports: ingredients, prep recipes (syrups/batches), and recipes (menu items)

-- ============================================================
-- Ingredients
-- ============================================================
create table ingredients (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  category    text,
  unit        text default 'oz',
  cost_per_unit numeric(10,2),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- Prep Recipes (syrups, batches, sub-recipes)
-- ============================================================
create table prep_recipes (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  instructions  text,
  yield_amount  numeric(10,2),
  yield_unit    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Components of a prep recipe: ingredients or other prep recipes
create table prep_recipe_components (
  id                bigint generated always as identity primary key,
  prep_recipe_id    bigint not null references prep_recipes(id) on delete cascade,
  ingredient_id     bigint references ingredients(id) on delete cascade,
  prep_recipe_ref_id bigint references prep_recipes(id) on delete cascade,
  quantity          numeric(10,3) not null default 0,
  unit              text,
  created_at        timestamptz default now(),
  constraint chk_component_type check (
    (ingredient_id is not null and prep_recipe_ref_id is null)
    or (ingredient_id is null and prep_recipe_ref_id is not null)
  ),
  constraint uq_prep_component unique (prep_recipe_id, ingredient_id, prep_recipe_ref_id)
);

-- ============================================================
-- Recipes (correspond to menu items)
-- ============================================================
create table recipes (
  id              bigint generated always as identity primary key,
  name            text not null unique,
  menu_item_name  text,
  instructions    text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Components of a recipe: ingredients or prep recipes
create table recipe_components (
  id                bigint generated always as identity primary key,
  recipe_id         bigint not null references recipes(id) on delete cascade,
  ingredient_id     bigint references ingredients(id) on delete cascade,
  prep_recipe_id    bigint references prep_recipes(id) on delete cascade,
  quantity          numeric(10,3) not null default 0,
  unit              text,
  created_at        timestamptz default now(),
  constraint chk_component_type check (
    (ingredient_id is not null and prep_recipe_id is null)
    or (ingredient_id is null and prep_recipe_id is not null)
  ),
  constraint uq_recipe_component unique (recipe_id, ingredient_id, prep_recipe_id)
);

-- Indexes
create index idx_prep_recipe_components_prep on prep_recipe_components(prep_recipe_id);
create index idx_recipe_components_recipe on recipe_components(recipe_id);
create index idx_recipes_menu_item on recipes(menu_item_name);
