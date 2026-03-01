/**
 * xtraCHEF recipe sync logic.
 *
 * Shared between the API route (UI sync button) and the CLI script.
 * Fetches all recipes from xtraCHEF and upserts into Supabase.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { XtrachefClient, type FullRecipe } from "@/lib/integrations/xtrachef-client";

interface SyncResult {
  recipesUpserted: number;
  ingredientLinesInserted: number;
  rawIngredientsUpserted: number;
  errors: string[];
}

export async function syncXtrachefRecipes(
  supabase: SupabaseClient,
  client: XtrachefClient,
  opts?: { onProgress?: (done: number, total: number) => void },
): Promise<SyncResult> {
  const errors: string[] = [];
  let recipesUpserted = 0;
  let ingredientLinesInserted = 0;

  // 1. Fetch all recipes with ingredients from xtraCHEF
  const allRecipes = await client.fetchAllRecipes({
    onProgress: opts?.onProgress,
  });

  const now = new Date().toISOString();

  // 2. Upsert each recipe and its ingredients
  for (const { recipe, ingredients } of allRecipes) {
    const { data, error: recipeErr } = await supabase
      .from("recipes")
      .upsert(
        { ...recipe, last_synced_at: now, updated_at: now },
        { onConflict: "xtrachef_id" },
      )
      .select("id")
      .single();

    if (recipeErr || !data) {
      errors.push(`Failed to upsert recipe "${recipe.name}": ${recipeErr?.message}`);
      continue;
    }

    const recipeId = data.id;
    recipesUpserted++;

    // Delete existing ingredient lines and re-insert
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);

    if (ingredients.length > 0) {
      const rows = ingredients.map((ing) => ({ ...ing, recipe_id: recipeId }));
      const { error: ingErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (ingErr) {
        errors.push(`Failed to insert ingredients for "${recipe.name}": ${ingErr.message}`);
      } else {
        ingredientLinesInserted += ingredients.length;
      }
    }
  }

  // 3. Populate the raw ingredients table from unique ingredient lines
  const rawIngredientsUpserted = await populateRawIngredients(supabase, now);

  return { recipesUpserted, ingredientLinesInserted, rawIngredientsUpserted, errors };
}

/**
 * Build the `ingredients` table from unique raw ingredient names
 * found in recipe_ingredients where type != 'Prep recipe'.
 */
async function populateRawIngredients(
  supabase: SupabaseClient,
  syncedAt: string,
): Promise<number> {
  // Get distinct raw ingredient names + average cost per unit
  const { data: rawLines } = await supabase
    .from("recipe_ingredients")
    .select("name, uom, cost, quantity")
    .neq("type", "Prep recipe");

  if (!rawLines || rawLines.length === 0) return 0;

  // Deduplicate by name
  const byName = new Map<string, { unit: string | null; costPerUnit: number | null }>();
  for (const line of rawLines) {
    if (byName.has(line.name)) continue;
    const costPerUnit =
      line.cost != null && line.quantity ? Number(line.cost) / Number(line.quantity) : null;
    byName.set(line.name, { unit: line.uom, costPerUnit });
  }

  let count = 0;
  for (const [name, { unit, costPerUnit }] of byName) {
    const { error } = await supabase
      .from("ingredients")
      .upsert(
        {
          name,
          unit,
          cost_per_unit: costPerUnit,
          last_synced_at: syncedAt,
        },
        { onConflict: "name" },
      );
    if (!error) count++;
  }

  return count;
}
