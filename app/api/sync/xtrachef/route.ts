import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";

interface IngredientPayload {
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
}

interface RecipePayload {
  xtrachefId: string | null;
  name: string;
  category: string | null;
  type: "recipe" | "prep_recipe";
  yieldQuantity: number | null;
  yieldUnit: string | null;
  cost: number | null;
  ingredients: IngredientPayload[];
}

/**
 * POST /api/sync/xtrachef
 *
 * Accepts scraped xtraCHEF recipe data and upserts into the database.
 * Body: { recipes: RecipePayload[] }
 *
 * This endpoint is called by the CLI sync script or can accept
 * manually posted recipe data.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "xtrachef", status: "started" })
    .select("id")
    .single();

  try {
    const body = await request.json();
    const recipes: RecipePayload[] = body.recipes;

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: "No recipes provided" }, { status: 400 });
    }

    let totalRecords = 0;

    for (const recipe of recipes) {
      // Upsert recipe
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
        if (error) continue;
        recipeId = data.id;
      } else {
        const { data: existing } = await supabase
          .from("recipes")
          .select("id")
          .eq("name", recipe.name)
          .limit(1)
          .single();

        if (existing) {
          await supabase.from("recipes").update(recipeRow).eq("id", existing.id);
          recipeId = existing.id;
        } else {
          const { data, error } = await supabase
            .from("recipes")
            .insert(recipeRow)
            .select("id")
            .single();
          if (error) continue;
          recipeId = data.id;
        }
      }

      // Replace ingredient links
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);

      for (const ing of recipe.ingredients) {
        // Upsert ingredient
        const { data: existingIng } = await supabase
          .from("ingredients")
          .select("id")
          .eq("name", ing.name)
          .limit(1)
          .single();

        let ingredientId: number | null = null;

        if (existingIng) {
          ingredientId = existingIng.id;
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

        // Check for sub-recipe reference
        const { data: subRecipe } = await supabase
          .from("recipes")
          .select("id")
          .eq("name", ing.name)
          .eq("type", "prep_recipe")
          .limit(1)
          .single();

        await supabase.from("recipe_ingredients").insert({
          recipe_id: recipeId,
          ingredient_id: ingredientId,
          sub_recipe_id: subRecipe?.id || null,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          cost: ing.cost,
        });
      }

      totalRecords++;
    }

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          records_synced: totalRecords,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({
      success: true,
      records_synced: totalRecords,
    });
  } catch (error) {
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

    console.error("xtraCHEF sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/xtrachef
 *
 * Returns the latest xtraCHEF sync status.
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: lastSync } = await supabase
    .from("sync_logs")
    .select("*")
    .eq("source", "xtrachef")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  const { count: recipeCount } = await supabase
    .from("recipes")
    .select("*", { count: "exact", head: true });

  const { count: ingredientCount } = await supabase
    .from("ingredients")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    lastSync,
    recipeCount: recipeCount || 0,
    ingredientCount: ingredientCount || 0,
  });
}
