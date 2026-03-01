import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";
import { recalculateExpectedInventory } from "@/lib/inventory/expected";

/**
 * GET /api/inventory
 *
 * Returns ingredients that are used by on-menu recipes, with inventory data
 * (current quantity, expected quantity, par levels, unit conversion config,
 * count history). Ingredients not linked to any on-menu recipe are excluded
 * so the list focuses on what is currently in use.
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Build the set of ingredient names used by on-menu recipes (including
  // ingredients referenced through prep recipes).
  const onMenuIngredientNames = await getOnMenuIngredientNames(supabase);

  let query = supabase
    .from("ingredients")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  // Only filter when there are on-menu recipes; if none exist yet, show all
  // ingredients so the page is not unexpectedly empty.
  if (onMenuIngredientNames.size > 0) {
    query = query.in("name", Array.from(onMenuIngredientNames));
  }

  const { data: ingredients, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count active alerts per ingredient
  const { data: alerts } = await supabase
    .from("inventory_alerts")
    .select("ingredient_id")
    .not("ingredient_id", "is", null)
    .eq("resolved", false);

  const alertsByIngredient = new Map<number, number>();
  for (const a of alerts || []) {
    if (a.ingredient_id) {
      alertsByIngredient.set(
        a.ingredient_id,
        (alertsByIngredient.get(a.ingredient_id) || 0) + 1,
      );
    }
  }

  const items = (ingredients || []).map((ing) => ({
    ...ing,
    active_alerts: alertsByIngredient.get(ing.id) || 0,
  }));

  const belowPar = items.filter(
    (i) =>
      i.par_level != null &&
      i.expected_quantity != null &&
      i.expected_quantity <= i.par_level,
  ).length;

  return NextResponse.json({
    items,
    summary: {
      total: items.length,
      counted: items.filter((i) => i.last_counted_at).length,
      belowPar,
      categories: [...new Set(items.map((i) => i.category || "Uncategorized"))].length,
    },
  });
}

/**
 * Collect the names of all raw ingredients used by on-menu recipes.
 * Prep recipes referenced by on-menu recipes are expanded recursively so
 * their raw ingredient lines are included too.
 */
async function getOnMenuIngredientNames(
  supabase: ReturnType<typeof createServerClient>,
): Promise<Set<string>> {
  // 1. Get all on-menu recipes
  const { data: onMenuRecipes } = await supabase
    .from("recipes")
    .select("id")
    .eq("on_menu", true);

  if (!onMenuRecipes || onMenuRecipes.length === 0) {
    return new Set();
  }

  const onMenuIds = onMenuRecipes.map((r: { id: number }) => r.id);

  // 2. Get recipe_ingredients for on-menu recipes
  const { data: riRows } = await supabase
    .from("recipe_ingredients")
    .select("name, type, reference_guid")
    .in("recipe_id", onMenuIds);

  const names = new Set<string>();
  const prepGuids = new Set<string>();

  for (const ri of riRows || []) {
    if (ri.type === "Prep recipe" && ri.reference_guid) {
      prepGuids.add(ri.reference_guid);
    } else {
      names.add(ri.name);
    }
  }

  // 3. Expand prep recipes to get their raw ingredients (one level of
  //    recursion is sufficient for the current data model; deeply nested
  //    prep-in-prep chains are uncommon but handled iteratively below).
  const visited = new Set<string>();
  let toExpand = Array.from(prepGuids);

  while (toExpand.length > 0) {
    const unvisited = toExpand.filter((g) => !visited.has(g));
    if (unvisited.length === 0) break;
    for (const g of unvisited) visited.add(g);

    // Find recipe ids for these prep recipes by xtrachef_guid
    const { data: prepRecipes } = await supabase
      .from("recipes")
      .select("id")
      .in("xtrachef_guid", unvisited);

    if (!prepRecipes || prepRecipes.length === 0) break;

    const prepIds = prepRecipes.map((r: { id: number }) => r.id);
    const { data: prepRiRows } = await supabase
      .from("recipe_ingredients")
      .select("name, type, reference_guid")
      .in("recipe_id", prepIds);

    const nextGuids: string[] = [];
    for (const ri of prepRiRows || []) {
      if (ri.type === "Prep recipe" && ri.reference_guid) {
        nextGuids.push(ri.reference_guid);
      } else {
        names.add(ri.name);
      }
    }
    toExpand = nextGuids;
  }

  return names;
}

/**
 * POST /api/inventory
 *
 * Triggers a recalculation of expected inventory for all ingredients.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const result = await recalculateExpectedInventory(supabase);

  return NextResponse.json({
    success: true,
    ...result,
  });
}
