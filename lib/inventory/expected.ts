/**
 * Expected inventory calculation engine.
 *
 * Computes how much of each ingredient should remain based on:
 *   1. The last manual count (baseline)
 *   2. Sales (order_items) since that count
 *   3. Recipe specs linking menu items to ingredients
 *
 * Flow:
 *   last_counted_quantity − Σ(ingredient usage from sales since count) = expected_quantity
 *
 * After calculation, updates the `expected_quantity` column on the `ingredients`
 * table and creates alerts when expected_quantity < par_level.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { toBaseUnit } from "@/lib/units";

interface Ingredient {
  id: number;
  name: string;
  unit: string | null;
  current_quantity: number;
  par_level: number | null;
  last_counted_at: string | null;
  last_counted_quantity: number;
}

interface Recipe {
  id: number;
  toast_item_guid: string | null;
  batch_size: number | null;
  batch_uom: string | null;
}

interface RecipeIngredient {
  recipe_id: number;
  name: string;
  type: string;
  quantity: number | null;
  uom: string | null;
  reference_guid: string | null;
}

interface OrderItemAgg {
  menu_item_guid: string;
  total_quantity: number;
}

/**
 * Recalculate expected inventory for all ingredients that have been counted.
 * Call this after Toast syncs and after manual counts.
 */
export async function recalculateExpectedInventory(
  supabase: SupabaseClient,
): Promise<{ updated: number; alerts: number }> {
  // 1. Load all ingredients that have been counted
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, current_quantity, par_level, last_counted_at, last_counted_quantity")
    .not("last_counted_at", "is", null);

  if (!ingredients || ingredients.length === 0) {
    return { updated: 0, alerts: 0 };
  }

  // 2. Load all recipes that are linked to Toast menu items
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, toast_item_guid, batch_size, batch_uom")
    .not("toast_item_guid", "is", null);

  if (!recipes || recipes.length === 0) {
    // No recipes linked to Toast menu items — just set expected = current
    for (const ing of ingredients as Ingredient[]) {
      await supabase
        .from("ingredients")
        .update({ expected_quantity: ing.last_counted_quantity })
        .eq("id", ing.id);
    }
    return { updated: ingredients.length, alerts: 0 };
  }

  // 3. Build recipe lookup: toast_item_guid → recipe
  const recipeByGuid = new Map<string, Recipe>();
  for (const r of recipes as Recipe[]) {
    if (r.toast_item_guid) {
      recipeByGuid.set(r.toast_item_guid, r);
    }
  }

  // 4. Load all recipe ingredients
  const recipeIds = (recipes as Recipe[]).map((r) => r.id);
  const { data: recipeIngredients } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, name, type, quantity, uom, reference_guid")
    .in("recipe_id", recipeIds);

  // 5. Build recipe_id → ingredient lines map
  const ingredientsByRecipe = new Map<number, RecipeIngredient[]>();
  for (const ri of (recipeIngredients || []) as RecipeIngredient[]) {
    const list = ingredientsByRecipe.get(ri.recipe_id) || [];
    list.push(ri);
    ingredientsByRecipe.set(ri.recipe_id, list);
  }

  // 6. Load all prep recipes for recursive expansion
  const { data: allPrepRecipes } = await supabase
    .from("recipes")
    .select("id, xtrachef_guid, batch_size, batch_uom")
    .eq("type", "prep_recipe");

  const prepRecipeByGuid = new Map<string, Recipe & { xtrachef_guid: string }>();
  for (const pr of (allPrepRecipes || []) as (Recipe & { xtrachef_guid: string })[]) {
    prepRecipeByGuid.set(pr.xtrachef_guid, pr);
  }

  // Load prep recipe ingredients too
  const prepRecipeIds = (allPrepRecipes || []).map((r: { id: number }) => r.id);
  if (prepRecipeIds.length > 0) {
    const { data: prepIngredients } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, type, quantity, uom, reference_guid")
      .in("recipe_id", prepRecipeIds);

    for (const ri of (prepIngredients || []) as RecipeIngredient[]) {
      const list = ingredientsByRecipe.get(ri.recipe_id) || [];
      list.push(ri);
      ingredientsByRecipe.set(ri.recipe_id, list);
    }
  }

  // 7. For each ingredient, calculate usage since last count
  let updated = 0;
  let alertsCreated = 0;

  for (const ing of ingredients as Ingredient[]) {
    const countDate = ing.last_counted_at!;
    const dateOnly = countDate.split("T")[0];

    // Get aggregated order quantities per menu_item_guid since count date
    const orderAggs = await getOrderAggsSince(supabase, dateOnly);

    // Calculate total usage of this ingredient
    let totalUsage = 0;

    for (const orderAgg of orderAggs) {
      const recipe = recipeByGuid.get(orderAgg.menu_item_guid);
      if (!recipe) continue;

      const usage = calculateIngredientUsage(
        ing.name,
        ing.unit || "each",
        recipe,
        ingredientsByRecipe,
        prepRecipeByGuid,
        new Set(),
      );

      totalUsage += usage * orderAgg.total_quantity;
    }

    const expectedQty = Math.max(0, ing.last_counted_quantity - totalUsage);

    await supabase
      .from("ingredients")
      .update({ expected_quantity: Math.round(expectedQty * 1000) / 1000 })
      .eq("id", ing.id);

    updated++;

    // Check if we need to create/resolve alerts
    if (ing.par_level != null) {
      if (expectedQty <= ing.par_level) {
        const alertType = expectedQty === 0 ? "out_of_stock" : "low_stock";

        const { data: existingAlert } = await supabase
          .from("inventory_alerts")
          .select("id")
          .eq("ingredient_id", ing.id)
          .eq("resolved", false)
          .limit(1)
          .maybeSingle();

        if (!existingAlert) {
          await supabase.from("inventory_alerts").insert({
            ingredient_id: ing.id,
            alert_type: alertType,
            threshold: ing.par_level,
            message: `${ing.name} expected inventory is ${alertType === "out_of_stock" ? "depleted" : "below par level"} (expected: ${expectedQty.toFixed(1)} ${ing.unit || "units"}, par: ${ing.par_level})`,
          });
          alertsCreated++;
        }
      } else {
        // Resolve existing alerts if expected is back above par
        await supabase
          .from("inventory_alerts")
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq("ingredient_id", ing.id)
          .eq("resolved", false);
      }
    }
  }

  return { updated, alerts: alertsCreated };
}

