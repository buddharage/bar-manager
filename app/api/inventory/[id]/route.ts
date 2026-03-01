import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";

/**
 * GET /api/inventory/:id
 *
 * Returns a single ingredient with its count history.
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

  const { data: ingredient, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ingredient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch count history
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("ingredient_id", id)
    .order("counted_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    ingredient,
    counts: counts || [],
  });
}

/**
 * PUT /api/inventory/:id
 *
 * Update ingredient settings: par level, purchase unit config, category.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = createServerClient();

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {};

  if (body.par_level !== undefined) {
    allowedFields.par_level = body.par_level === null || body.par_level === ""
      ? null
      : Number(body.par_level);
  }
  if (body.purchase_unit !== undefined) {
    allowedFields.purchase_unit = body.purchase_unit || null;
  }
  if (body.purchase_unit_quantity !== undefined) {
    allowedFields.purchase_unit_quantity =
      body.purchase_unit_quantity === null || body.purchase_unit_quantity === ""
        ? null
        : Number(body.purchase_unit_quantity);
  }
  if (body.unit !== undefined) {
    allowedFields.unit = body.unit || null;
  }
  if (body.category !== undefined) {
    allowedFields.category = body.category || null;
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ingredients")
    .update(allowedFields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ingredient: data });
}
