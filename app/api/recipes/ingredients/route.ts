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
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ingredients: data });
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

    // Validate required column
    const first = rows[0];
    if (!("name" in first)) {
      return NextResponse.json(
        { error: 'CSV must have a "name" column' },
        { status: 400 }
      );
    }

    // Fetch existing to avoid duplicates
    const { data: existing } = await supabase
      .from("ingredients")
      .select("name");
    const existingNames = new Set(
      (existing || []).map((i) => i.name.toLowerCase())
    );

    const toInsert = rows
      .filter((row) => row.name && !existingNames.has(row.name.toLowerCase()))
      .map((row) => ({
        name: row.name,
        category: row.category || null,
        unit: row.unit || "oz",
        cost_per_unit: row.cost_per_unit ? parseFloat(row.cost_per_unit) : null,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: "No new ingredients to add",
        added: 0,
        skipped: rows.length,
      });
    }

    const { data, error } = await supabase
      .from("ingredients")
      .insert(toInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Added ${data.length} ingredients`,
      added: data.length,
      skipped: rows.length - data.length,
      ingredients: data,
    });
  }

  // Single ingredient
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ingredients")
    .upsert(
      {
        name: body.name,
        category: body.category || null,
        unit: body.unit || "oz",
        cost_per_unit: body.cost_per_unit ?? null,
      },
      { onConflict: "name" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ingredient: data }, { status: 201 });
}
