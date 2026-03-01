-- Recipe sync lifecycle: add, update, and delete
--
-- The xtraCHEF recipe sync now handles the full lifecycle:
--   ADD:    New recipes from xtraCHEF are inserted (upsert on xtrachef_id).
--   UPDATE: Existing recipes are updated in place. User-editable columns
--           (on_menu, creator, created_at_label) are preserved because
--           the sync payload does not include them.
--   DELETE: Recipes that no longer appear in xtraCHEF are removed from
--           the local DB. recipe_ingredients cascade-delete automatically.
--
-- This migration:
--   1. Cleans up orphaned recipe_ingredients from prior syncs
--   2. Adds an index on last_synced_at for efficient stale-recipe queries

-- ============================================================
-- Clean up orphaned recipe_ingredients (defensive)
-- ============================================================
delete from recipe_ingredients
where recipe_id not in (select id from recipes);

-- ============================================================
-- Index for stale-recipe detection during sync
-- ============================================================
create index if not exists idx_recipes_last_synced
  on recipes (last_synced_at);

-- ============================================================
-- Remove the status column from recipes (unused in UI)
-- ============================================================
drop index if exists idx_recipes_status;
alter table recipes drop column if exists status;
