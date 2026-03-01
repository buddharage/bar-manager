#!/usr/bin/env npx tsx
/**
 * xtraCHEF Recipe Sync — CLI Script
 *
 * Scrapes recipe data from xtraCHEF via Playwright and stores it in Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-xtrachef.ts              # visible browser (first run / re-login)
 *   npx tsx scripts/sync-xtrachef.ts --headless    # headless (after initial login)
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Playwright browsers installed: npx playwright install chromium
 *
 * On first run the browser opens visible so you can log in manually.
 * Your session cookies are saved to .xtrachef-state/ for future headless runs.
 */

import "dotenv/config";
import { scrapeXtrachefRecipes, type ScrapedRecipe } from "../lib/integrations/xtrachef-scraper";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const headless = process.argv.includes("--headless");

async function upsertRecipes(recipes: ScrapedRecipe[]): Promise<number> {
  let count = 0;

  for (const recipe of recipes) {
    // 1. Upsert the recipe itself
    const recipeRow = {
      xtrachef_id: recipe.xtrachefId,
      name: recipe.name,
      category: recipe.category,
      type: recipe.type,
      yield_quantity: recipe.yieldQuantity,
      yield_unit: recipe.yieldUnit,
      cost: recipe.cost,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let recipeId: number;

    if (recipe.xtrachefId) {
      const { data, error } = await supabase
        .from("recipes")
        .upsert(recipeRow, { onConflict: "xtrachef_id" })
        .select("id")
        .single();

      if (error) {
        console.error(`  ❌ Failed to upsert recipe "${recipe.name}":`, error.message);
        continue;
      }
      recipeId = data.id;
    } else {
      // No xtraCHEF ID — try to match by name, else insert
      const { data: existing } = await supabase
        .from("recipes")
        .select("id")
        .eq("name", recipe.name)
        .limit(1)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("recipes")
          .update(recipeRow)
          .eq("id", existing.id);
        if (error) {
          console.error(`  ❌ Failed to update recipe "${recipe.name}":`, error.message);
          continue;
        }
        recipeId = existing.id;
      } else {
        const { data, error } = await supabase
          .from("recipes")
          .insert(recipeRow)
          .select("id")
          .single();
        if (error) {
          console.error(`  ❌ Failed to insert recipe "${recipe.name}":`, error.message);
          continue;
        }
        recipeId = data.id;
      }
    }

    // 2. Sync ingredients: delete existing and re-insert
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);

    for (const ing of recipe.ingredients) {
      // Upsert the ingredient into the ingredients table
      let ingredientId: number | null = null;

      const { data: existingIng } = await supabase
        .from("ingredients")
        .select("id")
        .eq("name", ing.name)
        .limit(1)
        .single();

      if (existingIng) {
        ingredientId = existingIng.id;
        // Update cost if we have it
        if (ing.cost != null && ing.quantity) {
          await supabase
            .from("ingredients")
            .update({
              cost_per_unit: ing.cost / ing.quantity,
              unit: ing.unit,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", ingredientId);
        }
      } else {
        const { data: newIng } = await supabase
          .from("ingredients")
          .insert({
            name: ing.name,
            unit: ing.unit,
            cost_per_unit: ing.cost && ing.quantity ? ing.cost / ing.quantity : null,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        ingredientId = newIng?.id || null;
      }

      // Check if this ingredient is actually a sub-recipe (prep recipe)
      let subRecipeId: number | null = null;
      const { data: subRecipe } = await supabase
        .from("recipes")
        .select("id")
        .eq("name", ing.name)
        .eq("type", "prep_recipe")
        .limit(1)
        .single();
      if (subRecipe) {
        subRecipeId = subRecipe.id;
      }

      // Insert recipe_ingredient link
      await supabase.from("recipe_ingredients").insert({
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        sub_recipe_id: subRecipeId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        cost: ing.cost,
      });
    }

    count++;
    console.log(`  ✅ ${recipe.name} (${recipe.ingredients.length} ingredients)`);
  }

  return count;
}

async function main() {
  console.log("🚀 Starting xtraCHEF recipe sync...\n");

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "xtrachef", status: "started" })
    .select("id")
    .single();

  try {
    const result = await scrapeXtrachefRecipes({ headless });

    if (result.errors.length > 0) {
      console.warn("\n⚠️  Scraping errors:");
      result.errors.forEach((e) => console.warn(`   ${e}`));
    }

    if (result.recipes.length === 0) {
      console.log("\n⚠️  No recipes found. The DOM selectors may need updating.");
      console.log("   Check the xtraCHEF page structure and update xtrachef-scraper.ts.\n");

      if (syncLog) {
        await supabase
          .from("sync_logs")
          .update({
            status: "error",
            error: "No recipes found — DOM selectors may need updating",
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);
      }
      return;
    }

    console.log(`\n💾 Saving ${result.recipes.length} recipes to database...\n`);
    const count = await upsertRecipes(result.recipes);

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          records_synced: count,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.log(`\n🎉 Done! Synced ${count} recipes.\n`);
  } catch (error) {
    console.error("\n❌ Sync failed:", error);

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "error",
          error: String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    process.exit(1);
  }
}

main();