/**
 * Get aggregated sales quantities per menu_item_guid since a given date.
 * Uses pagination to handle large datasets.
 */
async function getOrderAggsSince(
  supabase: SupabaseClient,
  sinceDate: string,
): Promise<OrderItemAgg[]> {
  const PAGE_SIZE = 1000;
  const aggMap = new Map<string, number>();
  let from = 0;

  while (true) {
    const { data: page } = await supabase
      .from("order_items")
      .select("menu_item_guid, quantity")
      .gte("date", sinceDate)
      .not("menu_item_guid", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (!page || page.length === 0) break;

    for (const row of page) {
      if (!row.menu_item_guid) continue;
      aggMap.set(
        row.menu_item_guid,
        (aggMap.get(row.menu_item_guid) || 0) + (row.quantity || 0),
      );
    }

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Array.from(aggMap.entries()).map(([guid, qty]) => ({
    menu_item_guid: guid,
    total_quantity: qty,
  }));
}

/**
 * Calculate how much of a specific ingredient is used per serving of a recipe.
 * Handles prep recipe expansion recursively.
 */
function calculateIngredientUsage(
  ingredientName: string,
  ingredientBaseUnit: string,
  recipe: Recipe,
  ingredientsByRecipe: Map<number, RecipeIngredient[]>,
  prepRecipeByGuid: Map<string, Recipe & { xtrachef_guid: string }>,
  visited: Set<number>,
): number {
  if (visited.has(recipe.id)) return 0; // prevent infinite recursion
  visited.add(recipe.id);

  const lines = ingredientsByRecipe.get(recipe.id) || [];
  let total = 0;

  for (const line of lines) {
    if (line.type === "Prep recipe" && line.reference_guid) {
      // Expand prep recipe: the line.quantity + line.uom tells us how much
      // of the prep recipe is used per serving. We need to figure out what
      // fraction of the prep batch that is, then multiply by each raw
      // ingredient in the prep recipe.
      const prepRecipe = prepRecipeByGuid.get(line.reference_guid);
      if (!prepRecipe) continue;

      const prepLines = ingredientsByRecipe.get(prepRecipe.id) || [];
      const batchSize = prepRecipe.batch_size || 1;

      // How much of the prep batch is used per serving of the parent recipe
      let servingFraction = (line.quantity || 0) / batchSize;

      // If the prep recipe's batch_uom differs from the line's uom, convert
      if (line.uom && prepRecipe.batch_uom && line.uom !== prepRecipe.batch_uom) {
        const convertedQty = toBaseUnit(line.quantity || 0, line.uom, prepRecipe.batch_uom);
        servingFraction = convertedQty / batchSize;
      }

      for (const prepLine of prepLines) {
        if (prepLine.type === "Prep recipe" && prepLine.reference_guid) {
          // Recursive prep recipe
          const nestedUsage = calculateIngredientUsage(
            ingredientName,
            ingredientBaseUnit,
            prepRecipe,
            ingredientsByRecipe,
            prepRecipeByGuid,
            new Set(visited),
          );
          total += nestedUsage * servingFraction;
        } else if (
          prepLine.name.toLowerCase() === ingredientName.toLowerCase() &&
          prepLine.quantity
        ) {
          // Raw ingredient match within prep recipe
          const rawQty = prepLine.quantity * servingFraction;
          total += toBaseUnit(rawQty, prepLine.uom || ingredientBaseUnit, ingredientBaseUnit);
        }
      }
    } else if (
      line.name.toLowerCase() === ingredientName.toLowerCase() &&
      line.quantity
    ) {
      // Direct raw ingredient match
      total += toBaseUnit(line.quantity, line.uom || ingredientBaseUnit, ingredientBaseUnit);
    }
  }

  return total;
}
