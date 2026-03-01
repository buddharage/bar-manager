import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";
import { recalculateExpectedInventory } from "@/lib/inventory/expected";

/**
 * GET /api/inventory
 *
 * Returns all ingredients with inventory data (current quantity, expected
 * quantity, par levels, unit conversion config, count history).
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: ingredients, error } = await supabase
    .from("ingredients")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

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
