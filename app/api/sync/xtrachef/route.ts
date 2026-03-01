import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";
import { XtrachefClient } from "@/lib/integrations/xtrachef-client";
import { syncXtrachefRecipes } from "@/lib/sync/xtrachef-recipes";

/**
 * POST /api/sync/xtrachef
 *
 * Triggers a full xtraCHEF recipe sync by calling the internal API directly.
 * Requires XTRACHEF_TENANT_ID, XTRACHEF_LOCATION_ID env vars and
 * an xtraCHEF Bearer token stored in the `settings` table.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Load xtraCHEF auth token from settings
  const { data: tokenSetting, error: tokenError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "xtrachef_token")
    .single();

  if (tokenError || !tokenSetting?.value) {
    return NextResponse.json(
      {
        error: "xtraCHEF Bearer token not configured. Paste it in Settings.",
        ...(tokenError ? { details: tokenError.message } : {}),
      },
      { status: 400 },
    );
  }

  const tenantId = process.env.XTRACHEF_TENANT_ID;
  const locationId = process.env.XTRACHEF_LOCATION_ID;

  if (!tenantId || !locationId) {
    return NextResponse.json(
      {
        error:
          "XTRACHEF_TENANT_ID and XTRACHEF_LOCATION_ID must be set in .env.local. " +
          "Find them in browser DevTools → Network tab: look for a request to " +
          "ecs-api-prod.sa.toasttab.com containing 'recipe-summary' — the URL " +
          "contains .../tenants/{TENANT_ID}/location/{LOCATION_ID}/...",
      },
      { status: 500 },
    );
  }

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "xtrachef", status: "started" })
    .select("id")
    .single();

  try {
    const client = new XtrachefClient({
      tenantId,
      locationId,
      token: tokenSetting.value,
    });

    const result = await syncXtrachefRecipes(supabase, client);

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: result.errors.length > 0 ? "error" : "success",
          records_synced: result.recipesUpserted,
          completed_at: new Date().toISOString(),
          ...(result.errors.length > 0
            ? { error: result.errors.join("; ") }
            : {}),
        })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({
      success: true,
      recipes_synced: result.recipesUpserted,
      ingredient_lines: result.ingredientLinesInserted,
      raw_ingredients: result.rawIngredientsUpserted,
      errors: result.errors,
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
      { status: 500 },
    );
  }
}

/**
 * GET /api/sync/xtrachef
 *
 * Returns the latest xtraCHEF sync status and recipe counts.
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

  // Check if token is configured
  const { data: tokenSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "xtrachef_token")
    .single();

  return NextResponse.json({
    lastSync,
    recipeCount: recipeCount || 0,
    ingredientCount: ingredientCount || 0,
    hasToken: !!tokenSetting?.value,
  });
}
