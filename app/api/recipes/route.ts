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

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch components for all recipes
  const ids = (recipes || []).map((r) => r.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let components: any[] = [];
  if (ids.length > 0) {
    const { data: componentsData } = await supabase
      .from("recipe_components")
      .select("*, ingredients(name, unit), prep_recipes(name)")
      .in("recipe_id", ids);
    components = componentsData || [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentMap = new Map<number, any[]>();
  for (const c of components) {
    const list = componentMap.get(c.recipe_id) || [];
    list.push(c);
    componentMap.set(c.recipe_id, list);
  }

  const result = (recipes || []).map((r) => ({
    ...r,
    components: componentMap.get(r.id) || [],
  }));

  return NextResponse.json({ recipes: result });
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
      .from("recipes")
      .select("name");
    const existingNames = new Set(
      (existing || []).map((i) => i.name.toLowerCase())
    );

    // Also auto-create any ingredients found in the CSV
    const { data: existingIngredients } = await supabase
      .from("ingredients")
      .select("name");
    const existingIngredientNames = new Set(
      (existingIngredients || []).map((i) => i.name.toLowerCase())
    );

    const newIngredientNames = new Set<string>();
    for (const row of rows) {
      // CSV may include an "ingredients" column with comma-separated values
      if (row.ingredients) {
        for (const name of row.ingredients.split(";")) {
          const trimmed = name.trim();
          if (trimmed && !existingIngredientNames.has(trimmed.toLowerCase())) {
            newIngredientNames.add(trimmed);
          }
        }
      }
    }

    if (newIngredientNames.size > 0) {
      await supabase
        .from("ingredients")
        .insert([...newIngredientNames].map((name) => ({ name })));
    }

    const toInsert = rows
      .filter((row) => row.name && !existingNames.has(row.name.toLowerCase()))
      .map((row) => ({
        name: row.name,
        menu_item_name: row.menu_item_name || row.menu_item || null,
        instructions: row.instructions || null,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: "No new recipes to add",
        added: 0,
        skipped: rows.length,
      });
    }

    const { data, error } = await supabase
      .from("recipes")
      .insert(toInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Added ${data.length} recipes`,
      added: data.length,
      skipped: rows.length - data.length,
      recipes: data,
    });
  }

  // Single recipe with optional components
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: recipe, error } = await supabase
    .from("recipes")
    .upsert(
      {
        name: body.name,
        menu_item_name: body.menu_item_name || null,
        instructions: body.instructions || null,
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
    await supabase
      .from("recipe_components")
      .delete()
      .eq("recipe_id", recipe.id);

    const componentRows = body.components.map(
      (c: { ingredient_id?: number; prep_recipe_id?: number; quantity: number; unit?: string }) => ({
        recipe_id: recipe.id,
        ingredient_id: c.ingredient_id || null,
        prep_recipe_id: c.prep_recipe_id || null,
        quantity: c.quantity,
        unit: c.unit || null,
      })
    );

    const { error: compError } = await supabase
      .from("recipe_components")
      .insert(componentRows);

    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ recipe }, { status: 201 });
}
