import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";
import { parseCSV } from "@/lib/csv-parse";

async function authorize(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  return token && (await verifyToken(token));
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: prepRecipes, error } = await supabase
    .from("prep_recipes")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch components for all prep recipes
  const ids = (prepRecipes || []).map((r) => r.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let components: any[] = [];
  if (ids.length > 0) {
    const { data: componentsData } = await supabase
      .from("prep_recipe_components")
      .select("*, ingredients(name, unit), prep_recipes:prep_recipe_ref_id(name)")
      .in("prep_recipe_id", ids);
    components = componentsData || [];
  }

  // Group components by prep_recipe_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentMap = new Map<number, any[]>();
  for (const c of components) {
    const list = componentMap.get(c.prep_recipe_id) || [];
    list.push(c);
    componentMap.set(c.prep_recipe_id, list);
  }

  const result = (prepRecipes || []).map((pr) => ({
    ...pr,
    components: componentMap.get(pr.id) || [],
  }));

  return NextResponse.json({ prepRecipes: result });
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";
  const supabase = createServerClient();

  // CSV upload
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV is empty or has no data rows" }, { status: 400 });
    }

    const first = rows[0];
    if (!("name" in first)) {
      return NextResponse.json(
        { error: 'CSV must have a "name" column' },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("prep_recipes")
      .select("name");
    const existingNames = new Set(
      (existing || []).map((i) => i.name.toLowerCase())
    );

    const toInsert = rows
      .filter((row) => row.name && !existingNames.has(row.name.toLowerCase()))
      .map((row) => ({
        name: row.name,
        instructions: row.instructions || null,
        yield_amount: row.yield_amount ? parseFloat(row.yield_amount) : null,
        yield_unit: row.yield_unit || null,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: "No new prep recipes to add",
        added: 0,
        skipped: rows.length,
      });
    }

    const { data, error } = await supabase
      .from("prep_recipes")
      .insert(toInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Added ${data.length} prep recipes`,
      added: data.length,
      skipped: rows.length - data.length,
      prepRecipes: data,
    });
  }

  // Single prep recipe with optional components
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: prepRecipe, error } = await supabase
    .from("prep_recipes")
    .upsert(
      {
        name: body.name,
        instructions: body.instructions || null,
        yield_amount: body.yield_amount ?? null,
        yield_unit: body.yield_unit || null,
      },
      { onConflict: "name" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add components if provided
  if (body.components && Array.isArray(body.components) && body.components.length > 0) {
    // Clear existing components first
    await supabase
      .from("prep_recipe_components")
      .delete()
      .eq("prep_recipe_id", prepRecipe.id);

    const componentRows = body.components.map(
      (c: { ingredient_id?: number; prep_recipe_ref_id?: number; quantity: number; unit?: string }) => ({
        prep_recipe_id: prepRecipe.id,
        ingredient_id: c.ingredient_id || null,
        prep_recipe_ref_id: c.prep_recipe_ref_id || null,
        quantity: c.quantity,
        unit: c.unit || null,
      })
    );

    const { error: compError } = await supabase
      .from("prep_recipe_components")
      .insert(componentRows);

    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ prepRecipe }, { status: 201 });
}
