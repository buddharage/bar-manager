import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";
import { parseQuantityInput } from "@/lib/units";
import { recalculateExpectedInventory } from "@/lib/inventory/expected";

/**
 * POST /api/inventory/:id/count
 *
 * Record a manual inventory count for an ingredient.
 * Accepts quantity in base units or purchase units (e.g. "2 bottles").
 * Updates the ingredient's current_quantity and last_counted_at,
 * records the count in history, and triggers expected inventory recalculation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = createServerClient();

  // Fetch the ingredient to get its unit config
  const { data: ingredient, error: fetchError } = await supabase
    .from("ingredients")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !ingredient) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  // Parse the quantity input
  let quantity: number;
  let quantityRaw: string;

  if (body.quantity_raw && typeof body.quantity_raw === "string") {
    // User entered a string like "2 bottles" or "500 ml"
    const parsed = parseQuantityInput(
      body.quantity_raw,
      ingredient.unit || "each",
      ingredient.purchase_unit,
      ingredient.purchase_unit_quantity,
    );

    if (!parsed) {
      return NextResponse.json(
        { error: "Could not parse quantity. Enter a number optionally followed by a unit." },
        { status: 400 },
      );
    }

    quantity = parsed.quantity;
    quantityRaw = parsed.raw;
  } else if (body.quantity !== undefined) {
    // Direct numeric quantity in base units
    quantity = Number(body.quantity);
    if (isNaN(quantity) || quantity < 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    quantityRaw = `${quantity} ${ingredient.unit || "units"}`;
  } else {
    return NextResponse.json(
      { error: "Provide either quantity (number) or quantity_raw (string)" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const roundedQty = Math.round(quantity * 1000) / 1000;

  // Record the count in history
  const { error: countError } = await supabase.from("inventory_counts").insert({
    ingredient_id: Number(id),
    quantity: roundedQty,
    quantity_raw: quantityRaw,
    note: body.note || null,
    counted_at: now,
  });

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  // Update the ingredient
  const { error: updateError } = await supabase
    .from("ingredients")
    .update({
      current_quantity: roundedQty,
      last_counted_at: now,
      last_counted_quantity: roundedQty,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Recalculate expected inventory
  await recalculateExpectedInventory(supabase);

  // Fetch updated ingredient
  const { data: updated } = await supabase
    .from("ingredients")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json({
    ingredient: updated,
    count: {
      quantity: roundedQty,
      quantity_raw: quantityRaw,
      counted_at: now,
    },
  });
}

/**
 * GET /api/inventory/:id/count
 *
 * Returns count history for an ingredient.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data: counts, error } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("ingredient_id", id)
    .order("counted_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ counts: counts || [] });
}
